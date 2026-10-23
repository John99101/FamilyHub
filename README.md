# FamilyHub

A small private website for the family (about 5 to 15 people), usable on
computers and phones and installable as an app. The app is in German, English
and French (it follows the browser; changeable in the settings).

- **Sign in with Google only.** Only mail addresses on an allow list get in;
  everyone else sees "Kein Zugang".
- **Start** (home): greeting, the weekly overview by Claude, the next 7 days,
  upcoming birthdays, tasks for you, polls waiting for your vote, the newest
  chat messages, the weather.
- **Family chat**: the main room "Familie" plus rooms anyone can open, for
  everyone or only for chosen people. Text up to 2000 characters, replies,
  reactions, live updates, older messages in pages of 50, "new" markers.
  Members delete their own messages, admins any message. Not end to end
  encrypted (the settings page says so).
- **Kalender** (calendar): month view, appointments (one day, several days,
  every year) and birthdays with age.
- **Aufgaben** (tasks): quick add, who does it and by when, anyone can tick a
  task off, recently done tasks.
- **Mehr** (more): **Umfragen** (polls with one or several answers),
  **Rezepte** (family cookbook), **Kontakte** (contacts and emergency info,
  only admins edit), **Wetter** (weather for the family's places, from
  Open-Meteo), Börse, Risiko and Einstellungen.
- **Weekly overview**: every Sunday at 17:00 Berlin time, Claude Opus 5.5
  writes a short overview of the coming week in German, English and French
  from the calendar, due tasks and open polls.
- **Börse** (markets): US indices, the 200 largest US stocks, a family
  watchlist of up to 10 symbols with small charts. Prices are delayed at least
  15 minutes, data from NGN Market. No trading, no advice, no alerts.
- **Risiko** (risk): theoretical risk figures for the watchlist, computed in
  plain code from the closing prices the app stores (yearly volatility,
  biggest fall from a peak, distance to the high, 95 % daily loss, worst day,
  change, beta and correlation to the S&P 500, plus the whole watchlist), and
  a short daily summary in English and French written by Claude Opus 5.5.
  Describes the past only; no advice.
- **Einstellungen** (settings): language, light or dark look, the watchlist,
  the market and AI switches (admins only), allow list and admins (admins
  only), sign out.

Setup for the owner: see **[SETUP.md](SETUP.md)**.

## How it works

```
Browser (public/)                Firebase (Google, region europe-west3)
 plain HTML, CSS, JS modules      Hosting       serves public/ with strict security headers
 Firebase JS SDK 13.1.0  ───────► Auth          Google sign in
 (pinned, from gstatic)  ◄──────► Firestore     allow list, chat, watchlist, stored market data
                                  App Check     reCAPTCHA Enterprise (enforced after testing)
                                  Functions     marketUpdate (Node.js 22), every 30 min
                                     │          on US trading days; after the close it
                                     │          also computes the risk figures
                                     ▼
                                  NGN Market API (free plan, US endpoints)

                                  Functions     riskSummary, 17:15 New York time on weekdays
                                     │          sends only the computed figures
                                     │          weeklyDigest, Sunday 17:00 Berlin time
                                     │          sends the coming week's calendar entries,
                                     │          due tasks and open polls (nothing else)
                                     ▼
                                  Anthropic API (Claude Opus 5.5)

                                  Functions     cleanupRoom, when a room is deleted:
                                                deletes its messages

 Weather page ──────────────────► Open-Meteo (forecast and place search, no key,
                                  only the rough coordinates of saved places)
```

The timed functions run on Google's servers; no computer has to be on.
Keys (NGN_API_KEY, ANTHROPIC_API_KEY) live only in Secret Manager.

- No server to run, no build step, no PHP. Hosting serves the files in
  `public/` as they are.
- **Who may do what is decided by `firestore.rules`**, not by the page. The
  page reads `config/access`; the rules only allow that for people on the list,
  so "readable" means "member" and "refused" means "Kein Zugang".
