---
name: write-tests
description: Write or extend tests for new or changed code, following the project's test framework and conventions. Use when adding a feature, fixing a bug, or when the user asks for tests or more coverage.
---

# Write tests

1. Read `.claude/rules/testing.md` and the **Commands** table in `CLAUDE.md` for the framework and how to run tests.
2. Find two or three existing tests near the code. Copy their structure, naming, fixtures and helpers.
3. List the behaviours to cover: the main path, edge cases (empty, zero, max, unicode), error paths, and for a bug fix the exact failing case.
4. For a bug fix, write the test first and run it to confirm it fails for the right reason.
5. Write the tests. Fake the network, time and randomness. Keep each test focused on one behaviour.
6. Run the new tests, then the surrounding suite. Fix until green.
7. Report what's covered and anything deliberately left out.

For a large test task, delegate to the **test-writer** agent.
