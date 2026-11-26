import { expect, test } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

// Both builds use disposable browser contexts. Every HTTP API request is mocked;
// no real self-hosted account, saved work, or browser profile is accessed.
const origins = { lite: 'http://127.0.0.1:3003', selfHosted: 'http://127.0.0.1:3004' };
const syntheticToken = 'synthetic-dr042-token';
const mockApi = async (page, origin) => {
  const calls = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/') || url.pathname === '/health' || url.origin !== origin) {
      calls.push(url.pathname);
      let body = {};
      if (url.pathname.endsWith('/setup-status')) body = { needs_setup: false, single_user: true };
      else if (url.pathname.endsWith('/auth/me')) body = { id: 'synthetic-user', email: 'synthetic@example.invalid', is_admin: true };
      else if (/\/(projects|project-groups|sheet-projects|tile-projects|wallpaper-projects)\/?$/.test(url.pathname)) body = [];
      else if (url.pathname === '/health') body = { version: '15.1.0' };
      else if (url.hostname === 'api.github.com') body = { tag_name: 'v15.1.0' };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.continue();
  });
  return calls;
};

const denyStorage = ({ kind, token = false, language = 'en-GB', dark = false }) => {
  const storage = window.localStorage;
  const get = Storage.prototype.getItem;
  storage.setItem('partsible_language', language);
  storage.setItem('darkMode', JSON.stringify(dark));
  if (token) storage.setItem('auth_token', 'synthetic-dr042-token');
  window.__readSyntheticToken = () => get.call(storage, 'auth_token');
  if (window.name === 'dr042-allow-storage') return;
  const fail = () => { throw new DOMException('Synthetic preference denial', 'SecurityError'); };
  const keys = token ? ['auth_token'] : ['partsible_language', 'darkMode', 'partsible.lite.bannerDismissed'];
  if (kind === 'localAccessor' || kind === 'sessionAccessor') {
    Object.defineProperty(window, kind === 'localAccessor' ? 'localStorage' : 'sessionStorage', { configurable: true, get: fail });
  } else {
    const method = kind === 'read' ? 'getItem' : kind === 'remove' ? 'removeItem' : 'setItem';
    const original = Storage.prototype[method];
    Storage.prototype[method] = function (key, ...args) {
      if (keys.includes(key)) fail();
      return original.call(this, key, ...args);
    };
  }
};

