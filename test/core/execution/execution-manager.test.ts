import { ExecutionManager } from "../../../src/core/execution/execution-manager";
import { Task } from "../../../src/core/tasks/types";
import { TaskOptions, ExecutionObserver, TaskExecution } from "../../../src/core/execution/types";
import { FrameworkRegistry } from "../../../src/core/framework/framework-registry";
import { Framework } from "../../../src/core/framework/framework";
import { TaskProvider } from "../../../src/core/task-providers/task-provider";
import { TaskRunner } from "../../../src/core/task-runners/task-runner";
import { OutputChannel } from "../../../src/core/types";

// Mock FrameworkRegistry
jest.mock("../../../src/core/framework/framework-registry");
const mockFrameworkRegistry = FrameworkRegistry as jest.Mocked<typeof FrameworkRegistry>;

// Mock OutputChannel
const mockOutputChannel: OutputChannel = {
  append: jest.fn(),
  appendLine: jest.fn()
};

// Mock TaskProvider
class MockTaskProvider extends TaskProvider {
  name = "mock-provider";
  constructor() { super(mockOutputChannel); }
  
  protected getCommand(): string { return "mock-cmd"; }
  protected async listTasksForDirectory(): Promise<Task[]> { return []; }
  async listTasks(): Promise<Task[]> { return []; }
}

// Mock TaskRunner
class MockTaskRunner extends TaskRunner {
  name = "mock-runner";
  private shouldSucceed: boolean;
  private executionDelay: number;

  constructor(shouldSucceed = true, executionDelay = 100) {
    super(mockOutputChannel);
    this.shouldSucceed = shouldSucceed;
    this.executionDelay = executionDelay;
  }

  protected async executeTask(): Promise<"completed" | "failed" | "skipped"> {
    // Add delay to simulate real execution
    await new Promise(resolve => setTimeout(resolve, this.executionDelay));
    const result = this.shouldSucceed ? "completed" : "failed";
    
    // If the task should fail, throw an error to trigger the ExecutionManager's error handling
    if (result === "failed") {
      throw new Error("Task execution failed");
    }
    
    return result;
  }
}

// Mock Framework
class MockFramework extends Framework {
  name = "mock-framework";
  
  constructor() {
    super(new MockTaskProvider(), new MockTaskRunner(), mockOutputChannel);
  }
  
  getCommand(): string { return "mock-cmd"; }
  protected async detectInDirectory(): Promise<boolean> { return true; }
}

