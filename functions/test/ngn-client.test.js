// Tests for the NGN Market client with a stub fetch. No real API calls.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createNgnClient, NgnError, NGN_BASE_URL } from '../ngn-client.js';

const FAKE_KEY = 'test-key-not-real';
const realFetch = globalThis.fetch;

before(() => {
  // Safety net: any accidental real network call fails the test run.
  globalThis.fetch = () => { throw new Error('real network call in a test'); };
});
after(() => { globalThis.fetch = realFetch; });

function stubFetch(status, body, headers = {}) {
  const seen = [];
  const fn = async (url, init) => {
    seen.push({ url: String(url), init });
    return new Response(body === undefined ? 'not json' : JSON.stringify(body), { status, headers });
  };
  fn.seen = seen;
  return fn;
}

describe('NGN client', () => {
  it('calls the right URL with the key in the Authorization header only', async () => {
    const fetchImpl = stubFetch(200, { success: true, data: { data: [], pagination: {} }, meta: { calls_remaining: 2999 } });
    const client = createNgnClient({ apiKey: FAKE_KEY, fetchImpl });
    const res = await client.usTickers({ sort: 'market_cap', order: 'desc', limit: 200 });
    assert.deepEqual(res.meta, { calls_remaining: 2999 });
    const call = fetchImpl.seen[0];
    assert.equal(call.url, `${NGN_BASE_URL}/us/tickers?sort=market_cap&order=desc&limit=200`);
    assert.equal(call.init.headers.Authorization, `Bearer ${FAKE_KEY}`);
    assert.ok(!call.url.includes(FAKE_KEY));
  });

  it('uses the documented free endpoints', async () => {
    const fetchImpl = stubFetch(200, { success: true, data: {}, meta: {} });
    const client = createNgnClient({ apiKey: FAKE_KEY, fetchImpl });
    await client.usIndices();
    await client.usHolidays({ upcoming: true, limit: 100 });
    assert.equal(fetchImpl.seen[0].url, `${NGN_BASE_URL}/us/indices`);
    assert.equal(fetchImpl.seen[1].url, `${NGN_BASE_URL}/us/market/holidays?upcoming=true&limit=100`);
  });

  it('turns an error envelope into an NgnError with code and quota meta', async () => {
    const fetchImpl = stubFetch(429, {
      success: false,
      error: { code: 'QUOTA_EXCEEDED', message: 'Monthly call limit of 3,000 reached.' },
      meta: { calls_used: 3000, calls_remaining: 0, reset_at: '2026-11-15T00:00:00.000Z' },
    });
    const client = createNgnClient({ apiKey: FAKE_KEY, fetchImpl });
    await assert.rejects(client.usIndices(), (err) => {
      assert.ok(err instanceof NgnError);
      assert.equal(err.code, 'QUOTA_EXCEEDED');
      assert.equal(err.status, 429);
      assert.equal(err.meta.reset_at, '2026-11-15T00:00:00.000Z');
      assert.ok(!err.message.includes(FAKE_KEY));
      return true;
    });
  });

  it('reads Retry-After on RATE_LIMITED', async () => {
    const fetchImpl = stubFetch(429, { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests.' } }, { 'Retry-After': '42' });
    const client = createNgnClient({ apiKey: FAKE_KEY, fetchImpl });
    await assert.rejects(client.usIndices(), (err) => err.code === 'RATE_LIMITED' && err.retryAfterSeconds === 42);
  });

  it('reports PLAN_REQUIRED for paid endpoints', async () => {
    const fetchImpl = stubFetch(403, { success: false, error: { code: 'PLAN_REQUIRED', message: 'Requires hobby.', required_plan: 'hobby', current_plan: 'free' } });
    const client = createNgnClient({ apiKey: FAKE_KEY, fetchImpl });
    await assert.rejects(client.usTickers({ search: 'X' }), (err) => err.code === 'PLAN_REQUIRED' && err.status === 403);
  });

  it('handles a broken body and network failures', async () => {
    const broken = createNgnClient({ apiKey: FAKE_KEY, fetchImpl: stubFetch(502, undefined) });
    await assert.rejects(broken.usIndices(), (err) => err.code === 'HTTP_502');
    const offline = createNgnClient({ apiKey: FAKE_KEY, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
    await assert.rejects(offline.usIndices(), (err) => err.code === 'NETWORK_ERROR' && err.status === 0);
  });

  it('refuses to start without a key', () => {
    assert.throws(() => createNgnClient({ apiKey: '' }), /NGN_API_KEY is missing/);
  });
});
