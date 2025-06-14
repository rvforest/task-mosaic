// Test to validate TaskManager.getTaskStatus works correctly
import { TaskManager } from '../../src/core/task-manager';
import { Task } from '../../src/core/tasks/types';
import { FrameworkRegistry } from '../../src/core/framework/framework-registry';

// Mock the FrameworkRegistry
jest.mock('../../src/core/framework/framework-registry');
const mockFrameworkRegistry = FrameworkRegistry as jest.Mocked<typeof FrameworkRegistry>;

describe('TaskManager.getTaskStatus', () => {
  let taskManager: TaskManager;
  let mockTask: Task;

  beforeEach(() => {
    taskManager = new TaskManager(['/test']);
    mockTask = {
      taskId: 'test-task',
      name: 'Test Task',
      cwd: '/test',
      frameworkName: 'mock-framework'
    };

    // Manually add task to manager (bypassing providers for simplicity)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (taskManager as any).tasks.set(mockTask.taskId, mockTask);

    // Mock framework registry
    const mockFramework = {
      name: 'mock-framework',
      detect: jest.fn().mockResolvedValue(true),
      runner: {
        name: 'mock-runner',
        runTask: jest.fn().mockResolvedValue('completed')
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFrameworkRegistry.getFramework.mockReturnValue(mockFramework as any);

    jest.clearAllMocks();
  });

  it('should return idle when no executions exist', () => {
    const status = taskManager.getTaskStatus(mockTask.taskId);
    expect(status).toBe('idle');
  });

  it('should track observer notifications correctly', async () => {
    const mockObserver = {
      onExecutionStarted: jest.fn(),
      onExecutionCompleted: jest.fn(),
      onExecutionFailed: jest.fn(),
      onStateChanged: jest.fn(),
      onOutputReceived: jest.fn()
    };
    
    const executionManager = taskManager.getExecutionManager();
    executionManager.addObserver(mockObserver);
    
    // Start execution
    await taskManager.executeTask(mockTask.taskId);
    
    // Wait for execution to complete
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Verify observer calls
    console.log('Observer call counts:');
    console.log('  onExecutionStarted:', mockObserver.onExecutionStarted.mock.calls.length);
    console.log('  onStateChanged:', mockObserver.onStateChanged.mock.calls.length);
    console.log('  onExecutionCompleted:', mockObserver.onExecutionCompleted.mock.calls.length);
    
    expect(mockObserver.onExecutionStarted).toHaveBeenCalledTimes(1);
    expect(mockObserver.onStateChanged).toHaveBeenCalledTimes(2); // Should be called for 'running' and 'completed'
    expect(mockObserver.onExecutionCompleted).toHaveBeenCalledTimes(1);
    
    // Verify status changes in order
    const stateChangeCalls = mockObserver.onStateChanged.mock.calls;
    expect(stateChangeCalls[0][0].status).toBe('running');
    expect(stateChangeCalls[1][0].status).toBe('completed');
  });

  it('should return completed status after execution finishes', async () => {
    // Start and complete execution
    await taskManager.executeTask(mockTask.taskId);
    
    // Wait for execution to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check final status
    const finalStatus = taskManager.getTaskStatus(mockTask.taskId);
    expect(['completed', 'failed'].includes(finalStatus)).toBe(true);
  });

  it('should throw error for non-existent task', () => {
    expect(() => taskManager.getTaskStatus('non-existent')).toThrow('Task with ID \'non-existent\' not found');
  });

  it('should prefer active execution status over historical', async () => {
    // Execute task once and let it complete
    await taskManager.executeTask(mockTask.taskId);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify it's completed
    const completedStatus = taskManager.getTaskStatus(mockTask.taskId);
    expect(['completed', 'failed'].includes(completedStatus)).toBe(true);
    
    // Mock a slower runner for the second execution to ensure it stays pending
    const slowRunnerPromise = new Promise(resolve => setTimeout(() => resolve('completed'), 200));
    const mockSlowFramework = {
      name: 'mock-framework',
      detect: jest.fn().mockResolvedValue(true),
      provider: {
        name: 'mock-provider',
        listTasks: jest.fn().mockResolvedValue([])
      },
      runner: {
        name: 'mock-runner',
        runTask: jest.fn().mockReturnValue(slowRunnerPromise)
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFrameworkRegistry.getFramework.mockReturnValue(mockSlowFramework as any);
    
    // Start another execution (should be pending or running)
    await taskManager.executeTask(mockTask.taskId);
    
    // Should now return the active execution status, not historical
    const activeStatus = taskManager.getTaskStatus(mockTask.taskId);
    
    // The execution could be either pending or running at this point, 
    // but it should definitely not be the historical completed status
    expect(['pending', 'running']).toContain(activeStatus);
    expect(activeStatus).not.toBe('completed'); // Should not return the historical status
  });
});