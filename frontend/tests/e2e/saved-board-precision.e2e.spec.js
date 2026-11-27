import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const diagram = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#fafaf7"/><text x="20" y="40">Synthetic board diagram</text></svg>',
).toString('base64');
const project = {
  id: 'synthetic-board-precision', name: 'Fractional board fixture',
  material_type: 'Pine', board_thickness: 44.8, board_width: 95.2,
  parts_data: [
    { name: 'Long rail', length: 800.5, quantity: 1 },
    { name: 'Short rail', length: 400.25, quantity: 1 },
  ],
  updated_at: '2026-11-26T00:00:00Z',
  optimization_result: {
    visualization: diagram, cut_list: [[800.5], [400.25]],
    board_lengths_used: [2400.5, 1800.25],
  },
};

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    for (const legacy of [false, true]) {
      test(`saved board and Print precision: ${language}, ${dark ? 'dark' : 'light'}, ${legacy ? 'legacy map' : 'named rows'}`, async ({ page }) => {
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
        // Every API call is intercepted; existing records are never read or changed.
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
          if (path.endsWith(`/projects/${project.id}`)) {
            return route.fulfill({
              json: { ...project, parts_data: legacy ? { '800.5': 1, '400.25': 1 } : project.parts_data },
            });
          }
          return route.fulfill({ status: 404, json: {} });
        });
        await page.goto(`/cutting/plan/${project.id}`);
        await expect(page.getByRole('heading', { name: project.name })).toBeVisible();
        await expect(page.locator('#language-select')).toHaveValue(language);
        if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
        await expect(page.getByText('44,8 mm × 95,2 mm', { exact: true })).toBeVisible();
        await expect(page.getByText('1 × 2\u00a0400,5 mm, 1 × 1\u00a0800,25 mm', { exact: true })).toBeVisible();
        await expect(page.locator('.board-plan-parts')).toContainText('800,5 mm');
        await expect(page.locator('.board-plan-parts')).toContainText('400,25 mm');
        await expect(page.locator('.board-plan-cuts')).toContainText('800,5 mm');
        await expect(page.locator('.board-plan-picker button').nth(0)).toContainText('2\u00a0400,5 mm');
        await page.locator('.board-plan-picker button').nth(1).click();
        await expect(page.locator('.board-plan-picker button').nth(1)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.board-plan-picker button').nth(1)).toContainText('1\u00a0800,25 mm');
        await expect(page.locator('.board-plan-cuts')).toContainText('400,25 mm');
        await expect(page.locator('img.board-plan-diagram')).toHaveAttribute('src', diagram);
        await page.getByRole('button', { name: locale.projectUi.printOne, exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
        const print = page.frameLocator('iframe[aria-hidden="true"]');
        await expect(print.locator('.board-plan-print table')).toHaveCount(3);
        await expect(print.getByText('44,8 mm × 95,2 mm', { exact: true })).toHaveCount(1);
        await expect(print.getByText('1 × 2\u00a0400,5 mm, 1 × 1\u00a0800,25 mm', { exact: true })).toHaveCount(1);
        await expect(print.getByText('800,5 mm', { exact: true })).toHaveCount(2);
        await expect(print.getByText('400,25 mm', { exact: true })).toHaveCount(2);
        if (!legacy) {
          await expect(print.getByText('Long rail', { exact: true })).toHaveCount(1);
          await expect(print.getByText('Short rail', { exact: true })).toHaveCount(1);
        }
        expect(writes).toEqual([]);
      });
    }
  }
}
