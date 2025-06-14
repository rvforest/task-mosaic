import { TaskTreeItem } from '../../../src/vscode/ui/tree-view/TaskTreeItem';
import { Task } from '../../../src/core/tasks/types';
import { TaskTreeItemType } from '../../../src/vscode/ui/tree-view/types';

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

describe('TaskCommands Integration Test', () => {
  const mockTask: Task = {
    taskId: 'test-task-1',
    name: 'test-task',
    cwd: '/test/dir',
    frameworkName: 'nox',
    isDefault: false,
  };

  it('should create TaskTreeItem with task property accessible', () => {
    // Create a TaskTreeItem that contains the task
    const taskTreeItem = new TaskTreeItem(
      'Test Task',
      0, // TreeItemCollapsibleState.None
      TaskTreeItemType.TASK,
      'test-data',
      mockTask
    );

    // Verify that the task can be extracted
    expect(taskTreeItem.task).toBe(mockTask);
    expect(taskTreeItem.task?.frameworkName).toBe('nox');
    
        // Simulate command handler logic
    const extractedTask = taskTreeItem instanceof TaskTreeItem ? taskTreeItem.task : taskTreeItem;
    expect(extractedTask).toBe(mockTask);
    expect(extractedTask?.frameworkName).toBe('nox');
  });

  it('should handle direct Task object', () => {
    // Simulate command handler logic with direct task
    const extractedTask = mockTask instanceof TaskTreeItem ? mockTask.task : mockTask;
    expect(extractedTask).toBe(mockTask);
    expect(extractedTask?.frameworkName).toBe('nox');
  });
});
