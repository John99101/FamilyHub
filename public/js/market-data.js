// Live copies of the market documents in Firestore, shared by the Börse
// page and the settings page. The browser never talks to NGN Market: every
// price shown comes from the copy the Cloud Function stored in Firestore.
import { db, doc, onSnapshot, getDoc } from './firebase.js';

export const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;
export const WATCHLIST_MAX = 10;

export function createMarketData() {
  const state = {
    latest: null,     // market/latest
    status: null,     // market/status
    switch: null,     // config/market
    watchlist: [],    // config/watchlist symbols
    history: {},      // symbol -> { closes }
    loaded: { latest: false, status: false, switch: false, watchlist: false },
  };
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) fn(state); };
  const historyFetchedAt = {};

  const watch = (path, key, map = (d) => d) => onSnapshot(doc(db, path), (snap) => {
    state[key] = map(snap.exists() ? snap.data() : null);
    state.loaded[key] = true;
    if (key === 'watchlist') loadHistory();
    notify();
  }, (err) => console.warn(`Reading ${path} failed`, err.code));

  const stops = [
    watch('market/latest', 'latest'),
    watch('market/status', 'status'),
    watch('config/market', 'switch'),
    watch('config/watchlist', 'watchlist', (d) => (Array.isArray(d?.symbols) ? d.symbols.filter((s) => typeof s === 'string') : [])),
  ];

  // Daily closes for the small charts (changes once a day, so read, not listened to).
  async function loadHistory(force = false) {
    const now = Date.now();
    await Promise.all(state.watchlist.map(async (symbol) => {
      if (!force && historyFetchedAt[symbol] && now - historyFetchedAt[symbol] < 3600 * 1000) return;
      historyFetchedAt[symbol] = now;
      try {
        const snap = await getDoc(doc(db, 'marketHistory', symbol));
        state.history[symbol] = snap.exists() ? snap.data() : null;
      } catch (err) {
        console.warn('Reading chart data failed', err.code);
      }
    }));
    notify();
  }

  return {
    state,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    refreshHistory: () => loadHistory(false),
    stop() { for (const s of stops) s(); listeners.clear(); },
  };
}

/** Quote for a symbol from the stored copy (top list or extra watchlist searches). */
export function findQuote(latest, symbol) {
  if (!latest) return null;
  return (latest.quotes || []).find((q) => q.symbol === symbol)
    || (latest.extras || []).find((q) => q.symbol === symbol)
    || null;
}

export const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v ? new Date(v) : null);
