import { test, expect } from '@playwright/test';

// Exercise the real import and IndexedDB adapter, never the user's database.
const runImport = async (page, scenario) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { needs_setup: false } }));
  await page.goto('/');
  return page.evaluate(async ({ mode, failAt = 4, subset = false, retry = false }) => {
    const { openDatabase, STORES } = await import('/src/runtime/indexedDb.js');
    const { importBackup, exportBackup, BACKUP_FORMAT } = await import('/src/runtime/backup.js');
    const name = `partsible-atomicity-test-${crypto.randomUUID()}`;
    let db = await openDatabase({ name });
    const originalPut = IDBObjectStore.prototype.put;
    const originalTransaction = IDBDatabase.prototype.transaction;
    const stores = subset ? ['groups', 'projects'] : STORES;
    const incoming = Object.fromEntries(stores.map((store) => [store, [
      { id: 'replace', name: `Incoming ${store}` },
      { id: 'insert', name: `New ${store}` },
    ]]));
    if (mode === 'empty') for (const store of Object.keys(incoming)) delete incoming[store];
    if (mode === 'empty-stores') for (const store of stores) incoming[store] = [];
    let writes = 0;
    let successes = 0;
    let completes = 0;
    let aborts = 0;
    const transactions = [];
    const events = [];
    let failure = null;
    let counts = null;
    try {
      for (const store of STORES) {
        await db.put(store, { id: 'replace', name: `Original ${store}` });
        await db.put(store, { id: 'keep', name: `Unrelated ${store}` });
      }
      const before = (await exportBackup(db)).stores;
      IDBDatabase.prototype.transaction = function (...args) {
        const transaction = originalTransaction.apply(this, args);
        if (this.name === name && args[1] === 'readwrite') {
          transactions.push([...transaction.objectStoreNames].sort());
          transaction.addEventListener('complete', () => { completes += 1; events.push('complete'); });
          transaction.addEventListener('abort', () => { aborts += 1; events.push('abort'); });
        }
        return transaction;
      };
      IDBObjectStore.prototype.put = function (record) {
        if (this.transaction.db.name !== name) return originalPut.call(this, record);
        writes += 1;
        if (mode === 'throw' && writes === failAt) {
          throw new DOMException('Injected write failure', 'QuotaExceededError');
        }
        if (mode === 'clone-error' && writes === failAt) {
          return originalPut.call(this, { ...record, uncloneable: () => {} });
        }
        // A real asynchronous request failure, not a rejected mock promise.
        const request = mode === 'request-error' && writes === failAt
          ? this.add({ ...record, id: 'replace' })
          : originalPut.call(this, record);
        request.addEventListener('success', () => {
          successes += 1;
          events.push('request-success');
          if (mode === 'late-abort' && successes === stores.length * 2) this.transaction.abort();
        });
        return request;
      };
      try {
        counts = await importBackup(db, JSON.stringify({
          app: 'partsible-lite', format: BACKUP_FORMAT, stores: incoming,
        }));
        events.push('resolved');
      } catch (error) {
        failure = { name: error.name, message: error.message };
        events.push('rejected');
      } finally {
        IDBObjectStore.prototype.put = originalPut;
        IDBDatabase.prototype.transaction = originalTransaction;
      }
      const after = (await exportBackup(db)).stores;
      // A new connection must observe the same committed/rolled-back state.
      db.close();
      db = await openDatabase({ name });
      const reopened = (await exportBackup(db)).stores;
      const retryCounts = retry ? await importBackup(db, JSON.stringify({
        app: 'partsible-lite', format: BACKUP_FORMAT, stores: incoming,
      })) : null;
      const retried = retry ? (await exportBackup(db)).stores : null;
      return { before, after, reopened, incoming, counts, failure, writes, successes, completes, aborts, transactions, events, retryCounts, retried };
    } finally {
      IDBObjectStore.prototype.put = originalPut;
      IDBDatabase.prototype.transaction = originalTransaction;
      db.close();
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
    }
  }, scenario);
};

