jest.mock(
  "vscode",
  () => {
    class MockEventEmitter<T> {
      private listeners: Array<(value: T) => void> = [];
      event = (listener: (value: T) => void) => {
        this.listeners.push(listener);
        return { dispose: jest.fn() };
      };
      fire(value: T): void {
        for (const listener of this.listeners) listener(value);
      }
      dispose(): void {
        this.listeners = [];
      }
    }
    class MockProcessExecution {
      constructor(
        public command: string,
        public args: string[],
        public options: unknown,
      ) {}
    }
    class MockTask {
      detail?: string;
      presentationOptions?: unknown;
      constructor(
        public definition: unknown,
        public scope: unknown,
        public name: string,
        public source: string,
        public execution: unknown,
        public problemMatchers: string[],
      ) {}
    }
    const events = {
      start: new MockEventEmitter<unknown>(),
      processEnd: new MockEventEmitter<unknown>(),
      end: new MockEventEmitter<unknown>(),
    };
    return {
      EventEmitter: MockEventEmitter,
      ProcessExecution: MockProcessExecution,
      Task: MockTask,
      TaskRevealKind: { Always: 1 },
      TaskPanelKind: { Dedicated: 1 },
      Uri: { parse: (value: string) => ({ toString: () => value }) },
      workspace: {
        isTrusted: true,
        workspaceFolders: [
          { name: "workspace", uri: { toString: () => "file:///workspace" } },
        ],
        getConfiguration: jest.fn(() => ({
          get: jest.fn((_key: string, fallback: unknown) => fallback),
        })),
      },
      tasks: {
        onDidStartTask: events.start.event,
        onDidEndTaskProcess: events.processEnd.event,
        onDidEndTask: events.end.event,
        executeTask: jest.fn(),
      },
      __events: events,
    };
  },
  { virtual: true },
);

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { FrameworkAdapter } from "../../src/core/framework/framework";
import { FrameworkRegistry } from "../../src/core/framework/framework-registry";
import { TaskManager } from "../../src/core/task-manager";
import { NativeTaskService } from "../../src/vscode/native-task-service";
import { project, task } from "../helpers";

const vscodeMock = jest.requireMock("vscode") as {
  tasks: { executeTask: jest.Mock };
  __events: {
    start: { fire: (event: unknown) => void };
    processEnd: { fire: (event: unknown) => void };
  };
};

describe("NativeTaskService", () => {
  it("creates native process tasks and settles from native lifecycle events", async () => {
    const directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "taskmosaic-native-"),
    );
    const manager = new TaskManager();
    const taskProject = project();
    const discovered = task(taskProject, "tests-3.12", { isDefault: true });
    manager.applyDiscoveryResults(
      [{ project: taskProject, tasks: [discovered] }],
      new Set([taskProject.key]),
      false,
    );
    const adapter: FrameworkAdapter = {
      id: "nox",
      displayName: "Nox",
      configurationFileNames: ["noxfile.py"],
      discover: jest.fn(),
      createExecution: jest.fn(
        (_task, _project, _options, _config, reportPath) => ({
          command: "nox",
          args: ["--report", reportPath, "-s", "tests-3.12"],
          cwd: "/workspace",
        }),
      ),
      interpretResult: jest.fn().mockResolvedValue(undefined),
    };
    const registry = new FrameworkRegistry();
    registry.register(adapter);
    const service = new NativeTaskService(
      manager,
      registry,
      { fsPath: directory } as never,
      { appendLine: jest.fn() } as never,
    );
    await service.initialize();

    vscodeMock.tasks.executeTask.mockImplementation(async (nativeTask) => {
      const execution = { task: nativeTask, terminate: jest.fn() };
      vscodeMock.__events.start.fire({ execution });
      setImmediate(() =>
        vscodeMock.__events.processEnd.fire({ execution, exitCode: 0 }),
      );
      return execution;
    });

    try {
      const provided = service.provideTasks() as unknown[];
      expect(provided).toHaveLength(1);
      const processExecution = (
        provided[0] as { execution: { command: string; args: string[] } }
      ).execution;
      expect(processExecution.command).toBe("nox");
      expect(processExecution.args).toEqual(
        expect.arrayContaining(["-s", "tests-3.12"]),
      );

      await expect(service.runTask(discovered)).resolves.toMatchObject({
        taskKey: discovered.key,
        status: "succeeded",
        exitCode: 0,
      });
      expect(manager.getTaskStatus(discovered.key)).toBe("succeeded");
    } finally {
      service.dispose();
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });
});
