// Unified status type that covers both execution states and UI display states
export type TaskStatus = "idle" | "pending" | "running" | "completed" | "failed" | "cancelled" | "skipped";

export interface Task {
  taskId: string; // unique key, e.g. "tests-3.11"
  name: string; // display label
  cwd: string; // working directory to run task in, e.g. "/path/to/project"
  description?: string; // optional description for the task
  frameworkName: string; // e.g. "nox", "tox"
  parameters?: Record<string, string>; // key-value pairs for task parameters
  categoryGroups?: string[]; // groups for categorization, e.g. ["tests", "lint"]
  matrixGroup?: string | null; // parent group name for matrix tasks, e.g. "test"
  isDefault?: boolean;
}
