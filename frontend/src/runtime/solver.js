// The browser's solver: one shared worker, created on first use.
//
// The static build serves the Pyodide runtime under <base>pyodide/runtime/ and
// the planqer bundle as <base>pyodide/bundle.zip. Only api.js in static mode
// imports this file.

import { createSolverClient } from "./solverClient";

let client = null;

function solverClient() {
  client ??= createSolverClient({
    createWorker: () =>
      new Worker(new URL("./solverWorker.js", import.meta.url), { type: "module" }),
    runtimeUrl: new URL(`${import.meta.env.BASE_URL}pyodide/runtime/`, window.location.href).href,
    bundleUrl: new URL(`${import.meta.env.BASE_URL}pyodide/bundle.zip`, window.location.href).href,
  });
  return client;
}

export const solverCall = (op, payload, data, options) =>
  solverClient().call(op, payload, data, options);

export const cancelSolver = () => client?.cancel();
