import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const result = (label) => ({
  recommended_index: 0,
  candidates: [{
    label, visualization: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MDAiIGhlaWdodD0iMzAwIi8+',
    warnings: [], sliver_count: 0, tiles_to_purchase_with_waste: 10,
    tiles_to_purchase: 9, efficiency: 0.8, distinct_cut_sizes: 1,
    full_tile_count: 8, cut_tile_count: 2, notched_count: 0,
    reused_offcut_count: 0, min_edge_cut_width: null, min_edge_cut_height: null,
    tiles: [],
  }],
});

const setup = async (page, language) => {
  const pending = [];
  const saves = [];
  const unexpectedWrites = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/, '');
    if (request.method() === 'POST' && path === '/api/tile-layout') {
      const ticket = { input: request.postDataJSON() };
      const reply = new Promise((resolve) => { ticket.resolve = resolve; });
      pending.push(ticket);
      return route.fulfill(await reply);
    }
    if (request.method() === 'POST' && path === '/api/tile-projects') {
      const payload = request.postDataJSON();
      saves.push(payload);
      return route.fulfill({ json: { id: 'synthetic-saved', name: payload.name, project_group_id: 'synthetic-group' } });
    }
    if (request.method() !== 'GET') {
      unexpectedWrites.push(path);
      return route.fulfill({ status: 503, json: {} });
    }
    if (path.endsWith('/auth/setup-status')) {
      return route.fulfill({ json: { single_user: true, needs_setup: false } });
    }
    if (path.endsWith('/auth/me')) {
      return route.fulfill({ json: { id: 'identity-test', email: 'test@example.invalid' } });
    }
    if (path.endsWith('/settings')) {
      return route.fulfill({ json: { preferred_language: language, default_currency: 'SEK' } });
    }
    if (path.endsWith('/project-groups')) {
      return route.fulfill({ json: [{ id: 'synthetic-group', name: 'Synthetic project' }] });
    }
    return route.fulfill({ json: [] });
  });
  const release = async (index, outcome = 'success') => {
    const ticket = pending[index];
    const received = page.waitForResponse((response) => (
      new URL(response.url()).pathname === '/api/tile-layout'
      && response.request().postDataJSON().surface_width === ticket.input.surface_width
    ));
    ticket.resolve(outcome === 'success'
      ? { json: result(index === 0 ? 'Outdated layout' : 'Current layout') }
      : { status: 503, json: { detail: 'Outdated calculation failed' } });
    await (await received).finished();
    // Wait for network-driven state updates to paint, not an arbitrary delay.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await page.goto('/tile-layout');
  await expect(page.locator('#language-select')).toHaveValue(language);
  return { pending, saves, unexpectedWrites, release };
};

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`retired tile response cannot unlock Keep: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      const state = await setup(page, language);
      if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
      const calculate = page.locator('button.btn-order[type=submit]');
      await calculate.click();
      await expect.poll(() => state.pending.length).toBe(1);
      expect(state.pending[0].input.surface_width).toBe(2400);
      await page.locator('#tile-surface-width').fill('2600');
      await expect(calculate).toBeEnabled();
      await state.release(0);
      await expect(page.getByRole('heading', { name: locale.tileUi.pickLayout, exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: locale.ui.nameAndSave, exact: true })).toHaveCount(0);
      await expect(page.locator('.plan-step-btn').nth(1)).toBeDisabled();
      await expect(page.locator('.plan-step-btn').nth(2)).toBeDisabled();
      expect(state.saves).toEqual([]);
      expect(state.unexpectedWrites).toEqual([]);
    });

    for (const order of ['old-first', 'new-first']) {
      for (const outcome of ['success', 'failure']) {
        test(`tile result identity: ${language}, ${dark ? 'dark' : 'light'}, ${order}, obsolete ${outcome}`, async ({ page }) => {
          const state = await setup(page, language);
          if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
          const calculate = page.locator('button.btn-order[type=submit]');
          await calculate.click();
          await expect.poll(() => state.pending.length).toBe(1);
          await page.locator('#tile-surface-width').fill('2600');
          await expect(calculate).toBeEnabled();
          await calculate.click();
          await expect.poll(() => state.pending.length).toBe(2);
          expect(state.pending.map((ticket) => ticket.input.surface_width)).toEqual([2400, 2600]);
          if (order === 'old-first') {
            await state.release(0, outcome);
            await expect(calculate).toBeDisabled();
            await expect(page.getByTestId('api-error')).toHaveCount(0);
            await expect(page.getByText('Outdated layout', { exact: true })).toHaveCount(0);
            await state.release(1);
          } else {
            await state.release(1);
            await expect(page.getByText('Current layout', { exact: true })).toBeVisible();
            await state.release(0, outcome);
          }
          await expect(page.getByText('Current layout', { exact: true })).toBeVisible();
          await expect(page.getByText('Outdated layout', { exact: true })).toHaveCount(0);
          await expect(page.getByTestId('api-error')).toHaveCount(0);
          await expect(page.locator('.tile-diagram-heading')).toContainText('2\u00a0600');
          await page.getByRole('button', { name: locale.ui.nameAndSave, exact: true }).click();
          await page.locator('#tile-plan-name').fill('Current layout');
          await page.locator('form').evaluate((form) => form.requestSubmit());
          await expect.poll(() => state.saves.length).toBe(1);
          expect(state.saves[0].surface_data.width).toBe(2600);
          expect(state.saves[0].layout_result.label).toBe('Current layout');
          expect(state.unexpectedWrites).toEqual([]);
        });
      }
    }
  }
}
