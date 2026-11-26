import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const fixture = JSON.parse(readFileSync(new URL('../contract/backup.json', import.meta.url), 'utf8'));

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const python = join(root, 'backend/.venv/bin/python');
const runtimeDir = join(root, 'build/pyodide/runtime');
let bundleDir;
let bundle;

test.beforeAll(() => {
  execFileSync(python, [join(root, 'scripts/fetch-pyodide-runtime.py'), '--out', runtimeDir]);
  bundleDir = mkdtempSync(join(tmpdir(), 'partsible-backup-validation-'));
  bundle = execFileSync(python, [join(root, 'scripts/build-pyodide-bundle.py'), '--out', bundleDir], { encoding: 'utf8' })
    .trim().replace(/ \(\d+ KB\)$/, '');
});

test.afterAll(() => {
  if (bundleDir) rmSync(bundleDir, { recursive: true });
});

test('validates real saved records in the worker before native IndexedDB writes', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/api/**', (route) => route.fulfill({ json: { needs_setup: false } }));
  // Serve only the pinned runtime and this checkout's freshly built bundle.
  await page.route('**/pyodide/**', (route) => {
    const path = new URL(route.request().url()).pathname.split('/pyodide/')[1];
    if (path === 'bundle.zip') return route.fulfill({ path: bundle });
    if (path.startsWith('runtime/') && !path.includes('..')) {
      return route.fulfill({ path: join(runtimeDir, path.slice('runtime/'.length)) });
    }
    return route.abort();
  });
  await page.goto('/');
  const result = await page.evaluate(async (backup) => {
    const { openDatabase } = await import('/src/runtime/indexedDb.js');
    const { importBackup, exportBackup } = await import('/src/runtime/backup.js');
    const name = `partsible-validation-test-${crypto.randomUUID()}`;
    let db = await openDatabase({ name });
    const failures = [];
    try {
      // No stub validator: this boots the real worker/Pyodide operation.
      await importBackup(db, JSON.stringify(backup));
      await db.put('groups', { id: 'keep', name: 'Unrelated work' });
      const before = (await exportBackup(db)).stores;
      const changes = [
        ['projects', 'parts_data', [{ length: 600, quantity: 1.5 }]],
        ['sheet_projects', 'optimization_result', { sheets: 'bad' }],
        ['tile_projects', 'layout_result', { tiles: [null] }],
        ['wallpaper_projects', 'room_data', { walls: 'bad' }],
        ['groups', 'name', {}],
        ['settings', 'default_board_lengths', null],
        ['catalogue_entries', 'data', 'not JSON'],
      ];
      const rejected = async (incoming, label) => {
        let code = null;
        try { await importBackup(db, JSON.stringify(incoming)); }
        catch (error) { code = error.code; }
        const unchanged = JSON.stringify((await exportBackup(db)).stores) === JSON.stringify(before);
        failures.push({ label, code, unchanged });
      };
      for (const [store, field, value] of changes) {
        const incoming = structuredClone(backup);
        incoming.stores.groups[0].name = 'Must not replace';
        incoming.stores[store][0][field] = value;
        await rejected(incoming, `shape: ${store}`);
      }
      for (const store of Object.keys(backup.stores)) {
        const incoming = structuredClone(backup);
        incoming.stores[store].push(structuredClone(incoming.stores[store][0]));
        await rejected(incoming, `duplicate: ${store}`);
      }
      for (const store of ['projects', 'sheet_projects', 'tile_projects', 'wallpaper_projects']) {
        const incoming = structuredClone(backup);
        incoming.stores[store][0].project_group_id = crypto.randomUUID();
        await rejected(incoming, `missing group: ${store}`);
      }
      const partial = structuredClone(backup);
      partial.stores = { projects: partial.stores.projects };
      partial.stores.projects[0].name = 'Valid replacement with retained group';
      await importBackup(db, JSON.stringify(partial));
      db.close();
      db = await openDatabase({ name });
      return { failures, records: (await exportBackup(db)).stores };
    } finally {
      db.close();
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
    }
  }, fixture);
  expect(result.failures).toHaveLength(18);
  for (const failure of result.failures) {
    expect(failure, failure.label).toEqual({ label: failure.label, code: 'invalid', unchanged: true });
  }
  expect(result.records.projects[0]).toEqual({
    ...fixture.stores.projects[0], name: 'Valid replacement with retained group',
  });
  expect(result.records.groups).toContainEqual({ id: 'keep', name: 'Unrelated work' });
  for (const store of Object.keys(fixture.stores).filter((store) => !['projects', 'groups'].includes(store))) {
    expect(result.records[store]).toEqual(fixture.stores[store]);
  }
});
