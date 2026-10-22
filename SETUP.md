# FamilyHub setup guide

This guide takes you from zero to a running FamilyHub. Do the steps in order.
Every step says exactly where to click. The console labels below are the
English ones; if your Google account is set to German, the buttons are in the
same places with German names.

You need: a Google account, a credit card for the Google billing account
(the app is expected to cost nothing or a few cents per month), and this
folder on your computer.

Placeholders used below:

- `<project-id>`: the ID of your new Firebase project (you get it in step 1).
- `<your-mail>`: the Gmail address you sign in with, written in lower case.

---

## 1. Create the Firebase project, switch to Blaze, set a budget alert

**Create the project**

1. Open https://console.firebase.google.com and sign in.
2. Click **Create a Firebase project** (or **Add project**).
3. Enter a name, for example `FamilyHub`. Under the name you see the
   **project ID** (for example `familyhub-a1b2c`). Write it down: this is
   your `<project-id>`. Click **Continue**.
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

**Tell me the project ID** (or do it yourself): the placeholder
`familyhub-platzhalter` appears in `.firebaserc` and in
`public/js/firebase-config.js`. The config file gets replaced completely in
step 2 anyway; `firebase use` in step 5 takes care of `.firebaserc`.

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
   Copy the six values (apiKey, authDomain, projectId, storageBucket,
   messagingSenderId, appId) into `public/js/firebase-config.js`, replacing
   `HIER_EINFUEGEN` and the placeholder names. Keep the quotes.
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
   `firebase login` and `firebase use <project-id>` from step 5. Then:

   ```
   firebase functions:secrets:set NGN_API_KEY
   ```

   When it asks **Enter a value for NGN_API_KEY**, paste the key and press
   Enter. The key now lives only in Google Secret Manager. Never put it into a
   file, git, or a chat.

**Before switching the market part on:** the NGN Market Terms of Service do not
clearly allow showing their data to other people on the free plan (see
README.md, section "Terms of Service"). The app ships with the market switch
**off**. I recommend asking NGN Market first. You can send this mail to
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
firebase use <project-id>
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
- If it says the secret NGN_API_KEY is missing, do step 3 first.

At the end it prints **Hosting URL**: `https://<project-id>.web.app`.
Both `https://<project-id>.web.app` and `https://<project-id>.firebaseapp.com`
work. **Share the `firebaseapp.com` address with the family**: on phones,
especially iPhones and the installed app, Google sign in works most reliably
there.

Open it, click **Mit Google anmelden**, sign in with `<your-mail>`. You should
see the chat. The first time an admin opens the app, the chat room "Familie" is
created automatically.

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
3. Domains: add `<project-id>.web.app` and `<project-id>.firebaseapp.com`.
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

**Add family members**

1. In the app: **Einstellungen** → **Zugang**.
2. Type the person's Gmail address → **Hinzufügen**.
3. Send them the link. They click **Mit Google anmelden**.
4. To give someone admin rights: **Zum Admin machen**. To remove someone:
   **Entfernen** (they lose access immediately). You cannot remove yourself.

Anyone not on the list sees only "Kein Zugang".

**Switch the market part on** (after the answer from NGN Market)

In the app (admins only): **Einstellungen** → **Börse** → switch
**Kurse von NGN Market abrufen** on. From the next trading slot (every 30
minutes, 09:30 to 16:30 New York time = 15:30 to 22:30 in Germany most of the
year) prices appear under **Börse**.

**See how many API calls are used**

- In the app: **Einstellungen** → **Börse** shows "NGN Abrufe: … verbraucht,
  … übrig" and when the quota resets.
- On https://ngnmarket.com → **Dashboard** → **Developer**.
- In the logs: Firebase console → **Build** → **Functions** → `marketUpdate`
  → **Logs**. Each run writes a line "NGN market run" with `callsThisRun`,
  `callsUsed` and `callsRemaining`.

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
  function writes about 2 documents per run (≈ 650 writes per month).
- Cloud Functions: about 350 runs per month; free up to 2 million.
- Cloud Scheduler: 3 jobs free per billing account; this app uses 1.
- Secret Manager: free up to 6 secret versions and 10,000 reads per month.
- Possible small costs: storing the function's container image (Artifact
  Registry, free up to 0.5 GB; the cleanup policy from step 5 keeps it small)
  and Cloud Build minutes when you deploy (free amount per month).

Expected: **0 EUR to a few cents per month.** The 5 EUR budget alert warns you
long before anything matters.

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
