import { NoxTaskProvider } from "../../../src/frameworks/nox/nox-task-provider";
import { OutputChannel } from "../../../src/core/types";
import { FixtureHelper } from "../../fixtures/fixture-helpers";

// Mock child_process
jest.mock("child_process");

// Mock util with a factory function that creates the mock
jest.mock("util", () => {
  const mockExecFileAsync = jest.fn();
  return {
    promisify: jest.fn(() => mockExecFileAsync),
    // Store reference for later use
    __mockExecFileAsync: mockExecFileAsync
  };
});

// Get the mocked util module to access our mock function
const mockUtil = require("util");
const mockExecFileAsync = mockUtil.__mockExecFileAsync;

// Mock OutputChannel
const mockOutputChannel: OutputChannel = {
  append: jest.fn(),
  appendLine: jest.fn()
};

describe("NoxTaskProvider", () => {
  let provider: NoxTaskProvider;
  let validSessionsOutput: string;
  let emptySessionsOutput: string;

  beforeAll(async () => {
    // Load test fixtures from files
    validSessionsOutput = FixtureHelper.readFrameworkOutputFixture("nox", "valid-sessions.txt");
    emptySessionsOutput = FixtureHelper.readFrameworkOutputFixture("nox", "empty-sessions.txt");
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock function
    mockExecFileAsync.mockReset();
    provider = new NoxTaskProvider(mockOutputChannel);
  });

  describe("constructor", () => {
    it("should initialize with correct name", () => {
      expect(provider.name).toBe("nox");
    });
  });

  describe("getCommand", () => {
    it("should return 'nox' as command", () => {
      expect((provider as any).getCommand()).toBe("nox");
    });
  });

  describe("basic functionality", () => {
    it("should handle valid nox sessions output", async () => {
      // Mock successful execFileAsync calls 
      mockExecFileAsync
        .mockResolvedValueOnce({
          stdout: validSessionsOutput,
          stderr: ""
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { session: "tests-3.8", name: "tests-3.8", description: "Run tests with Python 3.8", python: "3.8", tags: [], call_spec: {} },
            { session: "tests-3.9", name: "tests-3.9", description: "Run tests with Python 3.9", python: "3.9", tags: [], call_spec: {} },
            { session: "lint", name: "lint", description: "Run linting checks", python: undefined, tags: [], call_spec: {} }
          ]),
          stderr: ""
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify([
            { session: "docs", name: "docs", description: "Build documentation", python: undefined, tags: [], call_spec: {} }
          ]),
          stderr: ""
        });

      const tasks = await (provider as any).listTasksForDirectory("/test/project");

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].frameworkName).toBe("nox");
      expect(tasks[0].cwd).toBe("/test/project");
    });

    it("should handle empty sessions output", async () => {
      mockExecFileAsync.mockResolvedValue({
        stdout: emptySessionsOutput,
        stderr: ""
      });

      const tasks = await (provider as any).listTasksForDirectory("/test/project");

      expect(tasks).toHaveLength(0);
    });

    it("should handle malformed nox output", async () => {
      const malformedOutput = FixtureHelper.readFrameworkOutputFixture("nox", "malformed-output.txt");
      mockExecFileAsync.mockResolvedValue({
        stdout: malformedOutput,
        stderr: ""
      });

      // Should throw an error when trying to parse malformed output
      await expect((provider as any).listTasksForDirectory("/test/project"))
        .rejects.toThrow(/Error getting nox tasks:/);
    });

    it("should handle execFile error", async () => {
      const execError = new Error("nox command failed");
      mockExecFileAsync.mockRejectedValue(execError);

      await expect((provider as any).listTasksForDirectory("/test/project"))
        .rejects.toThrow(/^Error getting nox tasks: Failed to fetch nox sessions/);
    });
  });
});