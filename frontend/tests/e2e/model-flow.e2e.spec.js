import { test, expect, request as playwrightRequest } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BENCH = fileURLToPath(new URL('../../../example/bench.stl', import.meta.url));
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
  // The catalogue suggestions follow the account's catalogue country.
  await api.put(`${API}/api/settings/`, { headers: { Authorization: `Bearer ${accessToken}` }, data: { catalogue_country: 'SE' } });
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

// One smoke test through the real chain: the backend measures a real STL, the
// catalogue suggests products, and the plans are saved into a project. The
// screens' details are covered by the unit tests.
test('reads the bench, plans every cutlist and saves the plans into one project', async ({ page }) => {
  await signIn(page);
  await readBench(page);
  await expect(page.getByTestId('product-summary').filter({ hasText: 'Suggested' })).toHaveCount(3);

  const posts = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && /\/api\/(sheet-)?projects\/[^/]+$/.test(request.url())) posts.push(request.postDataJSON());
  });
  await page.getByRole('button', { name: 'Plan 3 cutlists', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plan and save' })).toBeVisible();
  await page.getByRole('button', { name: 'Plan 3 cutlists', exact: true }).click();
  const projectLink = page.getByRole('link', { name: 'Open project' });
  await expect(projectLink).toBeVisible({ timeout: 30000 });
  expect(posts).toHaveLength(3);
  expect(JSON.stringify(posts)).not.toMatch(/unknown/i);

  await projectLink.click();
  await expect(page).toHaveURL(/\/dashboard\/project\/[^/]+$/);
  // Real part length on the card: 1 800×2 + 1 530×5 + 710×6 + 620×3 + 520×2 = 18 410 mm for the 45 × 95 group
  await expect(page.locator('.plan-item').filter({ hasText: 'Framing timber / studs 45 × 95 mm' })).toContainText(/18.410 mm/);
});
