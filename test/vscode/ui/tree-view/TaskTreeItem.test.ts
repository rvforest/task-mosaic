import { TaskTreeItem } from '../../../../src/vscode/ui/tree-view/TaskTreeItem';
import { TaskTreeItemType } from '../../../../src/vscode/ui/tree-view/types';
import { Task, TaskStatus } from '../../../../src/core/tasks/types';

// Mock vscode module before imports
jest.mock('vscode', () => ({
  TreeItem: class {
    public contextValue?: string;
    public tooltip?: string;
    public iconPath?: unknown;
    public command?: unknown;
    
    constructor(
      public label: string,
      public collapsibleState?: number
    ) {}
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2
  },
  ThemeIcon: class {
    constructor(public id: string, public color?: unknown) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  }
}), { virtual: true });

import * as vscode from 'vscode';

describe('TaskTreeItem', () => {
  const sampleTask: Task = {
    taskId: 'test-py311',
    name: 'test-py311',
    cwd: '/test/workspace',
    frameworkName: 'nox',
    matrixGroup: 'test',
    categoryGroups: ['tests'],
    isDefault: true,
    description: 'Run tests with Python 3.11'
  };

  describe('task item creation', () => {
    it('should create task item with correct properties', () => {
      const item = new TaskTreeItem(
        'test-py311 ⭐',
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        'test-py311',
        sampleTask
      );

      expect(item.label).toBe('test-py311 ⭐');
      expect(item.itemType).toBe(TaskTreeItemType.TASK);
      expect(item.data).toBe('test-py311');
      expect(item.task).toBe(sampleTask);
      expect(item.contextValue).toBe(TaskTreeItemType.TASK);
    });

    it('should create framework group item', () => {
      const item = new TaskTreeItem(
        'nox (3)',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.FRAMEWORK,
        'nox'
      );

      expect(item.label).toBe('nox (3)');
      expect(item.itemType).toBe(TaskTreeItemType.FRAMEWORK);
      expect(item.data).toBe('nox');
      expect(item.task).toBeUndefined();
      expect(item.contextValue).toBe(TaskTreeItemType.FRAMEWORK);
    });

    it('should create matrix group item', () => {
      const item = new TaskTreeItem(
        'test (2)',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.MATRIX_GROUP,
        'test'
      );

      expect(item.label).toBe('test (2)');
      expect(item.itemType).toBe(TaskTreeItemType.MATRIX_GROUP);
      expect(item.data).toBe('test');
      expect(item.task).toBeUndefined();
      expect(item.contextValue).toBe(TaskTreeItemType.MATRIX_GROUP);
    });

    it('should create category group item', () => {
      const item = new TaskTreeItem(
        'tests (2)',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.CATEGORY_GROUP,
        'tests'
      );

      expect(item.label).toBe('tests (2)');
      expect(item.itemType).toBe(TaskTreeItemType.CATEGORY_GROUP);
      expect(item.data).toBe('tests');
      expect(item.task).toBeUndefined();
      expect(item.contextValue).toBe(TaskTreeItemType.CATEGORY_GROUP);
    });
  });

  describe('tooltip generation', () => {
    it('should generate correct tooltip for task item', () => {
      const item = new TaskTreeItem(
        'test-py311',
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        'test-py311',
        sampleTask
      );

      expect(item.tooltip).toContain('test-py311');
      expect(item.tooltip).toContain('Run tests with Python 3.11');
      expect(item.tooltip).toContain('Framework: nox');
      // Note: Path is no longer shown in tooltip by default
      // Status should not be shown for idle tasks
      expect(item.tooltip).not.toContain('(idle)');
    });

    it('should generate tooltip for task without description', () => {
      const taskWithoutDescription = { ...sampleTask, description: undefined };
      const item = new TaskTreeItem(
        'test-py311',
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        'test-py311',
        taskWithoutDescription
      );

      expect(item.tooltip).toContain('test-py311');
      expect(item.tooltip).not.toContain('Run tests');
      expect(item.tooltip).toContain('Framework: nox');
      // Status should not be shown for idle tasks
      expect(item.tooltip).not.toContain('(idle)');
    });

    it('should generate tooltip for framework group', () => {
      const item = new TaskTreeItem(
        'nox (3)',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.FRAMEWORK,
        'nox'
      );

      expect(item.tooltip).toBe('🔧 nox (3) - Framework with automated tasks');
    });

    it('should generate tooltip for matrix group', () => {
      const item = new TaskTreeItem(
        'test (2)',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.MATRIX_GROUP,
        'test'
      );

      expect(item.tooltip).toBe('📁 test (2) - Task group');
    });

    it('should generate tooltip for category group', () => {
      const item = new TaskTreeItem(
        'tests (2)',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.CATEGORY_GROUP,
        'tests'
      );

      expect(item.tooltip).toBe('📁 tests (2) - Task group');
    });
  });

  describe('icon assignment', () => {
    it('should assign correct icon for task with different statuses', () => {
      // Create a status provider that returns 'running'
      const runningStatusProvider = () => 'running' as TaskStatus;
      const runningItem = new TaskTreeItem(
        'test-py311',
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        'test-py311',
        sampleTask,
        runningStatusProvider
      );
      expect(runningItem.iconPath).toEqual(new vscode.ThemeIcon('loading~spin'));

      // Create a status provider that returns 'completed'
      const completedStatusProvider = () => 'completed' as TaskStatus;
      const completedItem = new TaskTreeItem(
        'test-py311',
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        'test-py311',
        sampleTask,
        completedStatusProvider
      );
      expect(completedItem.iconPath).toEqual(new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')));

      // Create a status provider that returns 'failed'
      const failedStatusProvider = () => 'failed' as TaskStatus;
      const failedItem = new TaskTreeItem(
        'test-py311',
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        'test-py311',
        sampleTask,
        failedStatusProvider
      );
      expect(failedItem.iconPath).toEqual(new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red')));

      // Create a status provider that returns 'skipped'
      const skippedStatusProvider = () => 'skipped' as TaskStatus;
      const skippedItem = new TaskTreeItem(
        'test-py311',
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        'test-py311',
        sampleTask,
        skippedStatusProvider
      );
      expect(skippedItem.iconPath).toEqual(new vscode.ThemeIcon('debug-step-over', new vscode.ThemeColor('charts.yellow')));

      // Create a status provider that returns 'idle'
      const idleStatusProvider = () => 'idle' as TaskStatus;
      const idleItem = new TaskTreeItem(
        'test-py311',
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        'test-py311',
        sampleTask,
        idleStatusProvider
      );
      expect(idleItem.iconPath).toEqual(new vscode.ThemeIcon('circle-outline'));
    });

    it('should assign correct icons for group types', () => {
      const frameworkItem = new TaskTreeItem(
        'nox',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.FRAMEWORK,
        'nox'
      );
      expect(frameworkItem.iconPath).toEqual(new vscode.ThemeIcon('tools'));

      const matrixItem = new TaskTreeItem(
        'test',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.MATRIX_GROUP,
        'test'
      );
      expect(matrixItem.iconPath).toEqual(new vscode.ThemeIcon('group-by-ref-type')); // Matrix groups show group icon by default

      const categoryItem = new TaskTreeItem(
        'tests',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.CATEGORY_GROUP,
        'tests'
      );
      expect(categoryItem.iconPath).toEqual(new vscode.ThemeIcon('folder'));

      const rootFolderItem = new TaskTreeItem(
        'workspace',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.ROOT_FOLDER,
        '/test/workspace'
      );
      expect(rootFolderItem.iconPath).toEqual(new vscode.ThemeIcon('folder-opened'));
    });
  });

  describe('command assignment', () => {
    it('should assign command for task items', () => {
      const item = new TaskTreeItem(
        'test-py311',
        vscode.TreeItemCollapsibleState.None,
        TaskTreeItemType.TASK,
        'test-py311',
        sampleTask
      );

      expect(item.command).toEqual({
        command: 'taskMosaic.runTask',
        title: 'Run Task',
        arguments: [sampleTask]
      });
    });

    it('should not assign command for group items', () => {
      const frameworkItem = new TaskTreeItem(
        'nox',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.FRAMEWORK,
        'nox'
      );

      expect(frameworkItem.command).toBeUndefined();
    });
  });
});
