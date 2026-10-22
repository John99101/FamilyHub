// Firestore storage for the market data (Admin SDK, so security rules do not
// apply here; the rules only let family members read these documents).
//
//   config/market          { enabled }                     on/off switch (admins, in the app; missing = on)
//   config/watchlist       { symbols: [..] }               family watchlist (members, in the app)
//   market/latest          { updatedAt, quotes, indices, extras, quotesUpdatedAt }
//   market/status          { state, pausedUntil, callsUsed, callsRemaining, resetAt, ... }
//   market/calendar        { holidays: [...], fetchedAt }
//   marketHistory/{symbol} { symbol, closes: { 'YYYY-MM-DD': price } }
import { trimCloses } from './market.js';

const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v ? new Date(v) : null);

export function createFirestoreStore(db) {
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
  };
}
