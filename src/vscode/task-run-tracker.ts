import * as vscode from "vscode";

import { TaskManager } from "../core/task-manager";
import {
  ExecutionOutcome,
  ExecutionPlan,
} from "../core/task-source/task-source";
import {
  DiscoveredTask,
  TaskKey,
  TaskRunResult,
} from "../core/tasks/types";

interface RunContext {
  task: DiscoveredTask;
  nativeTask: vscode.Task;
  plan: ExecutionPlan;
  startTime: Date;
  execution?: vscode.TaskExecution;
  processStarted: boolean;
  processEventSeen: boolean;
  cancelledRequested: boolean;
  settlePromise?: Promise<void>;
  resolve: (result: TaskRunResult) => void;
  promise: Promise<TaskRunResult>;
}

export interface TrackedTask {
  task: DiscoveredTask;
  plan: ExecutionPlan;
}

export class TaskRunTracker implements vscode.Disposable {
  private readonly pendingByNativeTask = new WeakMap<vscode.Task, RunContext>();
  private readonly contextsByExecution = new Map<
    vscode.TaskExecution,
    RunContext
  >();
  private readonly activeByTask = new Map<TaskKey, RunContext>();
  private readonly lastResults = new Map<TaskKey, TaskRunResult>();

  constructor(
    private readonly taskManager: TaskManager,
    private readonly output: vscode.OutputChannel,
  ) {}

  queue(
    nativeTask: vscode.Task,
    tracked: TrackedTask,
  ): Promise<TaskRunResult> {
    if (this.activeByTask.has(tracked.task.key)) {
      throw new Error(`Task '${tracked.task.label}' is already running.`);
    }
    const context = this.createContext(
      tracked.task,
      nativeTask,
      tracked.plan,
    );
    this.pendingByNativeTask.set(nativeTask, context);
    this.activeByTask.set(tracked.task.key, context);
    this.taskManager.setTaskStatus(tracked.task.key, "queued");
    return context.promise;
  }

  attachExecution(
    nativeTask: vscode.Task,
    execution: vscode.TaskExecution,
  ): void {
    const context = this.pendingByNativeTask.get(nativeTask);
    if (context) {
      context.execution = execution;
    }
  }

  taskStarted(
    event: vscode.TaskStartEvent,
    tracked: TrackedTask,
  ): boolean {
    const existing = this.activeByTask.get(tracked.task.key);
    let context = this.pendingByNativeTask.get(event.execution.task);
    if (
      existing &&
      (!context || existing.nativeTask !== event.execution.task)
    ) {
      this.output.appendLine(
        `[task] Refusing duplicate execution of ${tracked.task.label}.`,
      );
      event.execution.terminate();
      return false;
    }
    if (!context) {
      context = this.createContext(
        tracked.task,
        event.execution.task,
        tracked.plan,
      );
      this.activeByTask.set(tracked.task.key, context);
    }
    context.execution = event.execution;
    context.startTime = new Date();
    this.contextsByExecution.set(event.execution, context);
    if (context.cancelledRequested) {
      event.execution.terminate();
    }
    this.taskManager.setTaskStatus(tracked.task.key, "running");
    return true;
  }

  taskProcessStarted(event: vscode.TaskProcessStartEvent): void {
    const context = this.contextsByExecution.get(event.execution);
    if (context) {
      context.processStarted = true;
    }
  }

  async taskProcessEnded(event: vscode.TaskProcessEndEvent): Promise<void> {
    const context = this.contextsByExecution.get(event.execution);
    if (!context) {
      return;
    }
    context.processEventSeen = true;
    if (event.exitCode === undefined) {
      context.cancelledRequested = true;
    }
    await this.settle(context, event.exitCode);
  }

  taskEnded(event: vscode.TaskEndEvent): void {
    const context = this.contextsByExecution.get(event.execution);
    if (!context || context.settlePromise || context.processEventSeen) {
      return;
    }
    setTimeout(() => {
      if (context.settlePromise || context.processEventSeen) {
        return;
      }
      if (context.plan.kind === "managed" || context.processStarted) {
        context.cancelledRequested = true;
        void this.settle(context);
      } else {
        void this.settle(
          context,
          undefined,
          "Task ended before its process started.",
        );
      }
    }, 0);
  }

