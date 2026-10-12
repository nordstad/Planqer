import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const STEP = fileURLToPath(new URL('../../../example/Bench.step', import.meta.url));
// Needs a backend run with PLANQER_CATALOGUE_COUNTRY=SE.
const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8002';

/* The material names a CAD tool wrote into the STEP file. The upload is replaced
   by this response so the names are known; reading real files is covered by the
   backend's STEP reader tests. */
const board = (name, material, length, width, thickness, quantity = 1) => ({
  type: 'board', name, material, length, width, thickness, quantity, volume: length * width * thickness,
});
const sheet = (name, material, length, width, thickness, quantity = 1) => ({
  type: 'sheet', name, material, length, width, thickness, quantity, volume: length * width * thickness,
});
const cutlist = {
  boards: [
    board('rail_a', 'C24', 1800, 95, 45, 2),
    board('rail_b', 'c24', 2400, 95, 45),
    board('stud', 'Furu', 900, 70, 45),
    board('pin', 'Steel', 300, 20, 20),
  ],
  sheets: [sheet('top', 'OSB/3', 1800, 800, 15)],
  total_components: 5,
};

test.describe('Model materials read against the catalogue', () => {
  test('marks confident matches From model, offers weak ones as suggestions and merges equivalent names', async ({ page }) => {
    const email = `step-material-${Date.now()}@example.com`;
    const credential = ['Planqer', Date.now(), 'e2e'].join('-') + '!1';
    await page.request.post(`${API}/api/auth/register`, { data: { email, password: credential } });
    const login = await page.request.post(`${API}/api/auth/login`, { data: { email, password: credential } });
    const { access_token: accessToken } = await login.json();
    await page.addInitScript((token) => localStorage.setItem('auth_token', token), accessToken);
    await page.route('**/api/step-cutlist', (route) => route.fulfill({ json: cutlist }));

    await page.goto('/model-cutlist');
    await page.locator('input[type="file"]').setInputFiles(STEP);
    await page.getByRole('button', { name: /read the model/i }).click();
    await expect(page.getByRole('heading', { name: 'Cutlists found' })).toBeVisible();

    // "C24" and "c24" are one cutlist: four cutlists, not five.
    const summaries = page.getByTestId('product-summary');
    await expect(summaries).toHaveCount(4);

    const framing = summaries.filter({ hasText: 'Framing timber / studs 45 × 95 mm' });
    await expect(framing).toHaveCount(1);
    await expect(framing).toContainText('From model');
    await expect(framing).toContainText('C24');
    await expect(framing).not.toContainText('Suggested');

    const osb = summaries.filter({ hasText: 'OSB 15 mm' });
    await expect(osb).toContainText('From model');
    await expect(osb).toContainText('OSB/3');

    // Only a species: offered, but it has to be confirmed.
    const furu = summaries.filter({ hasText: '45 × 70 mm' });
    await expect(furu).toContainText('Suggested');
    await expect(furu).not.toContainText('From model');

    // A name the catalogue doesn't know stays the user's own words.
    const steel = summaries.filter({ hasText: 'Steel' });
    await expect(steel).toHaveCount(1);
    await expect(steel).not.toContainText('From model');
    await expect(steel).not.toContainText('Suggested');

    await expect(page.locator('body')).not.toContainText(/unknown/i);

    // The match can be reviewed and changed.
    await page.getByRole('button', { name: 'Change — Product for Framing timber / studs 45 × 95 mm' }).click();
    const search = page.getByRole('combobox', { name: 'Product for Framing timber / studs 45 × 95 mm' });
    await search.fill('trall');
    await search.press('Enter');
    await expect(summaries.filter({ hasText: 'Decking' })).toHaveCount(1);
    await expect(summaries.filter({ hasText: 'From model' })).toHaveCount(1);
  });
});
