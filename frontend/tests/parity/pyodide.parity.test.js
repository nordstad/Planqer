// Every local_api operation, run in Pyodide and in native Python, must give
// the same answer. Fixtures are seeded because the genetic solvers use random.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import manifest from "../../src/runtime/manifest.json";
import { createSolverRuntime } from "../../src/runtime/solverRuntime";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const python =
  process.env.PLANQER_PYTHON ?? join(root, "backend/.venv/bin/python");
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

function script(name, ...args) {
  return execFileSync(python, [join(root, "scripts", name), ...args], {
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

let native;
let pyodide;
let runtime;

beforeAll(async () => {
  const runtimeDir = join(root, "build/pyodide/runtime");
  const bundleDir = mkdtempSync(join(tmpdir(), "planqer-bundle-"));
  script("fetch-pyodide-runtime.py", "--out", runtimeDir);
  const bundle = script("build-pyodide-bundle.py", "--out", bundleDir)
    .trim()
    .replace(/ \(\d+ KB\)$/, "");

  native = JSON.parse(script("parity-native.py"));

  // The same self-hosted loader the browser worker imports.
  // Vite logs a missing source map for this file; it is harmless.
  const { loadPyodide } = await import(
    /* @vite-ignore */ pathToFileURL(join(runtimeDir, "pyodide.mjs")).href
  );
  runtime = createSolverRuntime({
    loadPyodide,
    runtimeUrl: `${runtimeDir}/`,
    bundleUrl: bundle,
    manifest,
    fetchBytes: async (path) => new Uint8Array(readFileSync(path)),
  });
  pyodide = await runtime.init();
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
