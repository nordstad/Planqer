// @ts-check
import { defineConfig, devices } from "@playwright/test";

// What the demo sends to Umami, in Chromium, with the tracker stood in for.
// The app is the static build WITH a website id, built by the web server
// command below; no runtime is needed because nothing is solved. The id is set
// here and not in package.json, because the app bundles package.json and the
// self-hosted build must never contain the id.
export default defineConfig({
  testDir: "./tests/analytics-e2e",
  testMatch: "*.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3004" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "VITE_PLANQER_UMAMI_ID=325f5fce-eb47-46fb-bad7-da1137224c33 npm run build:static && DEMO_DIR=build-static DEMO_PORT=3004 node tests/demo-e2e/serve.mjs",
    url: "http://127.0.0.1:3004/Planqer/app/",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
