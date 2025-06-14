import { StatusAggregator } from '../../../../src/vscode/ui/tree-view/status-aggregator';
import { TaskStatus } from '../../../../src/core/tasks/types';

describe('StatusAggregator', () => {
  describe('aggregateStatuses', () => {
    it('should return idle for empty array', () => {
      const result = StatusAggregator.aggregateStatuses([]);
      expect(result).toBe('idle');
    });

    it('should return running when any task is running', () => {
      const statuses: TaskStatus[] = ['idle', 'completed', 'running', 'pending'];
      const result = StatusAggregator.aggregateStatuses(statuses);
      expect(result).toBe('running');
    });

    it('should return pending when no running but has pending', () => {
      const statuses: TaskStatus[] = ['idle', 'completed', 'pending'];
      const result = StatusAggregator.aggregateStatuses(statuses);
      expect(result).toBe('pending');
    });

    it('should return failed when no running/pending but has failed', () => {
      const statuses: TaskStatus[] = ['idle', 'completed', 'failed'];
      const result = StatusAggregator.aggregateStatuses(statuses);
      expect(result).toBe('failed');
    });

    it('should return cancelled when no running/pending/failed but has cancelled', () => {
      const statuses: TaskStatus[] = ['idle', 'completed', 'cancelled'];
      const result = StatusAggregator.aggregateStatuses(statuses);
      expect(result).toBe('cancelled');
    });

    it('should return skipped when no running/pending/failed/cancelled but has skipped', () => {
      const statuses: TaskStatus[] = ['idle', 'completed', 'skipped'];
      const result = StatusAggregator.aggregateStatuses(statuses);
      expect(result).toBe('skipped');
    });

    it('should return completed only when all tasks are completed', () => {
      const statuses: TaskStatus[] = ['completed', 'completed', 'completed'];
      const result = StatusAggregator.aggregateStatuses(statuses);
      expect(result).toBe('completed');
    });

    it('should not return completed when mixed with other statuses', () => {
      const statuses: TaskStatus[] = ['completed', 'idle', 'completed'];
      const result = StatusAggregator.aggregateStatuses(statuses);
      expect(result).toBe('idle'); // Should return the highest priority non-completed status
    });

    it('should return idle when only idle statuses', () => {
      const statuses: TaskStatus[] = ['idle', 'idle', 'idle'];
      const result = StatusAggregator.aggregateStatuses(statuses);
      expect(result).toBe('idle');
    });
  });

  describe('shouldShowStatusIndicator', () => {
    it('should return false for idle status', () => {
      expect(StatusAggregator.shouldShowStatusIndicator('idle')).toBe(false);
    });

    it('should return true for non-idle statuses', () => {
      expect(StatusAggregator.shouldShowStatusIndicator('running')).toBe(true);
      expect(StatusAggregator.shouldShowStatusIndicator('pending')).toBe(true);
      expect(StatusAggregator.shouldShowStatusIndicator('completed')).toBe(true);
      expect(StatusAggregator.shouldShowStatusIndicator('failed')).toBe(true);
      expect(StatusAggregator.shouldShowStatusIndicator('cancelled')).toBe(true);
      expect(StatusAggregator.shouldShowStatusIndicator('skipped')).toBe(true);
    });
  });

  describe('getStatusDescription', () => {
    it('should return correct description for single task', () => {
      expect(StatusAggregator.getStatusDescription('running', 1)).toBe('1 task - one or more running');
      expect(StatusAggregator.getStatusDescription('completed', 1)).toBe('1 task - all completed');
    });

    it('should return correct description for multiple tasks', () => {
      expect(StatusAggregator.getStatusDescription('running', 3)).toBe('3 tasks - one or more running');
      expect(StatusAggregator.getStatusDescription('completed', 3)).toBe('3 tasks - all completed');
    });

    it('should return correct description for all status types', () => {
      expect(StatusAggregator.getStatusDescription('pending', 2)).toBe('2 tasks - one or more pending');
      expect(StatusAggregator.getStatusDescription('failed', 2)).toBe('2 tasks - one or more failed');
      expect(StatusAggregator.getStatusDescription('cancelled', 2)).toBe('2 tasks - one or more cancelled');
      expect(StatusAggregator.getStatusDescription('skipped', 2)).toBe('2 tasks - one or more skipped');
      expect(StatusAggregator.getStatusDescription('idle', 2)).toBe('2 tasks - ready to run');
    });
  });
});