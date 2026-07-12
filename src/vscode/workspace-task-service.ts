import * as path from "path";
import * as vscode from "vscode";

import { FrameworkDiscoveryError } from "../core/framework/errors";
import { FrameworkAdapter } from "../core/framework/framework";
import { FrameworkRegistry } from "../core/framework/framework-registry";
import { TaskManager } from "../core/task-manager";
import {
  createProjectKey,
  ProjectDiscoveryResult,
  TaskProject,
} from "../core/tasks/types";
import { getDiscoveryConfig, getFrameworkConfig } from "./configuration";

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
    private readonly registry: FrameworkRegistry,
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
    if (!vscode.workspace.isTrusted) {
      this.taskManager.setUntrusted();
      return;
    }

    this.taskManager.setLoading();
    const { projects, truncated } = await this.findProjects();
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

  private async findProjects(): Promise<{
    projects: TaskProject[];
    truncated: boolean;
  }> {
    const config = getDiscoveryConfig();
    const exclude = this.combineGlobs(config.exclude);
    const found = new Map<string, vscode.Uri>();

    for (const include of config.include) {
      const uris = await vscode.workspace.findFiles(
        include,
        exclude,
        config.maxProjects + 1,
      );
      for (const uri of uris) {
        found.set(uri.toString(), uri);
      }
    }

    const sorted = [...found.values()].sort((left, right) =>
      left.toString().localeCompare(right.toString()),
    );
    const truncated = sorted.length > config.maxProjects;
    const selected = sorted.slice(0, config.maxProjects);
    const projects: TaskProject[] = [];

    for (const configurationUri of selected) {
      const workspaceFolder =
        vscode.workspace.getWorkspaceFolder(configurationUri);
      if (!workspaceFolder) {
        continue;
      }
      const framework = this.frameworkForConfiguration(configurationUri);
      if (!framework) {
        continue;
      }
      const rootUri = vscode.Uri.file(path.dirname(configurationUri.fsPath));
      const relative = path.relative(
        workspaceFolder.uri.fsPath,
        rootUri.fsPath,
      );
      const relativePath =
        relative === "" ? "." : relative.split(path.sep).join("/");
      projects.push({
        key: createProjectKey(
          framework.id,
          workspaceFolder.uri.toString(),
          relativePath,
        ),
        frameworkId: framework.id,
        workspaceUri: workspaceFolder.uri.toString(),
        workspaceName: workspaceFolder.name,
        rootUri: rootUri.toString(),
        rootPath: rootUri.fsPath,
        relativePath,
        configurationUri: configurationUri.toString(),
      });
    }

    return { projects, truncated };
  }

  private async discoverProject(
    project: TaskProject,
  ): Promise<ProjectDiscoveryResult> {
    const framework = this.registry.get(project.frameworkId);
    if (!framework) {
      return {
        project,
        error: {
          code: "unknown",
          message: `Framework '${project.frameworkId}' is not registered.`,
        },
      };
    }
    try {
      const tasks = await framework.discover(
        project,
        getFrameworkConfig(
          project.frameworkId,
          vscode.Uri.parse(project.rootUri),
        ),
      );
      this.output.appendLine(
        `[${framework.id}] Discovered ${tasks.length} task(s) in ${project.rootPath}`,
      );
      return { project, tasks };
    } catch (error: unknown) {
      const discoveryError =
        error instanceof FrameworkDiscoveryError
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
        `[${framework.id}] ${project.rootPath}: ${discoveryError.message}`,
      );
      if (discoveryError.detail) {
        this.output.appendLine(discoveryError.detail);
      }
      return { project, error: discoveryError };
    }
  }

  private frameworkForConfiguration(
    configurationUri: vscode.Uri,
  ): FrameworkAdapter | undefined {
    const fileName = path.basename(configurationUri.fsPath);
    return this.registry
      .getAll()
      .find((framework) => framework.configurationFileNames.includes(fileName));
  }

  private recreateWatchers(): void {
    this.disposeWatchers();
    for (const include of getDiscoveryConfig().include) {
      const watcher = vscode.workspace.createFileSystemWatcher(include);
      this.watchers.push(
        watcher,
        watcher.onDidCreate(() => this.scheduleRefresh()),
        watcher.onDidChange(() => this.scheduleRefresh()),
        watcher.onDidDelete(() => this.scheduleRefresh()),
      );
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
