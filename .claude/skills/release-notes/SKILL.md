---
name: release-notes
description: Draft release notes from the commits since the last git tag. Use when preparing a release.
---

# Release notes

1. Find the latest tag with `git describe --tags --abbrev=0`. If there is none, use the first commit.
2. List commits since then with `git log <tag>..HEAD --oneline`.
3. Group them into **Added**, **Changed**, **Fixed** and **Removed**.
4. Write short, user-facing bullet points. Skip internal chores.
5. Show the draft. Don't write it to a file unless asked.
