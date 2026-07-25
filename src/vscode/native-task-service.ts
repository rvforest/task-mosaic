import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { TaskManager } from "../core/task-manager";
import {
  ExecutionOutcome,
  ManagedExecutionPlan,
} from "../core/task-source/task-source";
import { TaskSourceRegistry } from "../core/task-source/task-source-registry";
import {
  DiscoveredTask,
  JsonObject,
  JsonValue,
  TaskInvocation,
  TaskKey,
  TaskRunResult,
  taskSourceId,
} from "../core/tasks/types";
import { TaskRunTracker, TrackedTask } from "./task-run-tracker";

export const TASK_TYPE = "taskMosaic";

interface TaskMosaicDefinition extends vscode.TaskDefinition {
  type: typeof TASK_TYPE;
  source: string;
  project: string;
  task: string;
  inputs?: JsonObject;
}

class ManagedTaskTerminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number | void>();
  private readonly controller = new AbortController();
  private closed = false;

  readonly onDidWrite = this.writeEmitter.event;
  readonly onDidClose = this.closeEmitter.event;

  constructor(
    private readonly plan: ManagedExecutionPlan,
    private readonly onCancel: () => void,
    private readonly onOutcome: (outcome: ExecutionOutcome) => Promise<void>,
    private readonly onError: (error: unknown) => Promise<void>,
  ) {}

  open(): void {
    void this.run();
  }

  close(): void {
    this.onCancel();
    this.controller.abort();
    this.finish();
  }

  private async run(): Promise<void> {
    try {
      const outcome = await this.plan.run({
        signal: this.controller.signal,
        write: (output) => this.writeEmitter.fire(output),
      });
      await this.onOutcome(outcome);
      this.finish(outcome.status === "failed" ? 1 : 0);
    } catch (error: unknown) {
      await this.onError(error);
      this.finish(1);
    }
  }

  private finish(exitCode?: number): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closeEmitter.fire(exitCode);
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }
}

