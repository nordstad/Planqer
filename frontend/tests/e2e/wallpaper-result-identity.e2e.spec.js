import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const plan = (rolls = 6) => ({
  rolls_needed: rolls - 1, rolls_to_buy: rolls, area_estimate_rolls: rolls - 1,
  warnings: [], errors: [], closure: null, corners: [],
  start_candidates: [
    { wall_index: 0, first_strip_widths: [405], rolls_needed: rolls - 1, narrowest_strip: 405, feasible: true },
    { wall_index: 0, first_strip_widths: [331], rolls_needed: rolls, narrowest_strip: 331, feasible: true },
  ],
  strips: [{
    number: 1, wall_index: 0, x_start: 0, x_end: 530, width: 530, top_height: 2400,
    segments: [{ wall_index: 0, x_start: 0, x_end: 530, width: 530, top_height: 2400 }],
  }],
  pieces: [{
    id: 'synthetic-piece', strip_number: 1, wall_index: 0, y_start: 0, y_end: 2400,
    phase: 0, notches: [], segments: [{ wall_index: 0, x_start: 0, x_end: 530, notches: [] }],
  }],
  rolls: [{ number: 1, cuts: [], offcut_length: 0 }],
});

const setup = async (page, language, locale, dark, holdSaves = false) => {
  const pending = [];
  const saves = [];
  const saveReplies = [];
  const unexpectedWrites = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/, '');
    if (request.method() === 'POST' && path === '/api/wallpaper-plans') {
      const ticket = { input: request.postDataJSON(), postData: request.postData() };
      const reply = new Promise((resolve) => { ticket.resolve = resolve; });
      pending.push(ticket);
      return route.fulfill(await reply);
    }
    if (request.method() === 'POST' && path === '/api/wallpaper-projects') {
      const payload = request.postDataJSON();
      saves.push(payload);
      if (holdSaves) return route.fulfill(await new Promise((resolve) => saveReplies.push(resolve)));
      return route.fulfill({ json: { id: 'synthetic-saved', name: payload.name, project_group_id: 'synthetic-group' } });
    }
    if (request.method() === 'POST' && path === '/api/wallpapers') {
      return route.fulfill({ json: { id: 'synthetic-wallpaper' } });
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
      return route.fulfill({ json: { preferred_language: language, spare_margin_percent: 10, default_currency: 'SEK' } });
    }
    if (path.endsWith('/project-groups')) {
      return route.fulfill({ json: [{ id: 'synthetic-group', name: 'Synthetic project' }] });
    }
    return route.fulfill({ json: [] });
  });
  const release = async (index, reply) => {
    const ticket = pending[index];
    const received = page.waitForResponse((response) => (
      new URL(response.url()).pathname === '/api/wallpaper-plans'
      && response.request().postData() === ticket.postData
    ));
    ticket.resolve(reply);
    await (await received).finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await page.goto('/wallpaper');
  await expect(page.locator('#language-select')).toHaveValue(language);
  if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
  await page.locator('#wallpaper-name').fill('Willow');
  await page.locator('#wallpaper-manufacturer').fill('Example');
  await page.getByRole('button', { name: `${locale.wallpaperUi.measureRoom} →`, exact: true }).click();
  return { pending, saves, saveReplies, unexpectedWrites, release };
};

const createButton = (page, locale) => page.getByRole('button', { name: `${locale.wallpaperUi.createPlan} →`, exact: true });

