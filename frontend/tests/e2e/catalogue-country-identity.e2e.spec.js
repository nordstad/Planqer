import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const product = (country, width) => ({
  id: `local:regel:45x${width}`, country, kind: 'board', type: 'regel', thickness: 45, width,
  lengths: [2400], max_length: null, formats: [], species: [], treatments: [],
  grades: [], profiles: [], sources: ['https://example.invalid/source'], note: null,
});
const listing = (country) => [
  { product: product(country, 95), origin: 'local', hidden: false },
  { product: product(country, 70), origin: 'builtin', hidden: true },
  { product: product(country, 120), origin: 'modified', hidden: false },
];
const vocabulary = (country) => ({
  country, country_name: country === 'SE' ? 'Sweden' : 'Norway',
  types: [{ key: 'regel', kind: 'board', labels: { en: `${country} Timber`, sv: `${country} Timber`, nb: `${country} Timber` }, aliases: [], details: [], rank: 1 }],
  details: { species: [], treatment: [], profile: [] }, products: [],
});

const setup = async (page, language, locale, dark) => {
  const lists = [];
  const vocabularies = [];
  const mutations = [];
  const unexpectedWrites = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('partsible-catalogue-country-v1', 'SE'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, '');
    const method = request.method();
    const hold = async (queue, country) => {
      const ticket = { request, country, method, path, body: request.postDataJSON() };
      const response = new Promise((resolve) => { ticket.resolve = resolve; });
      queue.push(ticket);
      return route.fulfill(await response);
    };
    if (path === '/api/admin/catalogue' && method === 'GET') return hold(lists, url.searchParams.get('catalogue'));
    if (path === '/api/catalogue' && method === 'GET') return hold(vocabularies, url.searchParams.get('country'));
    if (path.startsWith('/api/admin/catalogue') && method !== 'GET') return hold(mutations, url.searchParams.get('catalogue'));
    if (path.endsWith('/suggestion')) return route.fulfill({ json: { snippet: 'Synthetic suggestion', url: 'https://example.invalid/issue' } });
    if (method !== 'GET') {
      unexpectedWrites.push(`${method} ${path}`);
      return route.fulfill({ status: 503, json: {} });
    }
    if (path.endsWith('/auth/setup-status')) return route.fulfill({ json: { single_user: true, needs_setup: false } });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'synthetic-user', email: 'test@example.invalid', is_admin: true } });
    if (path.endsWith('/settings')) return route.fulfill({ json: { preferred_language: language, catalogue_country: 'SE' } });
    return route.fulfill({ json: [] });
  });
  const release = async (ticket, reply) => {
    const received = page.waitForResponse((response) => response.request() === ticket.request);
    ticket.resolve(reply);
    await (await received).finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const releaseLoad = async (index, failedEndpoint = null) => {
    const list = lists[index];
    const words = vocabularies[index];
    await Promise.all([
      release(list, failedEndpoint === 'list'
        ? { status: 503, json: { detail: 'Obsolete list failed' } } : { json: listing(list.country) }),
      release(words, failedEndpoint === 'vocabulary'
        ? { status: 503, json: { detail: 'Obsolete vocabulary failed' } } : { json: vocabulary(words.country) }),
    ]);
  };
  const waitLoad = async (count) => {
    await expect.poll(() => lists.length).toBe(count);
    await expect.poll(() => vocabularies.length).toBe(count);
  };
  await page.goto('/admin');
  await expect(page.locator('#language-select')).toHaveValue(language);
  if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
  await waitLoad(1);
  return { lists, vocabularies, mutations, release, releaseLoad, waitLoad, unexpectedWrites, errors };
};
const row = (page, country, width = 95) => page.getByRole('row').filter({ hasText: `${country} Timber 45 × ${width} mm` });

