import { exportBackup, importBackup, previewBackup } from "./backup";
import { createMemoryDb } from "./memoryDb";
import { STORES } from "./indexedDb";

vi.mock("./solver", () => ({ solverCall: vi.fn(async () => ({ status: 200 })) }));

const file = (stores) => ({ app: "partsible-lite", format: 1, stores });
const dump = async (db) => (await exportBackup(db)).stores;

it("previews additions and replacements across all seven stores without writing", async () => {
  const db = createMemoryDb();
  const stores = {};
  for (const store of STORES) {
    await db.put(store, { id: "replace", name: `Current ${store}` });
    stores[store] = [{ id: "replace", name: `Incoming ${store}` }, { id: "new", name: "New" }];
  }
  const before = await dump(db);
  const preview = await previewBackup(db, file(stores));
  expect(preview.additions).toBe(7);
  expect(preview.replacements).toBe(7);
  for (const store of STORES) {
    expect(preview.stores[store]).toEqual([
      { id: "replace", name: `Incoming ${store}`, currentName: `Current ${store}`, action: "replace" },
      { id: "new", name: "New", currentName: null, action: "add" },
    ]);
  }
  expect(await dump(db)).toEqual(before);
});

it("refuses raw files, forged previews, and previews belonging to another database", async () => {
  const db = createMemoryDb();
  const incoming = file({ groups: [{ id: "g", name: "Group" }] });
  for (const value of [incoming, {}, null]) {
    await expect(importBackup(db, value, { replaceExisting: true })).rejects.toMatchObject({ code: "previewRequired" });
  }
  const preview = await previewBackup(db, incoming);
  await expect(importBackup(createMemoryDb(), preview)).rejects.toMatchObject({ code: "previewRequired" });
  expect(await db.list("groups")).toEqual([]);
});

it("requires explicit replacement approval, including matching IDs with identical content", async () => {
  const db = createMemoryDb();
  const record = { id: "g", name: "Group" };
  await db.put("groups", record);
  const preview = await previewBackup(db, file({ groups: [record] }));
  await expect(importBackup(db, preview)).rejects.toMatchObject({ code: "confirmationRequired" });
  await expect(importBackup(db, preview, { replaceExisting: true })).resolves.toEqual({ groups: 1 });
  await expect(importBackup(db, preview, { replaceExisting: true })).rejects.toMatchObject({ code: "previewRequired" });
});

it.each(STORES)("requires a fresh preview if a matching %s record changes or disappears", async (store) => {
  const db = createMemoryDb();
  await db.put(store, { id: "same", name: "Old" });
  for (const change of ["edit", "delete"]) {
    const preview = await previewBackup(db, file({ [store]: [{ id: "same", name: "Replacement" }] }));
    if (change === "edit") await db.put(store, { id: "same", name: "Changed in another tab", metadata: { revision: 2 } });
    else await db.delete(store, "same");
    const before = await dump(db);
    await expect(importBackup(db, preview, { replaceExisting: true })).rejects.toMatchObject({ code: "stale" });
    expect(await dump(db)).toEqual(before);
  }
});

it("does not silently replace a record added after an additions-only preview", async () => {
  const db = createMemoryDb();
  const preview = await previewBackup(db, file({ groups: [{ id: "new", name: "From file" }] }));
  await db.put("groups", { id: "new", name: "Created meanwhile" });
  await expect(importBackup(db, preview)).rejects.toMatchObject({ code: "stale" });
  expect((await db.get("groups", "new")).name).toBe("Created meanwhile");
});

it.each(["edit", "delete"])("requires a fresh preview when a retained referenced group is subject to %s", async (change) => {
  const db = createMemoryDb();
  await db.put("groups", { id: "g", name: "Kitchen" });
  const preview = await previewBackup(db, file({ projects: [{ id: "p", project_group_id: "g" }] }));
  if (change === "edit") await db.put("groups", { id: "g", name: "Changed" });
  else await db.delete("groups", "g");
  await expect(importBackup(db, preview)).rejects.toMatchObject({ code: "stale" });
  expect(await db.list("projects")).toEqual([]);
});

it("preserves unrelated records changed after preview", async () => {
  const db = createMemoryDb();
  const preview = await previewBackup(db, file({ projects: [{ id: "new", name: "Imported" }] }));
  await db.put("projects", { id: "unrelated", name: "New work" });
  await importBackup(db, preview);
  expect((await db.get("projects", "unrelated")).name).toBe("New work");
});

it("owns the validated file independently of later caller edits", async () => {
  const db = createMemoryDb();
  const incoming = file({ groups: [{ id: "g", name: "Approved name", metadata: { values: [1, 2] } }] });
  const preview = await previewBackup(db, incoming);
  incoming.stores.groups[0].name = "Changed file";
  incoming.stores.groups[0].metadata.values.push(3);
  await importBackup(db, preview);
  expect(await db.get("groups", "g")).toEqual({ id: "g", name: "Approved name", metadata: { values: [1, 2] } });
});

it("consumes a preview before starting writes, preventing duplicate or failed-operation retries", async () => {
  const db = createMemoryDb();
  const preview = await previewBackup(db, file({ groups: [{ id: "g" }] }));
  let complete;
  db.putMany = vi.fn(() => new Promise((resolve) => { complete = resolve; }));
  const first = importBackup(db, preview);
  await expect(importBackup(db, preview)).rejects.toMatchObject({ code: "previewRequired" });
  expect(db.putMany).toHaveBeenCalledTimes(1);
  complete();
  await first;
});

it("requires a fresh preview after a failed conditional batch", async () => {
  const db = createMemoryDb();
  const preview = await previewBackup(db, file({ groups: [{ id: "g" }] }));
  db.putMany = vi.fn().mockRejectedValue(new DOMException("Injected failure", "QuotaExceededError"));
  await expect(importBackup(db, preview)).rejects.toMatchObject({ name: "QuotaExceededError" });
  await expect(importBackup(db, preview)).rejects.toMatchObject({ code: "previewRequired" });
  expect(await db.list("groups")).toEqual([]);
});
