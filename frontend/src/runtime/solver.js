// The browser's solver: one shared worker, created on first use.
//
// The static build serves the Pyodide runtime under <base>pyodide/runtime/ and
// the planqer bundle as <base>pyodide/bundle.zip. Only api.js in static mode
// imports this file.

import { createSolverClient } from "./solverClient";
import { solverStatus } from "./solverStatus";

let client = null;

function solverClient() {
  client ??= createSolverClient({
    onProgress: (stage, details) => solverStatus.progress(stage, details),
    createWorker: () =>
      new Worker(new URL("./solverWorker.js", import.meta.url), { type: "module" }),
    runtimeUrl: new URL(`${import.meta.env.BASE_URL}pyodide/runtime/`, window.location.href).href,
    bundleUrl: new URL(`${import.meta.env.BASE_URL}pyodide/bundle.zip`, window.location.href).href,
  });
  return client;
}

export async function solverCall(op, payload, data, options) {
  solverStatus.start();
  try {
    return await solverClient().call(op, payload, data, options);
  } finally {
    solverStatus.finish();
  }
}

export const cancelSolver = () => client?.cancel();
