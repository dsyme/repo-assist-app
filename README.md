# Repo Assist

A cross-platform Electron desktop app for GitHub repository maintainers. Manage issues, pull requests, automation workflows, and CI status across multiple repos — all from one window, powered by the `gh` CLI.

[![CI](https://github.com/dsyme/repo-assist-app/actions/workflows/ci.yml/badge.svg)](https://github.com/dsyme/repo-assist-app/actions/workflows/ci.yml)

## Quick Start

### Linux / macOS / WSL2

```bash
curl -fsSL https://raw.githubusercontent.com/dsyme/repo-assist-app/main/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/dsyme/repo-assist-app/main/install.ps1 | iex
```

Then launch:

```bash
cd ~/repo-assist-app && npm run dev
```

You may need to temporaily enable scripts

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | >= 20 | https://nodejs.org |
| **GitHub CLI** | >= 2.0 | https://cli.github.com |
| **git** | any | pre-installed on most systems |

You must be authenticated with `gh`:

```bash
gh auth login
```

### WSL2

On WSL2, Electron needs system libraries for rendering. The install script handles this automatically, or run manually:

```bash
sudo bash setup-wsl.sh
```

WSLg must be enabled (Windows 11 default) for the GUI window.

### Windows

No additional system dependencies are needed. Ensure `git`, `node`, and `gh` are on your PATH (installers for each add these by default).

## Manual Setup

### Linux / macOS / WSL2

```bash
git clone https://github.com/dsyme/repo-assist.git
cd repo-assist
npm install
npm run dev
```

### Windows (PowerShell)

```powershell
git clone https://github.com/dsyme/repo-assist.git
cd repo-assist
npm install
npm run dev
```

## Features

- **Multi-repo dashboard** — monitor issues, PRs, and automation runs across multiple GitHub repos
- **GitHub Agentic Workflows** — first-class support for `.github/workflows/*.lock.yml` agentic automations with `.md` spec rendering
- **PR detail view** — diffs, CI status checks with live polling, timeline (commits, force pushes, reviews), bot identity detection
- **Issue management** — close as completed/not planned, comment, view labels
- **Automation runs** — filterable list with status icons, workflow grouping
- **Automations catalog** — browse workflows by type (Agentic, Copilot, Deployment, CI/CD) with source preview
- **AI recap** — heuristic summary of recent activity across repos
- **Read-only by default** — write mode toggle for safe exploration; all write actions show dry-run status
- **Keyboard shortcuts** — Escape to close panels, Ctrl+/- to zoom
- **GitHub-native UI** — dark theme with Primer components and GitHub status colors

## Architecture

```
src/
  main/           Electron main process + gh CLI bridge
  preload/        Context bridge (IPC → renderer)
  renderer/       React UI (Primer React v38, styled-components)
  shared/         TypeScript types shared across processes
```

All GitHub data flows through the `gh` CLI — no tokens or OAuth needed beyond `gh auth login`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in development mode with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | TypeScript strict checking (`noUnusedLocals`, `noUnusedParameters`) |

## License

ISC
