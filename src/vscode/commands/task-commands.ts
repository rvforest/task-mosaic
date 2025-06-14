import * as vscode from 'vscode';
import { TaskManager } from '../../core/task-manager';
import { ExecutionManager } from '../../core/execution/execution-manager';
import { FrameworkRegistry } from '../../core/framework/framework-registry';
import { TaskTreeProvider } from '../ui/tree-view/TaskTreeProvider';
import { TaskTreeItem } from '../ui/tree-view/TaskTreeItem';
import { Task } from '../../core/tasks/types';

export class TaskCommands {

  // Shared observer to refresh tree view
  private refreshTreeObserver = {
    onExecutionStarted: () => {
      this.treeProvider.refresh();
    },
    onExecutionCompleted: () => {
      this.treeProvider.refresh();
    },
    onExecutionFailed: () => {
      this.treeProvider.refresh();
    },
    onStateChanged: () => {
      this.treeProvider.refresh();
    },
    onOutputReceived: () => {
      // Don't refresh on every output line to avoid performance issues
    }
  };
  constructor(
    private taskManager: TaskManager,
    private executionManager: ExecutionManager,
    private treeProvider: TaskTreeProvider,
    private outputChannel?: vscode.OutputChannel
  ) {
    // Register the observer once to handle all task execution state changes
    this.executionManager.addObserver(this.refreshTreeObserver);
  }

  registerCommands(context: vscode.ExtensionContext): void {
    const commands = [
      this.createRunTaskCommand(),
      this.createRunTaskWithArgsCommand(),
      this.createRunTaskVerboseCommand(),
      this.createRunAllDefaultCommand(),
      this.createRunParentTaskCommand(),
      this.createRunTagGroupCommand(),
      this.createRunParentTaskWithArgsCommand()
    ];

    context.subscriptions.push(...commands);
  }

  private createRunTaskCommand(): vscode.Disposable {
    const command = vscode.commands.registerCommand('taskMosaic.runTask', async (taskOrTreeItem: Task | TaskTreeItem) => {
      // Extract task from tree item if needed
      const task = taskOrTreeItem instanceof TaskTreeItem ? taskOrTreeItem.task : taskOrTreeItem;
      
      if (!task) {
        vscode.window.showErrorMessage('Task not found');
        return;
      }
      const framework = FrameworkRegistry.getFramework(task.frameworkName);
      if (!framework) {
        vscode.window.showErrorMessage(`Framework ${task.frameworkName} not found`);
        return;
      }
      try {
        this.treeProvider.refresh();
        await this.executionManager.executeTask(task, { cwd: task.cwd });
      } catch (error) {
        this.treeProvider.refresh();
        vscode.window.showErrorMessage(`Failed to run task: ${error}`);
      }
    });
    return command;
  }

  private createRunTaskWithArgsCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('taskMosaic.runTaskWithArgs', async (taskOrTreeItem: Task | TaskTreeItem) => {
      // Extract task from tree item if needed
      const task = taskOrTreeItem instanceof TaskTreeItem ? taskOrTreeItem.task : taskOrTreeItem;
      
      if (!task) {
        vscode.window.showErrorMessage('No task selected');
        return;
      }
      const args = await vscode.window.showInputBox({
        prompt: 'Enter arguments for the task',
        placeHolder: 'e.g., --coverage --verbose'
      });
      if (args === undefined) return;
      const framework = FrameworkRegistry.getFramework(task.frameworkName);
      if (!framework) {
        vscode.window.showErrorMessage(`Framework ${task.frameworkName} not found`);
        return;
      }
      try {
        this.treeProvider.refresh();
        await this.executionManager.executeTask(task, {
          cwd: task.cwd,
          taskArgs: args.split(' ').filter(arg => arg.trim())
        });
      } catch (error) {
        this.treeProvider.refresh();
        vscode.window.showErrorMessage(`Failed to run task: ${error}`);
      }
    });
  }

  private createRunTaskVerboseCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('taskMosaic.runTaskVerbose', async (taskOrTreeItem: Task | TaskTreeItem) => {
      // Extract task from tree item if needed
      const task = taskOrTreeItem instanceof TaskTreeItem ? taskOrTreeItem.task : taskOrTreeItem;
      
      if (!task) {
        vscode.window.showErrorMessage('No task selected');
        return;
      }
      const framework = FrameworkRegistry.getFramework(task.frameworkName);
      if (!framework) {
        vscode.window.showErrorMessage(`Framework ${task.frameworkName} not found`);
        return;
      }
      try {
        this.treeProvider.refresh();
        await this.executionManager.executeTask(task, {
          cwd: task.cwd,
          runnerArgs: ['-v'] // Add verbose flag
        });
      } catch (error) {
        this.treeProvider.refresh();
        vscode.window.showErrorMessage(`Failed to run task: ${error}`);
      }
    });
  }

  private createRunAllDefaultCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('taskMosaic.runAllDefaultTasks', async () => {
      const defaultTasks = this.taskManager.getAllTasks().filter(task => task.isDefault);

      if (defaultTasks.length === 0) {
        vscode.window.showInformationMessage('No default tasks found');
        return;
      }

      for (const task of defaultTasks) {
    await vscode.commands.executeCommand('taskMosaic.runTask', task);
      }
    });
  }

  private createRunParentTaskCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('taskMosaic.runParentTask', async (task) => {
      if (!task) {
        vscode.window.showErrorMessage('No task selected');
        return;
      }

      const data = task.getData();
      if (!data || !data.matrixGroup) {
        vscode.window.showErrorMessage('No matrix group found for this task');
        return;
      }

      const matrixTasks = this.taskManager.getTasksByMatrixGroup(data.matrixGroup);
      for (const matrixTask of matrixTasks) {
    await vscode.commands.executeCommand('taskMosaic.runTask', matrixTask);
      }
    });
  }

  private createRunTagGroupCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('taskMosaic.runTagGroup', async (treeItem) => {
      if (!treeItem || !treeItem.data) {
        vscode.window.showErrorMessage('No category group selected');
        return;
      }

      const categoryTasks = this.taskManager.getTasksByCategoryGroup(treeItem.data);
      if (categoryTasks.length === 0) {
        vscode.window.showInformationMessage(`No tasks found in category: ${treeItem.data}`);
        return;
      }

      for (const task of categoryTasks) {
    await vscode.commands.executeCommand('taskMosaic.runTask', task);
      }
    });
  }

  private createRunParentTaskWithArgsCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('taskMosaic.runParentTaskWithArgs', async (task) => {
      if (!task) {
        vscode.window.showErrorMessage('No task selected');
        return;
      }

      const data = task.getData();
      if (!data || !data.matrixGroup) {
        vscode.window.showErrorMessage('No matrix group found for this task');
        return;
      }

      const args = await vscode.window.showInputBox({
        prompt: 'Enter arguments for all tasks in the matrix group',
        placeHolder: 'e.g., --coverage --verbose'
      });

      if (args === undefined) return;

      const matrixTasks = this.taskManager.getTasksByMatrixGroup(data.matrixGroup);
      for (const matrixTask of matrixTasks) {
        await vscode.commands.executeCommand('taskMosaic.runTaskWithArgs', matrixTask);
      }
    });
  }
}
