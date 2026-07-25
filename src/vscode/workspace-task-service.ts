import * as path from "path";
import * as vscode from "vscode";

import { TaskManager } from "../core/task-manager";
import { TaskSourceDiscoveryError } from "../core/task-source/errors";
import { TaskSource } from "../core/task-source/task-source";
import { TaskSourceRegistry } from "../core/task-source/task-source-registry";
import {
  createProjectKey,
  ProjectDiscoveryResult,
  TaskProject,
} from "../core/tasks/types";
import { getDiscoveryConfig } from "./configuration";

const REFRESH_DEBOUNCE_MS = 300;
const DISCOVERY_CONCURRENCY = 4;

export class WorkspaceTaskService implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private watchers: vscode.Disposable[] = [];
  private refreshPromise?: Promise<void>;
  private refreshRequested = false;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;

  constructor(
    private readonly taskManager: TaskManager,
    private readonly registry: TaskSourceRegistry,
    private readonly output: vscode.OutputChannel,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() =>
        this.scheduleRefresh(true),
      ),
      vscode.workspace.onDidGrantWorkspaceTrust(() =>
        this.scheduleRefresh(true),
      ),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("taskMosaic")) {
          this.recreateWatchers();
          this.scheduleRefresh(true);
        }
      }),
    );
    this.recreateWatchers();
  }

  async initialize(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.refreshPromise) {
      this.refreshRequested = true;
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      do {
        this.refreshRequested = false;
        await this.refreshOnce();
      } while (this.refreshRequested && !this.disposed);
    })().finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  scheduleRefresh(force = false): void {
    if (this.disposed || (!force && !getDiscoveryConfig().autoRefresh)) {
      return;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  dispose(): void {
    this.disposed = true;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.disposeWatchers();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async refreshOnce(): Promise<void> {
    const availableSources = this.registry
      .getAll()
      .filter(
        (source) =>
          vscode.workspace.isTrusted || !source.trust.discovery,
      );
    if (availableSources.length === 0 && !vscode.workspace.isTrusted) {
      this.taskManager.setUntrusted();
      return;
    }

    this.taskManager.setLoading();
    const { projects, truncated } =
      await this.findProjects(availableSources);
    const results = await this.mapWithConcurrency(
      projects,
      DISCOVERY_CONCURRENCY,
      (project) => this.discoverProject(project),
    );
    this.taskManager.applyDiscoveryResults(
      results,
      new Set(projects.map((project) => project.key)),
      truncated,
    );
  }

  private async findProjects(
    sources: TaskSource[],
  ): Promise<{ projects: TaskProject[]; truncated: boolean }> {
    const config = getDiscoveryConfig();
    const exclude = this.combineGlobs(config.exclude);
    const projects = new Map<string, TaskProject>();

    for (const source of sources) {
      if (source.projectDiscovery.kind === "workspace") {
        for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
          const project = this.workspaceProject(source, workspaceFolder);
          projects.set(project.key, project);
        }
      }
    }

    for (const source of sources) {
      if (source.projectDiscovery.kind === "configurationFiles") {
        for (const pattern of source.projectDiscovery.patterns) {
          const uris = await vscode.workspace.findFiles(
            pattern,
            exclude,
            config.maxProjects + 1,
          );
          for (const configurationUri of uris) {
            const project = this.configurationProject(
              source,
              configurationUri,
            );
            if (project) {
              projects.set(project.key, project);
            }
          }
        }
      }
    }

    const sorted = [...projects.values()].sort((left, right) =>
      left.key.localeCompare(right.key),
    );
    return {
      projects: sorted.slice(0, config.maxProjects),
      truncated: sorted.length > config.maxProjects,
    };
  }

  private workspaceProject(
    source: TaskSource,
    workspaceFolder: vscode.WorkspaceFolder,
  ): TaskProject {
    return {
      key: createProjectKey(source.id, workspaceFolder.uri.toString(), "."),
      sourceId: source.id,
      workspaceUri: workspaceFolder.uri.toString(),
      workspaceName: workspaceFolder.name,
      rootUri: workspaceFolder.uri.toString(),
      rootPath: workspaceFolder.uri.fsPath,
      relativePath: ".",
    };
  }

  private configurationProject(
    source: TaskSource,
    configurationUri: vscode.Uri,
  ): TaskProject | undefined {
    const workspaceFolder =
      vscode.workspace.getWorkspaceFolder(configurationUri);
    if (!workspaceFolder) {
      return undefined;
    }
    const rootUri = configurationUri.with({
      path: path.posix.dirname(configurationUri.path),
    });
    const relative = path.relative(
      workspaceFolder.uri.fsPath,
      rootUri.fsPath,
    );
    const relativePath =
      relative === "" ? "." : relative.split(path.sep).join("/");
    return {
      key: createProjectKey(
        source.id,
        workspaceFolder.uri.toString(),
        relativePath,
      ),
      sourceId: source.id,
      workspaceUri: workspaceFolder.uri.toString(),
      workspaceName: workspaceFolder.name,
      rootUri: rootUri.toString(),
      rootPath: rootUri.fsPath,
      relativePath,
      configurationUri: configurationUri.toString(),
    };
  }

  private async discoverProject(
    project: TaskProject,
  ): Promise<ProjectDiscoveryResult> {
    const source = this.registry.get(project.sourceId);
    if (!source) {
      return {
        project,
        error: {
          code: "unknown",
          message: `Task source '${project.sourceId}' is not registered.`,
        },
      };
    }
    try {
      const tasks = await source.discover(project);
      this.output.appendLine(
        `[${source.id}] Discovered ${tasks.length} task(s) in ${project.rootPath}`,
      );
      return { project, tasks };
    } catch (error: unknown) {
      const discoveryError =
        error instanceof TaskSourceDiscoveryError
          ? {
              code: error.code,
              message: error.message,
              detail: error.detail,
            }
          : {
              code: "unknown" as const,
              message: "Unexpected task discovery failure.",
              detail: error instanceof Error ? error.message : String(error),
            };
      this.output.appendLine(
        `[${source.id}] ${project.rootPath}: ${discoveryError.message}`,
      );
      if (discoveryError.detail) {
        this.output.appendLine(discoveryError.detail);
      }
      return { project, error: discoveryError };
    }
  }

  private recreateWatchers(): void {
    this.disposeWatchers();
    for (const source of this.registry.getAll()) {
      if (source.projectDiscovery.kind === "configurationFiles") {
        for (const pattern of source.projectDiscovery.patterns) {
          const watcher = vscode.workspace.createFileSystemWatcher(pattern);
          this.watchers.push(
            watcher,
            watcher.onDidCreate(() => this.scheduleRefresh()),
            watcher.onDidChange(() => this.scheduleRefresh()),
            watcher.onDidDelete(() => this.scheduleRefresh()),
          );
        }
      }
    }
  }

  private disposeWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
  }

  private combineGlobs(globs: string[]): string | undefined {
    if (globs.length === 0) {
      return undefined;
    }
    return globs.length === 1 ? globs[0] : `{${globs.join(",")}}`;
  }

  private async mapWithConcurrency<T, R>(
    values: T[],
    limit: number,
    operation: (value: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(values.length);
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(limit, values.length) },
      async () => {
        while (nextIndex < values.length) {
          const index = nextIndex++;
          results[index] = await operation(values[index]);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }
}
