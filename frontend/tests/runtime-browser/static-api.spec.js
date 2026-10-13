// api.js in static mode, end to end: its own functions, the local transport,
// the solver client and the real worker, in each browser.

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/runtime-browser/api.html");
  await page.waitForFunction(() => window.apiReady === true);
});

test("the api functions solve in the browser and return the server's shapes", async ({
  page,
}) => {
  const results = await page.evaluate(async () => {
    const { api } = window;
    const board = await api.optimizeCutting(
      [{ length: 100, quantity: 2 }, { length: 50, quantity: 2 }],
      [200],
      3,
    );
    const sheet = await api.optimizeSheetCutting(
      [{ id: "a", name: "side", width: 600, height: 400, quantity: 2 }],
      2440, 1220, 3, "plywood", "guillotine_cut", true,
    );
    const tiles = await api.optimizeTileLayout({
      surfaceWidth: 1500, surfaceHeight: 1200, cutouts: [],
      tile: { width: 600, height: 300, allowRotation: false },
      joint: { jointWidth: 3, perimeterGap: 0 },
      bond: { pattern: "stack", offsetFraction: 0.5 },
      minEdgeCut: "", reuseOffcuts: true, wastePercent: 10, candidateCount: 2,
    });
    const catalogue = await api.getCatalogue(undefined, "SE");
    const stl = new Uint8Array(await (await fetch("/parity/files/cabinet.stl")).arrayBuffer());
    const model = await api.process3DCutlist(new File([stl], "cabinet.stl"), "mm", 1, "Cabinet");
    return {
      board: board.optimal_board_length,
      sheets: sheet.total_sheets,
      candidates: tiles.candidates.length,
      products: catalogue.data.products.length,
      etag: catalogue.etag ?? null,
      boards: model.board_count,
    };
  });

  expect(results.board).toBe(200);
  expect(results.sheets).toBeGreaterThanOrEqual(1);
  expect(results.candidates).toBeGreaterThanOrEqual(1);
  expect(results.products).toBeGreaterThan(0);
  expect(results.etag).toBeNull();
  expect(results.boards).toBeGreaterThanOrEqual(1);
});

test("a rejected request fails with the endpoint's own message", async ({ page }) => {
  const message = await page.evaluate(async () => {
    try {
      await window.api.optimizeCutting([{ length: 500, quantity: 1 }], [300], 3);
      return null;
    } catch (error) {
      return error.message;
    }
  });

  expect(message).toBe("No board is long enough for the largest part.");
});

test("a server-only feature says it is not available in the demo", async ({ page }) => {
  const message = await page.evaluate(() =>
    window.api.getAdminUsers().then(() => null, (error) => error.message),
  );

  expect(message).toMatch(/not available in the demo/i);
});

test("saved projects, groups and settings live in the browser and survive a reload", async ({
  page,
}) => {
  const saved = await page.evaluate(async () => {
    const { api } = window;
    const plan = await api.optimizeCutting(
      [{ length: 100, quantity: 2 }, { length: 50, quantity: 2 }],
      [200],
      3,
    );
    const group = await api.createProjectGroup("Chair");
    const project = await api.saveProject({
      name: "Shelves",
      projectGroupId: group.id,
      parts: [{ length: 100, quantity: 2 }, { length: 50, quantity: 2 }],
      boards: [200],
      sawKerf: 3,
      result: plan,
    });
    await api.updateUserSettings({ default_currency: "NOK" });
    return { groupId: group.id, projectId: project.id, hasImage: Boolean(project.cutlist_image) };
  });
  expect(saved.hasImage).toBe(true);

  await page.reload();
  await page.waitForFunction(() => window.apiReady === true);

  const after = await page.evaluate(async (ids) => {
    const { api } = window;
    const projects = await api.getUserProjects();
    const groups = await api.getProjectGroups();
    const settings = await api.getUserSettings();
    const image = await api.downloadProjectImage(ids.projectId, "board");
    return {
      projects: projects.map((p) => [p.name, p.project_group_id === ids.groupId]),
      groups: groups.map((g) => g.name),
      currency: settings.default_currency,
      imageType: image.type,
      imageText: (await image.text()).slice(0, 5),
    };
  }, saved);

  expect(after.projects).toEqual([["Shelves", true]]);
  expect(after.groups).toEqual(["Chair"]);
  expect(after.currency).toBe("NOK");
  expect(after.imageType).toBe("image/svg+xml");
  expect(after.imageText).toBe("<?xml");
});

test("deleting a group in the browser removes its projects, and a missing one says so", async ({
  page,
}) => {
  const outcome = await page.evaluate(async () => {
    const { api } = window;
    const plan = await api.optimizeCutting([{ length: 100, quantity: 1 }], [200], 3);
    const group = await api.createProjectGroup("Shed");
    await api.saveProject({
      name: "Frame", projectGroupId: group.id, parts: [{ length: 100, quantity: 1 }],
      boards: [200], sawKerf: 3, result: plan,
    });
    await api.deleteProjectGroup(group.id);
    const projects = await api.getUserProjects();
    const message = await api.deleteProject("00000000-0000-4000-8000-000000000000")
      .then(() => null, (error) => error.message);
    return { remaining: projects.length, message };
  });

  expect(outcome.remaining).toBe(0);
  expect(outcome.message).toBe("Project not found");
});
