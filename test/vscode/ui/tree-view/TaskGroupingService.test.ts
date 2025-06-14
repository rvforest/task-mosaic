import { TaskGroupingService } from '../../../../src/vscode/ui/tree-view/TaskGroupingService';
import { TaskTreeItem } from '../../../../src/vscode/ui/tree-view/TaskTreeItem';
import { TaskTreeItemType, TaskTreeViewMode } from '../../../../src/vscode/ui/tree-view/types';
import { Task } from '../../../../src/core/tasks/types';

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

describe('TaskGroupingService', () => {
  let groupingService: TaskGroupingService;
  let sampleTasks: Task[];
  let createTaskItemFn: (task: Task) => TaskTreeItem;

  beforeEach(() => {
    groupingService = new TaskGroupingService();
    
    sampleTasks = [
      {
        taskId: 'test-py311',
        name: 'test-py311',
        cwd: '/test/workspace',
        frameworkName: 'nox',
        matrixGroup: 'test',
        categoryGroups: ['tests'],
        isDefault: true
      },
      {
        taskId: 'test-py312',
        name: 'test-py312',
        cwd: '/test/workspace',
        frameworkName: 'nox',
        matrixGroup: 'test',
        categoryGroups: ['tests']
      },
      {
        taskId: 'lint',
        name: 'lint',
        cwd: '/test/workspace',
        frameworkName: 'nox',
        categoryGroups: ['linting']
      },
      {
        taskId: 'docs',
        name: 'docs',
        cwd: '/test/workspace',
        frameworkName: 'sphinx'
      },
      {
        taskId: 'format',
        name: 'format',
        cwd: '/test/workspace',
        frameworkName: 'nox',
        categoryGroups: ['linting', 'formatting']
      }
    ];

    createTaskItemFn = (task: Task) => new TaskTreeItem(
      task.name,
      vscode.TreeItemCollapsibleState.None,
      TaskTreeItemType.TASK,
      task.taskId,
      task
    );
  });

  describe('framework grouping', () => {
    it('should group tasks by framework', () => {
      const result = groupingService.getFrameworkGroupItems(sampleTasks);

      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('nox (4)');
      expect(result[0].itemType).toBe(TaskTreeItemType.FRAMEWORK);
      expect(result[0].data).toBe('nox');
      expect(result[1].label).toBe('sphinx (1)');
      expect(result[1].itemType).toBe(TaskTreeItemType.FRAMEWORK);
      expect(result[1].data).toBe('sphinx');
    });

    it('should handle empty task list', () => {
      const result = groupingService.getFrameworkGroupItems([]);
      expect(result).toHaveLength(0);
    });

    it('should get tasks for specific framework', () => {
      const result = groupingService.getTasksForFramework(sampleTasks, 'nox', TaskTreeViewMode.FLAT, createTaskItemFn);

      expect(result).toHaveLength(3); // 1 matrix group (test) + 2 individual tasks (format, lint)
      // The structure should be framework -> matrix groups or individual tasks
      
      // First item should be the matrix group for 'test'
      expect(result[0].itemType).toBe(TaskTreeItemType.MATRIX_GROUP);
      expect(result[0].label).toBe('test');
      
      // Other items should be individual tasks
      expect(result[1].itemType).toBe(TaskTreeItemType.TASK);
      expect(result[2].itemType).toBe(TaskTreeItemType.TASK);
    });

    it('should return empty array for non-existent framework', () => {
      const result = groupingService.getTasksForFramework(sampleTasks, 'non-existent', TaskTreeViewMode.FLAT, createTaskItemFn);
      expect(result).toHaveLength(0);
    });
  });

  describe('matrix group grouping', () => {
    it('should group tasks by matrix group', () => {
      const result = groupingService.getMatrixGroupItems(sampleTasks);

      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('test (2)');
      expect(result[0].itemType).toBe(TaskTreeItemType.MATRIX_GROUP);
      expect(result[0].data).toBe('test');
      expect(result[1].label).toBe('Other Tasks (3)');
      expect(result[1].itemType).toBe(TaskTreeItemType.MATRIX_GROUP);
      expect(result[1].data).toBe(null);
    });

    it('should get tasks for specific matrix group', () => {
      const result = groupingService.getTasksForMatrixGroup(sampleTasks, 'test', createTaskItemFn);

      expect(result).toHaveLength(2);
      expect(result[0].task?.taskId).toBe('test-py311');
      expect(result[1].task?.taskId).toBe('test-py312');
    });

    it('should get tasks without matrix group', () => {
      const result = groupingService.getTasksForMatrixGroup(sampleTasks, null, createTaskItemFn);

      expect(result).toHaveLength(3);
      expect(result[0].task?.taskId).toBe('docs');
      expect(result[1].task?.taskId).toBe('format');
      expect(result[2].task?.taskId).toBe('lint');
    });
  });

  describe('category group grouping', () => {
    it('should group tasks by category', () => {
      const result = groupingService.getCategoryGroupItems(sampleTasks);

      expect(result).toHaveLength(4);
      expect(result[0].label).toBe('formatting (1)');
      expect(result[1].label).toBe('linting (2)');
      expect(result[2].label).toBe('tests (2)');
      expect(result[3].label).toBe('Uncategorized (1)');
    });

    it('should get tasks for specific category group', () => {
      const result = groupingService.getTasksForCategoryGroup(sampleTasks, 'tests', createTaskItemFn);

      expect(result).toHaveLength(2);
      expect(result[0].task?.taskId).toBe('test-py311');
      expect(result[1].task?.taskId).toBe('test-py312');
    });

    it('should get tasks for linting category (multiple tasks)', () => {
      const result = groupingService.getTasksForCategoryGroup(sampleTasks, 'linting', createTaskItemFn);

      expect(result).toHaveLength(2);
      expect(result[0].task?.taskId).toBe('format');
      expect(result[1].task?.taskId).toBe('lint');
    });

    it('should get uncategorized tasks', () => {
      const result = groupingService.getTasksForCategoryGroup(sampleTasks, null, createTaskItemFn);

      expect(result).toHaveLength(1);
      expect(result[0].task?.taskId).toBe('docs');
    });
  });

  describe('flat grouping', () => {
    it('should return flat list of tasks', () => {
      const result = groupingService.getFlatTaskItems(sampleTasks, createTaskItemFn);

      expect(result).toHaveLength(5);
      expect(result[0].task?.taskId).toBe('docs');
      expect(result[1].task?.taskId).toBe('format');
      expect(result[2].task?.taskId).toBe('lint');
      expect(result[3].task?.taskId).toBe('test-py311');
      expect(result[4].task?.taskId).toBe('test-py312');
    });

    it('should handle empty task list', () => {
      const result = groupingService.getFlatTaskItems([], createTaskItemFn);
      expect(result).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle null tasks array gracefully', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = groupingService.getFrameworkGroupItems(null as any);
      expect(result).toHaveLength(0);
    });

    it('should handle undefined tasks array gracefully', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = groupingService.getMatrixGroupItems(undefined as any);
      expect(result).toHaveLength(0);
    });

    it('should handle tasks with missing properties', () => {
      const malformedTasks = [
        { taskId: 'test1', name: 'test1' } as Task,
        { taskId: 'test2', name: 'test2', frameworkName: 'nox' } as Task
      ];

      const result = groupingService.getFrameworkGroupItems(malformedTasks);
      expect(result).toHaveLength(2); // undefined and 'nox'
    });
  });

  describe('sorting behavior', () => {
    it('should sort tasks alphabetically', () => {
      const unsortedTasks = [
        { taskId: 'z-task', name: 'z-task', frameworkName: 'test' },
        { taskId: 'a-task', name: 'a-task', frameworkName: 'test' },
        { taskId: 'm-task', name: 'm-task', frameworkName: 'test' }
      ] as Task[];

      const result = groupingService.getFlatTaskItems(unsortedTasks, createTaskItemFn);

      expect(result[0].task?.name).toBe('a-task');
      expect(result[1].task?.name).toBe('m-task');
      expect(result[2].task?.name).toBe('z-task');
    });

    it('should sort framework groups alphabetically', () => {
      const tasks = [
        { taskId: 'task1', name: 'task1', frameworkName: 'zebra' },
        { taskId: 'task2', name: 'task2', frameworkName: 'alpha' },
        { taskId: 'task3', name: 'task3', frameworkName: 'beta' }
      ] as Task[];

      const result = groupingService.getFrameworkGroupItems(tasks);

      expect(result[0].data).toBe('alpha');
      expect(result[1].data).toBe('beta');
      expect(result[2].data).toBe('zebra');
    });
  });
});
