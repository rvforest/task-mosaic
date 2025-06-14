import { Task, TaskStatus } from '../../../core/tasks/types';
import * as vscode from 'vscode';
import { TaskManager } from '../../../core/task-manager';
import { TaskTreeItem } from './TaskTreeItem';
import { TaskGroupingService } from './TaskGroupingService';
import { TaskTreeItemType, TaskTreeViewMode } from './types';

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TaskTreeItem | undefined | null | void> = new vscode.EventEmitter<TaskTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TaskTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private currentViewMode: TaskTreeViewMode = TaskTreeViewMode.BY_CATEGORY;
  private groupingService = new TaskGroupingService();
  
  // Cache the status provider to avoid creating new closures for every task
  private readonly statusProvider = this.createStatusProvider();

  constructor(
    private taskManager: TaskManager,
    private context: vscode.ExtensionContext,
    private outputChannel?: vscode.OutputChannel
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setViewMode(mode: TaskTreeViewMode): void {
    this.currentViewMode = mode;
    this.refresh();
  }

  getViewMode(): TaskTreeViewMode {
    return this.currentViewMode;
  }

  getTreeItem(element: TaskTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskTreeItem): Promise<TaskTreeItem[]> {
    try {
      if (!element) {
        // Root level - always show frameworks
        return this.getRootItems();
      }

      const allTasks = this.taskManager.getAllTasks();
      
      switch (element.itemType) {
        case TaskTreeItemType.ROOT_FOLDER:
          return this.getItemsForWorkspaceRoot(element.data || '');
        case TaskTreeItemType.FRAMEWORK:
          return Promise.resolve(this.groupingService.getTasksForFramework(
            allTasks, 
            element.data || '', 
            this.currentViewMode,
            (task: Task) => this.createTaskItem(task),
            this.statusProvider
          ));
        case TaskTreeItemType.MATRIX_GROUP:
          // Parse the matrix group data to get framework and matrix group name
          try {
            if (!element.data) {
              console.error('Matrix group has no data');
              return Promise.resolve([]);
            }
            const matrixGroupData = JSON.parse(element.data);
            const frameworkTasks = allTasks.filter(task => task.frameworkName === matrixGroupData.frameworkName);
            return Promise.resolve(this.groupingService.getTasksForMatrixGroup(
              frameworkTasks,
              matrixGroupData.matrixGroup,
              (task: Task) => this.createTaskItem(task)
            ));
          } catch (error) {
            console.error('Error parsing matrix group data:', error);
            return Promise.resolve([]);
          }
        case TaskTreeItemType.CATEGORY_GROUP:
          return Promise.resolve(this.groupingService.getTasksForCategoryGroup(
            allTasks,
            element.data,
            (task: Task) => this.createTaskItem(task)
          ));
        default:
          return Promise.resolve([]);
      }
    } catch (error) {
      console.error('Error getting tree children:', error);
      return Promise.resolve([new TaskTreeItem(
        'Error loading tasks',
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        null
      )]);
    }
  }

  private async getRootItems(): Promise<TaskTreeItem[]> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (workspaceFolders && workspaceFolders.length > 1) {
        return workspaceFolders.map(folder => new TaskTreeItem(
          folder.name,
          vscode.TreeItemCollapsibleState.Expanded,
          TaskTreeItemType.ROOT_FOLDER,
          folder.uri.fsPath
        ));
      }

      const allTasks = this.taskManager.getAllTasks();
      
      if (allTasks.length === 0) {
        return [new TaskTreeItem(
          'No tasks found',
          vscode.TreeItemCollapsibleState.None,
          TaskTreeItemType.TASK,
          null
        )];
      }

      // Always return frameworks at root level
      return this.groupingService.getRootItems(allTasks, this.statusProvider);
    } catch (error) {
      console.error('Error getting root items:', error);
      return [new TaskTreeItem(
        'Error loading tasks',
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        null
      )];
    }
  }

  private async getItemsForWorkspaceRoot(workspaceRoot: string): Promise<TaskTreeItem[]> {
    try {
      const allTasks = this.taskManager.getAllTasks().filter(task => 
        task.cwd.startsWith(workspaceRoot)
      );

      // Always return frameworks for workspace roots
      return this.groupingService.getRootItems(allTasks, this.statusProvider);
    } catch (error) {
      console.error('Error getting workspace root items:', error);
      return [];
    }
  }

  private createTaskItem(task: Task): TaskTreeItem {
    try {
      // Don't include status in the label - it will be shown via icons and can change frequently
      const defaultSuffix = task.isDefault ? ' [default]' : '';
      return new TaskTreeItem(
        `${task.name}${defaultSuffix}`,
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        task.taskId,
        task,
        this.statusProvider // Use the cached status provider
      );
    } catch (error) {
      console.error('Error creating task item:', error);
      return new TaskTreeItem(
        `Error: ${task.name}`,
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        task.taskId,
        task,
        () => 'failed' // Error state status provider
      );
    }
  }

  /**
   * Creates a status provider function that handles task status lookups.
   * Includes defensive error handling for missing tasks.
   */
  private createStatusProvider(): (taskId: string) => TaskStatus {
    return (taskId: string) => {
      try {
        return this.taskManager.getTaskStatus(taskId);
      } catch {
        // Task no longer exists, return idle as safe fallback for UI
        return 'idle';
      }
    };
  }


  // Method to get a specific task item by ID (useful for testing or external references)
  getTaskItem(taskId: string): TaskTreeItem | undefined {
    try {
      const task = this.taskManager.getTask(taskId);
      return task ? this.createTaskItem(task) : undefined;
    } catch (error) {
      console.error(`Error getting task item for ${taskId}:`, error);
      return undefined;
    }
  }
}
