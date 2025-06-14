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
    workspaceFolders: []
  },
  EventEmitter: class {
    event: unknown = jest.fn();
    fire = jest.fn();
  }
}), { virtual: true });

import { 
  TaskTreeProvider, 
  TaskTreeItem, 
  TaskGroupingService, 
  TaskTreeItemType, 
  TaskTreeViewMode 
} from '../../../../src/vscode/ui/tree-view';

describe('Tree View Module Exports', () => {
  it('should export TaskTreeProvider', () => {
    expect(TaskTreeProvider).toBeDefined();
    expect(typeof TaskTreeProvider).toBe('function');
  });

  it('should export TaskTreeItem', () => {
    expect(TaskTreeItem).toBeDefined();
    expect(typeof TaskTreeItem).toBe('function');
  });

  it('should export TaskGroupingService', () => {
    expect(TaskGroupingService).toBeDefined();
    expect(typeof TaskGroupingService).toBe('function');
  });

  it('should export TaskTreeItemType enum', () => {
    expect(TaskTreeItemType).toBeDefined();
    expect(typeof TaskTreeItemType).toBe('object');
    expect(TaskTreeItemType.FRAMEWORK).toBe('framework');
  });

  it('should export TaskTreeViewMode enum', () => {
    expect(TaskTreeViewMode).toBeDefined();
    expect(typeof TaskTreeViewMode).toBe('object');
    expect(TaskTreeViewMode.FLAT).toBe('flat');
  });

  it('should allow importing all exports together', () => {
    // This test verifies that the barrel export (index.ts) works correctly
    expect(TaskTreeProvider).toBeDefined();
    expect(TaskTreeItem).toBeDefined();
    expect(TaskGroupingService).toBeDefined();
    expect(TaskTreeItemType).toBeDefined();
    expect(TaskTreeViewMode).toBeDefined();
  });
});
