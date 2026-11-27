import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const diagram = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#fafaf7"/><text x="20" y="40">Synthetic sheet diagram</text></svg>',
).toString('base64');
const project = {
  id: 'synthetic-sheet-precision', name: 'Fractional sheet fixture',
  material_type: 'plywood', sheet_thickness: 18.125,
  sheet_width: 1200.5, sheet_height: 2500.25, kerf_width: 2.125,
  parts_data: [{ id: 'Shelf', width: 800.5, height: 400.25, quantity: 2 }],
  updated_at: '2026-11-26T00:00:00Z',
  optimization_result: {
    total_sheets: 2, sheet_visualizations: [diagram, diagram],
    sheets: [{
      sheet_width: 1200.5, sheet_height: 2500.25, efficiency: 50, parts_count: 1,
      parts: [{ part_id: 'Shelf', width: 800.5, height: 400.25, x: 3.125, y: 0.0625, rotated: false }],
    }, {
      sheet_width: 1200.5, sheet_height: 2500.25, efficiency: 40, parts_count: 1,
      parts: [{ part_id: 'Shelf', width: 400.25, height: 800.5, x: 0, y: 400.0625, rotated: true }],
    }],
  },
};

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`saved sheet and Print precision: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      const writes = [];
      // Stub only the native print call; inspect the actual generated iframe.
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
      // No live backend calls, including reads of existing saved work.
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() !== 'GET') {
          writes.push(path);
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
        if (path.endsWith(`/sheet-projects/${project.id}`)) return route.fulfill({ json: project });
        return route.fulfill({ status: 404, json: {} });
      });
      await page.goto(`/sheet-cutting/plan/${project.id}`);
      await expect(page.getByRole('heading', { name: project.name })).toBeVisible();
      await expect(page.locator('#language-select')).toHaveValue(language);
      if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
      await expect(page.getByText('18,125 mm', { exact: true })).toBeVisible();
      await expect(page.getByText('1\u00a0200,5 mm × 2\u00a0500,25 mm', { exact: true })).toBeVisible();
      await expect(page.locator('img.sheet-plan-diagram')).toHaveAttribute('alt', /1\s?200,5.*2\s?500,25/);
      await page.getByRole('button', { name: new RegExp(locale.workflow.exactPlacements) }).click();
      await expect(page.getByText('800,5 mm × 400,25 mm', { exact: true })).toBeVisible();
      await expect(page.getByText('3,125; 0,0625', { exact: true })).toBeVisible();
      await page.locator('.sheet-plan-thumbnail').nth(1).click();
      await expect(page.getByText('400,25 mm × 800,5 mm', { exact: true })).toBeVisible();
      await expect(page.getByText('0; 400,0625', { exact: true })).toBeVisible();
      await expect(page.getByText('90°', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: locale.projectUi.printOne, exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
      const print = page.frameLocator('iframe[aria-hidden="true"]');
      await expect(print.locator('.sheet-plan-sheet')).toHaveCount(2);
      await expect(print.getByText('18,125 mm', { exact: true })).toHaveCount(1);
      await expect(print.getByText('1\u00a0200,5 mm × 2\u00a0500,25 mm', { exact: true })).toHaveCount(1);
      await expect(print.getByText('800,5 mm × 400,25 mm', { exact: true })).toHaveCount(1);
      await expect(print.getByText('400,25 mm × 800,5 mm', { exact: true })).toHaveCount(1);
      await expect(print.getByText('3,125; 0,0625', { exact: true })).toHaveCount(1);
      await expect(print.getByText('0; 400,0625', { exact: true })).toHaveCount(1);
      await expect(print.getByText('90°', { exact: true })).toHaveCount(1);
      expect(writes).toEqual([]);
    });
  }
}
