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
    class MockCustomExecution {
      constructor(public callback: () => Promise<unknown>) {}
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
      processStart: new MockEventEmitter<unknown>(),
      processEnd: new MockEventEmitter<unknown>(),
      end: new MockEventEmitter<unknown>(),
    };
    return {
      EventEmitter: MockEventEmitter,
      ProcessExecution: MockProcessExecution,
      CustomExecution: MockCustomExecution,
      Task: MockTask,
      TaskRevealKind: { Always: 1 },
      TaskPanelKind: { Dedicated: 1 },
      Uri: { parse: (value: string) => ({ toString: () => value }) },
      workspace: {
        isTrusted: true,
        workspaceFolders: [
          { name: "workspace", uri: { toString: () => "file:///workspace" } },
        ],
      },
      tasks: {
        onDidStartTask: events.start.event,
        onDidStartTaskProcess: events.processStart.event,
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

import { TaskManager } from "../../src/core/task-manager";
import {
  ExecutionPlan,
  TaskSource,
} from "../../src/core/task-source/task-source";
import { TaskSourceRegistry } from "../../src/core/task-source/task-source-registry";
import {
  DiscoveredTask,
  taskSourceId,
} from "../../src/core/tasks/types";
import {
  NativeTaskService,
  TASK_TYPE,
} from "../../src/vscode/native-task-service";
import { project, task } from "../helpers";

const vscodeMock = jest.requireMock("vscode") as {
  CustomExecution: new (
    callback: () => Promise<MockPseudoterminal>,
  ) => { callback: () => Promise<MockPseudoterminal> };
  Task: new (...args: unknown[]) => MockNativeTask;
  tasks: { executeTask: jest.Mock };
  __events: {
    start: { fire: (event: unknown) => void };
    processStart: { fire: (event: unknown) => void };
    processEnd: { fire: (event: unknown) => void };
    end: { fire: (event: unknown) => void };
  };
};

interface MockNativeTask {
  definition: Record<string, unknown>;
  scope: unknown;
  execution: unknown;
}

interface MockPseudoterminal {
  onDidClose: (listener: () => void) => { dispose(): void };
  open(): void;
  close(): void;
}

function createSource(
  sourceId = taskSourceId("nox"),
  createExecution: TaskSource["createExecution"] = () => ({
    kind: "process",
    command: "nox",
    args: ["-s", "tests"],
    cwd: "/workspace",
  }),
  projectDiscovery: TaskSource["projectDiscovery"] = {
    kind: "configurationFiles",
    patterns: ["**/noxfile.py"],
  },
  trust: TaskSource["trust"] = { discovery: true, execution: true },
): TaskSource {
  return {
    id: sourceId,
    displayName: sourceId,
    projectDiscovery,
    trust,
    discover: jest.fn(),
    createExecution,
  };
}

async function fixture(
  source: TaskSource = createSource(),
): Promise<{
  directory: string;
  manager: TaskManager;
  discovered: DiscoveredTask;
  service: NativeTaskService;
}> {
  const directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "taskmosaic-native-"),
  );
  const manager = new TaskManager();
  const taskProject = project({ sourceId: source.id });
  const discovered = task(taskProject, "tests", {
    capabilities: {
      runnable: true,
      cancellable: true,
      acceptsInputs: true,
    },
  });
  manager.applyDiscoveryResults(
    [{ project: taskProject, tasks: [discovered] }],
    new Set([taskProject.key]),
    false,
  );
  const registry = new TaskSourceRegistry();
  registry.register(source);
  const service = new NativeTaskService(
    manager,
    registry,
    { fsPath: directory } as never,
    { appendLine: jest.fn() } as never,
  );
  await service.initialize();
  return { directory, manager, discovered, service };
}

function processExecution(exitCode: number | undefined): void {
  vscodeMock.tasks.executeTask.mockImplementation(async (nativeTask) => {
    const execution = { task: nativeTask, terminate: jest.fn() };
    vscodeMock.__events.start.fire({ execution });
    vscodeMock.__events.processStart.fire({ execution, processId: 123 });
    setImmediate(() =>
      vscodeMock.__events.processEnd.fire({ execution, exitCode }),
    );
    return execution;
  });
}

