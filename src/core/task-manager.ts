import { ExecutionManager } from "./execution/execution-manager";
import { TaskProvider } from "./task-providers/task-provider";
import { Task, TaskStatus } from "./tasks/types";
import { TaskExecution, TaskOptions } from "./execution/types";

// A class to manage tasks across different providers
export class TaskManager {
  /**
   * Get the current status of a task. 
   * @throws Error if the task does not exist
   */
  getTaskStatus(taskId: string): TaskStatus {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task with ID '${taskId}' not found`);
    }
    const executions = this.executionManager.getExecutionsForTask(task.name, task.frameworkName);
    if (executions.length === 0) return "idle";
    const active = executions.find(e => e.status === "running" || e.status === "pending");
    if (active) return active.status;
    return executions[0].status; // Return the actual execution status
  }
  private availableProviders: TaskProvider[] = [];
  private tasks: Map<string, Task> = new Map();
  private searchDirectories: string[];
  private executionManager: ExecutionManager = new ExecutionManager();

  constructor(searchDirectories: string[]) {
    this.searchDirectories = searchDirectories;
  }

  setAvailableProviders(providers: TaskProvider[]): void {
    this.availableProviders = providers;
  }

  async refreshTasks(): Promise<void> {
    this.tasks.clear();

    for (const provider of this.availableProviders) {
      try {
        const providerTasks = await provider.listTasks(this.searchDirectories);
        providerTasks.forEach((task) => {
          this.tasks.set(task.taskId, task);
        });
      } catch (error) {
        console.error(
          `Failed to get tasks from ${provider.name}:`,
          error,
        );
      }
    }
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getTasksByProvider(frameworkName: string): Task[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.frameworkName === frameworkName,
    );
  }

  getTasksByMatrixGroup(group: string): Task[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.matrixGroup === group,
    );
  }

  getTasksByCategoryGroup(group: string): Task[] {
    return Array.from(this.tasks.values()).filter((task) =>
      task.categoryGroups?.includes(group),
    );
  }

  // ====================
  // EXECUTION METHODS
  // ====================

  /**
   * Execute a task by ID
   */
  async executeTask(taskId: string, options: TaskOptions = {}): Promise<TaskExecution> {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task with ID '${taskId}' not found`);
    }
    return this.executionManager.executeTask(task, options);
  }

  /**
   * Get execution manager for direct access
   */
  getExecutionManager(): ExecutionManager {
    return this.executionManager;
  }

  /**
   * Check if a task is currently running
   */
  isTaskRunning(taskId: string): boolean {
    const task = this.getTask(taskId);
    if (!task) return false;
    
    return this.executionManager.isTaskRunning(task.name, task.frameworkName);
  }

  /**
   * Get all executions for a task
   */
  getTaskExecutions(taskId: string): TaskExecution[] {
    const task = this.getTask(taskId);
    if (!task) return [];
    
    return this.executionManager.getExecutionsForTask(task.name, task.frameworkName);
  }
}
