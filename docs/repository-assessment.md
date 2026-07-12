# TaskMosaic Repository Assessment

**Assessment date:** 2026-07-09
**Repository revision:** `fece390` (`main`)
**Current product:** A VS Code extension that discovers Nox sessions, groups them by tag or matrix, and runs them as child processes.

## Executive summary

TaskMosaic is not currently usable with a current Nox installation. The primary failure is in session discovery: current Nox plain-text output includes tags after each session name, but TaskMosaic includes those tags in the name passed back to Nox. The follow-up command fails and the extension displays no tasks. This was reproduced against the repository's own sample project with Nox `2026.4.10`.

Even after discovery is repaired, execution has several release-blocking correctness problems. Failed and skipped runner results are reported as completed, process spawn failures can remain running forever, execution validation is not awaited, group runs exceed the concurrency limit instead of queuing, and "Run All with Arguments" discards the entered arguments and prompts once per child. Multi-root workspaces also overwrite tasks with the same session ID and allow group commands to cross workspace boundaries.

The repository is a substantial prototype rather than a release-ready extension. Its internal decomposition is reasonable and its 227 tests pass, but the tests mock the behaviors that are broken in real use. There is no Extension Host test, no current-Nox compatibility test, no packaging gate, and no coverage of activation or the real command implementations. The recommended course is to stabilize Nox-only behavior before adding more frameworks.

## What was verified

| Check                       | Result                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| TypeScript compile          | Pass                                                                                                       |
| ESLint                      | Pass with two `no-explicit-any` warnings in `nox-task-provider.ts`                                         |
| Jest                        | 21 suites and 227 tests pass                                                                               |
| Coverage                    | 67.27% statements overall; `extension.ts` and command modules report 0%                                    |
| Real Nox discovery          | Fail: the provider returns zero tasks for the bundled sample project                                       |
| VSIX packaging              | Pass, but includes 256 files, including tests, coverage, source, maps, workflows, and editor configuration |
| Dependency audit            | 9 development dependency advisories: 1 critical, 4 high, 3 moderate, 1 low                                 |
| Git state before assessment | Clean                                                                                                      |

The real discovery reproduction was:

```text
nox --list-sessions --json -s tests-3.11 [test,ci] ...
nox > Sessions not found: tests-3.11 [test,ci], ...
```

The plain-text parser at `src/frameworks/nox/nox-task-provider.ts:83-90` captures the `[tags]` suffix. `TaskProvider.listTasks()` then catches the failure and returns an empty list, leaving the tree at "No tasks found" with no actionable error.

## Fix first: correctness and release blockers

### P0. Repair Nox discovery and detection

1. **Replace plain-text parsing with Nox's documented JSON interface.** Nox added `--list-sessions --json` in release `2023.04.22`, but releases through `2025.11.12` still omit `default=False` sessions from the all-session selector. Require Nox `2026.04.10`, the first verified release where structured discovery returns the complete inventory, rather than maintaining parsers for multiple human-readable formats.
2. **Do not discard an entire directory after one detail lookup fails.** Surface a provider error state in the tree and output channel. Partial results are preferable when they are trustworthy.
3. **Make detection meaningful.** `NoxFramework.detectInDirectory()` calls `provider.listTasks()`, but that public method catches directory errors and returns `[]`; detection therefore returns `true` even when Nox is missing or the workspace is not a Nox project (`nox-framework.ts:19-38`, `task-provider.ts:17-32`). Check for `noxfile.py` and executable availability explicitly.
4. **Avoid repeated discovery.** Activation currently runs discovery during framework detection and again during refresh. Each attempt executes the workspace's `noxfile.py` and performs up to three Nox processes per root.
5. **Add compatibility fixtures from supported Nox versions.** The existing fixture omits tags and therefore cannot catch the reproduced regression.

#### Recommended structured discovery

Nox's JSON output contains the framework task ID, base name, description, Python version, tags, and parameter call specification. It does not include whether each session is selected by default, and an unfiltered JSON request returns only selected/default sessions. Recover the complete model with two structured queries:

```bash
# Sessions selected by default
nox --list-sessions --json

# Every available session
nox --list-sessions --json -k "True"
```

