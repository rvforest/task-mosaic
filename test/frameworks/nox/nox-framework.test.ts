import { FrameworkDiscoveryError } from "../../../src/core/framework/errors";
import { FrameworkCommandConfig } from "../../../src/core/framework/framework";
import { NoxFramework } from "../../../src/frameworks/nox/nox-framework";
import { project } from "../../helpers";

const config: FrameworkCommandConfig = {
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

describe("NoxFramework", () => {
  it("discovers all sessions and reconciles defaults", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ stdout: "2026.4.10\n" })
      .mockResolvedValueOnce({ stdout: JSON.stringify(defaults) })
      .mockResolvedValueOnce({ stdout: JSON.stringify(all) });
    const framework = new NoxFramework(execute);

    const tasks = await framework.discover(project(), config);

    expect(tasks).toHaveLength(3);
    expect(
      tasks.find((task) => task.frameworkTaskId === "tests-3.12")?.isDefault,
    ).toBe(true);
    expect(
      tasks.find((task) => task.frameworkTaskId === "docs")?.isDefault,
    ).toBe(false);
    expect(tasks[2].matrixGroup).toBe("test");
    expect(execute.mock.calls[2][1]).toEqual([
      "--list-sessions",
      "--json",
      "-k",
      "True",
    ]);
  });

  it("supports command prefixes", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ stdout: "2026.4.10" })
      .mockResolvedValueOnce({ stdout: "[]" })
      .mockResolvedValueOnce({ stdout: "[]" });
    const framework = new NoxFramework(execute);
    await framework.discover(project(), {
      command: "uv",
      commandArgs: ["run", "nox"],
      runnerArgs: [],
    });
    expect(execute.mock.calls[0].slice(0, 2)).toEqual([
      "uv",
      ["run", "nox", "--version"],
    ]);
  });

  it("rejects Nox versions before complete JSON selection support", async () => {
    const framework = new NoxFramework(
      jest.fn().mockResolvedValue({ stdout: "2025.11.12" }),
    );
    await expect(framework.discover(project(), config)).rejects.toMatchObject({
      code: "unsupportedVersion",
    });
  });

  it("rejects malformed session records", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ stdout: "2026.4.10" })
      .mockResolvedValueOnce({ stdout: "[]" })
      .mockResolvedValueOnce({ stdout: JSON.stringify([{ session: "bad" }]) });
    await expect(
      new NoxFramework(execute).discover(project(), config),
    ).rejects.toBeInstanceOf(FrameworkDiscoveryError);
  });

  it("creates a process execution specification without shell joining", () => {
    const framework = new NoxFramework();
    const taskProject = project();
    const discovered = {
      key: "key",
      frameworkTaskId: "tests-3.12",
      frameworkId: "nox",
      projectKey: taskProject.key,
      label: "tests-3.12",
      tags: [],
      parameters: {},
      isDefault: true,
    };
    const spec = framework.createExecution(
      discovered,
      taskProject,
      { runnerArgs: ["-v"], taskArgs: ["path with spaces"] },
      {
        command: "uv",
        commandArgs: ["run", "nox"],
        runnerArgs: ["--reuse-venv=yes"],
      },
      "/tmp/report.json",
    );
    expect(spec).toEqual({
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

  it("interprets structured success and skipped reports", async () => {
    const directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "taskmosaic-"),
    );
    const reportPath = path.join(directory, "report.json");
    const framework = new NoxFramework();
    try {
      await fs.promises.writeFile(
        reportPath,
        JSON.stringify({ sessions: [{ result: "skipped" }] }),
      );
      await expect(
        framework.interpretResult(reportPath, new Date(Date.now() - 1000)),
      ).resolves.toEqual({ status: "skipped" });
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });
});
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
