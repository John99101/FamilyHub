// Market update logic. Pure functions plus one orchestrator (runMarketUpdate)
// that gets the API client and the storage passed in, so tests can use stubs.
import { NgnError } from './ngn-client.js';

export const NY_TIME_ZONE = 'America/New_York';
export const OPEN_MINUTES = 9 * 60 + 30;          // 09:30 New York time
export const CLOSE_MINUTES = 16 * 60;             // 16:00 New York time
export const AFTER_CLOSE_DELAY = 30;              // one extra run 30 minutes after the close
export const SCHEDULE_TOLERANCE = 3;              // scheduler may fire a few minutes late
export const TOP_LIMIT = 200;                     // largest US stocks by market value
export const MAX_EXTRA_SEARCHES = 5;              // watchlist symbols outside the top list, per run
export const MIN_CALLS_REMAINING = 300;           // below this, stop until the quota resets
export const CALENDAR_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
export const HISTORY_MAX_DAYS = 400;
export const WATCHLIST_MAX = 10;
export const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;

// ---------- time helpers ----------

const nyFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: NY_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
});

/** Date, weekday and minutes after midnight in New York for a moment in time. */
export function nyParts(date) {
  const p = Object.fromEntries(nyFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: p.weekday,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

export function isWeekendDay(weekday) {
  return weekday === 'Sat' || weekday === 'Sun';
}

function weekdayOfDateString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "13:00:00" or "13:00" → 780 */
export function parseClockMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** The trading day before dateStr, skipping weekends and full holidays. */
export function previousTradingDay(dateStr, holidays = []) {
  const closed = new Set(holidays.filter((h) => !h.earlyClose).map((h) => h.date));
  let day = addDays(dateStr, -1);
  for (let i = 0; i < 14; i += 1) {
    if (!isWeekendDay(weekdayOfDateString(day)) && !closed.has(day)) return day;
    day = addDays(day, -1);
  }
  return null;
}

/**
 * Decides what a scheduled run should do.
 * The scheduler fires every 30 minutes 09:00 to 16:30 New York time, Monday to Friday.
 * @returns {{kind: 'skip'|'regular'|'afterClose', reason: string, date: string}}
 */
export function planRun(now, holidays = []) {
  const ny = nyParts(now);
  const base = { date: ny.date };
  if (isWeekendDay(ny.weekday)) return { ...base, kind: 'skip', reason: 'weekend' };

  const holiday = holidays.find((h) => h.date === ny.date);
  if (holiday && !holiday.earlyClose) return { ...base, kind: 'skip', reason: `holiday: ${holiday.name || ny.date}` };

  const close = (holiday && holiday.earlyClose && parseClockMinutes(holiday.closeTime)) || CLOSE_MINUTES;
  if (ny.minutes < OPEN_MINUTES - SCHEDULE_TOLERANCE) return { ...base, kind: 'skip', reason: 'before open' };
  if (ny.minutes <= close + SCHEDULE_TOLERANCE) return { ...base, kind: 'regular', reason: 'market hours' };
  if (ny.minutes <= close + AFTER_CLOSE_DELAY + SCHEDULE_TOLERANCE) return { ...base, kind: 'afterClose', reason: 'after the close' };
  return { ...base, kind: 'skip', reason: 'after close' };
}

// ---------- parsing API answers ----------

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v.length > 0 ? v : null);

function listFrom(data) {
  // List endpoints answer { data: [...], pagination } inside the envelope's data.
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

export function parseQuote(item) {
  if (!item || !str(item.symbol)) return null;
  return {
    symbol: item.symbol,
    name: str(item.name) || item.symbol,
    price: num(item.last_price),
    prevClose: num(item.prev_close),
    changeAbs: num(item.change_abs),
    changePct: num(item.change_pct),
    marketCap: num(item.market_cap),
    quoteTime: str(item.quote_time),
    delayed: item.is_delayed !== false,
  };
}

export function parseTickerList(data) {
  return listFrom(data).map(parseQuote).filter(Boolean);
}

export function parseIndices(data) {
  return listFrom(data)
    .filter((i) => i && str(i.symbol))
    .map((i) => ({
      symbol: i.symbol,
      name: str(i.name) || i.symbol,
      price: num(i.last_price),
      changeAbs: num(i.change_abs),
      changePct: num(i.change_pct),
      quoteTime: str(i.quote_time),
    }));
}

export function parseHolidays(data) {
  const list = Array.isArray(data?.holidays) ? data.holidays : [];
  return list
    .filter((h) => h && /^\d{4}-\d{2}-\d{2}$/.test(String(h.date)))
    .map((h) => ({
      date: h.date,
      name: str(h.name) || '',
      earlyClose: h.early_close === true,
      closeTime: str(h.close_time),
    }));
}

/** Keeps known holidays (so today's holiday is not lost) and adds the fresh ones. */
export function mergeHolidays(previous = [], fresh = [], today) {
  const byDate = new Map();
  for (const h of previous) if (h.date >= addDays(today, -7)) byDate.set(h.date, h);
  for (const h of fresh) byDate.set(h.date, h);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Watchlist symbols in a safe, unique, upper case form. */
export function cleanWatchlist(symbols) {
  if (!Array.isArray(symbols)) return [];
  const out = [];
  for (const s of symbols) {
    if (typeof s !== 'string') continue;
    const symbol = s.trim().toUpperCase();
    if (SYMBOL_PATTERN.test(symbol) && !out.includes(symbol)) out.push(symbol);
  }
  return out.slice(0, WATCHLIST_MAX);
}

/**
 * Closing prices to store for the small charts (only in the run after the close).
 * Uses quotes from today only: last price as today's close, and prev_close as
 * the official close of the previous trading day (fixes yesterday's value).
 */
export function closesFromQuotes(quotes, watchlist, today, previousDay) {
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const result = {};
  for (const symbol of watchlist) {
    const q = bySymbol.get(symbol);
    if (!q || !q.quoteTime) continue;
    if (nyParts(new Date(q.quoteTime)).date !== today) continue;
    const entries = {};
    if (q.price !== null) entries[today] = q.price;
    if (q.prevClose !== null && previousDay) entries[previousDay] = q.prevClose;
    if (Object.keys(entries).length) result[symbol] = entries;
  }
  return result;
}

export function trimCloses(closes, maxDays = HISTORY_MAX_DAYS) {
  const dates = Object.keys(closes).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const keep = dates.slice(-maxDays);
  return Object.fromEntries(keep.map((d) => [d, closes[d]]));
}

// ---------- call budget ----------

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * Wraps every API call: counts calls, reads meta.calls_remaining after each
 * answer, and stops the run (never retries) on budget, rate or quota problems.
 */
export function createCallGuard(now) {
  const guard = {
    calls: 0,
    stopped: false,
    meta: null,
    state: 'ok',
    pausedUntil: null,
    pauseReason: null,
    error: null,
  };

  guard.call = async (label, fn) => {
    if (guard.stopped) return null;
    guard.calls += 1;
    try {
      const result = await fn();
      if (result.meta && typeof result.meta === 'object') guard.meta = { ...guard.meta, ...result.meta };
      const remaining = result.meta?.calls_remaining;
      if (typeof remaining === 'number' && remaining < MIN_CALLS_REMAINING) {
        guard.stopped = true;
        guard.state = 'paused';
        guard.pauseReason = 'budget';
        guard.pausedUntil = parseDate(result.meta.reset_at) || new Date(now.getTime() + 24 * 3600 * 1000);
      }
      return result;
    } catch (err) {
      guard.stopped = true;
      const e = err instanceof NgnError ? err : new NgnError({ status: 0, code: 'UNKNOWN', message: 'unexpected error' });
      guard.error = { code: e.code, status: e.status, call: label };
      if (e.meta) guard.meta = { ...guard.meta, ...e.meta };
      if (e.code === 'RATE_LIMITED') {
        // Wait as long as the API asks, then the next scheduled run continues. No retry here.
        guard.state = 'waiting';
        guard.pauseReason = 'rate';
        guard.pausedUntil = new Date(now.getTime() + (e.retryAfterSeconds || 60) * 1000);
      } else if (e.code === 'QUOTA_EXCEEDED') {
        guard.state = 'paused';
        guard.pauseReason = 'quota';
        guard.pausedUntil = parseDate(e.meta?.reset_at) || new Date(now.getTime() + 24 * 3600 * 1000);
      } else {
        guard.state = 'error';
      }
      return null;
    }
  };
  return guard;
}

// ---------- the scheduled run ----------

/**
 * One scheduled run. Never throws for API problems; returns a summary.
 * @param {object} deps
 * @param {object} deps.client  from createNgnClient (or a stub in tests)
 * @param {object} deps.store   Firestore adapter (or an in-memory store in tests)
 * @param {Date}   [deps.now]
 * @param {object} [deps.logger] needs info() and warn()
 */
export async function runMarketUpdate({ client, store, now = new Date(), logger = console }) {
  const summary = (kind, reason, extra = {}) => ({ kind, reason, calls: 0, ...extra });

  const marketSwitch = await store.getMarketSwitch();
  if (!marketSwitch || marketSwitch.enabled !== true) {
    return summary('skip', 'switched off');
  }

  const status = (await store.getStatus()) || {};
  if (status.pausedUntil && now < status.pausedUntil) {
    return summary('skip', `paused until ${status.pausedUntil.toISOString()}`);
  }

  const ny = nyParts(now);
  if (isWeekendDay(ny.weekday)) return summary('skip', 'weekend');

  const guard = createCallGuard(now);
  // Symbols that a search did not find today (not searched again until tomorrow).
  const unknown = { ...(status.unknownSymbols || {}) };

  // Holiday calendar: refreshed about once a week (1 call).
  const calendar = await store.getCalendar();
  let holidays = calendar?.holidays || [];
  const calendarAge = calendar?.fetchedAt ? now - calendar.fetchedAt : Infinity;
  if (calendarAge > CALENDAR_MAX_AGE_MS) {
    const res = await guard.call('holidays', () => client.usHolidays({ upcoming: true, limit: 100 }));
    if (res) {
      holidays = mergeHolidays(holidays, parseHolidays(res.data), ny.date);
      await store.saveCalendar({ holidays, fetchedAt: now });
    }
  }

  const plan = planRun(now, holidays);
  if (plan.kind === 'skip') {
    if (guard.calls > 0) await saveStatus();
    logRun(plan.kind, plan.reason);
    return summary('skip', plan.reason, { calls: guard.calls });
  }

  const previous = (await store.getLatest()) || {};
  const watchlist = cleanWatchlist(await store.getWatchlist());

  // 1 call: the 200 largest US stocks.
  let quotes = null;
  const tickersRes = await guard.call('tickers', () => client.usTickers({ sort: 'market_cap', order: 'desc', limit: TOP_LIMIT }));
  if (tickersRes) quotes = parseTickerList(tickersRes.data);

  // 1 call: US indices.
  let indices = null;
  const indicesRes = await guard.call('indices', () => client.usIndices());
  if (indicesRes) indices = parseIndices(indicesRes.data);

  // Up to 5 calls: watchlist symbols that are not in the top list.
  const topSymbols = new Set((quotes || previous.quotes || []).map((q) => q.symbol));
  const previousExtras = new Map((previous.extras || []).map((q) => [q.symbol, q]));
  for (const s of Object.keys(unknown)) if (!watchlist.includes(s) || unknown[s] !== ny.date) delete unknown[s];

  const candidates = watchlist
    .filter((s) => !topSymbols.has(s) && unknown[s] !== ny.date)
    .sort((a, b) => fetchedMs(previousExtras.get(a)) - fetchedMs(previousExtras.get(b)))
    .slice(0, MAX_EXTRA_SEARCHES);

  const freshExtras = new Map();
  for (const symbol of candidates) {
    const res = await guard.call(`search ${symbol}`, () => client.usTickers({ search: symbol, limit: 20 }));
    if (!res) break;
    const match = parseTickerList(res.data).find((q) => q.symbol === symbol);
    if (match) freshExtras.set(symbol, { ...match, fetchedAt: now.toISOString() });
    else unknown[symbol] = ny.date;
  }

  const extras = watchlist
    .filter((s) => !topSymbols.has(s))
    .map((s) => freshExtras.get(s) || previousExtras.get(s))
    .filter(Boolean);

  const gotData = Boolean(quotes || indices || freshExtras.size);
  if (gotData) {
    await store.saveLatest({
      updatedAt: now,
      quotes: quotes || previous.quotes || [],
      indices: indices || previous.indices || [],
      extras,
      quotesUpdatedAt: quotes ? now : (previous.quotesUpdatedAt || null),
    });
  }

  // Closing prices for the watchlist charts, once a day after the close.
  let closesSaved = 0;
  if (plan.kind === 'afterClose' && gotData) {
    const all = [...(quotes || []), ...freshExtras.values()];
    const closes = closesFromQuotes(all, watchlist, ny.date, previousTradingDay(ny.date, holidays));
    for (const [symbol, entries] of Object.entries(closes)) {
      await store.saveCloses(symbol, entries);
      closesSaved += 1;
    }
  }

  await saveStatus({ success: gotData });
  logRun(plan.kind, plan.reason, { closesSaved, extraSearches: candidates.length });
  return summary(plan.kind, plan.reason, {
    calls: guard.calls, state: guard.state, pausedUntil: guard.pausedUntil, error: guard.error, closesSaved,
  });

  function fetchedMs(q) {
    return q?.fetchedAt ? new Date(q.fetchedAt).getTime() : 0;
  }

  async function saveStatus({ success = false } = {}) {
    await store.saveStatus({
      state: guard.state,
      pausedUntil: guard.pausedUntil,
      pauseReason: guard.pauseReason,
      lastRunAt: now,
      lastSuccessAt: success ? now : (status.lastSuccessAt || null),
      callsThisRun: guard.calls,
      callsUsed: num(guard.meta?.calls_used),
      callsRemaining: num(guard.meta?.calls_remaining),
      resetAt: parseDate(guard.meta?.reset_at),
      plan: str(guard.meta?.plan),
      lastError: guard.error,
      unknownSymbols: unknown,
    });
  }

  function logRun(kind, reason, extra = {}) {
    const entry = {
      kind,
      reason,
      callsThisRun: guard.calls,
      callsUsed: guard.meta?.calls_used ?? null,
      callsRemaining: guard.meta?.calls_remaining ?? null,
      resetAt: guard.meta?.reset_at ?? null,
      state: guard.state,
      error: guard.error,
      ...extra,
    };
    if (guard.state === 'ok') logger.info('NGN market run', entry);
    else logger.warn('NGN market run', entry);
  }
}
