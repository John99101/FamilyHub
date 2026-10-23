# FamilyHub setup guide

This guide takes you from zero to a running FamilyHub. Do the steps in order.
Every step says exactly where to click. The console labels below are the
English ones; if your Google account is set to German, the buttons are in the
same places with German names.

You need: a Google account, a credit card for the Google billing account
(the app is expected to cost nothing or a few cents per month), and this
folder on your computer.

Your Firebase project ID is **`familyhub-5355f`**. It is already filled in
everywhere in this guide and in the files `.firebaserc` and
`public/js/firebase-config.js`.

Placeholder used below:

- `<your-mail>`: the Gmail address you sign in with, written in lower case.

---

## 1. Create the Firebase project, switch to Blaze, set a budget alert

**Create the project**

1. Open https://console.firebase.google.com and sign in.
2. Click **Create a Firebase project** (or **Add project**).
3. Enter a name, for example `FamilyHub`. Under the name you see the
   **project ID**. (Done: yours is `familyhub-5355f`.) Click **Continue**.
4. Google Analytics: switch it **off** (not needed). Click **Create project**,
   wait, then **Continue**.

**Switch to the Blaze plan** (needed for the scheduled function and its calls
to NGN Market; the free amounts still apply)

1. In the project, bottom left, click **Spark** (the plan name) or
   **Upgrade**.
2. Choose **Blaze** → **Select plan**.
3. Pick or create a **Cloud Billing account** and add your card.
4. If the dialog offers **Set a budget**, enter **5** and pick EUR. Then
   **Continue** / **Purchase** (you only pay for use; with this app that is
   expected to be nothing or a few cents).

**Budget alert of 5 EUR** (skip if you already set it in the dialog)

1. Open https://console.cloud.google.com/billing and choose your billing account.
2. Left menu: **Budgets & alerts** → **Create budget**.
3. Name: `FamilyHub`. Under **Projects**, select only your FamilyHub project.
   Click **Next**.
4. Budget type **Specified amount**, amount **5** (EUR). Click **Next**.
5. Keep the thresholds 50 %, 90 %, 100 % and tick **Email alerts to billing
   admins and users**. Click **Finish**.

Note: a budget alert only sends mail; it does not stop anything. Section 7
explains how to switch the market part off.

The project ID `familyhub-5355f` is already set in `.firebaserc` and in
`public/js/firebase-config.js`. Only three values from step 2 are still
missing there.

---

## 2. Google sign in, Firestore in Frankfurt, register the web app

**Google sign in**

1. Left menu: **Build** → **Authentication** → **Get started**.
2. Tab **Sign-in method** → **Google** → switch **Enable** on.
3. **Public-facing name**: `FamilyHub`. **Project support email**: your mail.
4. Click **Save**. Do not enable any other provider.

**Firestore database in europe-west3 (Frankfurt), production mode**

1. Left menu: **Build** → **Firestore Database** → **Create database**.
2. Edition **Standard**, database ID **(default)**. Next.
3. Location: **europe-west3 (Frankfurt)**. This cannot be changed later, so
   check it twice. Next.
4. Choose **Start in production mode** → **Create**.
   (Production mode means "everything locked". The real rules from this
   project are uploaded in step 5.)

**Register the web app and paste its config**

1. Left menu: **Project Overview** (house icon) → click the **Web** icon
   `</>` (or **Add app** → **Web**).
2. App nickname: `FamilyHub Web`. Leave **Also set up Firebase Hosting**
   unticked. Click **Register app**.
3. You see a code block with `const firebaseConfig = { apiKey: ..., ... }`.
   Open `public/js/firebase-config.js` and replace the three
   `HIER_EINFUEGEN` with the values for **apiKey**, **messagingSenderId** and
   **appId**. Keep the quotes. Check that authDomain, projectId and
   storageBucket in the console match the ones already in the file
   (`familyhub-5355f...`); if the console shows a different storageBucket, use
   the console's value. (Or paste the whole block into the chat and I fill it
   in: these values are not secret, see below.)
4. Click **Continue to console**.

