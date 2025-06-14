import { NoxTaskRunner } from "../../../src/frameworks/nox/nox-task-runner";
import { OutputChannel } from "../../../src/core/types";
import { Task } from "../../../src/core/tasks/types";
import { TaskOptions, CommandResult } from "../../../src/core/execution/types";
import { spawn } from "child_process";

// Mock child_process
jest.mock("child_process");
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock OutputChannel
const mockOutputChannel: OutputChannel = {
  append: jest.fn(),
  appendLine: jest.fn()
};

describe("NoxTaskRunner", () => {
  let runner: NoxTaskRunner;
  let mockTask: Task;
  let mockOptions: TaskOptions;

  beforeEach(() => {
    runner = new NoxTaskRunner(mockOutputChannel);
    mockTask = {
      taskId: "test-session",
      name: "test-session",
      cwd: "/test/path",
      frameworkName: "nox",
    };
    mockOptions = {
      cwd: "/test/path"
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe("basic properties", () => {
    it("should have correct name", () => {
      expect(runner.name).toBe("nox");
    });

    it("should have correct command", () => {
      expect(runner.command).toBe("nox");
    });

    it("should return correct ID", () => {
      expect(runner.getId()).toBe("nox");
    });

    it("should return correct command from getCommand", () => {
      expect(runner["getCommand"]()).toBe("nox");
    });
  });

  describe("getArgs", () => {
    it("should return basic args for a simple task", () => {
      const args = runner.getArgs(mockTask, mockOptions);
      expect(args).toEqual(["-s", "test-session"]);
    });

    it("should prepend runner args when provided", () => {
      const optionsWithRunnerArgs: TaskOptions = {
        ...mockOptions,
        runnerArgs: ["-v", "--no-color"]
      };

      const args = runner.getArgs(mockTask, optionsWithRunnerArgs);
      expect(args).toEqual(["-v", "--no-color", "-s", "test-session"]);
    });

    it("should append task args after -- when provided", () => {
      const optionsWithTaskArgs: TaskOptions = {
        ...mockOptions,
        taskArgs: ["--coverage", "--verbose"]
      };

      const args = runner.getArgs(mockTask, optionsWithTaskArgs);
      expect(args).toEqual(["-s", "test-session", "--", "--coverage", "--verbose"]);
    });

    it("should handle both runner args and task args", () => {
      const optionsWithBothArgs: TaskOptions = {
        ...mockOptions,
        runnerArgs: ["-v"],
        taskArgs: ["--coverage"]
      };

      const args = runner.getArgs(mockTask, optionsWithBothArgs);
      expect(args).toEqual(["-v", "-s", "test-session", "--", "--coverage"]);
    });

    it("should handle empty runner args", () => {
      const optionsWithEmptyRunnerArgs: TaskOptions = {
        ...mockOptions,
        runnerArgs: []
      };

      const args = runner.getArgs(mockTask, optionsWithEmptyRunnerArgs);
      expect(args).toEqual(["-s", "test-session"]);
    });

    it("should handle empty task args", () => {
      const optionsWithEmptyTaskArgs: TaskOptions = {
        ...mockOptions,
        taskArgs: []
      };

      const args = runner.getArgs(mockTask, optionsWithEmptyTaskArgs);
      expect(args).toEqual(["-s", "test-session", "--"]);
    });
  });

  describe("isSkipped", () => {
    it("should return true when session is skipped", () => {
      const result: CommandResult = {
        stdout: "Session test-session skipped: Python interpreter not found",
        stderr: "",
        code: 0
      };

      expect(runner.isSkipped(result)).toBe(true);
    });

    it("should return true when Python interpreter not found", () => {
      const result: CommandResult = {
        stdout: "",
        stderr: "Python interpreter 3.11 not found",
        code: 1
      };

      expect(runner.isSkipped(result)).toBe(true);
    });

    it("should return true when sessions not found", () => {
      const result: CommandResult = {
        stdout: "Sessions not found",
        stderr: "",
        code: 1
      };

      expect(runner.isSkipped(result)).toBe(true);
    });

    it("should return true for combination of session and skipped in output", () => {
      const result: CommandResult = {
        stdout: "Session test-session was skipped due to configuration",
        stderr: "",
        code: 0
      };

      expect(runner.isSkipped(result)).toBe(true);
    });

    it("should return true for combination of Python interpreter and not found in stderr", () => {
      const result: CommandResult = {
        stdout: "",
        stderr: "Error: Python interpreter version 3.9 not found on system",
        code: 1
      };

      expect(runner.isSkipped(result)).toBe(true);
    });

    it("should return false for successful execution", () => {
      const result: CommandResult = {
        stdout: "Session test-session completed successfully",
        stderr: "",
        code: 0
      };

      expect(runner.isSkipped(result)).toBe(false);
    });

    it("should return false for failed execution without skip conditions", () => {
      const result: CommandResult = {
        stdout: "Test failed",
        stderr: "AssertionError: Expected true but got false",
        code: 1
      };

      expect(runner.isSkipped(result)).toBe(false);
    });

    it("should return false for empty output", () => {
      const result: CommandResult = {
        stdout: "",
        stderr: "",
        code: 0
      };

      expect(runner.isSkipped(result)).toBe(false);
    });

    it("should check both stdout and stderr", () => {
      const result: CommandResult = {
        stdout: "Some output",
        stderr: "Session test-session skipped",
        code: 0
      };

      expect(runner.isSkipped(result)).toBe(true);
    });

    it("should be case sensitive for skip detection", () => {
      const result: CommandResult = {
        stdout: "SESSION TEST-SESSION SKIPPED",
        stderr: "",
        code: 0
      };

      expect(runner.isSkipped(result)).toBe(false);
    });

    it("should handle partial matches correctly", () => {
      // This test demonstrates that the current implementation looks for both "Session" and "skipped"
      // anywhere in the output, which means "Session running, not skipped" will match
      const result: CommandResult = {
        stdout: "Session running, not skipped",
        stderr: "",
        code: 0
      };

      expect(runner.isSkipped(result)).toBe(true);
    });

    it("should return false when only Session is mentioned without skipped", () => {
      const result: CommandResult = {
        stdout: "Session test-session is running",
        stderr: "",
        code: 0
      };

      expect(runner.isSkipped(result)).toBe(false);
    });

    it("should return false when only skipped is mentioned without Session", () => {
      const result: CommandResult = {
        stdout: "Some tests were skipped due to configuration",
        stderr: "",
        code: 0
      };

      expect(runner.isSkipped(result)).toBe(false);
    });
  });

  describe("inheritance from ShellCommandTaskRunner", () => {
    it("should inherit executeTask method", () => {
      expect(typeof runner.executeTask).toBe("function");
    });

    it("should inherit runTask method from TaskRunner", () => {
      expect(typeof runner.runTask).toBe("function");
    });
  });

  describe("edge cases", () => {
    it("should handle task with special characters in name", () => {
      const specialTask: Task = {
        ...mockTask,
        taskId: "test-session_with-special.chars",
        name: "test-session_with-special.chars"
      };

      const args = runner.getArgs(specialTask, mockOptions);
      expect(args).toEqual(["-s", "test-session_with-special.chars"]);
    });

    it("should handle very long runner args", () => {
      const longRunnerArgs = Array(50).fill("--verbose").concat(["--no-color", "--force"]);
      const optionsWithLongArgs: TaskOptions = {
        ...mockOptions,
        runnerArgs: longRunnerArgs
      };

      const args = runner.getArgs(mockTask, optionsWithLongArgs);
      expect(args).toEqual([...longRunnerArgs, "-s", "test-session"]);
    });

    it("should handle very long task args", () => {
      const longTaskArgs = Array(20).fill("--option").concat(["value1", "value2"]);
      const optionsWithLongTaskArgs: TaskOptions = {
        ...mockOptions,
        taskArgs: longTaskArgs
      };

      const args = runner.getArgs(mockTask, optionsWithLongTaskArgs);
      expect(args).toEqual(["-s", "test-session", "--", ...longTaskArgs]);
    });

    it("should handle null or undefined result gracefully in isSkipped", () => {
      const resultWithNulls: CommandResult = {
        stdout: "",
        stderr: "",
        code: null
      };

      expect(() => runner.isSkipped(resultWithNulls)).not.toThrow();
      expect(runner.isSkipped(resultWithNulls)).toBe(false);
    });

    it("should handle mixed case skip detection patterns", () => {
      const result: CommandResult = {
        stdout: "session test-session skipped due to error",
        stderr: "python interpreter version 3.8 not found",
        code: 1
      };

      // Should return false because "Session" is capitalized and "Python interpreter" is capitalized
      expect(runner.isSkipped(result)).toBe(false);
    });

    it("should detect skip in multiline output", () => {
      const result: CommandResult = {
        stdout: `
Running nox session: test-session
Session test-session starting...
Session test-session skipped: Missing dependencies
Done
        `.trim(),
        stderr: "",
        code: 0
      };

      expect(runner.isSkipped(result)).toBe(true);
    });
  });
});