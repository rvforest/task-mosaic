import { ShellCommandTaskRunner } from "../../../src/core/task-runners/shell-command-runner";
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

// Concrete implementation for testing
class TestShellCommandRunner extends ShellCommandTaskRunner {
  name = "test-runner";
  private command: string;
  private argsToReturn: string[];
  private skipResult: boolean;

  constructor(command = "test-cmd", args: string[] = [], shouldSkip = false) {
    super(mockOutputChannel);
    this.command = command;
    this.argsToReturn = args;
    this.skipResult = shouldSkip;
  }

  protected getCommand(): string {
    return this.command;
  }

  getArgs(_task: Task, _options: TaskOptions): string[] {
    return this.argsToReturn;
  }

  isSkipped(_result: CommandResult): boolean {
    return this.skipResult;
  }

  isFailed(result: CommandResult): boolean {
    return result.code !== 0;
  }
}

describe("ShellCommandTaskRunner", () => {
  let runner: TestShellCommandRunner;
  let mockTask: Task;
  let mockOptions: TaskOptions;

  beforeEach(() => {
    runner = new TestShellCommandRunner();
    mockTask = {
      taskId: "test-task",
      name: "Test Task",
      cwd: "/test/directory",
      frameworkName: "test"
    };
    mockOptions = {
      cwd: "/test/directory"
    };
    
    // Clear all mocks
    jest.clearAllMocks();
    (mockOutputChannel.append as jest.Mock).mockClear();
    (mockOutputChannel.appendLine as jest.Mock).mockClear();
  });

  describe("executeTask", () => {
    it("should execute task successfully with exit code 0", async () => {
      // Mock successful process
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        })
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await runner.executeTask(mockTask, mockOptions);

      expect(result).toBe("completed");
      expect(mockSpawn).toHaveBeenCalledWith("test-cmd", [], { cwd: "/test/directory" });
    });

    it("should return failed status with non-zero exit code", async () => {
      // Mock failed process
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10);
          }
        })
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await runner.executeTask(mockTask, mockOptions);

      expect(result).toBe("failed");
    });

    it("should return skipped status when isSkipped returns true", async () => {
      const skipRunner = new TestShellCommandRunner("test-cmd", [], true);
      // Mock process (won't be used because task is skipped)
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        })
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await skipRunner.executeTask(mockTask, mockOptions);

      expect(result).toBe("skipped");
    });

    it("should capture and forward stdout to OutputChannel", async () => {
      const stdout_data = "This is stdout output";
      const mockProcess = {
        stdout: { 
          on: jest.fn((event: string, callback: (data: any) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(stdout_data), 10);
            }
          }) 
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 20);
          }
        })
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await runner.executeTask(mockTask, mockOptions);

      expect(mockOutputChannel.append).toHaveBeenCalledWith(stdout_data);
    });

    it("should capture and forward stderr to OutputChannel", async () => {
      const stderr_data = "This is stderr output";
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { 
          on: jest.fn((event: string, callback: (data: any) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(stderr_data), 10);
            }
          }) 
        },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 20);
          }
        })
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await runner.executeTask(mockTask, mockOptions);

      expect(mockOutputChannel.append).toHaveBeenCalledWith(stderr_data);
    });

    it("should use custom arguments from getArgs", async () => {
      const customRunner = new TestShellCommandRunner("custom-cmd", ["arg1", "arg2"]);
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        })
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await customRunner.executeTask(mockTask, mockOptions);

      expect(mockSpawn).toHaveBeenCalledWith("custom-cmd", ["arg1", "arg2"], { cwd: "/test/directory" });
    });

    it("should use task's working directory", async () => {
      const taskWithCustomCwd = { ...mockTask, cwd: "/custom/path" };
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        })
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await runner.executeTask(taskWithCustomCwd, mockOptions);

      expect(mockSpawn).toHaveBeenCalledWith("test-cmd", [], { cwd: "/custom/path" });
    });
  });

  describe("abstract method requirements", () => {
    it("should require getArgs implementation", () => {
      const args = runner.getArgs(mockTask, mockOptions);
      expect(Array.isArray(args)).toBe(true);
    });

    it("should require isSkipped implementation", () => {
      const result: CommandResult = { stdout: "", stderr: "", code: 0 };
      const skipped = runner.isSkipped(result);
      expect(typeof skipped).toBe("boolean");
    });
  });

  describe("error handling", () => {
    it("should handle process spawn errors gracefully", async () => {
      // Mock a process that fails to spawn
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(-1), 10);
          }
        })
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await runner.executeTask(mockTask, mockOptions);

      expect(result).toBe("failed");
    });
  });
});
