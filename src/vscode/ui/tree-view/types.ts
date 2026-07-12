export enum TaskTreeViewMode {
  BY_TAG = "byTag",
  BY_MATRIX = "byMatrix",
  FLAT = "flat",
}

export type TaskTreeNodeKind =
  | "workspace"
  | "project"
  | "source"
  | "group"
  | "task"
  | "state";