for (const dark of [false, true]) test(`hidden catalogue state remains legible with enabled actions: dark=${dark}`, async ({ page }) => {
  const state = await setup(page, 'en-GB', en, dark);
  await state.releaseLoad(0);
  const hidden = row(page, 'SE', 70);
  await expect(hidden.getByRole('button', { name: en.catalogueAdmin.restore, exact: true })).toBeEnabled();
  const ratio = await hidden.locator('.status-badge-hidden').evaluate((element) => {
    const rgb = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = (channels) => channels.map((n) => n / 255).map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
    for (let node = element; node; node = node.parentElement) {
      if (Number(getComputedStyle(node).opacity) !== 1) throw new Error('Meaningful state is faded by ancestor opacity');
    }
    let background = element;
    while (getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)') background = background.parentElement;
    const a = luminance(rgb(getComputedStyle(element).color));
    const b = luminance(rgb(getComputedStyle(background).backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  expect(state.mutations).toEqual([]);
  expect(state.unexpectedWrites).toEqual([]);
});

const switchCountry = async (page, state, country, count) => {
  await page.locator('#admin-catalogue-country').selectOption(country);
  await state.waitLoad(count);
};
const pending = async (page, locale) => {
  await expect(page.getByRole('status', { name: locale.ui.working })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('form')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: locale.catalogueAdmin.addTitle, exact: true })).toHaveCount(0);
};
const current = async (page, country) => {
  await expect(page.locator('#admin-catalogue-country')).toHaveValue(country);
  await expect(row(page, country)).toBeVisible();
  await expect(row(page, country === 'SE' ? 'NO' : 'SE')).toHaveCount(0);
};
const clean = (state) => {
  expect(state.unexpectedWrites).toEqual([]);
  expect(state.errors).toEqual([]);
};

test('mounted catalogue reloads restored records on the committed-change notification', async ({ page }) => {
  const state = await setup(page, 'en-GB', en, false);
  await state.releaseLoad(0);
  await current(page, 'SE');
  // Producer commit/rollback behavior is verified separately with real Lite restore.
  await page.evaluate(() => window.dispatchEvent(new Event('partsible:local-data-restored')));
  await state.waitLoad(2);
  await pending(page, en);
  await Promise.all([
    state.release(state.lists[1], { json: [{ product: product('SE', 195), origin: 'local', hidden: false }] }),
    state.release(state.vocabularies[1], { json: vocabulary('SE') }),
  ]);
  await expect(row(page, 'SE', 195)).toBeVisible();
  await expect(row(page, 'SE', 95)).toHaveCount(0);
  expect(state.mutations).toEqual([]);
  clean(state);
});
const startMutation = async (page, locale, country, operation) => {
  if (operation === 'add') {
    await page.getByRole('button', { name: locale.catalogueAdmin.addTitle, exact: true }).click();
    const form = page.getByRole('form', { name: locale.catalogueAdmin.addTitle });
    await form.getByLabel(locale.catalogueAdmin.type, { exact: true }).selectOption('regel');
    await form.getByLabel(locale.catalogueAdmin.thickness).fill('45');
    await form.getByLabel(locale.catalogueAdmin.width).fill('145');
    await form.getByRole('button', { name: locale.catalogueAdmin.add, exact: true }).click();
  } else if (operation === 'edit') {
    await row(page, country).getByRole('button', { name: locale.catalogueAdmin.edit, exact: true }).click();
    const form = page.getByRole('form', { name: locale.catalogueAdmin.editTitle });
    await form.getByLabel(locale.catalogueAdmin.lengths).fill('3600');
    await form.getByRole('button', { name: locale.catalogueAdmin.save, exact: true }).click();
  } else {
    const width = operation === 'restore' ? 70 : operation === 'revert' ? 120 : 95;
    const label = operation === 'delete' ? locale.ui.delete : locale.catalogueAdmin[operation];
    await row(page, country, width).getByRole('button', { name: label, exact: true }).click();
    if (operation === 'delete' || operation === 'revert') {
      await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click();
    }
  }
};

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    const label = `${language}, ${dark ? 'dark' : 'light'}`;
    for (const order of ['old-first', 'new-first']) {
      for (const endpoint of ['list', 'vocabulary']) {
        for (const failure of [false, true]) {
          test(`catalogue load identity: ${label}, ${order}, obsolete ${endpoint} ${failure ? 'failure' : 'success'}`, async ({ page }) => {
            const state = await setup(page, language, locale, dark);
            await switchCountry(page, state, 'NO', 2);
            if (order === 'old-first') {
              await state.releaseLoad(0, failure ? endpoint : null);
              await pending(page, locale);
              await expect(page.getByRole('alert')).toHaveCount(0);
              await state.releaseLoad(1);
            } else {
              await state.releaseLoad(1);
              await current(page, 'NO');
              await state.releaseLoad(0, failure ? endpoint : null);
            }
            await current(page, 'NO');
            await expect(page.getByRole('alert')).toHaveCount(0);
            clean(state);
          });
        }
      }
    }
    for (const panel of ['add', 'edit', 'suggest']) {
      test(`catalogue completed context retirement: ${label}, ${panel}`, async ({ page }) => {
        const state = await setup(page, language, locale, dark);
        await state.releaseLoad(0);
        await current(page, 'SE');
        if (panel === 'add') await page.getByRole('button', { name: locale.catalogueAdmin.addTitle, exact: true }).click();
        else await row(page, 'SE').getByRole('button', { name: locale.catalogueAdmin[panel], exact: true }).click();
        await expect(page.getByRole('form')).toBeVisible();
        await switchCountry(page, state, 'NO', 2);
        await pending(page, locale);
        await switchCountry(page, state, 'SE', 3);
        await pending(page, locale);
        await state.releaseLoad(2);
        await state.releaseLoad(1);
        await current(page, 'SE');
        await expect(page.getByRole('form')).toHaveCount(0);
        expect(state.mutations).toEqual([]);
        clean(state);
      });
    }
    for (const country of ['SE', 'NO']) {
      test(`catalogue mutation targets: ${label}, ${country}`, async ({ page }) => {
        const state = await setup(page, language, locale, dark);
        await state.releaseLoad(0);
        if (country === 'NO') {
          await switchCountry(page, state, country, 2);
          await state.releaseLoad(1);
        }
        for (const operation of ['add', 'edit', 'hide', 'restore', 'delete', 'revert']) {
          const count = state.mutations.length;
          await startMutation(page, locale, country, operation);
          await expect.poll(() => state.mutations.length).toBe(count + 1);
          const ticket = state.mutations[count];
          expect(ticket.country).toBe(country);
          expect(ticket.method).toBe({ add: 'POST', edit: 'PUT', hide: 'POST', restore: 'POST', delete: 'DELETE', revert: 'DELETE' }[operation]);
          const width = operation === 'restore' ? 70 : operation === 'revert' ? 120 : 95;
          const suffix = operation === 'hide' || operation === 'restore' ? `/${operation}` : '';
          expect(decodeURIComponent(ticket.path)).toBe(`/api/admin/catalogue${operation === 'add' ? '' : `/local:regel:45x${width}${suffix}`}`);
          if (operation === 'add') expect(ticket.body.width).toBe(145);
          if (operation === 'edit') expect(ticket.body.lengths).toEqual([3600]);
          const loads = state.lists.length;
          await state.release(ticket, { json: {} });
          await state.waitLoad(loads + 1);
          expect(state.lists[loads].country).toBe(country);
          expect(state.vocabularies[loads].country).toBe(country);
          await state.releaseLoad(loads);
          await current(page, country);
        }
        clean(state);
      });
    }
    for (const order of ['old-first', 'new-first']) {
      for (const failure of [false, true]) {
        test(`catalogue mutation completion identity: ${label}, ${order}, obsolete ${failure ? 'failure' : 'success'}`, async ({ page }) => {
          const state = await setup(page, language, locale, dark);
          await state.releaseLoad(0);
          await startMutation(page, locale, 'SE', 'hide');
          await expect.poll(() => state.mutations.length).toBe(1);
          await switchCountry(page, state, 'NO', 2);
          await state.releaseLoad(1);
          await startMutation(page, locale, 'NO', 'hide');
          await expect.poll(() => state.mutations.length).toBe(2);
          const obsolete = () => state.release(state.mutations[0], failure
            ? { status: 503, json: { detail: 'Obsolete mutation failed' } } : { json: {} });
          if (order === 'old-first') {
            await obsolete();
            expect(state.lists).toHaveLength(2);
            await expect(row(page, 'NO').getByRole('button', { name: locale.catalogueAdmin.hide, exact: true })).toBeDisabled();
          }
          await state.release(state.mutations[1], { json: {} });
          await state.waitLoad(3);
          await state.releaseLoad(2);
          await row(page, 'NO').getByRole('button', { name: locale.catalogueAdmin.edit, exact: true }).click();
          if (order === 'new-first') await obsolete();
          await expect(page.getByRole('form', { name: locale.catalogueAdmin.editTitle })).toBeVisible();
          await expect(page.getByRole('alert')).toHaveCount(0);
          expect(state.lists).toHaveLength(3);
          await current(page, 'NO');
          clean(state);
        });
      }
    }
    test(`catalogue current edit failure and retry: ${label}`, async ({ page }) => {
      const state = await setup(page, language, locale, dark);
      await state.releaseLoad(0);
      await startMutation(page, locale, 'SE', 'edit');
      await expect.poll(() => state.mutations.length).toBe(1);
      await state.release(state.mutations[0], { status: 503, json: { detail: 'Current edit failed' } });
      const form = page.getByRole('form', { name: locale.catalogueAdmin.editTitle });
      await expect(form.getByRole('alert')).toHaveText('Current edit failed');
      await expect(form.getByLabel(locale.catalogueAdmin.lengths)).toHaveValue('3600');
      await form.getByRole('button', { name: locale.catalogueAdmin.save, exact: true }).click();
      await expect.poll(() => state.mutations.length).toBe(2);
      expect(state.mutations[1].country).toBe('SE');
      expect(state.mutations[1].body.lengths).toEqual([3600]);
      await state.release(state.mutations[1], { json: {} });
      await state.waitLoad(2);
      await state.releaseLoad(1);
      await expect(page.getByRole('form')).toHaveCount(0);
      await current(page, 'SE');
      clean(state);
    });
  }
}
