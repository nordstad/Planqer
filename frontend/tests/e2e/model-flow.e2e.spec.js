import { test, expect, request as playwrightRequest } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BENCH = fileURLToPath(new URL('../../../example/bench.stl', import.meta.url));
const API = 'http://localhost:8002';

/* /api/3d-cutlist is rate limited to 5 a minute, so the bench is measured by the
   real backend once per run and replayed to each test's own upload. */
let measuredBench;
let accessToken;

// Auth endpoints are rate limited too, so one account serves the whole file.
const signIn = (page) => page.addInitScript((token) => localStorage.setItem('auth_token', token), accessToken);

test.beforeAll(async () => {
  const api = await playwrightRequest.newContext();
  const email = `model-measure-${Date.now()}@example.com`;
  const credential = ['Planqer', Date.now(), 'e2e'].join('-') + '!1';
  await api.post(`${API}/api/auth/register`, { data: { email, password: credential } });
  const login = await api.post(`${API}/api/auth/login`, { data: { email, password: credential } });
  ({ access_token: accessToken } = await login.json());
  const response = await api.post(`${API}/api/3d-cutlist`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    multipart: { file: { name: 'bench.stl', mimeType: 'model/stl', buffer: readFileSync(BENCH) } },
  });
  expect(response.ok()).toBe(true);
  measuredBench = await response.json();
  await api.dispose();
});

const readBench = async (page) => {
  await page.route('**/api/3d-cutlist', (route) => route.fulfill({ json: measuredBench }));
  await page.goto('/model-cutlist');
  await page.locator('input[type="file"]').setInputFiles(BENCH);
  await page.getByRole('button', { name: /read the model/i }).click();
  await expect(page.getByRole('heading', { name: 'Cutlists found' })).toBeVisible();
};

