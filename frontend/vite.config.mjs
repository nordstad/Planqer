import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig(({ mode }) => {
  setEnv(mode);
  return {
    cacheDir: "node_modules/.vite_cache",
    plugins: [
      react(),
      envPlugin(),
      devServerPlugin(),
      sourcemapPlugin(),
      buildPathPlugin(),
      basePlugin(),
      importPrefixPlugin(),
      htmlPlugin(mode),
    ],
    css: {
      postcss: {
        plugins: [
          tailwindcss,
          autoprefixer,
        ],
      },
    },
    resolve: {
      alias: [{ find: /^~([^/])/, replacement: "$1" }],
      extensions: ['.mjs', '.js', '.jsx', '.json']
    },
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.jsx?$/,
      exclude: []
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },
  };
});

function setEnv(mode) {
  Object.assign(process.env, loadEnv(mode, ".", ["REACT_APP_", "NODE_ENV", "PUBLIC_URL"]));
  process.env.NODE_ENV ||= mode;
  const { homepage } = JSON.parse(readFileSync("package.json", "utf-8"));
  process.env.PUBLIC_URL ||= homepage
    ? `${homepage.startsWith("http") || homepage.startsWith("/") ? homepage : `/${homepage}`}`.replace(/\/$/, "")
    : "";
}

function envPlugin() {
  return {
    name: "env-plugin",
    config(_, { mode }) {
      const env = loadEnv(mode, ".", ["REACT_APP_", "NODE_ENV", "PUBLIC_URL"]);
      return {
        define: Object.fromEntries(
          Object.entries(env).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)])
        ),
      };
    },
  };
}

function devServerPlugin() {
  return {
    name: "dev-server-plugin",
    config(_, { mode }) {
      const { HOST, PORT, HTTPS, SSL_CRT_FILE, SSL_KEY_FILE, PLANQER_HOST } = loadEnv(mode, ".", [
        "HOST",
        "PORT",
        "HTTPS",
        "SSL_CRT_FILE",
        "SSL_KEY_FILE",
        "PLANQER_HOST",
      ]);
      const httpsEnabled = HTTPS === "true";
      // Vite rejects requests whose Host header isn't listed here. This was one
      // hardcoded homelab hostname, which meant self-hosting Planqer behind a
      // proxy on any other name was refused by the dev server — and the compose
      // deployment runs exactly this server. Loopback always works; name your
      // own host with PLANQER_HOST, the same variable the Traefik labels read.
      const extraHost = PLANQER_HOST || process.env.PLANQER_HOST;
      return {
        server: {
          host: HOST || "0.0.0.0",
          port: parseInt(PORT || "3000", 10),
          open: false, // prevent xdg-open issues in WSL/containers
          https:
            httpsEnabled && SSL_CRT_FILE && SSL_KEY_FILE
              ? {
                  cert: readFileSync(resolve(SSL_CRT_FILE)),
                  key: readFileSync(resolve(SSL_KEY_FILE)),
                }
              : false,
          allowedHosts: ['localhost', '127.0.0.1', ...(extraHost ? [extraHost] : [])],
        },
      };
    },
  };
}

function sourcemapPlugin() {
  return {
    name: "sourcemap-plugin",
    config(_, { mode }) {
      const { GENERATE_SOURCEMAP } = loadEnv(mode, ".", ["GENERATE_SOURCEMAP"]);
      return {
        build: {
          sourcemap: GENERATE_SOURCEMAP === "true",
        },
      };
    },
  };
}

function buildPathPlugin() {
  return {
    name: "build-path-plugin",
    config(_, { mode }) {
      const { BUILD_PATH } = loadEnv(mode, ".", ["BUILD_PATH"]);
      return {
        build: {
          outDir: BUILD_PATH || "build",
          minify: "esbuild",
          target: "es2018",
        },
      };
    },
  };
}

function basePlugin() {
  return {
    name: "base-plugin",
    config(_, { mode }) {
      const { PUBLIC_URL } = loadEnv(mode, ".", ["PUBLIC_URL"]);
      return {
        base: PUBLIC_URL || "/",
      };
    },
  };
}

function importPrefixPlugin() {
  return {
    name: "import-prefix-plugin",
    config() {
      return {
        resolve: {
          alias: [{ find: /^~([^/])/, replacement: "$1" }],
        },
      };
    },
  };
}

function htmlPlugin(mode) {
  const env = loadEnv(mode, ".", ["REACT_APP_", "NODE_ENV", "PUBLIC_URL"]);
  return {
    name: "html-plugin",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(/%(.*?)%/g, (match, p1) => env[p1] ?? match);
      },
    },
  };
}
