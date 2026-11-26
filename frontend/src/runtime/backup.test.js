import { BackupError, BACKUP_FORMAT, exportBackup, importBackup as commitBackup, previewBackup } from "./backup";
import { createMemoryDb } from "./memoryDb";
import { STORES } from "./indexedDb";
// Transaction tests deliberately use sparse synthetic records. The real Python
// contracts are exercised in tests/parity/backup.parity.test.js.
vi.mock("./solver", () => ({ solverCall: vi.fn(async () => ({ status: 200 })) }));

// These existing validation/atomicity checks explicitly approve the preview.
// Confirmation and freshness behavior have their own backupPreview.test.js suite.
const importBackup = async (db, content, call) =>
  commitBackup(db, await previewBackup(db, content, call), { replaceExisting: true });

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
    app: "partsible-lite",
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
  it("comes from a newer version of Lite", () =>
    reject({ app: "partsible-lite", format: BACKUP_FORMAT + 1, stores: {} }, "tooNew"));
  it("names a store that does not exist", () =>
    reject({ app: "partsible-lite", format: BACKUP_FORMAT, stores: { hacked: [] } }, "invalid"));
  it("holds a record without an id", () =>
    reject({ app: "partsible-lite", format: BACKUP_FORMAT, stores: { projects: [{ name: "x" }] } }, "invalid"));

  it("writes nothing when any record is bad", async () => {
    const db = createMemoryDb();
    await expect(
      importBackup(db, {
        app: "partsible-lite",
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

it("leaves every store unchanged when a later write cannot be cloned", async () => {
  const db = await filled();
  const before = await everything(db);
  const putMany = db.putMany;
  db.putMany = (stores, options) => putMany({
    ...stores,
    projects: stores.projects.map((record) => ({ ...record, uncloneable: () => {} })),
  }, options);
  await expect(importBackup(db, {
    app: "partsible-lite", format: BACKUP_FORMAT,
    stores: {
      groups: [{ id: "g1", name: "Replacement" }, { id: "new", name: "New group" }],
      projects: [{ id: "bad" }],
    },
  })).rejects.toMatchObject({ name: "DataCloneError" });
  expect(await everything(db)).toEqual(before);
});

it("returns import counts only after the atomic batch commits", async () => {
  let commit;
  let reported = false;
  const db = {
    ...createMemoryDb(),
    put: vi.fn(),
    putMany: vi.fn(() => new Promise((resolve) => { commit = resolve; })),
  };
  const stores = { groups: [{ id: "g1" }], projects: [{ id: "p1" }] };
  const preview = await previewBackup(db, { app: "partsible-lite", format: BACKUP_FORMAT, stores });
  const importing = commitBackup(db, preview)
    .then((counts) => { reported = true; return counts; });
  await Promise.resolve();
  expect(db.putMany).toHaveBeenCalledWith(stores, { expected: expect.any(Array) });
  expect(db.put).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(reported).toBe(false);
  commit();
  await expect(importing).resolves.toEqual({ groups: 1, projects: 1 });
});

it("propagates batch failure rather than reporting import counts or falling back to per-record writes", async () => {
  const failure = new DOMException("Injected abort", "AbortError");
  const db = { ...createMemoryDb(), put: vi.fn(), putMany: vi.fn().mockRejectedValue(failure) };
  await expect(importBackup(db, {
    app: "partsible-lite", format: BACKUP_FORMAT, stores: { groups: [{ id: "g1" }] },
  })).rejects.toBe(failure);
  expect(db.put).not.toHaveBeenCalled();
});

it("does not start a batch when the existing backup validation fails", async () => {
  const db = { putMany: vi.fn() };
  await expect(importBackup(db, {
    app: "partsible-lite", format: BACKUP_FORMAT, stores: { groups: [{ name: "No id" }] },
  })).rejects.toMatchObject({ name: "BackupError", code: "invalid" });
  expect(db.putMany).not.toHaveBeenCalled();
});

it.each([{}, Object.fromEntries(STORES.map((store) => [store, []]))])(
  "accepts an empty import without changing existing data: %j",
  async (stores) => {
    const db = await filled();
    const before = await everything(db);
    const counts = await importBackup(db, { app: "partsible-lite", format: BACKUP_FORMAT, stores });
    expect(counts).toEqual(Object.fromEntries(Object.keys(stores).map((store) => [store, 0])));
    expect(await everything(db)).toEqual(before);
  },
);

for (const failAt of [0, 6, 13]) {
  it(`preserves all memory stores when batch cloning fails at record ${failAt + 1}`, async () => {
    const db = createMemoryDb();
    const stores = {};
    for (const store of STORES) {
      await db.put(store, { id: "replace", name: `Original ${store}` });
      await db.put(store, { id: "keep", name: `Unrelated ${store}` });
      stores[store] = ["replace", "insert"].map((id) => ({ id, name: `Incoming ${store}` }));
    }
    // Inject at the batch boundary, after the importer owns/validates its copy,
    // so this still tests the memory adapter's staging rather than early cloning.
    const putMany = db.putMany;
    db.putMany = (batch, options) => {
      let index = 0;
      return putMany(Object.fromEntries(Object.entries(batch).map(([store, records]) => [
        store, records.map((record) => ({
          ...record, ...(index++ === failAt ? { uncloneable: () => {} } : {}),
        })),
      ])), options);
    };
    const before = await everything(db);
    await expect(importBackup(db, {
      app: "partsible-lite", format: BACKUP_FORMAT, stores,
    })).rejects.toMatchObject({ name: "DataCloneError" });
    expect(await everything(db)).toEqual(before);
  });
}

it("atomically imports all memory stores with copies of the original payloads", async () => {
  const db = createMemoryDb();
  const stores = {};
  for (const store of STORES) {
    await db.put(store, { id: "keep", name: `Unrelated ${store}` });
    stores[store] = [{ id: "new", metadata: { values: [1, 2], label: store } }];
  }
  const counts = await importBackup(db, { app: "partsible-lite", format: BACKUP_FORMAT, stores });
  expect(counts).toEqual(Object.fromEntries(STORES.map((store) => [store, 1])));
  for (const store of STORES) {
    stores[store][0].metadata.values.push(3);
    expect(await db.get(store, "new")).toEqual({ id: "new", metadata: { values: [1, 2], label: store } });
    expect(await db.get(store, "keep")).toEqual({ id: "keep", name: `Unrelated ${store}` });
  }
});

describe("supported backup envelopes and relationships", () => {
  it.each([undefined, null, 0, -1, "1", 1.5, NaN, Infinity])(
    "rejects unsupported format %s without starting validation or writes", async (format) => {
      const db = { putMany: vi.fn() };
      const call = vi.fn();
      await expect(importBackup(db, { app: "partsible-lite", format, stores: {} }, call))
        .rejects.toMatchObject({ code: "invalid" });
      expect(call).not.toHaveBeenCalled();
      expect(db.putMany).not.toHaveBeenCalled();
    },
  );

  it.each(STORES)("rejects duplicate ids within %s, preserving every store", async (store) => {
    const db = await filled();
    const before = await everything(db);
    await expect(importBackup(db, {
      app: "partsible-lite", format: BACKUP_FORMAT,
      stores: { [store]: [{ id: "same" }, { id: "same" }] },
    })).rejects.toMatchObject({ code: "invalid" });
    expect(await everything(db)).toEqual(before);
  });

  it.each(["projects", "sheet_projects", "tile_projects", "wallpaper_projects"])(
    "rejects missing group references in %s without changing any store", async (store) => {
      const db = await filled();
      const before = await everything(db);
      await expect(importBackup(db, {
        app: "partsible-lite", format: BACKUP_FORMAT,
        stores: {
          groups: [{ id: "g1", name: "Must not replace" }],
          [store]: [{ id: "new", project_group_id: "missing" }],
        },
      })).rejects.toMatchObject({ code: "invalid" });
      expect(await everything(db)).toEqual(before);
    },
  );

  it.each(["existing", "incoming"])("resolves references against %s groups", async (source) => {
    const db = await filled();
    const stores = { projects: [{ id: "new", project_group_id: source }] };
    if (source === "existing") await db.put("groups", { id: source, name: "Retained" });
    else stores.groups = [{ id: source, name: "Imported" }];
    await importBackup(db, { app: "partsible-lite", format: BACKUP_FORMAT, stores });
    expect((await db.get("projects", "new")).project_group_id).toBe(source);
    expect((await db.get("groups", "g1")).name).toBe("Kitchen");
  });

  it("does not write or fall back if record validation rejects", async () => {
    const db = await filled();
    const before = await everything(db);
    const call = vi.fn(async () => ({ status: 422 }));
    await expect(importBackup(db, await exportBackup(db), call))
      .rejects.toMatchObject({ code: "invalid" });
    expect(call).toHaveBeenCalledWith("backup_records", { stores: before });
    expect(await everything(db)).toEqual(before);
  });

  it("does not write when the validation worker fails to load", async () => {
    const db = await filled();
    const before = await everything(db);
    const failure = new Error("Worker unavailable");
    await expect(importBackup(db, await exportBackup(db), async () => { throw failure; }))
      .rejects.toBe(failure);
    expect(await everything(db)).toEqual(before);
  });

  it("validates an owned snapshot before any writes", async () => {
    const db = await filled();
    const before = await everything(db);
    const original = await exportBackup(db);
    original.stores.projects[0].name = "Validated replacement";
    let finish;
    const call = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const importing = importBackup(db, original, call);
    original.stores.projects[0].project_group_id = "missing";
    expect(await everything(db)).toEqual(before);
    finish({ status: 200 });
    await importing;
    expect((await db.get("projects", "p1")).project_group_id).toBe("g1");
    expect((await db.get("projects", "p1")).name).toBe("Validated replacement");
  });
});
