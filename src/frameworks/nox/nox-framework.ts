import { execFile } from "child_process";
import * as fs from "fs";
import { promisify } from "util";

import { FrameworkDiscoveryError } from "../../core/framework/errors";
import {
  ExecutionSpec,
  ExecutionOutcome,
  FrameworkAdapter,
  FrameworkCommandConfig,
} from "../../core/framework/framework";
import {
  createTaskKey,
  Task,
  TaskProject,
  TaskRunOptions,
} from "../../core/tasks/types";
import { NoxListSessionsJson } from "./types";

const execFileAsync = promisify(execFile);
const MINIMUM_NOX_VERSION = [2026, 4, 10] as const;
const DISCOVERY_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

type CommandExecutor = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    timeout: number;
    maxBuffer: number;
    windowsHide: boolean;
  },
) => Promise<{ stdout: string; stderr?: string }>;

interface ProcessError extends Error {
  code?: string | number;
  killed?: boolean;
  stderr?: string;
}

export class NoxFramework implements FrameworkAdapter {
  readonly id = "nox";
  readonly displayName = "Nox";
  readonly configurationFileNames = ["noxfile.py"] as const;

  constructor(
    private readonly executeCommand: CommandExecutor = execFileAsync,
  ) {}

  async discover(
    project: TaskProject,
    config: FrameworkCommandConfig,
  ): Promise<Task[]> {
    const versionResult = await this.run(
      config,
      ["--version"],
      project.rootPath,
    );
    const version = versionResult.stdout || versionResult.stderr || "";
    this.assertSupportedVersion(version.trim());

    const defaults = this.parseSessions(
      (await this.run(config, ["--list-sessions", "--json"], project.rootPath))
        .stdout,
    );
    const allSessions = this.parseSessions(
      (
        await this.run(
          config,
          ["--list-sessions", "--json", "-k", "True"],
          project.rootPath,
        )
      ).stdout,
    );
    const defaultIds = new Set(defaults.map((session) => session.session));

    return allSessions.map((session) =>
      this.createTask(session, project, defaultIds.has(session.session)),
    );
  }

  createExecution(
    task: Task,
    project: TaskProject,
    options: TaskRunOptions,
    config: FrameworkCommandConfig,
    reportPath: string,
  ): ExecutionSpec {
    return {
      command: config.command,
      args: [
        ...config.commandArgs,
        ...config.runnerArgs,
        ...(options.runnerArgs ?? []),
        "--report",
        reportPath,
        "-s",
        task.frameworkTaskId,
        ...((options.taskArgs?.length ?? 0) > 0
          ? ["--", ...(options.taskArgs ?? [])]
          : []),
      ],
      cwd: project.rootPath,
    };
  }

