const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  collectCoverageFrom: [
    "src/**/*.{ts,js}",
    "!src/types.ts", // Exclude types if desired
  ],
  // Only run TypeScript test files, not compiled JavaScript versions
  testMatch: [
    "**/test/**/*.test.ts"
  ],
  // Explicitly ignore compiled JavaScript test files
  testPathIgnorePatterns: [
    "/node_modules/",
    "/out/"
  ],
  // Ensure tests complete properly
  testTimeout: 10000,
  // Clear mocks and timers after each test
  clearMocks: true,
  restoreMocks: true,
  // Detect async operations that don't complete
  detectOpenHandles: false,
  // Force exit after tests complete
  forceExit: false,
};