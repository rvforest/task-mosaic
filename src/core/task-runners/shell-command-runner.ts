// Runner that executes tasks using shell commands
import { spawn } from "child_process";
import { Task } from "../tasks/types";
import { TaskRunner } from "./task-runner";
import { TaskStatus } from "../tasks/types";
import { CommandResult, TaskOptions } from "../execution/types";

export abstract class ShellCommandTaskRunner extends TaskRunner {
  protected abstract getCommand(): string; // getter for the task runner command
  abstract getArgs(task: Task, options: TaskOptions): string[];
  abstract isSkipped(result: CommandResult): boolean;
  abstract isFailed(result: CommandResult): boolean;

  async executeTask(task: Task, options: TaskOptions): Promise<TaskStatus> {
    const command = this.getCommand();
    const args = this.getArgs(task, options);

    const result = await this.runProcess(command, args, task.cwd);

    this.outputChannel.appendLine(
      `[${this.name}] Task exited with code ${result.code}`,
    );
    if (this.isSkipped(result)) {
      this.outputChannel.appendLine(`[${this.name}] Task skipped.`);
      return "skipped";
    }
    if (this.isFailed(result)) {
      return "failed";
    }
    return "completed";
  }

  private runProcess(
    command: string,
    args: string[],
    cwd?: string,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const proc = spawn(command, args, { cwd });
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        this.outputChannel.append(text);
      });

      proc.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        this.outputChannel.append(text);
      });

      proc.on("close", (code: number) => {
        resolve({ stdout: stdout, stderr: stderr, code: code });
      });
    });
  }
}
