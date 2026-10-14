// What the demo really sends to Umami, in a real browser. The Umami script is
// replaced by a stand-in that behaves like the real tracker where it matters:
// it calls the page's data-before-send hook and sends only what that returns.
// So this tests our loading rules, our allow-list and our hook, not Umami.
//
// Run it with:  npm run test:analytics (it builds the app with an id first)

import { expect, test } from "@playwright/test";

const APP = "/Planqer/app/";
const SCRIPT = "https://cloud.umami.is/script.js";
const SEND = "https://cloud.umami.is/api/send";
const ALLOWED = [
  "tool_opened", "solve_completed", "solve_failed", "model_imported",
  "project_saved", "project_exported", "docker_cta_clicked", "runtime_error",
];

const STAND_IN = `(() => {
  const tag = document.currentScript;
  const hook = window[tag.dataset.beforeSend];
  const send = (type, payload) => {
    const out = hook ? hook(type, payload) : payload;
    if (out) fetch("${SEND}", { method: "POST", body: JSON.stringify(out) });
  };
  window.umami = { track: (name, data) => send("event", { name, data }) };
  send("event", { url: location.pathname, title: document.title });
})();`;

async function watchUmami(page) {
  const seen = { scripts: 0, sent: [] };
  await page.route(SCRIPT, (route) => {
    seen.scripts += 1;
    return route.fulfill({ contentType: "text/javascript", body: STAND_IN });
  });
  await page.route(SEND, (route) => {
    seen.sent.push(JSON.parse(route.request().postData() ?? "{}"));
    return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
  });
  return seen;
}

const named = (seen) => seen.sent.filter((payload) => payload.name);

test("counts the pageview and the tool, and nothing outside the allow-list", async ({ page }) => {
  const seen = await watchUmami(page);
  await page.goto(APP);
  await page.getByRole("button", { name: "Got it" }).click();
  await page.goto(`${APP}#/cutting`);

  await expect.poll(() => named(seen)).toContainEqual({ name: "tool_opened", data: { tool: "board" } });
  expect(seen.scripts).toBe(1);

  // Something a future change might try to send is stopped by the hook.
  await page.evaluate(() => window.umami.track("project_named", { name: "My kitchen" }));
  await page.evaluate(() => window.umami.track("project_saved", { tool: "board", name: "My kitchen" }));
  await expect.poll(() => named(seen).map((p) => p.name)).toContain("project_saved");

  for (const payload of named(seen)) {
    expect(ALLOWED).toContain(payload.name);
    expect(JSON.stringify(payload)).not.toContain("kitchen");
  }
  expect(named(seen).map((p) => p.name)).not.toContain("project_named");
});

test("counts a click on the full-version link by where it was", async ({ page }) => {
  const seen = await watchUmami(page);
  await page.goto(APP);
  await page.getByRole("dialog").getByRole("link", { name: "Get the full version" }).click({ modifiers: [] });

  await expect.poll(() => named(seen)).toContainEqual({ name: "docker_cta_clicked", data: { where: "dialog" } });
});

test("one click in the first-run dialog turns it off, and it stays off", async ({ page }) => {
  const seen = await watchUmami(page);
  await page.goto(APP);
  await expect.poll(() => seen.scripts).toBe(1);

  await page.getByRole("button", { name: "Turn off analytics" }).click();
  await expect(page.getByText("Analytics is off.")).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();
  const before = seen.sent.length;
  await page.goto(`${APP}#/tile-layout`);
  await page.waitForTimeout(500);
  expect(seen.sent.length).toBe(before);

  await page.reload();
  await page.waitForTimeout(500);
  expect(seen.scripts).toBe(1);
  expect(seen.sent.length).toBe(before);
  await expect(page.getByRole("contentinfo")).toContainText("Analytics: off");
});

for (const signal of ["doNotTrack", "globalPrivacyControl"]) {
  test(`asks Umami for nothing when the browser sends ${signal}`, async ({ page }) => {
    const seen = await watchUmami(page);
    await page.addInitScript((name) => {
      Object.defineProperty(navigator, name, { value: name === "doNotTrack" ? "1" : true });
    }, signal);
    await page.goto(APP);
    await page.getByRole("button", { name: "Got it" }).click();
    await page.goto(`${APP}#/cutting`);
    await page.waitForTimeout(500);

    expect(seen.scripts).toBe(0);
    expect(seen.sent).toHaveLength(0);
    await expect(page.getByRole("contentinfo")).toContainText(/browser asks not to be tracked/i);
  });
}
