import * as vscode from "vscode";

import { TaskManager } from "../../core/task-manager";
import { TaskSourceRegistry } from "../../core/task-source/task-source-registry";
import {
  DiscoveredTask,
  TaskInvocation,
  TaskKey,
} from "../../core/tasks/types";
import { RunCoordinator } from "../run-coordinator";
import { TaskTreeItem } from "../ui/tree-view/TaskTreeItem";
import { tasksForGroup } from "../ui/tree-view/TaskTreeProvider";

export class TaskCommands {
  constructor(
    private readonly taskManager: TaskManager,
    private readonly registry: TaskSourceRegistry,
    private readonly coordinator: RunCoordinator,
  ) {}

  registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand("taskMosaic.runTask", (value) =>
        this.runTask(value),
      ),
      vscode.commands.registerCommand("taskMosaic.runTaskWithArgs", (value) =>
        this.runTaskWithArgs(value),
      ),
      vscode.commands.registerCommand("taskMosaic.runAllDefaultTasks", () =>
        this.runAllDefaults(),
      ),
      vscode.commands.registerCommand("taskMosaic.runGroup", (item) =>
        this.runGroup(item),
      ),
      vscode.commands.registerCommand("taskMosaic.runGroupWithArgs", (item) =>
        this.runGroupWithArgs(item),
      ),
      vscode.commands.registerCommand("taskMosaic.cancelTask", (value) =>
        this.cancelTask(value),
      ),
      vscode.commands.registerCommand("taskMosaic.cancelAll", () => {
        const count = this.coordinator.cancelAllGroups();
        void vscode.window.showInformationMessage(
          count > 0
            ? `Cancelling ${count} task(s).`
            : "No group tasks are running.",
        );
      }),
    );
  }

  private async runTask(
    value: unknown,
    invocation: TaskInvocation = {},
  ): Promise<void> {
    const task = this.resolveTask(value);
    if (!task) {
      void vscode.window.showErrorMessage("Task not found.");
      return;
    }
    try {
      await this.coordinator.runTask(task, invocation);
    } catch (error: unknown) {
      void vscode.window.showErrorMessage(
        `Failed to run ${task.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async runTaskWithArgs(value: unknown): Promise<void> {
    const task = this.resolveTask(value);
    if (!task) {
      void vscode.window.showErrorMessage("Task not found.");
      return;
    }
    const invocation = await this.promptForInvocation([task]);
    if (invocation) {
      await this.runTask(task, invocation);
    }
  }

  private async runAllDefaults(): Promise<void> {
    await this.coordinator.runGroup(
      "All default tasks",
      this.taskManager.findTasks({ role: "default" }),
    );
  }

  private async runGroup(
    value: unknown,
    invocation: TaskInvocation = {},
  ): Promise<void> {
    if (!(value instanceof TaskTreeItem)) {
      void vscode.window.showErrorMessage("Task group not found.");
      return;
    }
    const tasks = tasksForGroup(this.taskManager, value);
    await this.coordinator.runGroup(
      value.label?.toString() || "Task group",
      tasks,
      invocation,
    );
  }

  private async runGroupWithArgs(value: unknown): Promise<void> {
    if (!(value instanceof TaskTreeItem)) {
      void vscode.window.showErrorMessage("Task group not found.");
      return;
    }
    const tasks = tasksForGroup(this.taskManager, value);
    const invocation = await this.promptForInvocation(tasks);
    if (invocation) {
      await this.runGroup(value, invocation);
    }
  }

  private cancelTask(value: unknown): void {
    const task = this.resolveTask(value);
    if (!task || !this.coordinator.cancelTask(task.key)) {
      void vscode.window.showInformationMessage(
        "The selected task is not running.",
      );
    }
  }

  private resolveTask(value: unknown): DiscoveredTask | undefined {
    if (typeof value === "string") {
      return this.taskManager.getTask(value as TaskKey);
    }
    if (value instanceof TaskTreeItem) {
      return value.task;
    }
    if (value && typeof value === "object" && "key" in value) {
      return this.taskManager.getTask(
        String((value as { key: unknown }).key) as TaskKey,
      );
    }
    return undefined;
  }

  private async promptForInvocation(
    tasks: DiscoveredTask[],
  ): Promise<TaskInvocation | undefined> {
    const sourceIds = [...new Set(tasks.map((task) => task.sourceId))];
    if (sourceIds.length !== 1) {
      void vscode.window.showErrorMessage(
        "Select tasks from one source before providing input.",
      );
      return undefined;
    }
    const adapter = this.registry.get(sourceIds[0])?.invocationInput;
    if (!adapter) {
      void vscode.window.showErrorMessage(
        "This task source does not accept interactive input.",
      );
      return undefined;
    }
    const input = await vscode.window.showInputBox({
      prompt: adapter.prompt,
      placeHolder: adapter.placeHolder,
    });
    if (input === undefined) {
      return undefined;
    }
    try {
      return adapter.parse(input);
    } catch (error: unknown) {
      void vscode.window.showErrorMessage(
        `Invalid arguments: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }
}
