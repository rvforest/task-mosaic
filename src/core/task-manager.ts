import {
  DiscoveryError,
  DiscoveryState,
  DiscoveredTask,
  ProjectDiscoveryResult,
  ProjectKey,
  TaskKey,
  TaskProject,
  TaskSourceId,
  TaskStatus,
} from "./tasks/types";

type Listener = () => void;

export class TaskManager {
  private tasks = new Map<TaskKey, DiscoveredTask>();
  private projects = new Map<ProjectKey, TaskProject>();
  private errors = new Map<ProjectKey, DiscoveryError>();
  private statuses = new Map<TaskKey, TaskStatus>();
  private listeners = new Set<Listener>();
  private phase: DiscoveryState["phase"] = "idle";
  private truncated = false;

  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setLoading(): void {
    this.phase = "loading";
    this.emit();
  }

  setUntrusted(): void {
    this.phase = "untrusted";
    this.tasks.clear();
    this.projects.clear();
    this.errors.clear();
    this.statuses.clear();
    this.emit();
  }

  applyDiscoveryResults(
    results: ProjectDiscoveryResult[],
    currentProjectKeys: Set<ProjectKey>,
    truncated: boolean,
  ): void {
    for (const key of [...this.projects.keys()]) {
      if (!currentProjectKeys.has(key)) {
        this.projects.delete(key);
        this.errors.delete(key);
        for (const task of this.tasks.values()) {
          if (task.projectKey === key) {
            this.tasks.delete(task.key);
            this.statuses.delete(task.key);
          }
        }
      }
    }

    for (const result of results) {
      this.projects.set(result.project.key, result.project);
      if ("error" in result) {
        this.errors.set(result.project.key, result.error);
        continue;
      }

      this.errors.delete(result.project.key);
      const previousKeys: TaskKey[] = [];
      for (const task of [...this.tasks.values()]) {
        if (task.projectKey === result.project.key) {
          previousKeys.push(task.key);
          this.tasks.delete(task.key);
        }
      }
      for (const task of result.tasks ?? []) {
        this.tasks.set(task.key, task);
      }
      const currentKeys = new Set((result.tasks ?? []).map((task) => task.key));
      for (const previousKey of previousKeys) {
        if (!currentKeys.has(previousKey)) {
          this.statuses.delete(previousKey);
        }
      }
    }

    this.phase = "ready";
    this.truncated = truncated;
    this.emit();
  }

  getDiscoveryState(): DiscoveryState {
    return {
      phase: this.phase,
      projects: [...this.projects.values()],
      errors: new Map(this.errors),
      truncated: this.truncated,
    };
  }

  getTask(key: TaskKey): DiscoveredTask | undefined {
    return this.tasks.get(key);
  }

  getProject(key: ProjectKey): TaskProject | undefined {
    return this.projects.get(key);
  }

  getAllTasks(): DiscoveredTask[] {
    return [...this.tasks.values()];
  }

  getTasksForProject(projectKey: ProjectKey): DiscoveredTask[] {
    return this.getAllTasks().filter((task) => task.projectKey === projectKey);
  }

  getTaskStatus(key: TaskKey): TaskStatus {
    return this.statuses.get(key) ?? "idle";
  }

  setTaskStatus(key: TaskKey, status: TaskStatus): void {
    this.statuses.set(key, status);
    this.emit();
  }

  findTasks(criteria: {
    workspaceUri?: string;
    projectKey?: ProjectKey;
    sourceId?: TaskSourceId;
    group?: { kind: string; id: string };
    role?: string;
  }): DiscoveredTask[] {
    return this.getAllTasks().filter((task) => {
      const project = this.projects.get(task.projectKey);
      return (
        (!criteria.workspaceUri ||
          project?.workspaceUri === criteria.workspaceUri) &&
        (!criteria.projectKey || task.projectKey === criteria.projectKey) &&
        (!criteria.sourceId || task.sourceId === criteria.sourceId) &&
        (!criteria.group ||
          task.groups.some(
            (group) =>
              group.kind === criteria.group?.kind &&
              group.id === criteria.group.id,
          )) &&
        (!criteria.role || task.roles.includes(criteria.role))
      );
    });
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
