---
paths:
  - "**/*.go"
  - "**/go.mod"
---

# Go

<!-- cct rule pack: /setup copies this into .claude/rules/, fills the specifics and narrows the paths. -->

## Project specifics
- Go version: {{GO_VERSION}} · linter: {{GO_LINTER}}
- Layout: {{GO_LAYOUT}}

## Always
- Code is `gofmt`-formatted; imports grouped standard library first.
- Return errors, don't panic, except for truly unrecoverable startup errors. Wrap with context: `fmt.Errorf("load config: %w", err)`.
- Check every error. Compare with `errors.Is` / `errors.As`, never by string.
- Pass `context.Context` as the first parameter to anything that does I/O or may block; respect cancellation.
- Accept interfaces, return concrete types. Define interfaces where they're used, and keep them small.
- Every goroutine has a clear owner and a way to stop. Guard shared state with a mutex or a channel; run tests with `-race`.
- Table-driven tests with `t.Run` subtests; use `t.Helper()` in helpers and `t.TempDir()` for files.
- Exported names get doc comments starting with the name.
- No package-level mutable state unless it's set once at startup.
