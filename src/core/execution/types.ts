import { Task, TaskStatus } from "../tasks/types";

// Options for running a task
export interface TaskOptions {
  taskArgs?: string[]; // Arguments to be passed to the underlying task. Example: When running tbe nox session "test", ['--coverage'] would be passed as 'nox -s test -- --coverage'.
  runnerArgs?: string[]; // Arguments for the task runner. Example: When running the nox session "test", ['-v'] would be passed as 'nox -v -s test'
  cwd?: string; // Optional override for working directory - if not provided, uses task.cwd
}

// Result of a command execution
export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

// Represents a running or completed task execution
export interface TaskExecution {
  id: string;
  task: Task;
  status: TaskStatus; // Now uses the unified TaskStatus type
  startTime: Date; // Made required since always set
  endTime?: Date; // Keep for future duration calculations
}

// Represents the configuration for the execution manager
export type ExecutionManagerConfig = {
  maxConcurrentExecutions: number;
  maxHistorySize: number;
};

// Observer for execution lifecycle events
export interface ExecutionObserver {
  onExecutionStarted(execution: TaskExecution): void;
  onExecutionCompleted(execution: TaskExecution): void;
  onExecutionFailed(execution: TaskExecution): void;
  onStateChanged(execution: TaskExecution): void;
  onOutputReceived(
    executionId: string,
    output: string,
    stream: "stdout" | "stderr"
  ): void;
}