**Why the web config is not secret:** these values only tell the browser which
Firebase project to talk to. Every visitor's browser downloads them anyway, so
hiding them is impossible and unnecessary. What protects your data is: Google
sign in, the allow list, the security rules in `firestore.rules`, and App
Check (step 6). The NGN Market key is different: it is a real secret and lives
only in Secret Manager (step 3).

---

## 3. NGN Market account and API key → Secret Manager

1. Go to https://ngnmarket.com → **Create account**, confirm your mail.
2. **Dashboard** → **Developer** → **Generate API key**, name it
   `FamilyHub`, confirm, and copy the key right away (it is shown once).
   - The key you pasted into the chat on 22 October 2026 must be **revoked**
     first (same page, revoke button), because chat logs are stored on disk.
     Then generate a fresh one.
3. Open PowerShell in this folder (`D:\Dev_Ing\FamilyHub`). This command needs
   the CLI login, so if you have not done it yet, first run the two commands
   `firebase login` and `firebase use familyhub-5355f` from step 5. Then:

   ```
   firebase functions:secrets:set NGN_API_KEY
   ```

   When it asks **Enter a value for NGN_API_KEY**, paste the key and press
   Enter. The key now lives only in Google Secret Manager. Never put it into a
   file, git, or a chat.

**The market part is on from the start.** Set the secret before the first
deploy: from the next US trading slot after the deploy, the server fetches
prices. You can switch it off in the app at any time (section 7).

**Only if you later add other people to the allow list:** the NGN Market
Terms license the data for "personal" use and do not clearly allow showing it
to other people on the free plan (see README.md, section "Terms of Service").
While you are the only user, that question does not arise. Before giving
family members access, you can ask NGN Market with this mail to
support@ngnmarket.com:

> Subject: Free plan: delayed US quotes on a private family website?
>
> Hello NGN Market team,
>
> I use the free plan of your API (US endpoints /v1/us/tickers and
> /v1/us/indices). I would like to show the delayed quotes on a small private
> website for my family: about 5 to 15 people, behind a Google login, not
> public, no ads, no fees, nothing is sold. A server fetches the data about 15
> times per trading day (well under 3,000 calls per month), stores it, and the
> page shows "Daten: NGN Market" and the 15 minute delay.
>
> Is this allowed on the free plan under your Terms of Service (sections 8, 10
> and 11), or do I need a different plan?
>
> Thank you,
> (your name)

**3b. Anthropic API key for the daily AI summary (Claude)**

The Risiko page shows a short daily summary in English and French, written by
Claude Opus 5.5. The server sends only the computed risk numbers to Anthropic;
no chat messages, no names of family members. Under Anthropic's commercial
terms, API data is not used to train models by default.

1. Open https://console.anthropic.com and create an account (or sign in).
2. **Settings** → **Billing**: add a payment method and buy a small amount of
   credit, for example 5 USD. (The API is prepaid; when the credit is used
   up, the summary simply stops appearing.)
3. **Settings** → **Limits**: set a **monthly spend limit**, for example 5 USD.
4. **Settings** → **API keys** → **Create key**. Name: `FamilyHub`. Copy the
   key right away (it is shown once). Never paste it into a chat or a file.
5. In PowerShell inside `D:\Dev_Ing\FamilyHub` (after `firebase login` and
   `firebase use familyhub-5355f`):

   ```
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```

   Paste the key when asked and press Enter. It now lives only in Google
   Secret Manager.

---

## 4. Add the first admin by hand

The allow list is one Firestore document. Nobody can sign in until it exists.

1. Firebase console → **Build** → **Firestore Database** → tab **Data**.
2. Click **+ Start collection**. Collection ID: `config` → **Next**.
3. Document ID: `access` (type it; do not use Auto ID).
4. Add field: name `admins`, type **array**. Inside it, add one element of
   type **string** with value `<your-mail>` (all lower case, the exact mail
   of your Google account).
5. Add field: name `members`, type **array**, leave it empty.
6. Click **Save**.

Result: document path `config/access` with fields
`admins: ["<your-mail>"]` and `members: []`.

Everyone else is added later inside the app (section 7).

---

## 5. Firebase CLI, login, deploy

The Firebase CLI is already installed on this computer (version 15.34). On
another computer, install Node.js 22 or newer from https://nodejs.org and then:

