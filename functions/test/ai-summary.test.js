// Tests for the daily AI summary. No real API calls: the client is a stub,
// and the one test with the real Anthropic SDK gets a fake network layer.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import {
  runRiskSummary, buildRiskPrompt, buildSummaryRequest, parseSummary, cleanSummaryText,
  AI_MODEL, SUMMARY_MAX_CHARS,
} from '../ai-summary.js';
import { computeRiskReport } from '../risk.js';
import { memoryStore, makeCloses, silentLogger } from './helpers.js';

const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = () => { throw new Error('real network call in a test'); }; });
after(() => { globalThis.fetch = realFetch; });

const AFTER_SUMMARY_TIME = new Date('2026-10-21T21:15:00Z'); // Wednesday 17:15 New York

function riskFixture(asOf = '2026-10-21') {
  return computeRiskReport({
    watchlist: ['AAPL', 'NEW'],
    histories: {
      AAPL: makeCloses(asOf, 45, (i) => 100 + Math.sin(i) * 3),
      NEW: makeCloses(asOf, 4, (i) => 10 + i),
      $SPX: makeCloses(asOf, 45, (i) => 6000 + Math.sin(i) * 40),
    },
    names: { AAPL: 'Apple Inc.', NEW: 'New Company Inc.' },
    benchmarkSymbol: '$SPX',
    asOf,
    now: new Date(`${asOf}T20:30:00Z`),
  });
}

function fakeResponse(json, extra = {}) {
  return {
    id: 'msg_test', type: 'message', role: 'assistant', model: AI_MODEL,
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(json) }],
    stop_reason: 'end_turn', stop_details: null,
    usage: { input_tokens: 900, output_tokens: 700 },
    ...extra,
  };
}

function stubAnthropic(answer) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (params) => { calls.push(params); return typeof answer === 'function' ? answer(params) : answer; } } },
  };
}

const GOOD = { en: 'Apple moved the most this period. Figures describe the past only.', fr: 'Apple a le plus bougé sur la période. Les chiffres décrivent le passé.' };

