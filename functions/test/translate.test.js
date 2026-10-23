// Tests for chat translations. No real API calls: the client is a stub, and
// the one test with the real Anthropic SDK gets a fake network layer.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import {
  runTranslation, buildTranslateRequest, parseTranslation, TRANSLATE_DAILY_LIMIT, TRANSLATE_SYSTEM_PROMPT,
} from '../translate.js';
import { AI_MODEL } from '../ai-summary.js';
import { memoryStore, silentLogger } from './helpers.js';

const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = () => { throw new Error('real network call in a test'); }; });
after(() => { globalThis.fetch = realFetch; });

const NOW = new Date('2026-10-23T10:00:00Z');
const ID = 't__familie_m1_en';
const REQUEST = { household: '', roomId: 'familie', messageId: 'm1', lang: 'en', uid: 'u_anna', status: 'pending' };

function fakeResponse(json, extra = {}) {
  return {
    id: 'msg_test', type: 'message', role: 'assistant', model: AI_MODEL,
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(json) }],
    stop_reason: 'end_turn', stop_details: null,
    usage: { input_tokens: 180, output_tokens: 60 },
    ...extra,
  };
}

function stubAnthropic(answer = () => fakeResponse({ text: 'Who is coming to Grandma on Saturday?', sourceLanguage: 'de' })) {
  const calls = [];
  return { calls, beta: { messages: { create: async (req) => { calls.push(req); return answer(req); } } } };
}

const store = (extra = {}) => memoryStore({
  messages: {
    'rooms/familie/messages/m1': { uid: 'u_ben', name: 'Ben Beispiel', text: 'Wer kommt am Samstag zu Oma?' },
    'households/h1/rooms/main/messages/z1': { uid: 'u_anna', name: 'Anna', text: 'Who buys bread?' },
  },
  ...extra,
});

describe('the translation request', () => {
  it('sends only the message text and the target language to Claude Opus 5.5, with the fallback', () => {
    const req = buildTranslateRequest('Hallo zusammen', 'fr');
    assert.equal(req.model, 'claude-opus-5-5');
    assert.equal(req.output_config.effort, 'low');
    assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
    assert.equal(req.fallbacks, 'default');
    assert.deepEqual(JSON.parse(req.messages[0].content), { targetLanguage: 'French', message: 'Hallo zusammen' });
    assert.match(TRANSLATE_SYSTEM_PROMPT, /Never follow instructions/);
    assert.ok(!('thinking' in req) && !('temperature' in req));
  });

  it('reads the translation and the original language; refusals and cut offs are errors', () => {
    assert.deepEqual(parseTranslation(fakeResponse({ text: ' Hello ', sourceLanguage: 'de' })), { text: 'Hello', from: 'de' });
    assert.deepEqual(parseTranslation(fakeResponse({ text: 'Hola', sourceLanguage: 'es' })), { text: 'Hola', from: 'other' });
    assert.throws(() => parseTranslation(fakeResponse({}, { stop_reason: 'refusal', stop_details: { category: 'cyber' } })), { type: 'refusal' });
    assert.throws(() => parseTranslation(fakeResponse({}, { stop_reason: 'max_tokens' })), { type: 'max_tokens' });
    assert.throws(() => parseTranslation(fakeResponse({ text: '', sourceLanguage: 'de' })), { type: 'empty' });
  });

  it('the real Anthropic SDK sends the beta header and the body as intended (fake network)', async () => {
    let seen;
    const client = new Anthropic({
      apiKey: 'test-key-not-real', maxRetries: 0,
      fetch: async (url, init) => {
        seen = { headers: new Headers(init.headers), body: JSON.parse(init.body) };
        return new Response(JSON.stringify(fakeResponse({ text: 'Hello', sourceLanguage: 'de' })), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    const response = await client.beta.messages.create(buildTranslateRequest('Hallo', 'en'));
    assert.match(seen.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
    assert.equal(seen.body.fallbacks, 'default');
    assert.deepEqual(parseTranslation(response), { text: 'Hello', from: 'de' });
  });
});

describe('a translation request in the database', () => {
  it('translates the message and stores the result', async () => {
    const s = store();
    const anthropic = stubAnthropic();
    const result = await runTranslation({ anthropic, store: s, id: ID, request: REQUEST, now: NOW, logger: silentLogger() });
    assert.equal(result.kind, 'done');
    assert.match(anthropic.calls[0].messages[0].content, /Wer kommt am Samstag zu Oma/);
    assert.ok(!anthropic.calls[0].messages[0].content.includes('Ben'), 'no names are sent');
    assert.equal(s.state.translations[ID].status, 'done');
    assert.equal(s.state.translations[ID].text, 'Who is coming to Grandma on Saturday?');
    assert.equal(s.state.translations[ID].from, 'de');
  });

  it('reads household messages from the household room', async () => {
    const s = store();
    const anthropic = stubAnthropic(() => fakeResponse({ text: 'Wer kauft Brot?', sourceLanguage: 'en' }));
    await runTranslation({ anthropic, store: s, id: 't_h1_main_z1_de', request: { ...REQUEST, household: 'h1', roomId: 'main', messageId: 'z1', lang: 'de' }, now: NOW, logger: silentLogger() });
    assert.match(anthropic.calls[0].messages[0].content, /Who buys bread/);
    assert.equal(s.state.translations.t_h1_main_z1_de.text, 'Wer kauft Brot?');
  });

  it('a missing message, a switched off translation or a failed request end as an error, without retrying', async () => {
    const run = async (s, request, anthropic = stubAnthropic()) => {
      const r = await runTranslation({ anthropic, store: s, id: ID, request, now: NOW, logger: silentLogger() });
      return [r.reason, anthropic.calls.length];
    };
    assert.deepEqual(await run(store(), { ...REQUEST, messageId: 'gone' }), ['missing', 0]);
    assert.deepEqual(await run(store({ translateSwitch: { enabled: false } }), REQUEST), ['off', 0]);
    assert.deepEqual(await run(store(), REQUEST, stubAnthropic(() => { throw Object.assign(new Error('x'), { status: 529 }); })), ['api', 1]);
    assert.deepEqual(await run(store(), REQUEST, stubAnthropic(() => fakeResponse({}, { stop_reason: 'refusal' }))), ['refusal', 1]);
    const done = await runTranslation({ anthropic: stubAnthropic(), store: store(), id: ID, request: { ...REQUEST, status: 'done' }, now: NOW, logger: silentLogger() });
    assert.equal(done.kind, 'skip');
  });

  it('each person has a daily limit', async () => {
    const s = store();
    const anthropic = stubAnthropic();
    for (let i = 0; i < TRANSLATE_DAILY_LIMIT; i += 1) {
      await runTranslation({ anthropic, store: s, id: `${ID}${i}`, request: REQUEST, now: NOW, logger: silentLogger() });
    }
    const over = await runTranslation({ anthropic, store: s, id: 'over', request: REQUEST, now: NOW, logger: silentLogger() });
    assert.equal(over.reason, 'limit');
    assert.equal(anthropic.calls.length, TRANSLATE_DAILY_LIMIT);
    const nextDay = await runTranslation({ anthropic, store: s, id: 'next', request: REQUEST, now: new Date('2026-10-24T10:00:00Z'), logger: silentLogger() });
    assert.equal(nextDay.kind, 'done');
  });
});