```
npm install -g firebase-tools
```

Then, in PowerShell inside `D:\Dev_Ing\FamilyHub`:

```
firebase login
```

A browser window opens; sign in with the Google account that owns the project.

```
firebase use familyhub-5355f
```

```
npm --prefix functions install
```

(The CLI reads the function code before uploading it, so the function's
libraries must be installed once.)

```
firebase deploy --only hosting,firestore,functions
```

During the first deploy:

- It may ask to enable several Google APIs (Cloud Functions, Cloud Build,
  Artifact Registry, Cloud Run, Cloud Scheduler, Secret Manager). Answer **Y**.
- If it asks about a **cleanup policy** for container images, answer **Y**
  and keep the suggested 1 day. This keeps storage (and cost) near zero.
- If it says the secret NGN_API_KEY or ANTHROPIC_API_KEY is missing, do
  step 3 (and 3b) first. The deploy creates five functions: `marketUpdate`
  (prices), `riskSummary` (the daily AI summary), `weeklyDigest` (the weekly
  overviews), `cleanupRoom` (deletes the messages of a deleted chat room) and
  `cleanupHousehold` (deletes everything inside a deleted household).
- `cleanupRoom` and `cleanupHousehold` react to the database. On the very first deploy Google may
  still be setting up permissions for that and the deploy can fail with a
  message about Eventarc or permissions. Wait 5 minutes and run the same
  deploy command again.
- The deploy also creates one database index (for the list of recently done
  tasks). It takes a few minutes to build; until then that list stays empty.

At the end it prints **Hosting URL**: `https://familyhub-5355f.web.app`.
Both `https://familyhub-5355f.web.app` and `https://familyhub-5355f.firebaseapp.com`
work. **Share the `firebaseapp.com` address with the family**: on phones,
especially iPhones and the installed app, Google sign in works most reliably
there.

Open it, click **Mit Google anmelden** (the app follows the browser's
language: German, English or French; you can change it under
**Mehr** → **Einstellungen** → **Sprache**), and sign in with `<your-mail>`.
You should see the Start page. The first time an admin opens the chat, the
room "Familie" is created automatically.

**Install as an app on phones**

- Android (Chrome): open the link → menu **⋮** → **Install app** /
  **Add to Home screen**.
- iPhone (Safari): open the link → **Share** button → **Add to Home Screen**.

---

## 6. App Check with reCAPTCHA Enterprise (test first, enforce later)

App Check makes Firestore accept requests only from your real website. The
code is ready; it stays off until you paste a site key.

**Create the key**

1. Open https://console.cloud.google.com/security/recaptcha (select your
   project at the top). If asked, click **Enable** for the reCAPTCHA API.
2. Click **Create key**. Display name: `FamilyHub`. Platform: **Website**.
3. Domains: add `familyhub-5355f.web.app` and `familyhub-5355f.firebaseapp.com`.
4. Leave the checkbox challenge **off** (score based key). **Create key**.
5. Copy the **key ID** (a long string starting with `6L`).

**Register it in Firebase**

1. Firebase console → **Build** → **App Check** → **Get started** if shown.
2. Tab **Apps** → your web app → **reCAPTCHA Enterprise**.
3. Paste the key ID, leave the token time at the default → **Save**.

**Turn it on in the website**

1. In `public/js/firebase-config.js` set
   `export const recaptchaEnterpriseSiteKey = '6L...';` (your key ID).
2. Deploy the website again: `firebase deploy --only hosting`

**Test** (a few days): use the app normally on computer and phone. Then
Firebase console → **App Check** → tab **APIs** → **Cloud Firestore**. The
chart shows **Verified requests**. When almost all requests are verified,
enforce:

**Enforce:** same page → **Cloud Firestore** → **Enforce** → **Confirm**.
(If **Authentication** is listed there too, you can enforce it the same way
after testing.) Should something break, click **Unenforce** to undo at once.

The scheduled market function is not affected: it uses the server SDK, which
App Check does not apply to.

---

## 7. Daily use, costs, and the off switch

**Before you invite the family: the market pages**

