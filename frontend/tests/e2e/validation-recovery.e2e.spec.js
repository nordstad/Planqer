import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

// No request reaches the user backend; even unexpected writes fail synthetically.
const setup = async (page, language) => {
  const writes = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/, '');
    if (request.method() !== 'GET') {
      writes.push(path);
      return route.fulfill({ status: 503, json: {} });
    }
    if (path === '/api/auth/setup-status') return route.fulfill({ json: { single_user: true, needs_setup: false } });
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'synthetic', email: 'test@example.invalid' } });
    if (path === '/api/settings') return route.fulfill({ json: { preferred_language: language } });
    if (path.includes('catalogue')) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({ json: [] });
  });
  return writes;
};

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`opening correction is reachable without submit: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      const writes = await setup(page, language);
      await page.goto('/tile-layout');
      await expect(page.locator('#language-select')).toHaveValue(language);
      if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
      await page.getByRole('button', { name: locale.workflow.addOpening, exact: true }).click();
      const fields = page.locator('#tile-openings input');
      await expect(page.locator('#tile-openings [aria-invalid=true]')).toHaveCount(0);
      for (const [index, value] of ['100', '0', '5000', '500'].entries()) await fields.nth(index).fill(value);
      await expect(fields.nth(2)).toHaveAttribute('aria-invalid', 'true');
      await expect(fields.nth(2)).toHaveAccessibleDescription(locale.tileUi.rightEdge);
      const calculate = page.locator('.step-foot button[type=submit]');
      await expect(calculate).toBeDisabled();
      await page.getByRole('button', { name: locale.formUi.goTo.replace('{{name}}', locale.workflow.openings), exact: true }).click();
      await expect(fields.nth(2)).toBeFocused();
      await fields.nth(2).fill('500');
      await expect(page.locator('#tile-openings [aria-invalid=true]')).toHaveCount(0);
      await expect(calculate).toBeEnabled();
      await page.getByRole('button', { name: new RegExp(locale.workflow.sliverGuardBreakage) }).click();
      await page.locator('#tile-candidates').fill('1.5');
      await expect(page.locator('#tile-candidates')).toHaveAccessibleDescription(locale.validation.positiveQuantity);
      await page.locator('.step-foot .btn-link').click();
      await expect(page.locator('#tile-candidates')).toBeFocused();
      await expect(calculate).toBeDisabled();
      expect(writes).toEqual([]);
    });
  }
}

test('shared stock recovery skips optional fields on board and sheet consumers', async ({ page }) => {
  const writes = await setup(page, 'en-GB');
  for (const [route, stock, invalid] of [
    ['/cutting', '#board-stock', 'input[type=number]'],
    ['/sheet-cutting', '#sheet-stock', '#sheet-width'],
  ]) {
    await page.goto(route);
    await page.getByRole('button', { name: en.workflow.tryExample, exact: true }).click();
    if (route === '/cutting') {
      await page.locator('#board-thickness').fill('45');
      await page.locator('#board-width').fill('95');
      await page.locator('#board-width').fill('0');
      await page.locator('.step-foot .btn-link').click();
      await expect(page.locator('#board-width')).toBeFocused();
      await page.locator('#board-width').fill('95');
    }
    const field = page.locator(stock).locator(invalid).first();
    await field.fill('0');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await page.locator('.step-foot .btn-link').click();
    await expect(field).toBeFocused();
  }
  expect(writes).toEqual([]);
});
