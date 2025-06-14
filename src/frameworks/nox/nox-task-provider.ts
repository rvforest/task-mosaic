import { execFile } from "child_process";
import { promisify } from "util";

import { Task } from "../../core/tasks/types";
import { TaskProvider } from "../../core/task-providers/task-provider";
import { NoxListSessionsJson } from "./types";

const execFileAsync = promisify(execFile);

export class NoxTaskProvider extends TaskProvider {
  name: string = "nox";
  protected getCommand(): string {
    return "nox";
  }

  protected async listTasksForDirectory(directory: string): Promise<Task[]> {
    try {
      // Fetch the plain text session list
      const output = await this.fetchPlainTextSessionList(directory);

      // Parse session names from the plain text output
      const { defaultSessions, nonDefaultSessions } =
        this.parseSessionNamesFromPlainText(output);

      // Create tasks for each session
      const tasks: Task[] = [];
      tasks.push(
        ...(await this.createTasksFromSessionNames(
          defaultSessions,
          directory,
          true,
        )),
      );
      tasks.push(
        ...(await this.createTasksFromSessionNames(
          nonDefaultSessions,
          directory,
          false,
        )),
      );

      return tasks;
    } catch (error) {
      throw error instanceof Error
        ? new Error(`Error getting nox tasks: ${error.message}`)
        : new Error("An unknown error occurred while listing nox tasks.");
    }
  }

  // Returns the plain text output of `nox --list-sessions`
  private async fetchPlainTextSessionList(directory: string): Promise<string> {
    this.outputChannel.appendLine(`Fetching nox sessions from ${directory}...`);
    const nox = this.getCommand();
    try {
      const { stdout } = await execFileAsync(nox, ["--list-sessions"], {
        cwd: directory,
      });
      return stdout;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw error;
      }
      throw new Error(
        `Failed to fetch nox sessions: ${error.message || error}`,
      );
    }
  }

  /**
   * Parse session names from the plain text output of `nox --list-sessions`
   * Returns session names with their default status
   */
  private parseSessionNamesFromPlainText(output: string): {
    defaultSessions: string[];
    nonDefaultSessions: string[];
  } {
    const lines = output.split("\n");
    let defaultSessions: string[] = [];
    let nonDefaultSessions: string[] = [];

    for (const line of lines) {
      // Match any number of spaces after * or -
      const defaultMatch = line.match(/^\*\s*(.+?)(?:\s*->\s*.*)?$/);
      const nonDefaultMatch = line.match(/^-\s*(.+?)(?:\s*->\s*.*)?$/);

      if (defaultMatch) {
        defaultSessions.push(defaultMatch[1].trim());
      } else if (nonDefaultMatch) {
        nonDefaultSessions.push(nonDefaultMatch[1].trim());
      }
    }

    return {
      defaultSessions,
      nonDefaultSessions,
    };
  }

  /**
   * Creates Task objects from session names.
   *
   * @param sessionNames - Array of session names to create tasks for.
   * @param isDefault - Whether the tasks are for default sessions.
   * @returns Array of Task objects.
   */
  private async createTasksFromSessionNames(
    sessionNames: string[],
    directory: string,
    isDefault: boolean,
  ): Promise<Task[]> {
    if (sessionNames.length === 0) {
      return [];
    }

    const nox = this.getCommand();
    try {
      const result = await execFileAsync(
        nox,
        ["--list-sessions", "--json", "-s", ...sessionNames],
        { cwd: directory },
      );
      const stdout = result && typeof result === "object" ? result.stdout : "";
      const sessionsList = JSON.parse(stdout) as NoxListSessionsJson[];
      return sessionsList.map((session) =>
        this.createTaskFromSession(session, directory, isDefault),
      );
    } catch (error: any) {
      if (error.code === "ENOENT") {
        this.outputChannel.appendLine(
          `Nox executable not found in ${directory}.`,
        );
        return [];
      } else if (error.name === "SyntaxError") {
        this.outputChannel.appendLine(
          `Error parsing JSON from nox: ${error.message}`,
        );
      } else {
        this.outputChannel.appendLine(
          `Error getting nox session details: ${error.message || error}`,
        );
      }
      // Throw so that listTasksForDirectory can catch and wrap the error
      throw new Error(`Failed to fetch nox sessions: ${error.message || error}`);
    }
  }

  private createTaskFromSession(
    session: NoxListSessionsJson,
    directory: string,
    isDefault: boolean,
  ): Task {
    // Validate call_spec at runtime
    let callSpec: Record<string, string> = {};
    if (
      session.call_spec &&
      typeof session.call_spec === "object" &&
      !Array.isArray(session.call_spec)
    ) {
      for (const [k, v] of Object.entries(session.call_spec)) {
        if (typeof v === "string") {
          callSpec[k] = v;
        }
      }
    }

    const hasCallSpec = callSpec && Object.keys(callSpec).length > 0;
    const hasPython = typeof session.python === "string";

    // Construct the task name.
    let name = "";
    if (typeof session.python === "string") {
      name = session.python;
    }
    if (hasCallSpec) {
      name += this.formatCallSpec(callSpec);
    }
    if (name === "") {
      name = session.name;
    }

    // Determine matrixGroup - if no python and empty call_spec, it's null
    const matrixGroup = !hasPython && !hasCallSpec ? null : session.name;

    return {
      taskId: session.session,
      name,
      cwd: directory,
      description: session.description,
      frameworkName: this.name,
      parameters: callSpec,
      categoryGroups: session.tags,
      matrixGroup,
      isDefault,
    };
  }

  /**
   * Formats the call_spec object as a string for display.
   */
  private formatCallSpec(callSpec: Record<string, string>): string {
    const parts = Object.entries(callSpec)
      .map(([key, value]) => `${key}='${value}'`)
      .join(", ");
    return `(${parts})`;
  }
}
