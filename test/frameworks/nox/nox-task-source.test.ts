import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { TaskSourceDiscoveryError } from "../../../src/core/task-source/errors";
import {
  NoxCommandConfig,
  NoxTaskSource,
} from "../../../src/frameworks/nox/nox-task-source";
import { project, task } from "../../helpers";

const config: NoxCommandConfig = {
  command: "nox",
  commandArgs: [],
  runnerArgs: [],
};

const defaults = [
  {
    session: "tests-3.12",
    name: "tests",
    description: "Run tests",
    python: "3.12",
    tags: ["test", "ci"],
    call_spec: {},
  },
];

const all = [
  ...defaults,
  {
    session: "docs",
    name: "docs",
    description: "Build docs",
    python: null,
    tags: ["docs"],
    call_spec: {},
  },
  {
    session: "test-3.12(kind='unit')",
    name: "test",
    description: "Parameterized test",
    python: "3.12",
    tags: ["test"],
    call_spec: { kind: "unit" },
  },
];

function source(executeCommand?: jest.Mock): NoxTaskSource {
  return new NoxTaskSource({
    executeCommand,
    getConfig: () => config,
  });
}

describe("NoxTaskSource", () => {
  it("discovers all sessions and maps Nox metadata into generic contracts", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ stdout: "2026.4.10\n" })
      .mockResolvedValueOnce({ stdout: JSON.stringify(defaults) })
      .mockResolvedValueOnce({ stdout: JSON.stringify(all) });

    const tasks = await source(execute).discover(project());

    expect(tasks).toHaveLength(3);
    expect(
      tasks.find((task) => task.sourceTaskId === "tests-3.12")?.roles,
    ).toContain("default");
    expect(tasks.find((task) => task.sourceTaskId === "docs")?.roles).toEqual(
      [],
    );
    expect(tasks[2].groups).toEqual(
      expect.arrayContaining([
        { kind: "matrix", id: "test", label: "test" },
      ]),
    );
    expect(execute.mock.calls[2][1]).toEqual([
      "--list-sessions",
      "--json",
      "-k",
      "True",
    ]);
  });

  it("supports source-owned command prefixes", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ stdout: "2026.4.10" })
      .mockResolvedValueOnce({ stdout: "[]" })
      .mockResolvedValueOnce({ stdout: "[]" });
    const taskSource = new NoxTaskSource({
      executeCommand: execute,
      getConfig: () => ({
        command: "uv",
        commandArgs: ["run", "nox"],
        runnerArgs: [],
      }),
    });

    await taskSource.discover(project());

    expect(execute.mock.calls[0].slice(0, 2)).toEqual([
      "uv",
      ["run", "nox", "--version"],
    ]);
  });

  it("rejects Nox versions before complete JSON selection support", async () => {
    const taskSource = source(
      jest.fn().mockResolvedValue({ stdout: "2025.11.12" }),
    );
    await expect(taskSource.discover(project())).rejects.toMatchObject({
      code: "unsupportedVersion",
    });
  });

  it("rejects malformed session records", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ stdout: "2026.4.10" })
      .mockResolvedValueOnce({ stdout: "[]" })
      .mockResolvedValueOnce({ stdout: JSON.stringify([{ session: "bad" }]) });
    await expect(source(execute).discover(project())).rejects.toBeInstanceOf(
      TaskSourceDiscoveryError,
    );
  });

  it("creates a process plan without shell joining", () => {
    const taskProject = project();
    const discovered = task(taskProject, "tests-3.12", {
      roles: ["default"],
      capabilities: {
        runnable: true,
        cancellable: true,
        acceptsInputs: true,
      },
    });
    const taskSource = new NoxTaskSource({
      getConfig: () => ({
        command: "uv",
        commandArgs: ["run", "nox"],
        runnerArgs: ["--reuse-venv=yes"],
      }),
    });

    const plan = taskSource.createExecution(
      discovered,
      taskProject,
      {
        inputs: {
          runnerArgs: ["-v"],
          taskArgs: ["path with spaces"],
        },
      },
      { createArtifactPath: () => "/tmp/report.json" },
    );

    expect(plan).toMatchObject({
      kind: "process",
      command: "uv",
      cwd: "/workspace",
      args: [
        "run",
        "nox",
        "--reuse-venv=yes",
        "-v",
        "--report",
        "/tmp/report.json",
        "-s",
        "tests-3.12",
        "--",
        "path with spaces",
      ],
    });
  });

  it("interprets structured outcomes through the execution plan", async () => {
    const directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "taskmosaic-"),
    );
    const reportPath = path.join(directory, "report.json");
    const taskProject = project();
    const discovered = task(taskProject, "skip", {
      capabilities: {
        runnable: true,
        cancellable: true,
        acceptsInputs: false,
      },
    });
    try {
      const plan = source().createExecution(
        discovered,
        taskProject,
        {},
        { createArtifactPath: () => reportPath },
      );
      await fs.promises.writeFile(
        reportPath,
        JSON.stringify({ sessions: [{ result: "skipped" }] }),
      );

      await expect(
        plan.result?.resolve(new Date(Date.now() - 1000)),
      ).resolves.toEqual({ status: "skipped" });
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });
});
