import * as assert from "assert";
import * as vscode from "vscode";

export async function run(): Promise<void> {
  const extension = vscode.extensions.all.find(
    (candidate) => candidate.packageJSON?.name === "taskmosaic",
  );
  assert.ok(extension, "TaskMosaic extension was not found");
  await extension.activate();

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("taskMosaic.refreshTasks"));
  assert.ok(commands.includes("taskMosaic.runTask"));

  const tasks = await vscode.tasks.fetchTasks({ type: "taskMosaic" });
  assert.ok(
    tasks.length > 20,
    `Expected more than 20 Nox tasks, found ${tasks.length}`,
  );
  assert.ok(
    tasks.some((task) => task.definition.task === "non_default_session"),
  );
}
