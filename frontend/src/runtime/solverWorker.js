// Web Worker entry. The main thread talks to it with these messages:
//
//   -> { type: "init", runtimeUrl, bundleUrl }
//   -> { id, type: "call", op, payload, data }   (data: ArrayBuffer, optional)
//   <- { type: "progress", stage }
//   <- { id, ok: true, result: { status, body } }
//   <- { id, ok: false, error }
//
// All the logic is in solverRuntime.js; this file only connects it to
// Pyodide, the network and postMessage.

import manifest from "./manifest.json";
import { createSolverRuntime } from "./solverRuntime";

let runtime = null;

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function loadPyodide(options) {
  const { loadPyodide: load } = await import(
    /* @vite-ignore */ `${options.indexURL}pyodide.mjs`
  );
  return load(options);
}

self.onmessage = async ({ data: message }) => {
  if (message.type === "init") {
    runtime = createSolverRuntime({
      loadPyodide,
      runtimeUrl: message.runtimeUrl,
      bundleUrl: message.bundleUrl,
      manifest,
      fetchBytes,
      onProgress: (stage) => self.postMessage({ type: "progress", stage }),
    });
    return;
  }

  if (message.type === "call") {
    try {
      const data = message.data ? new Uint8Array(message.data) : null;
      const result = await runtime.call(message.op, message.payload, data);
      self.postMessage({ id: message.id, ok: true, result });
    } catch (error) {
      self.postMessage({
        id: message.id,
        ok: false,
        error: error?.message ?? String(error),
      });
    }
  }
};
