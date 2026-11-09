# Hooks

Event-driven scripts registered in `.claude/settings.json`. They need `python3` and nothing else.

| Script | Event | What it does |
|---|---|---|
| `session_start.py` | `SessionStart` | Tells Claude when setup is unfinished (`.claude/cct-pending`) so it offers `/setup`. |
| `guard_bash.py` | `PreToolUse` · `Bash\|PowerShell` | Blocks destructive commands (`rm -rf /`, `find / -delete`, `mkfs`, force-push or deleting `main`, `curl … \| sh`), including when they're hidden in `sh -c`, `eval`, `$(…)` or backticks. Asks before risky ones (`rm -r`, `git reset --hard`, `sudo`, `DROP TABLE`, publishing). |
| `protect_files.py` | `PreToolUse` · `Edit\|Write` | Blocks writes to `.env`, keys, `secrets/` and `.git/`. Asks before editing lockfiles or CI workflows. |
| `format_file.py` | `PostToolUse` · `Edit\|Write` | Formats the edited file with the project's formatter (prettier, biome, ruff, black, gofmt, rustfmt, shfmt), then lints it (eslint, biome, ruff, shellcheck) and **sends problems back to Claude** to fix right away. Never downloads anything. |
| `statusline.py` | `statusLine` | Shows `model · folder (branch) · guard level · setup state`. |
| `cct_config.py` | — | Shared helper: loads `cct.json`, and makes device-wide hooks step aside when the project has its own copy. |

## Tuning

Change behaviour in `.claude/cct.json` (project) or `~/.claude/cct.json` (all projects). The project file wins.

```json
{
  "guard_level": "standard",
  "format_on_edit": true,
  "lint_on_edit": true,
  "protect_lockfiles": true,
  "setup_reminder": true
}
```

- `guard_level`: `off` disables both guards; `strict` also asks before `git push`, adding dependencies and any `rm`.
- Hooks load when a session starts. After changing `settings.json`, restart Claude Code or review them with `/hooks`.
- The guard is a safety net, not a sandbox. For untrusted work, also turn on Claude Code's built-in sandbox (`/sandbox`).

## Adding your own

Drop a script into the project's `.claude/hooks/` and register it in `.claude/settings.json`. Use exec form (`command` plus `args`), which runs without a shell, so it works the same on macOS, Linux and Windows and handles paths with spaces:

```json
{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "python3", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/my_hook.py"] }] }
```

To ship a hook with the kit itself, add the script to the kit's `hooks/` folder and an entry to `hooks/hooks.json` (with `${CLAUDE_PLUGIN_ROOT}/hooks/…`). The installer builds project and device settings from that same file.

A `PreToolUse` hook blocks a tool call by printing a `permissionDecision` JSON, as `cct_config.decide()` does. Any hook can send a message to Claude by writing to stderr and exiting with code 2, as the lint step does. Add a test in `tests/test_kit.py`.
