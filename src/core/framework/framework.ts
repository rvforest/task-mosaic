import { Task, TaskProject, TaskRunOptions } from "../tasks/types";

export interface FrameworkCommandConfig {
  command: string;
  commandArgs: string[];
  runnerArgs: string[];
}

export interface ExecutionSpec {
  command: string;
  args: string[];
  cwd: string;
}

export interface ExecutionOutcome {
  status: "succeeded" | "failed" | "skipped";
  reason?: string;
}

export interface FrameworkAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly configurationFileNames: readonly string[];

  discover(
    project: TaskProject,
    config: FrameworkCommandConfig,
  ): Promise<Task[]>;

  createExecution(
    task: Task,
    project: TaskProject,
    options: TaskRunOptions,
    config: FrameworkCommandConfig,
    reportPath: string,
  ): ExecutionSpec;

  interpretResult(
    reportPath: string,
    executionStartedAt: Date,
  ): Promise<ExecutionOutcome | undefined>;
}