- **The browser never talks to NGN Market or Anthropic and never sees a key.**
  The scheduled Cloud Functions fetch and compute, store a copy in Firestore,
  and the page shows only that copy. The one outside service the browser
  calls is Open-Meteo for the weather (free for non commercial use, no key,
  licence CC BY 4.0; the page credits it as "Open Meteo" with a link, because
  app text has no hyphens). It gets only the coordinates of the saved places,
  rounded to about 1 km.
- **Weekly overview** (`functions/digest.js`): the code collects the coming
  week (Monday to Sunday) itself; Claude only words it. Sent: titles, days,
  times and places of calendar entries, birthdays with age, due tasks with
  the first name of who does them, open poll questions. Never sent: notes,
  chat, contacts, recipes, mail addresses. Titles are marked as data, and
  Claude is told never to follow instructions in them. An empty week makes
  no request at all. Admins can switch it off (`config/digest`).
- **Numbers come from code, words from the AI.** `functions/risk.js` computes
  every figure (tested with hand checkable values). `functions/ai-summary.js`
  gives Claude only these numbers, with rules: use only the given figures, no
  news, no forecasts, never advise, at most 110 words per language, no hyphens
  or dashes. The answer comes back as JSON (`en`, `fr`) through structured
  outputs; hyphens and dashes are removed again as a safety net. If Claude
  declines, Anthropic's server side fallback (`fallbacks: "default"`) retries
  once on another model; a failed day keeps the last summary visible.
- The service worker (`public/sw.js`) caches only the page files (HTML, CSS,
  JS, icons), never chat or market data.

### Data model (Firestore)

| Path | Content | Who writes |
| :- | :- | :- |
| `config/access` | `members: [mail]`, `admins: [mail]`, `updatedAt`, `updatedBy` | admins (first admin by hand) |
| `config/watchlist` | `symbols: [..]` (max 10), `updatedAt`, `updatedBy` | members |
| `config/market` | `enabled` (market on/off), `aiEnabled` (AI summary on/off), `updatedAt`, `updatedBy`; missing values count as on | admins |
| `config/digest` | `enabled` (weekly overview on/off), `updatedAt`, `updatedBy`; missing counts as on | admins |
| `people/{uid}` | `name`, `mail`, `photo` as Google gave them (for names in lists) | each person, only their own |
| `rooms/familie` | `name`, `createdAt`, `last` (preview of the newest message) | an admin once (the app does it); `last`: everyone |
| `rooms/{roomId}` | `name`, `open`, `members: [mail]`, `createdBy`, `createdByName`, `createdAt`, `last` | creator (rename, members); delete: creator or admin; `last`: people in the room |
| `rooms/{roomId}/messages/{id}` | `uid`, `name`, `photo`, `text`, `createdAt`, optional `replyTo { id, name, text }`, `reactions { like: [uid], ... }` | the sender (delete: sender or admin); reactions: each person only their own |
| `events/{id}` | `title`, `date`, `endDate`, `time`, `place`, `note`, `kind` (event, birthday), `repeat` (none, yearly), `yearKnown`, created and updated fields | members; change and delete: creator or admin |
| `tasks/{id}` | `title`, `note`, `assignee` (mail or empty), `due`, `done`, `doneAt`, `doneBy`, created and updated fields | members; tick off: anyone; change: creator or admin; delete: creator, admin, or anyone once done |
| `polls/{id}` | `question`, `options` (2 to 10), `multi`, `closed`, `votes { uid: [answer numbers] }`, created fields | members; vote: each person only their own; close and delete: creator or admin |
| `recipes/{id}` | `title`, `category`, `servings`, `duration`, `ingredients`, `steps`, `source`, created and updated fields | members; change and delete: creator or admin |
| `contacts/{id}` | `name`, `group`, `phone`, `phone2`, `mail`, `address`, `note`, `updatedAt`, `updatedBy` | admins only (everyone reads) |
| `places/{id}` | `name`, `country`, `lat`, `lon`, created fields | members; delete: creator or admin |
| `digest/current` | `weekStart`, `weekEnd`, `de`, `en`, `fr`, `empty`, `model`, `usage`, `lastError` | Cloud Function only |
| `market/latest` | `updatedAt`, `quotes` (top 200), `indices`, `extras` (watchlist symbols outside the top 200) | Cloud Function only |
| `market/status` | state, pause time, calls used and remaining, quota reset, last error, unknown symbols | Cloud Function only |
| `market/calendar` | US market holidays (refreshed weekly) | Cloud Function only |
| `market/risk` | `asOf`, `windowDays` (60), `minDays` (20), `symbols` (figures per stock), `portfolio` (whole watchlist) | Cloud Function only |
| `market/riskSummary` | `asOf`, `en`, `fr`, `model`, `usage`, `lastError` | Cloud Function only |
| `marketHistory/{symbol}` | `closes: { "YYYY-MM-DD": price }` for the charts and risk figures (watchlist symbols and `$SPX`) | Cloud Function only |

