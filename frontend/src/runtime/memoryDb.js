// An in-memory stand-in for the IndexedDB store, with the same small interface.
// Values are copied on the way in and out, as IndexedDB does, so a caller can
// never change a stored record by holding on to it.

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
    async delete(store, id) {
      table(store).delete(id);
    },
  };
}
