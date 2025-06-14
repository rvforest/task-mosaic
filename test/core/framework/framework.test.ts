import { Framework } from "../../../src/core/framework/framework";
import { TaskProvider } from "../../../src/core/task-providers/task-provider";
import { TaskRunner } from "../../../src/core/task-runners/task-runner";
import { OutputChannel } from "../../../src/core/types";
import { Task } from "../../../src/core/tasks/types";
import { TaskStatus } from "../../../src/core/tasks/types";
import { TaskOptions } from "../../../src/core/execution/types";

// Mock OutputChannel
const mockOutputChannel: OutputChannel = {
  append: jest.fn(),
  appendLine: jest.fn()
};

// Mock implementations for testing
class MockTaskProvider extends TaskProvider {
  name = "mock-provider";
  
  constructor() {
    super(mockOutputChannel);
  }
  
  protected getCommand(): string {
    return "mock-command";
  }
  
  protected async listTasksForDirectory(directory: string): Promise<Task[]> {
    return [];
  }
}

class MockTaskRunner extends TaskRunner {
  name = "mock-runner";
  
  constructor() {
    super(mockOutputChannel);
  }
  
  protected async executeTask(task: Task, options: TaskOptions): Promise<TaskStatus> {
    return "completed";
  }
}

class TestFramework extends Framework {
  name = "test-framework";
  
  constructor() {
    super(new MockTaskProvider(), new MockTaskRunner(), mockOutputChannel);
  }
  
  protected async detectInDirectory(directory: string): Promise<boolean> {
    return directory.includes("test-project");
  }
  
  getCommand(): string {
    return "test-command";
  }
}

class ErrorFramework extends Framework {
  name = "error-framework";
  
  constructor() {
    super(new MockTaskProvider(), new MockTaskRunner(), mockOutputChannel);
  }
  
  protected async detectInDirectory(directory: string): Promise<boolean> {
    throw new Error("Detection error");
  }
  
  getCommand(): string {
    return "error-command";
  }
}

describe("Framework", () => {
  let framework: TestFramework;
  let errorFramework: ErrorFramework;

  beforeEach(() => {
    framework = new TestFramework();
    errorFramework = new ErrorFramework();
  });

  describe("name property", () => {
    it("should return the framework name", () => {
      expect(framework.name).toBe("test-framework");
    });
  });

  describe("detect method", () => {
    it("should return true when any directory matches", async () => {
      const directories = ["path/to/test-project", "other/path"];
      const result = await framework.detect(directories);
      expect(result).toBe(true);
    });

    it("should return false when no directories match", async () => {
      const directories = ["path/to/other", "another/path"];
      const result = await framework.detect(directories);
      expect(result).toBe(false);
    });

    it("should return false for empty directory list", async () => {
      const directories: string[] = [];
      const result = await framework.detect(directories);
      expect(result).toBe(false);
    });

    it("should handle detection errors by rethrowing", async () => {
      const directories = ["some/path"];
      await expect(errorFramework.detect(directories)).rejects.toThrow("Detection error");
    });
  });

  describe("provider property", () => {
    it("should return the TaskProvider instance", () => {
      expect(framework.provider).toBeInstanceOf(TaskProvider);
      expect(framework.provider.name).toBe("mock-provider");
    });
  });

  describe("runner property", () => {
    it("should return the TaskRunner instance", () => {
      expect(framework.runner).toBeInstanceOf(TaskRunner);
      expect(framework.runner.name).toBe("mock-runner");
    });
  });

  describe("getCommand method", () => {
    it("should return the framework command", () => {
      const command = framework.getCommand();
      expect(command).toBe("test-command");
    });
  });
});