for (const [mode, origin] of Object.entries(origins)) {
  for (const kind of ['read', 'write', 'localAccessor', 'sessionAccessor']) {
    test(`${mode}: optional preference ${kind} denial does not blank startup or disable controls`, async ({ page }) => {
      const calls = await mockApi(page, origin);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(denyStorage, { kind });
      await page.goto(origin);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.getByRole('combobox', { name: en.common.language }).selectOption('sv-SE');
      await expect(page.locator('html')).toHaveAttribute('lang', 'sv-SE');
      await page.getByRole('button', { name: sv.common.nightEdition }).click();
      await expect(page.locator('html')).toHaveClass(/dark/);
      await page.getByRole('button', { name: sv.common.dayEdition }).click();
      await expect(page.locator('html')).not.toHaveClass(/dark/);
      if (mode === 'lite') {
        const notice = page.getByRole('region', { name: sv.lite.banner.region });
        await expect(notice).toBeVisible();
        await notice.getByRole('button', { name: sv.lite.banner.dismiss }).click();
        await expect(notice).toHaveCount(0);
      } else if (kind === 'localAccessor') {
        await expect(page.getByRole('alert')).toContainText(sv.common.authStorageUnavailable);
        expect(calls.filter((path) => path.startsWith('/api/auth/'))).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }

  test(`${mode}: malformed theme data falls back to the day edition`, async ({ page }) => {
    await mockApi(page, origin);
    await page.addInitScript(() => localStorage.setItem('darkMode', 'not JSON'));
    await page.goto(origin);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: en.common.nightEdition })).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
}

for (const kind of ['read', 'localAccessor']) {
  test(`self-hosted: auth ${kind} denial offers reload recovery without clearing a retained token`, async ({ page }) => {
    const origin = origins.selfHosted;
    const calls = await mockApi(page, origin);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(denyStorage, { kind, token: true });
    await page.goto(`${origin}/dashboard`);
    const notice = page.getByRole('alert');
    await expect(notice.getByRole('heading', { name: en.common.authStorageUnavailable })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Sign in required' })).toHaveCount(0);
    expect(calls.filter((path) => path.startsWith('/api/auth/'))).toEqual([]);
    expect(await page.evaluate(() => window.__readSyntheticToken())).toBe(syntheticToken);
    await page.evaluate(() => { window.name = 'dr042-allow-storage'; });
    await notice.getByRole('button', { name: en.common.authStorageRetry }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'My projects', exact: true })).toBeVisible();
    await expect(notice).toHaveCount(0);
    expect(await page.evaluate(() => window.__readSyntheticToken())).toBe(syntheticToken);
    expect(errors).toEqual([]);
  });
}

test('Lite: denied optional preferences do not replace or alter retained IndexedDB work', async ({ page }) => {
  await mockApi(page, origins.lite);
  await page.addInitScript(denyStorage, { kind: 'localAccessor' });
  await page.goto(`${origins.lite}/#/dashboard`);
  await expect(page.getByRole('heading', { name: 'My projects', exact: true })).toBeVisible();
  const saved = { id: 'synthetic-retained-group', name: 'Synthetic retained project', created_at: '2026-11-27T00:00:00Z' };
  await page.evaluate(async (record) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('partsible');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('groups', 'readwrite');
        tx.objectStore('groups').put(record);
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, saved);
  await page.reload();
  await expect(page.getByRole('link', { name: /Synthetic retained project/ })).toBeVisible();
  await page.getByRole('combobox', { name: en.common.language }).selectOption('nb-NO');
  await page.getByRole('button', { name: nb.common.nightEdition }).click();
  const retained = await page.evaluate(async (id) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('partsible');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('groups').objectStore('groups').get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, saved.id);
  expect(retained).toEqual(saved);
});

test('Lite: unavailable work storage remains an explicit failure, not a temporary database', async ({ page }) => {
  await mockApi(page, origins.lite);
  await page.addInitScript(denyStorage, { kind: 'localAccessor' });
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new DOMException('Synthetic work-storage denial', 'SecurityError'); };
  });
  await page.goto(`${origins.lite}/#/dashboard`);
  await expect(page.getByRole('alert')).toContainText('Synthetic work-storage denial');
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Could not create the backup.');
  await expect(page.getByText('Backup saved to your downloads.')).toHaveCount(0);
});

test('self-hosted: denied token removal never claims a successful sign-out', async ({ page }) => {
  await mockApi(page, origins.selfHosted);
  await page.addInitScript(denyStorage, { kind: 'remove', token: true });
  await page.goto(origins.selfHosted);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(en.common.authStorageUnavailable);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__readSyntheticToken())).toBe(syntheticToken);
});

for (const token of [false, true]) {
  test(`self-hosted: a transient interceptor read denial preserves auth uncertainty (token: ${token})`, async ({ page }) => {
    const calls = await mockApi(page, origins.selfHosted);
    await page.addInitScript((token) => {
      if (token) localStorage.setItem('auth_token', 'synthetic-dr042-token');
      const storage = localStorage;
      const original = Storage.prototype.getItem;
      let reads = 0;
      window.__readSyntheticToken = () => original.call(storage, 'auth_token');
      Storage.prototype.getItem = function (key) {
        if (key === 'auth_token' && ++reads === 2) throw new DOMException('Synthetic one-read denial', 'SecurityError');
        return original.call(this, key);
      };
    }, token);
    await page.goto(`${origins.selfHosted}/dashboard`);
    await expect(page.getByRole('alert')).toContainText(en.common.authStorageUnavailable);
    expect(await page.evaluate(() => window.__readSyntheticToken())).toBe(token ? syntheticToken : null);
    expect(calls.filter((path) => path.startsWith('/api/auth/'))).toEqual([]);
  });
}

for (const [language, copy] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`auth-storage recovery fits ${language}, ${dark ? 'night' : 'day'}`, async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium', 'Locale/theme/width matrix; functional denial/recovery runs on all engines.');
      await mockApi(page, origins.selfHosted);
      await page.addInitScript(denyStorage, { kind: 'read', token: true, language, dark });
      await page.goto(`${origins.selfHosted}/dashboard`);
      const notice = page.getByRole('alert');
      await expect(notice.getByRole('heading', { name: copy.common.authStorageUnavailable })).toBeVisible();
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await notice.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await expect(notice.getByRole('button', { name: copy.common.authStorageRetry })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`auth-storage-${width}.png`), fullPage: true });
      }
    });
  }
}