Parse both arrays, index the first result by `session`, build tasks from the second result, and set `isDefault` by membership in the default-session set. This was verified against the bundled sample project with Nox `2026.4.10`: the first query returns 4 default sessions and the second returns all 23 sessions, including non-default and parametrized sessions.

Use runtime schema validation that requires the fields TaskMosaic consumes while allowing unknown fields Nox may add later. Feature-detect JSON support instead of relying only on a parsed version string, impose timeouts and output-size limits, and distinguish unsupported Nox, missing executable, invalid Noxfile, and invalid JSON in user-facing errors.

The `-k "True"` selector is a practical way to select all sessions but is not as strong a contract as a dedicated JSON field. Propose an upstream Nox enhancement for JSON records to include `selected` or `default`, or for an explicit all-sessions JSON mode. That would reduce discovery to one process and remove the selector workaround. Importing Nox's private Python APIs or statically analyzing `noxfile.py` is not recommended: it would couple the extension to internal versions and cannot reliably model dynamically generated sessions.

Acceptance criteria: the bundled sample project discovers every default and non-default session, with correct tags, descriptions, matrix groups, parameters, and default flags on the oldest and newest supported Nox versions.

### P0. Correct execution lifecycle semantics

1. **Use the runner's returned status.** `ExecutionManager.runTaskAsync()` ignores the result of `runner.runTask()` and unconditionally records `completed` (`execution-manager.ts:155-159`). A normally exiting failed Nox session and a skipped session therefore appear successful.
2. **Treat every terminal status as terminal.** If `skipped` is propagated, `updateExecutionStatus()` must move it out of active executions and notify observers. At present only completed, failed, and cancelled are terminal (`execution-manager.ts:177-195`).
3. **Await validation.** `if (!framework.detect(...))` tests a Promise rather than its result (`execution-manager.ts:103-115`). Validation always passes and discovery continues unobserved in the background.
4. **Handle child-process errors.** `ShellCommandTaskRunner.runProcess()` listens for `close` but not `error` (`shell-command-runner.ts:33-58`). An unavailable executable can leave the Promise and task in `running` forever.
5. **Honor `TaskOptions.cwd`.** The execution manager computes an override, but the shell runner always uses `task.cwd` (`shell-command-runner.ts:18`).
6. **Use a stable execution identity.** Active/history lookups use only display `name + framework`, not task ID and workspace. This can conflate sessions across folders and block valid concurrent runs (`execution-manager.ts:302-319`).
7. **Return or expose completion.** `executeTask()` returns as soon as work starts. Commands that `await` it are not awaiting task completion, which is the root of several bulk-run errors.

Acceptance criteria: completed, failed, skipped, cancelled, and spawn-error cases each reach the correct terminal state; no active execution is stranded; output and observer events are deterministic.

### P0. Fix group commands and concurrency

1. **Queue bulk work instead of rejecting item six onward.** Tag groups can contain more than the hard-coded limit of five. The current loops launch tasks immediately because `executeTask()` returns before completion (`task-commands.ts:137-188`).
2. **Pass group arguments through once.** `runParentTaskWithArgs` collects `args` but never uses them, then invokes `runTaskWithArgs`, which prompts again for every child (`task-commands.ts:191-215`).
3. **Scope every group operation.** Matrix and tag queries filter only on group name. A click in one folder can run matching tasks in other folders or frameworks (`task-manager.ts:68-77`).
4. **Report a group result.** Users need a clear summary of queued, passed, failed, skipped, and cancelled tasks rather than a series of independent error popups.

### P0. Make task identity multi-root safe

`TaskManager` stores tasks in a `Map` keyed only by Nox's session string (`task-manager.ts:36-44`). Common IDs such as `lint` and `tests-3.12` overwrite one another across workspace folders. The same ambiguity affects status lookup and group commands.

Define an internal ID from at least framework, normalized workspace/project path, and framework task ID. Keep the Nox session ID separately for command invocation. Filter roots with path-aware containment rather than `cwd.startsWith(workspaceRoot)`.

### P0. Respect Workspace Trust

Nox discovery imports and executes `noxfile.py`; activation currently does this automatically. Do not execute discovery or tasks in an untrusted workspace. Show a non-running tree state and react when trust is granted. This is a security boundary, not an optional UX enhancement.

