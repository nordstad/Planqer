// @ts-check
import { defineConfig, devices } from "@playwright/test";

// Lite, in real browsers, served like Cloudflare Pages. Needs Lite
// built first:  python3 scripts/build-lite.py   (from the repository root)
export default defineConfig({
  testDir: "./tests/lite-e2e",
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
    command: "node tests/lite-e2e/serve.mjs",
    url: "http://127.0.0.1:3003/",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
