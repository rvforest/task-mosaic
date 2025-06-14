import * as vscode from 'vscode';
import { TaskManager } from '../../core/task-manager';
import { TaskTreeProvider } from '../ui/tree-view/TaskTreeProvider';
import { TaskTreeViewMode } from '../ui/tree-view/types';

export class ViewCommands {
  constructor(
    private taskManager: TaskManager,
    private treeProvider: TaskTreeProvider
  ) {}

  registerCommands(context: vscode.ExtensionContext): void {
    const commands = [
      this.createRefreshCommand(),
      this.createToggleViewModeCommand()
    ];

    context.subscriptions.push(...commands);
  }

  private createRefreshCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('taskMosaic.refreshTasks', async () => {
      await this.taskManager.refreshTasks();
      this.treeProvider.refresh();
      vscode.window.showInformationMessage('Task list refreshed');
    });
  }

  private createToggleViewModeCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('taskMosaic.toggleViewMode', () => {
      const currentMode = this.treeProvider.getViewMode();
      let nextMode: TaskTreeViewMode;
      let modeDisplay: string;
      
      switch (currentMode) {
        case TaskTreeViewMode.FLAT:
          nextMode = TaskTreeViewMode.BY_CATEGORY;
          modeDisplay = 'By Category';
          break;
        case TaskTreeViewMode.BY_CATEGORY:
        default:
          nextMode = TaskTreeViewMode.FLAT;
          modeDisplay = 'Flat';
          break;
      }

      this.treeProvider.setViewMode(nextMode);
      vscode.window.showInformationMessage(`View mode changed to: ${modeDisplay}`);
    });
  }
}
