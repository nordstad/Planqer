// Jest can't parse Vite's `import.meta.env` — this transform makes it read
// from `process.env` instead, only when running under Jest.
function importMetaEnvPlugin() {
  return {
    visitor: {
      MetaProperty(path) {
        path.replaceWithSourceString("({ env: process.env, url: 'http://localhost/' })");
      },
    },
  };
}

module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    ["@babel/preset-react", { runtime: "automatic" }],
  ],
  env: {
    test: {
      plugins: [importMetaEnvPlugin],
    },
  },
};
