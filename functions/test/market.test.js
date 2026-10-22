// Tests for the market update logic with a stub API and an in-memory store.
// No real API calls: every NGN answer below is made up.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NgnError } from '../ngn-client.js';
import {
  nyParts, planRun, previousTradingDay, parseTickerList, parseIndices, parseHolidays,
  runMarketUpdate, cleanWatchlist, closesFromQuotes, MAX_EXTRA_SEARCHES,
} from '../market.js';
import { stubClient, memoryStore, topTickers, indexItems, tickerItem, meta, silentLogger } from './helpers.js';

const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = () => { throw new Error('real network call in a test'); }; });
after(() => { globalThis.fetch = realFetch; });

// Wednesday 21 October 2026, 10:00 in New York (summer time, UTC-4).
const WED_10_00 = new Date('2026-10-21T14:00:00Z');
const HOLIDAYS = parseHolidays({
  holidays: [
    { date: '2026-11-26', name: 'Thanksgiving Day', early_close: false, close_time: null },
    { date: '2026-11-27', name: 'Day after Thanksgiving', early_close: true, close_time: '13:00:00' },
    { date: '2026-12-25', name: 'Christmas Day', early_close: false, close_time: null },
  ],
});

function freshCalendar(now) {
  return { holidays: HOLIDAYS, fetchedAt: new Date(now.getTime() - 24 * 3600 * 1000) };
}

function normalAnswers({ quoteTime = '2026-10-21T13:40:00.000Z', remaining = 2900 } = {}) {
  return {
    usTickers: (params) => {
      if (params.search) {
        const hit = tickerItem(params.search, `Gesucht ${params.search}`, 7, quoteTime);
        return { data: { data: params.search.startsWith('NONE') ? [] : [hit], pagination: {} }, meta: meta({ remaining }) };
      }
      return { data: { data: topTickers(quoteTime), pagination: { page: 1, limit: 200 } }, meta: meta({ remaining }) };
    },
    usIndices: () => ({ data: { data: indexItems(quoteTime), count: 4 }, meta: meta({ remaining }) }),
    usHolidays: () => ({ data: { count: 3, holidays: [] }, meta: meta({ remaining }) }),
  };
}

describe('New York time and trading days', () => {
  it('converts to New York time in summer and in winter', () => {
    assert.deepEqual(nyParts(new Date('2026-07-15T14:00:00Z')), { date: '2026-07-15', weekday: 'Wed', minutes: 600 });
    assert.deepEqual(nyParts(new Date('2026-12-15T15:00:00Z')), { date: '2026-12-15', weekday: 'Tue', minutes: 600 });
  });

  it('skips weekends', () => {
    assert.equal(planRun(new Date('2026-10-24T15:00:00Z'), HOLIDAYS).kind, 'skip'); // Saturday
    assert.match(planRun(new Date('2026-10-25T15:00:00Z'), HOLIDAYS).reason, /weekend/); // Sunday
  });

  it('skips full holidays', () => {
    const plan = planRun(new Date('2026-11-26T15:00:00Z'), HOLIDAYS); // Thanksgiving 10:00 EST
    assert.equal(plan.kind, 'skip');
    assert.match(plan.reason, /holiday/);
  });

  it('follows regular hours plus one run after the close', () => {
    const at = (iso) => planRun(new Date(iso), HOLIDAYS).kind;
    assert.equal(at('2026-10-21T13:00:00Z'), 'skip');       // 09:00 before open
    assert.equal(at('2026-10-21T13:30:00Z'), 'regular');    // 09:30
    assert.equal(at('2026-10-21T20:00:00Z'), 'regular');    // 16:00
    assert.equal(at('2026-10-21T20:30:00Z'), 'afterClose'); // 16:30
    assert.equal(at('2026-10-21T21:00:00Z'), 'skip');       // 17:00
  });

  it('handles early close days (13:00)', () => {
    const at = (iso) => planRun(new Date(iso), HOLIDAYS).kind;
    assert.equal(at('2026-11-27T18:00:00Z'), 'regular');    // 13:00 EST
    assert.equal(at('2026-11-27T18:30:00Z'), 'afterClose'); // 13:30
    assert.equal(at('2026-11-27T19:00:00Z'), 'skip');       // 14:00
    assert.equal(at('2026-11-27T21:00:00Z'), 'skip');       // 16:00
  });

  it('finds the previous trading day across weekends and holidays', () => {
    assert.equal(previousTradingDay('2026-10-26', HOLIDAYS), '2026-10-23'); // Monday → Friday
    assert.equal(previousTradingDay('2026-11-27', HOLIDAYS), '2026-11-25'); // after Thanksgiving
    assert.equal(previousTradingDay('2026-11-30', HOLIDAYS), '2026-11-27'); // early close day counts
  });
});

