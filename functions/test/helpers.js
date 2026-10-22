// Test helpers: fake NGN Market answers (made up numbers, shaped like the
// official OpenAPI spec), a stub API client that records every call, and an
// in-memory store with the same methods as firestore-store.js.
import { trimCloses } from '../market.js';

export const BIG_NAMES = [
  ['NVDA', 'NVIDIA Corporation'], ['MSFT', 'Microsoft Corporation'], ['AAPL', 'Apple Inc.'],
  ['GOOGL', 'Alphabet Inc.'], ['AMZN', 'Amazon.com, Inc.'], ['META', 'Meta Platforms, Inc.'],
  ['AVGO', 'Broadcom Inc.'], ['TSLA', 'Tesla, Inc.'], ['BRK.B', 'Berkshire Hathaway Inc.'],
  ['JPM', 'JPMorgan Chase & Co.'], ['WMT', 'Walmart Inc.'], ['LLY', 'Eli Lilly and Company'],
  ['V', 'Visa Inc.'], ['ORCL', 'Oracle Corporation'], ['MA', 'Mastercard Incorporated'],
  ['NFLX', 'Netflix, Inc.'], ['XOM', 'Exxon Mobil Corporation'], ['COST', 'Costco Wholesale Corporation'],
  ['JNJ', 'Johnson & Johnson'], ['HD', 'The Home Depot, Inc.'], ['PG', 'The Procter & Gamble Company'],
  ['BAC', 'Bank of America Corporation'], ['ABBV', 'AbbVie Inc.'], ['KO', 'The Coca-Cola Company'],
  ['SAP', 'SAP SE'], ['PLTR', 'Palantir Technologies Inc.'], ['CVX', 'Chevron Corporation'],
  ['AMD', 'Advanced Micro Devices, Inc.'], ['CSCO', 'Cisco Systems, Inc.'], ['MCD', 'McDonald\'s Corporation'],
];

export function tickerItem(symbol, name, i, quoteTime) {
  const price = Math.round((40 + ((i * 37) % 460) + i / 7) * 100) / 100;
  const changePct = Math.round((((i * 53) % 61) / 10 - 3) * 100) / 100;
  const prevClose = Math.round((price / (1 + changePct / 100)) * 100) / 100;
  return {
    symbol, name, security_type: 'stock', sector: 'Technology', industry: 'Software', country: 'US',
    shares_outstanding: 1000000, logo_url: null,
    last_price: price, prev_close: prevClose, change_abs: Math.round((price - prevClose) * 100) / 100,
    change_pct: changePct, volume: 1000000 + i, market_cap: 4e12 / (i + 1),
    high_52wk: price * 1.2, low_52wk: price * 0.7, is_delayed: true, quote_time: quoteTime,
  };
}

export function topTickers(quoteTime, count = 200) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const [symbol, name] = BIG_NAMES[i] || [`T${String(i).padStart(3, '0')}`, `Testaktie ${i}`];
    items.push(tickerItem(symbol, name, i, quoteTime));
  }
  return items;
}

export function indexItems(quoteTime) {
  return [
    { symbol: '$SPX', name: 'S&P 500 INDEX', last_price: 6712.45, change_abs: 31.2, change_pct: 0.47, quote_time: quoteTime },
    { symbol: '$DJI', name: 'DOW JONES INDUSTRIAL AVERAGE', last_price: 46890.12, change_abs: -88.5, change_pct: -0.19, quote_time: quoteTime },
    { symbol: '$COMP', name: 'NASDAQ COMPOSITE', last_price: 22941.3, change_abs: 120.4, change_pct: 0.53, quote_time: quoteTime },
    { symbol: '$NDX', name: 'NASDAQ 100', last_price: 25102.77, change_abs: 140.1, change_pct: 0.56, quote_time: quoteTime },
  ];
}

export function meta({ used = 100, remaining = 2900, resetAt = '2026-11-15T00:00:00.000Z' } = {}) {
  return { plan: 'free', calls_used: used, calls_remaining: remaining, reset_at: resetAt, market: 'US', currency: 'USD' };
}

export class StubError extends Error {}

/**
 * Stub client. `answers` maps a method name to a function returning
 * { data, meta } or throwing an NgnError. Every call is recorded.
 */
export function stubClient(answers) {
  const calls = [];
  const wrap = (name) => async (params) => {
    calls.push({ name, params });
    if (!answers[name]) throw new StubError(`unexpected call ${name}`);
    return answers[name](params, calls.length);
  };
  return { calls, usTickers: wrap('usTickers'), usIndices: wrap('usIndices'), usHolidays: wrap('usHolidays') };
}

export function memoryStore(initial = {}) {
  const state = {
    market: { enabled: true },
    watchlist: [],
    status: null,
    calendar: null,
    latest: null,
    history: {},
    ...initial,
  };
  return {
    state,
    async getMarketSwitch() { return state.market; },
    async getWatchlist() { return state.watchlist; },
    async getStatus() { return state.status ? structuredClone(state.status) : null; },
    async saveStatus(s) { state.status = structuredClone(s); },
    async getCalendar() { return state.calendar ? structuredClone(state.calendar) : null; },
    async saveCalendar(c) { state.calendar = structuredClone(c); },
    async getLatest() { return state.latest ? structuredClone(state.latest) : null; },
    async saveLatest(l) { state.latest = structuredClone(l); },
    async saveCloses(symbol, entries) {
      state.history[symbol] = trimCloses({ ...(state.history[symbol] || {}), ...entries });
    },
  };
}

export const silentLogger = () => {
  const entries = [];
  return {
    entries,
    info: (msg, data) => entries.push({ level: 'info', msg, data }),
    warn: (msg, data) => entries.push({ level: 'warn', msg, data }),
    debug: () => {},
  };
};
