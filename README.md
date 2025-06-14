# TaskMosaic

Browse and run tasks from multiple frameworks including [nox](https://nox.thea.codes/), similar to the test explorer.

## Features

- Lists all available task sessions in the sidebar (Explorer view)
- **Multi-framework support**: Currently supports nox with more frameworks planned
- **New**: Sessions by Tag view - organize sessions by their tags
- Click the play icon to run any session in a VSCode terminal
- Run all sessions in a tag group with the multi-play button
- Run all default sessions with one click
- Real-time status updates for running sessions
- Supports parameterized sessions with Python version matrices
- Sessions without tags are grouped under "untagged"

## Requirements

- Supported task frameworks (currently [nox](https://nox.thea.codes/)) installed and available in your PATH
- A project with appropriate task configuration files in the workspace root

## Usage

### Task Sessions View
1. Open a folder with supported task configuration files (e.g., `noxfile.py` for nox).
2. Open the "Task Sessions" sidebar in the Explorer view.
3. Click the play button next to a session to run it.
4. Use the "Run All Default Sessions" button to run all default sessions.

### Sessions by Tag View
1. Switch to the "Sessions by Tag" view in the sidebar.
2. Sessions are organized by their tags (e.g., for nox: defined in `@nox.session(tags=["tag1", "tag2"])`).
3. Sessions without tags appear under "untagged".
4. Click a tag group to expand and see all sessions with that tag.
5. Click the play button on a tag group to run all sessions in that group.
6. Individual sessions within a tag group can still be run individually.

### Tag Group Features
- **Multi-session execution**: Run all sessions in a tag group simultaneously
- **Status aggregation**: Tag groups show combined status of all their sessions
- **Real-time updates**: Status changes in individual sessions immediately update the tag group status
4. Use the refresh button to update the session list if you change your task configuration files.