describe("ExecutionManager", () => {
  let executionManager: ExecutionManager;
  let mockTask: Task;
  let mockOptions: TaskOptions;
  let mockFramework: MockFramework;

  beforeEach(() => {
    executionManager = new ExecutionManager();
    mockTask = {
      taskId: "test-task",
      name: "Test Task",
      cwd: "/test/directory",
      frameworkName: "mock-framework"
    };
    mockOptions = {
      cwd: "/test/directory"
    };
    mockFramework = new MockFramework();
    
    // Setup framework registry mock
    mockFrameworkRegistry.getFramework.mockReturnValue(mockFramework);
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe("executeTask", () => {
    it("should execute a task successfully", async () => {
      const execution = await executionManager.executeTask(mockTask, mockOptions);

      expect(execution).toBeDefined();
      expect(execution.task).toEqual(mockTask);
      expect(execution.status).toBe("pending"); // Initially pending
      expect(execution.id).toBeDefined();
      expect(execution.startTime).toBeDefined();
      
      // Wait for async execution to start
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Now it should be running
      const updatedExecution = executionManager.getExecution(execution.id);
      expect(updatedExecution?.status).toBe("running");
    });

    it("should add execution to active executions", async () => {
      const execution = await executionManager.executeTask(mockTask, mockOptions);
      const activeExecutions = executionManager.getActiveExecutions();

      expect(activeExecutions).toHaveLength(1);
      expect(activeExecutions[0].id).toBe(execution.id);
      expect(activeExecutions[0].task).toEqual(execution.task);
    });

    it("should validate framework exists before execution", async () => {
      mockFrameworkRegistry.getFramework.mockReturnValue(undefined);

      await expect(executionManager.executeTask(mockTask, mockOptions))
        .rejects.toThrow("Framework 'mock-framework' not found");
    });

    it("should enforce concurrent execution limits", async () => {
      // Use longer running tasks so they don't complete before we start the 6th
      const longRunningTaskRunner = new MockTaskRunner(true, 500);
      const longRunningFramework = new MockFramework();
      longRunningFramework.runner = longRunningTaskRunner;
      mockFrameworkRegistry.getFramework.mockReturnValue(longRunningFramework);

      // Start 5 executions (the default limit)
      const executions: TaskExecution[] = [];
      for (let i = 0; i < 5; i++) {
        const task = { ...mockTask, taskId: `test-task-${i}`, name: `Test Task ${i}` };
        executions.push(await executionManager.executeTask(task, mockOptions));
      }

      // Wait a bit for executions to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // The 6th execution should be rejected
      const sixthTask = { ...mockTask, taskId: "test-task-6", name: "Test Task 6" };
      await expect(executionManager.executeTask(sixthTask, mockOptions))
        .rejects.toThrow("Maximum concurrent executions (5) reached");
    });

    it("should generate unique execution IDs", async () => {
      const execution1 = await executionManager.executeTask(mockTask, mockOptions);
      const task2 = { ...mockTask, taskId: "test-task-2", name: "Test Task 2" };
      const execution2 = await executionManager.executeTask(task2, mockOptions);

      expect(execution1.id).not.toBe(execution2.id);
    });
  });

  describe("getExecution", () => {
    it("should return active execution by ID", async () => {
      const execution = await executionManager.executeTask(mockTask, mockOptions);
      const retrieved = executionManager.getExecution(execution.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(execution.id);
    });

    it("should return undefined for non-existent execution ID", () => {
      const retrieved = executionManager.getExecution("non-existent-id");
      expect(retrieved).toBeUndefined();
    });

    it("should return execution from history", async () => {
      const execution = await executionManager.executeTask(mockTask, mockOptions);
      
      // Wait for execution to complete and move to history
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const retrieved = executionManager.getExecution(execution.id);
      expect(retrieved).toBeDefined();
    });
  });

  describe("getActiveExecutions", () => {
    it("should return empty array when no executions are active", () => {
      const activeExecutions = executionManager.getActiveExecutions();
      expect(activeExecutions).toEqual([]);
    });

    it("should return all active executions", async () => {
      const execution1 = await executionManager.executeTask(mockTask, mockOptions);
      
      // Wait for first execution to start running before starting second
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const task2 = { ...mockTask, taskId: "test-task-2", name: "Test Task 2" };
      const execution2 = await executionManager.executeTask(task2, mockOptions);

      const activeExecutions = executionManager.getActiveExecutions();
      expect(activeExecutions).toHaveLength(2);
      expect(activeExecutions.map(e => e.id)).toContain(execution1.id);
      expect(activeExecutions.map(e => e.id)).toContain(execution2.id);
    });
  });

  describe("getExecutionHistory", () => {
    it("should return empty array when no executions have completed", () => {
      const history = executionManager.getExecutionHistory();
      expect(history).toEqual([]);
    });

    it("should return completed executions in history", async () => {
      await executionManager.executeTask(mockTask, mockOptions);
      
      // Wait for execution to complete and move to history
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const history = executionManager.getExecutionHistory();
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe("clearHistory", () => {
    it("should clear execution history", async () => {
      await executionManager.executeTask(mockTask, mockOptions);
      
      // Wait for execution to complete and move to history
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify history has items
      expect(executionManager.getExecutionHistory().length).toBeGreaterThan(0);
      
      // Clear history
      executionManager.clearHistory();
      
      // Verify history is empty
      expect(executionManager.getExecutionHistory()).toEqual([]);
    });
  });

  describe("observer management", () => {
    let mockObserver: ExecutionObserver;

    beforeEach(() => {
      mockObserver = {
        onExecutionStarted: jest.fn(),
        onExecutionCompleted: jest.fn(),
        onExecutionFailed: jest.fn(),
        onStateChanged: jest.fn(),
        onOutputReceived: jest.fn()
      };
    });

    it("should add observers", () => {
      executionManager.addObserver(mockObserver);
      // No direct way to verify, but this should not throw
    });

    it("should remove observers", () => {
      executionManager.addObserver(mockObserver);
      executionManager.removeObserver(mockObserver);
      // No direct way to verify, but this should not throw
    });

    it("should notify observers when execution starts", async () => {
      executionManager.addObserver(mockObserver);
      
      await executionManager.executeTask(mockTask, mockOptions);
      
      expect(mockObserver.onExecutionStarted).toHaveBeenCalled();
    });

    it("should notify observers when execution completes", async () => {
      executionManager.addObserver(mockObserver);
      
      await executionManager.executeTask(mockTask, mockOptions);
      
      // Wait for execution to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockObserver.onExecutionCompleted).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle task runner execution failures", async () => {
      // Mock a task runner that throws an error
      const failingTaskRunner = new MockTaskRunner(false, 100);
      
      const failingFramework = new MockFramework();
      failingFramework.runner = failingTaskRunner;
      mockFrameworkRegistry.getFramework.mockReturnValue(failingFramework);

      const execution = await executionManager.executeTask(mockTask, mockOptions);
      
      // Wait for execution to complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const updatedExecution = executionManager.getExecution(execution.id);
      expect(updatedExecution?.status).toBe("failed");
    });

    it("should handle missing task runner in framework", async () => {
      // Create a mock framework that will cause an error when accessing runner
      const incompleteFramework = {
        name: "incomplete-framework",
        detect: jest.fn().mockResolvedValue(true),
        runner: undefined,
        provider: new MockTaskProvider()
      };
      mockFrameworkRegistry.getFramework.mockReturnValue(incompleteFramework as any);

      const execution = await executionManager.executeTask(mockTask, mockOptions);
      
      // Wait for async execution to fail
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const updatedExecution = executionManager.getExecution(execution.id);
      expect(updatedExecution?.status).toBe("failed");
    });
  });
});
