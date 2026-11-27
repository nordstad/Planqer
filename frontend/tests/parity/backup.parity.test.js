// Actual importer + memory store + Python contracts running in real Pyodide.
import { beforeAll, expect, it } from "vitest";
import fixture from "../contract/backup.json";
import { importBackup as commitBackup, previewBackup, exportBackup } from "../../src/runtime/backup";
import { createMemoryDb } from "../../src/runtime/memoryDb";
import { createLocalApi } from "../../src/runtime/localApi";
import { startRuntime } from "./startRuntime";

let call;
// Explicit test-only approval; UI consent is covered separately.
const importBackup = async (db, content, validate) =>
  commitBackup(db, await previewBackup(db, content, validate), { replaceExisting: true });
beforeAll(async () => {
  const { runtime } = await startRuntime();
  call = (op, payload) => runtime.call(op, payload);
});

it("round-trips all seven stores, metadata and stale catalogue snapshots unchanged", async () => {
  const db = createMemoryDb();
  await db.put("groups", { id: "keep", name: "Unrelated work" });
  const counts = await importBackup(db, JSON.stringify(fixture), call);
  expect(counts).toEqual(Object.fromEntries(Object.keys(fixture.stores).map((store) => [store, 1])));
  const exported = await exportBackup(db);
  for (const [store, records] of Object.entries(fixture.stores)) {
    for (const record of records) expect(await db.get(store, record.id)).toEqual(record);
  }
  expect(exported.stores.groups).toContainEqual({ id: "keep", name: "Unrelated work" });
  const second = createMemoryDb();
  // Only import the known-valid fixture records, not the deliberately sparse
  // unrelated sentinel above.
  await importBackup(second, fixture, call);
  expect((await exportBackup(second)).stores).toEqual(fixture.stores);
});

it.each([
  ["projects", "parts_data", [{ length: 600, quantity: 1.5 }]],
  ["sheet_projects", "optimization_result", { sheets: "crashes the saved page" }],
  ["tile_projects", "layout_result", { tiles: [null] }],
  ["wallpaper_projects", "room_data", { walls: "bad" }],
  ["groups", "name", {}],
  ["settings", "default_board_lengths", null],
  ["catalogue_entries", "data", "not JSON"],
])("rejects malformed %s before any import writes", async (store, field, value) => {
  const db = createMemoryDb();
  await importBackup(db, fixture, call);
  const before = (await exportBackup(db)).stores;
  const incoming = structuredClone(fixture);
  incoming.stores.groups[0].name = "Must not replace";
  incoming.stores[store][0][field] = value;
  await expect(importBackup(db, incoming, call)).rejects.toMatchObject({ code: "invalid" });
  expect((await exportBackup(db)).stores).toEqual(before);
});

it("accepts a partial backup referencing a retained group but rejects an absent group", async () => {
  const db = createMemoryDb();
  await db.put("groups", fixture.stores.groups[0]);
  const partial = { ...fixture, stores: { projects: fixture.stores.projects } };
  await importBackup(db, partial, call);
  expect(await db.get("projects", "board")).toEqual(fixture.stores.projects[0]);
  const empty = createMemoryDb();
  await expect(importBackup(empty, partial, call)).rejects.toMatchObject({ code: "invalid" });
  expect(await empty.list("projects")).toEqual([]);
});

it("round-trips records made by the current save path with full solver results", async () => {
  const db = createMemoryDb();
  const api = createLocalApi({ db, call });
  await api.handle("GET", "/settings/");
  const requests = [
    ["projects", "/projects/", "cutting_plan", {
      parts: { "600": 2 }, available_board_lengths: [2400], algorithm: "first_fit_decreasing",
    }],
    ["sheet_projects", "/sheet-projects/", "sheet_optimization", {
      parts: { Side: { width: 400, height: 600, quantity: 2 } },
      sheet_width: 1220, sheet_height: 2440, algorithm: "guillotine_cut",
    }],
    ["tile_projects", "/tile-projects/", "tile_layout", {
      surface_width: 1800, surface_height: 600, tile: { width: 300, height: 300 }, candidate_count: 1,
    }],
    ["wallpaper_projects", "/wallpaper-projects/", "wallpaper_plan", {
      wallpaper: Object.fromEntries(Object.entries(fixture.stores.wallpaper_projects[0].wallpaper_data)
        .filter(([key]) => !["currency", "vat_rate", "prices_include_vat"].includes(key))),
      room: fixture.stores.wallpaper_projects[0].room_data,
    }],
  ];
  for (const [store, path, operation, payload] of requests) {
    const result = await call(operation, payload);
    expect(result.status).toBe(200);
    const body = { ...fixture.stores[store][0], project_group_id: null };
    if (store === "tile_projects") body.layout_result = result.body.candidates[0];
    else if (store === "wallpaper_projects") body.plan_result = result.body;
    else body.optimization_result = result.body;
    const saved = await api.handle("POST", path, body);
    expect(saved.status).toBe(200);
  }
  const backup = await exportBackup(db);
  const target = createMemoryDb();
  await importBackup(target, backup, call);
  expect((await exportBackup(target)).stores).toEqual(backup.stores);
});
