import { TaskManager } from "../../src/core/task-manager";
import { project, task } from "../helpers";

describe("TaskManager", () => {
  it("keeps duplicate source task IDs isolated by project", () => {
    const manager = new TaskManager();
    const firstProject = project();
    const secondProject = project({
      key: "second",
      rootPath: "/workspace/package",
      rootUri: "file:///workspace/package",
      relativePath: "package",
    });
    const first = task(firstProject, "lint");
    const second = task(secondProject, "lint");

    manager.applyDiscoveryResults(
      [
        { project: firstProject, tasks: [first] },
        { project: secondProject, tasks: [second] },
      ],
      new Set([firstProject.key, secondProject.key]),
      false,
    );

    expect(manager.getAllTasks()).toHaveLength(2);
    expect(manager.getTask(first.key)).toEqual(first);
    expect(manager.getTask(second.key)).toEqual(second);
  });

  it("retains the last successful tasks when refresh fails", () => {
    const manager = new TaskManager();
    const taskProject = project();
    const discovered = task(taskProject, "tests");
    manager.applyDiscoveryResults(
      [{ project: taskProject, tasks: [discovered] }],
      new Set([taskProject.key]),
      false,
    );

    manager.applyDiscoveryResults(
      [
        {
          project: taskProject,
          error: { code: "invalidConfiguration", message: "Invalid noxfile" },
        },
      ],
      new Set([taskProject.key]),
      false,
    );

    expect(manager.getTask(discovered.key)).toEqual(discovered);
    expect(
      manager.getDiscoveryState().errors.get(taskProject.key)?.message,
    ).toBe("Invalid noxfile");
  });

  it("removes projects that are no longer discovered", () => {
    const manager = new TaskManager();
    const taskProject = project();
    const discovered = task(taskProject, "tests");
    manager.applyDiscoveryResults(
      [{ project: taskProject, tasks: [discovered] }],
      new Set([taskProject.key]),
      false,
    );

    manager.applyDiscoveryResults([], new Set(), false);

    expect(manager.getAllTasks()).toEqual([]);
    expect(manager.getDiscoveryState().projects).toEqual([]);
  });

  it("scopes tag and default queries", () => {
    const manager = new TaskManager();
    const taskProject = project();
    const lint = task(taskProject, "lint", {
      groups: [{ kind: "tag", id: "quality", label: "Quality" }],
      roles: ["default"],
    });
    const tests = task(taskProject, "tests", {
      groups: [{ kind: "tag", id: "test", label: "Test" }],
    });
    manager.applyDiscoveryResults(
      [{ project: taskProject, tasks: [lint, tests] }],
      new Set([taskProject.key]),
      false,
    );

    expect(
      manager.findTasks({ group: { kind: "tag", id: "quality" } }),
    ).toEqual([lint]);
    expect(manager.findTasks({ role: "default" })).toEqual([lint]);
  });
});
