// Every local_api operation, run in Pyodide and in native Python, must give
// the same answer. Fixtures are seeded because the genetic solvers use random.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { script, startRuntime } from "./startRuntime";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, "fixtures.json"), "utf-8"));

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

let native;
let pyodide;
let runtime;

beforeAll(async () => {
  native = JSON.parse(script("parity-native.py"));
  ({ runtime, pyodide } = await startRuntime());
});

const MODEL_PACKAGES = "('numpy', 'scipy', 'networkx', 'trimesh')";

function loadedModelPackages() {
  return pyodide
    .runPython(`import sys; [m for m in ${MODEL_PACKAGES} if m in sys.modules]`)
    .toJs();
}

describe("Pyodide matches native Python", () => {
  // Vitest runs a file's tests in order, so this one sees the state before
  // the model fixtures below load the 3D packages.
  it("keeps numpy, scipy, networkx and trimesh out of the solver path", async () => {
    await runtime.call("cutting_plan", fixtures[0].payload);
    await runtime.call("catalogue", { country: "SE" });

    expect(loadedModelPackages()).toEqual([]);
  });

  it.each(fixtures.map((fixture) => [fixture.name, fixture]))(
    "%s",
    async (_name, fixture) => {
      const data = fixture.file
        ? new Uint8Array(readFileSync(join(here, "files", fixture.file)))
        : undefined;
      pyodide.runPython(`import random; random.seed(${fixture.seed})`);

      const reply = await runtime.call(fixture.op, fixture.payload, data);

      expect(withoutTimings(reply)).toEqual(withoutTimings(native[fixture.name]));
    },
  );

  it("loads them when a model is imported", () => {
    expect(loadedModelPackages().sort()).toEqual(
      ["networkx", "numpy", "scipy", "trimesh"],
    );
  });
});