for (const mode of ['throw', 'clone-error', 'request-error']) {
  for (const failAt of [1, 4, 14]) {
    test(`atomic backup rollback: ${mode}, write ${failAt}`, async ({ page }) => {
      const result = await runImport(page, { mode, failAt });
      expect(result.failure?.name).toBe({
        throw: 'QuotaExceededError', 'clone-error': 'DataCloneError', 'request-error': 'ConstraintError',
      }[mode]);
      if (mode === 'request-error') expect(result.successes).toBe(failAt - 1);
      expect(result.counts).toBeNull();
      expect(result.after).toEqual(result.before);
      expect(result.reopened).toEqual(result.before);
      expect(result.aborts).toBe(1);
      expect(result.completes).toBe(0);
      expect(result.events.indexOf('abort')).toBeLessThan(result.events.indexOf('rejected'));
      expect(result.transactions).toHaveLength(1);
    });
  }
}

for (const mode of ['empty', 'empty-stores']) {
  test(`empty backup import is a no-op: ${mode}`, async ({ page }) => {
    const result = await runImport(page, { mode });
    expect(result.failure).toBeNull();
    expect(result.after).toEqual(result.before);
    expect(result.reopened).toEqual(result.before);
    expect(result.writes).toBe(0);
    expect(result.transactions).toEqual([]);
    expect(result.counts).toEqual(Object.fromEntries(Object.keys(result.incoming).map((store) => [store, 0])));
  });
}

test('a failed import can be retried after rollback without losing unrelated work', async ({ page }) => {
  const result = await runImport(page, { mode: 'request-error', failAt: 4, retry: true });
  expect(result.failure?.name).toBe('ConstraintError');
  expect(result.after).toEqual(result.before);
  expect(result.reopened).toEqual(result.before);
  expect(result.retryCounts).toEqual(Object.fromEntries(Object.keys(result.incoming).map((store) => [store, 2])));
  for (const [store, records] of Object.entries(result.retried)) {
    expect(records).toEqual([
      result.before[store].find((record) => record.id === 'keep'), ...result.incoming[store],
    ].sort((a, b) => a.id.localeCompare(b.id)));
  }
});

test('rejects a transaction aborted after every request succeeds', async ({ page }) => {
  const result = await runImport(page, { mode: 'late-abort' });
  expect(result.successes).toBe(14);
  expect(result.failure?.name).toBe('AbortError');
  expect(result.counts).toBeNull();
  expect(result.after).toEqual(result.before);
  expect(result.reopened).toEqual(result.before);
  expect(result.aborts).toBe(1);
  expect(result.completes).toBe(0);
  expect(result.events.at(-2)).toBe('abort');
  expect(result.events.at(-1)).toBe('rejected');
});

for (const subset of [false, true]) {
  test(`commits ${subset ? 'partial-store' : 'all-store'} imports once, before reporting success`, async ({ page }) => {
    const result = await runImport(page, { mode: 'success', subset });
    expect(result.failure).toBeNull();
    expect(result.transactions).toEqual([Object.keys(result.incoming).sort()]);
    expect(result.completes).toBe(1);
    expect(result.aborts).toBe(0);
    expect(result.events.at(-2)).toBe('complete');
    expect(result.events.at(-1)).toBe('resolved');
    expect(result.reopened).toEqual(result.after);
    for (const [store, records] of Object.entries(result.after)) {
      const imported = result.incoming[store];
      expect(records).toEqual(imported
        ? [result.before[store].find((record) => record.id === 'keep'), ...imported].sort((a, b) => a.id.localeCompare(b.id))
        : result.before[store]);
    }
    expect(result.counts).toEqual(Object.fromEntries(Object.keys(result.incoming).map((store) => [store, 2])));
  });
}