Everyone on the allow list sees **Börse** and **Risiko**. The NGN Market free
licence covers personal use only (README, "Terms of Service"). So before you
add others, either get NGN's written OK (step 3 has a ready mail), or switch
the market part off (**Mehr** → **Einstellungen** → **Börse**), or ask for a
change that shows these two pages only to admins.

**Add family members**

1. In the app: **Mehr** → **Einstellungen** → **Zugang**.
2. Type the person's Gmail address → **Hinzufügen**.
3. Send them the link. They click **Mit Google anmelden**.
4. To give someone admin rights: **Zum Admin machen**. To remove someone:
   **Entfernen** (from then on every new request of theirs is refused; an app
   they still have open may keep showing what it had already loaded). You
   cannot remove yourself.

Anyone not on the list sees only "Kein Zugang".

**When prices appear**

The market part is on by default. After the deploy, prices appear under
**Börse** at the next trading slot: every 30 minutes, 09:30 to 16:30 New York
time (15:30 to 22:30 in Germany most of the year), Monday to Friday, except US
holidays. The switch is in the app (admins only): **Einstellungen** →
**Börse** → **Kurse von NGN Market abrufen**.

**When the risk figures and the AI summary appear** (page **Risiko**)

- The risk figures are computed by the server in plain code (no AI) after
  each US trading day, from the closing prices the app stores itself. A stock
  needs **20 trading days** of stored closes before its figures appear, so
  expect about **4 weeks** after the first deploy, or after adding a new
  symbol to the watchlist. Until then the page shows "Noch zu wenig Daten:
  x von 20 Handelstagen". (With the NGN Hobby plan, the app could later load
  2 years of history at once; not built yet.)
- The AI summary is written once per US trading day at 17:15 New York time
  (23:15 in Germany most of the year), in English and French, as soon as at
  least one stock has figures. It only describes the numbers and never gives
  advice. Switch it off in the app: **Einstellungen** → **Börse** →
  **Tägliche KI Zusammenfassung (Claude)**.
- Nothing here needs your computer: both jobs run on Google's servers.

**Colors, names and households** (**Mehr** → **Familie**)

- Everyone gets a free color when they first sign in and can change it
  there. A color can only be held by one person; colors of people who are
  no longer on the allow list can be freed by an admin.
- "Namen geben": names you give others are only visible to you.
- Households (admins): **+ Haushalt**, give it a name and tick who belongs
  to it. A person can be in several. Members then see a household filter in
  the calendar, tasks and polls, can file entries under the household, and get
  the household's own chat room and weekly overview. Nobody outside the
  household sees any of it, admins included; to look inside, an admin has to
  add themselves. Deleting a household deletes everything in it.

**If colors cannot be chosen** (every color seems taken, or saving fails)

The server's security rules are probably older than the app (for example
only the website was deployed, or the first deploy stopped at the functions
step). Admins then see a note on the **Familie** page. Publish the rules:

```
firebase deploy --only firestore
```

To check: Firebase console → **Firestore Database** → tab **Rules**: the text
must contain `match /colors/{color}`. Colors that got stuck earlier are freed
automatically the next time anyone opens the app.

**The weekly overview** (Start page)

- Every Sunday at 17:00 Berlin time the server collects the coming week
  (Monday to Sunday): calendar entries, birthdays, tasks that are due, open
  polls. Claude Opus 5.5 writes a short overview in German, English and
  French; everyone sees it in their language. Notes, chat, contacts, recipes
  and mail addresses are never sent. If nothing is planned, nothing is sent.
- The first one appears on the first Sunday after the deploy. To get one
  right away: Google Cloud console → **Cloud Scheduler** (search for it at the
  top) → the job `firebase-schedule-weeklyDigest-europe-west3` → **⋮** →
  **Force run**.
- Switch it off in the app: **Mehr** → **Einstellungen** → **Wochenüberblick**.

**Weather**

The weather page asks Open-Meteo (free for private use, no key, no account)
straight from each device, with the rough coordinates of the saved places.
Up to about 10,000 requests a day are free; a family uses a few dozen.

**See how many API calls are used**

- In the app: **Einstellungen** → **Börse** shows "NGN Abrufe: … verbraucht,
  … übrig" and when the quota resets.
