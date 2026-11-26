// An in-memory stand-in for the IndexedDB store, with the same small interface.
// Values are copied on the way in and out, as IndexedDB does, so a caller can
// never change a stored record by holding on to it.

import { sameRecord, StaleSnapshotError } from "./recordSnapshot";

export function createMemoryDb() {
  const stores = new Map();
  const table = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };

  return {
    async list(store) {
      return [...table(store).values()].map((record) => structuredClone(record));
    },
    async get(store, id) {
      const record = table(store).get(id);
      return record === undefined ? undefined : structuredClone(record);
    },
    async put(store, record) {
      table(store).set(record.id, structuredClone(record));
    },
    async snapshot(keys) {
      return keys.map(({ store, id }) => ({
        store, id, value: structuredClone(table(store).get(id)),
      }));
    },
    async putMany(recordsByStore, { expected = [] } = {}) {
      for (const { store, id, value } of expected) {
        if (!sameRecord(table(store).get(id), value)) throw new StaleSnapshotError();
      }
      // Clone the whole batch before publishing any change, as IndexedDB does.
      const staged = Object.entries(recordsByStore).map(([store, records]) => [
        store, records.map((record) => structuredClone(record)),
      ]);
      for (const [store, records] of staged) {
        for (const record of records) table(store).set(record.id, record);
      }
    },
    async delete(store, id) {
      table(store).delete(id);
    },
  };
}
