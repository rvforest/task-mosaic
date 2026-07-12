# Architecture

TaskMosaic separates framework behavior from VS Code integration.

## Discovery

`WorkspaceTaskService` locates trusted project configuration files and asks the registered framework adapter for structured tasks. Nox discovery checks the supported CalVer, queries JSON for default and all sessions, validates both responses, and atomically updates the task store per project.

Internal task identity includes framework, workspace, project, and framework task ID. Display labels and group names are never identifiers.

## Execution

Framework adapters produce an executable, argument array, cwd, and structured result interpreter. `NativeTaskService` translates that specification into a VS Code `ProcessExecution`, tracks native lifecycle events, and reconciles Nox reports with exit codes and explicit cancellation.

`RunCoordinator` adds bounded concurrency and group cancellation only to group runs started by TaskMosaic. Tasks started from VS Code's standard task picker remain native, independently managed executions.

## UI

The tree derives its contents from the task store and execution statuses. It adds workspace and project levels only when needed, then presents frameworks in tag, matrix, or flat mode. Discovery failures remain scoped to their projects so successful projects continue to work.

## Adding a framework

A new framework implements `FrameworkAdapter`, declares configuration filenames, returns normalized tasks from a structured discovery interface, creates execution specifications, and interprets optional structured result artifacts. It does not modify the queue, native task service, or tree identity model.