- On https://ngnmarket.com → **Dashboard** → **Developer**.
- In the logs: Firebase console → **Build** → **Functions** → `marketUpdate`
  → **Logs**. Each run writes a line "NGN market run" with `callsThisRun`,
  `callsUsed` and `callsRemaining`.
- AI usage: https://console.anthropic.com → **Usage**. The `riskSummary` logs
  show "AI summary written" with the tokens used per day.

**Estimated calls per month (free plan: 3,000)**

| What | Calculation | Calls |
| :- | :- | -: |
| Trading days per month | 252 per year ÷ 12 ≈ 21 (at most 23) | |
| Runs per trading day | every 30 min 09:30 to 16:00 = 14, plus 1 after the close = 15 | |
| Base calls per run | 1 stock list (top 200) + 1 indices = 2 | |
| Base per month | 21 × 15 × 2 | **630** |
| Holiday calendar | 1 call per week | **≈ 5** |
| **Typical total** (watchlist symbols all among the 200 largest) | 630 + 5 | **≈ 635** |
| Each watchlist symbol outside the top 200 | 1 search per run: 21 × 15 | +315 |
| **Worst case** (5 or more such symbols, 23 trading days) | 23 × 15 × (2 + 5) + 5 | **≈ 2,420** |

Weekends, holidays and the 09:00 trigger before the open make no calls. Calls
blocked by NGN's per minute limit or quota do not count. The budget guard stops
all calls as soon as fewer than 300 remain and waits until the quota resets
(NGN resets it on your account's monthly renewal day, not on the 1st). The page
then shows "Kurse pausiert bis …". So this app never uses more than 2,700
calls in a quota period. Tip: prefer large companies in the watchlist; they
need no extra calls.

**What it costs**

All of this stays inside Google's free amounts for a family:

- Hosting: free up to 10 GB storage and 360 MB transfer per day.
- Firestore: free up to 50,000 reads and 20,000 writes per day. The market
  function writes about 2 documents per run (≈ 650 writes per month). Each
  time someone opens the app, it reads the open tasks, the calendar from two
  months ago on, the polls and the chat rooms (a few hundred documents for a
  busy family); recipes and contacts only when their page is opened. 10
  people opening the app 5 times a day stay well inside the free amount.
- Cloud Functions: about 375 runs per month; free up to 2 million.
- Cloud Scheduler: 3 jobs free per **billing account**; this app uses 3
  (prices, risk summary, weekly overview). If other projects on the same
  billing account also use Cloud Scheduler, each extra job costs about 0.10
  USD per month.
- Secret Manager: free up to 6 secret versions and 10,000 reads per month;
  this app uses 2 secrets.
- Possible small costs: storing the functions' container images (Artifact
  Registry, free up to 0.5 GB; the cleanup policy from step 5 keeps it small)
  and Cloud Build minutes when you deploy (free amount per month).

Expected on Google: **0 EUR to a few cents per month.** The 5 EUR budget alert
warns you long before anything matters.

**AI summary (Anthropic, billed separately from Google):** Claude Opus 5.5
costs 4 USD per million input tokens and 20 USD per million output tokens.
One daily summary is about 1,500 input tokens and up to about 3,000 output
tokens (its thinking counts as output): roughly 0.07 USD per day, so about
**1 to 3 USD per month** (about 21 trading days). The spend limit from step 3b
caps it. If Claude declines a request (rare), Anthropic retries it once on a
fallback model it picks; that is billed at that model's price.

**Weekly overview (Anthropic):** about 1,500 input tokens and up to about
4,000 output tokens (three languages plus thinking), roughly 0.05 to 0.10 USD
per week, so about **0.20 to 0.40 USD per month** on top, **for each group**:
the whole family plus every household with something planned (an empty week
costs nothing).

**Switch the market part off**

- Soft (instant, reversible): in the app, **Einstellungen** → **Börse** →
  switch off. The function still wakes up but makes **no** calls to NGN Market.
- Hard (removes the scheduled function completely):

  ```
  firebase functions:delete marketUpdate --region europe-west3
  ```

  Answer **Y**. To bring it back later: `firebase deploy --only functions`.
