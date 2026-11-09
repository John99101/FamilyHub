---
name: remember-preference
description: Save a lasting preference or correction to the right Claude Code config file. Use when the user says things like "always…", "never…", "from now on…", "I prefer…", "remember that…", or corrects the same thing twice.
---

# Remember a preference

1. Restate the preference in one line, as a rule Claude can follow.
2. Pick where it belongs, and confirm with AskUserQuestion when it's unclear:
   - **This project, shared with the team**: the matching `.claude/rules/<topic>.md`, or `CLAUDE.md` if no topic fits.
   - **This project, just me**: `CLAUDE.local.md`.
   - **All my projects**: `~/.claude/CLAUDE.md`, plus the matching line in `~/.claude/cct-preferences.md` if it's a setup answer.
   - **Should be enforced, not just remembered** (e.g. "never run X"): suggest a hook or a permission rule in `settings.json` instead, and explain the difference.
3. Check for an existing line that says the same or the opposite. Update that line instead of adding a duplicate.
4. Write one short line. Show the user what changed and where.