describe("NativeTaskService", () => {
  it("creates portable native process tasks and settles from lifecycle events", async () => {
    const value = await fixture();
    processExecution(0);
    try {
      const provided = value.service.provideTasks() as MockNativeTask[];
      expect(provided).toHaveLength(1);
      expect(provided[0].definition).toEqual({
        type: TASK_TYPE,
        source: "nox",
        project: ".",
        task: "tests",
      });
      expect(provided[0].definition).not.toHaveProperty("runToken");
      expect(provided[0].definition).not.toHaveProperty("reportPath");

      await expect(value.service.runTask(value.discovered)).resolves.toMatchObject(
        {
          taskKey: value.discovered.key,
          status: "succeeded",
          exitCode: 0,
        },
      );
      expect(value.manager.getTaskStatus(value.discovered.key)).toBe(
        "succeeded",
      );
    } finally {
      value.service.dispose();
      await fs.promises.rm(value.directory, { recursive: true, force: true });
    }
  });

  it("preserves the exact portable definition when resolving tasks.json", async () => {
    const value = await fixture();
    try {
      const definition = {
        type: TASK_TYPE,
        source: "nox",
        project: ".",
        task: "tests",
        inputs: { taskArgs: ["path with spaces"] },
      };
      const unresolved = new vscodeMock.Task(
        definition,
        { name: "workspace", uri: { toString: () => "file:///workspace" } },
        "tests",
        "TaskMosaic",
        undefined,
        [],
      );

      const resolved = value.service.resolveTask(
        unresolved as never,
      ) as unknown as MockNativeTask;

      expect(resolved.definition).toBe(definition);
    } finally {
      value.service.dispose();
      await fs.promises.rm(value.directory, { recursive: true, force: true });
    }
  });

  it("treats native task termination as cancellation", async () => {
    const value = await fixture();
    processExecution(undefined);
    try {
      await expect(value.service.runTask(value.discovered)).resolves.toMatchObject(
        {
          status: "cancelled",
        },
      );
      expect(value.manager.getTaskStatus(value.discovered.key)).toBe(
        "cancelled",
      );
    } finally {
      value.service.dispose();
      await fs.promises.rm(value.directory, { recursive: true, force: true });
    }
  });

  it("runs a non-framework managed source without process assumptions", async () => {
    const managedSource = createSource(
      taskSourceId("workspace-actions"),
      (): ExecutionPlan => ({
        kind: "managed",
        run: async ({ write }) => {
          write("managed output");
          return { status: "succeeded" };
        },
      }),
      { kind: "workspace" },
      { discovery: false, execution: false },
    );
    const value = await fixture(managedSource);
    vscodeMock.tasks.executeTask.mockImplementation(async (nativeTask) => {
      const execution = { task: nativeTask, terminate: jest.fn() };
      vscodeMock.__events.start.fire({ execution });
      const custom = nativeTask.execution as {
        callback: () => Promise<MockPseudoterminal>;
      };
      const terminal = await custom.callback();
      terminal.onDidClose(() =>
        vscodeMock.__events.end.fire({ execution }),
      );
      terminal.open();
      return execution;
    });

    try {
      await expect(value.service.runTask(value.discovered)).resolves.toMatchObject(
        {
          status: "succeeded",
        },
      );
    } finally {
      value.service.dispose();
      await fs.promises.rm(value.directory, { recursive: true, force: true });
    }
  });

  it("treats native termination of a managed task as cancellation", async () => {
    const managedSource = createSource(
      taskSourceId("workspace-actions"),
      (): ExecutionPlan => ({
        kind: "managed",
        run: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(new Error("managed task aborted")),
            );
          }),
      }),
      { kind: "workspace" },
      { discovery: false, execution: false },
    );
    const value = await fixture(managedSource);
    vscodeMock.tasks.executeTask.mockImplementation(async (nativeTask) => {
      const execution = { task: nativeTask, terminate: jest.fn() };
      vscodeMock.__events.start.fire({ execution });
      const custom = nativeTask.execution as {
        callback: () => Promise<MockPseudoterminal>;
      };
      const terminal = await custom.callback();
      terminal.onDidClose(() => vscodeMock.__events.end.fire({ execution }));
      terminal.open();
      setImmediate(() => terminal.close());
      return execution;
    });

    try {
      await expect(value.service.runTask(value.discovered)).resolves.toMatchObject(
        {
          status: "cancelled",
        },
      );
    } finally {
      value.service.dispose();
      await fs.promises.rm(value.directory, { recursive: true, force: true });
    }
  });
});
