// Test to simulate real tree refresh timing issues
import { TaskManager } from '../../src/core/task-manager';
import { TaskTreeProvider } from '../../src/vscode/ui/tree-view/TaskTreeProvider';
import { Task } from '../../src/core/tasks/types';
import { FrameworkRegistry } from '../../src/core/framework/framework-registry';
// vscode module mocked below

// Mock VSCode
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
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    constructor(public id: string, public color?: unknown) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  EventEmitter: class {
    event: unknown = jest.fn();
    fire = jest.fn();
  },
  workspace: {
    workspaceFolders: []
  }
}), { virtual: true });

// Mock the FrameworkRegistry
jest.mock('../../src/core/framework/framework-registry');
const mockFrameworkRegistry = FrameworkRegistry as jest.Mocked<typeof FrameworkRegistry>;

describe('Tree refresh timing test', () => {
  let taskManager: TaskManager;
  let treeProvider: TaskTreeProvider;
  let mockTask: Task;

  beforeEach(() => {
    taskManager = new TaskManager(['/test']);
    
    // Mock context
    const mockContext = {
      subscriptions: []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    
    treeProvider = new TaskTreeProvider(taskManager, mockContext);
    
    mockTask = {
      taskId: 'test-task',
      name: 'Test Task', 
      cwd: '/test',
      frameworkName: 'mock-framework'
    };

    // Manually add task to manager
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (taskManager as any).tasks.set(mockTask.taskId, mockTask);

    // Mock framework registry with a slower runner
    const mockFramework = {
      name: 'mock-framework',
      detect: jest.fn().mockResolvedValue(true),
      runner: {
        name: 'mock-runner',
        runTask: jest.fn(() => new Promise(resolve => {
          // Simulate a task that takes 200ms to complete
          setTimeout(() => resolve('completed'), 200);
        }))
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFrameworkRegistry.getFramework.mockReturnValue(mockFramework as any);

    jest.clearAllMocks();
  });

  it('should capture status at different refresh timings', async () => {
    console.log('=== Tree Refresh Timing Test ===\n');
    
    // 1. Get initial tree item
    const initialItem = treeProvider.getTaskItem(mockTask.taskId);
    console.log('1. Initial item status (before execution):', initialItem?.status);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log('   Initial item icon:', (initialItem?.iconPath as any)?.id);
    
    // 2. Start task execution
    console.log('\n2. Starting task execution...');
    const execution = await taskManager.executeTask(mockTask.taskId);
    console.log('   Execution returned with status:', execution.status);
    
    // 3. Check tree item status immediately after starting
    const immediateItem = treeProvider.getTaskItem(mockTask.taskId);
    console.log('3. Tree item status immediately after executeTask:', immediateItem?.status);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log('   Immediate item icon:', (immediateItem?.iconPath as any)?.id);
    
    // 4. Wait a bit and check (should be running)
    await new Promise(resolve => setTimeout(resolve, 50));
    const runningItem = treeProvider.getTaskItem(mockTask.taskId);
    console.log('4. Tree item status after 50ms delay:', runningItem?.status);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log('   Running item icon:', (runningItem?.iconPath as any)?.id);
    
    // 5. Wait for completion and check
    await new Promise(resolve => setTimeout(resolve, 200));
    const completedItem = treeProvider.getTaskItem(mockTask.taskId);
    console.log('5. Tree item status after completion:', completedItem?.status);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log('   Completed item icon:', (completedItem?.iconPath as any)?.id);
    
    console.log('\n=== Test Complete ===');
  });
});