- Key: revoke it on https://ngnmarket.com → **Dashboard** → **Developer**, and
  optionally delete the secret in Google Cloud console → **Security** →
  **Secret Manager** → `NGN_API_KEY` → **Delete**.

**Switch the AI summary off**

- Soft: in the app, **Einstellungen** → **Börse** → switch off **Tägliche KI
  Zusammenfassung (Claude)**. No more requests to Anthropic; the last summary
  stays visible.
- Hard:

  ```
  firebase functions:delete riskSummary --region europe-west3
  ```

  And revoke the key on https://console.anthropic.com → **Settings** →
  **API keys** (this also stops the weekly overview).

**Switch the weekly overview off**

- Soft: in the app, **Mehr** → **Einstellungen** → **Wochenüberblick** →
  switch off. The Start page then hides the overview card.
- Hard:

  ```
  firebase functions:delete weeklyDigest --region europe-west3
  ```

---

## 8. Extra safety (recommended, about 15 minutes)

The code side is locked down (sign in, allow list, security rules, strict
browser headers, keys only in Secret Manager). These steps can only be done by
you in the consoles. Do them in this order.

**a. 2 Step Verification on the Google accounts** (most important)

The app is exactly as safe as the Google accounts on the allow list. Open
https://myaccount.google.com/signinoptions/twosv and turn it on (a passkey or
the Google prompt on your phone is best). Ask every admin to do the same, and
ideally every family member.

**b. Finish App Check** (step 6), and enforce it after a few days of testing.

**c. Remove `localhost` from the sign in domains**

Firebase console → **Build** → **Authentication** → tab **Settings** →
**Authorized domains** → on the line `localhost` click the delete icon. The
local test copy uses the emulator and does not need it. Keep
`familyhub-5355f.firebaseapp.com` and `familyhub-5355f.web.app`.

**d. Let the browser key work only on your website**

1. https://console.cloud.google.com/apis/credentials (your project at the top).
2. Under **API keys**, open **Browser key (auto created by Firebase)**. Check
   that the key shown starts like the `apiKey` in `public/js/firebase-config.js`.
3. **Application restrictions** → **Websites** → **Add** these two:
   `https://familyhub-5355f.web.app/*` and
   `https://familyhub-5355f.firebaseapp.com/*`
4. Leave **API restrictions** as they are. **Save**.
5. Wait 5 minutes, then sign out and in again on the website and on a phone.
   If sign in fails, set **Application restrictions** back to **None**.

**e. Protect the database from being deleted by mistake**

https://console.cloud.google.com/firestore/databases → click **(default)** →
on its details page find **Delete protection** → **Enable**. Free.

**f. Optional: daily backups**

Same page → **Disaster recovery** (or **Backups**) → **Create schedule** →
**Daily**, keep **7 days**. Costs a few cents at most for a family sized
database. A backup is restored into a new database, so ask me first if you
ever need one.

**g. Keys**

- If you ever pasted an NGN or Anthropic key anywhere other than the
  `firebase functions:secrets:set` prompt (chat, mail, notes), revoke it on the
  provider's page and set a new one. The NGN key that was pasted into the chat
  during setup must be revoked.
- Never put keys into files in this folder; `.gitignore` already blocks the
  usual key file names.

**h. Look in now and then**

- Firebase console → **Authentication** → **Users** lists everyone who ever
  signed in, also strangers who tried. Strangers see only "Kein Zugang" and
  cannot read anything; you may delete them there.
- The budget alert (step 1) and the Anthropic spend limit (step 3b) warn you
  about unexpected costs.

---

## For later: running the tests and the local preview

Needs Node.js 24.12 or newer and Java 21 or newer (both installed here).

```
npm install
```

```
npm --prefix functions install
```

```
npm test
```

runs the function tests (stub API, no real calls) and the security rules
tests (Firestore emulator).

```
npm run emulators
```

starts a local copy (fake sign in, local database, nothing goes to Google or
NGN Market) at http://127.0.0.1:5000. In a second window,
`npm run demo:market` fills the local database with made up market data. Add
yourself to the local allow list in the Emulator UI at http://127.0.0.1:4000
(Firestore → `config/access`) first. Stop with Ctrl+C.
