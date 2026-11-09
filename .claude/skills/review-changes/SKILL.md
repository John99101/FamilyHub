---
name: review-changes
description: Review uncommitted changes with the reviewer and security-auditor agents
argument-hint: "[focus]"
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git diff:*)
---

## Current changes

!`git status --short`

!`git diff HEAD --stat`

## Task

1. Use the **reviewer** subagent on these changes. If they touch auth, input handling, secrets, SQL or dependencies, also run the **security-auditor** subagent in parallel.
2. Merge their findings, drop duplicates, rank by severity.
3. Ask which ones to fix. Don't change code before the user picks.

Extra focus from the user: $ARGUMENTS