describe('prompt and request', () => {
  it('the prompt carries the computed figures, dates in words, no ISO dates', () => {
    const prompt = buildRiskPrompt(riskFixture());
    assert.match(prompt, /AAPL \(Apple Inc\.\)/);
    assert.match(prompt, /Yearly volatility \d+\.\d %/);
    assert.match(prompt, /NEW \(New Company Inc\.\): only 3 days of data, figures not available yet/);
    assert.match(prompt, /21 October 2026/);
    assert.doesNotMatch(prompt, /\d{4}-\d{2}-\d{2}/);
  });

  it('request: Claude Opus 5.5, medium effort, JSON schema, server side fallback, no thinking or sampling settings', () => {
    const req = buildSummaryRequest('x');
    assert.equal(req.model, 'claude-opus-5-5');
    assert.equal(req.output_config.effort, 'medium');
    assert.equal(req.output_config.format.type, 'json_schema');
    assert.deepEqual(req.output_config.format.schema.required, ['en', 'fr']);
    assert.equal(req.output_config.format.schema.additionalProperties, false);
    assert.equal(req.fallbacks, 'default');
    assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
    for (const key of ['thinking', 'temperature', 'top_p', 'top_k', 'tool_choice']) assert.ok(!(key in req), key);
  });

  it('the real Anthropic SDK sends the beta header and the body as intended (fake network)', async () => {
    let seen;
    const client = new Anthropic({
      apiKey: 'test-key-not-real',
      maxRetries: 0,
      fetch: async (url, init) => {
        seen = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) };
        return new Response(JSON.stringify(fakeResponse(GOOD)), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    const response = await client.beta.messages.create(buildSummaryRequest('figures'));
    assert.match(seen.url, /\/v1\/messages(\?|$)/);
    assert.match(seen.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
    assert.equal(seen.headers.get('x-api-key'), 'test-key-not-real');
    assert.equal(seen.body.fallbacks, 'default');
    assert.equal(seen.body.model, 'claude-opus-5-5');
    assert.equal(seen.body.output_config.effort, 'medium');
    assert.ok(!('betas' in seen.body), 'betas travel as a header, not in the body');
    assert.deepEqual(parseSummary(response), GOOD);
  });
});

describe('reading the answer', () => {
  it('removes hyphens and dashes and tidies spaces', () => {
    assert.equal(cleanSummaryText('A long-term view — calm , then a fall.'), 'A long term view calm, then a fall.');
    assert.equal(cleanSummaryText('Une baisse de 4,2 % : peut-être.'), 'Une baisse de 4,2 % : peut être.');
  });

  it('limits very long text at a sentence end', () => {
    const long = 'This is one sentence. '.repeat(200);
    const out = cleanSummaryText(long);
    assert.ok(out.length <= SUMMARY_MAX_CHARS);
    assert.ok(out.endsWith('.'));
  });

  it('rejects refusals, cut off answers, broken JSON and missing languages', () => {
    assert.throws(() => parseSummary({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] }), (e) => e.type === 'refusal' && e.category === 'cyber');
    assert.throws(() => parseSummary(fakeResponse(GOOD, { stop_reason: 'max_tokens' })), (e) => e.type === 'max_tokens');
    assert.throws(() => parseSummary({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }), (e) => e.type === 'bad_json');
    assert.throws(() => parseSummary(fakeResponse({ en: 'only english', fr: '' })), (e) => e.type === 'empty');
  });
});

describe('daily run', () => {
  it('writes the summary once per day and logs the token use', async () => {
    const anthropic = stubAnthropic(fakeResponse(GOOD));
    const store = memoryStore({ risk: riskFixture() });
    const log = silentLogger();
    const result = await runRiskSummary({ anthropic, store, now: AFTER_SUMMARY_TIME, logger: log });
    assert.equal(result.kind, 'written');
    assert.equal(anthropic.calls.length, 1);
    assert.equal(store.state.riskSummary.asOf, '2026-10-21');
    assert.equal(store.state.riskSummary.en, GOOD.en);
    assert.equal(store.state.riskSummary.fr, GOOD.fr);
    assert.equal(store.state.riskSummary.lastError, null);
    assert.equal(log.entries[0].data.outputTokens, 700);

    const again = await runRiskSummary({ anthropic, store, now: AFTER_SUMMARY_TIME, logger: silentLogger() });
    assert.equal(again.reason, 'already written today');
    assert.equal(anthropic.calls.length, 1);
  });

  it('makes no call when switched off, without figures, with old figures, or without enough data', async () => {
    const anthropic = stubAnthropic(fakeResponse(GOOD));
    const cases = [
      [{ market: { enabled: false }, risk: riskFixture() }, /market part switched off/],
      [{ market: { enabled: true, aiEnabled: false }, risk: riskFixture() }, /AI summary switched off/],
      [{}, /no risk figures/],
      [{ risk: riskFixture('2026-10-20') }, /not today/],
      [{ risk: { ...riskFixture(), symbols: [{ symbol: 'NEW', enough: false, days: 3 }] } }, /not enough data/],
    ];
    for (const [initial, reason] of cases) {
      const result = await runRiskSummary({ anthropic, store: memoryStore(initial), now: AFTER_SUMMARY_TIME, logger: silentLogger() });
      assert.equal(result.kind, 'skip');
      assert.match(result.reason, reason);
    }
    assert.equal(anthropic.calls.length, 0);
  });

  it('an API error keeps yesterday\'s summary and is not retried in a loop', async () => {
    const failing = stubAnthropic(() => { const e = new Error('overloaded'); e.status = 529; e.name = 'InternalServerError'; throw e; });
    const store = memoryStore({ risk: riskFixture(), riskSummary: { asOf: '2026-10-20', en: 'old en', fr: 'old fr' } });
    const result = await runRiskSummary({ anthropic: failing, store, now: AFTER_SUMMARY_TIME, logger: silentLogger() });
    assert.equal(result.kind, 'error');
    assert.equal(failing.calls.length, 1);
    assert.equal(store.state.riskSummary.en, 'old en');
    assert.equal(store.state.riskSummary.asOf, '2026-10-20');
    assert.deepEqual(store.state.riskSummary.lastError, { type: 'api', status: 529, name: 'InternalServerError' });
  });

  it('a refusal is recorded without overwriting the last summary', async () => {
    const refusing = stubAnthropic({ ...fakeResponse(GOOD), stop_reason: 'refusal', stop_details: { category: 'general_harms' }, content: [] });
    const store = memoryStore({ risk: riskFixture(), riskSummary: { asOf: '2026-10-20', en: 'old en', fr: 'old fr' } });
    const result = await runRiskSummary({ anthropic: refusing, store, now: AFTER_SUMMARY_TIME, logger: silentLogger() });
    assert.equal(result.kind, 'error');
    assert.equal(store.state.riskSummary.lastError.type, 'refusal');
    assert.equal(store.state.riskSummary.en, 'old en');
  });
});
