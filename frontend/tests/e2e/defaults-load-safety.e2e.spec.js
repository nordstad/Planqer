import { test, expect } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const defaults = (language) => ({
  default_board_lengths: [4200, 5400], default_saw_blade_width: 2.5,
  default_currency: 'EUR', default_vat_rate: 20, default_prices_include_vat: false,
  preferred_language: language, spare_margin_percent: 5, catalogue_country: 'SE',
});
const setup = async (page, language, locale, dark) => {
  const reads = [];
  const writes = [];
  const unexpectedWrites = [];
  const errors = [];
  let holdSettings = false;
  let bootstrapReads = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/, '');
    const method = request.method();
    const hold = async (queue) => {
      const ticket = { request, body: request.postDataJSON() };
      const reply = new Promise((resolve) => { ticket.resolve = resolve; });
      queue.push(ticket);
      const response = await reply;
      return response.abort ? route.abort('failed') : route.fulfill(response);
    };
    if (path === '/api/settings') {
      if (method === 'PUT') return hold(writes);
      if (method === 'GET') {
        if (holdSettings) return hold(reads);
        bootstrapReads += 1;
        return route.fulfill({ json: defaults(language) });
      }
    }
    if (method !== 'GET') {
      unexpectedWrites.push(`${method} ${path}`);
      return route.fulfill({ status: 503, json: {} });
    }
    if (path.endsWith('/auth/setup-status')) return route.fulfill({ json: { single_user: true, needs_setup: false } });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'synthetic-user', email: 'test@example.invalid' } });
    return route.fulfill({ json: [] });
  });
  const release = async (ticket, reply) => {
    const received = reply.abort
      ? page.waitForEvent('requestfailed', (request) => request === ticket.request)
      : page.waitForResponse((response) => response.request() === ticket.request);
    ticket.resolve(reply);
    const response = await received;
    if (!reply.abort) await response.finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await page.goto('/dashboard');
  await expect(page.locator('#language-select')).toHaveValue(language);
  // Auth preference sync and the projects overview each read settings.
  await expect.poll(() => bootstrapReads).toBe(2);
  if (dark) await page.getByRole('button', { name: locale.common.nightEdition }).click();
  holdSettings = true;
  await page.getByRole('button', { name: locale.common.defaults, exact: true }).click();
  await expect.poll(() => reads.length).toBe(1);
  const reopen = async (count) => {
    const previousReads = bootstrapReads;
    holdSettings = false;
    await page.getByRole('button', { name: locale.common.myProjects, exact: true }).click();
    await expect.poll(() => bootstrapReads).toBe(previousReads + 1);
    holdSettings = true;
    await page.getByRole('button', { name: locale.common.defaults, exact: true }).click();
    await expect.poll(() => reads.length).toBe(count);
  };
  return { reads, writes, release, reopen, unexpectedWrites, errors };
};
const expectLocked = async (page, locale) => {
  await expect(page.locator('#board-lengths')).toHaveCount(0);
  await expect(page.getByRole('button', { name: locale.common.saveSettings, exact: true })).toHaveCount(0);
};
const pending = async (page, locale) => {
  await expectLocked(page, locale);
  await expect(page.getByRole('status', { name: locale.ui.working })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
};
const expectDefaults = async (page, language, lengths = '4200, 5400') => {
  await expect(page.locator('#board-lengths')).toHaveValue(lengths);
  await expect(page.locator('#kerf')).toHaveValue('2.5');
  await expect(page.locator('#currency')).toHaveValue('EUR');
  await expect(page.locator('#vat-rate')).toHaveValue('20');
  await expect(page.locator('form input[type=checkbox]')).not.toBeChecked();
  await expect(page.locator('#spare-margin')).toHaveValue('5');
  await expect(page.locator('#settings-language')).toHaveValue(language);
  await expect(page.locator('#settings-catalogue')).toHaveValue('SE');
};
const clean = (state) => {
  expect(state.unexpectedWrites).toEqual([]);
  expect(state.errors).toEqual([]);
};

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    const label = `${language}, ${dark ? 'dark' : 'light'}`;
    for (const failure of ['server', 'access', 'network']) {
      test(`Defaults failed-load safety and recovery: ${label}, ${failure}`, async ({ page }) => {
        const state = await setup(page, language, locale, dark);
        await pending(page, locale);
        await state.release(state.reads[0], failure === 'network' ? { abort: true } : {
          status: failure === 'access' ? 403 : 503, json: { detail: 'Synthetic load failed' },
        });
        await expect(page.getByRole('alert')).toContainText(locale.settings.loadError.split('{{message}}')[0]);
        // Try direct form submission if a fallback form has accidentally survived.
        await page.evaluate(() => document.getElementById('board-lengths')?.form?.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        ));
        await expectLocked(page, locale);
        expect(state.writes).toEqual([]);
        await page.getByRole('button', { name: locale.settings.retryLoad, exact: true }).click();
        await expect.poll(() => state.reads.length).toBe(2);
        await pending(page, locale);
        expect(state.writes).toEqual([]);
        await state.release(state.reads[1], { json: defaults(language) });
        await expectDefaults(page, language);
        await page.getByRole('button', { name: locale.common.saveSettings, exact: true }).click();
        await expect.poll(() => state.writes.length).toBe(1);
        expect(state.writes[0].body).toEqual(defaults(language));
        await state.release(state.writes[0], { json: defaults(language) });
        await expect(page.getByRole('status')).toHaveText(locale.common.settingsSaved);
        clean(state);
      });
    }

    test(`Defaults current save failure retains draft and retries: ${label}`, async ({ page }) => {
      const state = await setup(page, language, locale, dark);
      await state.release(state.reads[0], { json: defaults(language) });
      await page.locator('#board-lengths').fill('4800, 6000');
      await page.getByRole('button', { name: locale.common.saveSettings, exact: true }).click();
      await expect.poll(() => state.writes.length).toBe(1);
      await expect(page.getByRole('button', { name: locale.common.saving, exact: true })).toBeDisabled();
      await page.locator('form').evaluate((form) => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(state.writes).toHaveLength(1);
      await state.release(state.writes[0], { status: 503, json: { detail: 'Synthetic save failed' } });
      await expect(page.getByRole('alert')).toContainText('Synthetic save failed');
      await expectDefaults(page, language, '4800, 6000');
      await page.getByRole('button', { name: locale.common.saveSettings, exact: true }).click();
      await expect.poll(() => state.writes.length).toBe(2);
      expect(state.writes[1].body).toEqual({ ...defaults(language), default_board_lengths: [4800, 6000] });
      await state.release(state.writes[1], { json: state.writes[1].body });
      await expect(page.getByRole('status')).toHaveText(locale.common.settingsSaved);
      clean(state);
    });

    for (const order of ['old-first', 'new-first']) {
      for (const failure of [false, true]) {
        test(`Defaults obsolete load: ${label}, ${order}, ${failure ? 'failure' : 'success'}`, async ({ page }) => {
          const state = await setup(page, language, locale, dark);
          await state.reopen(2);
          const obsolete = () => state.release(state.reads[0], failure
            ? { status: 503, json: { detail: 'Obsolete load failed' } }
            : { json: { ...defaults(language), default_board_lengths: [9900] } });
          if (order === 'old-first') {
            await obsolete();
            await pending(page, locale);
            await state.release(state.reads[1], { json: defaults(language) });
          } else {
            await state.release(state.reads[1], { json: defaults(language) });
            await page.locator('#board-lengths').fill('6600');
            await obsolete();
          }
          await expectDefaults(page, language, order === 'new-first' ? '6600' : '4200, 5400');
          await expect(page.getByRole('alert')).toHaveCount(0);
          expect(state.writes).toEqual([]);
          clean(state);
        });

        test(`Defaults obsolete save: ${label}, ${order}, ${failure ? 'failure' : 'success'}`, async ({ page }) => {
          const state = await setup(page, language, locale, dark);
          await state.release(state.reads[0], { json: defaults(language) });
          await page.locator('#settings-language').selectOption(language === 'en-GB' ? 'sv-SE' : 'en-GB');
          await page.locator('#settings-catalogue').selectOption('NO');
          await page.getByRole('button', { name: locale.common.saveSettings, exact: true }).click();
          await expect.poll(() => state.writes.length).toBe(1);
          await state.reopen(2);
          await state.release(state.reads[1], { json: defaults(language) });
          await page.getByRole('button', { name: locale.common.saveSettings, exact: true }).click();
          await expect.poll(() => state.writes.length).toBe(2);
          const obsolete = () => state.release(state.writes[0], failure
            ? { status: 503, json: { detail: 'Obsolete save failed' } } : { json: state.writes[0].body });
          if (order === 'old-first') {
            await obsolete();
            await expect(page.getByRole('button', { name: locale.common.saving, exact: true })).toBeDisabled();
            await expect(page.getByText(locale.common.settingsSaved, { exact: true })).toHaveCount(0);
          }
          await state.release(state.writes[1], { json: state.writes[1].body });
          await page.locator('#board-lengths').fill('6600');
          if (order === 'new-first') await obsolete();
          await expectDefaults(page, language, '6600');
          await expect(page.locator('#language-select')).toHaveValue(language);
          expect(await page.evaluate(() => localStorage.getItem('partsible-catalogue-country-v1'))).toBe('SE');
          await expect(page.getByRole('alert')).toHaveCount(0);
          await expect(page.getByRole('status')).toHaveText(locale.common.settingsSaved);
          clean(state);
        });
      }
    }
  }
}
