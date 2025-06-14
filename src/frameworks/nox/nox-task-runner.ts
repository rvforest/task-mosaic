import { Task } from "../../core/tasks/types";
import { TaskOptions, CommandResult } from "../../core/execution/types";
import { ShellCommandTaskRunner } from "../../core/task-runners/shell-command-runner";

export class NoxTaskRunner extends ShellCommandTaskRunner {
  name: string = "nox"
  command = "nox";

  getId(): string {
    return "nox";
  }

  protected getCommand(): string {
    return "nox";
  }

  getArgs(task: Task, options: TaskOptions): string[] {
    const args = ["-s", task.taskId];

    if (options.runnerArgs) {
      args.unshift(...options.runnerArgs);
    }
    if (options.taskArgs) {
      args.push("--", ...options.taskArgs);
    }
    return args;
  }
  isSkipped(result: CommandResult): boolean {
    const output = result.stdout + result.stderr;
    return (
      (output.includes("Session") && output.includes("skipped")) ||
      (output.includes("Python interpreter") && output.includes("not found")) ||
      output.includes("Sessions not found")
    );
  }

  isFailed(result: CommandResult): boolean {
    return result.code !== 0;
  }
}
