import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const model = {
  boards: [
    { name: 'Rail', thickness: 20, width: 45, length: 500, quantity: 1 },
    { name: 'Post', thickness: 30, width: 60, length: 600, quantity: 1 },
  ],
  sheets: [],
  warnings: [
    { name: 'Flat face', reason: 'zero_thickness' },
    { name: 'Container', reason: 'too_few_points' },
    { name: 'Unmeasured', reason: 'unrecognized_internal_detail' },
  ],
};

const setup = async (page, language, locale, dark) => {
  const solves = [];
  const saves = [];
  const unexpectedWrites = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/, '');
    if (request.method() === 'POST' && path === '/api/step-cutlist') return route.fulfill({ json: model });
    if (request.method() === 'POST' && path === '/api/cutting-plans') {
      solves.push(request.postDataJSON());
      return solves.length === 2
        ? route.fulfill({ status: 422, json: { detail: 'Synthetic stock unavailable' } })
        : route.fulfill({ json: { cut_list: [] } });
    }
    if (request.method() === 'POST' && path === '/api/projects') {
      const body = request.postDataJSON();
      saves.push(body);
      return route.fulfill({ json: { ...body, id: `synthetic-${saves.length}` } });
    }
    if (request.method() !== 'GET') {
      unexpectedWrites.push(path);
      return route.fulfill({ status: 503, json: {} });
    }
    if (path === '/api/auth/setup-status') return route.fulfill({ json: { single_user: true, needs_setup: false } });
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'synthetic-user', email: 'test@example.invalid' } });
    if (path === '/api/settings') return route.fulfill({ json: { preferred_language: language } });
    if (path === '/api/project-groups') return route.fulfill({ json: [{ id: 'synthetic-group', name: 'Synthetic project' }] });
    if (path.includes('catalogue')) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto('/model-cutlist');
  await expect(page.locator('#language-select')).toHaveValue(language);
  if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'synthetic.step', mimeType: 'application/step', buffer: Buffer.from('synthetic fixture') });
  await page.getByRole('button', { name: locale.workflow.readModel, exact: true }).click();
  await expect(page.getByRole('heading', { name: locale.ui.cutlistsFound, exact: true })).toBeVisible();
  return { solves, saves, unexpectedWrites };
};

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`skipped model geometry explains causes: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      const state = await setup(page, language, locale, dark);
      const warning = page.getByRole('alert');
      for (const key of ['skippedZeroThickness', 'skippedTooFewPoints', 'skippedGeometry']) {
        await expect(warning).toContainText(locale.modelUi[key]);
      }
      for (const item of model.warnings) {
        await expect(warning).toContainText(item.name);
        await expect(warning).not.toContainText(item.reason);
      }
      expect(state.saves).toEqual([]);
      expect(state.unexpectedWrites).toEqual([]);
    });
  }
}

test('a partial model batch retains successes and retries only the failed cutlist', async ({ page }) => {
  const state = await setup(page, 'en-GB', en, false);
  const planButton = page.getByRole('button', { name: 'Plan 2 cutlists', exact: true });
  await planButton.click();
  await expect(page.getByRole('heading', { name: 'Plan and save', exact: true })).toBeVisible();
  await page.locator('#plan-project').selectOption('synthetic-group');
  await planButton.click();
  await expect(page.getByRole('alert')).toContainText('Synthetic stock unavailable');
  await expect(page.getByRole('alert')).toContainText(en.measurementUi.retryFailed);
  expect(state.saves).toHaveLength(1);
  await planButton.click();
  await expect(page.getByRole('link', { name: 'Open project', exact: true })).toBeVisible();
  expect(state.solves).toHaveLength(3);
  expect(state.solves[2]).toEqual(state.solves[1]);
  expect(state.saves).toHaveLength(2);
  expect(state.saves[0].parts_data).not.toEqual(state.saves[1].parts_data);
  expect(state.unexpectedWrites).toEqual([]);
});

test('blocked model stock offers a correction link to its invalid field', async ({ page }) => {
  const state = await setup(page, 'en-GB', en, false);
  const plan = page.getByRole('button', { name: 'Plan 2 cutlists', exact: true });
  await plan.click();
  const stock = page.locator('.model-group-settings').first();
  const length = stock.getByRole('spinbutton', { name: 'Board length in millimetres, row 1', exact: true });
  await length.fill('0');
  await expect(length).toHaveAttribute('aria-invalid', 'true');
  await expect(plan).toBeDisabled();
  await page.locator('.step-foot .btn-link').click();
  await expect(length).toBeFocused();
  await length.fill('2400');
  await expect(length).not.toHaveAttribute('aria-invalid');
  await expect(plan).toBeEnabled();
  expect(state.solves).toEqual([]);
  expect(state.saves).toEqual([]);
  expect(state.unexpectedWrites).toEqual([]);
});
