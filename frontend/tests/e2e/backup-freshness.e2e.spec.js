import { test, expect } from '@playwright/test';

test('native transactions reject stale previews across all stores and retained group references', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { needs_setup: false } }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { openDatabase, STORES } = await import('/src/runtime/indexedDb.js');
    const { previewBackup, importBackup, exportBackup } = await import('/src/runtime/backup.js');
    const name = `partsible-freshness-test-${crypto.randomUUID()}`;
    const db = await openDatabase({ name });
    const other = await openDatabase({ name });
    const valid = async () => ({ status: 200 }); // Sparse transaction fixtures only.
    const file = (stores) => ({ app: 'partsible-lite', format: 1, stores });
    const failures = [];
    try {
      for (const store of STORES) {
        for (const mode of ['edit', 'delete', 'create']) {
          const id = `${store}-${mode}`;
          if (mode !== 'create') await db.put(store, { id, name: 'Original' });
          const preview = await previewBackup(db, file({ [store]: [{ id, name: 'From backup' }] }), valid);
          if (mode === 'delete') await other.delete(store, id);
          else await other.put(store, { id, name: 'Other tab', metadata: { revision: 2 } });
          const before = (await exportBackup(db)).stores;
          let code = null;
          try { await importBackup(db, preview, { replaceExisting: true }); }
          catch (error) { code = error.code; }
          failures.push({ store, mode, code, unchanged: JSON.stringify((await exportBackup(db)).stores) === JSON.stringify(before) });
        }
      }
      await db.put('groups', { id: 'retained', name: 'Referenced group' });
      const preview = await previewBackup(db, file({ projects: [{ id: 'linked', project_group_id: 'retained' }] }), valid);
      // Do not await the delete: the conditional write must wait behind this
      // already-queued transaction and check the group under its own lock.
      const deletion = other.delete('groups', 'retained');
      let stale = null;
      try { await importBackup(db, preview); }
      catch (error) { stale = error.code; }
      await deletion;
      const linked = await db.get('projects', 'linked');

      const approved = await previewBackup(db, file({ projects: [{ id: 'approved', name: 'Import' }] }), valid);
      await other.put('groups', { id: 'unrelated', name: 'New unrelated work' });
      await importBackup(db, approved);
      return { failures, stale, linked: linked ?? null, unrelated: await db.get('groups', 'unrelated') };
    } finally {
      db.close();
      other.close();
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
    }
  });
  expect(result.failures).toHaveLength(21);
  for (const entry of result.failures) expect(entry, `${entry.store}/${entry.mode}`).toMatchObject({ code: 'stale', unchanged: true });
  expect(result.stale).toBe('stale');
  expect(result.linked).toBeNull();
  expect(result.unrelated.name).toBe('New unrelated work');
});

test('two concurrent approvals cannot overwrite changes made by the first restore', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { needs_setup: false } }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { openDatabase } = await import('/src/runtime/indexedDb.js');
    const { previewBackup, importBackup } = await import('/src/runtime/backup.js');
    const name = `partsible-preview-race-${crypto.randomUUID()}`;
    const db = await openDatabase({ name });
    const other = await openDatabase({ name });
    const valid = async () => ({ status: 200 });
    const file = (value) => ({ app: 'partsible-lite', format: 1, stores: { groups: [{ id: 'g', name: value }] } });
    try {
      await db.put('groups', { id: 'g', name: 'Original' });
      const first = await previewBackup(db, file('First restore'), valid);
      const second = await previewBackup(other, file('Second restore'), valid);
      const results = await Promise.allSettled([
        importBackup(db, first, { replaceExisting: true }),
        importBackup(other, second, { replaceExisting: true }),
      ]);
      return {
        statuses: results.map((result) => result.status),
        code: results[1].reason?.code,
        saved: await db.get('groups', 'g'),
      };
    } finally {
      db.close();
      other.close();
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
    }
  });
  expect(result.statuses).toEqual(['fulfilled', 'rejected']);
  expect(result.code).toBe('stale');
  expect(result.saved.name).toBe('First restore');
});
