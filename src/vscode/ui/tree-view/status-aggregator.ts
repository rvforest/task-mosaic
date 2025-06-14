import { TaskStatus } from '../../../core/tasks/types';

/**
 * Utility class for aggregating task statuses up the tree hierarchy.
 * Implements VS Code test browser-like behavior where parent groups reflect
 * the most significant status of their children.
 */
export class StatusAggregator {
  /**
   * Priority order for task statuses when aggregating.
   * Higher numbers indicate higher priority.
   */
  private static readonly STATUS_PRIORITY: Record<TaskStatus, number> = {
    'running': 6,      // Highest priority - always bubble up
    'pending': 5,      // High priority - shows work is queued
    'failed': 4,       // High priority - indicates problems
    'cancelled': 3,    // Medium priority
    'skipped': 2,      // Low priority
    'completed': 1,    // Only show if all children are completed
    'idle': 0          // Lowest priority - default state
  };

  /**
   * Aggregates multiple task statuses into a single representative status.
   * 
   * Rules:
   * - If any child is running → return running
   * - If any child is pending (and none running) → return pending  
   * - If any child is failed (and none running/pending) → return failed
   * - If any child is cancelled (and none running/pending/failed) → return cancelled
   * - If any child is skipped (and none running/pending/failed/cancelled) → return skipped
   * - If all children are completed → return completed
   * - Otherwise → return idle
   * 
   * @param statuses Array of child task statuses to aggregate
   * @returns The aggregated status representing the group
   */
  static aggregateStatuses(statuses: TaskStatus[]): TaskStatus {
    if (!statuses || statuses.length === 0) {
      return 'idle';
    }

    // Find the status with the highest priority
    let maxPriority = -1;
    let aggregatedStatus: TaskStatus = 'idle';

    for (const status of statuses) {
      const priority = this.STATUS_PRIORITY[status];
      if (priority > maxPriority) {
        maxPriority = priority;
        aggregatedStatus = status;
      }
    }

    // Special case: if all statuses are 'completed', return 'completed'
    // This ensures that a group only shows 'completed' when ALL children are completed
    if (aggregatedStatus === 'completed') {
      const allCompleted = statuses.every(status => status === 'completed');
      if (!allCompleted) {
        // If not all are completed, find the next highest priority status
        const nonCompletedStatuses = statuses.filter(status => status !== 'completed');
        if (nonCompletedStatuses.length > 0) {
          return this.aggregateStatuses(nonCompletedStatuses);
        }
      }
    }

    return aggregatedStatus;
  }

  /**
   * Determines if a status should be visually represented in the UI.
   * For example, 'idle' status might not need an icon.
   * 
   * @param status The task status to check
   * @returns true if the status should be visually indicated
   */
  static shouldShowStatusIndicator(status: TaskStatus): boolean {
    return status !== 'idle';
  }

  /**
   * Gets a human-readable description of what an aggregated status means.
   * 
   * @param status The aggregated status
   * @param childCount Number of children that contributed to this status
   * @returns A descriptive string explaining the status
   */
  static getStatusDescription(status: TaskStatus, childCount: number): string {
    switch (status) {
      case 'running':
        return `${childCount} task${childCount === 1 ? '' : 's'} - one or more running`;
      case 'pending':
        return `${childCount} task${childCount === 1 ? '' : 's'} - one or more pending`;
      case 'failed':
        return `${childCount} task${childCount === 1 ? '' : 's'} - one or more failed`;
      case 'cancelled':
        return `${childCount} task${childCount === 1 ? '' : 's'} - one or more cancelled`;
      case 'skipped':
        return `${childCount} task${childCount === 1 ? '' : 's'} - one or more skipped`;
      case 'completed':
        return `${childCount} task${childCount === 1 ? '' : 's'} - all completed`;
      case 'idle':
      default:
        return `${childCount} task${childCount === 1 ? '' : 's'} - ready to run`;
    }
  }
}