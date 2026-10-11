import * as vscode from "vscode";

import { TaskManager } from "../../../core/task-manager";
import { TaskSourceRegistry } from "../../../core/task-source/task-source-registry";
import {
  DiscoveredTask,
  ProjectKey,
  TaskSourceId,
} from "../../../core/tasks/types";
import { TaskTreeItem } from "./TaskTreeItem";
import { TaskTreeViewMode } from "./types";

const VIEW_MODE_STATE_KEY = "taskMosaic.viewMode";

export class TaskTreeProvider
  implements vscode.TreeDataProvider<TaskTreeItem>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<
    TaskTreeItem | undefined | null | void
  >();
  private readonly removeManagerListener: () => void;
  private currentViewMode: TaskTreeViewMode;
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(
    private readonly taskManager: TaskManager,
    private readonly registry: TaskSourceRegistry,
    private readonly workspaceState: vscode.Memento,
  ) {
    this.currentViewMode = workspaceState.get<TaskTreeViewMode>(
      VIEW_MODE_STATE_KEY,
      TaskTreeViewMode.BY_TAG,
    );
    this.removeManagerListener = taskManager.onDidChange(() => this.refresh());
  }

  dispose(): void {
    this.removeManagerListener();
    this.changeEmitter.dispose();
  }

  refresh(): void {
    this.changeEmitter.fire();
  }

  async setViewMode(mode: TaskTreeViewMode): Promise<void> {
    this.currentViewMode = mode;
    await this.workspaceState.update(VIEW_MODE_STATE_KEY, mode);
    this.refresh();
  }

  getViewMode(): TaskTreeViewMode {
    return this.currentViewMode;
  }

  getTreeItem(element: TaskTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskTreeItem): vscode.ProviderResult<TaskTreeItem[]> {
    if (!element) {
      return this.rootItems();
    }
    switch (element.kind) {
      case "workspace":
        return this.itemsForWorkspace(element.data.workspaceUri!);
      case "project":
        return this.itemsForProject(element.data.projectKey!);
      case "source":
        return this.itemsForSource(
          element.data.projectKey!,
          element.data.sourceId!,
        );
      case "group":
        return this.taskItems(tasksForGroup(this.taskManager, element));
      default:
        return [];
    }
  }

  private rootItems(): TaskTreeItem[] {
    const state = this.taskManager.getDiscoveryState();
    if (state.phase === "untrusted") {
      return [
        this.stateItem("Trust this workspace to discover tasks", "shield", {
          command: "workbench.trust.manage",
          title: "Manage Workspace Trust",
        }),
      ];
    }

    const prefix: TaskTreeItem[] = [];
    if (state.phase === "loading") {
      prefix.push(this.stateItem("Refreshing tasks...", "loading~spin"));
    }
    if (state.truncated) {
      prefix.push(
        this.stateItem("Project discovery limit reached", "warning", {
          command: "workbench.action.openSettings",
          title: "Open Settings",
          arguments: ["taskMosaic.discovery.maxProjects"],
        }),
      );
    }
    if (state.projects.length === 0) {
      return prefix.length > 0
        ? prefix
        : [this.stateItem("No task projects found", "search")];
    }

    const workspaceUris = [
      ...new Set(state.projects.map((project) => project.workspaceUri)),
    ];
    if (workspaceUris.length > 1) {
      return [
        ...prefix,
        ...workspaceUris.map((workspaceUri) => {
          const project = state.projects.find(
            (candidate) => candidate.workspaceUri === workspaceUri,
          )!;
          return new TaskTreeItem(
            project.workspaceName,
            vscode.TreeItemCollapsibleState.Expanded,
            "workspace",
            { workspaceUri },
          );
        }),
      ];
    }
    return [...prefix, ...this.itemsForWorkspace(workspaceUris[0])];
  }

  private itemsForWorkspace(workspaceUri: string): TaskTreeItem[] {
    const projects = this.taskManager
      .getDiscoveryState()
      .projects.filter((project) => project.workspaceUri === workspaceUri);
    if (projects.length > 1) {
      return projects.map(
        (project) =>
          new TaskTreeItem(
            project.relativePath,
            vscode.TreeItemCollapsibleState.Expanded,
            "project",
            { workspaceUri, projectKey: project.key },
          ),
      );
    }
    return projects.length === 1 ? this.itemsForProject(projects[0].key) : [];
  }

  private itemsForProject(projectKey: ProjectKey): TaskTreeItem[] {
    const state = this.taskManager.getDiscoveryState();
    const project = state.projects.find(
      (candidate) => candidate.key === projectKey,
    );
    if (!project) {
      return [];
    }
    const items: TaskTreeItem[] = [];
    const error = state.errors.get(projectKey);
    if (error) {
      const item = this.stateItem(error.message, "error", {
        command: "taskMosaic.showOutput",
        title: "Show Output",
      });
      item.tooltip = error.detail || error.message;
      items.push(item);
    }
    const source = this.registry.get(project.sourceId);
    items.push(
      new TaskTreeItem(
        source?.displayName ?? project.sourceId,
        vscode.TreeItemCollapsibleState.Expanded,
        "source",
        { projectKey, sourceId: project.sourceId },
      ),
    );
    return items;
  }

  private itemsForSource(
    projectKey: ProjectKey,
    sourceId: TaskSourceId,
  ): TaskTreeItem[] {
    const tasks = this.taskManager.findTasks({ projectKey, sourceId });
    if (tasks.length === 0) {
      return [this.stateItem("No tasks found", "circle-outline")];
    }
    const groupKind = this.groupKindForView();
    if (!groupKind) {
      return this.taskItems(tasks);
    }

    const memberships = new Map<string, string>();
    for (const task of tasks) {
      for (const group of task.groups) {
        if (group.kind === groupKind) {
          memberships.set(group.id, group.label);
        }
      }
    }
    const items = [...memberships]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([groupId, label]) =>
        this.groupItem(
          label,
          tasks.filter((task) =>
            task.groups.some(
              (group) => group.kind === groupKind && group.id === groupId,
            ),
          ),
          { projectKey, sourceId, groupKind, groupId },
        ),
      );
    const ungrouped = tasks.filter(
      (task) => !task.groups.some((group) => group.kind === groupKind),
    );
    if (ungrouped.length > 0) {
      items.push(
        this.groupItem("Ungrouped", ungrouped, {
          projectKey,
          sourceId,
          groupKind,
        }),
      );
    }
    return items;
  }

  private groupKindForView(): string | undefined {
    switch (this.currentViewMode) {
      case TaskTreeViewMode.BY_TAG:
        return "tag";
      case TaskTreeViewMode.BY_MATRIX:
        return "matrix";
      default:
        return undefined;
    }
  }

  private groupItem(
    label: string,
    tasks: DiscoveredTask[],
    data: {
      projectKey: ProjectKey;
      sourceId: TaskSourceId;
      groupKind: string;
      groupId?: string;
    },
  ): TaskTreeItem {
    const item = new TaskTreeItem(
      `${label} (${tasks.length})`,
      vscode.TreeItemCollapsibleState.Collapsed,
      "group",
      data,
    );
    item.tooltip = `${tasks.length} task${tasks.length === 1 ? "" : "s"}`;
    return item;
  }

  private taskItems(tasks: DiscoveredTask[]): TaskTreeItem[] {
    return [...tasks]
      .sort((left, right) => left.label.localeCompare(right.label))
      .map((task) => {
        const status = this.taskManager.getTaskStatus(task.key);
        const running = ["queued", "running"].includes(status);
        const item = new TaskTreeItem(
          `${task.label}${task.roles.includes("default") ? " [default]" : ""}`,
          vscode.TreeItemCollapsibleState.None,
          "task",
          { projectKey: task.projectKey, sourceId: task.sourceId },
          task,
          status,
          task.capabilities.runnable
            ? {
                command: running
                  ? "taskMosaic.cancelTask"
                  : "taskMosaic.runTask",
                title: running ? "Cancel Task" : "Run Task",
                arguments: [task.key],
              }
            : undefined,
        );
        item.description = status === "idle" ? undefined : status;
        item.tooltip = [
          task.description || task.label,
          `Source: ${task.sourceId}`,
          `Status: ${status}`,
        ].join("\n");
        return item;
      });
  }

  private stateItem(
    label: string,
    icon: string,
    command?: vscode.Command,
  ): TaskTreeItem {
    const item = new TaskTreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
      "state",
      {},
      undefined,
      "idle",
      command,
    );
    item.iconPath = new vscode.ThemeIcon(icon);
    return item;
  }
}

export function tasksForGroup(
  taskManager: TaskManager,
  item: TaskTreeItem,
): DiscoveredTask[] {
  if (
    item.kind !== "group" ||
    !item.data.projectKey ||
    !item.data.sourceId ||
    !item.data.groupKind
  ) {
    return [];
  }
  const tasks = taskManager.findTasks({
    projectKey: item.data.projectKey,
    sourceId: item.data.sourceId,
  });
  if (item.data.groupId === undefined) {
    return tasks.filter(
      (task) =>
        !task.groups.some((group) => group.kind === item.data.groupKind),
    );
  }
  return taskManager.findTasks({
    projectKey: item.data.projectKey,
    sourceId: item.data.sourceId,
    group: { kind: item.data.groupKind, id: item.data.groupId },
  });
}
