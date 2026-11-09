---
name: check
description: Run lint, type checks and tests; summarise and fix failures
argument-hint: "[path or test name]"
disable-model-invocation: true
---

Run this project's checks, using the commands in the **Commands** table of `CLAUDE.md` (in a monorepo, the nearest package's `CLAUDE.md`):

1. Lint, then type check (if the project has one), then tests. Limit to `$ARGUMENTS` if given.
2. If a command is missing from `CLAUDE.md`, find it in the project config (`package.json` scripts, `Makefile`, `pyproject.toml`…), run it, and offer to add it to `CLAUDE.md`.
3. Report a short pass/fail table.
4. Fix failures caused by recent changes. For failures that look unrelated or need a design decision, explain and ask first.
5. Re-run until green or until you need the user.