  async managedOutcome(
    nativeTask: vscode.Task,
    tracked: TrackedTask,
    outcome: ExecutionOutcome,
  ): Promise<void> {
    const context = this.contextForNativeTask(nativeTask, tracked.task.key);
    if (context) {
      await this.settle(context, undefined, undefined, outcome);
    }
  }

  managedCancelled(nativeTask: vscode.Task, tracked: TrackedTask): void {
    const context = this.contextForNativeTask(nativeTask, tracked.task.key);
    if (context) {
      context.cancelledRequested = true;
    }
  }

  async managedError(
    nativeTask: vscode.Task,
    tracked: TrackedTask,
    error: unknown,
  ): Promise<void> {
    const context = this.contextForNativeTask(nativeTask, tracked.task.key);
    if (context) {
      await this.settle(
        context,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async launchFailed(nativeTask: vscode.Task, error: unknown): Promise<void> {
    const context = this.pendingByNativeTask.get(nativeTask);
    if (context) {
      await this.settle(
        context,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
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
    for (const context of [...this.activeByTask.values()]) {
      context.cancelledRequested = true;
      context.execution?.terminate();
      void this.settle(context);
    }
  }

  private contextForNativeTask(
    nativeTask: vscode.Task,
    taskKey: TaskKey,
  ): RunContext | undefined {
    const context = this.activeByTask.get(taskKey);
    return context?.nativeTask === nativeTask ? context : undefined;
  }

  private settle(
    context: RunContext,
    exitCode?: number,
    launchError?: string,
    directOutcome?: ExecutionOutcome,
  ): Promise<void> {
    if (!context.settlePromise) {
      context.settlePromise = this.finalize(
        context,
        exitCode,
        launchError,
        directOutcome,
      );
    }
    return context.settlePromise;
  }

  private async finalize(
    context: RunContext,
    exitCode?: number,
    launchError?: string,
    directOutcome?: ExecutionOutcome,
  ): Promise<void> {
    const endTime = new Date();
    let resolvedOutcome = directOutcome;
    if (!resolvedOutcome && !launchError && context.plan.result) {
      try {
        resolvedOutcome = await context.plan.result.resolve(context.startTime);
      } catch (error: unknown) {
        this.output.appendLine(
          `[task] Could not interpret the result for ${context.task.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (context.plan.result?.cleanup) {
      try {
        await context.plan.result.cleanup();
      } catch (error: unknown) {
        this.output.appendLine(
          `[task] Could not clean execution artifacts for ${context.task.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    let status: TaskRunResult["status"];
    let reason: string | undefined;
    if (context.cancelledRequested) {
      status = "cancelled";
      reason = "Task was cancelled.";
    } else if (launchError) {
      status = "failed";
      reason = launchError;
    } else if (
      resolvedOutcome?.status === "succeeded" &&
      exitCode !== undefined &&
      exitCode !== 0
    ) {
      status = "failed";
      reason = `Task exited with code ${exitCode} after reporting success.`;
    } else if (resolvedOutcome) {
      status = resolvedOutcome.status;
      reason = resolvedOutcome.reason;
    } else {
      status = exitCode === 0 ? "succeeded" : "failed";
      if (exitCode === undefined) {
        reason = "Task ended without a result or exit code.";
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
    if (this.activeByTask.get(context.task.key) === context) {
      this.activeByTask.delete(context.task.key);
    }
    this.pendingByNativeTask.delete(context.nativeTask);
    if (context.execution) {
      this.contextsByExecution.delete(context.execution);
    }
    context.resolve(result);
  }

  private createContext(
    task: DiscoveredTask,
    nativeTask: vscode.Task,
    plan: ExecutionPlan,
  ): RunContext {
    let resolve!: (result: TaskRunResult) => void;
    const promise = new Promise<TaskRunResult>((resolvePromise) => {
      resolve = resolvePromise;
    });
    return {
      task,
      nativeTask,
      plan,
      startTime: new Date(),
      processStarted: false,
      processEventSeen: false,
      cancelledRequested: false,
      resolve,
      promise,
    };
  }
}
