---
paths:
  - "**/*.rs"
  - "**/Cargo.toml"
---

# Rust

<!-- cct rule pack: /setup copies this into .claude/rules/, fills the specifics and narrows the paths. -->

## Project specifics
- Edition: {{RUST_EDITION}} · MSRV: {{RUST_MSRV}}
- Error crates: {{RUST_ERROR_CRATES}}

## Always
- Code passes `cargo fmt` and `cargo clippy -- -D warnings`.
- No `unwrap()` or `expect()` in library code or request paths. Propagate with `?`. Use `expect("why this can't fail")` only for real invariants.
- Library errors are typed enums (e.g. `thiserror`); applications may use `anyhow` with `.context(...)`.
- Borrow before you clone. Take `&str` / `&[T]` in parameters and return owned types.
- No `unsafe` without a `// SAFETY:` comment explaining why the invariants hold. Ask before adding new `unsafe`.
- Prefer iterators and pattern matching over index loops and nested `if let`.
- Unit tests in a `#[cfg(test)] mod tests` next to the code; integration tests in `tests/`.
- Public items get `///` docs with an example when the use isn't obvious.
