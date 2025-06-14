import { TaskTreeProvider, TaskTreeItem, TaskTreeItemType, TaskTreeViewMode } from '../../../../src/vscode/ui/tree-view';
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

// Import vscode after the mock
import * as vscode from 'vscode';

describe('TaskTreeProvider', () => {
  let taskManager: TaskManager;
  let treeProvider: TaskTreeProvider;
  let mockContext: vscode.ExtensionContext;
  let sampleTasks: Task[];

  beforeEach(() => {
    taskManager = new TaskManager(['/test/workspace']);
    mockContext = {} as vscode.ExtensionContext;
    treeProvider = new TaskTreeProvider(taskManager, mockContext);

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
        frameworkName: 'sphinx',
      }
    ];

    // Mock the taskManager methods
    jest.spyOn(taskManager, 'getAllTasks').mockReturnValue(sampleTasks);
    jest.spyOn(taskManager, 'getTasksByProvider').mockImplementation((framework) => 
      sampleTasks.filter(task => task.frameworkName === framework)
    );
    jest.spyOn(taskManager, 'getTasksByMatrixGroup').mockImplementation((group) => 
      sampleTasks.filter(task => task.matrixGroup === group)
    );
    jest.spyOn(taskManager, 'getTasksByCategoryGroup').mockImplementation((category) => 
      sampleTasks.filter(task => task.categoryGroups?.includes(category))
    );
    jest.spyOn(taskManager, 'getTask').mockImplementation((id) => 
      sampleTasks.find(task => task.taskId === id)
    );
  });

  describe('initialization', () => {
    it('should initialize with default view mode', () => {
      expect(treeProvider.getViewMode()).toBe(TaskTreeViewMode.BY_CATEGORY);
    });

    it('should be able to change view mode', () => {
      treeProvider.setViewMode(TaskTreeViewMode.BY_CATEGORY);
      expect(treeProvider.getViewMode()).toBe(TaskTreeViewMode.BY_CATEGORY);
    });
  });

  describe('tree structure - frameworks always at root', () => {
    beforeEach(() => {
      treeProvider.setViewMode(TaskTreeViewMode.BY_CATEGORY);
    });

    it('should return framework groups at root level', async () => {
      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(2);
      expect(rootItems[0].label).toBe('nox (3)');
      expect(rootItems[0].itemType).toBe(TaskTreeItemType.FRAMEWORK);
      expect(rootItems[1].label).toBe('sphinx (1)');
      expect(rootItems[1].itemType).toBe(TaskTreeItemType.FRAMEWORK);
    });

    it('should return category groups for a specific framework in BY_CATEGORY mode', async () => {
      const frameworkItem = new TaskTreeItem(
        'nox (3)',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.FRAMEWORK,
        'nox'
      );

      const frameworkTasks = await treeProvider.getChildren(frameworkItem);
      
      expect(frameworkTasks).toHaveLength(2);
      expect(frameworkTasks[0].itemType).toBe(TaskTreeItemType.CATEGORY_GROUP);
      expect(frameworkTasks[1].itemType).toBe(TaskTreeItemType.CATEGORY_GROUP);
    });
  });

  describe('tree structure - by category view mode', () => {
    beforeEach(() => {
      treeProvider.setViewMode(TaskTreeViewMode.BY_CATEGORY);
    });

    it('should return framework groups at root level', async () => {
      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(2);
      expect(rootItems[0].label).toBe('nox (3)');
      expect(rootItems[0].itemType).toBe(TaskTreeItemType.FRAMEWORK);
      expect(rootItems[1].label).toBe('sphinx (1)');
      expect(rootItems[1].itemType).toBe(TaskTreeItemType.FRAMEWORK);
    });

    it('should return tasks for a specific category group', async () => {
      const categoryItem = new TaskTreeItem(
        'tests (2)',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.CATEGORY_GROUP,
        'tests'
      );

      const categoryTasks = await treeProvider.getChildren(categoryItem);
      
      expect(categoryTasks).toHaveLength(2);
      expect(categoryTasks[0].task?.taskId).toBe('test-py311');
      expect(categoryTasks[1].task?.taskId).toBe('test-py312');
    });
  });

  describe('tree structure - by category', () => {
    beforeEach(() => {
      treeProvider.setViewMode(TaskTreeViewMode.BY_CATEGORY);
    });

    it('should return framework groups at root level', async () => {
      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(2);
      expect(rootItems[0].label).toBe('nox (3)');
      expect(rootItems[0].itemType).toBe(TaskTreeItemType.FRAMEWORK);
      expect(rootItems[1].label).toBe('sphinx (1)');
      expect(rootItems[1].itemType).toBe(TaskTreeItemType.FRAMEWORK);
    });

    it('should return tasks for a specific category group', async () => {
      const categoryItem = new TaskTreeItem(
        'tests (2)',
        vscode.TreeItemCollapsibleState.Expanded,
        TaskTreeItemType.CATEGORY_GROUP,
        'tests'
      );

      const categoryTasks = await treeProvider.getChildren(categoryItem);
      
      expect(categoryTasks).toHaveLength(2);
      expect(categoryTasks[0].task?.taskId).toBe('test-py311');
      expect(categoryTasks[1].task?.taskId).toBe('test-py312');
    });
  });

  describe('tree structure - flat view', () => {
    beforeEach(() => {
      treeProvider.setViewMode(TaskTreeViewMode.FLAT);
    });

    it('should return framework groups at root level', async () => {
      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(2);
      expect(rootItems[0].label).toBe('nox (3)');
      expect(rootItems[0].itemType).toBe(TaskTreeItemType.FRAMEWORK);
      expect(rootItems[1].label).toBe('sphinx (1)');
      expect(rootItems[1].itemType).toBe(TaskTreeItemType.FRAMEWORK);
    });
  });

  describe('integration with TaskGroupingService', () => {
    it('should delegate framework grouping to TaskGroupingService', async () => {
      treeProvider.setViewMode(TaskTreeViewMode.BY_CATEGORY);
      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(2);
      expect(rootItems[0].label).toBe('nox (3)');
      expect(rootItems[1].label).toBe('sphinx (1)');
    });

    it('should delegate category grouping to TaskGroupingService', async () => {
      treeProvider.setViewMode(TaskTreeViewMode.BY_CATEGORY);
      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(2);
      expect(rootItems[0].label).toBe('nox (3)');
      expect(rootItems[1].label).toBe('sphinx (1)');
    });

    it('should delegate flat view to TaskGroupingService', async () => {
      treeProvider.setViewMode(TaskTreeViewMode.FLAT);
      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(2);
      expect(rootItems[0].label).toBe('nox (3)');
      expect(rootItems[1].label).toBe('sphinx (1)');
    });
  });

  describe('task item creation', () => {
    it('should create task items with correct status display', () => {
      const taskItem = treeProvider.getTaskItem('test-py311');
      
      expect(taskItem).toBeDefined();
      expect(taskItem?.task?.taskId).toBe('test-py311');
      expect(taskItem?.label).toContain('test-py311');
      expect(taskItem?.label).toContain('[default]'); // Default task marker
    });

    it('should create task items without status indicators by default', () => {
      const taskItem = treeProvider.getTaskItem('test-py311');
      expect(taskItem?.label).toContain('test-py311');
      // Should not contain status indicators since no execution is running
    });
  });

  describe('utility methods', () => {
    it('should get task item by ID', () => {
      const taskItem = treeProvider.getTaskItem('test-py311');
      
      expect(taskItem).toBeDefined();
      expect(taskItem?.task?.taskId).toBe('test-py311');
      expect(taskItem?.label).toContain('test-py311');
      expect(taskItem?.label).toContain('[default]'); // Default task marker
    });

    it('should return undefined for non-existent task', () => {
      const taskItem = treeProvider.getTaskItem('non-existent');
      
      expect(taskItem).toBeUndefined();
    });

    it('should refresh tree data', () => {
      const refreshSpy = jest.spyOn(treeProvider['_onDidChangeTreeData'], 'fire');
      
      treeProvider.refresh();
      
      expect(refreshSpy).toHaveBeenCalled();
    });

    it('should refresh when needed', () => {
      const refreshSpy = jest.spyOn(treeProvider, 'refresh');
      
      treeProvider.refresh();
      
      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle errors in getChildren gracefully', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      // Mock TaskManager to throw an error
      jest.spyOn(taskManager, 'getAllTasks').mockImplementation(() => {
        throw new Error('Task loading failed');
      });

      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(1);
      expect(rootItems[0].label).toBe('Error loading tasks');
      expect(rootItems[0].itemType).toBe(TaskTreeItemType.TASK);
      errorSpy.mockRestore();
    });

    it('should handle task operations gracefully', () => {
      const taskItem = treeProvider.getTaskItem('test-py311');
      
      expect(taskItem).toBeDefined();
      expect(taskItem?.task?.taskId).toBe('test-py311');
    });

    it('should handle task operations gracefully', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(taskManager, 'getTask').mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const taskItem = treeProvider.getTaskItem('test-py311');
      
      expect(taskItem).toBeUndefined();
      errorSpy.mockRestore();
    });

    it('should handle errors in getTaskItem gracefully', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(taskManager, 'getTask').mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const result = treeProvider.getTaskItem('test-py311');
      
      expect(result).toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('Error getting task item for test-py311:', expect.any(Error));
      errorSpy.mockRestore();
    });
  });

  describe('empty state', () => {
    beforeEach(() => {
      jest.spyOn(taskManager, 'getAllTasks').mockReturnValue([]);
    });

    it('should show "No tasks found" when no tasks available', async () => {
      const rootItems = await treeProvider.getChildren();
      
      expect(rootItems).toHaveLength(1);
      expect(rootItems[0].label).toBe('No tasks found');
      expect(rootItems[0].itemType).toBe(TaskTreeItemType.TASK);
    });
  });
});