### P0. Complete release metadata and packaging controls

1. Add the Marketplace `publisher`, `repository`, `bugs`, license, keywords, and a real extension icon as appropriate.
2. Replace the Activity Bar container's `"$(beaker)"` icon with a valid packaged icon asset.
3. Add `.vscodeignore` or a narrow `files` allowlist. The audited VSIX contains coverage reports, tests, fixtures, Python bytecode, source, declaration files, source maps, workflows, and editor settings.
4. Split production and test compilation. `tsconfig.json` currently emits compiled copies of the entire test tree.
5. Add a CI packaging smoke test that installs the VSIX and activates it in an Extension Host before publishing.
6. Confirm the release workflow can authenticate and publish under the configured publisher. Packaging succeeds locally with warnings; Marketplace publishing was not attempted.

## Fix next: important defects

### P1. React to workspace changes

The search directories and available providers are captured only during activation. Adding/removing workspace folders or creating/changing a `noxfile.py` does not update discovery. Register workspace-folder and file-system watchers, debounce refreshes, and dispose them through `context.subscriptions`.

### P1. Make errors visible and actionable

Provider failures are reduced to "No tasks found" while details remain in an output channel that is never shown. Distinguish these states in the tree: no folder, untrusted workspace, no Nox project, executable unavailable, discovery failed, loading, and genuinely empty. Add actions such as Refresh, Open Output, and Configure Nox.

### P1. Resolve environment selection

Calling bare `nox` from the extension host PATH often misses a workspace virtual environment, `pipx`, `uv`, Poetry environment, or configured interpreter. Add per-workspace executable configuration and environment resolution. Log the exact executable, arguments, cwd, and relevant failure details.

### P1. Parse user arguments correctly

`args.split(' ')` breaks quoted strings, escaped spaces, and empty arguments (`task-commands.ts:87-102`). Use a shell-argument parser or a structured argument input. Keep runner arguments and arguments passed after `--` visibly distinct.

### P1. Align execution with the promised experience

The README says sessions run in a VS Code terminal, but the implementation uses hidden child processes and an Output channel. Decide and document one model. The stronger product direction is the VS Code Task API or a managed terminal because it provides visible output, cancellation, presentation controls, and familiar task behavior.

### P1. Dispose resources and reset singleton state

The tree registration disposable is not added to `context.subscriptions`; the execution observer is never removed; and the static framework registry persists without a reset path. This makes reload/activation behavior fragile and can cause duplicate framework registration. Register all disposables and make activation/deactivation idempotent.

## Improve without changing functionality

### Build, dependencies, and CI

- Update the toolchain as a coordinated change. The project mixes TypeScript 4.9, Node 14 types, VS Code 1.101 types resolved under an engine floor of 1.75, ESLint 9, Jest 30, and ts-jest 29.
- Remove Node 16 from CI or pin compatible tools. Installed Jest 30 requires Node 18.14+ and ESLint 9 requires Node 18.18+.
- Resolve the nine audited development dependency advisories. The critical advisory currently enters through `ts-jest -> handlebars`; all reported issues have fixes available according to `npm audit`.
- Add `type: module` or convert `eslint.config.js` to an unambiguous module format to remove Node's module-type warning.
- Add formatting and spelling checks to CI if those files remain part of the project policy. Align pre-commit versions with package-lock versions.
- Add coverage thresholds focused on activation, commands, failure paths, and integration boundaries rather than maximizing aggregate percentage.

### Code quality

- Remove dead APIs such as `notifyOutputReceived`, or wire runner output through them.
- Remove unused constructor fields (`context`, several output-channel references) and redundant runner members, or use them intentionally.
- Delete the large set of legacy grouping methods after callers and tests are migrated. `TaskGroupingService.ts` contains duplicate paths that increase ambiguity.
- Replace broad `try/catch` blocks that silently return empty arrays with typed errors and centralized logging.
- Replace `any` in Nox error handling with `unknown` plus a small error-normalization helper.
- Standardize formatting and naming. Current files mix quote styles, semicolon styles, indentation, and PascalCase filenames among kebab-case files.
- Keep domain models explicit: distinguish internal task key, framework task ID, display label, workspace folder, project root, and execution ID.

