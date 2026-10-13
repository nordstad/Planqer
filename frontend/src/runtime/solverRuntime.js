// Runs the Python solvers (planqer.local_api) inside Pyodide.
//
// Everything that touches the outside world is passed in, so the logic can be
// tested without downloading a runtime. solverWorker.js wires in the real
// Pyodide and the network.

const BASE_PACKAGES = (manifest) => manifest.packages.base.map((p) => p.name);
const MODEL_OPERATION = "cutlist_3d";

export function createSolverRuntime({
  loadPyodide,
  runtimeUrl,
  bundleUrl,
  manifest,
  fetchBytes,
  onProgress = () => {},
}) {
  let ready = null;
  let modelPackages = null;

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

  // numpy and scipy come from Pyodide's index. networkx and trimesh are pure
  // Python wheels unpacked directly, so networkx does not drag in matplotlib.
  async function loadModelPackages(pyodide) {
    onProgress("loading-model-packages");
    await pyodide.loadPackage(
      manifest.packages.model_pyodide.map((p) => p.name),
    );
    for (const { file } of manifest.packages.model_pure) {
      const wheel = await fetchBytes(`${runtimeUrl}${file}`);
      pyodide.unpackArchive(wheel, "wheel");
    }
    onProgress("model-packages-ready");
  }

  function ensureModelPackages(pyodide) {
    modelPackages ??= loadModelPackages(pyodide).catch((error) => {
      modelPackages = null;
      throw error;
    });
    return modelPackages;
  }

  async function call(op, payload, data) {
    const pyodide = await init();
    if (op === MODEL_OPERATION) await ensureModelPackages(pyodide);
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
