// Every browser spec needs the pinned Pyodide runtime and a bundle built from
// the current Python, so build both once before any of them run.

import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const python = process.env.PLANQER_PYTHON ?? join(root, "backend/.venv/bin/python");

export default function globalSetup() {
  for (const script of ["fetch-pyodide-runtime.py", "build-pyodide-bundle.py"]) {
    execFileSync(python, [join(root, "scripts", script)], { stdio: "inherit" });
  }
}
