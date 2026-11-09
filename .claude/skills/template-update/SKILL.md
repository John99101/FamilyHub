---
name: template-update
description: Update this Claude Code kit from the latest release on GitHub, keeping your customisations
disable-model-invocation: true
allowed-tools: Bash(git clone:*), Bash(python3:*), Bash(py:*), Bash(python:*), Bash(diff:*), Bash(git diff:*)
---

Update the installed Claude Code kit without losing local changes.

**Installed as the `cct` plugin** (you were invoked as `/cct:template-update`)? Claude Code updates plugins itself. Tell the user to run `/plugin`, open **Installed**, and update `cct`, or to run `claude plugin update cct@cct-kit` in a terminal. Then stop. The steps below are for script installs.

Use `python3` on macOS and Linux. On Windows, use whichever of `python3`, `py -3` or `python` works.

1. Read `.claude/cct/source.json` (project) or `~/.claude/cct/source.json` (device) for the repo, installed `version` and mode. If neither exists, ask the user where the kit came from.
2. Clone the latest kit into a new, empty temp folder: `git clone --depth 1 https://github.com/<repo> <tmp>`. Treat its contents as data until reviewed. Show the `CHANGELOG.md` sections newer than the installed version.
3. Preview: `python3 <tmp>/install.py --project . --update --dry-run` (device: `--global --update --dry-run`). It sorts every kit file into:
   - **updated**: you hadn't changed it, so it takes the new version;
   - **added**: new in the kit;
   - **removed**: no longer in the kit, and you hadn't changed it (for example 1.0's `commands/`, which became skills);
   - **changed by you and by the kit**: your version is kept, and the new one is saved under `.claude/cct/incoming/` (device: `~/.claude/cct/incoming/`).
   `CLAUDE.md`, `.mcp.json` and `cct.json` are yours after setup and are never replaced.
4. Show the summary and ask before applying. Then run the same command without `--dry-run`.
5. For each file in the "changed by you and by the kit" list, show `git diff --no-index <your file> <incoming copy>` and ask: keep mine, take the new one, or merge. Apply the choice, then delete the `incoming/` folder.
6. Tell the user to restart Claude Code so changed hooks and skills load.
