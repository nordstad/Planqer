import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const modules = [
  { name: 'board', path: '/cutting', api: '/api/projects', document: '.board-plan-document' },
  { name: 'sheet', path: '/sheet-cutting', api: '/api/sheet-projects', document: '.sheet-plan-document' },
  { name: 'tile', path: '/tile-layout', api: '/api/tile-projects', document: '.tile-plan-document' },
  { name: 'wallpaper', path: '/wallpaper', api: '/api/wallpaper-projects', document: '.wallpaper-plan-document' },
];

// Synthetic saved responses exercise route identity, not solver geometry or persistence.
const project = (id) => ({
  id, name: `Synthetic plan ${id}`, project_group_id: 'synthetic-group',
  updated_at: '2026-11-26T12:00:00Z', material_type: `Synthetic material ${id}`,
  board_thickness: 45, board_width: 95, sheet_thickness: 18, sheet_width: 1200, sheet_height: 2400,
  parts_data: [{ name: `Synthetic part ${id}`, length: 400, width: 300, height: 400, quantity: 1 }],
  optimization_result: { cut_list: [[400]], board_lengths_used: [2400], total_sheets: 1, sheets: [] },
  tile_data: { material_type: `Synthetic material ${id}`, width: 300, height: 600 },
  layout_result: { tiles: [], tiles_to_purchase: 1 },
  wallpaper_data: { name: `Synthetic material ${id}`, roll_width: 530, roll_length: 10050, repeat: 0 },
  room_data: {
    walls: [{
      name: `Synthetic wall ${id}`, width_top: 2400, width_middle: 2400, width_bottom: 2400,
      height_left: 2400, height_middle: 2400, height_right: 2400, openings: [],
    }],
    corners: [], closed: false,
  },
  plan_result: { rolls_to_buy: 1, rolls_needed: 1, strips: [], pieces: [], rolls: [] },
});

const setup = async (page, config, language, locale, dark) => {
  const pending = [];
  const unexpectedWrites = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/, '');
    if (request.method() !== 'GET') {
      unexpectedWrites.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 503, json: {} });
    }
    if (path.startsWith(`${config.api}/`)) {
      const ticket = { id: path.split('/').at(-1), url: request.url() };
      const response = new Promise((resolve) => { ticket.resolve = resolve; });
      pending.push(ticket);
      return route.fulfill(await response);
    }
    if (path.endsWith('/auth/setup-status')) return route.fulfill({ json: { single_user: true, needs_setup: false } });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'synthetic-user', email: 'test@example.invalid' } });
    if (path.endsWith('/settings')) return route.fulfill({ json: { preferred_language: language, default_currency: 'SEK' } });
    return route.fulfill({ json: [] });
  });
  const release = async (index, failure = false) => {
    const ticket = pending[index];
    const received = page.waitForResponse((response) => response.url() === ticket.url);
    ticket.resolve(failure ? { status: 503, json: { detail: 'Synthetic failure' } } : { json: project(ticket.id) });
    await (await received).finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  // Preserve the mounted route component, matching the controlled audit reproduction.
  const navigate = async (id) => {
    await page.evaluate((path) => {
      history.pushState({ ...history.state, key: `synthetic-${history.length}` }, '', path);
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    }, `${config.path}/plan/${id}`);
    await expect.poll(() => pending.length).toBe(navigate.count + 1);
    navigate.count += 1;
  };
  navigate.count = 1;
  await page.goto(`${config.path}/plan/A`);
  await expect(page.locator('#language-select')).toHaveValue(language);
  if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
  await expect.poll(() => pending.length).toBe(1);
  return { pending, release, navigate, unexpectedWrites, errors };
};

const loading = async (page, config, locale) => {
  await expect(page.getByText(locale.ui.loadingPreview, { exact: true })).toBeVisible();
  await expect(page.locator('h1.step-h1')).toHaveCount(0);
  await expect(page.locator(config.document)).toHaveCount(0);
  await expect(page.getByRole('button', { name: locale.projectUi.printOne, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: locale.projectUi.modify, exact: true })).toHaveCount(0);
  await expect(page.getByText(locale.projectUi.planNotFound, { exact: true })).toHaveCount(0);
};
const current = async (page, config, id) => {
  await expect(page).toHaveURL(new RegExp(`${config.path}/plan/${id}$`));
  await expect(page.getByRole('heading', { level: 1, name: `Synthetic plan ${id}`, exact: true })).toBeVisible();
  await expect(page.locator(config.document)).toContainText(`Synthetic material ${id}`);
};
const actions = async (page, config, locale, id, state) => {
  // Suppress only the native dialog; inspect the actual generated Print document.
  await page.evaluate(() => {
    window.__printed = [];
    const append = document.body.appendChild.bind(document.body);
    document.body.appendChild = (node) => {
      const result = append(node);
      if (node.tagName === 'IFRAME') {
        node.contentWindow.print = () => window.__printed.push({
          title: node.contentDocument.title, text: node.contentDocument.body.textContent,
        });
      }
      return result;
    };
  });
  await page.getByRole('button', { name: locale.projectUi.printOne, exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__printed.length)).toBe(1);
  const [printed] = await page.evaluate(() => window.__printed);
  expect(printed.title).toBe(`Synthetic plan ${id}`);
  expect(printed.text).toContain(`Synthetic material ${id}`);
  expect(printed.text).not.toContain(`Synthetic material ${id === 'A' ? 'B' : 'A'}`);
  await page.getByRole('button', { name: locale.projectUi.modify, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${config.path}\\?edit=${id}$`));
  expect(state.unexpectedWrites).toEqual([]);
  expect(state.errors).toEqual([]);
};

for (const config of modules) {
  for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
    for (const dark of [false, true]) {
      const label = `${config.name}, ${language}, ${dark ? 'dark' : 'light'}`;
      for (const failure of [false, true]) {
        test(`saved A→B→A: ${label}, late B ${failure ? 'failure' : 'success'}`, async ({ page }) => {
          const state = await setup(page, config, language, locale, dark);
          await state.release(0);
          await current(page, config, 'A');
          await state.navigate('B');
          await loading(page, config, locale);
          await state.navigate('A');
          await loading(page, config, locale);
          await state.release(2);
          await current(page, config, 'A');
          await state.release(1, failure);
          await current(page, config, 'A');
          await actions(page, config, locale, 'A', state);
        });
      }
      for (const order of ['old-first', 'new-first']) {
        for (const failure of [false, true]) {
          test(`saved pending routes: ${label}, ${order}, obsolete ${failure ? 'failure' : 'success'}`, async ({ page }) => {
            const state = await setup(page, config, language, locale, dark);
            await state.navigate('B');
            if (order === 'old-first') {
              await state.release(0, failure);
              await loading(page, config, locale);
              await state.release(1);
            } else {
              await state.release(1);
              await current(page, config, 'B');
              await state.release(0, failure);
            }
            await current(page, config, 'B');
            await actions(page, config, locale, 'B', state);
          });
        }
      }
      test(`saved missing-route recovery: ${label}`, async ({ page }) => {
        const state = await setup(page, config, language, locale, dark);
        await state.release(0, true);
        await expect(page.getByText(locale.projectUi.planNotFound, { exact: true })).toBeVisible();
        await state.navigate('B');
        await loading(page, config, locale);
        await state.release(1);
        await current(page, config, 'B');
        await actions(page, config, locale, 'B', state);
      });
    }
  }
}
