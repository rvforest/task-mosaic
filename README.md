# TaskMosaic

TaskMosaic discovers tasks across a VS Code workspace and presents them in one
task tree. The prerelease supports [Nox](https://nox.thea.codes/) through VS
Code's native Task API. Its source and execution contracts are designed for
other languages, frameworks, workspace manifests, and managed or remote tasks.

## Requirements

- VS Code 1.101 or newer.
- A trusted workspace.
- Nox 2026.04.10 or newer.
- `nox` available on the extension host `PATH`, or an explicit command configuration.

TaskMosaic does not execute project configuration in an untrusted workspace.

## Using TaskMosaic

Open the TaskMosaic Activity Bar view. Projects containing `noxfile.py` are discovered throughout the workspace, excluding common dependency, environment, cache, and build directories.

- Select a task to run it in a native VS Code task terminal.
- Use a task's context menu to provide input defined by its source.
- Run a tag or matrix group with bounded concurrency.
- Use the view title actions to run all default tasks, change grouping, or refresh.
- Discovered tasks also appear under **Tasks: Run Task** and can be resolved from `tasks.json`.

Task outcomes remain visible as succeeded, failed, skipped, or cancelled. Group runs continue after independent failures and show one final summary.

## Configuration

| Setting                              | Purpose                                                             |
| ------------------------------------ | ------------------------------------------------------------------- |
| `taskMosaic.nox.command`             | Executable used to invoke Nox.                                      |
| `taskMosaic.nox.commandArgs`         | Prefix arguments, such as `run`, `nox` when the executable is `uv`. |
| `taskMosaic.nox.runnerArgs`          | Default arguments supplied to Nox task executions.                  |
| `taskMosaic.discovery.exclude`       | Paths omitted from project discovery.                               |
| `taskMosaic.discovery.maxProjects`   | Maximum discovered projects, default 50.                            |
| `taskMosaic.discovery.autoRefresh`   | Refresh when project configuration changes.                         |
| `taskMosaic.execution.maxConcurrent` | Concurrent tasks in a group run, default 3.                         |

For example, to invoke Nox through uv:

```json
{
  "taskMosaic.nox.command": "uv",
  "taskMosaic.nox.commandArgs": ["run", "nox"]
}
```

## Native task definitions

Discovered tasks can be referenced from `tasks.json`:

```json
{
  "label": "Run Nox tests",
  "type": "taskMosaic",
  "source": "nox",
  "project": ".",
  "task": "tests-3.12",
  "inputs": {
    "taskArgs": ["--coverage"]
  }
}
```

`project` is relative to the task's workspace folder.

## Development

```bash
npm install
npm run check
npm run package
```

Press F5 in VS Code to launch an Extension Development Host against the bundled Nox fixture. Architecture and delivery decisions are recorded in the [implementation plan](https://github.com/rvforest/task-mosaic/blob/main/docs/implementation-plan.md); the original audit is in the [repository assessment](https://github.com/rvforest/task-mosaic/blob/main/docs/repository-assessment.md).

## Prerelease status

TaskMosaic has not been published to the Visual Studio Marketplace. Production
sources beyond Nox, automatic Python environment-manager detection, persistent
history, favorites, filtering, and Test Explorer integration are deferred.
