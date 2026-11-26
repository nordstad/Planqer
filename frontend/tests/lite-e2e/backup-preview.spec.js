import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import en from '../../src/i18n/locales/en-GB.js';
import sv from '../../src/i18n/locales/sv-SE.js';
import nb from '../../src/i18n/locales/nb-NO.js';

const fixture = JSON.parse(readFileSync(new URL('../contract/backup.json', import.meta.url), 'utf8'));

// Every Playwright test has a fresh browser context. These helpers only touch
// synthetic work in that context's Lite database, never an existing profile.
const database = async (page, operation, stores = {}) => page.evaluate(async ({ operation, stores }) => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('partsible');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const names = operation === 'read' ? [...db.objectStoreNames] : Object.keys(stores);
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(names, operation === 'read' ? 'readonly' : 'readwrite');
      const result = {};
      for (const name of names) {
        const store = tx.objectStore(name);
        if (operation === 'read') store.getAll().onsuccess = (event) => { result[name] = event.target.result; };
        else for (const record of stores[name]) store.put(record);
      }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}, { operation, stores });

const start = async (page) => {
  await page.goto('/#/dashboard');
  await expect(page.getByRole('heading', { name: 'Backup', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await expect(page.getByText(/^Storage:/)).toBeVisible({ timeout: 120000 });
  // Initial locale persistence is an ordinary startup write, not an import.
  // Finish it before seeding synthetic work or measuring no-write guarantees.
  await expect.poll(async () => (await database(page, 'read')).settings[0]?.preferred_language)
    .toBe('en-GB');
};

const choose = (page, backup = fixture, name = 'backup.json') => page.getByLabel('Backup file', { exact: true })
  .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });

test('Backup stays secondary with empty and many projects, and fresh or overdue exports', async ({ page }) => {
  await start(page);
  const panel = page.getByRole('region', { name: 'Backup', exact: true });
  const toggle = panel.getByRole('button', { name: 'Backup', exact: true });
  await toggle.click();
  await expect(panel.getByRole('note')).toHaveCount(0);
  const groups = Array.from({ length: 12 }, (_, index) => ({
    ...fixture.stores.groups[0], id: `synthetic-${index}`, name: `Workshop project ${index + 1}`,
  }));
  await database(page, 'write', { groups });
  await page.evaluate(() => localStorage.setItem('partsible.lite.lastExported', new Date().toISOString()));
  await page.reload();
  await expect(page.locator('.proj-card')).toHaveCount(12);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.getByRole('note')).toHaveCount(0);
  expect(await panel.evaluate((element) => [...document.querySelectorAll('.proj-card')]
    .every((project) => project.getBoundingClientRect().bottom <= element.getBoundingClientRect().top))).toBe(true);
  await toggle.click();
  await expect(panel.getByText(/^Last exported:/)).toBeVisible();
  await page.evaluate(() => localStorage.setItem('partsible.lite.lastExported',
    new Date(Date.now() - 31 * 86400000).toISOString()));
  await page.reload();
  await expect(panel.getByRole('note')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await database(page, 'read')).groups).toEqual(expect.arrayContaining(groups));
});

