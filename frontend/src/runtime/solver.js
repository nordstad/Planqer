// The browser's solver: one shared worker, created on first use.
//
// The static build serves the Pyodide runtime under <base>pyodide/runtime/ and
// the planqer bundle as <base>pyodide/bundle.zip. Only api.js in static mode
// imports this file.

import i18n from "../i18n";
import { createSolverClient, SolverCancelledError, SolverTimeoutError } from "./solverClient";
import { solverStatus } from "./solverStatus";
import { partsBucket, track } from "../utils/analytics";

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

const TOOL = {
  cutting_plan: "board",
  sheet_optimization: "sheet",
  tile_layout: "tile",
  cutlist_3d: "model",
  cutlist_step: "model",
};
const MODEL_TYPE = { cutlist_3d: "stl", cutlist_step: "step" };

// Only a count, in a bucket: what the parts are never reaches analytics.
function partCount(payload) {
  const parts = payload?.parts;
  if (!parts || typeof parts !== "object") return undefined;
  const entries = Array.isArray(parts) ? parts : Object.values(parts);
  return entries.reduce((sum, part) => sum + (typeof part === "number" ? part : (part?.quantity ?? 1)), 0);
}

function countResult(op, payload, status) {
  const tool = TOOL[op];
  if (!tool) return;
  if (status !== 200) return track("solve_failed", { tool, reason: "rejected" });
  const count = partCount(payload);
  track("solve_completed", count === undefined ? { tool } : { tool, size: partsBucket(count) });
  if (MODEL_TYPE[op]) track("model_imported", { type: MODEL_TYPE[op] });
}

function countFailure(op, error) {
  if (error instanceof SolverCancelledError) return;
  if (error instanceof SolverTimeoutError) {
    if (TOOL[op]) track("solve_failed", { tool: TOOL[op], reason: "timeout" });
    return;
  }
  track("runtime_error", { reason: "engine" });
}

const supported = () => typeof WebAssembly !== "undefined" && typeof Worker !== "undefined";

export async function solverCall(op, payload, data, options) {
  if (!supported()) {
    track("runtime_error", { reason: "unsupported" });
    throw new Error(i18n.t("demo.solver.unsupported"));
  }
  solverStatus.start();
  try {
    const result = await solverClient().call(op, payload, data, options);
    countResult(op, payload, result?.status);
    return result;
  } catch (error) {
    countFailure(op, error);
    throw readable(error);
  } finally {
    solverStatus.finish();
  }
}

export const cancelSolver = () => client?.cancel();
