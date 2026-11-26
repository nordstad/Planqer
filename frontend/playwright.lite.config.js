// @ts-check
import { defineConfig, devices } from "@playwright/test";

// Lite, in real browsers, served like Cloudflare Pages. Needs Lite
// built first: python3 scripts/build-lite.py (from the repository root).
// Shared preference-denial checks also need: npm run build (from frontend/).
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
  webServer: [{
    command: "node tests/lite-e2e/serve.mjs",
    url: "http://127.0.0.1:3003/",
    reuseExistingServer: false,
    timeout: 30000,
  }, {
    command: "npx vite preview --host 127.0.0.1 --port 3004 --strictPort --outDir build",
    url: "http://127.0.0.1:3004/",
    reuseExistingServer: false,
    timeout: 30000,
  }],
});
