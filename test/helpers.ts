import {
  createProjectKey,
  createTaskKey,
  DiscoveredTask,
  TaskProject,
  taskSourceId,
} from "../src/core/tasks/types";

export function project(overrides: Partial<TaskProject> = {}): TaskProject {
  const workspaceUri = overrides.workspaceUri ?? "file:///workspace";
  const relativePath = overrides.relativePath ?? ".";
  const sourceId = overrides.sourceId ?? taskSourceId("nox");
  const key =
    overrides.key ?? createProjectKey(sourceId, workspaceUri, relativePath);
  return {
    key,
    sourceId,
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
  sourceTaskId: string,
  overrides: Partial<DiscoveredTask> = {},
): DiscoveredTask {
  return {
    key: createTaskKey(taskProject.key, sourceTaskId),
    sourceTaskId,
    sourceId: taskProject.sourceId,
    projectKey: taskProject.key,
    label: sourceTaskId,
    groups: [],
    roles: [],
    capabilities: {
      runnable: true,
      cancellable: true,
      acceptsInputs: false,
    },
    ...overrides,
  };
}
