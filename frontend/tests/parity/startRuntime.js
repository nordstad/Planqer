// Boots the real Pyodide runtime in Node, the way the browser worker does, for
// the parity tests: fetches and verifies the pinned files, builds the bundle,
// and returns the solver runtime plus the repository paths the tests need.

import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import manifest from "../../src/runtime/manifest.json";
import { createSolverRuntime } from "../../src/runtime/solverRuntime";

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, "../../..");
export const python = process.env.PLANQER_PYTHON ?? join(root, "backend/.venv/bin/python");

export function script(name, ...args) {
  return execFileSync(python, [join(root, "scripts", name), ...args], {
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

export async function startRuntime() {
  const runtimeDir = join(root, "build/pyodide/runtime");
  const bundleDir = mkdtempSync(join(tmpdir(), "planqer-bundle-"));
  script("fetch-pyodide-runtime.py", "--out", runtimeDir);
  const bundle = script("build-pyodide-bundle.py", "--out", bundleDir)
    .trim()
    .replace(/ \(\d+ KB\)$/, "");

  // Vite logs a missing source map for this file; it is harmless.
  const { loadPyodide } = await import(
    /* @vite-ignore */ pathToFileURL(join(runtimeDir, "pyodide.mjs")).href
  );
  const runtime = createSolverRuntime({
    loadPyodide,
    runtimeUrl: `${runtimeDir}/`,
    bundleUrl: bundle,
    manifest,
    fetchBytes: async (path) => new Uint8Array(readFileSync(path)),
  });
  return { runtime, pyodide: await runtime.init() };
}