test('Backup disclosure preserves warnings, cancels approval, and works on Projects and Defaults', async ({ page, browserName }) => {
  await start(page);
  await database(page, 'write', fixture.stores);
  await page.reload();
  const toggle = page.getByRole('button', { name: 'Backup', exact: true });
  const panel = page.getByRole('region', { name: 'Backup', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.getByRole('note')).toBeVisible();
  await expect(panel.getByText(/^Storage:/)).toBeVisible();
  await expect.poll(async () => (await database(page, 'read')).settings[0]?.preferred_language)
    .toBe('en-GB');
  const before = await database(page, 'read');
  // Safari on macOS uses Option-Tab to include buttons in keyboard navigation.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await toggle.focus();
  await page.keyboard.press(tab);
  expect(await page.locator('#lite-backup-content').evaluate((element) => element.contains(document.activeElement))).toBe(false);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press(tab);
  await expect(page.getByRole('button', { name: 'Export backup' })).toBeFocused();
  await choose(page);
  const review = page.getByRole('region', { name: 'Review backup restore' });
  await expect(review).toBeVisible({ timeout: 120000 });
  await expect(review.getByRole('heading')).toBeFocused();
  await review.getByRole('checkbox').check();
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(panel.getByRole('note')).toBeVisible();
  await toggle.click();
  await expect(review).toHaveCount(0);
  await choose(page);
  await expect(review).toBeVisible();
  await expect(review.getByRole('checkbox')).not.toBeChecked();
  await expect(review.getByRole('button', { name: 'Replace and restore' })).toBeDisabled();
  await toggle.click();
  expect(await database(page, 'read')).toEqual(before);
  await page.getByRole('button', { name: 'Defaults', exact: true }).click();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Import backup' })).toBeVisible();
});

test('all-store replacement requires review and approval; cancel writes nothing; success preserves unrelated work', async ({ page }) => {
  await start(page);
  const initial = structuredClone(fixture.stores);
  for (const records of Object.values(initial)) for (const record of records) if (record.name) record.name = `Current ${record.name}`;
  initial.groups.push({ ...initial.groups[0], id: 'unrelated', name: 'Unrelated work' });
  await database(page, 'write', initial);
  const before = await database(page, 'read');
  await choose(page);
  const review = page.getByRole('region', { name: 'Review backup restore' });
  await expect(review).toBeVisible({ timeout: 120000 });
  await expect(review.getByText('Add: 0 · Replace: 7')).toBeVisible();
  await expect(review.getByRole('button', { name: 'Replace and restore' })).toBeDisabled();
  for (const detail of await review.locator('details').all()) await detail.locator('summary').click();
  await expect(review.getByText('Currently: Current Named shelves', { exact: true })).toBeVisible();
  expect(await database(page, 'read')).toEqual(before);
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(review).toHaveCount(0);
  expect(await database(page, 'read')).toEqual(before);
  await choose(page);
  await expect(review).toBeVisible();
  await review.getByRole('checkbox').check();
  await review.getByRole('button', { name: 'Replace and restore' }).click();
  await expect(page.getByText('Restored 4 plans and 1 projects.')).toBeVisible();
  await expect(page.locator('.proj-card')).toHaveCount(2);
  await expect(page.locator('.proj-card').filter({ hasText: fixture.stores.groups[0].name })).toBeVisible();
  await expect(page.locator('.proj-card').filter({ hasText: 'Unrelated work' })).toBeVisible();
  const after = await database(page, 'read');
  for (const [store, records] of Object.entries(fixture.stores)) {
    for (const record of records) expect(after[store]).toContainEqual(record);
  }
  expect(after.groups).toContainEqual(initial.groups.at(-1));
});

test('a second tab changing a referenced group requires a new preview and new confirmation', async ({ page, context }) => {
  await start(page);
  await database(page, 'write', fixture.stores);
  const partial = { ...fixture, stores: { projects: fixture.stores.projects } };
  await choose(page, partial);
  const review = page.getByRole('region', { name: 'Review backup restore' });
  await expect(review).toBeVisible({ timeout: 120000 });
  await review.getByRole('checkbox').check();
  const other = await context.newPage();
  await other.goto('/');
  await database(other, 'write', { groups: [{ ...fixture.stores.groups[0], name: 'Changed in another tab' }] });
  const before = await database(page, 'read');
  await review.getByRole('button', { name: 'Replace and restore' }).click();
  await expect(page.getByText(/Saved work changed after this preview/)).toBeVisible();
  expect(await database(page, 'read')).toEqual(before);
  await expect(review).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview again' }).click();
  await expect(review).toBeVisible();
  await expect(review.getByRole('checkbox')).not.toBeChecked();
  await expect(review.getByRole('button', { name: 'Replace and restore' })).toBeDisabled();
});

test('changing the selected file retires the previous replacement approval', async ({ page }) => {
  await start(page);
  await database(page, 'write', fixture.stores);
  await choose(page);
  const review = page.getByRole('region', { name: 'Review backup restore' });
  await expect(review).toBeVisible({ timeout: 120000 });
  await review.getByRole('checkbox').check();
  const before = await database(page, 'read');
  await choose(page, fixture, 'different-backup.json');
  await expect(review.getByText('different-backup.json')).toBeVisible();
  await expect(review.getByRole('checkbox')).not.toBeChecked();
  expect(await database(page, 'read')).toEqual(before);
});

test('an additions-only restore still needs an explicit action; empty files stay read-only', async ({ page }) => {
  await start(page);
  const before = await database(page, 'read');
  await choose(page, { ...fixture, stores: { groups: fixture.stores.groups } });
  const review = page.getByRole('region', { name: 'Review backup restore' });
  await expect(review).toBeVisible({ timeout: 120000 });
  await expect(review.getByText('Add: 1 · Replace: 0')).toBeVisible();
  await expect(review.getByRole('checkbox')).toHaveCount(0);
  expect(await database(page, 'read')).toEqual(before);
  await review.getByRole('button', { name: 'Restore backup', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Restored 0 plans and 1 projects.')).toBeVisible();
  expect((await database(page, 'read')).groups).toContainEqual(fixture.stores.groups[0]);
  const after = await database(page, 'read');
  await choose(page, { ...fixture, stores: {} });
  await expect(review.getByText('This backup contains no records to restore.')).toBeVisible();
  await expect(review.getByRole('button', { name: 'Restore backup', exact: true })).toBeDisabled();
  expect(await database(page, 'read')).toEqual(after);
});

test('an injected native write failure rolls back the approved restore and requires a new preview', async ({ page }) => {
  await start(page);
  await database(page, 'write', fixture.stores);
  await choose(page);
  const review = page.getByRole('region', { name: 'Review backup restore' });
  await expect(review).toBeVisible({ timeout: 120000 });
  const before = await database(page, 'read');
  await review.getByRole('checkbox').check();
  await page.evaluate(() => {
    window.__backupOriginalPut = IDBObjectStore.prototype.put;
    let writes = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === 'partsible' && ++writes === 4) {
        throw new DOMException('Injected test failure', 'QuotaExceededError');
      }
      return window.__backupOriginalPut.apply(this, args);
    };
  });
  try {
    await review.getByRole('button', { name: 'Replace and restore' }).click();
    await expect(page.getByText('Could not import the backup.')).toBeVisible();
  } finally {
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = window.__backupOriginalPut;
      delete window.__backupOriginalPut;
    });
  }
  expect(await database(page, 'read')).toEqual(before);
  await expect(review).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview again' }).click();
  await expect(review.getByRole('checkbox')).not.toBeChecked();
  await expect(review.getByRole('button', { name: 'Replace and restore' })).toBeDisabled();
});