test.describe('Model cutlist flow with example/bench.stl', () => {
  // One worker, so the shared account and measurement are made once.
  test.describe.configure({ mode: 'serial' });

  test('groups the bench without placeholder labels and lets each group be refined', async ({ page }) => {
    await signIn(page);
    await readBench(page);

    await expect(page.locator('body')).not.toContainText(/unknown/i);
    await expect(page.locator('body')).not.toContainText('SPF-');
    await expect(page.getByLabel('Name for Board 45 × 95 mm')).toHaveAttribute('placeholder', 'Board 45 × 95 mm');
    await expect(page.getByLabel('Name for Board 95 × 95 mm')).toBeVisible();
    await expect(page.getByLabel('Name for Sheet 15 mm')).toBeVisible();
    await expect(page.getByText('board_3, board_4, board_5, board_6, board_7')).toBeVisible();

    await page.getByRole('button', { name: 'Show lengths' }).first().click();
    await expect(page.getByTestId(/^breakdown-board/)).toContainText('1 800 mm × 2');
    await page.getByRole('button', { name: 'Hide lengths' }).click();
    await expect(page.getByTestId(/^breakdown-board/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show sizes' }).click();
    await expect(page.getByTestId(/^breakdown-sheet/)).toContainText('1 800 × 800 mm × 1');

    await page.getByLabel('Name for Board 45 × 95 mm').fill('Frame');
    await page.getByLabel('Material for Frame').selectOption('pine');
    await expect(page.getByLabel('Material for Board 95 × 95 mm')).toHaveValue('');
  });

  test('hands the chosen material to the board page when planning one group alone', async ({ page }) => {
    await signIn(page);
    await readBench(page);
    await page.getByLabel('Material for Board 45 × 95 mm').selectOption('pine');
    await page.getByRole('button', { name: 'Plan alone' }).first().click();
    await expect(page).toHaveURL(/\/cutting/);
    await expect(page.getByLabel('Material', { exact: true })).toHaveValue('pine');
    await expect(page.getByLabel('Thickness (mm)')).toHaveValue('45');
    await expect(page.getByLabel('Width (mm)')).toHaveValue('95');
  });

  test('plans without prices, prices per group, saves into a one-click project link', async ({ page }) => {
    await signIn(page);
    await readBench(page);
    await page.getByLabel('Material for Board 45 × 95 mm').selectOption('pine');
    await page.getByRole('button', { name: 'Plan 3 cutlists', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plan and save' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('SPF-');

    const legs = page.getByRole('region', { name: 'Pine 45 × 95 mm' });
    const posts = page.getByRole('region', { name: 'Board 95 × 95 mm' });
    const plywood = page.getByRole('region', { name: 'Sheet 15 mm' });

    // Prices are optional: nothing here blocks the plan button.
    await expect(page.getByRole('button', { name: 'Plan 3 cutlists', exact: true })).toBeEnabled();
    await expect(legs.getByRole('status')).toContainText('No prices entered');

    // Price every length of the 45 × 95 group, then copy its stock to the other board group.
    for (const priceField of await legs.getByLabel(/Price per metre/).all()) {
      await priceField.fill('30');
    }
    await expect(legs.getByRole('status')).toContainText('includes its cost');
    await legs.getByLabel(/Cut width/i).fill('2');
    await legs.getByRole('button', { name: 'Apply to all board groups' }).click();
    await expect(posts.getByLabel(/Cut width/i)).toHaveValue('2');
    await expect(plywood.getByRole('button', { name: /apply to all/i })).toHaveCount(0);
    await plywood.getByLabel(/Price per sheet/).fill('350');

    await page.getByLabel('Project — optional').selectOption({ label: 'New project…' });
    await expect(page.getByLabel('New project name')).toHaveValue('bench');
    await page.getByRole('button', { name: 'Create project' }).click();

    const boardPosts = [];
    const sheetPosts = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST') return;
      if (request.url().endsWith('/api/projects/')) boardPosts.push(request.postDataJSON());
      if (request.url().endsWith('/api/sheet-projects/')) sheetPosts.push(request.postDataJSON());
    });
    await page.getByRole('button', { name: 'Plan 3 cutlists', exact: true }).click();
    const projectLink = page.getByRole('link', { name: 'Open project' });
    await expect(projectLink).toBeVisible({ timeout: 30000 });

    expect(boardPosts).toHaveLength(2);
    const framePlan = boardPosts.find((p) => p.name === 'bench · Pine 45 × 95 mm');
    const postPlan = boardPosts.find((p) => p.name === 'bench · Board 95 × 95 mm');
    expect(framePlan).toMatchObject({ material_type: 'pine', saw_blade_width: 2, board_thickness: 45, board_width: 95 });
    expect(framePlan.board_costs).toMatchObject({ currency: expect.any(String), board_costs: expect.any(Object) });
    // "Apply to all" copied the stock, kerf and prices; the material stays unspecified.
    expect(postPlan).toMatchObject({ material_type: '', saw_blade_width: 2 });
    expect(postPlan.board_costs).toEqual(framePlan.board_costs);
    expect(sheetPosts[0]).toMatchObject({ material_type: '', pricing: { price_per_unit: 350 } });
    expect(JSON.stringify([...boardPosts, ...sheetPosts])).not.toMatch(/unknown/i);

    await projectLink.click();
    await expect(page).toHaveURL(/\/dashboard\/project\/[^/]+$/);
    await expect(page.getByText('bench · Pine 45 × 95 mm')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/unknown/i);
    await expect(page.locator('body')).not.toContainText('SPF-');
    // Real part length on the card: 1 800×2 + 1 530×5 + 710×6 + 620×3 + 520×2 = 18 410 mm for the 45 × 95 group
    await expect(page.locator('.plan-item').filter({ hasText: 'bench · Pine 45 × 95 mm' })).toContainText(/18.410 mm/);
    await expect(page.locator('.plan-item').filter({ hasText: 'bench · Board 95 × 95 mm' })).toContainText(/Board|board/);
  });

  test('plans and saves with no prices and no project', async ({ page }) => {
    await signIn(page);
    await readBench(page);
    await page.getByRole('button', { name: 'Plan 3 cutlists', exact: true }).click();
    const posts = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/api\/(sheet-)?projects\/$/.test(request.url())) posts.push(request.postDataJSON());
    });
    await page.getByRole('button', { name: 'Plan 3 cutlists', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cutlists saved' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(posts).toHaveLength(3);
    for (const post of posts) {
      expect(post.material_type).toBe('');
      expect(post.board_costs ?? null).toBeNull();
      expect(post.pricing ?? null).toBeNull();
    }
  });
});
