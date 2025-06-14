import { TaskTreeProvider } from '../../../../src/vscode/ui/tree-view/TaskTreeProvider';
import { TaskManager } from '../../../../src/core/task-manager';
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
  },
  workspace: {
    workspaceFolders: [
      {
        uri: {
          fsPath: '/test/workspace'
        }
      }
    ]
  },
  EventEmitter: class {
    event: unknown = jest.fn();
    fire = jest.fn();
  }
}), { virtual: true });

import * as vscode from 'vscode';

describe('TaskTreeProvider Status Integration', () => {
  let taskManager: jest.Mocked<TaskManager>;
  let treeProvider: TaskTreeProvider;
  let context: vscode.ExtensionContext;

  const sampleTasks: Task[] = [
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
    }
  ];

  beforeEach(() => {
    // Mock TaskManager
    taskManager = {
      getAllTasks: jest.fn().mockReturnValue(sampleTasks),
      getTaskStatus: jest.fn()
    } as unknown as jest.Mocked<TaskManager>;

    context = {} as vscode.ExtensionContext;
    treeProvider = new TaskTreeProvider(taskManager, context);
  });

  describe('group status aggregation', () => {
    it('should show running status on framework when any child task is running', async () => {
      // Setup: one task running, others idle
      taskManager.getTaskStatus.mockImplementation((taskId: string) => {
        if (taskId === 'test-py311') return 'running';
        return 'idle';
      });

      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(1);
      const frameworkItem = rootItems[0];
      expect(frameworkItem.label).toBe('nox (3)');
      
      // The framework group should show running status
      expect(frameworkItem.status).toBe('running');
      
      // Icon should be the running icon
      expect(frameworkItem.iconPath).toEqual(new vscode.ThemeIcon('loading~spin'));
      
      // Tooltip should indicate running status
      expect(frameworkItem.tooltip).toContain('one or more running');
    });

    it('should show completed status on framework when all child tasks are completed', async () => {
      // Setup: all tasks completed
      taskManager.getTaskStatus.mockReturnValue('completed');

      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(1);
      const frameworkItem = rootItems[0];
      expect(frameworkItem.label).toBe('nox (3)');
      
      // The framework group should show completed status
      expect(frameworkItem.status).toBe('completed');
      
      // Icon should be the completed icon
      expect(frameworkItem.iconPath).toEqual(new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')));
      
      // Tooltip should indicate all completed
      expect(frameworkItem.tooltip).toContain('all completed');
    });

    it('should show failed status on framework when any task fails (but none running)', async () => {
      // Setup: one task failed, others idle  
      taskManager.getTaskStatus.mockImplementation((taskId: string) => {
        if (taskId === 'test-py311') return 'failed';
        return 'idle';
      });

      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(1);
      const frameworkItem = rootItems[0];
      
      // The framework group should show failed status
      expect(frameworkItem.status).toBe('failed');
      
      // Icon should be the failed icon
      expect(frameworkItem.iconPath).toEqual(new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red')));
      
      // Tooltip should indicate failure
      expect(frameworkItem.tooltip).toContain('one or more failed');
    });

    it('should show idle status on framework when all tasks are idle', async () => {
      // Setup: all tasks idle
      taskManager.getTaskStatus.mockReturnValue('idle');

      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(1);
      const frameworkItem = rootItems[0];
      
      // The framework group should show idle status
      expect(frameworkItem.status).toBe('idle');
      
      // Icon should be the default framework icon (not status icon)
      expect(frameworkItem.iconPath).toEqual(new vscode.ThemeIcon('tools'));
      
      // Tooltip should not contain status information for idle
      expect(frameworkItem.tooltip).not.toContain('one or more');
    });

    it('should propagate status to category groups', async () => {
      // Setup: running task in test category
      taskManager.getTaskStatus.mockImplementation((taskId: string) => {
        if (taskId === 'test-py311') return 'running';
        return 'idle';
      });

      const rootItems = await treeProvider.getChildren();
      const frameworkItem = rootItems[0];
      
      // Get category groups from the framework
      const categoryGroups = await treeProvider.getChildren(frameworkItem);
      
      // Find the 'tests' category group
      const testCategoryGroup = categoryGroups.find(item => item.label.includes('tests'));
      expect(testCategoryGroup).toBeDefined();
      
      // The test category group should show running status
      expect(testCategoryGroup!.status).toBe('running');
      
      // Icon should be the running icon
      expect(testCategoryGroup!.iconPath).toEqual(new vscode.ThemeIcon('loading~spin'));
    });

    it('should prioritize running over completed status', async () => {
      // Setup: mixed statuses with running having priority
      taskManager.getTaskStatus.mockImplementation((taskId: string) => {
        if (taskId === 'test-py311') return 'running';
        if (taskId === 'test-py312') return 'completed';
        return 'failed';
      });

      const rootItems = await treeProvider.getChildren();
      const frameworkItem = rootItems[0];
      
      // Running should take precedence
      expect(frameworkItem.status).toBe('running');
    });
  });
});