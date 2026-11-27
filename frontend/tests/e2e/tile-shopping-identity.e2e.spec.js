import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const group = {
  id: 'synthetic-tile-shopping', name: 'Tile purchases', spare_margin_percent: 50,
  created_at: '2026-11-26T00:00:00Z', updated_at: '2026-11-26T00:00:00Z',
};
const projects = [
  ['Thin A', 10, 27, 10],
  ['Thick', 20, 27, 20],
  ['Thin B', 10, 3, 10],
].map(([name, thickness, quantity, price], index) => ({
  id: `synthetic-tile-${index}`, name, project_group_id: group.id,
  tile_data: { width: 300, height: 600, thickness, material_type: 'Ceramic' },
  surface_data: { width: 2400, height: 1200 },
  layout_result: { tiles_to_purchase_with_waste: quantity, tiles: [] },
  pricing: { price_per_unit: price, currency: 'SEK', prices_include_vat: true, vat_rate: 25 },
  created_at: group.created_at, updated_at: group.updated_at,
}));

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`tile shopping identity: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      const writes = [];
      await page.addInitScript(() => {
        window.__printCalls = 0;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
          ...descriptor,
          get() {
            const frameWindow = descriptor.get.call(this);
            if (frameWindow) frameWindow.print = () => { window.__printCalls += 1; };
            return frameWindow;
          },
        });
      });
      // Every API call is intercepted; no existing projects/accounts are used.
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace(/\/$/, '');
        if (request.method() !== 'GET') {
          writes.push(path);
          return route.fulfill({ status: 503, json: {} });
        }
        if (path.endsWith('/auth/setup-status')) {
          return route.fulfill({ json: { single_user: true, needs_setup: false } });
        }
        if (path.endsWith('/auth/me')) {
          return route.fulfill({ json: { id: 'shopping-test', email: 'test@example.invalid' } });
        }
        if (path.endsWith('/settings')) {
          return route.fulfill({ json: { preferred_language: language, spare_margin_percent: 50 } });
        }
        if (path.endsWith('/project-groups')) return route.fulfill({ json: [group] });
        if (path.endsWith('/tile-projects')) return route.fulfill({ json: projects });
        return route.fulfill({ json: [] });
      });
      await page.goto(`/dashboard/project/${group.id}`);
      await expect(page.locator('#language-select')).toHaveValue(language);
      if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
      await page.getByRole('button', { name: locale.projectUi.shoppingList, exact: true }).click();
      const shopping = page.getByTestId('project-shopping-list');
      const rows = shopping.locator('tbody tr');
      await expect(rows).toHaveCount(2);
      const thin = rows.filter({ hasText: '10 × 300 × 600' });
      const thick = rows.filter({ hasText: '20 × 300 × 600' });
      await expect(thin.locator('td').nth(2)).toHaveText('30');
      await expect(thin.locator('td').nth(4)).toHaveText('300.00 SEK');
      await expect(thick.locator('td').nth(2)).toHaveText('27');
      await expect(thick.locator('td').nth(4)).toHaveText('540.00 SEK');
      await expect(shopping.locator('.shopping-pricing-total')).toContainText('840.00 SEK');

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: locale.projectUi.exportCsv, exact: true }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/shopping-list\.csv$/);
      const bytes = await readFile(await download.path());
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(3)).split('\r\n');
      expect(lines).toHaveLength(3);
      const thinCsv = lines.find((line) => line.includes('"10 × 300 × 600"'));
      const thickCsv = lines.find((line) => line.includes('"20 × 300 × 600"'));
      expect(thinCsv).toContain('"Thin A, Thin B"');
      expect(thinCsv).toContain('"30","30","10.00 SEK","300.00 SEK"');
      expect(thickCsv).toContain('"Thick"');
      expect(thickCsv).toContain('"27","27","20.00 SEK","540.00 SEK"');

      await page.getByRole('button', { name: locale.projectUi.printShoppingList, exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
      const print = page.frameLocator('iframe[aria-hidden="true"]');
      const printedRows = print.locator('.shopping-table tbody tr');
      await expect(printedRows).toHaveCount(2);
      const thinPrint = printedRows.filter({ hasText: '10 × 300 × 600 mm' });
      const thickPrint = printedRows.filter({ hasText: '20 × 300 × 600 mm' });
      await expect(thinPrint.locator('td').nth(0)).toHaveText('Thin A, Thin B');
      await expect(thinPrint.locator('td').nth(3)).toHaveText('30');
      await expect(thinPrint.locator('td').nth(4)).toHaveText('30');
      await expect(thinPrint.locator('td').nth(6)).toHaveText('300.00 SEK');
      await expect(thickPrint.locator('td').nth(0)).toHaveText('Thick');
      await expect(thickPrint.locator('td').nth(3)).toHaveText('27');
      await expect(thickPrint.locator('td').nth(4)).toHaveText('27');
      await expect(thickPrint.locator('td').nth(6)).toHaveText('540.00 SEK');
      expect(writes).toEqual([]);
    });
  }
}
