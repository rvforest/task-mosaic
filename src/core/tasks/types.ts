declare const taskKeyBrand: unique symbol;
declare const projectKeyBrand: unique symbol;
declare const taskSourceIdBrand: unique symbol;

export type TaskKey = string & { readonly [taskKeyBrand]: true };
export type ProjectKey = string & { readonly [projectKeyBrand]: true };
export type TaskSourceId = string & { readonly [taskSourceIdBrand]: true };

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

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
  sourceId: TaskSourceId;
  workspaceUri: string;
  workspaceName: string;
  rootUri: string;
  rootPath: string;
  relativePath: string;
  configurationUri?: string;
  sourceData?: JsonObject;
}

export interface TaskGroupMembership {
  kind: string;
  id: string;
  label: string;
}

export interface TaskCapabilities {
  runnable: boolean;
  cancellable: boolean;
  acceptsInputs: boolean;
}

export interface DiscoveredTask {
  key: TaskKey;
  sourceTaskId: string;
  sourceId: TaskSourceId;
  projectKey: ProjectKey;
  label: string;
  description?: string;
  groups: TaskGroupMembership[];
  roles: string[];
  capabilities: TaskCapabilities;
  sourceData?: JsonObject;
}

export interface TaskInvocation {
  inputs?: JsonObject;
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

export type ProjectDiscoveryResult =
  | {
      project: TaskProject;
      tasks: DiscoveredTask[];
    }
  | {
      project: TaskProject;
      error: DiscoveryError;
    };

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

export function taskSourceId(value: string): TaskSourceId {
  return value as TaskSourceId;
}

export function createProjectKey(
  sourceId: TaskSourceId,
  workspaceUri: string,
  relativePath: string,
): ProjectKey {
  return JSON.stringify([sourceId, workspaceUri, relativePath]) as ProjectKey;
}

export function createTaskKey(
  projectKey: ProjectKey,
  sourceTaskId: string,
): TaskKey {
  return JSON.stringify([projectKey, sourceTaskId]) as TaskKey;
}
