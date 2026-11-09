---
name: debug-issue
description: Systematically find the root cause of a bug, failing test, crash or unexpected behaviour before changing code. Use when something is broken, an error message is pasted, or a test fails and the cause isn't obvious.
---

# Debug an issue

1. **Reproduce.** Get the exact error, command and input. Run it yourself. If you can't reproduce it, ask for what's missing before going further.
2. **Narrow it down.** Read the full stack trace. Check recent changes (`git log -p -5 -- <file>`, `git diff`). Bisect by input, commit (`git bisect`) or code path.
3. **Form one hypothesis at a time.** Say it, then test it with a log line, a debugger or a minimal script. Remove temporary logging afterwards.
4. **Fix the root cause**, not the symptom. If the fix is a workaround, say so.
5. **Add a regression test** that fails without the fix (see the write-tests skill).
6. **Report** in three lines: cause, fix, how it's verified.

Don't change code on a guess. If two hypotheses fail, step back and list what you know for certain.
