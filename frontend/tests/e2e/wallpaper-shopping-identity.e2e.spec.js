import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const group = {
  id: 'synthetic-wallpaper-shopping', name: 'Wallpaper purchases', spare_margin_percent: 50,
  created_at: '2026-11-26T00:00:00Z', updated_at: '2026-11-26T00:00:00Z',
};
const projects = [
  ['Hall A', 'A001', 3, 200],
  ['Hall B', 'B002', 5, 300],
  ['Landing A', 'A001', 1, 200],
].map(([name, code, quantity, price], index) => ({
  id: `synthetic-wallpaper-${index}`, name, project_group_id: group.id,
  wallpaper_data: {
    name: 'Willow', manufacturer: 'Acme', product_code: code,
    roll_width: 530, roll_length: 10050, repeat: 0,
    price_per_roll: price, currency: 'SEK', prices_include_vat: true, vat_rate: 25,
  },
  room_data: { walls: [], corners: [], closed: false },
  plan_result: { rolls_to_buy: quantity, strips: [], pieces: [] },
  created_at: group.created_at, updated_at: group.updated_at,
}));

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`wallpaper shopping identity: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }) => {
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
      // Every API call is intercepted; no saved records/accounts are used.
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
        if (path.endsWith('/wallpaper-projects')) return route.fulfill({ json: projects });
        return route.fulfill({ json: [] });
      });
      await page.goto(`/dashboard/project/${group.id}`);
      await expect(page.locator('#language-select')).toHaveValue(language);
      if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
      await page.getByRole('button', { name: locale.projectUi.shoppingList, exact: true }).click();
      const shopping = page.getByTestId('project-shopping-list');
      const rows = shopping.locator('tbody tr');
      await expect(rows).toHaveCount(2);
      const first = rows.filter({ hasText: 'Willow · Acme · A001' });
      const second = rows.filter({ hasText: 'Willow · Acme · B002' });
      await expect(first.locator('td').nth(2)).toHaveText('4');
      await expect(first.locator('td').nth(4)).toHaveText('800.00 SEK');
      await expect(second.locator('td').nth(2)).toHaveText('5');
      await expect(second.locator('td').nth(4)).toHaveText('1500.00 SEK');
      await expect(shopping.locator('.shopping-pricing-total')).toContainText('2300.00 SEK');

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: locale.projectUi.exportCsv, exact: true }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/shopping-list\.csv$/);
      const bytes = await readFile(await download.path());
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(3)).split('\r\n');
      expect(lines).toHaveLength(3);
      const firstCsv = lines.find((line) => line.includes('Willow · Acme · A001'));
      const secondCsv = lines.find((line) => line.includes('Willow · Acme · B002'));
      expect(firstCsv).toContain('"Hall A, Landing A"');
      expect(firstCsv).toContain('"4","4","200.00 SEK","800.00 SEK"');
      expect(secondCsv).toContain('"Hall B"');
      expect(secondCsv).toContain('"5","5","300.00 SEK","1500.00 SEK"');

      await page.getByRole('button', { name: locale.projectUi.printShoppingList, exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
      const print = page.frameLocator('iframe[aria-hidden="true"]');
      const printedRows = print.locator('.shopping-table tbody tr');
      await expect(printedRows).toHaveCount(2);
      const firstPrint = printedRows.filter({ hasText: 'Willow · Acme · A001' });
      const secondPrint = printedRows.filter({ hasText: 'Willow · Acme · B002' });
      await expect(firstPrint.locator('td').nth(0)).toHaveText('Hall A, Landing A');
      await expect(firstPrint.locator('td').nth(3)).toHaveText('4');
      await expect(firstPrint.locator('td').nth(4)).toHaveText('4');
      await expect(firstPrint.locator('td').nth(6)).toHaveText('800.00 SEK');
      await expect(secondPrint.locator('td').nth(0)).toHaveText('Hall B');
      await expect(secondPrint.locator('td').nth(3)).toHaveText('5');
      await expect(secondPrint.locator('td').nth(4)).toHaveText('5');
      await expect(secondPrint.locator('td').nth(6)).toHaveText('1500.00 SEK');
      expect(writes).toEqual([]);
    });
  }
}
