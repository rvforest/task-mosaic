import { TaskSource } from "./task-source";
import { TaskSourceId } from "../tasks/types";

export class TaskSourceRegistry {
  private readonly sources = new Map<TaskSourceId, TaskSource>();

  register(source: TaskSource): void {
    if (this.sources.has(source.id)) {
      throw new Error(`Task source '${source.id}' is already registered.`);
    }
    this.sources.set(source.id, source);
  }

  get(id: TaskSourceId): TaskSource | undefined {
    return this.sources.get(id);
  }

  getAll(): TaskSource[] {
    return [...this.sources.values()];
  }

  clear(): void {
    this.sources.clear();
  }
}
