import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

// Every API call is intercepted: no accounts, settings or saved work are touched.
const interceptApi = async (page, language, requests) => {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      requests.push({ path, data: request.postDataJSON() });
      return route.fulfill({ status: 503, json: { detail: 'Synthetic calculation failure' } });
    }
    if (path.endsWith('/auth/setup-status')) {
      return route.fulfill({ json: { single_user: true, needs_setup: false } });
    }
    if (path.endsWith('/auth/me')) {
      return route.fulfill({ json: { id: 'quantity-test', email: 'test@example.invalid' } });
    }
    if (path.includes('/settings')) {
      return route.fulfill({ json: { preferred_language: language, default_currency: 'SEK' } });
    }
    if (path.includes('/catalogue')) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({ json: [] });
  });
};

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`sheet whole-count validation: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      const requests = [];
      await interceptApi(page, language, requests);
      await page.goto('/sheet-cutting');
      await expect(page.locator('#language-select')).toHaveValue(language);
      if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
      await page.getByRole('button', { name: locale.workflow.tryExample, exact: true }).click();
      const quantity = page.getByLabel(locale.ui.quantityAria.replace('{{item}}', '1'), { exact: true });
      const plan = page.locator('button.btn-order[type=submit]');
      const total = page.locator('tr.is-sum td').nth(2);
      for (const value of ['1.5', '0', '-1', '1001', '']) {
        await quantity.fill(value);
        await expect(plan).toBeDisabled();
        await expect(total).toHaveText('6');
        if (value && value !== '1001') {
          await expect(page.getByRole('alert')).toHaveText(locale.validation.positiveQuantity);
        }
        await quantity.press('Enter');
        // Also exercise the custom submit guard independently of button eligibility.
        await quantity.evaluate((input) => input.form.requestSubmit());
        await expect(plan).toBeDisabled();
        expect(requests).toEqual([]);
      }
      for (const value of ['1', '1000', '1e2']) {
        await quantity.fill(value);
        await expect(plan).toBeEnabled();
        await expect(total).toHaveText(String(Number(value) + 6));
        await quantity.press('Enter');
        await expect.poll(() => requests.length).toBe(['1', '1000', '1e2'].indexOf(value) + 1);
        expect(requests.at(-1)).toMatchObject({
          path: '/api/sheet-optimization',
          data: { parts: { shelf_back: { quantity: Number(value) } } },
        });
        await expect(plan).toBeEnabled();
      }
    });

    test(`board whole-count validation: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      const requests = [];
      await interceptApi(page, language, requests);
      await page.goto('/cutting');
      await expect(page.locator('#language-select')).toHaveValue(language);
      if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
      await page.getByRole('button', { name: locale.workflow.addPart, exact: true }).click();
      await page.getByLabel(locale.ui.partLengthAria.replace('{{item}}', '1'), { exact: true }).fill('100');
      await page.getByLabel(locale.workflow.thicknessMm, { exact: true }).fill('45');
      await page.getByLabel(locale.workflow.widthMm, { exact: true }).fill('45');
      const quantity = page.getByLabel(locale.ui.quantityAria.replace('{{item}}', '1'), { exact: true });
      const plan = page.locator('button.btn-order[type=submit]');
      const total = page.locator('tr.is-sum td').nth(2);
      const demand = page.locator('tr.is-sum td').nth(1);
      for (const value of ['1.5', '0', '-1', '10001', '1e5', '']) {
        await quantity.fill(value);
        await expect(plan).toBeDisabled();
        await expect(total).toHaveText('0');
        await expect(demand).toHaveText('0');
        if (value) {
          await expect(quantity).toHaveAttribute('aria-invalid', 'true');
          await expect(page.getByRole('alert')).toHaveText(
            Number(value) > 10000
              ? locale.validation.maxQuantity.replace('{{max}}', '10000')
              : locale.validation.positiveQuantity,
          );
        }
        await quantity.press('Enter');
        await quantity.evaluate((input) => input.form.requestSubmit());
        expect(requests).toEqual([]);
      }
      for (const [index, value] of ['1', '10000', '1e2', '2.0'].entries()) {
        await quantity.fill(value);
        await expect(plan).toBeEnabled();
        await expect(total).toHaveText(String(Number(value)));
        await expect(demand).toHaveText((Number(value) * 100).toLocaleString('sv-SE'));
        await quantity.press('Enter');
        await expect.poll(() => requests.length).toBe(index + 1);
        expect(requests.at(-1)).toMatchObject({
          path: '/api/cutting-plans',
          data: { parts: { 100: Number(value) } },
        });
        await expect(plan).toBeEnabled();
      }
    });
  }
}

test('board fractional quantities are already blocked without a calculation request', async ({ page }) => {
  const requests = [];
  await interceptApi(page, 'en-GB', requests);
  await page.goto('/cutting');
  await page.getByRole('button', { name: en.workflow.tryExample, exact: true }).click();
  const quantity = page.getByLabel('Quantity, item 1', { exact: true });
  await quantity.fill('1.5');
  await expect(quantity).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toHaveText(en.validation.positiveQuantity);
  await quantity.press('Enter');
  await quantity.evaluate((input) => input.form.requestSubmit());
  expect(requests).toEqual([]);
});
