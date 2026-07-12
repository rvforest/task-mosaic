export type TaskKey = string;
export type ProjectKey = string;
export type FrameworkId = string;

export type TaskStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled";

export interface TaskProject {
  key: ProjectKey;
  frameworkId: FrameworkId;
  workspaceUri: string;
  workspaceName: string;
  rootUri: string;
  rootPath: string;
  relativePath: string;
  configurationUri: string;
}

export interface Task {
  key: TaskKey;
  frameworkTaskId: string;
  frameworkId: FrameworkId;
  projectKey: ProjectKey;
  label: string;
  description?: string;
  tags: string[];
  matrixGroup?: string;
  parameters: Record<string, string>;
  isDefault: boolean;
}

export interface TaskRunOptions {
  runnerArgs?: string[];
  taskArgs?: string[];
}

export interface TaskRunResult {
  taskKey: TaskKey;
  status: Exclude<TaskStatus, "idle" | "queued" | "running">;
  exitCode?: number;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  reason?: string;
}

export interface ProjectDiscoveryResult {
  project: TaskProject;
  tasks?: Task[];
  error?: DiscoveryError;
}

export type DiscoveryErrorCode =
  | "missingExecutable"
  | "unsupportedVersion"
  | "invalidConfiguration"
  | "malformedOutput"
  | "timeout"
  | "outputLimit"
  | "unknown";

export interface DiscoveryError {
  code: DiscoveryErrorCode;
  message: string;
  detail?: string;
}

export interface DiscoveryState {
  phase: "idle" | "loading" | "ready" | "untrusted";
  projects: TaskProject[];
  errors: Map<ProjectKey, DiscoveryError>;
  truncated: boolean;
}

export function createProjectKey(
  frameworkId: FrameworkId,
  workspaceUri: string,
  relativePath: string,
): ProjectKey {
  return JSON.stringify([frameworkId, workspaceUri, relativePath]);
}

export function createTaskKey(
  projectKey: ProjectKey,
  frameworkTaskId: string,
): TaskKey {
  return JSON.stringify([projectKey, frameworkTaskId]);
}
