import * as vscode from "vscode";

import { NoxCommandConfig } from "../frameworks/nox/nox-task-source";

export const DEFAULT_DISCOVERY_EXCLUDES = [
  "**/.git/**",
  "**/.hg/**",
  "**/.svn/**",
  "**/node_modules/**",
  "**/.venv/**",
  "**/venv/**",
  "**/.nox/**",
  "**/build/**",
  "**/dist/**",
];

export function getNoxConfig(resource?: vscode.Uri): NoxCommandConfig {
  const config = vscode.workspace.getConfiguration("taskMosaic.nox", resource);
  return {
    command: config.get<string>("command", "nox"),
    commandArgs: config.get<string[]>("commandArgs", []),
    runnerArgs: config.get<string[]>("runnerArgs", []),
  };
}

export function getDiscoveryConfig(): {
  exclude: string[];
  maxProjects: number;
  autoRefresh: boolean;
} {
  const config = vscode.workspace.getConfiguration("taskMosaic.discovery");
  return {
    exclude: config.get<string[]>("exclude", DEFAULT_DISCOVERY_EXCLUDES),
    maxProjects: config.get<number>("maxProjects", 50),
    autoRefresh: config.get<boolean>("autoRefresh", true),
  };
}

export function getMaxConcurrentExecutions(): number {
  return vscode.workspace
    .getConfiguration("taskMosaic.execution")
    .get<number>("maxConcurrent", 3);
}
