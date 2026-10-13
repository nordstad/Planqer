import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// A bare dev server for tests/runtime-browser: it serves the harness page and
// the real worker modules, plus the built Pyodide runtime and bundle under
// /pyodide/ and the parity fixtures under /parity/.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const TYPES = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".zip": "application/zip",
  ".whl": "application/zip",
  ".stl": "application/octet-stream",
  ".step": "application/octet-stream",
};

function serve(prefix, directory) {
  return (request, response, next) => {
    const url = new URL(request.url, "http://localhost");
    if (!url.pathname.startsWith(prefix)) return next();
    const name = decodeURIComponent(url.pathname.slice(prefix.length));
    const file = resolve(directory, name);
    if (!file.startsWith(directory) || !existsSync(file) || !statSync(file).isFile()) {
      response.statusCode = 404;
      return response.end("not found");
    }
    response.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
    createReadStream(file).pipe(response);
  };
}

function bundleName(directory) {
  return readdirSync(directory).find((name) => /^planqer-.*\.zip$/.test(name));
}

export default defineConfig({
  root: here,
  cacheDir: "node_modules/.vite_cache_harness",
  server: { port: 3002, strictPort: true, host: "127.0.0.1" },
  plugins: [
    {
      name: "runtime-harness",
      configureServer(server) {
        const pyodide = join(root, "build/pyodide");
        server.middlewares.use((request, response, next) => {
          if (request.url === "/pyodide/bundle.zip") {
            request.url = `/pyodide/${bundleName(pyodide)}`;
          }
          next();
        });
        server.middlewares.use(serve("/pyodide/", pyodide));
        server.middlewares.use(serve("/parity/", join(here, "tests/parity")));
      },
    },
  ],
});
