# Architecture

TaskMosaic separates task sources, execution backends, shared task state, and
VS Code integration. A task source may represent a language tool, automation
framework, workspace manifest, extension API, or remote service. Nox is the
first source, not the shape of the universal model.

## Discovery

`WorkspaceTaskService` coordinates discovery declared by registered
`TaskSource` implementations. A source describes how its projects are located,
whether discovery requires Workspace Trust, and how discovered records become
portable tasks. Configuration-file discovery is one strategy; a source may
instead operate at workspace scope or use an external API.

Configuration-file names and patterns belong to the source declaration. The
workspace coordinator applies shared exclusions and limits, but it does not
carry a built-in list of Nox or other framework files.

Internal task identity includes source, workspace, project scope, and the
source's task ID. Display labels and group names are never identifiers. Generic
group memberships describe relationships such as tags, matrices, build groups,
or pipeline stages without promoting any one source's vocabulary into the core
model.

Nox discovery requires Workspace Trust, checks the supported CalVer, queries
JSON for default and all sessions, validates both responses, and atomically
updates the task store per project. Discovery failures remain scoped to their
source and project so unrelated tasks continue to work.

## Execution

A task source returns a discriminated `ExecutionPlan`; it does not execute work
through a universal shell runner. Plans identify their backend explicitly.
Process plans contain an executable, argument array, cwd, optional environment,
and optional structured-result resolver. Managed plans run extension-owned or
API-backed work through a cancellation-aware callback. Additional backends,
such as a genuine shell plan, can be added without changing task identity,
discovery, the queue, or the tree.

The VS Code layer translates plans into native task executions. Nox currently
uses `ProcessExecution`; a managed plan maps to `CustomExecution`.
`NativeTaskService` provides and resolves portable VS Code tasks, while a run
tracker owns per-run state, cancellation, result reconciliation, and temporary
artifacts. Explicit cancellation takes precedence over backend and result
outcomes.

`RunCoordinator` adds bounded concurrency and group cancellation only to group
runs started by TaskMosaic. Tasks started from VS Code's standard task picker
remain native, independently managed executions.

## UI

The tree derives its contents from the task store and execution statuses. It
adds workspace and project levels only when needed, then presents sources and
generic group memberships in configured views. Source-specific metadata may
enrich labels and tooltips but must not become a prerequisite for other
sources.

## Adding a task source

A new source implements `TaskSource`, declares its discovery strategy and trust
requirements, returns normalized tasks, and produces execution plans. Its
source-specific configuration and result interpretation remain behind that
boundary. It does not modify the task store, queue, native task provider, or
tree identity model when it uses an existing discovery strategy and execution
backend.

## Adding an execution backend

A new backend adds one plan variant and one VS Code translator. It does not
change task-source discovery, task identity, grouping, or queue semantics.
Keeping backend choice explicit preserves non-process tasks without restoring
the former provider/runner inheritance hierarchy.