describe('parsing NGN answers', () => {
  it('reads the nested ticker list and keeps only the needed fields', () => {
    const quotes = parseTickerList({ data: [tickerItem('AAPL', 'Apple Inc.', 2, '2026-10-21T13:40:00.000Z'), { name: 'no symbol' }], pagination: {} });
    assert.equal(quotes.length, 1);
    assert.deepEqual(Object.keys(quotes[0]).sort(), ['changeAbs', 'changePct', 'delayed', 'marketCap', 'name', 'prevClose', 'price', 'quoteTime', 'symbol']);
    assert.equal(quotes[0].symbol, 'AAPL');
    assert.equal(typeof quotes[0].price, 'number');
    assert.equal(quotes[0].delayed, true);
  });

  it('turns missing or broken numbers into null', () => {
    const [q] = parseTickerList({ data: [{ symbol: 'X', last_price: null, change_pct: 'abc', quote_time: null }] });
    assert.equal(q.price, null);
    assert.equal(q.changePct, null);
    assert.equal(q.quoteTime, null);
    assert.equal(q.name, 'X');
  });

  it('reads indices and holidays', () => {
    const indices = parseIndices({ data: indexItems('2026-10-21T13:40:00.000Z'), count: 4 });
    assert.equal(indices.length, 4);
    assert.equal(indices[0].symbol, '$SPX');
    assert.deepEqual(HOLIDAYS[1], { date: '2026-11-27', name: 'Day after Thanksgiving', earlyClose: true, closeTime: '13:00:00' });
  });

  it('cleans the watchlist', () => {
    assert.deepEqual(cleanWatchlist([' aapl', 'AAPL', 'BRK.B', 'bad symbol', 42, 'X'.repeat(13)]), ['AAPL', 'BRK.B']);
  });
});

