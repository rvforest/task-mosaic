// Defines the cross-runner interface for task discovery and execution.
import { Task } from "../tasks/types";
import { TaskStatus } from "../tasks/types";
import { OutputChannel } from "../types";
import { TaskOptions } from "../execution/types";

export abstract class TaskRunner {
  constructor(protected outputChannel: OutputChannel) {}
  abstract name: string; // returns "nox", "tox", etc.
  async runTask(task: Task, options: TaskOptions): Promise<TaskStatus> {
    const result_status = await this.executeTask(task, options);
    return result_status;
  }
  protected abstract executeTask(
    task: Task,
    options: TaskOptions,
  ): Promise<TaskStatus>;
}