for (const dark of [false, true]) test(`closure and corner warnings retain theme contrast: dark=${dark}`, async ({ page }) => {
  const state = await setup(page, 'en-GB', en, dark);
  await createButton(page, en).click();
  await expect.poll(() => state.pending.length).toBe(1);
  await state.release(0, { json: {
    ...plan(),
    closure: { valid: false, message: 'Synthetic closure warning' },
    corner_quality: { smallest: 10, minimum: 100, short_corners: [{ strip: 1, from_wall: 'A', to_wall: 'B', width: 10, action: 'Synthetic correction' }] },
  } });
  const alerts = page.locator('.step-view [role=alert]');
  await expect(alerts).toHaveCount(2);
  const ratios = await alerts.evaluateAll((elements) => {
    const rgb = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = (channels) => channels.map((n) => n / 255).map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
    return elements.map((element) => {
      let background = element;
      while (getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)') background = background.parentElement;
      const a = luminance(rgb(getComputedStyle(element).color));
      const b = luminance(rgb(getComputedStyle(background).backgroundColor));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
  });
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  expect(state.unexpectedWrites).toEqual([]);
});

const assertLocked = async (page) => {
  for (const index of [2, 3, 4]) await expect(page.locator('.plan-step-btn').nth(index)).toBeDisabled();
};
const saveCurrent = async (page, locale, state) => {
  await expect(page.getByTestId('spare-rolls')).toContainText(locale.wallpaperUi.rollsNeeded.replace('{{rolls}}', '8'));
  await page.getByRole('button', { name: `${locale.wallpaperUi.prepareCutSheets} →`, exact: true }).click();
  await page.getByRole('button', { name: `${locale.workflow.savePlan} →`, exact: true }).click();
  await page.locator('#wallpaper-plan-name').fill('Current project');
  await page.getByRole('button', { name: locale.workflow.savePlan, exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(1);
  const saved = state.saves[0];
  expect(saved.room_data.walls[0].width_top).toBe(4000);
  expect(saved.plan_result.rolls_to_buy).toBe(9);
  expect(saved.options_data.start).toBeNull();
  expect(state.unexpectedWrites).toEqual([]);
};

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`wallpaper pending save and retained failure/retry: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      const state = await setup(page, language, locale, dark, true);
      await createButton(page, locale).click();
      await expect.poll(() => state.pending.length).toBe(1);
      await state.release(0, { json: plan() });
      await page.getByRole('button', { name: `${locale.wallpaperUi.prepareCutSheets} →`, exact: true }).click();
      await page.getByRole('button', { name: `${locale.workflow.savePlan} →`, exact: true }).click();
      await page.locator('#wallpaper-plan-name').fill('Retained wallpaper draft');
      await page.getByRole('button', { name: locale.workflow.savePlan, exact: true }).click();
      await expect.poll(() => state.saveReplies.length).toBe(1);
      await expect(page.getByRole('status')).toHaveText(locale.workflow.saving);
      await expect(page.locator('#wallpaper-plan-name')).toBeDisabled();
      await expect(page.locator('#plan-project')).toBeDisabled();
      for (const button of await page.locator('.plan-step-btn').all()) await expect(button).toBeDisabled();
      const pendingSave = page.getByRole('button', { name: locale.workflow.saving, exact: true });
      await expect(pendingSave).toBeDisabled();
      await pendingSave.evaluate((button) => { button.click(); button.click(); });
      expect(state.saves).toHaveLength(1);
      state.saveReplies[0]({ status: 503, json: { detail: 'Synthetic save failure' } });
      await expect(page.getByRole('alert')).toContainText('Synthetic save failure');
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(page.locator('#wallpaper-plan-name')).toHaveValue('Retained wallpaper draft');
      await expect(page.locator('#plan-project')).toBeEnabled();
      await page.getByRole('button', { name: locale.workflow.savePlan, exact: true }).click();
      await expect.poll(() => state.saveReplies.length).toBe(2);
      state.saveReplies[1]({ json: { id: 'synthetic-saved', project_group_id: 'synthetic-group' } });
      await expect(page.getByRole('heading', { name: locale.workflow.planSaved, exact: true })).toBeVisible();
      await expect(page.getByRole('status')).toHaveCount(0);
      expect(state.saves[1]).toEqual(state.saves[0]);
      expect(state.unexpectedWrites).toEqual([]);
    });

    test(`completed wallpaper retirement: ${language}, ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      const state = await setup(page, language, locale, dark);
      await createButton(page, locale).click();
      await expect.poll(() => state.pending.length).toBe(1);
      await state.release(0, { json: plan() });
      await page.getByRole('button', { name: locale.wallpaperUi.editMeasurements, exact: true }).click();
      await page.getByLabel(locale.wallpaperUi.wallWidthMm, { exact: true }).fill('4000');
      await assertLocked(page);
      expect(state.pending).toHaveLength(1);
      expect(state.saves).toEqual([]);
      await createButton(page, locale).click();
      await expect.poll(() => state.pending.length).toBe(2);
      await state.release(1, { json: plan(9) });
      await saveCurrent(page, locale, state);
    });

    for (const origin of ['calculation', 'alternative start']) {
      for (const order of ['old-first', 'new-first']) {
        for (const outcome of ['success', 'failure']) {
          test(`wallpaper context: ${language}, ${dark ? 'dark' : 'light'}, ${origin}, ${order}, obsolete ${outcome}`, async ({ page }) => {
            const state = await setup(page, language, locale, dark);
            await createButton(page, locale).click();
            await expect.poll(() => state.pending.length).toBe(1);
            let oldIndex = 0;
            if (origin === 'alternative start') {
              await state.release(0, { json: plan() });
              await page.getByRole('button', { name: locale.wallpaperUi.use, exact: true }).click();
              await expect.poll(() => state.pending.length).toBe(2);
              oldIndex = 1;
              expect(state.pending[1].input.start.first_strip_width).toBe(331);
              await expect(page.getByRole('button', { name: `${locale.wallpaperUi.prepareCutSheets} →`, exact: true })).toBeDisabled();
              await expect(page.locator('.plan-step-btn').nth(3)).toBeDisabled();
              await expect(page.locator('.plan-step-btn').nth(4)).toBeDisabled();
              await expect(page.getByText(locale.wallpaperUi.correctRoomMeasurements, { exact: true })).toHaveCount(0);
              await page.getByRole('button', { name: locale.wallpaperUi.editMeasurements, exact: true }).click();
            }
            await page.getByLabel(locale.wallpaperUi.wallWidthMm, { exact: true }).fill('4000');
            await assertLocked(page);
            await createButton(page, locale).click();
            await expect.poll(() => state.pending.length).toBe(oldIndex + 2);
            expect(state.pending[oldIndex].input.room.walls[0].width_top).toBe(2400);
            expect(state.pending[oldIndex + 1].input.room.walls[0].width_top).toBe(4000);
            const obsolete = outcome === 'success'
              ? { json: plan(99) }
              : { status: 503, json: { detail: 'Obsolete calculation failed' } };
            if (order === 'old-first') {
              await state.release(oldIndex, obsolete);
              await expect(createButton(page, locale)).toBeDisabled();
              await expect(page.getByRole('status')).toHaveText(locale.workflow.solving);
              await state.release(oldIndex + 1, { json: plan(9) });
            } else {
              await state.release(oldIndex + 1, { json: plan(9) });
              await expect(page.getByRole('heading', { name: locale.wallpaperUi.planTitle, exact: true })).toBeVisible();
              await state.release(oldIndex, obsolete);
            }
            await expect(page.getByRole('alert')).toHaveCount(0);
            await saveCurrent(page, locale, state);
          });
        }
      }
    }
  }
}