describe('scheduled run', () => {
  it('does nothing while the market part is switched off', async () => {
    const client = stubClient(normalAnswers());
    const store = memoryStore({ market: { enabled: false } });
    const result = await runMarketUpdate({ client, store, now: WED_10_00, logger: silentLogger() });
    assert.equal(client.calls.length, 0);
    assert.equal(result.reason, 'switched off');
    const missing = await runMarketUpdate({ client, store: memoryStore({ market: null }), now: WED_10_00, logger: silentLogger() });
    assert.equal(missing.reason, 'switched off');
    assert.equal(client.calls.length, 0);
  });

  it('a regular run makes exactly 2 calls and stores quotes, indices and the update time', async () => {
    const client = stubClient(normalAnswers());
    const store = memoryStore({ calendar: freshCalendar(WED_10_00) });
    const log = silentLogger();
    const result = await runMarketUpdate({ client, store, now: WED_10_00, logger: log });
    assert.deepEqual(client.calls.map((c) => c.name), ['usTickers', 'usIndices']);
    assert.deepEqual(client.calls[0].params, { sort: 'market_cap', order: 'desc', limit: 200 });
    assert.equal(result.calls, 2);
    assert.equal(store.state.latest.quotes.length, 200);
    assert.equal(store.state.latest.indices.length, 4);
    assert.equal(store.state.latest.updatedAt.getTime(), WED_10_00.getTime());
    assert.equal(store.state.status.state, 'ok');
    assert.equal(store.state.status.callsThisRun, 2);
    assert.equal(store.state.status.callsRemaining, 2900);
    // The calls used are logged on every run.
    const entry = log.entries.find((e) => e.msg === 'NGN market run');
    assert.equal(entry.data.callsThisRun, 2);
    assert.equal(entry.data.callsUsed, 100);
    assert.equal(entry.data.callsRemaining, 2900);
  });

  it('fetches the holiday calendar when it is missing (one extra call)', async () => {
    const client = stubClient(normalAnswers());
    const store = memoryStore();
    await runMarketUpdate({ client, store, now: WED_10_00, logger: silentLogger() });
    assert.deepEqual(client.calls.map((c) => c.name), ['usHolidays', 'usTickers', 'usIndices']);
    assert.ok(store.state.calendar.fetchedAt);
  });

  it('makes no calls on weekends and holidays', async () => {
    const client = stubClient(normalAnswers());
    await runMarketUpdate({ client, store: memoryStore(), now: new Date('2026-10-24T15:00:00Z'), logger: silentLogger() });
    const thanksgiving = new Date('2026-11-26T15:00:00Z');
    const result = await runMarketUpdate({ client, store: memoryStore({ calendar: freshCalendar(thanksgiving) }), now: thanksgiving, logger: silentLogger() });
    assert.equal(client.calls.length, 0);
    assert.match(result.reason, /holiday/);
  });

  it('budget guard: below 300 remaining calls it stops at once and pauses until reset_at', async () => {
    const answers = normalAnswers({ remaining: 299 });
    const client = stubClient(answers);
    const store = memoryStore({ calendar: freshCalendar(WED_10_00), watchlist: ['ZZZA', 'ZZZB'] });
    const result = await runMarketUpdate({ client, store, now: WED_10_00, logger: silentLogger() });
    assert.equal(client.calls.length, 1, 'no further calls after the low budget answer');
    assert.equal(result.state, 'paused');
    assert.equal(store.state.status.pauseReason, 'budget');
    assert.equal(store.state.status.pausedUntil.toISOString(), '2026-11-15T00:00:00.000Z');
    assert.equal(store.state.latest.quotes.length, 200, 'data from the last answer is still used');

    // Next runs before the reset make no calls at all.
    const later = new Date(WED_10_00.getTime() + 30 * 60 * 1000);
    const skipped = await runMarketUpdate({ client, store, now: later, logger: silentLogger() });
    assert.equal(client.calls.length, 1);
    assert.match(skipped.reason, /paused until 2026-11-15/);

    // After the reset it fetches again.
    const afterReset = new Date('2026-11-16T15:00:00Z'); // Monday 10:00 EST
    store.state.calendar = freshCalendar(afterReset);
    const client2 = stubClient(normalAnswers());
    await runMarketUpdate({ client: client2, store, now: afterReset, logger: silentLogger() });
    assert.ok(client2.calls.length >= 2);
  });

  it('exactly 300 remaining is still fine', async () => {
    const client = stubClient(normalAnswers({ remaining: 300 }));
    const store = memoryStore({ calendar: freshCalendar(WED_10_00) });
    const result = await runMarketUpdate({ client, store, now: WED_10_00, logger: silentLogger() });
    assert.equal(result.state, 'ok');
    assert.equal(client.calls.length, 2);
  });

  it('429 RATE_LIMITED: stops the run, never retries, waits for Retry-After', async () => {
    const answers = normalAnswers();
    answers.usTickers = () => { throw new NgnError({ status: 429, code: 'RATE_LIMITED', message: 'Too many requests.', retryAfterSeconds: 45 }); };
    const client = stubClient(answers);
    const store = memoryStore({ calendar: freshCalendar(WED_10_00), latest: { quotes: [{ symbol: 'OLD' }], indices: [] } });
    const log = silentLogger();
    const result = await runMarketUpdate({ client, store, now: WED_10_00, logger: log });
    assert.equal(client.calls.length, 1, 'one call, no retry loop');
    assert.equal(result.state, 'waiting');
    assert.equal(store.state.status.pausedUntil.getTime(), WED_10_00.getTime() + 45000);
    assert.equal(store.state.status.lastError.code, 'RATE_LIMITED');
    assert.deepEqual(store.state.latest.quotes, [{ symbol: 'OLD' }], 'old prices stay');
    assert.equal(log.entries[0].level, 'warn');

    // 30 minutes later the next scheduled run works normally.
    const client2 = stubClient(normalAnswers());
    await runMarketUpdate({ client: client2, store, now: new Date(WED_10_00.getTime() + 30 * 60 * 1000), logger: silentLogger() });
    assert.equal(client2.calls.length, 2);
  });

  it('429 QUOTA_EXCEEDED: pauses until the reset date from meta', async () => {
    const answers = normalAnswers();
    answers.usTickers = () => {
      throw new NgnError({ status: 429, code: 'QUOTA_EXCEEDED', message: 'limit reached', meta: meta({ used: 3000, remaining: 0, resetAt: '2026-11-15T00:00:00.000Z' }) });
    };
    const client = stubClient(answers);
    const store = memoryStore({ calendar: freshCalendar(WED_10_00) });
    const result = await runMarketUpdate({ client, store, now: WED_10_00, logger: silentLogger() });
    assert.equal(client.calls.length, 1);
    assert.equal(result.state, 'paused');
    assert.equal(store.state.status.pauseReason, 'quota');
    assert.equal(store.state.status.pausedUntil.toISOString(), '2026-11-15T00:00:00.000Z');
    assert.equal(store.state.status.callsRemaining, 0);
  });

  it('other errors (for example PLAN_REQUIRED) stop the run without a pause', async () => {
    const answers = normalAnswers();
    answers.usIndices = () => { throw new NgnError({ status: 403, code: 'PLAN_REQUIRED', message: 'needs hobby' }); };
    const client = stubClient(answers);
    const store = memoryStore({ calendar: freshCalendar(WED_10_00), watchlist: ['ZZZA'] });
    const result = await runMarketUpdate({ client, store, now: WED_10_00, logger: silentLogger() });
    assert.deepEqual(client.calls.map((c) => c.name), ['usTickers', 'usIndices']);
    assert.equal(result.state, 'error');
    assert.equal(store.state.status.pausedUntil, null);
    assert.equal(store.state.latest.quotes.length, 200);
  });

  it('searches at most 5 extra watchlist symbols per run and takes turns', async () => {
    const watchlist = ['ZA', 'ZB', 'ZC', 'ZD', 'ZE', 'ZF', 'ZG', 'AAPL'];
    const client = stubClient(normalAnswers());
    const store = memoryStore({ calendar: freshCalendar(WED_10_00), watchlist });
    await runMarketUpdate({ client, store, now: WED_10_00, logger: silentLogger() });
    const searches = client.calls.filter((c) => c.params?.search).map((c) => c.params.search);
    assert.equal(searches.length, MAX_EXTRA_SEARCHES);
    assert.deepEqual(searches, ['ZA', 'ZB', 'ZC', 'ZD', 'ZE']);
    assert.ok(!searches.includes('AAPL'), 'symbols in the top list need no search');
    assert.equal(store.state.latest.extras.length, 5);

    // Next run: the two not yet fetched come first.
    const client2 = stubClient(normalAnswers());
    await runMarketUpdate({ client: client2, store, now: new Date(WED_10_00.getTime() + 1800000), logger: silentLogger() });
    const searches2 = client2.calls.filter((c) => c.params?.search).map((c) => c.params.search);
    assert.deepEqual(searches2.slice(0, 2), ['ZF', 'ZG']);
    assert.equal(searches2.length, MAX_EXTRA_SEARCHES);
    assert.equal(store.state.latest.extras.length, 7);
  });

  it('a symbol the search cannot find is not searched again the same day', async () => {
    const client = stubClient(normalAnswers());
    const store = memoryStore({ calendar: freshCalendar(WED_10_00), watchlist: ['NONEX'] });
    await runMarketUpdate({ client, store, now: WED_10_00, logger: silentLogger() });
    assert.deepEqual(store.state.status.unknownSymbols, { NONEX: '2026-10-21' });
    const client2 = stubClient(normalAnswers());
    await runMarketUpdate({ client: client2, store, now: new Date(WED_10_00.getTime() + 1800000), logger: silentLogger() });
    assert.equal(client2.calls.filter((c) => c.params?.search).length, 0);
    // Next day it tries again.
    const thursday = new Date('2026-10-22T14:00:00Z');
    store.state.calendar = freshCalendar(thursday);
    const client3 = stubClient(normalAnswers({ quoteTime: '2026-10-22T13:40:00.000Z' }));
    await runMarketUpdate({ client: client3, store, now: thursday, logger: silentLogger() });
    assert.equal(client3.calls.filter((c) => c.params?.search).length, 1);
  });

  it('after the close it stores one closing price per watchlist symbol and day', async () => {
    const at1630 = new Date('2026-10-21T20:30:00Z');
    const client = stubClient(normalAnswers({ quoteTime: '2026-10-21T20:00:00.000Z' }));
    const store = memoryStore({ calendar: freshCalendar(at1630), watchlist: ['AAPL', 'ZEXTRA'] });
    const result = await runMarketUpdate({ client, store, now: at1630, logger: silentLogger() });
    assert.equal(result.kind, 'afterClose');
    assert.equal(result.closesSaved, 2);
    const aapl = store.state.latest.quotes.find((q) => q.symbol === 'AAPL');
    assert.deepEqual(store.state.history.AAPL, { '2026-10-20': aapl.prevClose, '2026-10-21': aapl.price });
    assert.ok(store.state.history.ZEXTRA['2026-10-21']);
  });

  it('regular runs do not touch the chart history', async () => {
    const client = stubClient(normalAnswers());
    const store = memoryStore({ calendar: freshCalendar(WED_10_00), watchlist: ['AAPL'] });
    await runMarketUpdate({ client, store, now: WED_10_00, logger: silentLogger() });
    assert.deepEqual(store.state.history, {});
  });

  it('closes ignore quotes that are not from today', () => {
    const quotes = parseTickerList({ data: [tickerItem('AAPL', 'Apple', 1, '2026-10-20T20:00:00.000Z')] });
    assert.deepEqual(closesFromQuotes(quotes, ['AAPL'], '2026-10-21', '2026-10-20'), {});
  });
});
