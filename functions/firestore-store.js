// Firestore storage for the market data (Admin SDK, so security rules do not
// apply here; the rules only let family members read these documents).
//
//   config/market          { enabled, aiEnabled }          on/off switches (admins, in the app; missing = on)
//   config/watchlist       { symbols: [..] }               family watchlist (members, in the app)
//   market/latest          { updatedAt, quotes, indices, extras, quotesUpdatedAt }
//   market/status          { state, pausedUntil, callsUsed, callsRemaining, resetAt, ... }
//   market/calendar        { holidays: [...], fetchedAt }
//   market/risk            { asOf, symbols: [...], portfolio, ... }   risk figures (computed in code)
//   market/riskSummary     { asOf, en, fr, model, ... }             daily AI summary
//   marketHistory/{symbol} { symbol, closes: { 'YYYY-MM-DD': price } } (watchlist and $SPX)
//
// One store per group (root = 'groups/{g}/') for the group's own data:
//   {root}config/digest    { enabled }                              weekly overview switch (admins; missing = on)
//   {root}digest/current   { weekStart, weekEnd, de, en, fr, ... }  weekly overview (read from events, tasks, polls, people)
//   {root}households/{h}/... the same for each household (events, tasks, polls, digest/current)
//   {root}translations/{id}, {root}config/translate                 chat translations
import { trimCloses } from './market.js';

const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v ? new Date(v) : null);

export function createFirestoreStore(db, root = '') {
  const read = async (path) => {
    const snap = await db.doc(path).get();
    return snap.exists ? snap.data() : null;
  };

  return {
    async getMarketSwitch() {
      return read('config/market');
    },

    async getWatchlist() {
      const data = await read('config/watchlist');
      return Array.isArray(data?.symbols) ? data.symbols : [];
    },

    async getStatus() {
      const data = await read('market/status');
      if (!data) return null;
      return { ...data, pausedUntil: toDate(data.pausedUntil), lastSuccessAt: toDate(data.lastSuccessAt) };
    },

    async saveStatus(status) {
      await db.doc('market/status').set(status);
    },

    async getCalendar() {
      const data = await read('market/calendar');
      if (!data) return null;
      return { holidays: Array.isArray(data.holidays) ? data.holidays : [], fetchedAt: toDate(data.fetchedAt) };
    },

    async saveCalendar(calendar) {
      await db.doc('market/calendar').set(calendar);
    },

    async getLatest() {
      return read('market/latest');
    },

    async saveLatest(latest) {
      await db.doc('market/latest').set(latest);
    },

    async saveCloses(symbol, entries) {
      const ref = db.doc(`marketHistory/${symbol}`);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const closes = { ...(snap.exists ? snap.data().closes : {}), ...entries };
        tx.set(ref, { symbol, closes: trimCloses(closes) });
      });
    },

    /** symbol → closes map, for every requested symbol (empty map when none stored). */
    async getHistories(symbols) {
      const out = {};
      if (!symbols.length) return out;
      const snaps = await db.getAll(...symbols.map((s) => db.doc(`marketHistory/${s}`)));
      snaps.forEach((snap, i) => { out[symbols[i]] = snap.exists ? (snap.data().closes || {}) : {}; });
      return out;
    },

    async getRisk() {
      return read('market/risk');
    },

    async saveRisk(report) {
      await db.doc('market/risk').set(report);
    },

    async getRiskSummary() {
      return read('market/riskSummary');
    },

    /** Merges, so a failed attempt keeps the last good summary visible. */
    async saveRiskSummary(fields) {
      await db.doc('market/riskSummary').set(fields, { merge: true });
    },

    // ---------- weekly family overview ----------

    async getDigestSwitch() {
      return read(`${root}config/digest`);
    },

    /**
     * Calendar entries between from and to (plus all yearly ones), open tasks,
     * open polls and the people list (for first names).
     */
    async getFamilyWeekData({ from, to, base = '' }) {
      const docs = (snap) => snap.docs.map((d) => d.data());
      // base: '' for the whole family, 'households/{id}/' for one household.
      const [dated, yearly, tasks, polls, people] = await Promise.all([
        db.collection(`${root}${base}events`).where('date', '>=', from).where('date', '<=', to).get(),
        db.collection(`${root}${base}events`).where('repeat', '==', 'yearly').get(),
        db.collection(`${root}${base}tasks`).where('done', '==', false).get(),
        db.collection(`${root}${base}polls`).where('closed', '==', false).get(),
        db.collection(`${root}people`).get(),
      ]);
      return {
        events: [...docs(dated).filter((e) => e.repeat !== 'yearly'), ...docs(yearly)],
        tasks: docs(tasks),
        polls: docs(polls),
        people: docs(people),
      };
    },

    /** Merges, so a failed attempt keeps the last good overview visible. */
    async saveDigest(fields, base = '') {
      await db.doc(`${root}${base}digest/current`).set(fields, { merge: true });
    },

    // ---------- chat translations ----------

    async getTranslateSwitch() {
      return read(`${root}config/translate`);
    },

    /** The message a translation request points to (family room or household room). */
    async getMessage({ household, roomId, messageId }) {
      const path = household
        ? `${root}households/${household}/rooms/${roomId}/messages/${messageId}`
        : `${root}rooms/${roomId}/messages/${messageId}`;
      return read(path);
    },

    /** Counts one translation for a person and day; false when the daily limit is reached. */
    async useTranslationQuota(uid, day, limit) {
      const ref = db.doc(`translateUsage/${uid}`);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : {};
        const count = data.day === day ? data.count || 0 : 0;
        if (count >= limit) return false;
        tx.set(ref, { day, count: count + 1 });
        return true;
      });
    },

    async saveTranslation(id, fields) {
      await db.doc(`${root}translations/${id}`).set(fields, { merge: true });
    },

    async listHouseholds() {
      const snap = await db.collection(`${root}households`).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  };
}
