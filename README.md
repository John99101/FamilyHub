# FamilyHub

[![Tests](https://github.com/John99101/FamilyHub/actions/workflows/test.yml/badge.svg)](https://github.com/John99101/FamilyHub/actions/workflows/test.yml)

A small private website for families and other groups (about 5 to 15 people
each), usable on computers and phones and installable as an app. The app is
in German, English and French (it follows the browser; changeable in the
settings).

- **Sign in with Google, or with mail and password** (the mail must be
  confirmed first; "Passwort vergessen" sends a reset link).
- **Groups.** After signing in you open one of your groups, join one with its
  group code and group password, or start a new one. Everything below
  (chat, calendar, households, ...) belongs to one group; nobody outside it
  sees anything. A server function checks the password (stored only as a
  scrypt hash) and allows 5 wrong tries per person and 20 per group per hour.
- **Starting a group** takes five steps: name and picture, password (with a
  strength hint), which pages the group uses, the look, a summary. The
  person who starts a group is its first admin.
- **Gruppe** page: the group code to share, and for admins: name and
  picture, a new password, pages on or off, the look, members (make admin,
  remove). Everyone can switch group or leave (an admin only after losing the
  admin role); admins can delete the group with everything in it.
- **Look of a group** (admins, see it live while choosing): six styles (Ruhig,
  Warm, Wald, Meer, Verspielt, Nacht), each light and dark; own main, accent
  and background colors (changed automatically if they would be hard to
  read); 12 built in background pictures with a strength slider; four fonts
  (clear, round, classic, handwritten headings); round or square corners;
  normal or compact spacing; a welcome line and which start page cards show
  in which order. Light or dark stays each person's own choice. No uploads.
- **Start** (home): greeting, pinned notices, the weekly overview by Claude,
  the question of the day, the next trip, the next 7 days, upcoming birthdays,
  tasks for you, polls waiting for your vote, the newest chat messages, the
  weather.
- **Family chat**: the main room "Familie" plus rooms anyone can open, for
  everyone or only for chosen people. Text up to 2000 characters, replies,
  reactions, live updates, older messages in pages of 50, "new" markers.
  Members delete their own messages, admins any message. Not end to end
  encrypted (the settings page says so).
- **Translate chat messages**: tap **Übersetzen** under someone's message to
  read it in your app language (German, English or French), translated by
  Claude Opus 5.5. Only that one message is sent to Anthropic, for a fraction
  of a cent. Each translation is made once and shared by everyone in the
  room; at most 100 per person and day; admins can switch it off.
- **Simple mode** for grandparents: large text and only the essentials
  (today's and tomorrow's dates, big call buttons for important contacts, the
  main chat). Each person switches it on for their own device under
  **Einstellungen**; admins mark which contacts get a call button.
- **Kalender** (calendar): month view, appointments (one day, several days,
  every year) and birthdays with age. Each entry is "for" a person and shows
  in that person's color; entries over several days are a colored line from
  the first to the last day.
- **Colors and names**: everyone picks one of 16 colors (no color twice; a
  free one is given automatically on first sign in). Everyone can change the
  name the whole family sees ("Benni" instead of the Google name; no name
  twice, and "Google Namen verwenden" goes back). Everyone can also give the
  others their own names ("Mama"); only the person who gave a name sees it.
- **Households** (inside a group): admins set them up (for example "Zürich", "Bei Oma"); a
  person can be in several. Calendar entries, tasks and polls belong to the
  whole family or to one household, and each household has its own chat room
  and weekly overview. Only its members see what is in a household (admins
  who are not in it do not either). Recipes, contacts and weather stay shared.
- **Aufgaben** (tasks): quick add, who does it and by when, anyone can tick a
  task off, recently done tasks.
- **Mehr** (more): **Familie** (your name, colors, names for others,
  households), **Pinnwand**, **Reisen**, **Frage des Tages**, **Stammbaum**
  (all four below), **Umfragen** (polls with one or several answers),
  **Rezepte** (family cookbook), **Kontakte** (contacts and emergency info,
  only admins edit), **Wetter** (weather for the family's places, from
  Open-Meteo), Börse, Risiko and Einstellungen.
- **Pinnwand** (notice board and family notebook): short notices ("Müllabfuhr
  ist diese Woche am Dienstag"), optionally until a date, shown on the Start
  page; plus notebook pages with how to notes ("Heizung entlüften") that
  anyone in the group may improve (the page shows who changed it last).
- **Reisen** (trip planner): trips with destination, dates and who is
  coming, journeys with times, accommodation, and a plan for each day. Trips
  also show as a line in the calendar.
- **Frage des Tages** (question of the day): one question a day for the whole
  family (40 questions in turn, in three languages). You see the others'
  answers only after giving your own.
- **Stammbaum** (family tree): parents, children and partners with birth (and
  death) years, drawn as a tree with zoom. Tapping a person shows their
  birthday from the calendar; people who use the app show in their color.
  Everyone can add and change people.
- Notices, notebook pages and trips belong to the whole family or to one
  household, like calendar entries.
- **Weekly overview**: every Sunday at 17:00 Berlin time, Claude Opus 5.5
  writes a short overview of the coming week in German, English and French
  from the calendar, due tasks and open polls.
- **Börse** (markets): US indices, the 200 largest US stocks, a family
  watchlist of up to 10 symbols with small charts. Prices are delayed at least
  15 minutes, data from NGN Market. No trading, no advice, no alerts. Locked
  for new groups (an unlock code follows later); the group "Familie" has it.
  Only people with a `marketAccess` document see it.
- **Risiko** (risk): theoretical risk figures for the watchlist, computed in
  plain code from the closing prices the app stores (yearly volatility,
  biggest fall from a peak, distance to the high, 95 % daily loss, worst day,
  change, beta and correlation to the S&P 500, plus the whole watchlist), and
  a short daily summary in English and French written by Claude Opus 5.5.
  Describes the past only; no advice.
- **Einstellungen** (settings): language, light or dark look, simple mode
  for this device, the watchlist (with market access), the market switches
  (market admins), overview and translation switches (group admins), sign
  out.

Setup for the owner: see **[SETUP.md](SETUP.md)**.

## How it works

```
Browser (public/)                Firebase (Google, region europe-west3)
 plain HTML, CSS, JS modules      Hosting       serves public/ with strict security headers
 Firebase JS SDK 13.1.0  ───────► Auth          Google, or mail and password
 (pinned, from gstatic)  ◄──────► Firestore     groups and their data, watchlist, stored market data
                         ───────► Functions     createGroupCall, joinGroupCall, setGroupPasswordCall
                                                (called by the page: group passwords, codes, tries)
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
                                     │          translateMessage, when someone taps
                                     │          Übersetzen: sends that one message text
                                     ▼
                                  Anthropic API (Claude Opus 5.5)

                                  Functions     cleanupRoom, when a room is deleted:
                                                deletes its messages
                                  Functions     cleanupHousehold, when a household is deleted:
                                                deletes everything inside it
                                                (both also delete the rooms' translations)
                                  Functions     cleanupGroup, when a group is deleted:
                                                deletes everything inside it, its code and secret

 Weather page ──────────────────► Open-Meteo (forecast and place search, no key,
                                  only the rough coordinates of saved places)
```

The timed functions run on Google's servers; no computer has to be on.
Keys (NGN_API_KEY, ANTHROPIC_API_KEY) live only in Secret Manager.

- No server to run, no build step, no PHP. Hosting serves the files in
  `public/` as they are.
- **Who may do what is decided by `firestore.rules`**, not by the page. A
  person belongs to a group when `groups/{g}/members/{uid}` exists; the rules
  check that on every read and write inside the group. Only the server
  functions create members (after the right password), so nobody can add
  themselves. The page reads its own member document; "refused" means "not
  (any more) in this group" and the page goes back to the group list.
- **The page code works on one group at a time.** `public/js/firebase.js`
  puts every data path under `groups/{active group}/` (`public/js/scope.js`);
  only the person's own and the market documents stay outside. Switching
  group reloads the page, so nothing of the old group remains in memory.
- **Pages switched off** by a group are hidden in the app; the rules do not
  block them (their data stays). Markets are the exception: the rules let only
  people with `marketAccess/{uid}` read them.
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
  no request at all. Admins can switch it off (`config/digest`). There is
  one overview for the whole family and one per household, each made only
  from that group's own entries and shown only to that group.
- **Numbers come from code, words from the AI.** `functions/risk.js` computes
  every figure (tested with hand checkable values). `functions/ai-summary.js`
  gives Claude only these numbers, with rules: use only the given figures, no
  news, no forecasts, never advise, at most 110 words per language, no hyphens
  or dashes. The answer comes back as JSON (`en`, `fr`) through structured
  outputs; hyphens and dashes are removed again as a safety net. If Claude
  declines, Anthropic's server side fallback (`fallbacks: "default"`) retries
  once on another model; a failed day keeps the last summary visible.
- **Chat translations** (`functions/translate.js`): the browser never calls
  Anthropic. Tapping **Übersetzen** creates `translations/{id}` with only the
  message's place and the wanted language; the rules allow that only to
  people who may read the message, and the ID is fixed per message and
  language. The function `translateMessage` then reads that one message
  itself, sends only its text to Claude Opus 5.5 (low effort, structured
  output `{ text, sourceLanguage }`), and writes the translation into the same
  document, which the chat shows below the message. No names, no other
  messages, no mail addresses are sent; Claude is told never to follow
  instructions inside the message. Daily limit: 100 per person
  (`translateUsage/{uid}`, written only by the function). Admins switch it
  off with `config/translate`. When a message is deleted, its translations
  are deleted with it.
- **Simple mode** is a setting of the device (stored in the browser), not of
  the person: the same person can use the full app on their own phone.
- The service worker (`public/sw.js`) caches only the page files (HTML, CSS,
  JS, icons), never chat or market data.

### Data model (Firestore)

Group documents, and everything that lives outside the groups:

| Path | Content | Who writes |
| :- | :- | :- |
| `groups/{g}` | `name`, `icon`, `code`, `features { chat: true, ... }`, `design { theme, main, accent, background, pattern, patternStrength, font, corners, spacing, cards, welcome }`, `marketsUnlocked`, created and updated fields | created by `createGroupCall`; admins change name, icon, features and design; admins delete |
| `groups/{g}/members/{uid}` | `uid`, `mail`, `name`, `role` (admin, member), `joinedAt` | created by the functions only; admins change roles (not their own) and remove members; members remove themselves |
| `groupCodes/{code}` | `group`: which group a code opens | functions only; nobody reads it in the app |
| `groupSecrets/{g}` | `salt`, `hash` (scrypt) of the group password, wrong tries per group | functions only; nobody reads it |
| `joinAttempts/{uid}` | `count`, `since`: wrong tries of a person in the last hour | functions only |
| `marketAccess/{uid}` | optional `admin: true` (market switches), `grantedAt` | functions (on joining a group with markets) and the migration only; each person reads their own |
The paths in the next table live **inside a group**, at `groups/{g}/...`
(for example `groups/{g}/rooms/familie`), and are shown without that prefix.
Exceptions that stay outside the groups (they belong to the person or to the
whole app): `nicknames`, `config/watchlist`, `config/market`,
`translateUsage`, `market` and `marketHistory`. Watchlist and market data
are readable only with `marketAccess`.

| Path | Content | Who writes |
| :- | :- | :- |
| `config/watchlist` | `symbols: [..]` (max 10), `updatedAt`, `updatedBy` | members |
| `config/market` | `enabled` (market on/off), `aiEnabled` (AI summary on/off), `updatedAt`, `updatedBy`; missing values count as on | admins |
| `config/digest` | `enabled` (weekly overview on/off), `updatedAt`, `updatedBy`; missing counts as on | admins |
| `config/translate` | `enabled` (chat translations on/off), `updatedAt`, `updatedBy`; missing counts as on | admins |
| `people/{uid}` | `name`, `mail`, `photo` as Google gave them, `color`, optional `displayName` (the visible name) | each person, only their own |
| `names/{name}` | `uid`: who uses a visible name. The document ID is the name, so it can only exist once | each person for themselves, together with their `displayName`; locks nobody uses any more can be removed by anyone |
| `colors/{color}` | `uid`: who holds the color. The document ID is the color, so it can only exist once | each person for themselves, together with their `people` color; an admin may free the color of someone who left |
| `nicknames/{uid}` | `names: { mail: name }`, `updatedAt` | only that person; nobody else can read it |
| `households/{h}` | `name`, `members: [mail]`, `updatedAt`, `updatedBy` | admins (everyone reads) |
| `households/{h}/events`, `/tasks`, `/polls`, `/trips` (+ `items`), `/notices`, `/notes` | same fields as the family ones | members of the household only (read and write) |
| `households/{h}/rooms/main` (+ `messages`) | the household's chat room | members of the household only |
| `households/{h}/digest/current` | the household's weekly overview | Cloud Function only; read by members |
| `rooms/familie` | `name`, `createdAt`, `last` (preview of the newest message) | an admin once (the app does it); `last`: everyone |
| `rooms/{roomId}` | `name`, `open`, `members: [mail]`, `createdBy`, `createdByName`, `createdAt`, `last` | creator (rename, members); delete: creator or admin; `last`: people in the room |
| `rooms/{roomId}/messages/{id}` | `uid`, `name`, `photo`, `text`, `createdAt`, optional `replyTo { id, name, text }`, `reactions { like: [uid], ... }` | the sender (delete: sender or admin); reactions: each person only their own |
| `events/{id}` | `title`, `date`, `endDate`, `time`, `place`, `note`, `kind` (event, birthday), `repeat` (none, yearly), `yearKnown`, `person` (mail or empty: whose color), created and updated fields | members; change and delete: creator or admin |
| `tasks/{id}` | `title`, `note`, `assignee` (mail or empty), `due`, `done`, `doneAt`, `doneBy`, created and updated fields | members; tick off: anyone; change: creator or admin; delete: creator, admin, or anyone once done |
| `polls/{id}` | `question`, `options` (2 to 10), `multi`, `closed`, `votes { uid: [answer numbers] }`, created fields | members; vote: each person only their own; close and delete: creator or admin |
| `recipes/{id}` | `title`, `category`, `servings`, `duration`, `ingredients`, `steps`, `source`, created and updated fields | members; change and delete: creator or admin |
| `contacts/{id}` | `name`, `group`, `phone`, `phone2`, `mail`, `address`, `note`, `quick` (big call button in simple mode), `updatedAt`, `updatedBy` | admins only (everyone reads) |
| `places/{id}` | `name`, `country`, `lat`, `lon`, created fields | members; delete: creator or admin |
| `trips/{id}` | `title`, `destination`, `start`, `end`, `people: [mail]`, `note`, created and updated fields | members; change and delete: creator or admin |
| `trips/{id}/items/{id}` | `kind` (day, stay, travel), `date`, `endDate`, `time`, `title`, `place`, `note`, created and updated fields | members; change: creator or admin; delete: also the trip's creator |
| `notices/{id}` | `text` (up to 300 characters), `until` (day or empty), created and updated fields | members; change and delete: creator or admin |
| `notes/{id}` | `title`, `body` (up to 10,000 characters), created fields, `updatedAt`, `updatedBy`, `updatedByName` | members, anyone may change; delete: creator or admin |
| `tree/{id}` | `name`, `birthYear`, `deathYear`, `mail` (links to an app user for the color), `parents` (up to 2 IDs), `partners`, `birthdayId` (calendar entry), `note`, created fields, `updatedAt`, `updatedBy` | members, anyone may change; delete: creator or admin |
| `days/{day}/answers/{uid}` | `text`, `name`, `createdAt`, `updatedAt` | each person only their own; the others' answers are readable only once your own answer exists |
| `translations/{id}` | request: `household`, `roomId`, `messageId`, `lang`, `uid`, `createdAt`, `status`; result: `text`, `from`, `model`, `usage`, `translatedAt` or `reason` | request: people who may read the message; result: Cloud Function only |
| `translateUsage/{uid}` | `day`, `count` (translations today) | Cloud Function only; nobody reads it in the app |
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
`config/market` document counts as on; a market admin can switch it off in
the app (`enabled: false`). Börse and Risiko are locked for every new group;
only the group "Familie" has them, and only people with a `marketAccess`
document see them. Before the market is opened to more people, the question
above applies again; SETUP.md step 3 contains a ready mail asking NGN Market
for a written OK. The page always shows "Kurse mit mindestens 15 Minuten
Verzögerung · Daten: NGN Market".

Also checked as replacements on request: liquid.trade (a trading app without a
public data API; its terms forbid copying prices and automated access) and
Quiver Quantitative (alternative data, paid API, terms forbid making the data
available to any third party). Neither fits.

### Security at a glance

Checked on 22 October 2026 (code review, `npm audit` with 0 findings in both
package folders, secret scan of the whole git history with 0 findings), and
again for the family hub parts, the visible names, translations, trips,
notice board, notebook, family tree and question of the day on 23 October
2026.

| Layer | Protection |
| :- | :- |
| Sign in | Google, or mail and password with a confirmed mail; the rules check the provider (only these two) and the confirmed mail |
| Access | membership in `groups/{g}/members/{uid}`, checked by the rules on every read and write in the group; members are created only by the functions after the right group password |
| Group passwords | stored only as a scrypt hash in `groupSecrets` (nobody can read it); checked in a function; 5 wrong tries per person and 20 per group per hour; codes without look alike characters |
| Data | deny by default; every field of every write checked (`firestore.rules`, 105 tests); market, AI, overview and translation results written only by the functions |
| Households | everything inside a household (calendar, tasks, polls, chat, overview) is readable and writable only by its members, admins included; the rules check membership by the path |
| Nicknames | each person's names for others live in a document only that person can read |
| Colors and visible names | a color (and a visible name) is a document named after it, so two people can never hold the same one |
| Question of the day | the rules hide the others' answers until your own answer exists |
| Translations | only people who may read a message can ask for its translation or read it, and only while the message exists; translations cannot be listed; 100 per person and day |
| Group admins | change the group's name, picture, pages and look (every field checked), roles of others and remove members; an admin cannot change their own role; admins can leave only after losing the role |
| Private rooms | invisible to everyone not listed, admins included; the rules check every message read and write against the room |
| Contacts | everyone in the family reads them (they may hold health notes); only admins write; phone links can only dial digits |
| Page | no HTML is ever built from data (text is always set as text); profile photos only from `googleusercontent.com` |
| Browser | strict Content Security Policy and headers (below); service worker stores page files only |
| Keys | only in Secret Manager, each one given only to the function that needs it; nothing secret in git |
| Server | three callable functions (start a group, join a group, new group password) accept only signed in people with a confirmed mail and App Check; three run on a timer, three when a room, household or group is deleted, one when a translation is asked for; no automatic retries |
| AI | risk summary: numbers and stock names only. Weekly overview: the coming week's calendar titles, due tasks and poll questions, never notes, chat, contacts, recipes or mail addresses. Translation: only the text of the one message someone tapped, never names or mail addresses. Answers are shown as plain text |
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
domain for sign in), Firestore and Auth endpoints, the group functions
(`europe-west3-familyhub-5355f.cloudfunctions.net`), App Check and reCAPTCHA,
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
  css/house.css         styles for colors, nicknames, households and calendar lines
  css/more.css          styles for translations, notice board, trips, question, tree, simple mode
  css/groups.css        styles for mail sign in, the group list, the wizard and the look editor
  js/firebase-config.js web config of your project (not secret) and the App Check key
  js/firebase.js        loads the pinned Firebase SDK, emulators on localhost, puts paths under the active group
  js/scope.js           the active group of this device and which paths belong to it (tested in Node)
  js/app.js             sign in, opening a group, navigation, starts the pages
  js/start.js           mail sign in and register, mail check, group list, join, the five step wizard
  js/group-page.js      Gruppe page (code, password, pages, look, members, leave, delete)
  js/group-forms.js     the editors used by the wizard and the Gruppe page
  js/design.js          group looks: styles, colors with contrast check, background pictures, fonts (tested in Node)
  js/family-data.js     live copies of the family and household documents, names, colors
  js/family-page.js     Familie page (your name, colors, nicknames, households)
  js/colors.js          the 16 person colors
  js/names.js           visible names: checks and the name locks (tested in Node)
  js/board.js           Pinnwand page (notices and notebook)
  js/trips.js           Reisen page (trips, days, accommodation, journeys)
  js/question-page.js   Frage des Tages page
  js/questions.js       the 40 questions in three languages and which one is today's
  js/tree.js            Stammbaum page (drawing, zoom, person dialog, editor)
  js/tree-layout.js     places the people of the tree (tested in Node)
  js/simple.js          simple mode switch for this device
  js/groups.js          household filter, form field and badge
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
  js/strings.js         app text in German, English and French (plus strings-family.js, strings-house.js, strings-more.js, strings-groups.js)
  js/i18n.js            picks the language, fills the page text
  js/ui.js              small helpers (safe text, dates in the chosen language, cards)
  js/theme-boot.js      applies light or dark before the page is drawn
  manifest.webmanifest  installable app
  sw.js                 service worker (page files only)
  icons/                own icons (house with heart), made by scripts/make-icons.mjs
functions/              Cloud Functions (Node.js 22, firebase-functions v2 API)
  index.js              marketUpdate, riskSummary, weeklyDigest, translateMessage, cleanupRoom, cleanupHousehold,
                        cleanupGroup, createGroupCall, joinGroupCall, setGroupPasswordCall
  groups.js             starting and joining groups, group codes, password hashes, try limits
  migrate.js            the one time move of the family data into the group "Familie"
  ngn-client.js         small NGN Market client
  market.js             trading days, budget guard, parsing, the market run
  risk.js               risk figures in plain code (volatility, drawdown, beta, ...)
  ai-summary.js         daily summary with Claude Opus 5.5 (prompt, request, checks)
  digest.js             weekly family overview with Claude Opus 5.5
  translate.js          chat translations with Claude Opus 5.5 (prompt, request, daily limit)
  firestore-store.js    reading and writing the documents the functions use
  test/                 function tests with stub APIs (no real calls)
  scripts/demo-stub-data.mjs     fills the LOCAL emulator with made up market data and a demo summary
  scripts/demo-family-data.mjs   fills the LOCAL emulator with a made up demo group and three sign in accounts
  scripts/migrate-to-groups.mjs  run once by the owner: moves the family data into the group "Familie"
tests/rules.test.js     security rules tests (Firestore emulator)
tests/rules-family.test.js  security rules tests for the family hub parts
tests/rules-households.test.js  security rules tests for colors, nicknames and households
tests/rules-extra.test.js  security rules tests for names, translations, trips, notices, notebook, tree, question
tests/rules-groups.test.js  security rules tests for groups, members, sign in providers and market access
tests/group-seed.js     the test group used by all rules tests
tests/strings.test.js   app text checks (same keys in 3 languages, no dashes, "Mail", the questions)
tests/scope.test.js, design.test.js  checks for group paths and group looks
tests/dates.test.js     calendar day checks (birthdays, several days, 29 February, calendar lines)
tests/colors.test.js, names.test.js, tree-layout.test.js  checks for colors, visible names and the tree layout
scripts/serve-local.mjs local web server with the same headers (for testing)
scripts/make-icons.mjs  draws the icons
firebase.json           Hosting, headers, Firestore, Functions, emulators
.firebaserc             project ID (familyhub-5355f)
firestore.rules         security rules
firestore.indexes.json  index settings (recently done tasks; members by uid for "my groups")
SETUP.md                step by step setup for the owner
```

## Development and tests

Node.js 24.12 or newer and Java 21 or newer are needed for the tests (the
deployed function runs on Node.js 22).

```
npm install
npm --prefix functions install
npm test               # 49 Node checks + 102 function tests + 120 rules tests
npm run emulators      # local site on http://127.0.0.1:5000, Emulator UI on :4000 (auth, Firestore, functions)
npm run demo:market    # (second window) made up market data for the local site
npm run demo:family    # (second window) a demo group; accounts and password are at the top of the script
```

Why a local web server instead of the Hosting emulator: with current Node
versions the Hosting emulator silently drops the custom headers from
`firebase.json`, so the security policy could not be tested.
`scripts/serve-local.mjs` applies exactly those headers, plus the local
emulator addresses.

When changing page files, also raise `VERSION` in `public/sw.js` and
`APP_VERSION` in `public/js/app.js`, so phones pick up the new version.

## Later ideas (not in this version)

- Phase 2: a vouchers page
- Phase 3: an unlock code for Börse and Risiko in other groups, and limits per
  group for the AI features (overview, translations)
- Invitations by link instead of code and password
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
