// Provides all available tasks

import { OutputChannel } from "../types";
import { Task } from "../tasks/types";

export abstract class TaskProvider {
  abstract name: string;

  constructor(protected outputChannel: OutputChannel) {}

  // base command used to get tasks (e.g., `tox`, `nox`, etc.)
  protected abstract getCommand(): string;

  // list all tasks in the given directory
  protected abstract listTasksForDirectory(directory: string): Promise<Task[]>;

  async listTasks(directoryList: string[]): Promise<Task[]> {
    const tasks: Task[] = [];
    for (const directory of directoryList) {
      try {
        const dirTasks = await this.listTasksForDirectory(directory);
        tasks.push(...dirTasks);
      } catch (error) {
        const errorMessage =
          error && typeof error === "object" && "message" in error
            ? (error as { message?: string }).message
            : String(error);
        this.outputChannel.appendLine(
          `Error listing tasks in ${directory}: ${errorMessage}`,
        );
      }
    }
    return tasks;
  }
}
