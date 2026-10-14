// @ts-check
import { defineConfig, devices } from "@playwright/test";

// The built demo, in real browsers, served like GitHub Pages. Needs the demo
// built first:  python3 scripts/build-demo.py   (from the repository root)
export default defineConfig({
  testDir: "./tests/demo-e2e",
  testMatch: "*.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3003" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node tests/demo-e2e/serve.mjs",
    url: "http://127.0.0.1:3003/Planqer/app/",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
