import { TaskProvider } from "../task-providers/task-provider";
import { TaskRunner } from "../task-runners/task-runner";
import { OutputChannel } from "../types";

export abstract class Framework {
  abstract name: string;

  constructor(
    public provider: TaskProvider,
    public runner: TaskRunner,
    protected outputChannel: OutputChannel,
  ) {}

  abstract getCommand(): string;

  // detect if the provider can handle the given directory
  protected abstract detectInDirectory(directory: string): Promise<boolean>;

  /**
   * Detects the presence of a valid task list by attempting to fetch it.
   *
   * @returns A promise that resolves to `true` if the task list is
   * successfully fetched (i.e., not `null`), otherwise `false`.
   */
  async detect(directoryList: string[]): Promise<boolean> {
    for (const dir of directoryList) {
      if (await this.detectInDirectory(dir)) {
        return true;
      }
    }
    return false;
  }
}
