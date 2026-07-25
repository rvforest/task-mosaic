import * as vscode from "vscode";

import { TaskManager } from "./core/task-manager";
import { TaskSourceRegistry } from "./core/task-source/task-source-registry";
import { NoxTaskSource } from "./frameworks/nox/nox-task-source";
import { getNoxConfig } from "./vscode/configuration";
import { TaskCommands, ViewCommands } from "./vscode/commands";
import { NativeTaskService, TASK_TYPE } from "./vscode/native-task-service";
import { RunCoordinator } from "./vscode/run-coordinator";
import { TaskTreeProvider } from "./vscode/ui/tree-view/TaskTreeProvider";
import { WorkspaceTaskService } from "./vscode/workspace-task-service";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const output = vscode.window.createOutputChannel("TaskMosaic", { log: true });
  context.subscriptions.push(output);
  output.info("Activating TaskMosaic");

  const registry = new TaskSourceRegistry();
  registry.register(
    new NoxTaskSource({
      getConfig: (project) =>
        getNoxConfig(vscode.Uri.parse(project.rootUri)),
    }),
  );
  context.subscriptions.push({ dispose: () => registry.clear() });

  const taskManager = new TaskManager();
  const workspaceTasks = new WorkspaceTaskService(
    taskManager,
    registry,
    output,
  );
  const nativeTasks = new NativeTaskService(
    taskManager,
    registry,
    context.storageUri ?? context.globalStorageUri,
    output,
  );
  await nativeTasks.initialize();

  const coordinator = new RunCoordinator(taskManager, nativeTasks, output);
  const treeProvider = new TaskTreeProvider(
    taskManager,
    registry,
    context.workspaceState,
  );

  context.subscriptions.push(
    workspaceTasks,
    nativeTasks,
    treeProvider,
    vscode.tasks.registerTaskProvider(TASK_TYPE, nativeTasks),
    vscode.window.createTreeView("taskMosaic", {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    }),
  );

  new TaskCommands(taskManager, registry, coordinator).registerCommands(
    context,
  );
  new ViewCommands(workspaceTasks, treeProvider, output).registerCommands(
    context,
  );

  await workspaceTasks.initialize();
  output.info("TaskMosaic activated");
}

export function deactivate(): void {
  // VS Code disposes all resources registered with the extension context.
}
