import {
  DiscoveredTask,
  TaskInvocation,
  TaskProject,
  TaskSourceId,
} from "../tasks/types";

export interface SourceTrustRequirements {
  discovery: boolean;
  execution: boolean;
}

export type ProjectDiscoveryStrategy =
  | {
      kind: "configurationFiles";
      patterns: readonly string[];
    }
  | {
      kind: "workspace";
    };

export interface ExecutionOutcome {
  status: "succeeded" | "failed" | "skipped";
  reason?: string;
}

export interface ExecutionResultResolver {
  resolve(executionStartedAt: Date): Promise<ExecutionOutcome | undefined>;
  cleanup?(): Promise<void>;
}

interface ExecutionPlanBase {
  result?: ExecutionResultResolver;
}

export interface ProcessExecutionPlan extends ExecutionPlanBase {
  kind: "process";
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface ManagedExecutionContext {
  signal: AbortSignal;
  write(output: string): void;
}

export interface ManagedExecutionPlan extends ExecutionPlanBase {
  kind: "managed";
  run(context: ManagedExecutionContext): Promise<ExecutionOutcome>;
}

export type ExecutionPlan = ProcessExecutionPlan | ManagedExecutionPlan;

export interface ExecutionPreparation {
  createArtifactPath(name: string): string;
}

export interface TaskSource {
  readonly id: TaskSourceId;
  readonly displayName: string;
  readonly projectDiscovery: ProjectDiscoveryStrategy;
  readonly trust: SourceTrustRequirements;

  discover(project: TaskProject): Promise<DiscoveredTask[]>;

  createExecution(
    task: DiscoveredTask,
    project: TaskProject,
    invocation: TaskInvocation,
    preparation: ExecutionPreparation,
  ): ExecutionPlan;
}
