# Nox Runner VSCode Extension

Browse and run [nox](https://nox.thea.codes/) sessions from the sidebar, similar to the test explorer.

## Features

- Lists all available nox sessions in the sidebar (Explorer view)
- Click the play icon to run any session in a VSCode terminal
- Refresh sessions with "Refresh Nox Sessions" command

## Requirements

- [nox](https://nox.thea.codes/) installed and available in your PATH
- A Python project with a `noxfile.py` in the workspace root

## Usage

1. Open a folder with a `noxfile.py`.
2. Open the "Nox Sessions" sidebar in the Explorer view.
3. Click the play button next to a session to run it.
4. Use the refresh button to update the session list if you change your `noxfile.py`.
