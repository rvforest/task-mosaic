import * as vscode from 'vscode';
import { TaskManager } from './core/task-manager';
import { ExecutionManager } from './core/execution/execution-manager';
import { FrameworkRegistry } from './core/framework/framework-registry';
import { NoxFramework } from './frameworks/nox/nox-framework';
import { TaskTreeProvider } from './vscode/ui/tree-view/TaskTreeProvider';
import { TaskCommands, ViewCommands } from './vscode/commands';


let taskManager: TaskManager;
let executionManager: ExecutionManager;
let treeProvider: TaskTreeProvider;
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel('TaskMosaic');
  outputChannel.appendLine('Activating TaskMosaic...');
  
  // Initialize core components
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const searchDirectories = workspaceFolders 
    ? workspaceFolders.map(folder => folder.uri.fsPath)
    : [];
  
  taskManager = new TaskManager(searchDirectories);
  executionManager = taskManager.getExecutionManager();
  
  // Register frameworks
  FrameworkRegistry.register(new NoxFramework(outputChannel));
  
  // Set up available providers
  const availableFrameworks = await FrameworkRegistry.getAvailableProviders(searchDirectories);
  const providers = availableFrameworks.map(fw => fw.provider);
  taskManager.setAvailableProviders(providers);
  
  // Initialize tree provider
  treeProvider = new TaskTreeProvider(taskManager, context, outputChannel);
  vscode.window.registerTreeDataProvider('taskMosaic', treeProvider);
  
  // Register commands using organized command classes
  const taskCommands = new TaskCommands(taskManager, executionManager, treeProvider, outputChannel);
  const viewCommands = new ViewCommands(taskManager, treeProvider);
  
  taskCommands.registerCommands(context);
  viewCommands.registerCommands(context);
  
  // Initial task refresh
  await taskManager.refreshTasks();
  treeProvider.refresh();
  
  outputChannel.appendLine('TaskMosaic activated');
}

export function deactivate() {
  outputChannel?.dispose();
}
