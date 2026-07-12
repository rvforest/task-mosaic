import * as vscode from "vscode";

import { FrameworkRegistry } from "./core/framework/framework-registry";
import { TaskManager } from "./core/task-manager";
import { NoxFramework } from "./frameworks/nox/nox-framework";
import { NativeTaskService, TASK_TYPE } from "./vscode/native-task-service";
import { WorkspaceTaskService } from "./vscode/workspace-task-service";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const output = vscode.window.createOutputChannel("TaskMosaic", { log: true });
  context.subscriptions.push(output);
  output.info("Activating TaskMosaic");

  const registry = new FrameworkRegistry();
  registry.register(new NoxFramework());
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

  context.subscriptions.push(
    workspaceTasks,
    nativeTasks,
    vscode.tasks.registerTaskProvider(TASK_TYPE, nativeTasks),
  );

  await workspaceTasks.initialize();
  output.info("TaskMosaic activated");
}

export function deactivate(): void {
  // VS Code disposes all resources registered with the extension context.
}
