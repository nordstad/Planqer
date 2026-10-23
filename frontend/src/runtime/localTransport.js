// A stand-in for axios that answers from the in-browser solver instead of a
// server. api.js uses it in static mode, so its functions, return shapes and
// error handling stay exactly as they are.
//
// `call(op, payload, data, { timeoutMs })` is the solver client's call, and
// `handle(method, path, body)` is the local store's (null for a route it does
// not know). Routes that neither has fail with a 404 in axios's error shape.

// WebAssembly runs about 2.5 to 3 times slower than native (measured in the
// Phase 0 spike), and the callers' limits were chosen for a server.
const WASM_SLOWDOWN = 3;

const SOLVER_ROUTES = {
  "POST /cutting-plans": "cutting_plan",
  "POST /sheet-optimization": "sheet_optimization",
  "POST /tile-layout": "tile_layout",
  "POST /wallpaper-plans": "wallpaper_plan",
};

const FILE_ROUTES = {
  "POST /3d-cutlist": "cutlist_3d",
  "POST /step-cutlist": "cutlist_step",
};

// An error shaped like axios's, so api.js's extractErrorMessage and callers
// that read error.response.data.detail keep working.
function httpError(status, data) {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = { status, data, headers: {} };
  return error;
}

function routeOf(method, url) {
  const { pathname } = new URL(url, "http://localhost");
  const path = pathname.replace(/^\/api/, "").replace(/\/$/, "");
  return { path, key: `${method} ${path}` };
}

function limits(config) {
  return config?.timeout ? { timeoutMs: config.timeout * WASM_SLOWDOWN } : {};
}

async function modelRequest(form) {
  const file = form.get("file");
  const options = {
    filename: file.name,
    units: form.get("units") ?? "mm",
    round_precision: Number.parseInt(form.get("round_precision") ?? "1", 10),
  };
  const projectName = form.get("project_name");
  if (projectName) options.project_name = projectName;
  return { options, data: new Uint8Array(await file.arrayBuffer()) };
}

// A stored diagram is a data URL; callers want a file.
function imageFile(dataUrl) {
  const [header, payload] = dataUrl.split(",");
  const type = header.slice("data:".length, header.indexOf(";"));
  const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type });
}

export function createLocalTransport({ call, handle = async () => null, entries = async () => [] }) {
  async function answer(op, payload, data, config) {
    const { status, body } = await call(op, payload, data, limits(config));
    if (status >= 400) throw httpError(status, body);
    return { data: body, status, headers: {} };
  }

  async function request(method, url, body, config) {
    const { path, key } = routeOf(method, url);

    if (key in SOLVER_ROUTES) return answer(SOLVER_ROUTES[key], body, undefined, config);

    if (key in FILE_ROUTES) {
      const { options, data } = await modelRequest(body);
      return answer(FILE_ROUTES[key], options, data, config);
    }

    if (key === "GET /catalogue") {
      const country = config?.params?.country;
      return answer("catalogue", { ...(country ? { country } : {}), entries: await entries() }, undefined, config);
    }

    const stored = await handle(method, path, body, config);
    if (stored?.image) {
      return { data: imageFile(stored.image), status: 200, headers: { "content-type": "image/svg+xml" } };
    }
    if (stored) {
      if (stored.status >= 400) throw httpError(stored.status, stored.body);
      return { data: stored.body, status: stored.status, headers: {} };
    }

    throw httpError(404, { detail: `Not available in the demo: ${method} ${path}` });
  }

  return {
    get: (url, config) => request("GET", url, undefined, config),
    post: (url, data, config) => request("POST", url, data, config),
    put: (url, data, config) => request("PUT", url, data, config),
    delete: (url, config) => request("DELETE", url, undefined, config),
  };
}
