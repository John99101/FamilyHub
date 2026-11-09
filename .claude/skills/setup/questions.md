# Setup question bank

Ask only what you couldn't detect and isn't in `~/.claude/cct-preferences.md`. Put the recommended option first and mention what you detected. Device mode asks the **Personal** and **Safety** groups; project mode asks **Project**, plus **Personal** only if nothing is saved.

## Personal (saved across projects)

| Key | Question | Options |
|---|---|---|
| `language` | Which language should I reply in? | Same as you write (rec.) · English · German · Other |
| `verbosity` | How detailed should my replies be? | Short summaries (rec.) · Detailed explanations · Minimal |
| `experience` | How should I pitch technical explanations? | Experienced developer · Learning, explain more · Non-technical |
| `autonomy` | How independently should I work? | Ask before big or risky changes (rec.) · Ask before every change · Work independently, report after |
| `ask_before` (multi) | What should I always ask about first? | Adding dependencies · Deleting files · Changing public APIs · Database migrations |
| `test_approach` | How should tests be handled? | Write tests with every change (rec.) · Test-first (TDD) · Only when asked |
| `commit_style` | Commit message style? | Conventional Commits (`feat:`, `fix:`) (rec. if no history) · Plain sentences · Match existing history |
| `model` | Default model? | Leave Claude Code's default (rec.) · Opus (strongest) · Sonnet (faster, cheaper) · Haiku (fastest) |
| `agent_models` | Models for the helper agents? | Planner on Opus, others inherit (rec.) · All inherit my model · All on Sonnet |

## Safety

| Key | Question | Options |
|---|---|---|
| `guard_level` | How strict should the safety guard be? | Standard: block destructive, ask on risky (rec.) · Strict: also ask before push, new dependencies, any delete · Off |
| `format_on_edit` | Auto-format files after I edit them? | Yes, with the project's formatter (rec.) · No |
| `lint_on_edit` | Lint files after I edit them and fix problems right away? | Yes, with the project's linter (rec.) · No |
| `protect_lockfiles` | Ask before I edit lockfiles by hand? | Yes (rec.) · No |
| `statusline` | Show a status line with model, branch, guard level and setup state? | Yes (rec.) · No, keep mine |

## Project (not saved globally)

| Key | Question | When to ask |
|---|---|---|
| overview | In one or two sentences, what is this project for? | README doesn't say clearly. Offer your guess as option 1. |
| commands | Which command runs the tests / dev server / build? | Several candidates or none found. List the candidates. |
| test framework | Which test framework is current? | Several configs found. |
| conventions | Any conventions I should know that aren't in the code (naming, folder rules, things to avoid)? | Always once, as an open question; "None" is option 1. |
| rules (multi) | Which rule files should this project keep? | Show code-style, testing, api-design, security, git-workflow, plus a suggested language rule. Pre-select the ones that apply. |
| packages (multi) | Which monorepo packages should get their own CLAUDE.md? | Monorepo detected. Pre-select apps and services. |
| mcp (multi) | Connect any tools via MCP? | Offer from `mcp-catalog.json` what fits the detected stack: GitHub if the remote is GitHub, Postgres if the DB is Postgres, Jira or Slack if mentioned in docs. |
| branch policy | Work on feature branches or commit to the default branch? | No clear pattern in history. |

## Saved preferences file

Write `~/.claude/cct-preferences.md` like this, so later setups can reuse it:

```markdown
# Claude Code kit — saved preferences
<!-- Read by the setup skill. Edit freely. -->
updated: 2026-01-31

- language: same as user
- verbosity: short summaries
- experience: experienced developer
- autonomy: ask before big or risky changes
- ask_before: adding dependencies, deleting files
- test_approach: write tests with every change
- commit_style: conventional commits
- model: default
- agent_models: planner opus, others inherit
- guard_level: standard
- format_on_edit: yes
- lint_on_edit: yes
- protect_lockfiles: yes
- statusline: yes
```
