import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { FrameworkRegistry } from "../core/framework/framework-registry";
import { TaskManager } from "../core/task-manager";
import {
  Task,
  TaskKey,
  TaskRunOptions,
  TaskRunResult,
} from "../core/tasks/types";
import { getFrameworkConfig } from "./configuration";

export const TASK_TYPE = "taskMosaic";

interface TaskMosaicDefinition extends vscode.TaskDefinition {
  type: typeof TASK_TYPE;
  framework: string;
  project: string;
  task: string;
  runnerArgs?: string[];
  taskArgs?: string[];
  taskKey?: TaskKey;
  runToken?: string;
  reportPath?: string;
}

interface RunContext {
  token: string;
  task: Task;
  reportPath: string;
  startTime: Date;
  execution?: vscode.TaskExecution;
  processEventSeen: boolean;
  cancelledRequested: boolean;
  settled: boolean;
  resolve: (result: TaskRunResult) => void;
  promise: Promise<TaskRunResult>;
}

export class NativeTaskService
  implements vscode.TaskProvider, vscode.Disposable
{
  private readonly disposables: vscode.Disposable[] = [];
  private readonly contexts = new Map<string, RunContext>();
  private readonly activeByTask = new Map<TaskKey, RunContext>();
  private readonly lastResults = new Map<TaskKey, TaskRunResult>();
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private tokenCounter = 0;
  private readonly reportsDirectory: string;
  readonly onDidChangeTasks = this.changeEmitter.event;

  constructor(
    private readonly taskManager: TaskManager,
    private readonly registry: FrameworkRegistry,
    storageUri: vscode.Uri,
    private readonly output: vscode.OutputChannel,
  ) {
    this.reportsDirectory = path.join(storageUri.fsPath, "reports");
    const removeManagerListener = this.taskManager.onDidChange(() =>
      this.changeEmitter.fire(),
    );
    this.disposables.push(
      { dispose: removeManagerListener },
      this.changeEmitter,
      vscode.tasks.onDidStartTask((event) => this.handleTaskStart(event)),
      vscode.tasks.onDidEndTaskProcess((event) => {
        void this.handleTaskProcessEnd(event);
      }),
      vscode.tasks.onDidEndTask((event) => this.handleTaskEnd(event)),
    );
  }

  async initialize(): Promise<void> {
    await fs.promises.rm(this.reportsDirectory, {
      recursive: true,
      force: true,
    });
    await fs.promises.mkdir(this.reportsDirectory, { recursive: true });
  }

  provideTasks(): vscode.ProviderResult<vscode.Task[]> {
    if (!vscode.workspace.isTrusted) {
      return [];
    }
    return this.taskManager
      .getAllTasks()
      .map((task) => this.createNativeTask(task, {}));
  }

  resolveTask(task: vscode.Task): vscode.ProviderResult<vscode.Task> {
    if (!vscode.workspace.isTrusted || task.definition.type !== TASK_TYPE) {
      return undefined;
    }
    const definition = task.definition as TaskMosaicDefinition;
    const workspaceFolder =
      task.scope && typeof task.scope !== "number" ? task.scope : undefined;
    if (!workspaceFolder) {
      return undefined;
    }
    const project = this.taskManager
      .getDiscoveryState()
      .projects.find(
        (candidate) =>
          candidate.workspaceUri === workspaceFolder.uri.toString() &&
          candidate.frameworkId === definition.framework &&
          candidate.relativePath === definition.project,
      );
    if (!project) {
      return undefined;
    }
    const discovered = this.taskManager
      .getTasksForProject(project.key)
      .find((candidate) => candidate.frameworkTaskId === definition.task);
    if (!discovered) {
      return undefined;
    }
    return this.createNativeTask(discovered, {
      runnerArgs: this.stringArray(definition.runnerArgs),
      taskArgs: this.stringArray(definition.taskArgs),
    });
  }

  async runTask(
    task: Task,
    options: TaskRunOptions = {},
  ): Promise<TaskRunResult> {
    if (!vscode.workspace.isTrusted) {
      throw new Error("Trust this workspace before running tasks.");
    }
    if (this.activeByTask.has(task.key)) {
      throw new Error(`Task '${task.label}' is already running.`);
    }
    const nativeTask = this.createNativeTask(task, options);
    const definition = nativeTask.definition as TaskMosaicDefinition;
    const context = this.createContext(
      task,
      definition.runToken!,
      definition.reportPath!,
    );
    this.contexts.set(context.token, context);
    this.activeByTask.set(task.key, context);
    this.taskManager.setTaskStatus(task.key, "queued");
    try {
      context.execution = await vscode.tasks.executeTask(nativeTask);
      return await context.promise;
    } catch (error: unknown) {
      if (!context.settled) {
        await this.settle(
          context,
          undefined,
          error instanceof Error ? error.message : String(error),
        );
      }
      return context.promise;
    }
  }

  cancelTask(taskKey: TaskKey): boolean {
    const context = this.activeByTask.get(taskKey);
    if (!context) {
      return false;
    }
    context.cancelledRequested = true;
    context.execution?.terminate();
    return true;
  }

  getLastResult(taskKey: TaskKey): TaskRunResult | undefined {
    return this.lastResults.get(taskKey);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    for (const context of this.activeByTask.values()) {
      context.cancelledRequested = true;
      context.execution?.terminate();
    }
  }

  private createNativeTask(task: Task, options: TaskRunOptions): vscode.Task {
    const project = this.taskManager.getProject(task.projectKey);
    const framework = this.registry.get(task.frameworkId);
    if (!project || !framework) {
      throw new Error(`Cannot resolve task '${task.label}'.`);
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.find(
      (folder) => folder.uri.toString() === project.workspaceUri,
    );
    if (!workspaceFolder) {
      throw new Error(`Workspace for task '${task.label}' is unavailable.`);
    }

    const runToken = this.nextToken();
    const reportPath = path.join(this.reportsDirectory, `${runToken}.json`);
    const definition: TaskMosaicDefinition = {
      type: TASK_TYPE,
      framework: task.frameworkId,
      project: project.relativePath,
      task: task.frameworkTaskId,
      runnerArgs: options.runnerArgs,
      taskArgs: options.taskArgs,
      taskKey: task.key,
      runToken,
      reportPath,
    };
    const spec = framework.createExecution(
      task,
      project,
      options,
      getFrameworkConfig(task.frameworkId, vscode.Uri.parse(project.rootUri)),
      reportPath,
    );
    const nativeTask = new vscode.Task(
      definition,
      workspaceFolder,
      task.label,
      `TaskMosaic: ${framework.displayName}`,
      new vscode.ProcessExecution(spec.command, spec.args, { cwd: spec.cwd }),
      [],
    );
    nativeTask.detail = task.description;
    nativeTask.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated,
      focus: false,
      clear: false,
    };
    return nativeTask;
  }

  private handleTaskStart(event: vscode.TaskStartEvent): void {
    const definition = event.execution.task.definition as TaskMosaicDefinition;
    if (
      definition.type !== TASK_TYPE ||
      !definition.taskKey ||
      !definition.runToken
    ) {
      return;
    }
    let context = this.contexts.get(definition.runToken);
    const task = this.taskManager.getTask(definition.taskKey);
    if (!task) {
      event.execution.terminate();
      return;
    }
    const existing = this.activeByTask.get(task.key);
    if (existing && existing.token !== definition.runToken) {
      this.output.appendLine(
        `[task] Refusing duplicate execution of ${task.label}.`,
      );
      event.execution.terminate();
      return;
    }
    if (!context) {
      context = this.createContext(
        task,
        definition.runToken,
        definition.reportPath!,
      );
      this.contexts.set(context.token, context);
      this.activeByTask.set(task.key, context);
    }
    context.execution = event.execution;
    context.startTime = new Date();
    if (context.cancelledRequested) {
      event.execution.terminate();
    }
    this.taskManager.setTaskStatus(task.key, "running");
  }

  private async handleTaskProcessEnd(
    event: vscode.TaskProcessEndEvent,
  ): Promise<void> {
    const context = this.contextForExecution(event.execution);
    if (!context) {
      return;
    }
    context.processEventSeen = true;
    await this.settle(context, event.exitCode);
  }

  private handleTaskEnd(event: vscode.TaskEndEvent): void {
    const context = this.contextForExecution(event.execution);
    if (!context || context.settled || context.processEventSeen) {
      return;
    }
    setTimeout(() => {
      if (!context.settled && !context.processEventSeen) {
        void this.settle(
          context,
          undefined,
          "Task ended before its process started.",
        );
      }
    }, 0);
  }

  private async settle(
    context: RunContext,
    exitCode?: number,
    launchError?: string,
  ): Promise<void> {
    if (context.settled) {
      return;
    }
    context.settled = true;
    const endTime = new Date();
    let status: TaskRunResult["status"];
    let reason: string | undefined;

    if (context.cancelledRequested) {
      status = "cancelled";
    } else {
      const framework = this.registry.get(context.task.frameworkId);
      let reportOutcome;
      try {
        reportOutcome = await framework?.interpretResult(
          context.reportPath,
          context.startTime,
        );
      } catch (error: unknown) {
        this.output.appendLine(
          `[task] Could not interpret the result for ${context.task.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (reportOutcome) {
        status = reportOutcome.status;
        reason = reportOutcome.reason;
      } else if (launchError) {
        status = "failed";
        reason = launchError;
      } else {
        status = exitCode === 0 ? "succeeded" : "failed";
        if (exitCode === undefined) {
          reason = "Task process did not report an exit code.";
        }
      }
    }

    const result: TaskRunResult = {
      taskKey: context.task.key,
      status,
      exitCode,
      startTime: context.startTime,
      endTime,
      durationMs: Math.max(0, endTime.getTime() - context.startTime.getTime()),
      reason,
    };
    this.lastResults.set(context.task.key, result);
    this.taskManager.setTaskStatus(context.task.key, status);
    this.activeByTask.delete(context.task.key);
    this.contexts.delete(context.token);
    try {
      await fs.promises.rm(context.reportPath, { force: true });
    } catch (error: unknown) {
      this.output.appendLine(
        `[task] Could not remove result report ${context.reportPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    context.resolve(result);
  }

  private contextForExecution(
    execution: vscode.TaskExecution,
  ): RunContext | undefined {
    const definition = execution.task.definition as TaskMosaicDefinition;
    return definition.runToken
      ? this.contexts.get(definition.runToken)
      : undefined;
  }

  private createContext(
    task: Task,
    token: string,
    reportPath: string,
  ): RunContext {
    let resolve!: (result: TaskRunResult) => void;
    const promise = new Promise<TaskRunResult>((resolvePromise) => {
      resolve = resolvePromise;
    });
    return {
      token,
      task,
      reportPath,
      startTime: new Date(),
      processEventSeen: false,
      cancelledRequested: false,
      settled: false,
      resolve,
      promise,
    };
  }

  private nextToken(): string {
    this.tokenCounter += 1;
    return `${Date.now()}-${process.pid}-${this.tokenCounter}`;
  }

  private stringArray(value: unknown): string[] | undefined {
    return Array.isArray(value) &&
      value.every((item) => typeof item === "string")
      ? value
      : undefined;
  }
}