Everything else is denied. Message rules check: sender uid, server time, text
1 to 2000 characters (and not only spaces), name and photo equal to what Google
put into the sign in token, a reply only to an existing message, no other
fields. The text of a message cannot be edited. Rooms for chosen people are
invisible to everyone else (also to admins), messages included: the app lists
rooms with two queries the rules can check (open rooms, and rooms whose
`members` contain your mail). Every created entry must carry the creator's
own uid and Google name and the server time.

One composite index is needed (`firestore.indexes.json`): tasks by `done`
and `doneAt` for the list of recently done tasks. `firebase deploy` creates
it.

### Market data (NGN Market)

Checked against https://docs.ngnmarket.com on 22 October 2026. Free endpoints
used: `GET /v1/us/tickers` (top 200 by market value, and a search per extra
watchlist symbol), `GET /v1/us/indices`, `GET /v1/us/market/holidays`.
Corrections to the notes from the brief:

- List endpoints wrap their rows one level deeper: `{ success, data: { data: [...], pagination }, meta }`.
- The holiday list also contains **early close** days (`early_close: true`,
  `close_time` like `13:00:00`); those are trading days with a shorter session,
  not closed days.
- The monthly quota resets on the account's **billing renewal day**
  (`meta.reset_at`), not on the 1st of the month.
- Calls rejected with `RATE_LIMITED`, `QUOTA_EXCEEDED` or a bad key do not
  count; `PLAN_REQUIRED`, `NOT_FOUND` and `SERVER_ERROR` do.
- US symbols are case sensitive. The app stores them in upper case (for
  example `AAPL`, `BRK.B`), which covers practically all common stocks.

Schedule: every 30 minutes 09:00 to 16:30 New York time, Monday to Friday. The
code skips 09:00 (before the open), weekends, full holidays, and the slots after
an early close. 16:30 (or 30 minutes after an early close) is the "after the
close" run, which also stores one closing price per watchlist symbol and day,
plus the S&P 500 as benchmark (and fixes the previous day with the official
`prev_close`), and then computes the risk figures (`market/risk`).

