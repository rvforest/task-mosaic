import * as vscode from 'vscode';
import { Task, TaskStatus } from '../../../core/tasks/types';
import { TaskTreeItem } from './TaskTreeItem';
import { TaskTreeItemType, TaskTreeViewMode } from './types';
import { StatusAggregator } from './status-aggregator';

export class TaskGroupingService {
  /**
   * Helper method to sort tasks and create TaskTreeItems consistently
   */
  private sortAndCreateTaskItems(tasks: Task[], createTaskItemFn: (task: Task) => TaskTreeItem): TaskTreeItem[] {
    try {
      return tasks
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(task => createTaskItemFn(task));
    } catch (error) {
      console.error('Error sorting and creating task items:', error);
      return [];
    }
  }

  /**
   * Creates a group status provider function that aggregates the status of child tasks.
   * 
   * @param tasks Array of tasks in the group
   * @param taskStatusProvider Function to get individual task status
   * @returns A function that returns the aggregated status of the group
   */
  private createGroupStatusProvider(
    tasks: Task[], 
    taskStatusProvider: (taskId: string) => TaskStatus
  ): () => TaskStatus {
    return () => {
      const statuses = tasks.map(task => {
        try {
          return taskStatusProvider(task.taskId);
        } catch {
          return 'idle' as TaskStatus;
        }
      });
      return StatusAggregator.aggregateStatuses(statuses);
    };
  }

