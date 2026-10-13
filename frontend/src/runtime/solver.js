// The browser's solver: one shared worker, created on first use.
//
// The static build serves the Pyodide runtime under <base>pyodide/runtime/ and
// the planqer bundle as <base>pyodide/bundle.zip. Only api.js in static mode
// imports this file.

import i18n from "../i18n";
import { createSolverClient, SolverCancelledError, SolverTimeoutError } from "./solverClient";
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

// What reaches the tool pages is shown to the user as it is, so the engine's
// own English messages are replaced by translated ones.
function readable(error) {
  const t = (key, values) => i18n.t(key, values);
  if (error instanceof SolverCancelledError) return new Error(t("demo.solver.cancelled"), { cause: error });
  if (error instanceof SolverTimeoutError) {
    return new Error(t("demo.solver.timedOut", { seconds: error.timeoutMs / 1000 }), { cause: error });
  }
  return new Error(t("demo.solver.failed"), { cause: error });
}

const supported = () => typeof WebAssembly !== "undefined" && typeof Worker !== "undefined";

export async function solverCall(op, payload, data, options) {
  if (!supported()) throw new Error(i18n.t("demo.solver.unsupported"));
  solverStatus.start();
  try {
    return await solverClient().call(op, payload, data, options);
  } catch (error) {
    throw readable(error);
  } finally {
    solverStatus.finish();
  }
}

export const cancelSolver = () => client?.cancel();
