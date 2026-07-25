import * as path from "path";
import { pathToFileURL } from "url";

import {
  createProjectKey,
  TaskProject,
  taskSourceId,
} from "../../../src/core/tasks/types";
import { NoxTaskSource } from "../../../src/frameworks/nox/nox-task-source";

const integration =
  process.env.RUN_NOX_INTEGRATION === "1" ? describe : describe.skip;

integration("NoxTaskSource integration", () => {
  it("discovers default, non-default, tagged, and parameterized sessions", async () => {
    const rootPath = path.resolve(
      __dirname,
      "../../fixtures/frameworks/nox/projects/sample-nox-project",
    );
    const workspaceUri = pathToFileURL(rootPath).toString();
    const sourceId = taskSourceId("nox");
    const project: TaskProject = {
      key: createProjectKey(sourceId, workspaceUri, "."),
      sourceId,
      workspaceUri,
      workspaceName: "sample",
      rootUri: workspaceUri,
      rootPath,
      relativePath: ".",
      configurationUri: pathToFileURL(
        path.join(rootPath, "noxfile.py"),
      ).toString(),
    };

    const tasks = await new NoxTaskSource().discover(project);

    expect(tasks.length).toBeGreaterThan(20);
    expect(
      tasks
        .find((task) => task.sourceTaskId === "lint")
        ?.roles.includes("default"),
    ).toBe(true);
    expect(
      tasks
        .find((task) => task.sourceTaskId === "non_default_session")
        ?.roles.includes("default"),
    ).toBe(false);
    expect(
      tasks.some((task) =>
        task.groups.some(
          (group) => group.kind === "tag" && group.id === "matrix",
        ),
      ),
    ).toBe(true);
    expect(
      tasks.some((task) => {
        const parameters = task.sourceData?.parameters;
        return (
          parameters !== undefined &&
          typeof parameters === "object" &&
          !Array.isArray(parameters) &&
          Object.keys(parameters).length > 0
        );
      }),
    ).toBe(true);
  });
});
