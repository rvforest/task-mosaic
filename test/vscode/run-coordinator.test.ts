jest.mock(
  "vscode",
  () => ({
    window: {
      showInformationMessage: jest.fn(),
      showWarningMessage: jest.fn().mockResolvedValue(undefined),
    },
    workspace: {
      getConfiguration: jest.fn(() => ({
        get: jest.fn((_key: string, fallback: unknown) =>
          _key === "maxConcurrent" ? 2 : fallback,
        ),
      })),
    },
  }),
  { virtual: true },
);

import { TaskManager } from "../../src/core/task-manager";
import { TaskRunResult } from "../../src/core/tasks/types";
import { NativeTaskService } from "../../src/vscode/native-task-service";
import { RunCoordinator } from "../../src/vscode/run-coordinator";
import { project, task } from "../helpers";

describe("RunCoordinator", () => {
  it("bounds group concurrency and continues after failures", async () => {
    const manager = new TaskManager();
    const taskProject = project();
    const tasks = ["one", "two", "three", "four"].map((id) =>
      task(taskProject, id),
    );
    manager.applyDiscoveryResults(
      [{ project: taskProject, tasks }],
      new Set([taskProject.key]),
      false,
    );
    let active = 0;
    let maximumActive = 0;
    const runTask = jest.fn(async (selected): Promise<TaskRunResult> => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      const now = new Date();
      return {
        taskKey: selected.key,
        status: selected.label === "two" ? "failed" : "succeeded",
        startTime: now,
        endTime: now,
        durationMs: 0,
      };
    });
    const nativeTasks = {
      runTask,
      cancelTask: jest.fn(),
    } as unknown as NativeTaskService;
    const output = { appendLine: jest.fn(), show: jest.fn() };
    const coordinator = new RunCoordinator(
      manager,
      nativeTasks,
      output as never,
    );

    const results = await coordinator.runGroup("group", tasks);

    expect(results).toHaveLength(4);
    expect(maximumActive).toBe(2);
    expect(results.some((result) => result.status === "failed")).toBe(true);
    expect(runTask).toHaveBeenCalledTimes(4);
  });

  it("cancels an individual queued task before it starts", async () => {
    const manager = new TaskManager();
    const taskProject = project();
    const tasks = ["one", "two", "three"].map((id) => task(taskProject, id));
    manager.applyDiscoveryResults(
      [{ project: taskProject, tasks }],
      new Set([taskProject.key]),
      false,
    );
    const runTask = jest.fn(async (selected): Promise<TaskRunResult> => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const now = new Date();
      return {
        taskKey: selected.key,
        status: "succeeded",
        startTime: now,
        endTime: now,
        durationMs: 0,
      };
    });
    const nativeTasks = {
      runTask,
      cancelTask: jest.fn().mockReturnValue(false),
    } as unknown as NativeTaskService;
    const coordinator = new RunCoordinator(manager, nativeTasks, {
      appendLine: jest.fn(),
      show: jest.fn(),
    } as never);

    const groupRun = coordinator.runGroup("group", tasks);
    expect(coordinator.cancelTask(tasks[2].key)).toBe(true);
    const results = await groupRun;

    expect(runTask).toHaveBeenCalledTimes(2);
    expect(results[2]).toMatchObject({
      taskKey: tasks[2].key,
      status: "cancelled",
      reason: "Cancelled before execution.",
    });
  });
});