  async interpretResult(
    reportPath: string,
    executionStartedAt: Date,
  ): Promise<ExecutionOutcome | undefined> {
    try {
      const stat = await fs.promises.stat(reportPath);
      if (stat.mtimeMs + 1000 < executionStartedAt.getTime()) {
        return undefined;
      }
      const value = JSON.parse(
        await fs.promises.readFile(reportPath, "utf8"),
      ) as {
        sessions?: Array<{ result?: unknown }>;
      };
      const result = value.sessions?.[0]?.result;
      if (result === "success") {
        return { status: "succeeded" };
      }
      if (result === "skipped") {
        return { status: "skipped" };
      }
      if (typeof result === "string") {
        return { status: "failed", reason: `Nox reported '${result}'.` };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async run(
    config: FrameworkCommandConfig,
    args: string[],
    cwd: string,
  ): Promise<{ stdout: string; stderr?: string }> {
    try {
      const result = await this.executeCommand(
        config.command,
        [...config.commandArgs, ...args],
        {
          cwd,
          timeout: DISCOVERY_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
          windowsHide: true,
        },
      );
      return result;
    } catch (error: unknown) {
      const processError = error as ProcessError;
      if (processError.code === "ENOENT") {
        throw new FrameworkDiscoveryError(
          "missingExecutable",
          `Nox command '${config.command}' was not found.`,
        );
      }
      if (
        processError.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
        processError.message?.includes("maxBuffer")
      ) {
        throw new FrameworkDiscoveryError(
          "outputLimit",
          "Nox discovery produced more than 10 MiB of output.",
        );
      }
      if (processError.killed || processError.code === "ETIMEDOUT") {
        throw new FrameworkDiscoveryError(
          "timeout",
          "Nox discovery exceeded the 30 second timeout.",
        );
      }
      throw new FrameworkDiscoveryError(
        "invalidConfiguration",
        "Nox could not load this project.",
        processError.stderr || processError.message,
      );
    }
  }

  private assertSupportedVersion(rawVersion: string): void {
    const match = /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\D.*)?$/.exec(rawVersion);
    if (!match) {
      throw new FrameworkDiscoveryError(
        "unsupportedVersion",
        `Unable to parse Nox version '${rawVersion}'.`,
      );
    }
    const version = match.slice(1, 4).map(Number);
    const supported =
      version.some((part, index) => {
        const minimumPart = MINIMUM_NOX_VERSION[index];
        const previousEqual = version
          .slice(0, index)
          .every(
            (value, previousIndex) =>
              value === MINIMUM_NOX_VERSION[previousIndex],
          );
        return previousEqual && part > minimumPart;
      }) || version.every((part, index) => part === MINIMUM_NOX_VERSION[index]);

    if (!supported) {
      throw new FrameworkDiscoveryError(
        "unsupportedVersion",
        `Nox ${rawVersion} is unsupported. TaskMosaic requires Nox 2026.04.10 or newer.`,
      );
    }
  }

  private parseSessions(output: string): NoxListSessionsJson[] {
    let value: unknown;
    try {
      value = JSON.parse(output);
    } catch (error: unknown) {
      throw new FrameworkDiscoveryError(
        "malformedOutput",
        "Nox returned invalid JSON.",
        error instanceof Error ? error.message : String(error),
      );
    }
    if (!Array.isArray(value)) {
      throw new FrameworkDiscoveryError(
        "malformedOutput",
        "Nox session output was not an array.",
      );
    }
    return value.map((item, index) => this.parseSession(item, index));
  }

  private parseSession(value: unknown, index: number): NoxListSessionsJson {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw this.invalidSession(index);
    }
    const item = value as Record<string, unknown>;
    if (
      typeof item.session !== "string" ||
      typeof item.name !== "string" ||
      typeof item.description !== "string" ||
      !(typeof item.python === "string" || item.python === null) ||
      !Array.isArray(item.tags) ||
      !item.tags.every((tag) => typeof tag === "string") ||
      !item.call_spec ||
      typeof item.call_spec !== "object" ||
      Array.isArray(item.call_spec)
    ) {
      throw this.invalidSession(index);
    }

    const callSpec: Record<string, string> = {};
    for (const [key, raw] of Object.entries(
      item.call_spec as Record<string, unknown>,
    )) {
      if (
        raw === null ||
        !["string", "number", "boolean"].includes(typeof raw)
      ) {
        throw this.invalidSession(index);
      }
      callSpec[key] = String(raw);
    }

    return {
      session: item.session,
      name: item.name,
      description: item.description,
      python: item.python as string | null,
      tags: item.tags as string[],
      call_spec: callSpec,
    };
  }

  private invalidSession(index: number): FrameworkDiscoveryError {
    return new FrameworkDiscoveryError(
      "malformedOutput",
      `Nox session at index ${index} did not match the expected schema.`,
    );
  }

  private createTask(
    session: NoxListSessionsJson,
    project: TaskProject,
    isDefault: boolean,
  ): Task {
    const hasMatrix =
      session.python !== null || Object.keys(session.call_spec).length > 0;
    return {
      key: createTaskKey(project.key, session.session),
      frameworkTaskId: session.session,
      frameworkId: this.id,
      projectKey: project.key,
      label: session.session,
      description: session.description || undefined,
      tags: [...session.tags],
      matrixGroup: hasMatrix ? session.name : undefined,
      parameters: { ...session.call_spec },
      isDefault,
    };
  }
}
