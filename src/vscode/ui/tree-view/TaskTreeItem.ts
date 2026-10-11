import * as vscode from "vscode";

import {
  DiscoveredTask,
  ProjectKey,
  TaskSourceId,
  TaskStatus,
} from "../../../core/tasks/types";
import { TaskTreeNodeKind } from "./types";

export interface TaskTreeNodeData {
  workspaceUri?: string;
  projectKey?: ProjectKey;
  sourceId?: TaskSourceId;
  groupKind?: string;
  groupId?: string;
}

export class TaskTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly kind: TaskTreeNodeKind,
    public readonly data: TaskTreeNodeData = {},
    public readonly task?: DiscoveredTask,
    status: TaskStatus = "idle",
    command?: vscode.Command,
  ) {
    super(label, collapsibleState);
    this.contextValue = this.contextFor(kind, status, task);
    this.command = command;
    this.iconPath = this.iconFor(kind, status);
  }

  private contextFor(
    kind: TaskTreeNodeKind,
    status: TaskStatus,
    task?: DiscoveredTask,
  ): string {
    if (kind !== "task") {
      return kind;
    }
    if (!task?.capabilities.runnable) {
      return "nonRunnableTask";
    }
    return ["queued", "running"].includes(status) ? "runningTask" : "task";
  }

  private iconFor(
    kind: TaskTreeNodeKind,
    status: TaskStatus,
  ): vscode.ThemeIcon | undefined {
    if (kind === "task") {
      switch (status) {
        case "queued":
          return new vscode.ThemeIcon(
            "clock",
            new vscode.ThemeColor("charts.yellow"),
          );
        case "running":
          return new vscode.ThemeIcon("loading~spin");
        case "succeeded":
          return new vscode.ThemeIcon(
            "pass",
            new vscode.ThemeColor("testing.iconPassed"),
          );
        case "failed":
          return new vscode.ThemeIcon(
            "error",
            new vscode.ThemeColor("testing.iconFailed"),
          );
        case "skipped":
          return new vscode.ThemeIcon(
            "debug-step-over",
            new vscode.ThemeColor("testing.iconSkipped"),
          );
        case "cancelled":
          return new vscode.ThemeIcon("circle-slash");
        default:
          return new vscode.ThemeIcon("circle-outline");
      }
    }
    switch (kind) {
      case "workspace":
        return new vscode.ThemeIcon("root-folder");
      case "project":
        return new vscode.ThemeIcon("folder-library");
      case "source":
        return new vscode.ThemeIcon("tools");
      case "group":
        return new vscode.ThemeIcon("group-by-ref-type");
      default:
        return undefined;
    }
  }
}
