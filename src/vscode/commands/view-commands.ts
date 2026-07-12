import * as vscode from "vscode";

import { TaskTreeProvider } from "../ui/tree-view/TaskTreeProvider";
import { TaskTreeViewMode } from "../ui/tree-view/types";
import { WorkspaceTaskService } from "../workspace-task-service";

export class ViewCommands {
  constructor(
    private readonly workspaceTasks: WorkspaceTaskService,
    private readonly treeProvider: TaskTreeProvider,
    private readonly output: vscode.OutputChannel,
  ) {}

  registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand("taskMosaic.refreshTasks", async () => {
        await this.workspaceTasks.refresh();
      }),
      vscode.commands.registerCommand("taskMosaic.selectViewMode", () =>
        this.selectViewMode(),
      ),
      vscode.commands.registerCommand("taskMosaic.showOutput", () =>
        this.output.show(),
      ),
      vscode.commands.registerCommand("taskMosaic.configureNox", () =>
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "@ext:taskmosaic taskMosaic.nox",
        ),
      ),
    );
  }

  private async selectViewMode(): Promise<void> {
    const choices: Array<vscode.QuickPickItem & { mode: TaskTreeViewMode }> = [
      { label: "By Tag", mode: TaskTreeViewMode.BY_TAG },
      { label: "By Matrix", mode: TaskTreeViewMode.BY_MATRIX },
      { label: "Flat", mode: TaskTreeViewMode.FLAT },
    ];
    const selected = await vscode.window.showQuickPick(choices, {
      placeHolder: "Select task grouping",
    });
    if (selected) {
      await this.treeProvider.setViewMode(selected.mode);
    }
  }
}
