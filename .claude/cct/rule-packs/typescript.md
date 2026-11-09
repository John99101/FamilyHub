---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
---

# TypeScript / JavaScript

<!-- cct rule pack: /setup copies this into .claude/rules/, fills the specifics and narrows the paths. -->

## Project specifics
- Runtime: {{JS_RUNTIME}} · package manager: {{JS_PACKAGE_MANAGER}} (use only this one)
- Framework: {{JS_FRAMEWORK}} · module system: {{JS_MODULES}}
- Formatter/linter: {{JS_TOOLS}}

## Always
- Keep `strict` type checking. No `any`; use `unknown` and narrow it. No `@ts-ignore` without a comment explaining why (prefer `@ts-expect-error`).
- Prefer `const`, then `let`; never `var`. Use `===`.
- Type function parameters and exported return types explicitly. Let local types be inferred.
- Model variants with discriminated unions, not optional-field soup.
- Always `await` or return promises. No floating promises; handle rejections.
- Validate external data (API responses, env vars, user input) at the boundary, e.g. with the project's schema library.
- Named exports over default exports, unless the framework requires defaults (e.g. pages).
- In React: hooks only at the top level, stable `key`s on lists, no state derived in effects when it can be computed.
- Import from a package's public entry point, never from its internal `dist/` or `src/` paths.
