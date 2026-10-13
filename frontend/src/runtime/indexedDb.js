// The browser's database for the demo: IndexedDB, with the same small
// interface as memoryDb.js (list, get, put, delete by store and id).
//
// localStorage cannot hold this: saved diagrams are SVG and exceed its 5 MB.
//
// The database version is the number of migrations. Opening an older database
// runs, in order, only the migrations it has not seen, so an update to the app
// never needs the user to do anything. Add a migration to the end of the list;
// never change one that has shipped.

export const DATABASE_NAME = "planqer";

export const STORES = ["projects", "sheet_projects", "tile_projects", "groups", "settings"];

export const MIGRATIONS = [
  // 1: the first schema. Every record is stored as the server would return it
  // and is looked up by its id.
  (database) => {
    for (const store of STORES) database.createObjectStore(store, { keyPath: "id" });
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

      resolve({
        list: (store) => run(store, "readonly", (objects) => objects.getAll()),
        get: (store, id) => run(store, "readonly", (objects) => objects.get(id)),
        put: (store, record) => run(store, "readwrite", (objects) => objects.put(record)),
        delete: (store, id) => run(store, "readwrite", (objects) => objects.delete(id)),
        close: () => database.close(),
      });
    };
  });
}
