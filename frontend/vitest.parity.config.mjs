import { defineConfig } from "vitest/config";

// Runs the real Python in Pyodide and compares it with native Python. Needs
// network on the first run (the runtime is downloaded once into ../build), so
// it is not part of `npm test`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/parity/**/*.test.js"],
    testTimeout: 120000,
    hookTimeout: 300000,
  },
});
