---
name: commit
description: Write a commit message that follows this project's style and commit the staged changes
argument-hint: "[what to commit, in plain words]"
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*)
---

## State

!`git status --short`

!`git diff --cached --stat`

!`git log --oneline -10`

## Task

1. If nothing is staged, show the changed files and ask what to include (or use `$ARGUMENTS` if it says). Never stage `.env`, secrets, build output or local config.
2. Write the message in the style from `.claude/rules/git-workflow.md`. Match the recent log above if the rule is unset.
3. Commit. Don't push.
4. Show the commit hash and message.