### Tests

- Add a real Extension Host smoke test for activation, view registration, commands, and disposal. `@vscode/test-electron` is installed but unused.
- Run provider compatibility tests against an actual pinned Nox installation, not only mocked `execFile` responses.
- Add regression tests for tagged plain output, non-default sessions, failed/skipped status propagation, missing executable, cwd override, quoted arguments, bulk groups larger than five, and duplicate session IDs in multi-root workspaces.
- Make command tests invoke the registered callbacks. The current command module reports 0% coverage despite a test file named for it.
- Add a VSIX contents check and fail if development-only paths enter the artifact.
- Reduce slow test setup and console noise. The suite takes about 94 seconds for 227 small tests and emits expected errors/log walkthroughs.

### Documentation and repository hygiene

- Rewrite the README around the actual Activity Bar view, supported Nox versions, environment selection, trust behavior, and troubleshooting.
- Correct stale API documentation. `docs/TaskTreeProvider.md` references nonexistent methods, wrong view IDs, duplicated code fences, broken characters, and category/matrix behavior the implementation does not provide.
- Add a development guide with supported Node/VS Code/Nox versions, Extension Host instructions, test layers, packaging, and release steps.
- Add a changelog and a minimal release/versioning policy before Marketplace publication.
- Replace the generic 293-line `.gitignore` with a project-specific file to make packaging behavior easier to reason about.

## Functionality to add or update

### Required for a credible Nox extension

1. **Visible managed execution:** run in a VS Code task/terminal, stream output, reveal it on failure, and support cancellation.
2. **Execution queue:** configurable concurrency, queued state, stop-all, and deterministic group summaries.
3. **Automatic refresh:** watch relevant Nox configuration and workspace-folder changes with a manual refresh fallback.
4. **Configuration:** executable path, project roots, environment variables, default runner arguments, concurrency, and auto-refresh behavior, all scoped per workspace where appropriate.
5. **Monorepo discovery:** find explicitly configured or safely detected Nox project roots below each workspace instead of assuming one `noxfile.py` at the root.
6. **Useful empty/error states:** trust, installation, configuration, discovery, and retry actions directly in the view.
7. **Persisted view state:** remember grouping mode and expansion where practical; replace the opaque toggle with explicit view-mode choices.

### Product direction after stabilization

- Integrate with VS Code's Task API so discovered sessions can participate in standard task workflows and keybindings.
- Add filtering/search, favorites, recent runs, duration, and rerun-last-failed once execution history is trustworthy.
- Add framework support only through a documented provider contract and compatibility suite. Tox is the most natural second framework; avoid claiming generic multi-framework support until a second provider ships.
- Consider debug/test integrations only after the basic runner is reliable. A Test Explorer integration is a different product surface from a task browser and should not be implied by visual similarity alone.

## Recommended delivery plan

### Phase 1: restore a working vertical slice

Fix current-Nox discovery, unique task identity, awaited validation, process errors, correct status propagation, Workspace Trust, and single-task execution. Add real-Nox and Extension Host regression tests.

### Phase 2: make all advertised commands reliable

Implement a queue, fix all group scoping and argument forwarding, add cancellation and visible execution output, and reconcile README claims with behavior.

### Phase 3: make it releasable

Clean the VSIX, complete manifest metadata/assets, update dependencies and CI, add packaging/install smoke tests, and document supported versions and troubleshooting.

### Phase 4: improve the product

Add configuration, automatic/monorepo discovery, persisted view choices, history/favorites/filtering, then evaluate Tox support.

## Suggested release gate

Do not publish `0.1.0` until all P0 items are closed and these scenarios pass in CI:

- Fresh install activates in a trusted single-root Nox project and lists all sessions.
- A workspace without Nox shows a useful non-error state.
- An untrusted workspace executes no project code.
- Missing executable and malformed Nox configuration produce actionable errors and no stuck runs.
- Successful, failed, and skipped sessions display correct final states.
- A group larger than the concurrency limit completes through a queue.
- Group arguments are entered once and applied to every intended child.
- Two workspace folders with identical session names remain isolated.
- The packaged VSIX installs and activates, and contains only runtime files, documentation, license, and required assets.
