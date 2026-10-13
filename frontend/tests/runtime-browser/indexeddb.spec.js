// The real IndexedDB layer, in each browser: data survives a reload, schema
// migrations run once and in order, and a diagram bigger than localStorage's
// limit is kept.

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/runtime-browser/store.html");
  await page.waitForFunction(() => window.storeReady === true);
});

test("records survive a reload", async ({ page }) => {
  await page.evaluate(async () => {
    const db = await window.store.openDatabase({ name: "survives" });
    await db.put("groups", { id: "g1", name: "Chair" });
    db.close();
  });

  await page.reload();
  await page.waitForFunction(() => window.storeReady === true);

  const names = await page.evaluate(async () => {
    const db = await window.store.openDatabase({ name: "survives" });
    return (await db.list("groups")).map((group) => group.name);
  });
  expect(names).toEqual(["Chair"]);
});

test("every store the app uses exists and finds records by id", async ({ page }) => {
  const results = await page.evaluate(async () => {
    const db = await window.store.openDatabase({ name: "stores" });
    const found = {};
    for (const store of window.store.STORES) {
      await db.put(store, { id: "x", store });
      found[store] = (await db.get(store, "x")).store;
      await db.delete(store, "x");
      found[`${store} after delete`] = await db.get(store, "x");
    }
    return found;
  });

  for (const store of ["projects", "sheet_projects", "tile_projects", "groups", "settings", "catalogue_entries"]) {
    expect(results[store]).toBe(store);
    expect(results[`${store} after delete`]).toBeUndefined();
  }
});

test("a browser holding the first version of the database upgrades without losing anything", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const [first] = window.store.MIGRATIONS;
    let old = await window.store.openDatabase({ name: "from-v1", migrations: [first] });
    await old.put("groups", { id: "g1", name: "Chair" });
    await old.put("projects", { id: "p1", name: "Rails" });
    old.close();

    const upgraded = await window.store.openDatabase({ name: "from-v1" });
    await upgraded.put("catalogue_entries", { id: "local:regel:48x98", product_id: "local:regel:48x98", hidden: false, data: "{}" });
    return {
      groups: (await upgraded.list("groups")).map((g) => g.name),
      projects: (await upgraded.list("projects")).map((p) => p.name),
      entries: (await upgraded.list("catalogue_entries")).map((e) => e.product_id),
    };
  });

  expect(result).toEqual({ groups: ["Chair"], projects: ["Rails"], entries: ["local:regel:48x98"] });
});

test("migrations run once each, in order, and only the ones not yet seen", async ({ page }) => {
  const log = await page.evaluate(async () => {
    const ran = [];
    const first = (database) => {
      ran.push("1");
      database.createObjectStore("things", { keyPath: "id" });
    };
    const second = (database, transaction) => {
      ran.push("2");
      transaction.objectStore("things").put({ id: "migrated", from: 2 });
      database.createObjectStore("extra", { keyPath: "id" });
    };

    let db = await window.store.openDatabase({ name: "migrating", migrations: [first] });
    await db.put("things", { id: "old" });
    db.close();
    const afterFirst = [...ran];

    db = await window.store.openDatabase({ name: "migrating", migrations: [first, second] });
    const things = (await db.list("things")).map((record) => record.id).sort();
    await db.put("extra", { id: "e" });
    db.close();
    const afterSecond = [...ran];

    db = await window.store.openDatabase({ name: "migrating", migrations: [first, second] });
    db.close();
    return { afterFirst, afterSecond, afterThird: [...ran], things };
  });

  expect(log.afterFirst).toEqual(["1"]);
  expect(log.afterSecond).toEqual(["1", "2"]);
  expect(log.afterThird).toEqual(["1", "2"]);
  expect(log.things).toEqual(["migrated", "old"]);
});

test("keeps a diagram larger than localStorage allows", async ({ page }) => {
  const size = await page.evaluate(async () => {
    const db = await window.store.openDatabase({ name: "large" });
    const image = `data:image/svg+xml;base64,${"A".repeat(8 * 1024 * 1024)}`;
    await db.put("projects", { id: "big", cutlist_image: image });
    return (await db.get("projects", "big")).cutlist_image.length;
  });

  expect(size).toBeGreaterThan(8 * 1024 * 1024);
});

test("an update is not blocked by an older connection that is still open", async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    const first = (database) => database.createObjectStore("things", { keyPath: "id" });
    const second = (database) => database.createObjectStore("more", { keyPath: "id" });

    // An open connection at the old version, like another tab left open.
    const old = await window.store.openDatabase({ name: "two-tabs", migrations: [first] });
    await old.put("things", { id: "kept" });

    const upgraded = await window.store.openDatabase({ name: "two-tabs", migrations: [first, second] });
    await upgraded.put("more", { id: "new" });
    return {
      kept: (await upgraded.get("things", "kept")).id,
      added: (await upgraded.get("more", "new")).id,
    };
  });

  expect(outcome).toEqual({ kept: "kept", added: "new" });
});
