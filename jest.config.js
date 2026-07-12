/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript" },
          target: "es2022",
        },
        module: { type: "commonjs" },
      },
    ],
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/extension.ts"],
  testMatch: ["**/test/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/out/", "/dist/"],
  modulePathIgnorePatterns: ["<rootDir>/.vscode-test/"],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 15000,
  coverageThreshold: {
    "./src/core/task-manager.ts": {
      statements: 70,
      branches: 50,
      functions: 70,
      lines: 70,
    },
    "./src/frameworks/nox/nox-task-source.ts": {
      statements: 70,
      branches: 50,
      functions: 80,
      lines: 70,
    },
    "./src/vscode/native-task-service.ts": {
      statements: 55,
      branches: 25,
      functions: 55,
      lines: 55,
    },
    "./src/vscode/task-run-tracker.ts": {
      statements: 60,
      branches: 40,
      functions: 60,
      lines: 60,
    },
    "./src/vscode/workspace-task-service.ts": {
      statements: 40,
      branches: 25,
      functions: 40,
      lines: 40,
    },
    "./src/vscode/run-coordinator.ts": {
      statements: 60,
      branches: 40,
      functions: 70,
      lines: 60,
    },
  },
};
