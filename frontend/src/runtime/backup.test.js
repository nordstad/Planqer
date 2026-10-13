import { BackupError, BACKUP_FORMAT, exportBackup, importBackup } from "./backup";
import { createMemoryDb } from "./memoryDb";
import { STORES } from "./indexedDb";

const filled = async () => {
  const db = createMemoryDb();
  await db.put("groups", { id: "g1", name: "Kitchen" });
  await db.put("projects", { id: "p1", project_group_id: "g1", name: "Shelf", image: "data:image/svg+xml;base64,PHN2Zy8+" });
  await db.put("tile_projects", { id: "t1", name: "Splashback" });
  await db.put("settings", { id: "settings", default_currency: "SEK" });
  return db;
};

const everything = async (db) =>
  Object.fromEntries(await Promise.all(STORES.map(async (store) => [store, (await db.list(store)).sort((a, b) => a.id.localeCompare(b.id))])));

it("writes a versioned file with every store", async () => {
  const backup = await exportBackup(await filled(), { now: new Date("2026-10-13T10:00:00Z"), appVersion: "0.8.2" });
  expect(backup).toMatchObject({
    app: "planqer-demo",
    format: BACKUP_FORMAT,
    exported_at: "2026-10-13T10:00:00.000Z",
    app_version: "0.8.2",
  });
  expect(Object.keys(backup.stores).sort()).toEqual([...STORES].sort());
  expect(backup.stores.projects).toHaveLength(1);
});

it("restores into an empty browser exactly what was exported", async () => {
  const source = await filled();
  const file = JSON.parse(JSON.stringify(await exportBackup(source)));
  const target = createMemoryDb();

  const counts = await importBackup(target, file);

  expect(await everything(target)).toEqual(await everything(source));
  expect(counts).toMatchObject({ projects: 1, groups: 1, tile_projects: 1, settings: 1 });
});

it("keeps what is already here and lets the file win on the same id", async () => {
  const file = JSON.parse(JSON.stringify(await exportBackup(await filled())));
  const target = createMemoryDb();
  await target.put("projects", { id: "mine", name: "Already here" });
  await target.put("projects", { id: "p1", name: "Old name" });

  await importBackup(target, file);

  expect((await target.get("projects", "mine")).name).toBe("Already here");
  expect((await target.get("projects", "p1")).name).toBe("Shelf");
});

describe("a file it cannot trust", () => {
  const reject = async (content, code) => {
    const db = createMemoryDb();
    await expect(importBackup(db, content)).rejects.toMatchObject({ name: "BackupError", code });
    return db;
  };

  it("is not JSON", () => reject("not json {", "notBackup"));
  it("is JSON of another kind", () => reject({ hello: "world" }, "notBackup"));
  it("comes from a newer version of the demo", () =>
    reject({ app: "planqer-demo", format: BACKUP_FORMAT + 1, stores: {} }, "tooNew"));
  it("names a store that does not exist", () =>
    reject({ app: "planqer-demo", format: BACKUP_FORMAT, stores: { hacked: [] } }, "invalid"));
  it("holds a record without an id", () =>
    reject({ app: "planqer-demo", format: BACKUP_FORMAT, stores: { projects: [{ name: "x" }] } }, "invalid"));

  it("writes nothing when any record is bad", async () => {
    const db = createMemoryDb();
    await expect(
      importBackup(db, {
        app: "planqer-demo",
        format: BACKUP_FORMAT,
        stores: { groups: [{ id: "g1" }], projects: [{ name: "no id" }] },
      }),
    ).rejects.toBeInstanceOf(BackupError);
    expect(await db.list("groups")).toEqual([]);
  });
});

it("reads a file given as text", async () => {
  const file = JSON.stringify(await exportBackup(await filled()));
  const target = createMemoryDb();
  await importBackup(target, file);
  expect(await target.list("groups")).toHaveLength(1);
});