export class NativeTaskService
  implements vscode.TaskProvider, vscode.Disposable
{
  private readonly disposables: vscode.Disposable[] = [];
  private readonly preparedTasks = new WeakMap<vscode.Task, TrackedTask>();
  private readonly tracker: TaskRunTracker;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private tokenCounter = 0;
  private readonly artifactsDirectory: string;
  readonly onDidChangeTasks = this.changeEmitter.event;

  constructor(
    private readonly taskManager: TaskManager,
    private readonly registry: TaskSourceRegistry,
    storageUri: vscode.Uri,
    private readonly output: vscode.OutputChannel,
  ) {
    this.artifactsDirectory = path.join(storageUri.fsPath, "artifacts");
    this.tracker = new TaskRunTracker(this.taskManager, this.output);
    const removeManagerListener = this.taskManager.onDidChange(() =>
      this.changeEmitter.fire(),
    );
    this.disposables.push(
      { dispose: removeManagerListener },
      this.changeEmitter,
      vscode.tasks.onDidStartTask((event) => {
        const tracked = this.preparedTasks.get(event.execution.task);
        if (tracked) {
          this.tracker.taskStarted(event, tracked);
        }
      }),
      vscode.tasks.onDidStartTaskProcess((event) =>
        this.tracker.taskProcessStarted(event),
      ),
      vscode.tasks.onDidEndTaskProcess((event) => {
        void this.tracker.taskProcessEnded(event);
      }),
      vscode.tasks.onDidEndTask((event) => this.tracker.taskEnded(event)),
    );
  }

  async initialize(): Promise<void> {
    await fs.promises.rm(this.artifactsDirectory, {
      recursive: true,
      force: true,
    });
    await fs.promises.mkdir(this.artifactsDirectory, { recursive: true });
  }

  provideTasks(): vscode.ProviderResult<vscode.Task[]> {
    return this.taskManager
      .getAllTasks()
      .filter((task) => {
        const source = this.registry.get(task.sourceId);
        return (
          task.capabilities.runnable &&
          source !== undefined &&
          (vscode.workspace.isTrusted || !source.trust.execution)
        );
      })
      .map((task) => this.createNativeTask(task, {}));
  }

  resolveTask(task: vscode.Task): vscode.ProviderResult<vscode.Task> {
    if (task.definition.type !== TASK_TYPE) {
      return undefined;
    }
    const definition = task.definition as TaskMosaicDefinition;
    const workspaceFolder =
      task.scope && typeof task.scope !== "number" ? task.scope : undefined;
    if (
      !workspaceFolder ||
      typeof definition.source !== "string" ||
      typeof definition.project !== "string" ||
      typeof definition.task !== "string"
    ) {
      return undefined;
    }
    const sourceId = taskSourceId(definition.source);
    const source = this.registry.get(sourceId);
    if (
      !source ||
      (!vscode.workspace.isTrusted && source.trust.execution)
    ) {
      return undefined;
    }
    const project = this.taskManager
      .getDiscoveryState()
      .projects.find(
        (candidate) =>
          candidate.workspaceUri === workspaceFolder.uri.toString() &&
          candidate.sourceId === sourceId &&
          candidate.relativePath === definition.project,
      );
    if (!project) {
      return undefined;
    }
    const discovered = this.taskManager
      .getTasksForProject(project.key)
      .find((candidate) => candidate.sourceTaskId === definition.task);
    if (!discovered) {
      return undefined;
    }
    return this.createNativeTask(
      discovered,
      { inputs: this.jsonObject(definition.inputs) },
      definition,
    );
  }

  async runTask(
    task: DiscoveredTask,
    invocation: TaskInvocation = {},
  ): Promise<TaskRunResult> {
    const source = this.registry.get(task.sourceId);
    if (!source) {
      throw new Error(`Task source '${task.sourceId}' is unavailable.`);
    }
    if (!task.capabilities.runnable) {
      throw new Error(`Task '${task.label}' is not runnable.`);
    }
    if (!vscode.workspace.isTrusted && source.trust.execution) {
      throw new Error("Trust this workspace before running this task.");
    }
    const nativeTask = this.createNativeTask(task, invocation);
    const prepared = this.preparedTasks.get(nativeTask)!;
    const result = this.tracker.queue(nativeTask, prepared);

    try {
      const execution = await vscode.tasks.executeTask(nativeTask);
      this.tracker.attachExecution(nativeTask, execution);
    } catch (error: unknown) {
      await this.tracker.launchFailed(nativeTask, error);
    }
    return result;
  }

  cancelTask(taskKey: TaskKey): boolean {
    return this.tracker.cancelTask(taskKey);
  }

  getLastResult(taskKey: TaskKey): TaskRunResult | undefined {
    return this.tracker.getLastResult(taskKey);
  }

  dispose(): void {
    this.tracker.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private createNativeTask(
    task: DiscoveredTask,
    invocation: TaskInvocation,
    existingDefinition?: TaskMosaicDefinition,
  ): vscode.Task {
    const project = this.taskManager.getProject(task.projectKey);
    const source = this.registry.get(task.sourceId);
    if (!project || !source) {
      throw new Error(`Cannot resolve task '${task.label}'.`);
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.find(
      (folder) => folder.uri.toString() === project.workspaceUri,
    );
    if (!workspaceFolder) {
      throw new Error(`Workspace for task '${task.label}' is unavailable.`);
    }

    const artifactPrefix = this.nextToken();
    const plan = source.createExecution(task, project, invocation, {
      createArtifactPath: (name) =>
        path.join(
          this.artifactsDirectory,
          `${artifactPrefix}-${path.basename(name)}`,
        ),
    });
    const definition: TaskMosaicDefinition = existingDefinition ?? {
      type: TASK_TYPE,
      source: task.sourceId,
      project: project.relativePath,
      task: task.sourceTaskId,
      ...(invocation.inputs ? { inputs: invocation.inputs } : {}),
    };

    let nativeTask!: vscode.Task;
    const execution =
      plan.kind === "process"
        ? new vscode.ProcessExecution(plan.command, plan.args, {
            cwd: plan.cwd,
            env: plan.env,
          })
        : new vscode.CustomExecution(
            async () =>
              new ManagedTaskTerminal(
                plan,
                () =>
                  this.tracker.managedCancelled(nativeTask, {
                    task,
                    plan,
                  }),
                (outcome) =>
                  this.tracker.managedOutcome(
                    nativeTask,
                    { task, plan },
                    outcome,
                  ),
                (error) =>
                  this.tracker.managedError(
                    nativeTask,
                    { task, plan },
                    error,
                  ),
              ),
          );
    nativeTask = new vscode.Task(
      definition,
      workspaceFolder,
      task.label,
      `TaskMosaic: ${source.displayName}`,
      execution,
      [],
    );
    nativeTask.detail = task.description;
    nativeTask.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated,
      focus: false,
      clear: false,
    };
    this.preparedTasks.set(nativeTask, { task, plan });
    return nativeTask;
  }

  private nextToken(): string {
    this.tokenCounter += 1;
    return `${Date.now()}-${process.pid}-${this.tokenCounter}`;
  }

  private jsonObject(value: unknown): JsonObject | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const entries = Object.entries(value);
    return entries.every(([, item]) => this.isJsonValue(item))
      ? Object.fromEntries(entries)
      : undefined;
  }

  private isJsonValue(value: unknown): value is JsonValue {
    if (
      value === null ||
      ["string", "number", "boolean"].includes(typeof value)
    ) {
      return true;
    }
    if (Array.isArray(value)) {
      return value.every((item) => this.isJsonValue(item));
    }
    return (
      typeof value === "object" &&
      Object.values(value as Record<string, unknown>).every((item) =>
        this.isJsonValue(item),
      )
    );
  }
}
