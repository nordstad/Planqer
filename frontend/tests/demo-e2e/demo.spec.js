// The built demo in a real browser, served like GitHub Pages: first visit, a
// real solve in the Pyodide worker, saving, a reload, a deep link, a backup.
// It also checks the two things only a real deploy shows: that nothing is
// fetched from outside the demo's own origin, and that no request 404s.

import { expect, test } from "@playwright/test";

const APP = "/Planqer/app/";

const watchRequests = (page) => {
  const seen = { outside: [], failed: [] };
  const origin = new URL(page.url() === "about:blank" ? "http://127.0.0.1:3003" : page.url()).origin;
  page.on("response", (response) => {
    const url = response.url();
    // blob: and data: URLs are made by the page itself, not fetched from anywhere.
    if (!/^https?:/.test(url)) return;
    if (!url.startsWith(origin)) seen.outside.push(url);
    else if (response.status() >= 400) seen.failed.push(`${response.status()} ${url}`);
  });
  return seen;
};

test("a first visit shows the demo without interrupting it", async ({ page }) => {
  await page.goto(APP);

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Demo notice" })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText(/demo · light version/i);
  await expect(page.getByRole("button", { name: "About this demo" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

test("a plan is solved in the browser, saved, and still there after a reload", async ({ page }) => {
  await page.goto(APP);
  const seen = watchRequests(page);

  await page.getByRole("link", { name: "Board cutting" }).first().click();
  await expect(page).toHaveURL(/#\/cutting$/);

  await page.getByRole("button", { name: /try an example/i }).click();
  await page.getByLabel("Name, item 1").fill("Front rail");
  await page.getByRole("combobox", { name: "Product" }).fill("Oak");
  await page.getByRole("option", { name: "Use “Oak” as my own product" }).click();
  await page.getByLabel("Thickness (mm)").fill("45");
  await page.getByLabel("Width (mm)").fill("45");
  await page.getByRole("button", { name: /plan the cuts/i }).click();

  // The first solve downloads and starts the runtime.
  await expect(page.getByRole("heading", { name: /your cutting plan/i })).toBeVisible({ timeout: 120000 });

  await page.getByRole("button", { name: /name and save/i }).click();
  await page.locator("#plan-name").fill("Demo smoke plan");
  await page.getByRole("button", { name: /^save plan$/i }).click();
  await expect(page.getByRole("heading", { name: /plan saved/i })).toBeVisible();
  await expect(page.getByText(/saved in this browser on this device only/i)).toBeVisible();

  await page.reload();
  await page.getByRole("link", { name: "My projects" }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.getByText("Demo smoke plan")).toBeVisible();
  const savedPlan = page.locator(".plan-item").filter({ hasText: "Demo smoke plan" });
  await savedPlan.getByRole("button", { name: "Modify" }).click();
  await expect(page.getByLabel("Name, item 1")).toHaveValue("Front rail");

  expect(seen.outside, "nothing may be loaded from another origin").toEqual([]);
  expect(seen.failed, "nothing may 404").toEqual([]);
});

test("a deep link survives a reload", async ({ page }) => {
  await page.goto(`${APP}#/tile-layout`);
  await expect(page.getByRole("link", { name: "Tile layout" }).first()).toHaveAttribute("aria-current", "page");

  await page.reload();

  await expect(page).toHaveURL(/#\/tile-layout$/);
  await expect(page.getByRole("link", { name: "Tile layout" }).first()).toHaveAttribute("aria-current", "page");
});

test("Help contents links stay on the Help page", async ({ page }) => {
  await page.goto(`${APP}#/help`);

  for (const [name, section] of [
    ["Choose a tool", "choose-tool"],
    ["Read your result", "results"],
    ["Troubleshooting", "troubleshooting"],
  ]) {
    await page.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`#\\/help#${section}$`));
    await expect(page.locator(`#${section}`)).toBeInViewport();
  }

  await page.goto(`${APP}#/results`);
  await expect(page).toHaveURL(/#\/help#results$/);
  await expect(page.locator("#results")).toBeVisible();
});

test("a backup of what was saved can be downloaded", async ({ page }) => {
  await page.goto(`${APP}#/cutting`);
  await page.getByRole("button", { name: /try an example/i }).click();
  await page.getByRole("combobox", { name: "Product" }).fill("Pine");
  await page.getByRole("option", { name: "Use “Pine” as my own product" }).click();
  await page.getByLabel("Thickness (mm)").fill("45");
  await page.getByLabel("Width (mm)").fill("45");
  await page.getByRole("button", { name: /plan the cuts/i }).click();
  await expect(page.getByRole("heading", { name: /your cutting plan/i })).toBeVisible({ timeout: 120000 });
  await page.getByRole("button", { name: /name and save/i }).click();
  await page.locator("#plan-name").fill("Backed up plan");
  await page.getByRole("button", { name: /^save plan$/i }).click();
  await expect(page.getByRole("heading", { name: /plan saved/i })).toBeVisible();

  await page.getByRole("link", { name: "My projects" }).click();
  await expect(page.getByRole("note").filter({ hasText: /no recent backup/i })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const file = await download;

  expect(file.suggestedFilename()).toMatch(/^planqer-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await (await import("node:fs/promises")).readFile(await file.path(), "utf-8"));
  expect(backup).toMatchObject({ app: "planqer-demo", format: 1 });
  expect(backup.stores.projects.map((project) => project.name)).toContain("Backed up plan");
  await expect(page.getByRole("note").filter({ hasText: /no recent backup/i })).toHaveCount(0);
});

test("the user's own products can be edited", async ({ page }) => {
  await page.goto(`${APP}#/`);
  await page.getByRole("link", { name: "Catalogue" }).click();
  await expect(page).toHaveURL(/#\/catalogue$/);
  await expect(page.getByText(/saved in this browser only/i)).toBeVisible({ timeout: 15_000 });
});

test("Browse files and Import backup open the file picker", async ({ page }) => {
  await page.goto(`${APP}#/model-cutlist`);
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Browse files").click();
  expect((await chooser).isMultiple()).toBe(false);

  await page.goto(`${APP}#/dashboard`);
  const importChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import backup" }).click();
  await importChooser;
});

test("a visitor with no country picks one, then browses to a product size, and the numbers fill in", async ({ page }) => {
  await page.goto(`${APP}#/cutting`);

  const prompt = page.getByTestId("generic-catalogue-prompt");
  await expect(prompt).toContainText(/no country is selected/i);
  await expect(prompt.getByRole("link", { name: "Ask for it" })).toBeVisible();
  await prompt.getByRole("button", { name: "Sweden" }).click();
  await expect(prompt).toBeHidden();

  await page.getByRole("combobox", { name: "Product" }).click();
  await page.getByRole("option", { name: /^Decking/ }).first().click();
  await page.getByRole("option", { name: /^Decking 28 × 120 mm/ }).click();

  await expect(page.getByLabel("Thickness (mm)")).toHaveValue("28");
  await expect(page.getByLabel("Width (mm)")).toHaveValue("120");
});
