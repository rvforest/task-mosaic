import { TaskManager } from "../../src/core/task-manager";
import { TaskProvider } from "../../src/core/task-providers/task-provider";
import { OutputChannel } from "../../src/core/types";
import { Task } from "../../src/core/tasks/types";

// Mock console.error to capture error logging
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

// Mock OutputChannel
const mockOutputChannel: OutputChannel = {
  append: jest.fn(),
  appendLine: jest.fn()
};

// Mock TaskProvider for testing
class MockTaskProvider extends TaskProvider {
  name: string;
  public tasksToReturn: Task[];
  private shouldThrow: boolean;

  constructor(name: string, tasks: Task[] = [], shouldThrow: boolean = false) {
    super(mockOutputChannel);
    this.name = name;
    this.tasksToReturn = tasks;
    this.shouldThrow = shouldThrow;
  }

  protected getCommand(): string {
    return this.name;
  }

  protected async listTasksForDirectory(directory: string): Promise<Task[]> {
    if (this.shouldThrow) {
      throw new Error(`Provider ${this.name} failed`);
    }
    return this.tasksToReturn;
  }
}

describe("TaskManager", () => {
  let taskManager: TaskManager;
  let sampleTasks: Task[];

  beforeEach(() => {
    taskManager = new TaskManager(["/test/dir1", "/test/dir2"]);
    sampleTasks = [
      {
        taskId: "task1",
        name: "Task 1",
        cwd: "/test/dir1",
        frameworkName: "provider1",
        matrixGroup: "group1",
        categoryGroups: ["category1", "category2"]
      },
      {
        taskId: "task2", 
        name: "Task 2",
        cwd: "/test/dir2",
        frameworkName: "provider2",
        matrixGroup: "group2",
        categoryGroups: ["category2", "category3"]
      },
      {
        taskId: "task3",
        name: "Task 3", 
        cwd: "/test/dir1",
        frameworkName: "provider1",
        matrixGroup: "group1",
        categoryGroups: ["category1"]
      }
    ];
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    mockConsoleError.mockRestore();
  });

  describe("constructor", () => {
    it("should initialize with search directories", () => {
      const manager = new TaskManager(["/path1", "/path2"]);
      expect(manager).toBeInstanceOf(TaskManager);
    });
  });

  describe("setAvailableProviders", () => {
    it("should set available providers", () => {
      const provider1 = new MockTaskProvider("provider1");
      const provider2 = new MockTaskProvider("provider2");
      
      taskManager.setAvailableProviders([provider1, provider2]);
      
      // No direct way to verify, but should not throw
      expect(() => taskManager.setAvailableProviders([provider1, provider2])).not.toThrow();
    });

    it("should handle empty providers array", () => {
      expect(() => taskManager.setAvailableProviders([])).not.toThrow();
    });
  });

  describe("refreshTasks", () => {
    it("should refresh tasks from multiple providers", async () => {
      const provider1 = new MockTaskProvider("provider1", [sampleTasks[0], sampleTasks[2]]);
      const provider2 = new MockTaskProvider("provider2", [sampleTasks[1]]);
      
      taskManager.setAvailableProviders([provider1, provider2]);
      
      await taskManager.refreshTasks();
      
      const allTasks = taskManager.getAllTasks();
      expect(allTasks).toHaveLength(3);
      expect(allTasks.find(t => t.taskId === "task1")).toBeDefined();
      expect(allTasks.find(t => t.taskId === "task2")).toBeDefined();
      expect(allTasks.find(t => t.taskId === "task3")).toBeDefined();
    });

    it("should handle provider errors gracefully", async () => {
      const goodProvider = new MockTaskProvider("good", [sampleTasks[0]]);
      const badProvider = new MockTaskProvider("bad", [], true);
      
      taskManager.setAvailableProviders([goodProvider, badProvider]);
      
      await taskManager.refreshTasks();
      
      // Should still get tasks from good provider
      const allTasks = taskManager.getAllTasks();
      expect(allTasks).toHaveLength(1);
      expect(allTasks[0].taskId).toBe("task1");
      
      // Should log error to outputChannel for each search directory
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining("Error listing tasks in /test/dir1: Provider bad failed")
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining("Error listing tasks in /test/dir2: Provider bad failed")
      );
    });

    it("should clear existing tasks before refresh", async () => {
      const provider = new MockTaskProvider("provider", [sampleTasks[0]]);
      taskManager.setAvailableProviders([provider]);
      
      // First refresh
      await taskManager.refreshTasks();
      expect(taskManager.getAllTasks()).toHaveLength(1);
      
      // Second refresh with different tasks
      provider.tasksToReturn = [sampleTasks[1]];
      await taskManager.refreshTasks();
      
      const allTasks = taskManager.getAllTasks();
      expect(allTasks).toHaveLength(1);
      expect(allTasks[0].taskId).toBe("task2");
    });

    it("should handle duplicate task IDs by overwriting", async () => {
      const task1Copy = { ...sampleTasks[0] };
      const provider1 = new MockTaskProvider("provider1", [sampleTasks[0]]);
      const provider2 = new MockTaskProvider("provider2", [task1Copy]);
      
      taskManager.setAvailableProviders([provider1, provider2]);
      
      await taskManager.refreshTasks();
      
      // Should only have one task with that ID (last one wins)
      const allTasks = taskManager.getAllTasks();
      expect(allTasks).toHaveLength(1);
      expect(allTasks[0].taskId).toBe("task1");
    });
  });

  describe("getTask", () => {
    beforeEach(async () => {
      const provider = new MockTaskProvider("provider", sampleTasks);
      taskManager.setAvailableProviders([provider]);
      await taskManager.refreshTasks();
    });

    it("should retrieve a task by ID", () => {
      const task = taskManager.getTask("task1");
      expect(task).toBeDefined();
      expect(task?.taskId).toBe("task1");
      expect(task?.name).toBe("Task 1");
    });

    it("should return undefined for non-existent task ID", () => {
      const task = taskManager.getTask("nonexistent");
      expect(task).toBeUndefined();
    });
  });

  describe("getAllTasks", () => {
    it("should return all tasks", async () => {
      const provider = new MockTaskProvider("provider", sampleTasks);
      taskManager.setAvailableProviders([provider]);
      await taskManager.refreshTasks();
      
      const allTasks = taskManager.getAllTasks();
      expect(allTasks).toHaveLength(3);
      expect(allTasks.map(t => t.taskId)).toEqual(["task1", "task2", "task3"]);
    });

    it("should return empty array when no tasks", () => {
      const allTasks = taskManager.getAllTasks();
      expect(allTasks).toEqual([]);
    });
  });

  describe("getTasksByProvider", () => {
    beforeEach(async () => {
      const provider = new MockTaskProvider("provider", sampleTasks);
      taskManager.setAvailableProviders([provider]);
      await taskManager.refreshTasks();
    });

    it("should filter tasks by framework name", () => {
      const provider1Tasks = taskManager.getTasksByProvider("provider1");
      expect(provider1Tasks).toHaveLength(2);
      expect(provider1Tasks.map(t => t.taskId)).toEqual(["task1", "task3"]);
      
      const provider2Tasks = taskManager.getTasksByProvider("provider2");
      expect(provider2Tasks).toHaveLength(1);
      expect(provider2Tasks[0].taskId).toBe("task2");
    });

    it("should return empty array for non-existent provider", () => {
      const tasks = taskManager.getTasksByProvider("nonexistent");
      expect(tasks).toEqual([]);
    });
  });

  describe("getTasksByMatrixGroup", () => {
    beforeEach(async () => {
      const provider = new MockTaskProvider("provider", sampleTasks);
      taskManager.setAvailableProviders([provider]);
      await taskManager.refreshTasks();
    });

    it("should filter tasks by matrix group", () => {
      const group1Tasks = taskManager.getTasksByMatrixGroup("group1");
      expect(group1Tasks).toHaveLength(2);
      expect(group1Tasks.map(t => t.taskId)).toEqual(["task1", "task3"]);
      
      const group2Tasks = taskManager.getTasksByMatrixGroup("group2");
      expect(group2Tasks).toHaveLength(1);
      expect(group2Tasks[0].taskId).toBe("task2");
    });

    it("should return empty array for non-existent matrix group", () => {
      const tasks = taskManager.getTasksByMatrixGroup("nonexistent");
      expect(tasks).toEqual([]);
    });
  });

  describe("getTasksByCategoryGroup", () => {
    beforeEach(async () => {
      const provider = new MockTaskProvider("provider", sampleTasks);
      taskManager.setAvailableProviders([provider]);
      await taskManager.refreshTasks();
    });

    it("should filter tasks by category group", () => {
      const category1Tasks = taskManager.getTasksByCategoryGroup("category1");
      expect(category1Tasks).toHaveLength(2);
      expect(category1Tasks.map(t => t.taskId)).toEqual(["task1", "task3"]);
      
      const category2Tasks = taskManager.getTasksByCategoryGroup("category2");
      expect(category2Tasks).toHaveLength(2);
      expect(category2Tasks.map(t => t.taskId)).toEqual(["task1", "task2"]);
      
      const category3Tasks = taskManager.getTasksByCategoryGroup("category3");
      expect(category3Tasks).toHaveLength(1);
      expect(category3Tasks[0].taskId).toBe("task2");
    });

    it("should return empty array for non-existent category group", () => {
      const tasks = taskManager.getTasksByCategoryGroup("nonexistent");
      expect(tasks).toEqual([]);
    });

    it("should handle tasks without category groups", () => {
      const taskWithoutCategories: Task = {
        taskId: "task4",
        name: "Task 4",
        cwd: "/test",
        frameworkName: "provider"
      };
      
      const provider = new MockTaskProvider("provider", [taskWithoutCategories]);
      taskManager.setAvailableProviders([provider]);
      taskManager.refreshTasks();
      
      const categoryTasks = taskManager.getTasksByCategoryGroup("category1");
      expect(categoryTasks).toEqual([]);
    });
  });
});
