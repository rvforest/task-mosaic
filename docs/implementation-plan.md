# TaskMosaic Recovery and Release Plan

## Summary

Rebuild TaskMosaic as a language- and framework-agnostic unified task manager,
with Nox as the only initial task source. Replace human-readable Nox session
parsing and direct child-process execution with structured Nox JSON interfaces
and VS Code's native Task API.

The universal contracts must not assume that every source is a framework, that
every project is found through a configuration file, or that every task can be
delegated to an operating-system process. The implementation is split into
reviewable stages. Marketplace publication remains deferred.

## Core Contracts

### Domain model

- `TaskKey`: opaque identity derived from source, workspace URI, project scope,
  and source task ID.
- `TaskSourceId`, `ProjectKey`, and `TaskKey`: distinct opaque types rather than
  interchangeable strings.
- `TaskProject`: source ID, workspace identity, stable project key, optional
  project/configuration URIs, and source-owned serializable data.
- `DiscoveredTask`: task key, source task ID, source/project keys, label,
  description, generic group memberships, roles such as `default`, declared
  capabilities, and optional source-owned serializable data.
- `TaskGroupMembership`: source-independent `kind`, stable ID, and display
  label. Nox tags and matrices map into memberships rather than dedicated core
  fields.
- `TaskInvocation`: portable source-owned inputs. The Nox task definition
  exposes separate `runnerArgs` and `taskArgs`, but those are not universal
  execution concepts.
- `TaskStatus`: `idle`, `queued`, `running`, `succeeded`, `failed`, `skipped`,
  or `cancelled`.
- `TaskRunResult`: final status, exit code when applicable, timestamps,
  duration, and optional reason.
- Discovery results are discriminated success/error unions; invalid states such
  as both tasks and an error are not representable.

Display names and group memberships must never serve as identities.

### Task source

Replace provider/runner inheritance with a `TaskSource` contract covering
source metadata, project-discovery strategy, trust requirements, structured
task discovery, and execution-plan creation. Source-specific configuration is
injected into the source rather than selected by a central framework switch.
The core layer must not import `vscode`.

Configuration-file projects are the first discovery strategy. Workspace-scoped
and externally discovered sources remain valid model variants even when no
production source uses them yet.

### Execution plans

Execution is an explicit, discriminated plan rather than an assumed command:

```ts
type ExecutionPlan = ProcessExecutionPlan | ManagedExecutionPlan;
```

- `ProcessExecutionPlan`: executable, argument array, cwd, optional
  environment, and optional structured-result resolver/cleanup.
- `ManagedExecutionPlan`: cancellation-aware callback with output reporting for
  extension-owned, API-backed, or otherwise non-process work.

The VS Code layer translates process plans to `ProcessExecution` and managed
plans to `CustomExecution`. A future plan kind adds one translator without
changing sources that use existing backends.

### Native task definition

Register task type `taskMosaic` with portable definitions:

```json
{
  "type": "taskMosaic",
  "source": "nox",
  "project": "workspace-relative/project/path",
  "task": "tests-3.12",
  "inputs": {
    "runnerArgs": [],
    "taskArgs": []
  }
}
```

Definitions contain no run tokens, absolute report paths, or internal task
keys. `resolveTask()` preserves the exact incoming definition as required by
the VS Code Task API.

### Configuration

| Setting                              | Default                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `taskMosaic.nox.command`             | `"nox"`                                                                         |
| `taskMosaic.nox.commandArgs`         | `[]`                                                                            |
| `taskMosaic.nox.runnerArgs`          | `[]`                                                                            |
| `taskMosaic.discovery.include`       | `["**/noxfile.py"]`                                                             |
| `taskMosaic.discovery.exclude`       | Common VCS, environment, dependency, cache, build, and distribution directories |
| `taskMosaic.discovery.maxProjects`   | `50`, range `1-500`                                                             |
| `taskMosaic.discovery.autoRefresh`   | `true`                                                                          |
| `taskMosaic.execution.maxConcurrent` | `3`, range `1-16`                                                               |

