# TaskTreeProvider

The `TaskTreeProvider` is a VSCode TreeDataProvider implementation that integrates with the TaskManager to provide a hierarchical view of tasks in the VSCode sidebar.

## View Modes

The provider supports two view modes, but **always groups tasks by framework at the root level** for clear visual separation:
  - `FLAT`: Tasks are grouped by framework, then tasks are shown with matrix grouping
  - `BY_CATEGORY`: Tasks are grouped by framework, then by categories, then by matrix groups

- **Task Status Icons**: Visual indicators for task status
  - ⚪ Idle tasks
  - 🔄 Running tasks (spinning icon)
  - ✅ Successful tasks (green)
  - ❌ Failed tasks (red)
  - ⏭️ Skipped tasks (yellow)

- **Smart Grouping**: Automatic grouping based on task metadata
- **Interactive**: Tasks can be run directly from the tree view
- **Responsive**: Automatically refreshes when tasks change

## Usage

### Basic Setup

```typescript
import { TaskTreeProvider } from './src/vscode/ui/tree-view/TaskTreeProvider';
import { TaskManager } from './src/core/task-manager';

// Initialize TaskManager with workspace directories
const taskManager = new TaskManager(['/path/to/workspace']);

// Create tree provider
const treeProvider = new TaskTreeProvider(taskManager, context);

// Register with VSCode
vscode.window.createTreeView('noxSessions', {
  treeDataProvider: treeProvider,
  showCollapseAll: true
});
```

### Changing View Mode

```typescript
```typescript
// Change to flat view
treeProvider.setViewMode(TaskTreeViewMode.FLAT);

// Change to category view
treeProvider.setViewMode(TaskTreeViewMode.BY_CATEGORY);
```
```

### Refreshing Tasks

```typescript
// Refresh after task manager updates
await taskManager.refreshTasks('/workspace/root');
treeProvider.refresh();
```

### Updating Task Status

```typescript
// Update task status and refresh view
treeProvider.updateTaskStatus('test-py311', 'running');
```

## Tree Structure

### By Framework
```
� nox (3)
├── 🔄 test-py311 ⭐
├── ⚪ test-py312
└── ⚪ lint

� sphinx (1)
└── ⚪ docs
```

### By Matrix Group
```
🔗 test (2)
├── 🔄 test-py311 ⭐
└── ⚪ test-py312

🔗 Other Tasks (2)
├── ⚪ lint
└── ⚪ docs
```

### By Category
```
🏷️ tests (2)
├── 🔄 test-py311 ⭐
└── ⚪ test-py312

🏷️ linting (1)
└── ⚪ lint

🏷️ Uncategorized (1)
└── ⚪ docs
```

## API Reference

### TaskTreeProvider

#### Constructor
- `constructor(taskManager: TaskManager, context: vscode.ExtensionContext)`

#### Methods
- `refresh(): void` - Refresh the tree view
- `setViewMode(mode: TaskTreeViewMode): void` - Change the view mode
- `getViewMode(): TaskTreeViewMode` - Get current view mode
- `updateTaskStatus(taskId: string, status: TaskStatus): void` - Update task status
- `getTaskItem(taskId: string): TaskTreeItem | undefined` - Get tree item for task

#### Events
- `onDidChangeTreeData: vscode.Event<TaskTreeItem | undefined | null | void>` - Fired when tree data changes

### TaskTreeItem

#### Properties
- `label: string` - Display label
- `itemType: TaskTreeItemType` - Type of tree item
- `data: string | null` - Associated data (task ID, framework name, etc.)
- `task?: Task` - Associated task object (for task items)

### Enums

#### TaskTreeItemType
- `FRAMEWORK` - Framework group item
- `MATRIX_GROUP` - Matrix group item
- `CATEGORY_GROUP` - Category group item
- `TASK` - Individual task item
- `ROOT_FOLDER` - Workspace root folder

#### TaskTreeViewMode
- `FLAT` - Flat view with matrix grouping under frameworks
- `BY_CATEGORY` - Group by categories, then by matrix groups under frameworks

## Integration Notes

### Commands
The tree provider automatically sets up commands for task items:
- Default command: `taskMosaic.runTask` with task as argument
- Can be customized by modifying the `getCommand()` method in TaskTreeItem

### Context Values
Each tree item has a `contextValue` matching its `itemType`, which can be used in package.json menu contributions:

```json
{
  "command": "noxRunner.runTagGroup",
  "when": "view == noxSessions && viewItem == categoryGroup",
  "group": "inline"
}
```

### Icons
Icons are automatically selected based on item type and task status:
- Framework: package icon
- Matrix Group: group-by-ref-type icon
- Category Group: tag icon
- Task: status-specific icons with colors

## Testing

The TaskTreeProvider includes comprehensive tests covering:
- All view modes
- Tree structure generation
- Task filtering and grouping
- Item creation and properties
- Status updates and refresh
- Empty state handling

Run tests with:
```bash
npm test test/vscode/ui/tree-view/TaskTreeProvider.test.ts
```
