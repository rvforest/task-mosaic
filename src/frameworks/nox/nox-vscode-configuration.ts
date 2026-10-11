import * as vscode from "vscode";

import type { NoxCommandConfig } from "./nox-task-source";

export function getNoxConfig(resource?: vscode.Uri): NoxCommandConfig {
  const config = vscode.workspace.getConfiguration("taskMosaic.nox", resource);
  return {
    command: config.get<string>("command", "nox"),
    commandArgs: config.get<string[]>("commandArgs", []),
    runnerArgs: config.get<string[]>("runnerArgs", []),
  };
}
