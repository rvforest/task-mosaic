import * as vscode from "vscode";

import { TaskManager } from "../core/task-manager";
import {
  DiscoveredTask,
  TaskInvocation,
  TaskKey,
  TaskRunResult,
} from "../core/tasks/types";
import { getMaxConcurrentExecutions } from "./configuration";
import { NativeTaskService } from "./native-task-service";

interface GroupRun {
  id: string;
  cancelled: boolean;
  active: Set<TaskKey>;
  queued: Set<TaskKey>;
  cancelledTasks: Set<TaskKey>;
}

export class RunCoordinator {
  private readonly groups = new Map<string, GroupRun>();
  private nextGroupId = 1;

  constructor(
    private readonly taskManager: TaskManager,
    private readonly nativeTasks: NativeTaskService,
    private readonly output: vscode.OutputChannel,
  ) {}

  runTask(
    task: DiscoveredTask,
    invocation: TaskInvocation = {},
  ): Promise<TaskRunResult> {
    return this.nativeTasks.runTask(task, invocation);
  }

  async runGroup(
    label: string,
    tasks: DiscoveredTask[],
    invocation: TaskInvocation = {},
  ): Promise<TaskRunResult[]> {
    if (tasks.length === 0) {
      void vscode.window.showInformationMessage(`No tasks found for ${label}.`);
      return [];
    }

    const group: GroupRun = {
      id: `group-${this.nextGroupId++}`,
      cancelled: false,
      active: new Set(),
      queued: new Set(tasks.map((task) => task.key)),
      cancelledTasks: new Set(),
    };
    this.groups.set(group.id, group);
    for (const task of tasks) {
      this.taskManager.setTaskStatus(task.key, "queued");
    }

    const results = new Array<TaskRunResult | undefined>(tasks.length);
    let nextIndex = 0;
    const workerCount = Math.max(
      1,
      Math.min(getMaxConcurrentExecutions(), tasks.length),
    );
    const workers = Array.from({ length: workerCount }, async () => {
      while (!group.cancelled && nextIndex < tasks.length) {
        const index = nextIndex++;
        const task = tasks[index];
        if (group.cancelledTasks.has(task.key)) {
          results[index] = this.cancelledResult(
            task,
            "Cancelled before execution.",
          );
          continue;
        }
        group.queued.delete(task.key);
        group.active.add(task.key);
        try {
          results[index] = await this.nativeTasks.runTask(task, invocation);
        } catch (error: unknown) {
          const now = new Date();
          const result: TaskRunResult = {
            taskKey: task.key,
            status: "failed",
            startTime: now,
            endTime: now,
            durationMs: 0,
            reason: error instanceof Error ? error.message : String(error),
          };
          this.taskManager.setTaskStatus(task.key, "failed");
          results[index] = result;
        } finally {
          group.active.delete(task.key);
        }
      }
    });

    await Promise.all(workers);
    if (group.cancelled) {
      for (let index = nextIndex; index < tasks.length; index += 1) {
        const task = tasks[index];
        const now = new Date();
        this.taskManager.setTaskStatus(task.key, "cancelled");
        results[index] = {
          taskKey: task.key,
          status: "cancelled",
          startTime: now,
          endTime: now,
          durationMs: 0,
          reason: "Cancelled before execution.",
        };
      }
    }
    this.groups.delete(group.id);
    const completedResults = results.filter(
      (result): result is TaskRunResult => result !== undefined,
    );
    this.showSummary(label, tasks.length, completedResults);
    return completedResults;
  }

  cancelTask(taskKey: TaskKey): boolean {
    if (this.nativeTasks.cancelTask(taskKey)) {
      return true;
    }
    let cancelled = false;
    for (const group of this.groups.values()) {
      if (group.queued.delete(taskKey)) {
        group.cancelledTasks.add(taskKey);
        this.taskManager.setTaskStatus(taskKey, "cancelled");
        cancelled = true;
      }
    }
    return cancelled;
  }

  cancelAllGroups(): number {
    let count = 0;
    for (const group of this.groups.values()) {
      group.cancelled = true;
      for (const taskKey of group.queued) {
        group.cancelledTasks.add(taskKey);
        this.taskManager.setTaskStatus(taskKey, "cancelled");
        count += 1;
      }
      group.queued.clear();
      for (const taskKey of group.active) {
        if (this.nativeTasks.cancelTask(taskKey)) {
          count += 1;
        }
      }
    }
    return count;
  }

  private cancelledResult(
    task: DiscoveredTask,
    reason: string,
  ): TaskRunResult {
    const now = new Date();
    this.taskManager.setTaskStatus(task.key, "cancelled");
    return {
      taskKey: task.key,
      status: "cancelled",
      startTime: now,
      endTime: now,
      durationMs: 0,
      reason,
    };
  }

  private showSummary(
    label: string,
    total: number,
    results: TaskRunResult[],
  ): void {
    const counts = {
      succeeded: results.filter((result) => result.status === "succeeded")
        .length,
      failed: results.filter((result) => result.status === "failed").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      cancelled: results.filter((result) => result.status === "cancelled")
        .length,
    };
    const message = `${label}: ${counts.succeeded} succeeded, ${counts.failed} failed, ${counts.skipped} skipped, ${counts.cancelled} cancelled (${total} total).`;
    this.output.appendLine(message);
    if (counts.failed > 0) {
      void vscode.window
        .showWarningMessage(message, "Show Output")
        .then((selection) => selection === "Show Output" && this.output.show());
    } else {
      void vscode.window.showInformationMessage(message);
    }
  }
}
