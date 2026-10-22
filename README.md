# FamilyHub

A small private website for the family (about 5 to 15 people), usable on
computers and phones and installable as an app. The app text is German.

- **Sign in with Google only.** Only mail addresses on an allow list get in;
  everyone else sees "Kein Zugang".
- **Family chat** in one room ("Familie"): text up to 2000 characters, name,
  Google photo and time, live updates, older messages in pages of 50.
  Members delete their own messages, admins any message. Not end to end
  encrypted (the settings page says so).
- **Börse** (markets): US indices, the 200 largest US stocks, a family
  watchlist of up to 10 symbols with small charts. Prices are delayed at least
  15 minutes, data from NGN Market. No trading, no advice, no alerts.
- **Einstellungen** (settings): allow list and admins (admins only), the
  watchlist, the market on/off switch (admins only), light or dark look, sign
  out.

Setup for the owner: see **[SETUP.md](SETUP.md)**.

## How it works

```
Browser (public/)                Firebase (Google, region europe-west3)
 plain HTML, CSS, JS modules      Hosting       serves public/ with strict security headers
 Firebase JS SDK 13.1.0  ───────► Auth          Google sign in
 (pinned, from gstatic)  ◄──────► Firestore     allow list, chat, watchlist, stored market data
                                  App Check     reCAPTCHA Enterprise (enforced after testing)
                                  Functions     marketUpdate (Node.js 22), every 30 min
                                     │          on US trading days, key from Secret Manager
                                     ▼
                                  NGN Market API (free plan, US endpoints)
```

- No server to run, no build step, no PHP. Hosting serves the files in
  `public/` as they are.
- **Who may do what is decided by `firestore.rules`**, not by the page. The
  page reads `config/access`; the rules only allow that for people on the list,
  so "readable" means "member" and "refused" means "Kein Zugang".
- **The browser never talks to NGN Market and never sees the key.** The
  scheduled Cloud Function fetches the data, stores a copy in Firestore, and the
  page shows only that copy.
- The service worker (`public/sw.js`) caches only the page files (HTML, CSS,
  JS, icons), never chat or market data.

### Data model (Firestore)

| Path | Content | Who writes |
| :- | :- | :- |
| `config/access` | `members: [mail]`, `admins: [mail]`, `updatedAt`, `updatedBy` | admins (first admin by hand) |
| `config/watchlist` | `symbols: [..]` (max 10), `updatedAt`, `updatedBy` | members |
| `config/market` | `enabled` (market on/off), `updatedAt`, `updatedBy` | admins |
| `rooms/{roomId}` | `name`, `createdAt` (room "familie"; more rooms later) | admins |
| `rooms/{roomId}/messages/{id}` | `uid`, `name`, `photo`, `text`, `createdAt` | the sender (delete: sender or admin) |
| `market/latest` | `updatedAt`, `quotes` (top 200), `indices`, `extras` (watchlist symbols outside the top 200) | Cloud Function only |
| `market/status` | state, pause time, calls used and remaining, quota reset, last error, unknown symbols | Cloud Function only |
| `market/calendar` | US market holidays (refreshed weekly) | Cloud Function only |
| `marketHistory/{symbol}` | `closes: { "YYYY-MM-DD": price }` for the small charts | Cloud Function only |

Everything else is denied. Message rules check: sender uid, server time, text
1 to 2000 characters (and not only spaces), name and photo equal to what Google
put into the sign in token, no other fields. Messages cannot be edited.

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
close" run, which also stores one closing price per watchlist symbol and day
(and fixes the previous day with the official `prev_close`).

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

Therefore the market part is built and tested, but ships **switched off**
(`config/market.enabled` is missing, which counts as off). An admin switches it
on in the app. SETUP.md step 3 contains a ready mail asking NGN Market for a
written OK. The page always shows "Kurse mit mindestens 15 Minuten Verzögerung
· Daten: NGN Market".

Also checked as replacements on request: liquid.trade (a trading app without a
public data API; its terms forbid copying prices and automated access) and
Quiver Quantitative (alternative data, paid API, terms forbid making the data
available to any third party). Neither fits.

### Security headers (firebase.json)

Content Security Policy allowing only this site, the pinned Firebase SDK
(`www.gstatic.com/firebasejs/`), Google sign in (`apis.google.com`,
`*.firebaseapp.com` frames), Firestore and Auth endpoints, App Check and
reCAPTCHA, and Google profile photos. Plus `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin`,
`Cross-Origin-Opener-Policy: same-origin-allow-popups` (needed for the Google
popup), and a `Permissions-Policy` that turns off camera, microphone and
location.

## Files

```
public/                 the website (served by Firebase Hosting)
  index.html            all screens: sign in, Kein Zugang, Chat, Börse, Einstellungen
  css/app.css           styles, mobile first, light and dark
  js/firebase-config.js web config of your project (not secret) and the App Check key
  js/firebase.js        loads the pinned Firebase SDK, emulators on localhost
  js/app.js             sign in, allow list check, navigation
  js/chat.js            chat
  js/markets.js         Börse page
  js/market-data.js     live copies of the market documents
  js/settings.js        settings
  js/ui.js              small helpers (safe text, German dates)
  js/theme-boot.js      applies light or dark before the page is drawn
  manifest.webmanifest  installable app
  sw.js                 service worker (page files only)
  icons/                own icons (house with heart), made by scripts/make-icons.mjs
functions/              Cloud Function (Node.js 22, firebase-functions v2 API)
  index.js              marketUpdate schedule
  ngn-client.js         small NGN Market client
  market.js             trading days, budget guard, parsing, the run itself
  firestore-store.js    reading and writing the market documents
  test/                 function tests with a stub API (no real calls)
  scripts/demo-stub-data.mjs   fills the LOCAL emulator with made up market data
tests/rules.test.js     security rules tests (Firestore emulator)
scripts/serve-local.mjs local web server with the same headers (for testing)
scripts/make-icons.mjs  draws the icons
firebase.json           Hosting, headers, Firestore, Functions, emulators
.firebaserc             project ID (familyhub-5355f)
firestore.rules         security rules
firestore.indexes.json  index settings (no composite indexes needed)
SETUP.md                step by step setup for the owner
```

## Development and tests

Node.js 24.12 or newer and Java 21 or newer are needed for the tests (the
deployed function runs on Node.js 22).

```
npm install
npm --prefix functions install
npm test               # 31 function tests + 35 rules tests
npm run emulators      # local site on http://127.0.0.1:5000, Emulator UI on :4000
npm run demo:market    # (second window) made up market data for the local site
```

Why a local web server instead of the Hosting emulator: with current Node
versions the Hosting emulator silently drops the custom headers from
`firebase.json`, so the security policy could not be tested.
`scripts/serve-local.mjs` applies exactly those headers, plus the local
emulator addresses.

When changing page files, also raise `VERSION` in `public/sw.js` and
`APP_VERSION` in `public/js/app.js`, so phones pick up the new version.

## Later ideas (not in this version)

- Push notifications
- Images and files in the chat
- More chat rooms (the data model already supports them)
- Price alerts
- Paid NGN Market features (single ticker details, official charts, movers)
- End to end encryption for the chat
