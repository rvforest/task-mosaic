import {
  createProjectKey,
  createTaskKey,
  Task,
  TaskProject,
} from "../src/core/tasks/types";

export function project(overrides: Partial<TaskProject> = {}): TaskProject {
  const workspaceUri = overrides.workspaceUri ?? "file:///workspace";
  const relativePath = overrides.relativePath ?? ".";
  const frameworkId = overrides.frameworkId ?? "nox";
  const key =
    overrides.key ?? createProjectKey(frameworkId, workspaceUri, relativePath);
  return {
    key,
    frameworkId,
    workspaceUri,
    workspaceName: "workspace",
    rootUri: "file:///workspace",
    rootPath: "/workspace",
    relativePath,
    configurationUri: "file:///workspace/noxfile.py",
    ...overrides,
  };
}

export function task(
  taskProject: TaskProject,
  frameworkTaskId: string,
  overrides: Partial<Task> = {},
): Task {
  return {
    key: createTaskKey(taskProject.key, frameworkTaskId),
    frameworkTaskId,
    frameworkId: taskProject.frameworkId,
    projectKey: taskProject.key,
    label: frameworkTaskId,
    tags: [],
    parameters: {},
    isDefault: false,
    ...overrides,
  };
}
