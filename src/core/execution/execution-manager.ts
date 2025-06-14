import { Task } from "../tasks/types";
import { FrameworkRegistry } from "../framework/framework-registry";
import { ExecutionManagerConfig, ExecutionObserver, TaskExecution, TaskOptions } from "./types";

export class ExecutionManager {
  private config: ExecutionManagerConfig = {
    maxConcurrentExecutions: 5,
    maxHistorySize: 100,
  };
  private activeExecutions: Map<string, TaskExecution> = new Map();
  private executionHistory: TaskExecution[] = [];
  private observers: ExecutionObserver[] = [];
  private nextExecutionId: number = 1;

  // ====================
  // PUBLIC API
  // ====================

  /**
   * Execute a task and return the execution context
   */
  async executeTask(task: Task, options: TaskOptions): Promise<TaskExecution> {
    // Prevent multiple concurrent executions of the same task
    if (this.isTaskRunning(task.name, task.frameworkName)) {
      throw new Error(`Task '${task.name}' is already running.`);
    }

    // Validate task can be executed
    await this.validateTaskExecution(task);

    // Check concurrency limits
    if (this.getActiveExecutions().length >= this.config.maxConcurrentExecutions) {
      throw new Error(
        `Maximum concurrent executions (${this.config.maxConcurrentExecutions}) reached`,
      );
    }

    // Create execution context
    const execution = this.createExecution(task);

    // Add to active executions
    this.activeExecutions.set(execution.id, execution);

    // Notify observers
    this.notifyExecutionStarted(execution);

    // Start execution asynchronously
    this.runTaskAsync(execution, options);

    return execution;
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): TaskExecution | undefined {
    return (
      this.activeExecutions.get(executionId) ||
      this.executionHistory.find((e) => e.id === executionId)
    );
  }

  /**
   * Get all active executions
   */
  getActiveExecutions(): TaskExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): TaskExecution[] {
    return [...this.executionHistory];
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  // ====================
  // OBSERVER MANAGEMENT
  // ====================

  addObserver(observer: ExecutionObserver): void {
    this.observers.push(observer);
  }

  removeObserver(observer: ExecutionObserver): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  // ====================
  // PRIVATE METHODS
  // ====================

  private async validateTaskExecution(task: Task): Promise<void> {
    // Check if framework is available
    const framework = FrameworkRegistry.getFramework(task.frameworkName);
    if (!framework) {
      throw new Error(`Framework '${task.frameworkName}' not found`);
    }

    if (!framework.detect([task.cwd])) {
      throw new Error(
        `Framework '${task.frameworkName}' is not available in directory '${task.cwd}'`,
      );
    }
  }

  private createExecution(task: Task): TaskExecution {
    return {
      id: this.generateExecutionId(),
      task,
      status: "pending",
      startTime: new Date(), 
      endTime: undefined,
    };
  }

  private generateExecutionId(): string {
    return `exec_${this.nextExecutionId++}`;
  }

  private async runTaskAsync(
    execution: TaskExecution,
    options: TaskOptions,
  ): Promise<void> {
    try {
      // Update status to running
      this.updateExecutionStatus(execution.id, "running");

      // Get framework and runner
      const framework = FrameworkRegistry.getFramework(
        execution.task.frameworkName,
      );
      if (!framework) {
        throw new Error(
          `Framework '${execution.task.frameworkName}' not found`,
        );
      }

      // Use task's cwd as default, allow override via options
      const effectiveOptions: TaskOptions = {
        ...options,
        cwd: options.cwd || execution.task.cwd
      };

      // Execute the task
      await framework.runner.runTask(execution.task, effectiveOptions);

      // If we reach here, execution was successful
      this.updateExecutionStatus(execution.id, "completed");
    } catch (error) {
      console.error(`Task execution ${execution.id} failed:`, error);
      this.updateExecutionStatus(execution.id, "failed");

    }
  }

  private updateExecutionStatus(
    executionId: string,
    status: TaskExecution["status"],
  ): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    const updatedExecution: TaskExecution = {
      ...execution,
      status,
      endTime:
        status === "completed" || status === "failed" || status === "cancelled"
          ? new Date()
          : undefined,
    };

    this.activeExecutions.set(executionId, updatedExecution);

    // Notify observers
    this.notifyStateChanged(updatedExecution);

    // If execution is finished, move to history
    if (
      status === "completed" ||
      status === "failed" ||
      status === "cancelled"
    ) {
      this.moveToHistory(executionId);
      this.notifyExecutionEnded(updatedExecution);
    }
  }

  private moveToHistory(executionId: string): void {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      this.executionHistory.unshift(execution);
      this.activeExecutions.delete(executionId);

      // Trim history if it exceeds max size
      if (this.executionHistory.length > this.config.maxHistorySize) {
        this.executionHistory = this.executionHistory.slice(
          0,
          this.config.maxHistorySize,
        );
      }
    }
  }

  // ====================
  // OBSERVER NOTIFICATIONS
  // ====================

  private notifyExecutionStarted(execution: TaskExecution): void {
    this.observers.forEach((observer) =>
      observer.onExecutionStarted(execution),
    );
  }

  private notifyExecutionEnded(execution: TaskExecution): void {
    this.observers.forEach((observer) => {
      if (execution.status === "completed") {
        observer.onExecutionCompleted(execution);
      } else if (execution.status === "failed") {
        observer.onExecutionFailed(execution);
      }
    });
  }

  private notifyStateChanged(execution: TaskExecution): void {
    this.observers.forEach((observer) => observer.onStateChanged(execution));
  }

  private notifyOutputReceived(
    executionId: string,
    output: string,
    stream: "stdout" | "stderr",
  ): void {
    this.observers.forEach((observer) =>
      observer.onOutputReceived(executionId, output, stream),
    );
  }

  // ====================
  // CONFIGURATION
  // ====================

  setMaxConcurrentExecutions(max: number): void {
    this.config.maxConcurrentExecutions = max;
  }

  setMaxHistorySize(max: number): void {
    this.config.maxHistorySize = max;
    // Trim current history if needed
    if (this.executionHistory.length > max) {
      this.executionHistory = this.executionHistory.slice(0, max);
    }
  }

  // ====================
  // UTILITY METHODS
  // ====================

  /**
   * Get statistics about executions
   */
  getStats(): {
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
  } {
    const active = this.getActiveExecutions().length;
    const completed = this.executionHistory.filter(
      (e) => e.status === "completed",
    ).length;
    const failed = this.executionHistory.filter(
      (e) => e.status === "failed",
    ).length;
    const cancelled = this.executionHistory.filter(
      (e) => e.status === "cancelled",
    ).length;

    return {
      active,
      completed,
      failed,
      cancelled,
      total: active + completed + failed + cancelled,
    };
  }

  /**
   * Check if a task is currently running
   */
  isTaskRunning(taskName: string, framework: string): boolean {
    return this.getActiveExecutions().some(
      (e) => e.task.name === taskName && e.task.frameworkName === framework,
    );
  }

  /**
   * Get all executions for a specific task
   */
  getExecutionsForTask(taskName: string, framework: string): TaskExecution[] {
    const active = this.getActiveExecutions().filter(
      (e) => e.task.name === taskName && e.task.frameworkName === framework,
    );
    const historical = this.executionHistory.filter(
      (e) => e.task.name === taskName && e.task.frameworkName === framework,
    );

    return [...active, ...historical];
  }
}
