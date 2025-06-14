import { TaskProvider } from "../../../src/core/task-providers/task-provider";
import { OutputChannel } from "../../../src/core/types";
import { Task } from "../../../src/core/tasks/types";

// Mock OutputChannel
const mockOutputChannel: OutputChannel = {
  append: jest.fn(),
  appendLine: jest.fn()
};

class TestTaskProvider extends TaskProvider {
  name = "test-provider";
  
  constructor() {
    super(mockOutputChannel);
  }
  
  protected getCommand(): string {
    return "test-cmd";
  }
  
  protected async listTasksForDirectory(directory: string): Promise<Task[]> {
    if (directory === "/valid/path") {
      return [
        {
          taskId: "task1",
          name: "Task 1",
          cwd: directory,
          frameworkName: "test-framework",
          description: "Test task 1"
        },
        {
          taskId: "task2", 
          name: "Task 2",
          cwd: directory,
          frameworkName: "test-framework",
          description: "Test task 2"
        }
      ];
    }
    if (directory === "/error/path") {
      throw new Error("Directory error");
    }
    return [];
  }
}

describe("TaskProvider", () => {
  let provider: TestTaskProvider;

  beforeEach(() => {
    provider = new TestTaskProvider();
    jest.clearAllMocks();
  });

  describe("name property", () => {
    it("should return the provider name", () => {
      expect(provider.name).toBe("test-provider");
    });
  });

  describe("listTasks method", () => {
    it("should list tasks from multiple directories", async () => {
      const directories = ["/valid/path", "/empty/path"];
      const tasks = await provider.listTasks(directories);
      
      expect(tasks).toHaveLength(2);
      expect(tasks[0].taskId).toBe("task1");
      expect(tasks[1].taskId).toBe("task2");
    });

    it("should return empty array for empty directory list", async () => {
      const directories: string[] = [];
      const tasks = await provider.listTasks(directories);
      
      expect(tasks).toHaveLength(0);
    });

    it("should return empty array when no tasks found", async () => {
      const directories = ["/empty/path"];
      const tasks = await provider.listTasks(directories);
      
      expect(tasks).toHaveLength(0);
    });

    it("should handle directory errors gracefully", async () => {
      const directories = ["/valid/path", "/error/path"];
      const tasks = await provider.listTasks(directories);
      
      // Should still return tasks from valid directory
      expect(tasks).toHaveLength(2);
      expect(tasks[0].taskId).toBe("task1");
      expect(tasks[1].taskId).toBe("task2");
      
      // Should log error for invalid directory
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        "Error listing tasks in /error/path: Directory error"
      );
    });

    it("should handle non-Error exceptions", async () => {
      // Create a provider that throws a string instead of Error
      class StringErrorProvider extends TaskProvider {
        name = "string-error-provider";
        
        protected getCommand(): string {
          return "error-cmd";
        }
        
        protected async listTasksForDirectory(directory: string): Promise<Task[]> {
          throw "String error";
        }
      }
      
      const errorProvider = new StringErrorProvider(mockOutputChannel);
      const directories = ["/any/path"];
      const tasks = await errorProvider.listTasks(directories);
      
      expect(tasks).toHaveLength(0);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        "Error listing tasks in /any/path: String error"
      );
    });

    it("should handle null/undefined exceptions", async () => {
      // Create a provider that throws null
      class NullErrorProvider extends TaskProvider {
        name = "null-error-provider";
        
        protected getCommand(): string {
          return "error-cmd";
        }
        
        protected async listTasksForDirectory(directory: string): Promise<Task[]> {
          throw null;
        }
      }
      
      const errorProvider = new NullErrorProvider(mockOutputChannel);
      const directories = ["/any/path"];
      const tasks = await errorProvider.listTasks(directories);
      
      expect(tasks).toHaveLength(0);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        "Error listing tasks in /any/path: null"
      );
    });
  });
});
