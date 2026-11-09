---
name: setup
description: Set up, finish or re-tune the Claude Code configuration (CLAUDE.md, rules, settings, MCP servers, agents, hooks) for a project or for this device. Use when a "[cct]" session notice says setup is pending, right after installing the Claude Code kit, when the user runs /setup, or when they want to change how Claude works in a project.
argument-hint: "[project | device | --defaults | what to change]"
---

# Setup

Finish this Claude Code kit so it fits **this project** and **this user**. Detect what you can, ask about what you can't, show the plan, then write it.

Arguments from the user: $ARGUMENTS

## Ground rules

- **Ask when unsure. Never guess at preferences.** Use AskUserQuestion: up to 4 questions per round, recommended option first, and say in the question what you detected ("Found Jest and Vitest configs. Which is current?").
- **Don't ask what you already know.** Detect from files first. Reuse saved answers from `~/.claude/cct-preferences.md` and list them in the plan instead of asking again.
- **Never write secrets** into any file. MCP configs use `${ENV_VAR}` references.
- **Never drop user-written content** from an existing `CLAUDE.md` or rule without asking.
- Keep each `CLAUDE.md` under ~150 lines. Put topic detail in `.claude/rules/`.
- Don't commit or push. Offer `/commit` at the end.
- **Claude Code protects the `.claude/` folder** and asks before each write there, even in auto-accept mode. Before writing (step 5), tell the user in one line to expect these prompts and that "allow for this session" saves clicking through each one. If a write is refused, say which file and stop; don't remove the setup marker until every file is written.

### Non-interactive mode (`--defaults`)

If the arguments contain `--defaults`, don't ask any questions and don't wait for plan approval. Use the detected value, or the saved preference, or the **recommended** option from the question bank. Skip MCP servers unless the stack clearly needs one, and don't save preferences. Everything else, including verification, runs as normal. End with a list of every choice made by default. This mode exists for automated tests and for users who want a quick start.

## 0. Pick the mode

| Mode | When |
|---|---|
| **Project** | `.claude/cct-pending` exists in the project, or the user wants this project set up. |
| **Device** | `~/.claude/cct-pending` exists, or the user wants defaults for all projects on this machine. |
| **Re-tune** | No marker; the user ran `/setup` again. Read the current config and ask what to change (the arguments may say). |

If both markers exist, ask which to do first. Device first is usually better because its answers feed project mode. With `--defaults`, do project mode.

**Python command.** On macOS and Linux it's `python3`. On Windows, use whichever of `python3`, `py -3` or `python` works (check with `<cmd> --version`). Below, `python3` means that command.

**Repo created with "Use this template"?** If the project root has `install.py` and `rule-packs/` but no `.claude/cct/source.json`, it's a raw copy of the kit, including the kit's own tests, CI, docs and license. Before anything else, show the user the output of `python3 install.py --adopt --dry-run` and, once they agree, run `python3 install.py --adopt`. It turns the copy into a normal install (skills, rules and hooks into `.claude/`, a manifest for updates and uninstall) and removes the kit's development files. Then tell them to restart Claude Code and run `/setup` again, because the skills and hooks it just installed load at session start. With `--defaults`, run it without asking.

**Running as the `cct` plugin** (you were invoked as `/cct:setup`)? Then there's no installer:
- Device mode writes `~/.claude/CLAUDE.md`, `~/.claude/cct.json` and preferences as usual.
- Project mode creates the project's `CLAUDE.md` from `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.project.md` and its `.claude/rules/` from `${CLAUDE_PLUGIN_ROOT}/rules/`. Don't copy skills, agents or hooks into the project; the plugin provides them.
- **Status line:** plugins can't set one directly. If the user wants it (ask once, in device mode or the first project), run `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/enable_statusline.py" "${CLAUDE_PLUGIN_DATA}"`. It copies the status line into the plugin's data folder, which survives updates, and points `~/.claude/settings.json` at it. It never replaces a status line of the user's own; exit code 3 means one exists, so ask before re-running with `--force`. To turn it off: add `--disable`.

