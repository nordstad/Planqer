// Runs the Python solvers (planqer.local_api) inside Pyodide.
//
// Everything that touches the outside world is passed in, so the logic can be
// tested without downloading a runtime. solverWorker.js wires in the real
// Pyodide and the network.

const BASE_PACKAGES = (manifest) => manifest.packages.base.map((p) => p.name);

export function createSolverRuntime({
  loadPyodide,
  runtimeUrl,
  bundleUrl,
  manifest,
  fetchBytes,
  onProgress = () => {},
}) {
  let ready = null;

  async function start() {
    onProgress("loading-runtime");
    const pyodide = await loadPyodide({ indexURL: runtimeUrl });
    await pyodide.loadPackage(BASE_PACKAGES(manifest));

    onProgress("loading-solvers");
    const bundle = await fetchBytes(bundleUrl);
    const sitePackages = pyodide.runPython(
      "import site; site.getsitepackages()[0]",
    );
    pyodide.unpackArchive(bundle, "zip", { extractDir: sitePackages });
    pyodide.runPython(`
import json
from planqer.local_api import handle

def call_local_api(op, payload, data):
    return handle(op, payload, None if data is None else bytes(data.to_py()))
`);
    onProgress("ready");
    return pyodide;
  }

  function init() {
    ready ??= start().catch((error) => {
      ready = null;
      throw error;
    });
    return ready;
  }

  async function call(op, payload, data) {
    const pyodide = await init();
    // undefined becomes Python None; null would arrive as a JsNull object.
    const callLocalApi = pyodide.globals.get("call_local_api");
    try {
      const reply = callLocalApi(op, JSON.stringify(payload), data ?? undefined);
      return JSON.parse(reply);
    } finally {
      callLocalApi.destroy?.();
    }
  }

  return { init, call };
}
