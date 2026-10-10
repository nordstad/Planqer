import { test, expect, request as playwrightRequest } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BENCH = fileURLToPath(new URL('../../../example/bench.stl', import.meta.url));
// The catalogue tests need a backend run with PLANQER_CATALOGUE_COUNTRY=SE.
const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8002';

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

  test('groups the bench and suggests a catalogue product for each cross-section', async ({ page }) => {
    await signIn(page);
    await readBench(page);

    await expect(page.locator('body')).not.toContainText(/unknown/i);
    await expect(page.locator('body')).not.toContainText('SPF-');
    await expect(page.getByLabel('Name for Framing timber / studs 45 × 95 mm')).toHaveAttribute('placeholder', 'Framing timber / studs 45 × 95 mm');
    await expect(page.getByLabel('Name for Planed timber 95 × 95 mm')).toBeVisible();
    await expect(page.getByLabel('Name for Plywood 15 mm')).toBeVisible();
    await expect(page.getByTestId('product-summary').filter({ hasText: 'Suggested' })).toHaveCount(3);
    await expect(page.getByText('board_3, board_4, board_5, board_6, board_7')).toBeVisible();

    await page.getByRole('button', { name: 'Show lengths' }).first().click();
    await expect(page.getByTestId(/^breakdown-board/)).toContainText('1 800 mm × 2');
    await page.getByRole('button', { name: 'Hide lengths' }).click();
    await expect(page.getByTestId(/^breakdown-board/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show sizes' }).click();
    await expect(page.getByTestId(/^breakdown-sheet/)).toContainText('1 800 × 800 mm × 1');

    await page.getByLabel('Name for Framing timber / studs 45 × 95 mm').fill('Frame');
    // A suggestion is accepted with one click, no details needed.
    const frame = page.getByTestId('product-summary').first();
    await expect(frame).toContainText('Suggested');
    await page.getByRole('button', { name: 'Looks right' }).first().click();
    await expect(frame).not.toContainText('Suggested');
    await expect(page.getByTestId('product-summary').filter({ hasText: 'Suggested' })).toHaveCount(2);
  });

  test('searches the catalogue from the keyboard and remembers the choice for that size', async ({ page }) => {
    await signIn(page);
    await readBench(page);

    const search = page.getByRole('combobox', { name: 'Product for Planed timber 95 × 95 mm' });
    await search.fill('trall');
    await expect(page.getByRole('option', { name: /^Decking/ }).first()).toBeVisible();
    await search.press('Enter');
    await expect(page.getByTestId('product-summary').nth(1)).toContainText('Decking');
    await expect(page.getByTestId('product-summary').nth(1)).not.toContainText('Suggested');

    const own = page.getByRole('combobox', { name: 'Product for Framing timber / studs 45 × 95 mm' });
    await own.fill('Larch');
    await page.getByRole('option', { name: 'Use “Larch” as my own product' }).click();
    await expect(page.getByTestId('product-summary').first()).toContainText('Larch');

    await page.unroute('**/api/3d-cutlist');
    await readBench(page);
    await expect(page.getByTestId('product-summary').first()).toContainText('Larch');
    await expect(page.getByTestId('product-summary').first()).not.toContainText('Suggested');
    await expect(page.getByTestId('product-summary').nth(1)).toContainText('Decking');
  });

  test('hands the suggested product to the board page when planning one group alone', async ({ page }) => {
    await signIn(page);
    await readBench(page);
    await page.getByRole('button', { name: 'Plan alone' }).first().click();
    await expect(page).toHaveURL(/\/cutting/);
    await expect(page.getByTestId('product-summary')).toContainText('Framing timber / studs 45 × 95 mm');
    await expect(page.getByTestId('product-summary')).toContainText('Suggested');
    await expect(page.getByLabel('Thickness (mm)')).toHaveValue('45');
    await expect(page.getByLabel('Width (mm)')).toHaveValue('95');
  });

  test('plans without prices, prices per group, saves into a one-click project link', async ({ page }) => {
    await signIn(page);
    await readBench(page);
    // Specify details on the first group; leave the others as suggested.
    await page.getByRole('button', { name: 'Details' }).first().click();
    await page.getByLabel(/^Species — /).first().selectOption('spruce');
    await page.getByLabel(/^Grade — /).first().fill('C24');
    await page.getByRole('button', { name: 'Plan 3 cutlists', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plan and save' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('SPF-');

    const legs = page.getByRole('region', { name: 'Framing timber / studs 45 × 95 mm' });
    const posts = page.getByRole('region', { name: 'Planed timber 95 × 95 mm' });
    const plywood = page.getByRole('region', { name: 'Plywood 15 mm' });

    // The product's own stock is offered, never forced.
    await expect(legs.getByRole('button', { name: 'Use these lengths' })).toBeVisible();
    await expect(legs.getByLabel(/Board length in millimetres, row 1/)).not.toHaveValue('1800');

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
    const framePlan = boardPosts.find((p) => p.name === 'bench · Framing timber / studs 45 × 95 mm');
    const postPlan = boardPosts.find((p) => p.name === 'bench · Planed timber 95 × 95 mm');
    expect(framePlan).toMatchObject({
      material_type: 'Framing timber / studs 45 × 95 mm', saw_blade_width: 2, board_thickness: 45, board_width: 95,
      product: {
        type: 'regel', catalogue_id: 'se:regel:45x95', country: 'SE', thickness: 45, width: 95,
        details: { species: 'spruce', grade: 'C24' },
        sources: expect.arrayContaining([expect.stringContaining('traguiden.se')]),
      },
    });
    expect(framePlan.product.lengths).toContain(2400);
    expect(framePlan.board_costs).toMatchObject({ currency: expect.any(String), board_costs: expect.any(Object) });
    // "Apply to all" copied the stock, kerf and prices; each plan keeps its own product.
    expect(postPlan).toMatchObject({ material_type: 'Planed timber 95 × 95 mm', saw_blade_width: 2, product: { type: 'planhyvlat', catalogue_id: 'se:planhyvlat:95x95', suggested: true } });
    expect(postPlan.board_costs).toEqual(framePlan.board_costs);
    expect(sheetPosts[0]).toMatchObject({
      material_type: 'Plywood 15 mm', pricing: { price_per_unit: 350 },
      product: { type: 'plywood', catalogue_id: 'se:plywood:15', formats: expect.arrayContaining([{ width: 1200, height: 2400 }]) },
    });
    expect(JSON.stringify([...boardPosts, ...sheetPosts])).not.toMatch(/unknown/i);

    await projectLink.click();
    await expect(page).toHaveURL(/\/dashboard\/project\/[^/]+$/);
    await expect(page.getByText('bench · Framing timber / studs 45 × 95 mm')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/unknown/i);
    await expect(page.locator('body')).not.toContainText('SPF-');
    // Real part length on the card: 1 800×2 + 1 530×5 + 710×6 + 620×3 + 520×2 = 18 410 mm for the 45 × 95 group
    await expect(page.locator('.plan-item').filter({ hasText: 'bench · Framing timber / studs 45 × 95 mm' })).toContainText(/18.410 mm/);
    await expect(page.locator('.plan-item').filter({ hasText: 'bench · Planed timber 95 × 95 mm' })).toContainText(/Planed timber/);
  });

  test('plans and saves with no prices, no project and no product', async ({ page }) => {
    // A catalogue with no sized entries (the generic default): nothing to suggest.
    const real = await (await page.request.get(`${API}/api/catalogue/`)).json();
    await page.route('**/api/catalogue/', (route) => route.fulfill({
      json: { ...real, country: null, country_name: null, products: [] },
      headers: { etag: '"generic"' },
    }));
    await page.addInitScript(() => localStorage.removeItem('planqer-product-choice-v1'));
    await signIn(page);
    await readBench(page);
    await expect(page.getByLabel('Name for Board 45 × 95 mm')).toBeVisible();
    await expect(page.getByTestId('product-summary').filter({ hasText: 'You can plan without one' })).toHaveCount(3);
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
      expect(post.product ?? null).toBeNull();
      expect(post.board_costs ?? null).toBeNull();
      expect(post.pricing ?? null).toBeNull();
    }
  });

  test('plans a 14.5 m part on a 15 m glulam beam from the board page', async ({ page }) => {
    await signIn(page);
    await page.goto('/cutting');
    await page.getByLabel('Thickness (mm)').fill('90');
    await page.getByLabel('Width (mm)').fill('90');
    const search = page.getByRole('combobox', { name: 'Product' });
    await search.fill('limtra 90x90');
    await page.getByRole('option', { name: /^Glulam beam 90 × 90 mm/ }).click();
    await expect(page.getByTestId('stock-suggestions')).toContainText(/12.000 mm/);

    await page.getByLabel(/Part length.*1/).first().fill('14500');
    await page.getByLabel(/Part quantity.*1|Quantity.*1/).first().fill('1');
    await page.getByLabel(/Board length in millimetres, row 1/).fill('15000');
    await page.getByRole('button', { name: /Plan the cuts/i }).click();

    await expect(page.getByRole('heading', { name: /Your cutting plan/i })).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('plan-material-summary')).toContainText('Glulam beam 90 × 90 mm');
  });
});
