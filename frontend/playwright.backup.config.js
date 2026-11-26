import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Native IndexedDB atomicity plus real-worker saved-record validation.
export default defineConfig({
  ...base,
  testMatch: /backup-(atomicity|validation)\.e2e\.spec\.js/,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