Budget guard: `meta.calls_remaining` is read after every answer. Below 300 the
run stops and all runs pause until `reset_at`; the page shows "Kurse pausiert
bis …". `429 RATE_LIMITED` pauses for `Retry-After` seconds, `429
QUOTA_EXCEEDED` until `reset_at`. Nothing is ever retried in a loop (the
function also has automatic retries switched off). Each run logs the calls it
made and the account totals. Call estimate: see SETUP.md section 7.

### Terms of Service (NGN Market)

The Terms (https://ngnmarket.com/terms, "last updated January 2026") do **not
clearly allow** showing the data to a private family group on the free plan:

- Section 11 licenses the data "for your personal or internal business
  purposes" only.
- Section 8 says you may not "transfer API access or data obtained through
  the API to any third party"; section 10 forbids redistributing content.
- The plans page lists "data redistribution rights" as a feature of the
  Business plan (299 USD per month).
- On the other hand, section 8 expects "public-facing" products built on the
  API (they must name NGN Market as the source), and the docs show apps for
  "your users".

The owner decided to ship the market part **switched on**, because the app is
for the owner's own private use, which fits the "personal" licence. A missing
`config/market` document counts as on; an admin can switch it off in the app
(`enabled: false`). Before other people are added to the allow list, the
question above applies again; SETUP.md step 3 contains a ready mail asking
NGN Market for a written OK. This matters now that the app is a family hub:
everyone on the allow list sees Börse and Risiko. Without NGN's OK, either
switch the market part off before inviting the family, or ask for a change
that shows these two pages only to admins (not built yet). The page always shows "Kurse mit mindestens 15
Minuten Verzögerung · Daten: NGN Market".

Also checked as replacements on request: liquid.trade (a trading app without a
public data API; its terms forbid copying prices and automated access) and
Quiver Quantitative (alternative data, paid API, terms forbid making the data
available to any third party). Neither fits.

### Security at a glance

Checked on 22 October 2026 (code review, `npm audit` with 0 findings in both
package folders, secret scan of the whole git history with 0 findings), and
again for the family hub parts on 23 October 2026.

| Layer | Protection |
| :- | :- |
| Sign in | Google only; verified mail; the rules also check the sign in provider |
| Access | allow list in `config/access`, checked by the rules on every read and write |
| Data | deny by default; every field of every write checked (`firestore.rules`, 68 tests); market, AI and overview documents written only by the functions |
| Allow list | only admins change it; entries must be lower case mail addresses without duplicates; an admin cannot remove themselves |
| Private rooms | invisible to everyone not listed, admins included; the rules check every message read and write against the room |
| Contacts | everyone in the family reads them (they may hold health notes); only admins write; phone links can only dial digits |
| Page | no HTML is ever built from data (text is always set as text); profile photos only from `googleusercontent.com` |
| Browser | strict Content Security Policy and headers (below); service worker stores page files only |
| Keys | only in Secret Manager, each one given only to the function that needs it; nothing secret in git |
| Server | no public endpoints: three functions run on a timer, one runs when a room is deleted; no automatic retries |
| AI | risk summary: numbers and stock names only. Weekly overview: the coming week's calendar titles, due tasks and poll questions, never notes, chat, contacts, recipes or mail addresses. Answers are shown as plain text |
| Weather | the browser asks Open-Meteo with rounded coordinates of saved places only |
| Costs | budget alert, NGN budget guard, Anthropic spend limit |
| Still to do by the owner | App Check (SETUP step 6) and the console steps in SETUP step 8 (2 Step Verification, key restriction, delete protection) |

Not protected against: someone who controls a family member's Google account,
or a device that stays signed in. The chat is not end to end encrypted, so
Google (as the host) could technically read it.

### Security headers (firebase.json)

Content Security Policy allowing only this site, the pinned Firebase SDK
(`www.gstatic.com/firebasejs/`), Google sign in (`apis.google.com`, and
frames only from this project's sign in domain
`familyhub-5355f.firebaseapp.com`; change it there if you ever use your own
domain for sign in), Firestore and Auth endpoints, App Check and reCAPTCHA,
Open-Meteo (`api.open-meteo.com`, `geocoding-api.open-meteo.com`) and Google
profile photos. Plus `Strict-Transport-Security` (https only for a
year), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin`, `Cross-Origin-Opener-Policy:
same-origin-allow-popups` (needed for the Google popup), and a
`Permissions-Policy` that turns off camera, microphone and location.

## Files

