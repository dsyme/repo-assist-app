# Repo Assist — Product Requirements Document

**Version:** 0.3  
**Date:** 2026-03-15  
**Status:** Active — functional prototype running on WSL2

---

## 1. Vision & Problem Statement

### The Problem

Open-source and internal-source maintainers managing multiple repositories are overwhelmed. GitHub's web UI is designed for individual-repo workflows. In the agentic era, automated workflows like **Repo Assist** ([spec](https://github.com/githubnext/agentics/blob/main/docs/repo-assist.md)) run continuously — labelling issues, investigating bugs, opening fix PRs, maintaining dependency updates, and posting monthly summaries. But maintainers still have to manually visit each repo, scan notifications, figure out what changed, and decide what to act on.

There is no unified "command center" view across repositories that shows:
- What the automations did overnight
- Which issues have new investigation comments worth reading
- Which PRs are ready for review/merge
- What the automations are planning to do next
- Which issues from the community backlog are being worked on

### The Vision

**Repo Assist Desktop** is a native desktop application (Electron) that serves as the maintainer's morning dashboard. It connects to GitHub exclusively through the `gh` CLI (inheriting auth context), uses local AI (`copilot` / `claude` / `codex`) to synthesize a prioritized recap of cross-repository activity, and provides low-click access to issues, PRs, automation runs, and workflow specifications.

The app embraces the model where **most work is done by automated workflows** and the **human's role is supervisory**: reviewing, merging, guiding via `/repo-assist` commands, and filing new issues. External community PRs are handled by a separate triage workflow; the main community contribution vector is **issues**.

### Key Principles

1. **GitHub is the database** — All persistent state (issues, PRs, comments, workflow specs, action runs) lives on GitHub. The app is a read-heavy client.
2. **`gh` CLI is the API layer** — All GitHub interaction happens via `gh` commands, inheriting the user's auth context. No OAuth flows, no token management.
3. **AI-enriched recap** — Local AI models synthesize a ranked Top-N action list from Monthly Activity Summaries, recent events, and run history.
4. **Config stored on GitHub** — The user's `.repo-assist` repository stores the repo list and settings, enabling cross-machine sync.
5. **Read-only by default** — All writes are mocked by default. A `write-mode` toggle enables actual writes (comments, merges) back to GitHub.
6. **Low-click morning workflow** — A maintainer should be able to assess overnight activity across 10+ repos in under 5 minutes.
7. **Transparency** — Every `gh` command the app runs is visible in a command log.

### Target Repositories (Initial)

