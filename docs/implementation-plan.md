# TaskMosaic Recovery and Release Plan

## Summary

Rebuild TaskMosaic as an extensible unified task manager with Nox as the only initial framework. Replace human-readable session parsing and direct child-process execution with structured Nox JSON interfaces and VS Code's native Task API.

The implementation is split into reviewable stages. Marketplace publication remains deferred.

## Core Contracts

### Domain model

- `TaskKey`: opaque identity derived from framework, workspace URI, project-relative root, and framework task ID.
- `TaskProject`: framework ID, workspace URI, project root URI, configuration URI, and stable project key.
- `DiscoveredTask`: task key, framework task ID, framework/project keys, label, description, tags, matrix group, parameters, and default state.
- `TaskRunOptions`: separate `runnerArgs` and `taskArgs`.
- `TaskStatus`: `idle`, `queued`, `running`, `succeeded`, `failed`, `skipped`, or `cancelled`.
- `TaskRunResult`: final status, exit code, timestamps, duration, and optional reason.

Display names, tags, and matrix names must never serve as identities.

### Framework adapter

Replace provider/runner inheritance with a framework-neutral adapter covering framework metadata, project configuration patterns, structured discovery, execution specifications, result interpretation, and typed errors. The core layer must not import `vscode`.

### Native task definition

Register task type `taskMosaic` with portable definitions:

```json
{
  "type": "taskMosaic",
  "framework": "nox",
  "project": "workspace-relative/project/path",
  "task": "tests-3.12",
  "runnerArgs": [],
  "taskArgs": []
}
```

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

## Delivery Stages

### 0. Documentation baseline

Track the assessment and this implementation plan before runtime work.

### 1. Structured Nox discovery and trust

- Execute no configured command or Noxfile before Workspace Trust is granted.
- Require Nox `2026.04.10+` by checking its numeric CalVer.
- Query defaults with `--list-sessions --json` and all sessions with `--list-sessions --json -k "True"`.
- Remove the text parser and validate structured responses.
- Bound discovery processes to 30 seconds and 10 MiB.
- Return typed, actionable errors.

### 2. Identity, projects, and refresh lifecycle

- Use stable task and project keys across multi-root workspaces.
- Find projects through configurable include/exclude globs.
- Debounce and coalesce file, workspace, trust, and setting refresh events.
- Replace results atomically per project and preserve unaffected projects on errors.

### 3. Native tasks and single-task execution

- Register a native `TaskProvider` with `provideTasks()` and `resolveTask()`.
- Use `ProcessExecution` with separate executable and arguments.
- Use unique Nox report files to distinguish success, failure, and skipped results.
- Track lifecycle by native `TaskExecution` and settle each run once.
- Give explicit cancellation precedence over process/report results.
- Remove the legacy execution manager and shell runner.

### 4. Queue, groups, arguments, and cancellation

- Use a configurable bounded queue, default concurrency three.
- Continue independent tasks after failures.
- Scope groups to workspace, project, framework, and group.
- Parse interactive arguments once and propagate them to every selected task.
- Cancel queued and active tasks owned by a group and produce one final summary.

### 5. Unified tree and operational UX

- Show workspace and project nodes only when needed, followed by framework, grouping, and task nodes.
- Support persisted `By Tag`, `By Matrix`, and `Flat` modes.
- Expose trust, loading, unavailable, unsupported, truncated, empty, and error states with actions.
- Drive icons and tooltips from native execution state.

### 6. Toolchain and cross-platform tests

- Target VS Code `^1.101.0` and Node 20/22 development tooling.
- Replace `ts-jest` with `@swc/jest` while retaining Jest.
- Add Extension Host and real-Nox compatibility tests.
- Run CI on Linux, macOS, and Windows with focused coverage gates.

### 7. Packaging and prerelease readiness

- Bundle runtime code into `dist/extension.js`.
- Package only runtime files, required assets, README, changelog, and license.
- Add valid Activity Bar and Marketplace icons plus complete repository metadata.
- Package, inspect, install, and activate a VSIX in CI.
- Keep Marketplace publishing disabled until a publisher and credentials exist.

## Release Gate

- Complete structured discovery for trusted Nox `2026.04.10+` projects.
- No project-code execution in untrusted workspaces.
- Correct success, failure, skipped, cancellation, and launch-failure states.
- Correct isolation for duplicate IDs across projects and folders.
- Reliable group queuing, argument propagation, and cancellation.
- Actionable discovery/execution errors with no stuck runs.
- A clean VSIX that installs and activates on Linux, macOS, and Windows.

## Deferred Work

Tox, automatic environment-manager detection, favorites, persistent history, filtering/search, Test Explorer integration, Marketplace enrollment, and public publication remain out of scope for the prerelease.
