# FamilyHub

A private website and installable app for families and other groups (about 5 to 15 people each) on Firebase only: chat with Claude translations, calendar, tasks, polls, trips, vouchers (gifts of time), notice board, family tree, question of the day, recipes, contacts, weather, a simple mode for grandparents, plus a markets page with risk figures. Sign in with Google or mail and password; everything lives inside groups people join with a group code and password (checked by a callable function). What matters most: the security rules, the family's privacy, and never touching the live project by accident. Full feature list and data model: `README.md`; owner setup and costs: `SETUP.md`.

## Tech stack

- Languages: JavaScript (ES modules, no build step, no TypeScript), Firestore security rules
- Frameworks: none in the browser (plain HTML, CSS, JS; Firebase JS SDK 13.1.0 pinned from gstatic); Cloud Functions v2 (firebase-functions 7.4.0, Node.js 22) with the Anthropic SDK
- Package manager: npm (root and `functions/` each have their own `package.json`)
- Data and services: Firebase Hosting, Auth (Google, mail and password), Firestore (europe-west3), Cloud Functions, Secret Manager, App Check; NGN Market API; Anthropic API (Claude Opus 5.5); Open-Meteo from the browser

## Commands

| Task | Command |
|---|---|
| Install | `npm install` and `npm --prefix functions install` |
| Run (dev) | `npm run emulators` (site on http://127.0.0.1:5000, Emulator UI on :4000), then `npm run demo:family` and `npm run demo:market` in a second window |
| Test (all) | `npm test` (quick checks, function tests, rules tests in the Firestore emulator) |
| Test (one) | `node --test tests/<file>.test.js` · functions: `node --test functions/test/<file>.test.js` · rules tests need `npm run test:rules` (starts the emulator) |
| Build | none; Hosting serves `public/` as it is |

There is no linter, formatter or type checker.

## Architecture

- `public/` the website. `js/app.js` signs in, opens the active group and routes; `js/start.js` has mail sign in, the group list and the group wizard; `js/firebase.js` puts every data path under `groups/{active}/` (`js/scope.js`); `js/design.js` applies the group look as CSS variables; each page has its own module (`chat.js`, `calendar.js`, `trips.js`, `tree.js`, ...). `js/family-data.js` keeps live copies of shared documents. Text lives in `js/strings*.js` (de, en, fr). `sw.js` caches page files only.
- `functions/` Cloud Functions: `marketUpdate`, `riskSummary`, `weeklyDigest` (timers), `translateMessage`, `cleanupRoom`, `cleanupHousehold`, `cleanupGroup` (Firestore triggers), `createGroupCall`, `joinGroupCall`, `setGroupPasswordCall` (callables, `groups.js`). `migrate.js` plus `scripts/migrate-to-groups.mjs`: one time move into the group "Familie". Keys only in Secret Manager.
- `firestore.rules` decides who may do what; the page only shows what the rules allow. All group data lives under `groups/{g}/` (members in `groups/{g}/members/{uid}`); households are under `groups/{g}/households/{h}/`. Outside the groups: `nicknames`, market data, `marketAccess`, group codes and secrets.
- `tests/` rules tests (emulator) and Node checks; `functions/test/` function tests with stub APIs.
- Data flow: browser ↔ Firestore directly; functions write market data, AI texts and translations; the browser never sees a key and never calls Anthropic or NGN.

## Conventions

Topic rules in `.claude/rules/` load automatically; some load only when you work on matching files:

- `code-style.md` — formatting, naming, structure
- `javascript.md` — JavaScript in `public/` and `functions/`
- `testing.md` — how tests are written and run
- `security.md` — secrets, input handling, dependencies
- `git-workflow.md` — branches and commits

Hard rules from the owner:

- FamilyHub is completely separate from Train2Track. Never read, change or deploy anything in `D:\DBTTracking` or `D:\Train2Track_public`, and never use the Firebase project `dtracking-f4cd6`.
- The firebase CLI is logged in to the live project `familyhub-5355f`. Every firebase command must carry `--project demo-familyhub`. Never run `firebase deploy` or `secrets:set` against the real project; the owner deploys and pushes.
- Never put backticks or `$(...)` inside double-quoted shell strings (that once ran a deploy by accident). Write text with the Edit and Write tools or with script files in the scratchpad.
- Never put secrets (API keys, service account files, passwords) into code, git or chat.
- No PHP, no server the owner has to run.
- App text exists in German, English and French with the same keys. No hyphen or dash characters in visible app text; write "Mail", never "E-Mail". French uses a no-break space before `? : ; ! %`.
- Never build HTML from data: set text with `el(..., { text })` or `textContent`.
- When page files change, raise `VERSION` in `public/sw.js` and `APP_VERSION` in `public/js/app.js`, and add new files to the `sw.js` cache list.
- Keep `README.md` and `SETUP.md` in step with features, functions and costs.

## Working agreements

- Work independently on building and testing; ask before risky or hard to undo steps, new dependencies (always ask before installing anything globally), or anything touching the live Firebase project.
- Every change with new logic or new rules gets tests; run `npm test` before each commit.
- Commit locally only; never push or deploy.
- When something is unclear, choose the simplest safe option, note it in the report, and go on.

## Tools for Claude

- Commands: `/setup` re-tunes this config · `/check` runs lint and tests · `/review-changes` reviews the diff · `/commit` commits in house style · `/template-update` updates the kit
- Agents: `planner`, `reviewer`, `test-writer`, `security-auditor`
- Personal, uncommitted notes: `CLAUDE.local.md` (see `CLAUDE.local.md.example`)