| Repository | Monthly Summary Example |
|-----------|----------------------|
| `fslaborg/Deedle` | [#584](https://github.com/fslaborg/Deedle/issues/584) — 68 open issues, active bot PRs |
| `fsprojects/FSharp.Formatting` | [#973](https://github.com/fsprojects/FSharp.Formatting/issues/973) — 9+ draft PRs for review |
| `fsprojects/FSharp.Data` | [#1599](https://github.com/fsprojects/FSharp.Data/issues/1599) |
| `fsprojects/FSharp.Control.TaskSeq` | [#285](https://github.com/fsprojects/FSharp.Control.TaskSeq/issues/285) |

---

## 2. Architecture & Technology

### Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Desktop Shell** | Electron 41 | Native window on Mac, Linux, and WSL2 (via WSLg). Single binary distribution. |
| **UI Framework** | React 19 with TypeScript 5.9 | Industry standard, large ecosystem |
| **Design System** | `@primer/react` + `@primer/primitives` | GitHub's own design system — the app looks and feels like GitHub |
| **Build Tool** | Vite | Fast dev server, excellent Electron integration via `electron-vite` |
| **Backend (main process)** | Node.js (Electron main) | Runs `gh` CLI commands, manages local state, orchestrates AI calls |
| **Local State** | JSON files in `~/.repo-assist/` | Read-state tracking per issue/PR, command history |
| **Config Storage** | User's `.repo-assist` GitHub repo | Repo list, settings, synced across machines via `gh` |
| **GitHub Integration** | `gh` CLI (subprocess) | `gh api`, `gh issue list`, `gh pr list`, `gh run list`, etc. |
| **AI Recap** | Local AI (`copilot` / `claude` / `codex` CLI) | Synthesize Top-N prioritized actions from activity data |
| **Real-time Updates** | `gh api` polling | Poll on configurable interval (default 5 min) |

### WSL2 Strategy

Electron apps run natively on WSL2 via **WSLg** (built into Windows 11). The environment provides Wayland/X11 display forwarding automatically (`$DISPLAY=:0`, `$WAYLAND_DISPLAY=wayland-0`). The app launches as a native desktop window — no browser workaround needed. GPU acceleration may require `--disable-gpu` flag on some WSL2 setups.

### Write Mode

The app operates in **read-only mode** by default. All write operations (adding comments, merging PRs, closing issues) are shown as "would execute" in the command log with a dry-run preview. A persistent toggle in the toolbar enables **write mode**, which executes writes for real. The mode is indicated by a prominent status badge.

### Deployment Topology

```
┌──────────────────────────────────────┐
│  User's Machine (WSL2 / Mac / Linux) │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Electron App                  │  │
│  │                                │  │
│  │  ┌──────────┐  ┌───────────┐  │  │
│  │  │ Renderer │  │   Main    │  │  │
│  │  │ React +  │  │ gh bridge │  │  │
│  │  │ Primer   │  │ AI synth  │  │  │
│  │  └────┬─────┘  └─────┬─────┘  │  │
│  │       │ IPC          │        │  │
│  │       └──────┬───────┘        │  │
│  │              │                │  │
│  │  ┌───────────┴──────────────┐ │  │
│  │  │  ~/.repo-assist/         │ │  │
│  │  │  read-state.json         │ │  │
│  │  │  command-log.json        │ │  │
│  │  │  cache/                  │ │  │
│  │  └──────────────────────────┘ │  │
│  └────────────────────────────────┘  │
│              │                 │      │
│         gh CLI calls     AI CLI calls│
│              │                 │      │
└──────────────┼─────────────────┼─────┘
          ┌────┴────┐     ┌──────┴──────┐
          │ GitHub  │     │ Local AI    │
          │ Issues, │     │ copilot/    │
          │ PRs,    │     │ claude/     │
          │ Runs    │     │ codex       │
          └─────────┘     └─────────────┘
```

---

## 3. User Experience & Features

### 3.1 Application Layout

The app uses a **three-column layout** inspired by GitHub's own UI:

```
┌──────────────────────────────────────────────────────────────┐
│  Repo Assist                                    [⚙] [🔄] [📋]│
├──────────┬───────────────────────┬───────────────────────────┤
│ LEFT     │ CENTER                │ RIGHT (optional)          │
│ PANEL    │ PANEL                 │ PANEL                     │
│          │                       │                           │
│ ▸ Recap  │ (Selected item        │ (Detail / preview         │
│          │  content)             │  when needed)             │
│ ▾ Repos  │                       │                           │
│  ▸ org/r1│                       │                           │
│    Auto  │                       │                           │
│    Issues│                       │                           │
│    PRs   │                       │                           │
│  ▸ org/r2│                       │                           │
│          │                       │                           │
│ ▸ Cmds   │                       │                           │
│          │                       │                           │
└──────────┴───────────────────────┴───────────────────────────┘
```

**Left Panel (Navigation — ~250px)**
- **Recap**: Cross-repository checklist of actionable items
- **Add Repository**: Search and add repos to monitor
- **Repositories**: Expandable tree, each with:
  - **Automations**: Workflow specs (`.github/workflows/` YAML + agentic workflow specs). Agentic workflows detected by `.lock.yml` presence or `copilot`/`agent` in name/path. Click to view source in-app; `.md` files show frontmatter + rendered body.
  - **Issues**: Grouped by primary label, with unread indicators (bold). Close issue (completed/not planned) actions.
  - **Pull Requests**: Open PRs, with CI status badges. Merge/close actions.
  - **Automation Runs**: Recent workflow runs (skipped runs filtered out)
- **Command Log**: Scrollable log of all `gh` commands executed

**Center Panel (Content)**
- Displays the selected item: issue thread, PR diff summary, action run log, workflow spec, or recap checklist
- Markdown rendered with GitHub-style formatting, `#N` references link to in-app issue/PR detail
- PR diffs shown expanded by default with colored unified diff view

**Right Panel (Context — collapsible)**
- Quick actions, related items, metadata

### 3.2 Recap (AI-Synthesized Morning Checklist)

The Recap is the **primary view** — a cross-repository, AI-synthesized Top-N checklist of prioritized actions. It is the first thing the maintainer sees.

**Data Sources for AI Synthesis:**
1. **Monthly Activity Summary issues** (Repo Assist Task 11) — e.g. [Deedle #584](https://github.com/fslaborg/Deedle/issues/584), [FSharp.Formatting #973](https://github.com/fsprojects/FSharp.Formatting/issues/973). These contain checkbox lists of pending maintainer actions.
2. **Recent events** — issues/PRs with new comments since last viewed
3. **Action run history** — what workflows did overnight (PRs created, comments added)
4. **PR CI status** — which Repo Assist PRs have passing/failing CI

**AI Synthesis Step:**
The app feeds the above data into a locally-authenticated AI model (`copilot` / `claude` / `codex` CLI, whichever is available) with a prompt like:

> "Given the following cross-repository activity summaries, events, and PR statuses for repositories [list], generate the top 5 most important actions for the maintainer to take right now. Each action should be one of these types: REVIEW_PR, CHECK_COMMENT, MERGE_PR, CLOSE_ISSUE, FILE_ISSUE, CHECK_CI. Output as structured JSON."

**Recap Item Types (fixed kinds):**
- 🔀 **Review a PR** — A Repo Assist draft PR with passing CI, ready for review
- 💬 **Check a comment** — Bot added an investigation/explanation comment on an issue
- ✅ **Merge a PR** — A previously-reviewed PR that's ready to go
- 🗑️ **Close an issue** — Recommendation to close (resolved, duplicate, or stale)
- 🚨 **Fix CI** — A PR has failing CI that needs attention
- 📋 **Triage new issues** — Newly filed issues needing labels/response

**UX Behavior:**
- Top 5 items shown initially, animated in with stagger
- As the maintainer clears items (clicks → reviews → marks done), new items animate in from below
- Fluid, satisfying feel — items slide out when completed, new ones slide in
- Each item is a single click to navigate to the detail view
- "Refresh recap" button re-runs AI synthesis with latest data
- Cross-repository: items are interleaved by priority, not grouped by repo

### 3.3 Issue List & Detail

**List View:**
- Issues grouped by primary label (bug, enhancement, question, etc.)
- Each issue shows: number, title, author, age, comment count, label pills
- **Bold title** = unread activity (new comments since last viewed)
- Counts in group headers: "bug (12)" with "(3 unread)" indicator

**Detail View:**
- Full issue thread with comments rendered as GitHub-style markdown
- Timeline showing Repo Assist bot comments distinctly (robot emoji, different accent)
- Quick action bar: Open in GitHub, `/repo-assist <instruction>` composer, Label editor
- Marking as read happens automatically when the issue detail is viewed

### 3.4 PR List & Detail

**List View:**
- PRs sorted by: needs review → failing CI → passing CI → draft
- Each PR shows: number, title, author, CI status badge, review status, age
- Repo Assist PRs visually distinguished (bot avatar)

**Detail View:**
- PR description, CI status summary, diff stats
- Comment thread (like issues)
- Quick actions: Merge (with confirmation), Open in GitHub, Request changes, `/repo-assist` comment

### 3.5 Automations View

For each repository:
- **Agentic Workflows**: Detected by checking for a `.lock.yml` sibling file, or `copilot`/`agent` in the workflow name/path. Displayed with a Copilot icon and "Agentic" label.
- **CI/CD Workflows**: Standard `.github/workflows/*.yml` files
- **Detail View**: Click any workflow to see its source. For `.md` files (agentic workflow specs), frontmatter is shown in a code block and the body is rendered as markdown. For `.yml` files, full source is shown in a code block.
- **Actions**: View on GitHub, Edit on GitHub buttons in detail view
- **Automation Runs**: Renamed from "Action Runs". Last N runs with status, duration, trigger info. Skipped runs are filtered out.

### 3.6 Command Log

A persistent panel (toggleable) showing every `gh` command the app has executed:
- Timestamp, command, duration, exit code
- Click to expand: see stdout/stderr
- Useful for debugging and transparency

### 3.7 Configuration

**Stored in the user's `.repo-assist` GitHub repository** (synced across machines):

```json
{
  "repositories": [
    "fslaborg/Deedle",
    "fsprojects/FSharp.Formatting",
    "fsprojects/FSharp.Data",
    "fsprojects/FSharp.Control.TaskSeq"
  ],
  "pollIntervalSeconds": 300,
  "recapItemCount": 5,
  "aiProvider": "copilot",
  "theme": "auto"
}
```

Fetched on startup via `gh api repos/{user}/.repo-assist/contents/config.json`. Updates pushed back via `gh api` PUT. Editable from within the app via a Settings panel.

**Repo Chooser**: Users can add repositories directly from the sidebar using the "+" button below Recap. This opens a search dialog that queries GitHub via `gh search repos`. Added repos are persisted to `~/.repo-assist/settings.json` and merged with the default repo list.

**Local state** stored in `~/.repo-assist/` (not synced):

```
~/.repo-assist/
  read-state.json      # { "owner/repo#123": "2026-03-15T08:00:00Z", ... }
  command-log.json     # recent gh commands (ring buffer, last 500)
  cache/               # cached API responses (TTL-based)
  recap-cache.json     # last AI-generated recap (avoid re-synthesis on restart)
```

---

## 4. Data Model & GitHub Integration

### 4.1 `gh` CLI Commands Used

| Purpose | Command |
|---------|---------|
| List issues | `gh issue list -R owner/repo --json number,title,labels,author,createdAt,updatedAt,comments,state --limit 200` |
| Issue detail | `gh issue view N -R owner/repo --json number,title,body,comments,labels,author,createdAt,updatedAt` |
| List PRs | `gh pr list -R owner/repo --json number,title,author,state,isDraft,reviewDecision,statusCheckRollup,createdAt,updatedAt,labels --limit 50` |
| PR detail | `gh pr view N -R owner/repo --json number,title,body,comments,reviews,files,additions,deletions,statusCheckRollup` |
| Action runs | `gh run list -R owner/repo --json databaseId,displayTitle,status,conclusion,event,createdAt,updatedAt,workflowName --limit 30` |
| Run detail | `gh run view ID -R owner/repo --json jobs` |
| Run logs | `gh run view ID -R owner/repo --log` |
| Workflow files | `gh api repos/owner/repo/contents/.github/workflows` |
| Add comment | `gh issue comment N -R owner/repo --body "..."` |
| Merge PR | `gh pr merge N -R owner/repo --squash` |
| Events (poll) | `gh api repos/owner/repo/events --paginate` |
| Repo metadata | `gh repo view owner/repo --json name,owner,description,defaultBranchRef` |

### 4.2 Local State (JSON files in `~/.repo-assist/`)

**`read-state.json`** — Tracks what the user has seen:
```json
{
  "fslaborg/Deedle#584": "2026-03-15T08:30:00Z",
  "fslaborg/Deedle#624": "2026-03-15T09:00:00Z",
  "fsprojects/FSharp.Formatting#1059": null
}
```
Key = `owner/repo#number`, Value = ISO 8601 timestamp of last view (null = never viewed).

**`command-log.json`** — Ring buffer of last 500 `gh` commands:
```json
[
  {
    "command": "gh api repos/fslaborg/Deedle/issues --jq '...'",
    "startedAt": "2026-03-15T08:00:01Z",
    "durationMs": 1230,
    "exitCode": 0,
    "mode": "read"
  }
]
```

**`cache/`** — TTL-based JSON files for offline access:
- `cache/fslaborg-Deedle-issues.json` (TTL: 5 min)
- `cache/fslaborg-Deedle-prs.json` (TTL: 5 min)
- `cache/fslaborg-Deedle-runs.json` (TTL: 5 min)
- etc.

### 4.3 Unread Detection

An issue/PR is "unread" if:
- `updatedAt` on the issue/PR > `last_read_at` in `read_state` table
- OR there is no `read_state` entry and the issue has comments from Repo Assist bot

When the user views an issue/PR detail, `last_read_at` is updated to `NOW()`.

---

## 5. Non-Functional Requirements

### Performance
- Initial load of 10 repos × 200 issues each should complete in < 30 seconds (parallelized `gh` calls)
- Subsequent refreshes use cache + incremental updates
- UI should remain responsive during background data fetching

### Security
- No tokens stored by the app — delegates entirely to `gh` CLI auth
- Local SQLite database is user-readable only (0600 permissions)
- No network calls except through `gh` CLI
- No telemetry, no analytics, no phone-home

### Reliability
- Graceful degradation when `gh` CLI is not installed or not authenticated
- Offline mode using cached data with clear "stale" indicators
- All `gh` command failures logged and surfaced in Command Log

### Scalability Targets
- 1–20 repositories monitored
- 10–50 automations across all repos
- 100–5000 issues across all repos  
- 10–100 PRs across all repos
- 30–500 action runs cached

---

## 6. Milestones

### M0: Technical Validation (Current)
- [x] PRD written (v0.3)
- [x] Electron + Vite + React + Primer scaffold running
- [ ] `gh` CLI bridge executing commands and returning JSON
- [ ] Basic left panel rendering repo tree with real data from Deedle/FSharp.Formatting
- [ ] WSL2 Electron window validated

### M1: Read-Only Dashboard
- [ ] Issue list with label grouping and unread indicators (bold)
- [ ] PR list with CI status badges and Repo Assist distinction
- [ ] Action runs list with status/conclusion
- [ ] AI-synthesized Recap (Top 5 actions with animated checklist UX)
- [ ] Command log panel (all `gh` commands visible)
- [ ] Config loaded from `.repo-assist` GitHub repo

### M2: Interactive Features
- [ ] Issue/PR detail view with GitHub-style markdown rendering
- [ ] `/repo-assist` comment composer
- [ ] Write-mode toggle with PR merge action
- [ ] Workflow spec viewer (YAML + agentic workflow markdown)
- [ ] Settings panel (edits `.repo-assist` repo config)

### M3: Polish & Distribution
- [ ] Cross-platform packaging (Electron Forge: .deb, .dmg, .AppImage)
- [ ] Auto-refresh with configurable polling
- [ ] Keyboard shortcuts (j/k navigation, Enter to open, m to merge)
- [ ] Dark/light theme toggle (Primer themes)
- [ ] Smooth animations: recap item transitions, loading states

---

## Appendix A: Repo Assist Workflow Tasks Reference

The app's Recap view maps to the 11 Repo Assist tasks:

| # | Task | Recap Relevance |
|---|------|----------------|
| 1 | Issue Labelling | Show newly labelled issues |
| 2 | Issue Investigation + Comment | **Primary** — show issues with new bot comments (unread) |
| 3 | Issue Investigation + Fix | Show new draft PRs linked to issues |
| 4 | Engineering Investments | Show dependency/CI PRs for review |
| 5 | Coding Improvements | Show improvement PRs for review |
| 6 | Maintain Repo Assist PRs | Show PRs with CI fixes applied |
| 7 | Stale PR Nudges | Show recently nudged PRs |
| 8 | Performance Improvements | Show performance PRs for review |
| 9 | Testing Improvements | Show testing PRs for review |
| 10 | Take Repo Forward | Show forward-progress PRs/issues |
| 11 | Monthly Activity Summary | **Primary** — parse as recap source |

## Appendix B: Key Design Decisions

1. **Electron desktop app**: Real native window on all platforms including WSL2 (via WSLg). No browser-based workaround.
2. **Config in `.repo-assist` GitHub repo**: Synced across machines. Fetched/updated via `gh api`.
3. **Local JSON files over SQLite**: Simpler, no native module compilation (avoids Electron rebuild issues with `better-sqlite3`). Sufficient for read-state tracking and caching.
4. **AI-synthesized recap**: Local AI model generates prioritized Top-N actions from multiple data sources. Not just a flat list — intelligent prioritization.
5. **Read-only default + write-mode toggle**: Prevents accidental writes. Clear mode indicator in toolbar.
6. **`gh` CLI over REST/GraphQL SDK**: Eliminates token management, leverages user's existing auth, provides transparency via command log.
7. **Primer React**: Matches GitHub's visual language exactly, maintained by GitHub, comprehensive component library.
8. **Polling over webhooks**: Simpler architecture. No publicly-reachable endpoint needed. Sufficient for a morning-check workflow.