The Nox settings belong to the Nox source. A future source contributes its own
configuration without adding cases to a central configuration provider.

## Delivery Stages

### 0. Documentation baseline

Track the assessment and this implementation plan before runtime work.

### 1. Structured Nox discovery and trust

- Execute no configured command or Noxfile before Workspace Trust is granted.
- Require Nox `2026.04.10+` by checking its numeric CalVer.
- Query defaults with `--list-sessions --json` and all sessions with
  `--list-sessions --json -k "True"`.
- Remove the text parser and validate structured responses.
- Bound discovery processes to 30 seconds and 10 MiB.
- Return typed, actionable errors.
- Map Nox records into generic source IDs, groups, roles, and source data.

### 2. Identity, projects, and refresh lifecycle

- Use stable source, task, and project keys across multi-root workspaces.
- Find Nox projects through configurable include/exclude globs while keeping
  discovery strategy source-owned.
- Debounce and coalesce file, workspace, trust, and setting refresh events.
- Replace results atomically per project and preserve unaffected projects on
  errors.
- Prove the source boundary with a fake non-Nox source that does not rely on Nox
  task fields.

### 3. Native tasks and single-task execution

- Register a native `TaskProvider` with `provideTasks()` and `resolveTask()`.
- Preserve portable task definitions during resolution.
- Translate explicit execution plans rather than assuming every task is a
  process.
- Use `ProcessExecution` with separate executable and arguments for Nox.
- Support a cancellation-aware `CustomExecution` path for managed plans.
- Use unique Nox report artifacts to distinguish success, failure, and skipped
  results.
- Track lifecycle by native `TaskExecution` and settle each run once.
- Give explicit and native-UI cancellation precedence over process/report
  results.
- Remove the legacy execution manager and shell runner.

### 4. Queue, groups, arguments, and cancellation

- Use a configurable bounded queue, default concurrency three.
- Continue independent tasks after failures.
- Scope groups to workspace, project, source, and group membership.
- Parse interactive source inputs once and propagate them to every selected
  task.
- Cancel queued and active tasks owned by a group and produce one final summary.

### 5. Unified tree and operational UX

- Show workspace and project nodes only when needed, followed by source,
  grouping, and task nodes.
- Support persisted grouping modes based on generic membership kinds, with Nox
  presets for `By Tag`, `By Matrix`, and `Flat`.
- Expose trust, loading, unavailable, unsupported, truncated, empty, and error
  states with actions.
- Drive icons and tooltips from native execution state.

### 6. Toolchain and cross-platform tests

- Target VS Code `^1.101.0` and Node 20/22 development tooling.
- Replace `ts-jest` with `@swc/jest` while retaining Jest.
- Add Extension Host and real-Nox compatibility tests.
- Add contract tests for a configuration-file/process source and a
  workspace/managed source.
- Run CI on Linux, macOS, and Windows with focused coverage gates.

### 7. Packaging and prerelease readiness

- Bundle runtime code into `dist/extension.js`.
- Package only runtime files, required assets, README, changelog, and license.
- Add valid Activity Bar and Marketplace icons plus complete repository
  metadata.
- Package, inspect, install, and activate a VSIX in CI.
- Keep Marketplace publishing disabled until a publisher and credentials exist.

## Release Gate

- Complete structured discovery for trusted Nox `2026.04.10+` projects.
- No project-code execution in untrusted workspaces.
- Correct success, failure, skipped, cancellation, and launch-failure states.
- Correct isolation for duplicate IDs across projects, folders, and sources.
- Reliable group queuing, input propagation, and cancellation.
- Actionable discovery/execution errors with no stuck runs.
- Portable native definitions that resolve without internal or absolute state.
- A fake managed source can be registered without changing the store, queue,
  native task provider, or tree.
- A clean VSIX that installs and activates on Linux, macOS, and Windows.

## Deferred Work

Production Tox or other task sources, automatic environment-manager detection,
additional execution backends beyond process and managed execution, favorites,
persistent history, filtering/search, Test Explorer integration, Marketplace
enrollment, and public publication remain out of scope for the prerelease.
