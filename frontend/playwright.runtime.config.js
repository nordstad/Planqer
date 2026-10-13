// @ts-check
import { defineConfig, devices } from "@playwright/test";

// Runs the solver worker in real browsers. Needs the runtime built first:
//   npm run test:parity   (downloads it into ../build/pyodide on the first run)
// and `npx playwright install webkit` for Safari's engine.
export default defineConfig({
  testDir: "./tests/runtime-browser",
  testMatch: "*.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 300000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3002" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npx vite --config vite.runtime-harness.config.mjs",
    url: "http://127.0.0.1:3002/tests/runtime-browser/harness.html",
    reuseExistingServer: false,
    timeout: 60000,
    // api.js is built in static mode for the api.html harness.
    env: { VITE_PLANQER_MODE: "static" },
  },
});
