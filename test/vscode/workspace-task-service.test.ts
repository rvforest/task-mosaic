jest.mock(
  "vscode",
  () => {
    const disposable = () => ({ dispose: jest.fn() });
    const workspaceUri = {
      fsPath: "/workspace",
      path: "/workspace",
      toString: () => "file:///workspace",
      with: jest.fn(),
    };
    return {
      workspace: {
        isTrusted: false,
        workspaceFolders: [{ name: "workspace", uri: workspaceUri }],
        findFiles: jest.fn().mockResolvedValue([]),
        getWorkspaceFolder: jest.fn(),
        getConfiguration: jest.fn(() => ({
          get: jest.fn((_key: string, fallback: unknown) => fallback),
        })),
        onDidChangeWorkspaceFolders: jest.fn(disposable),
        onDidGrantWorkspaceTrust: jest.fn(disposable),
        onDidChangeConfiguration: jest.fn(disposable),
        createFileSystemWatcher: jest.fn(() => ({
          dispose: jest.fn(),
          onDidCreate: jest.fn(disposable),
          onDidChange: jest.fn(disposable),
          onDidDelete: jest.fn(disposable),
        })),
      },
    };
  },
  { virtual: true },
);

import { TaskManager } from "../../src/core/task-manager";
import { TaskSource } from "../../src/core/task-source/task-source";
import { TaskSourceRegistry } from "../../src/core/task-source/task-source-registry";
import {
  createTaskKey,
  taskSourceId,
} from "../../src/core/tasks/types";
import { WorkspaceTaskService } from "../../src/vscode/workspace-task-service";

const vscodeMock = jest.requireMock("vscode") as {
  workspace: {
    findFiles: jest.Mock;
    getWorkspaceFolder: jest.Mock;
  };
};

describe("WorkspaceTaskService", () => {
  it("discovers a configuration-free workspace source without trust", async () => {
    const sourceId = taskSourceId("workspace-actions");
    const source: TaskSource = {
      id: sourceId,
      displayName: "Workspace Actions",
      projectDiscovery: { kind: "workspace" },
      trust: { discovery: false, execution: false },
      discover: jest.fn(async (project) => [
        {
          key: createTaskKey(project.key, "refresh-index"),
          sourceTaskId: "refresh-index",
          sourceId,
          projectKey: project.key,
          label: "Refresh index",
          groups: [
            { kind: "operation", id: "maintenance", label: "Maintenance" },
          ],
          roles: [],
          capabilities: {
            runnable: true,
            cancellable: true,
            acceptsInputs: false,
          },
        },
      ]),
      createExecution: () => ({
        kind: "managed",
        run: async () => ({ status: "succeeded" }),
      }),
    };
    const registry = new TaskSourceRegistry();
    registry.register(source);
    const manager = new TaskManager();
    const service = new WorkspaceTaskService(
      manager,
      registry,
      { appendLine: jest.fn() } as never,
    );

    try {
      await service.initialize();

      expect(source.discover).toHaveBeenCalledTimes(1);
      expect(manager.getAllTasks()).toEqual([
        expect.objectContaining({
          sourceId,
          sourceTaskId: "refresh-index",
        }),
      ]);
      expect(manager.getDiscoveryState()).toMatchObject({
        phase: "ready",
        truncated: false,
      });
      expect(manager.getDiscoveryState().projects[0].configurationUri).toBe(
        undefined,
      );
    } finally {
      service.dispose();
    }
  });

  it("does not invoke a trust-required source in an untrusted workspace", async () => {
    const source: TaskSource = {
      id: taskSourceId("unsafe-source"),
      displayName: "Unsafe Source",
      projectDiscovery: { kind: "workspace" },
      trust: { discovery: true, execution: true },
      discover: jest.fn(),
      createExecution: () => ({
        kind: "managed",
        run: async () => ({ status: "succeeded" }),
      }),
    };
    const registry = new TaskSourceRegistry();
    registry.register(source);
    const manager = new TaskManager();
    const service = new WorkspaceTaskService(
      manager,
      registry,
      { appendLine: jest.fn() } as never,
    );

    try {
      await service.initialize();

      expect(source.discover).not.toHaveBeenCalled();
      expect(manager.getDiscoveryState().phase).toBe("untrusted");
    } finally {
      service.dispose();
    }
  });

  it("uses configuration patterns declared by each source", async () => {
    const sourceId = taskSourceId("manifest");
    const source: TaskSource = {
      id: sourceId,
      displayName: "Manifest",
      projectDiscovery: {
        kind: "configurationFiles",
        patterns: ["**/tasks.toml"],
      },
      trust: { discovery: false, execution: false },
      discover: jest.fn(async () => []),
      createExecution: () => ({
        kind: "managed",
        run: async () => ({ status: "succeeded" }),
      }),
    };
    const rootUri = {
      fsPath: "/workspace",
      path: "/workspace",
      toString: () => "file:///workspace",
    };
    const configurationUri = {
      fsPath: "/workspace/tasks.toml",
      path: "/workspace/tasks.toml",
      toString: () => "file:///workspace/tasks.toml",
      with: jest.fn(() => rootUri),
    };
    vscodeMock.workspace.findFiles.mockResolvedValue([configurationUri]);
    vscodeMock.workspace.getWorkspaceFolder.mockReturnValue({
      name: "workspace",
      uri: rootUri,
    });
    const registry = new TaskSourceRegistry();
    registry.register(source);
    const manager = new TaskManager();
    const service = new WorkspaceTaskService(
      manager,
      registry,
      { appendLine: jest.fn() } as never,
    );

    try {
      await service.initialize();

      expect(vscodeMock.workspace.findFiles).toHaveBeenCalledWith(
        "**/tasks.toml",
        expect.any(String),
        51,
      );
      expect(source.discover).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId,
          configurationUri: "file:///workspace/tasks.toml",
        }),
      );
    } finally {
      service.dispose();
    }
  });
});
