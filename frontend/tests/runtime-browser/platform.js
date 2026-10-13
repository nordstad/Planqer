// Playwright's WebKit for Linux on x64 never finishes loading scipy, which the
// first STL import needs: the worker stays in "Loading numpy, scipy" until the
// call's time limit. Found in CI and reproduced in a linux/amd64 container
// (the same test finishes in about 6 s on linux/arm64, and in a few seconds in
// WebKit on macOS, which is the engine Safari uses). Everything else, the STEP
// import included, runs in that browser; only the STL call is left out there.
//
// Run `npm run test:runtime-browser` on a Mac to cover STL in WebKit before a
// release. To look again, time one STL import in a linux/amd64 Playwright
// container and see whether "Loaded numpy, scipy" ever appears.
export const cannotLoadScipy = (browserName) =>
  browserName === "webkit" && process.platform === "linux" && process.arch === "x64";

export const SCIPY_NOTE =
  "STL import not run: scipy does not load in Playwright's WebKit on Linux x64 (see platform.js)";
