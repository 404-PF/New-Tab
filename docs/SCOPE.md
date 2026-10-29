# Product Scope

The short answer to three questions the backlog keeps asking: who New Tab is for, what it must do better than the browser's default page, and what deliberately stays out. Check proposed issues against this note before prioritizing them — the `bug-find` and `feature-find` workflows reference it in their prompts.

## Core user

The person who opens a new tab dozens of times a day and wants that moment to be useful and pleasant instead of blank or ad-cluttered. They keep everyday tools — shortcuts, todos, search — one keystroke away, and they like the page to feel like theirs (background, clock, theme, fonts).

## Top three dashboard jobs

1. **Get to work fast** — app grid with built-in actions and custom shortcuts, plus an optional search box that uses the browser's default search provider.
2. **Capture and track today's tasks** — todo list with due dates, overdue state, filters, and progress tracking.
3. **Look and feel personal every day** — clock, date, daily motto, static/live/uploaded backgrounds, themes, colors, fonts, and simple mode.

Dashboard features should strengthen one of these three jobs first.

## Games hub

The Games hub (Snake, 2048, Memory Match, Flappy Bird, Pac-Man) is an **optional extra**, as the README has always presented it. Expected effort:

- Maintenance level: bug fixes, save/restore parity, and accessibility fixes across the shared modal shell.
- Per-game input work is low priority and must not outrank dashboard work.
- No new game titles until the three dashboard jobs above are solid.

## Out of scope

- Browser-level features the browser already owns: tab/session management, history, bookmarks, sync.
- New games, new game modes, or per-game input overhauls ahead of dashboard priorities.
- Non-Chromium ports, backend services, accounts, and telemetry.
- A bundler, transpiler, or build step; the extension runs directly from source.
