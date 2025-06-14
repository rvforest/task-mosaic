import * as vscode from 'vscode';
import { Task, TaskStatus } from '../../../core/tasks/types';
import { TaskTreeItemType } from './types';
import { StatusAggregator } from './status-aggregator';

export class TaskTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: TaskTreeItemType,
    public readonly data: string | null = null,
    public readonly task?: Task,
    private readonly statusProvider?: (taskId: string) => TaskStatus,
    private readonly groupStatusProvider?: () => TaskStatus
  ) {
    super(label, collapsibleState);
    this.contextValue = itemType;
    this.tooltip = this.getTooltip();
    this.iconPath = this.getIcon();
    this.command = this.getCommand();
  }

  /**
   * Get the current status of this task item.
   * For tasks, derives status from the status provider (TaskManager).
   * For groups, uses the group status provider to aggregate child statuses.
   */
  get status(): TaskStatus {
    if (this.task && this.statusProvider) {
      return this.statusProvider(this.task.taskId);
    }
    // For group items, use the group status provider if available
    if (this.groupStatusProvider) {
      return this.groupStatusProvider();
    }
    // Default fallback for groups without status provider
    return 'idle';
  }

  getData(): Record<string, unknown> | null {
    if (this.data) {
      try {
        return JSON.parse(this.data);
      } catch (error) {
        console.error('Error parsing data:', error);
        return null;
      }
    }
    return null;
  }


  private getTooltip(): string {
    if (this.task) {
      let tooltip = `${this.task.name}`;
      if (this.task.description) {
        tooltip += `\n${this.task.description}`;
      }
      tooltip += `\nFramework: ${this.task.frameworkName}`;
      
      // Only show status in tooltip for non-idle statuses
      if (this.statusProvider) {
        const status = this.status;
        if (status !== 'idle') {
          tooltip += `\nStatus: ${status}`;
        }
      }
      
      return tooltip;
    }
    
    // For group items, extract count from label and show status if available
    const countMatch = this.label.match(/\((\d+)\)/);
    const taskCount = countMatch ? parseInt(countMatch[1], 10) : 0;
    
    switch (this.itemType) {
      case TaskTreeItemType.FRAMEWORK: {
        let frameworkTooltip = `🔧 ${this.label} - Framework with automated tasks`;
        if (this.groupStatusProvider && taskCount > 0) {
          const status = this.status;
          if (status !== 'idle') {
            frameworkTooltip += `\n${StatusAggregator.getStatusDescription(status, taskCount)}`;
          }
        }
        return frameworkTooltip;
      }
      case TaskTreeItemType.MATRIX_GROUP:
      case TaskTreeItemType.CATEGORY_GROUP: {
        let groupTooltip = `📁 ${this.label} - Task group`;
        if (this.groupStatusProvider && taskCount > 0) {
          const status = this.status;
          if (status !== 'idle') {
            groupTooltip += `\n${StatusAggregator.getStatusDescription(status, taskCount)}`;
          }
        }
        return groupTooltip;
      }
      case TaskTreeItemType.ROOT_FOLDER:
        return `📂 ${this.label} - Workspace folder`;
      default:
        return this.label;
    }
  }

  private getIcon(): vscode.ThemeIcon | undefined {
    if (this.task && this.statusProvider) {
      const status = this.status;
      return this.getTaskStatusIcon(status);
    }
    
    // For group items, show status icon if status is not idle
    if (this.groupStatusProvider) {
      const status = this.status;
      if (StatusAggregator.shouldShowStatusIndicator(status)) {
        return this.getTaskStatusIcon(status);
      }
    }
    
    switch (this.itemType) {
      case TaskTreeItemType.FRAMEWORK:
        return new vscode.ThemeIcon('tools');
      case TaskTreeItemType.MATRIX_GROUP:
        return new vscode.ThemeIcon('group-by-ref-type');
      case TaskTreeItemType.CATEGORY_GROUP:
        return new vscode.ThemeIcon('folder');
      case TaskTreeItemType.ROOT_FOLDER:
        return new vscode.ThemeIcon('folder-opened');
      default:
        return undefined;
    }
  }

  private getTaskStatusIcon(status: TaskStatus): vscode.ThemeIcon {
    switch (status) {
      case 'running':
        return new vscode.ThemeIcon('loading~spin');
      case 'completed':
        return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
      case 'failed':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
      case 'skipped':
        return new vscode.ThemeIcon('debug-step-over', new vscode.ThemeColor('charts.yellow'));
      case 'pending':
        return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
      case 'cancelled':
        return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.orange'));
      case 'idle':
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }

  private getCommand(): vscode.Command | undefined {
    if (this.task) {
      const command = {
        command: 'taskMosaic.runTask',
        title: 'Run Task',
        arguments: [this.task]
      };
      return command;
    }
    return undefined;
  }
}