  /**
   * Get the root items - always grouped by framework, with tasks organized according to view mode
   */
  getRootItems(tasks: Task[], taskStatusProvider?: (taskId: string) => TaskStatus): TaskTreeItem[] {
    try {
      if (!tasks || tasks.length === 0) {
        return [];
      }

      // Always group by framework at the root level
      const frameworks = new Set(tasks.map(task => task.frameworkName));

      return Array.from(frameworks).sort().map(framework => {
        const frameworkTasks = tasks.filter(task => task.frameworkName === framework);
        
        // Create group status provider if task status provider is available
        const groupStatusProvider = taskStatusProvider 
          ? this.createGroupStatusProvider(frameworkTasks, taskStatusProvider)
          : undefined;
        
        return new TaskTreeItem(
          `${framework} (${frameworkTasks.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          TaskTreeItemType.FRAMEWORK,
          framework,
          undefined, // No single task for framework group
          undefined, // No single task status provider for framework group
          groupStatusProvider
        );
      });
    } catch (error) {
      console.error('Error creating root items:', error);
      return [];
    }
  }

  /**
   * Get tasks for a specific framework, grouped according to view mode
   */
  getTasksForFramework(
    tasks: Task[], 
    frameworkName: string, 
    viewMode: TaskTreeViewMode, 
    createTaskItemFn: (task: Task) => TaskTreeItem,
    taskStatusProvider?: (taskId: string) => TaskStatus
  ): TaskTreeItem[] {
    try {
      const frameworkTasks = tasks.filter(task => task.frameworkName === frameworkName);
      
      switch (viewMode) {
        case TaskTreeViewMode.BY_CATEGORY:
          return this.getCategoryGroupsForTasks(frameworkTasks, taskStatusProvider);
        case TaskTreeViewMode.FLAT:
        default:
          // FLAT mode - group by matrix but show tasks at top level
          return this.getMatrixGroupedTasks(frameworkTasks, createTaskItemFn, taskStatusProvider);
      }
    } catch (error) {
      console.error(`Error getting tasks for framework ${frameworkName}:`, error);
      return [];
    }
  }

  /**
   * Group tasks by matrix groups, with task.name as parent and task.taskId as children
   */
  private getMatrixGroupedTasks(tasks: Task[], createTaskItemFn: (task: Task) => TaskTreeItem, taskStatusProvider?: (taskId: string) => TaskStatus): TaskTreeItem[] {
    try {
      const matrixGroups = new Map<string, Task[]>();
      const orphanTasks: Task[] = [];

      // Group tasks by their matrix group (task.name)
      tasks.forEach(task => {
        if (task.matrixGroup) {
          if (!matrixGroups.has(task.matrixGroup)) {
            matrixGroups.set(task.matrixGroup, []);
          }
          matrixGroups.get(task.matrixGroup)!.push(task);
        } else {
          orphanTasks.push(task);
        }
      });

      const items: TaskTreeItem[] = [];

      // Add matrix groups (collapsible with task.name as parent)
      Array.from(matrixGroups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([groupName, groupTasks]) => {
          if (groupTasks.length === 1) {
            // Single task - show as regular task
            items.push(createTaskItemFn(groupTasks[0]));
          } else {
            // Multiple tasks - show as collapsible group
            // Store both the framework and matrix group name for proper filtering during expansion
            const firstTask = groupTasks[0];
            const matrixGroupData = {
              frameworkName: firstTask.frameworkName,
              matrixGroup: groupName
            };
            const groupStatusProvider = taskStatusProvider 
              ? this.createGroupStatusProvider(groupTasks, taskStatusProvider)
              : undefined;
            
            items.push(new TaskTreeItem(
              groupName,
              vscode.TreeItemCollapsibleState.Collapsed,
              TaskTreeItemType.MATRIX_GROUP,
              JSON.stringify(matrixGroupData),
              undefined, // No single task object for the group
              undefined, // No single task status provider
              groupStatusProvider
            ));
          }
        });

      // Add orphan tasks (tasks without matrix groups)
      orphanTasks
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(task => {
          items.push(createTaskItemFn(task));
        });

      return items;
    } catch (error) {
      console.error('Error creating matrix grouped tasks:', error);
      return [];
    }
  }

  /**
   * Group tasks by categories
   */
  private getCategoryGroupsForTasks(tasks: Task[], taskStatusProvider?: (taskId: string) => TaskStatus): TaskTreeItem[] {
    try {
      const categories = new Set<string>();
      
      // Collect all unique categories
      tasks.forEach(task => {
        if (task.categoryGroups) {
          task.categoryGroups.forEach(category => categories.add(category));
        }
      });

      const items: TaskTreeItem[] = [];
      
      // Add category groups
      Array.from(categories).sort().forEach(category => {
        const categoryTasks = tasks.filter(task => 
          task.categoryGroups?.includes(category)
        );
        
        const groupStatusProvider = taskStatusProvider 
          ? this.createGroupStatusProvider(categoryTasks, taskStatusProvider)
          : undefined;
        
        items.push(new TaskTreeItem(
          `${category} (${categoryTasks.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          TaskTreeItemType.CATEGORY_GROUP,
          category,
          undefined, // No single task
          undefined, // No single task status provider
          groupStatusProvider
        ));
      });
      
      // Add tasks without categories
      const orphanTasks = tasks.filter(task => !task.categoryGroups || task.categoryGroups.length === 0);
      if (orphanTasks.length > 0) {
        const orphanGroupStatusProvider = taskStatusProvider 
          ? this.createGroupStatusProvider(orphanTasks, taskStatusProvider)
          : undefined;
        
        items.push(new TaskTreeItem(
          `Uncategorized (${orphanTasks.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          TaskTreeItemType.CATEGORY_GROUP,
          null,
          undefined, // No single task
          undefined, // No single task status provider
          orphanGroupStatusProvider
        ));
      }
      
      return items;
    } catch (error) {
      console.error('Error creating category groups:', error);
      return [];
    }
  }

  /**
   * Get tasks for a specific matrix group
   */
  getTasksForMatrixGroup(tasks: Task[], matrixGroup: string | null, createTaskItemFn: (task: Task) => TaskTreeItem): TaskTreeItem[] {
    try {
      const filteredTasks = matrixGroup 
        ? tasks.filter(task => task.matrixGroup === matrixGroup)
        : tasks.filter(task => !task.matrixGroup);
      
      return this.sortAndCreateTaskItems(filteredTasks, createTaskItemFn);
    } catch (error) {
      console.error(`Error getting tasks for matrix group ${matrixGroup}:`, error);
      return [];
    }
  }

  /**
   * Get tasks for a specific category group
   */
  getTasksForCategoryGroup(tasks: Task[], categoryGroup: string | null, createTaskItemFn: (task: Task) => TaskTreeItem): TaskTreeItem[] {
    try {
      const filteredTasks = categoryGroup 
        ? tasks.filter(task => task.categoryGroups?.includes(categoryGroup))
        : tasks.filter(task => !task.categoryGroups || task.categoryGroups.length === 0);
      
      // Return individual tasks within this category, sorted alphabetically
      return filteredTasks
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(task => createTaskItemFn(task));
    } catch (error) {
      console.error(`Error getting tasks for category group ${categoryGroup}:`, error);
      return [];
    }
  }

  // Legacy methods for compatibility - now redirect to new logic
  getFrameworkGroupItems(tasks: Task[]): TaskTreeItem[] {
    return this.getRootItems(tasks);
  }

  getMatrixGroupItems(tasks: Task[], taskStatusProvider?: (taskId: string) => TaskStatus): TaskTreeItem[] {
    try {
      if (!tasks || !Array.isArray(tasks)) {
        return [];
      }

      const matrixGroups = new Map<string, Task[]>();
      const orphanTasks: Task[] = [];

      // Group all tasks by their matrix group across all frameworks
      tasks.forEach(task => {
        if (task.matrixGroup) {
          if (!matrixGroups.has(task.matrixGroup)) {
            matrixGroups.set(task.matrixGroup, []);
          }
          matrixGroups.get(task.matrixGroup)!.push(task);
        } else {
          orphanTasks.push(task);
        }
      });

      const items: TaskTreeItem[] = [];

      // Add matrix groups
      Array.from(matrixGroups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([groupName, groupTasks]) => {
          const groupStatusProvider = taskStatusProvider 
            ? this.createGroupStatusProvider(groupTasks, taskStatusProvider)
            : undefined;
          
          items.push(new TaskTreeItem(
            `${groupName} (${groupTasks.length})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            TaskTreeItemType.MATRIX_GROUP,
            groupName,
            undefined,
            undefined,
            groupStatusProvider
          ));
        });

      // Add "Other Tasks" group if there are orphan tasks
      if (orphanTasks.length > 0) {
        const orphanGroupStatusProvider = taskStatusProvider 
          ? this.createGroupStatusProvider(orphanTasks, taskStatusProvider)
          : undefined;
        
        items.push(new TaskTreeItem(
          `Other Tasks (${orphanTasks.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          TaskTreeItemType.MATRIX_GROUP,
          null,
          undefined,
          undefined,
          orphanGroupStatusProvider
        ));
      }

      return items;
    } catch (error) {
      console.error('Error creating matrix group items:', error);
      return [];
    }
  }

  getCategoryGroupItems(tasks: Task[], taskStatusProvider?: (taskId: string) => TaskStatus): TaskTreeItem[] {
    try {
      if (!tasks || !Array.isArray(tasks)) {
        return [];
      }

      const categoryGroups = new Map<string, Task[]>();
      const uncategorizedTasks: Task[] = [];

      // Group all tasks by their categories across all frameworks
      tasks.forEach(task => {
        if (task.categoryGroups && task.categoryGroups.length > 0) {
          task.categoryGroups.forEach(category => {
            if (!categoryGroups.has(category)) {
              categoryGroups.set(category, []);
            }
            categoryGroups.get(category)!.push(task);
          });
        } else {
          uncategorizedTasks.push(task);
        }
      });

      const items: TaskTreeItem[] = [];

      // Add category groups sorted alphabetically
      Array.from(categoryGroups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([categoryName, categoryTasks]) => {
          const groupStatusProvider = taskStatusProvider 
            ? this.createGroupStatusProvider(categoryTasks, taskStatusProvider)
            : undefined;
          
          items.push(new TaskTreeItem(
            `${categoryName} (${categoryTasks.length})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            TaskTreeItemType.CATEGORY_GROUP,
            categoryName,
            undefined,
            undefined,
            groupStatusProvider
          ));
        });

      // Add "Uncategorized" group if there are uncategorized tasks
      if (uncategorizedTasks.length > 0) {
        const uncategorizedGroupStatusProvider = taskStatusProvider 
          ? this.createGroupStatusProvider(uncategorizedTasks, taskStatusProvider)
          : undefined;
        
        items.push(new TaskTreeItem(
          `Uncategorized (${uncategorizedTasks.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          TaskTreeItemType.CATEGORY_GROUP,
          null,
          undefined,
          undefined,
          uncategorizedGroupStatusProvider
        ));
      }

      return items;
    } catch (error) {
      console.error('Error creating category group items:', error);
      return [];
    }
  }

  getFlatTaskItems(tasks: Task[], createTaskItemFn: (task: Task) => TaskTreeItem): TaskTreeItem[] {
    try {
      if (!tasks || !Array.isArray(tasks)) {
        return [];
      }

      // In flat mode, return all tasks individually without any grouping
      return tasks
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(task => createTaskItemFn(task));
    } catch (error) {
      console.error('Error creating flat task items:', error);
      return [];
    }
  }
}
