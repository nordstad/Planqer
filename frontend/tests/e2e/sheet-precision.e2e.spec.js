import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const input = {
  parts: { part_1: { width: 800, height: 400, quantity: 3 } },
  sheet_width: 1200,
  sheet_height: 2500,
  kerf_width: 3,
  material_type: 'plywood',
  allow_rotation: true,
};
const mm = (value) => value.toLocaleString('sv-SE', { maximumFractionDigits: 20 });
let solved;

test.beforeAll(async ({ request }) => {
  // This calculation endpoint stores nothing. All other browser API calls below
  // are intercepted, so existing settings/accounts/saved plans are never used.
  const rejected = await request.post(
    `${process.env.PLAYWRIGHT_API_URL || 'http://localhost:8002'}/api/sheet-optimization`,
    { data: { ...input, kerf_width: 2.5 } },
  );
  expect(rejected.status()).toBe(422);
  const response = await request.post(
    `${process.env.PLAYWRIGHT_API_URL || 'http://localhost:8002'}/api/sheet-optimization`,
    { data: input },
  );
  expect(response.ok()).toBeTruthy();
  solved = await response.json();
  const parts = solved.sheets.flatMap((sheet) => sheet.parts);
  expect(parts).toHaveLength(3);
  expect(parts.every((part) => (
    (part.width === 800 && part.height === 400)
    || (part.width === 400 && part.height === 800)
  ))).toBe(true);
});

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`whole-mm sheet input and accurate output: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      let calculations = 0;
      const unexpectedWrites = [];
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === '/api/sheet-optimization' && request.method() === 'POST') {
          expect(request.postDataJSON()).toEqual(input);
          calculations += 1;
          return route.fulfill({ json: solved });
        }
        if (request.method() !== 'GET') {
          unexpectedWrites.push(path);
          return route.fulfill({ status: 503, json: {} });
        }
        if (path.endsWith('/auth/setup-status')) {
          return route.fulfill({ json: { single_user: true, needs_setup: false } });
        }
        if (path.endsWith('/auth/me')) {
          return route.fulfill({ json: { id: 'precision-test', email: 'test@example.invalid' } });
        }
        if (path.includes('/settings')) {
          return route.fulfill({ json: { preferred_language: language, default_currency: 'SEK' } });
        }
        if (path.includes('/catalogue')) return route.fulfill({ status: 503, json: {} });
        return route.fulfill({ json: [] });
      });
      await page.goto('/sheet-cutting');
      await expect(page.locator('#language-select')).toHaveValue(language);
      if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
      await page.getByRole('button', { name: locale.workflow.addPart, exact: true }).click();
      await page.getByLabel(locale.ui.partLengthAria.replace('{{item}}', '1'), { exact: true }).fill('800.5');
      await page.getByLabel(locale.ui.sheetHeightAria, { exact: true }).fill('400.25');
      await page.getByLabel(locale.ui.quantityAria.replace('{{item}}', '1'), { exact: true }).fill('3');
      await page.locator('#sheet-width').fill('1200.5');
      await page.locator('#sheet-height').fill('2500.25');
      await page.locator('#sheet-kerf').fill('2.125');
      await expect(page.locator('button.btn-order[type=submit]')).toBeDisabled();
      await page.locator('form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      expect(calculations).toBe(0);
      await page.getByLabel(locale.ui.partLengthAria.replace('{{item}}', '1'), { exact: true }).fill('800');
      await page.getByLabel(locale.ui.sheetHeightAria, { exact: true }).fill('400');
      await page.locator('#sheet-width').fill('1200');
      await page.locator('#sheet-height').fill('2500');
      await page.locator('#sheet-kerf').fill('3');
      await expect(page.locator('button.btn-order[type=submit]')).toBeEnabled();
      await page.locator('button.btn-order[type=submit]').click();
      const placements = page.getByRole('button', { name: new RegExp(locale.workflow.exactPlacements) });
      await expect(placements).toBeVisible();
      await placements.click();
      const rows = page.locator('table.cat-table tbody tr');
      const expected = solved.sheets.flatMap((sheet, sheetIndex) => sheet.parts.map((part) => [
        part.part_id, String(sheetIndex + 1),
        `${mm(part.width)} × ${mm(part.height)}`,
        `${mm(part.x)}; ${mm(part.y)}`,
        part.rotated ? '90°' : '—',
      ]));
      await expect(rows).toHaveCount(expected.length);
      for (const [index, cells] of expected.entries()) {
        const rendered = await rows.nth(index).locator('td').allTextContents();
        expect(rendered.slice(0, 5)).toEqual(cells);
      }
      const sheet = solved.sheets[0];
      const diagramDescription = locale.ui.sheetDiagramAria
        .replace('{{number}}', '1')
        .replace('{{width}}', mm(sheet.sheet_width))
        .replace('{{height}}', mm(sheet.sheet_height))
        .replace('{{parts}}', String(sheet.parts_count))
        .replace('{{percent}}', sheet.efficiency.toFixed(1));
      await expect(page.getByRole('img', { name: diagramDescription, exact: true })).toBeVisible();
      expect(calculations).toBe(1);
      expect(unexpectedWrites).toEqual([]);
    });
  }
}
