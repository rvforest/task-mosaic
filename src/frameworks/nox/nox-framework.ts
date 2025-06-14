import { Framework } from "../../core/framework/framework";
import { OutputChannel } from "../../core/types";
import { NoxTaskProvider } from "./nox-task-provider";
import { NoxTaskRunner } from "./nox-task-runner";

export class NoxFramework extends Framework {
  name: string = "nox";

  constructor(outputChannel: OutputChannel) {
    const provider = new NoxTaskProvider(outputChannel);
    const runner = new NoxTaskRunner(outputChannel);
    super(provider, runner, outputChannel);
  }

  getCommand(): string {
    return "nox";
  }

  protected async detectInDirectory(directory: string): Promise<boolean> {
    try {
      await this.provider.listTasks([directory]);
      return true;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        this.outputChannel.appendLine(
          `Nox executable not found in ${directory}.`,
        );
      } else {
        const errorMessage =
          error && typeof error === "object" && "message" in error
            ? (error as { message: string }).message
            : String(error);
        this.outputChannel.appendLine(
          `Nox not detected in ${directory}: ${errorMessage}`,
        );
      }
      return false;
    }
  }
}
