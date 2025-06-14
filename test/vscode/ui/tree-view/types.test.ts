import { TaskTreeItemType, TaskTreeViewMode } from '../../../../src/vscode/ui/tree-view/types';

describe('Types', () => {
  describe('TaskTreeItemType', () => {
    it('should have all expected values', () => {
      expect(TaskTreeItemType.FRAMEWORK).toBe('framework');
      expect(TaskTreeItemType.MATRIX_GROUP).toBe('matrixGroup');
      expect(TaskTreeItemType.CATEGORY_GROUP).toBe('categoryGroup');
      expect(TaskTreeItemType.TASK).toBe('task');
      expect(TaskTreeItemType.ROOT_FOLDER).toBe('rootFolder');
    });

    it('should be used as contextValue strings', () => {
      // These values are used as VS Code context values for commands
      expect(typeof TaskTreeItemType.FRAMEWORK).toBe('string');
      expect(typeof TaskTreeItemType.MATRIX_GROUP).toBe('string');
      expect(typeof TaskTreeItemType.CATEGORY_GROUP).toBe('string');
      expect(typeof TaskTreeItemType.TASK).toBe('string');
      expect(typeof TaskTreeItemType.ROOT_FOLDER).toBe('string');
    });
  });

  describe('TaskTreeViewMode', () => {
    it('should have all expected values', () => {
      expect(TaskTreeViewMode.BY_CATEGORY).toBe('byCategory');
      expect(TaskTreeViewMode.FLAT).toBe('flat');
    });

    it('should have correct types for all values', () => {
      expect(typeof TaskTreeViewMode.BY_CATEGORY).toBe('string');
      expect(typeof TaskTreeViewMode.FLAT).toBe('string');
    });
  });
});