## 1. Load what's known

Read, if present:
- `~/.claude/cct-preferences.md`: saved answers from earlier setups.
- `~/.claude/CLAUDE.md` and `~/.claude/rules/`: device-wide instructions.
- Project: `CLAUDE.md`, `.claude/cct/CLAUDE.template.md` (the installer saves the template there when a `CLAUDE.md` already existed), `CLAUDE.local.md`, `AGENTS.md`, `.cursorrules`, `.cursor/rules/`, `.github/copilot-instructions.md`, `CONTRIBUTING.md`, `README.md`. Carry over the conventions they contain.

The kit's extra files are `rule-packs/` (ready-made language rules) and `CLAUDE.package.md` (template for monorepo packages). Look for them in this order, and use the first that exists:
1. `.claude/cct/` (project install)
2. `~/.claude/cct/` (device install)
3. `${CLAUDE_PLUGIN_ROOT}/rule-packs/` and `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.package.md` (plugin install; if that path still starts with `${`, this isn't the plugin)
4. `rule-packs/` and `templates/CLAUDE.package.md` in the project root (a "Use this template" copy you haven't adopted yet)

Below, `.claude/cct/` means whichever location you found.

## 2. Detect (project mode)

| Look at | To learn |
|---|---|
| `package.json`, `pyproject.toml`, `requirements*.txt`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle*`, `Gemfile`, `composer.json`, `pubspec.yaml`, `*.csproj`, `Package.swift`, `deno.json` | Languages, frameworks, scripts |
| Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock*`, `uv.lock`, `poetry.lock`…) | Package manager |
| `jest.config.*`, `vitest.config.*`, `pytest.ini`, `[tool.pytest]`, `*_test.go`, `playwright.config.*` | Test framework, test locations |
| `.eslintrc*`, `eslint.config.*`, `biome.json`, `.prettierrc*`, `[tool.ruff]`, `.golangci.yml`, `rustfmt.toml`, `.editorconfig` | Linter, formatter, style |
| `tsconfig.json`, `mypy.ini`, `[tool.mypy]` | Type checking |
| `Makefile`, `justfile`, `Taskfile.yml`, `package.json` scripts | Real install/run/test/lint/build commands |
| `.github/workflows/`, `.gitlab-ci.yml` | What CI runs (the source of truth for checks) |
| `docker-compose*.yml`, `.env.example`, ORM config (`prisma/`, `alembic/`, `migrations/`) | Databases and services, which MCP servers might help |
| Top-level dirs, entry points (`src/main.*`, `app/`, `cmd/`) | Architecture summary |
| `git log --oneline -30`, `git branch -a`, `git remote -v` | Commit style, branch naming, default branch, GitHub/GitLab |
| `pnpm-workspace.yaml`, `"workspaces"` in `package.json`, `nx.json`, `turbo.json`, `lerna.json`, `[workspace]` in `Cargo.toml`, `go.work`, `[tool.uv.workspace]` | **Monorepo**: package list and locations (see §5b) |

Also check tools: `python3` (the hooks need it; warn if missing), and the formatter and linter binaries the hooks would call.

Run read-only commands only. Ask before running install, build or test commands that are slow or change files.

## 3. Ask

Use the question bank in [questions.md](questions.md). Pick only questions whose answers you couldn't detect and that aren't saved. A first-time project typically takes 2–3 rounds; a re-tune often takes 1.

## 4. Show the plan and confirm

Show a short plan: each file to create or change, with the key values (commands, test framework, guard level, MCP servers, models, saved preferences reused). Then ask: **Apply** (recommended) / **Change something** / **Cancel**.

## 5. Write

**Project mode**
- `CLAUDE.md`: fill every `{{…}}`. Delete table rows for commands that don't exist. If the user had a `CLAUDE.md`, merge the template's sections into it instead of replacing it.
- `.claude/rules/*.md`: fill the "Project specifics" sections. Set `paths:` globs to the project's real directories. If a rule doesn't apply (e.g. `api-design.md` in a CLI with no API), ask, then remove it.
- **Language rules:** for each main language, copy the matching pack from `.claude/cct/rule-packs/` (`python.md`, `typescript.md`, `go.md`, `rust.md`, `java.md`) into `.claude/rules/`, fill its specifics and narrow its `paths:`. Only write a language rule from scratch when no pack exists, using the same structure.
- `.claude/settings.json`: add `allow` entries for the exact detected safe commands (test, lint, format, type check, e.g. `Bash(npm run test:*)`). Set `"model"` only if the user chose one. Keep the `hooks` block. Remove `statusLine` if the user doesn't want the status line.
- `.claude/cct.json`: `guard_level`, `format_on_edit`, `lint_on_edit`, `protect_lockfiles` from the answers.
- `.mcp.json`: add the chosen servers from [mcp-catalog.json](mcp-catalog.json), copying only each entry's `config` object under `mcpServers.<name>`. The catalog is checked weekly, but if unsure, check the vendor's docs. List every env var the user must set.
- `.claude/agents/*.md`: set `model:` per the user's answers. Remove agents they don't want.
- `.gitignore`: make sure `.claude/settings.local.json`, `CLAUDE.local.md`, `.env` and `.env.*` (but not `.env.example`) are ignored.

### 5b. Monorepos

Claude Code loads a `CLAUDE.md` from a subfolder when it works in that folder, so give each package its own short brief instead of one huge root file.

1. List the workspace packages. Ask which ones to set up (multi-select, apps and services pre-selected). With `--defaults`, take up to 10, apps first.
2. The **root `CLAUDE.md`** gets the overview, shared tooling, workspace-wide commands (e.g. `pnpm -r test`, `turbo run build`), and a **package map**: a table of path → one-line purpose → main language.
3. Each chosen package gets **`<package>/CLAUDE.md`** from `.claude/cct/CLAUDE.package.md`: its purpose, stack, its own commands (run from the package folder, or with the workspace filter, e.g. `pnpm --filter api test`), and how it depends on other packages.
4. Scope language rules to the packages that use them, e.g. `paths: ["packages/api/**/*.py"]`.

**Device mode**
- `~/.claude/CLAUDE.md`: personal preferences for all projects, from `~/.claude/cct/CLAUDE.user.template.md`, merged into any existing file.
- `~/.claude/rules/`: keep only rules that make sense everywhere (security, git workflow, general code style). Remove project-specific placeholders or move them to "decide per project". Delete `api-design.md` and `testing.md` from the device rules unless the user wants global defaults.
- `~/.claude/cct.json` and, if chosen, `"model"` in `~/.claude/settings.json`.

## 6. Verify

- JSON parses: `python3 -m json.tool <file> >/dev/null` for every JSON you touched.
- No placeholders left: `grep -rn '{{' CLAUDE.md .claude/rules` (plus any package `CLAUDE.md`; device: `~/.claude/CLAUDE.md ~/.claude/rules`).
- Hooks work: `echo '{"tool_input":{"command":"git status"}}' | python3 .claude/hooks/guard_bash.py` prints nothing; with `"rm -rf /"` it prints a `deny`.
- If the user agreed (and always with `--defaults` when it's fast), run the detected test or lint command once to confirm it's right.

## 7. Finish

1. Delete the marker: `.claude/cct-pending` (project) or `~/.claude/cct-pending` (device).
2. Unless in `--defaults` mode, ask whether to save the general answers to `~/.claude/cct-preferences.md` for future projects (format in [questions.md](questions.md)). Save only preferences that apply across projects, never project facts.
3. Tell the user, briefly:
   - what was set up, plus anything you couldn't detect;
   - env vars to set for MCP servers;
   - to restart Claude Code (or open `/hooks` and `/mcp`) so new hooks and MCP servers load;
   - that `/setup` re-tunes anything, `CLAUDE.local.md` holds personal overrides, and `/template-update` pulls kit updates.
