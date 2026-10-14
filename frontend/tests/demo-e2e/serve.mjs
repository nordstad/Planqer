// Serves the built demo the way GitHub Pages will: under /Planqer/app/, with
// real 404s and no fallback to index.html. If the demo only works behind a
// forgiving dev server, it must fail here.

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.env.DEMO_DIR ?? join(here, "../../../build/demo"));
const port = Number(process.env.DEMO_PORT ?? 3003);
const prefix = "/Planqer/app/";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".zip": "application/zip",
  ".whl": "application/zip",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
};

createServer((request, response) => {
  const { pathname } = new URL(request.url, "http://localhost");

  if (pathname === prefix.slice(0, -1)) {
    response.writeHead(301, { location: prefix }).end();
    return;
  }
  if (!pathname.startsWith(prefix)) {
    response.writeHead(404).end("Not found");
    return;
  }

  let file = normalize(join(root, decodeURIComponent(pathname.slice(prefix.length))));
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    response.writeHead(404).end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`demo at http://127.0.0.1:${port}${prefix} from ${root}`));