for (const [language, locale] of [['en-GB', en], ['sv-SE', sv], ['nb-NO', nb]]) {
  for (const dark of [false, true]) {
    test(`preview remains usable with long names: ${language}, ${dark ? 'night' : 'day'}`, async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium', 'Locale/theme/width matrix; behavior is covered on all three engines above.');
      await page.addInitScript(({ language, dark }) => {
        localStorage.setItem('partsible_language', language);
        localStorage.setItem('darkMode', JSON.stringify(dark));
      }, { language, dark });
      await page.goto('/#/dashboard');
      const copy = locale.lite.backup;
      await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
      await expect.poll(async () => (await database(page, 'read')).settings[0]?.preferred_language).toBe(language);
      const group = { ...fixture.stores.groups[0], name: 'Existing project' };
      await database(page, 'write', { groups: [group] });
      await page.reload();
      const panel = page.getByRole('region', { name: copy.title, exact: true });
      const toggle = panel.getByRole('button', { name: copy.title, exact: true });
      await expect(panel.getByRole('note')).toBeVisible();
      for (const width of [1440, 1280, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(panel.getByRole('button', { name: copy.export })).toHaveCount(0);
        expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `Collapsed backup fits ${width}px`).toBe(true);
        expect((await panel.boundingBox()).height, `Collapsed backup remains compact at ${width}px`).toBeLessThan(width >= 768 ? 150 : 260);
        await panel.screenshot({ path: testInfo.outputPath(`backup-collapsed-${width}.png`) });
      }
      await toggle.click();
      for (const width of [1440, 1280, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `Expanded backup fits ${width}px`).toBe(true);
        await expect(panel.getByRole('button', { name: copy.export })).toBeVisible();
        await expect(panel.getByRole('button', { name: copy.import })).toBeVisible();
        await panel.screenshot({ path: testInfo.outputPath(`backup-expanded-${width}.png`) });
      }
      const incoming = { ...fixture, stores: { groups: [{ ...group, name: 'Long project name Å æ Ø '.repeat(7) }] } };
      await page.getByLabel(copy.fileLabel, { exact: true }).setInputFiles({
        name: `${'long-backup-file-'.repeat(12)}.json`,
        mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)),
      });
      const review = page.getByRole('region', { name: copy.previewTitle });
      await expect(review).toBeVisible({ timeout: 120000 });
      await review.locator('summary').click();
      await expect(review.getByRole('button', { name: copy.restoreReplace })).toBeDisabled();
      for (const width of [1440, 1280, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await review.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `Preview fits ${width}px`).toBe(true);
        await expect(review.getByRole('checkbox')).toBeVisible();
        await expect(review.getByRole('button', { name: copy.restoreReplace })).toBeVisible();
        if (language === 'en-GB' && ((dark && width === 390) || (!dark && width === 1440))) {
          await review.screenshot({ path: testInfo.outputPath(`backup-preview-${width}.png`) });
        }
      }
      await review.getByRole('checkbox').focus();
      await page.keyboard.press('Space');
      await expect(review.getByRole('button', { name: copy.restoreReplace })).toBeEnabled();
      await page.keyboard.press('Tab');
      await expect(review.getByRole('button', { name: locale.ui.cancel, exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      expect((await database(page, 'read')).groups).toEqual([group]);
    });
  }
}
