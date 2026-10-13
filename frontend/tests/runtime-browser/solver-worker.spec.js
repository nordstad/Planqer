// The solver worker in real browsers: the same fixtures as the Node parity
// test, plus timeout-free cancel and progress on a heavy tile layout. Records
// start-up and solve times (printed, and attached to the report).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const python = process.env.PLANQER_PYTHON ?? join(root, "backend/.venv/bin/python");
const fixtures = JSON.parse(
  readFileSync(join(here, "../parity/fixtures.json"), "utf-8"),
);

// The worker has no seed hook, so the genetic solvers cannot be compared
// exactly here; the Node parity test already does that. They must still run.
const UNSEEDED = new Set(["board_genetic", "sheet_genetic_2d"]);
const TIMING_KEYS = new Set(["computation_time", "processing_time"]);

function withoutTimings(value) {
  if (Array.isArray(value)) return value.map(withoutTimings);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !TIMING_KEYS.has(key))
        .map(([key, inner]) => [key, withoutTimings(inner)]),
    );
  }
  return value;
}

function script(name, ...args) {
  return execFileSync(python, [join(root, "scripts", name), ...args], {
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

let native;

test.beforeAll(() => {
  script("fetch-pyodide-runtime.py");
  script("build-pyodide-bundle.py");
  native = JSON.parse(script("parity-native.py"));
});

async function openHarness(page) {
  await page.goto("/tests/runtime-browser/harness.html");
  await page.waitForFunction(() => window.harnessReady === true);
}

test("every fixture runs in a real Web Worker and matches native Python", async ({
  page,
}, info) => {
  await openHarness(page);

  const run = await page.evaluate(async (list) => {
    const started = performance.now();
    const results = {};
    for (const fixture of list) {
      let data;
      if (fixture.file) {
        const response = await fetch(`/parity/files/${fixture.file}`);
        data = new Uint8Array(await response.arrayBuffer());
      }
      const begin = performance.now();
      results[fixture.name] = {
        reply: await window.harness.client.call(fixture.op, fixture.payload, data, {
          timeoutMs: 120000,
        }),
        ms: Math.round(performance.now() - begin),
      };
    }
    return {
      results,
      totalMs: Math.round(performance.now() - started),
      stages: window.harness.progress
        .filter((entry) => entry.stage !== "solving")
        .map((entry) => ({ stage: entry.stage, at: Math.round(entry.at) })),
    };
  }, fixtures);

  for (const fixture of fixtures) {
    const { reply } = run.results[fixture.name];
    if (UNSEEDED.has(fixture.name)) {
      expect(reply.status, fixture.name).toBe(200);
    } else {
      expect(withoutTimings(reply), fixture.name).toEqual(
        withoutTimings(native[fixture.name]),
      );
    }
  }

  const timings = Object.fromEntries(
    Object.entries(run.results).map(([name, { ms }]) => [name, ms]),
  );
  const summary = { browser: info.project.name, totalMs: run.totalMs, stages: run.stages, timings };
  console.log(JSON.stringify(summary));
  await info.attach("timings.json", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
});

const HEAVY_TILES = {
  surface_width: 6000,
  surface_height: 4500,
  tile: { width: 600, height: 300 },
  bond: { pattern: "diagonal" },
  candidate_count: 3,
};

test("a heavy diagonal tile layout reports progress and can be cancelled", async ({
  page,
}) => {
  await openHarness(page);

  const outcome = await page.evaluate(async (payload) => {
    const { client, progress } = window.harness;
    await client.call("catalogue", { country: "SE" });

    const heavy = client
      .call("tile_layout", payload, undefined, { timeoutMs: 120000 })
      .then(() => ({ name: "finished" }), (error) => ({ name: error.name }));
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const ticks = progress.filter((entry) => entry.stage === "solving").length;
    client.cancel();
    const cancelled = await heavy;

    const afterwards = await client.call("catalogue", { country: "SE" });
    return { ticks, cancelled, afterwards: afterwards.status };
  }, HEAVY_TILES);

  expect(outcome.ticks).toBeGreaterThanOrEqual(2);
  expect(outcome.cancelled.name).toBe("SolverCancelledError");
  expect(outcome.afterwards).toBe(200);
});

test("the heavy diagonal layout finishes inside the browser, timed", async ({
  page,
}, info) => {
  await openHarness(page);

  const result = await page.evaluate(async (payload) => {
    const { client } = window.harness;
    await client.call("catalogue", { country: "SE" });
    const begin = performance.now();
    const reply = await client.call("tile_layout", payload, undefined, {
      timeoutMs: 120000,
    });
    return { status: reply.status, ms: Math.round(performance.now() - begin) };
  }, HEAVY_TILES);

  console.log(JSON.stringify({ browser: info.project.name, heavyDiagonalMs: result.ms }));
  expect(result.status).toBe(200);
});
