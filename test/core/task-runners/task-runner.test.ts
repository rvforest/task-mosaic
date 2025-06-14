import { TaskRunner } from "../../../src/core/task-runners/task-runner";
import { OutputChannel } from "../../../src/core/types";
import { Task, TaskStatus } from "../../../src/core/tasks/types";
import { TaskOptions } from "../../../src/core/execution/types";

// Mock OutputChannel
const mockOutputChannel: OutputChannel = {
  append: jest.fn(),
  appendLine: jest.fn()
};

class TestTaskRunner extends TaskRunner {
  name = "test-runner";
  
  constructor() {
    super(mockOutputChannel);
  }
  
  protected async executeTask(task: Task, _options: TaskOptions): Promise<TaskStatus> {
    if (task.taskId === "failing-task") {
      return "failed";
    }
    if (task.taskId === "skipped-task") {
      return "skipped";
    }
    return "completed";
  }
}

class ErrorTaskRunner extends TaskRunner {
  name = "error-runner";
  
  constructor() {
    super(mockOutputChannel);
  }
  
  protected async executeTask(_task: Task, _options: TaskOptions): Promise<TaskStatus> {
    throw new Error("Execution error");
  }
}

describe("TaskRunner", () => {
  let runner: TestTaskRunner;
  let errorRunner: ErrorTaskRunner;
  let mockTask: Task;
  let mockOptions: TaskOptions;

  beforeEach(() => {
    runner = new TestTaskRunner();
    errorRunner = new ErrorTaskRunner();
    mockTask = {
      taskId: "test-task",
      name: "Test Task",
      cwd: "/test/path",
      frameworkName: "test-framework"
    };
    mockOptions = {
      cwd: "/test/path"
    };
    jest.clearAllMocks();
  });

  describe("name property", () => {
    it("should return the runner name", () => {
      expect(runner.name).toBe("test-runner");
    });
  });

  describe("runTask method", () => {
    it("should execute task successfully and return completed status", async () => {
      const result = await runner.runTask(mockTask, mockOptions);
      
      expect(result).toBe("completed");
    });

    it("should handle failed task execution", async () => {
      const failingTask = {
        ...mockTask,
        taskId: "failing-task"
      };
      
      const result = await runner.runTask(failingTask, mockOptions);
      
      expect(result).toBe("failed");
    });

    it("should handle skipped task execution", async () => {
      const skippedTask = {
        ...mockTask,
        taskId: "skipped-task"
      };
      
      const result = await runner.runTask(skippedTask, mockOptions);
      
      expect(result).toBe("skipped");
    });

    it("should handle execution errors", async () => {
      await expect(errorRunner.runTask(mockTask, mockOptions)).rejects.toThrow("Execution error");
    });

    it("should return the expected result from executeTask", async () => {
      const result = await runner.runTask(mockTask, mockOptions);
      
      expect(result).toBe("completed");
    });
  });
});
