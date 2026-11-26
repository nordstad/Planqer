// The browser's database for Lite: IndexedDB, with the same small
// interface as memoryDb.js (list, get, put, delete, snapshot, and conditional
// atomic putMany).
//
// localStorage cannot hold this: saved diagrams are SVG and exceed its 5 MB.
//
// The database version is the number of migrations. Opening an older database
// runs, in order, only the migrations it has not seen, so an update to the app
// never needs the user to do anything. Add a migration to the end of the list;
// never change one that has shipped.

import { sameRecord, StaleSnapshotError } from "./recordSnapshot";

export const DATABASE_NAME = "partsible";

export const STORES = ["projects", "sheet_projects", "tile_projects", "wallpaper_projects", "groups", "settings", "catalogue_entries"];

export const MIGRATIONS = [
  // 1: the first schema. Every record is stored as the server would return it
  // and is looked up by its id.
  (database) => {
    for (const store of ["projects", "sheet_projects", "tile_projects", "groups", "settings"]) {
      database.createObjectStore(store, { keyPath: "id" });
    }
  },
  // 2: the user's own catalogue entries, one record per product id.
  (database) => {
    database.createObjectStore("catalogue_entries", { keyPath: "id" });
  },
  // 3: saved wallpaper plans.
  (database) => {
    database.createObjectStore("wallpaper_projects", { keyPath: "id" });
  },
];

const settle = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export function openDatabase({
  indexedDB = globalThis.indexedDB,
  name = DATABASE_NAME,
  migrations = MIGRATIONS,
} = {}) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(name, migrations.length);

    opening.onupgradeneeded = (event) => {
      const { result: database, transaction } = opening;
      for (const migrate of migrations.slice(event.oldVersion)) {
        migrate(database, transaction);
      }
    };
    // `blocked` only means an older connection, perhaps in another tab, is still
    // closing. Every connection closes itself on `versionchange` (below), so the
    // open finishes by itself; rejecting here would fail an upgrade that works.
    opening.onerror = () => reject(opening.error);

    opening.onsuccess = () => {
      const database = opening.result;
      // Another tab upgrading the schema asks this one to let go.
      database.onversionchange = () => database.close();

      const run = (store, mode, action) =>
        settle(action(database.transaction(store, mode).objectStore(store)));

      const snapshot = (keys) => {
        if (keys.length === 0) return Promise.resolve([]);
        return new Promise((resolve, reject) => {
          const transaction = database.transaction([...new Set(keys.map(({ store }) => store))], "readonly");
          const values = [];
          let failure;
          transaction.oncomplete = () => resolve(values);
          transaction.onabort = () => reject(failure ?? transaction.error ?? new DOMException("Snapshot aborted", "AbortError"));
          try {
            keys.forEach(({ store, id }, index) => {
              const request = transaction.objectStore(store).get(id);
              request.onsuccess = () => { values[index] = { store, id, value: request.result }; };
            });
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        });
      };

      const putMany = (recordsByStore, { expected = [] } = {}) => {
        const entries = Object.entries(recordsByStore).filter(([, records]) => records.length > 0);
        if (entries.length === 0) return Promise.resolve();
        return new Promise((resolve, reject) => {
          const scope = [...new Set([...entries.map(([store]) => store), ...expected.map(({ store }) => store)])];
          const transaction = database.transaction(scope, "readwrite");
          let failure;
          transaction.oncomplete = () => resolve();
          // Reject only after rollback, not on an individual request's error.
          transaction.onabort = () => reject(failure ?? transaction.error ?? new DOMException("Write transaction aborted", "AbortError"));
          const abort = (error) => {
            failure = error;
            transaction.abort();
          };
          const write = () => {
            try {
              for (const [store, records] of entries) {
                const objects = transaction.objectStore(store);
                for (const record of records) objects.put(record);
              }
            } catch (error) {
              abort(error);
            }
          };
          try {
            let remaining = expected.length;
            if (remaining === 0) write();
            for (const { store, id, value } of expected) {
              const request = transaction.objectStore(store).get(id);
              // Queue writes inside the last request handler, while the same
              // transaction is active. No async gap or cross-tab check/write race.
              request.onsuccess = () => {
                if (failure) return;
                try {
                  if (!sameRecord(request.result, value)) throw new StaleSnapshotError();
                  if (--remaining === 0) write();
                } catch (error) {
                  abort(error);
                }
              };
            }
          } catch (error) {
            abort(error);
          }
        });
      };

      resolve({
        list: (store) => run(store, "readonly", (objects) => objects.getAll()),
        get: (store, id) => run(store, "readonly", (objects) => objects.get(id)),
        put: (store, record) => run(store, "readwrite", (objects) => objects.put(record)),
        snapshot,
        putMany,
        delete: (store, id) => run(store, "readwrite", (objects) => objects.delete(id)),
        close: () => database.close(),
      });
    };
  });
}
