module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.cjs"],
  testMatch: ["<rootDir>/src/**/*.test.jsx"],
  clearMocks: true,
  transform: {
    "^.+\\.jsx?$": "babel-jest",
  },
};
