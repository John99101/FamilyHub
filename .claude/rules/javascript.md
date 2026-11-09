---
paths:
  - "public/**/*.js"
  - "functions/**/*.js"
  - "functions/**/*.mjs"
  - "tests/**/*.js"
  - "scripts/**/*.mjs"
---

# JavaScript

## Project specifics
- Runtime: browsers (no build step) and Node.js 22 for functions (24.12 or newer for tests) · package manager: npm (use only this one)
- Framework: none in the browser; firebase-functions v2 · module system: ES modules everywhere
- Formatter/linter: none

## Always
- Prefer `const`, then `let`; never `var`. Use `===`.
- Always `await` or return promises. No floating promises; handle rejections and show the user a toast or message.
- Build DOM with the `el()` helper from `public/js/ui.js`; never `innerHTML` with data.
- Visible text comes from the string tables through `t()`, never hard-coded in a page module.
- Validate external data (Firestore documents, API answers, user input) where it enters; the security rules are the real gate.
- Named exports. Keep browser code free of Node-only APIs and functions code free of browser APIs.
- New browser dependencies only as pinned files from the same gstatic version; ask first.