```
public/                 the website (served by Firebase Hosting)
  index.html            all screens and pages
  css/app.css           styles, mobile first, light and dark
  css/family.css        styles for the family hub pages, dialogs and chat extras
  js/firebase-config.js web config of your project (not secret) and the App Check key
  js/firebase.js        loads the pinned Firebase SDK, emulators on localhost
  js/app.js             sign in, allow list check, navigation, starts the pages
  js/family-data.js     live copies of the family documents (shared by the pages), names
  js/home.js            Start page
  js/chat.js            chat: rooms, replies, reactions, "new" markers
  js/calendar.js        Kalender page
  js/tasks.js           Aufgaben page
  js/polls.js           Umfragen page
  js/recipes.js         Rezepte page
  js/contacts.js        Kontakte page
  js/weather.js         Wetter page (Open-Meteo)
  js/dialog.js          dialogs and forms
  js/dates.js           calendar days, birthdays, entries on days (tested in Node)
  js/markets.js         Börse page
  js/risk-page.js       Risiko page (risk figures and AI summary)
  js/market-data.js     live copies of the market documents
  js/settings.js        settings
  js/strings.js         app text in German, English and French (plus strings-family.js)
  js/i18n.js            picks the language, fills the page text
  js/ui.js              small helpers (safe text, dates in the chosen language, cards)
  js/theme-boot.js      applies light or dark before the page is drawn
  manifest.webmanifest  installable app
  sw.js                 service worker (page files only)
  icons/                own icons (house with heart), made by scripts/make-icons.mjs
functions/              Cloud Functions (Node.js 22, firebase-functions v2 API)
  index.js              marketUpdate, riskSummary, weeklyDigest, cleanupRoom
  ngn-client.js         small NGN Market client
  market.js             trading days, budget guard, parsing, the market run
  risk.js               risk figures in plain code (volatility, drawdown, beta, ...)
  ai-summary.js         daily summary with Claude Opus 5.5 (prompt, request, checks)
  digest.js             weekly family overview with Claude Opus 5.5
  firestore-store.js    reading and writing the documents the functions use
  test/                 function tests with stub APIs (no real calls)
  scripts/demo-stub-data.mjs     fills the LOCAL emulator with made up market data and a demo summary
  scripts/demo-family-data.mjs   fills the LOCAL emulator with made up family data
tests/rules.test.js     security rules tests (Firestore emulator)
tests/rules-family.test.js  security rules tests for the family hub parts
tests/strings.test.js   app text checks (same keys in 3 languages, no dashes, "Mail")
tests/dates.test.js     calendar day checks (birthdays, several days, 29 February)
scripts/serve-local.mjs local web server with the same headers (for testing)
scripts/make-icons.mjs  draws the icons
firebase.json           Hosting, headers, Firestore, Functions, emulators
.firebaserc             project ID (familyhub-5355f)
firestore.rules         security rules
firestore.indexes.json  index settings (one composite index: recently done tasks)
SETUP.md                step by step setup for the owner
```

## Development and tests

Node.js 24.12 or newer and Java 21 or newer are needed for the tests (the
deployed function runs on Node.js 22).

```
npm install
npm --prefix functions install
npm test               # 13 text and date checks + 73 function tests + 68 rules tests
npm run emulators      # local site on http://127.0.0.1:5000, Emulator UI on :4000
npm run demo:market    # (second window) made up market data for the local site
npm run demo:family    # (second window) made up family data; sign in as chef@example.com
```

Why a local web server instead of the Hosting emulator: with current Node
versions the Hosting emulator silently drops the custom headers from
`firebase.json`, so the security policy could not be tested.
`scripts/serve-local.mjs` applies exactly those headers, plus the local
emulator addresses.

When changing page files, also raise `VERSION` in `public/sw.js` and
`APP_VERSION` in `public/js/app.js`, so phones pick up the new version.

## Later ideas (not in this version)

- Börse and Risiko visible only to admins (needed before inviting the family
  unless NGN Market agrees)
- Push notifications (new messages, birthdays, due tasks)
- Images and files in the chat, photo albums
- Repeating tasks (weekly chores)
- Shopping lists, gift wish lists, shared expenses
- Price alerts
- Paid NGN Market features (single ticker details, official charts, movers);
  with the Hobby plan, 2 years of price history could fill the risk figures
  at once instead of after 20 trading days
- More languages (add one more block in `public/js/strings.js`)
- End to end encryption for the chat
