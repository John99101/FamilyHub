// Fills the LOCAL Firestore emulator with stub market data by running the
// real update code (runMarketUpdate + Firestore store) against a fake NGN
// Market. Made up prices only. It refuses to run without the emulator.
//
//   1. npm run emulators          (in the project folder, keep it running)
//   2. node functions/scripts/demo-stub-data.mjs
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirestoreStore } from '../firestore-store.js';
import { runMarketUpdate, nyParts, parseHolidays } from '../market.js';
import { topTickers, indexItems, tickerItem, meta } from '../test/helpers.js';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
const PROJECT = 'demo-familyhub';
if (!PROJECT.startsWith('demo-')) throw new Error('Only for the local demo project.');

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const store = createFirestoreStore(db);

// A gentle random walk per symbol and day, so the small charts have a shape.
function wobble(symbol, day) {
  let seed = 0;
  for (const c of `${symbol}${day}`) seed = (seed * 31 + c.charCodeAt(0)) % 100000;
  return 1 + Math.sin(day / 3 + symbol.length) * 0.04 + ((seed % 100) - 50) / 2500;
}

function stubClient(dayIndex, quoteTime) {
  const shift = (item) => {
    const f = wobble(item.symbol, dayIndex);
    const prev = wobble(item.symbol, dayIndex - 1);
    const price = Math.round(item.last_price * f * 100) / 100;
    const prevClose = Math.round(item.last_price * prev * 100) / 100;
    return { ...item, last_price: price, prev_close: prevClose, change_abs: Math.round((price - prevClose) * 100) / 100, change_pct: Math.round(((price / prevClose) - 1) * 10000) / 100 };
  };
  return {
    usTickers: async (params) => {
      if (params.search) {
        const found = params.search.startsWith('ZZ') ? [] : [shift(tickerItem(params.search, `${params.search} Holdings Inc.`, 11, quoteTime))];
        return { data: { data: found, pagination: {} }, meta: meta({ used: 640, remaining: 2360 }) };
      }
      return { data: { data: topTickers(quoteTime).map(shift), pagination: {} }, meta: meta({ used: 640, remaining: 2360 }) };
    },
    usIndices: async () => ({ data: { data: indexItems(quoteTime), count: 4 }, meta: meta({ used: 640, remaining: 2360 }) }),
    usHolidays: async () => ({ data: { holidays: [] }, meta: meta({ used: 640, remaining: 2360 }) }),
  };
}

const quiet = { info: () => {}, warn: (m, d) => console.warn(m, d), debug: () => {} };

await db.doc('config/market').set({ enabled: true, updatedAt: new Date(), updatedBy: 'demo script' });
await db.doc('market/calendar').set({
  holidays: parseHolidays({ holidays: [
    { date: '2026-11-26', name: 'Thanksgiving Day', early_close: false },
    { date: '2026-11-27', name: 'Day after Thanksgiving', early_close: true, close_time: '13:00:00' },
  ] }),
  fetchedAt: new Date(),
});

// 30 past trading days: one run 30 minutes after the close (16:30 New York = 20:30 UTC in summer time).
const today = new Date();
let day = 0;
for (let back = 45; back >= 1; back -= 1) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back, 20, 30));
  const ny = nyParts(d);
  if (ny.weekday === 'Sat' || ny.weekday === 'Sun') continue;
  day += 1;
  const closeTime = new Date(d.getTime() - 30 * 60 * 1000).toISOString();
  await db.doc('market/status').delete(); // no pause carried over between simulated days
  await runMarketUpdate({ client: stubClient(day, closeTime), store, now: d, logger: quiet });
}

// One run right now (if New York is in trading hours), else a run at the last close.
const now = new Date();
const plan = nyParts(now);
const quoteTime = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
const result = await runMarketUpdate({ client: stubClient(day + 1, quoteTime), store, now, logger: quiet });
console.log('Demo data written. Last run:', result.kind, result.reason, `(New York ${plan.date} ${Math.floor(plan.minutes / 60)}:${String(plan.minutes % 60).padStart(2, '0')})`);
process.exit(0);
