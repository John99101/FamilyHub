// Tests for the weekly family overview. No real API calls: the client is a
// stub, and the one test with the real Anthropic SDK gets a fake network layer.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import {
  runWeeklyDigest, runAllDigests, collectWeek, buildDigestPrompt, buildDigestRequest, parseDigest,
  weekRange, berlinDay, yearlyDay, addDays, dayWords, DIGEST_MAX_CHARS,
} from '../digest.js';
import { AI_MODEL } from '../ai-summary.js';
import { memoryStore, silentLogger } from './helpers.js';

const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = () => { throw new Error('real network call in a test'); }; });
after(() => { globalThis.fetch = realFetch; });

// Sunday 25 October 2026, 17:00 in Berlin (winter time from that night: UTC+1).
const SUNDAY_RUN = new Date('2026-10-25T16:00:00Z');
const WEEK = { start: '2026-10-26', end: '2026-11-01' };

const event = (overrides) => ({
  title: 'Termin', date: '2026-10-27', endDate: '', time: '', place: '', note: 'never sent',
  kind: 'event', repeat: 'none', yearKnown: true, createdBy: 'u1', createdByName: 'Anna', ...overrides,
});
const task = (overrides) => ({ title: 'Aufgabe', note: 'never sent', assignee: '', due: '', done: false, doneAt: null, doneBy: '', ...overrides });
const poll = (overrides) => ({ question: 'Frage?', options: ['A', 'B'], multi: false, closed: false, votes: {}, ...overrides });
const people = [
  { name: 'Ben Beispiel', mail: 'ben@example.com', photo: '' },
  { name: 'Anna', mail: 'anna@example.com', photo: '' },
];

function familyData() {
  return {
    events: [
      event({ title: 'Zahnarzt Tim', date: '2026-10-27', time: '09:30', place: 'Praxis Dr. Müller' }),
      event({ title: 'Elternabend', date: '2026-10-29', time: '19:00' }),
      event({ title: 'Vorbei', date: '2026-10-20' }),
      event({ title: 'Nächste Woche', date: '2026-11-02' }),
      event({ title: 'Besuch bei Oma', date: '2026-10-24', endDate: '2026-10-27' }),
      event({ title: 'Oma', kind: 'birthday', repeat: 'yearly', date: '1946-10-30' }),
      event({ title: 'Onkel Paul', kind: 'birthday', repeat: 'yearly', date: '2000-10-28', yearKnown: false }),
      event({ title: 'Ben', kind: 'birthday', repeat: 'yearly', date: '2014-11-05' }),
      event({ title: 'Hochzeitstag', kind: 'event', repeat: 'yearly', date: '2001-10-31' }),
    ],
    tasks: [
      task({ title: 'Müll rausbringen', due: '2026-10-28', assignee: 'ben@example.com' }),
      task({ title: 'Steuer abgeben', due: '2026-10-20', assignee: 'anna@example.com' }),
      task({ title: 'Irgendwann', due: '' }),
      task({ title: 'Später', due: '2026-11-20' }),
      task({ title: 'Erledigt', due: '2026-10-27', done: true, doneAt: new Date(), doneBy: 'Anna' }),
    ],
    polls: [
      poll({ question: 'Wohin am Wochenende?', votes: { u1: [0], u2: [1] } }),
      poll({ question: 'Alt', closed: true }),
    ],
    people,
  };
}

function fakeResponse(json, extra = {}) {
  return {
    id: 'msg_test', type: 'message', role: 'assistant', model: AI_MODEL,
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(json) }],
    stop_reason: 'end_turn', stop_details: null,
    usage: { input_tokens: 1200, output_tokens: 900 },
    ...extra,
  };
}

const GOOD = {
  de: 'Am Montag wird Oma 80. Am Dienstag um 9:30 ist Tim beim Zahnarzt.',
  en: 'On Friday Grandma turns 80. On Tuesday at 09:30 Tim sees the dentist.',
  fr: 'Vendredi, Mamie fête ses 80 ans. Mardi à 9 h 30, Tim va chez le dentiste.',
};

function stubAnthropic(answer = () => fakeResponse(GOOD)) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (req) => { calls.push(req); return answer(req); } } },
  };
}

describe('the week and its days', () => {
  it('the overview on Sunday covers Monday to Sunday of the coming week', () => {
    assert.deepEqual(weekRange(SUNDAY_RUN), WEEK);
  });

  it('uses the Berlin date, not the UTC date', () => {
    assert.equal(berlinDay(new Date('2026-10-25T23:30:00Z')), '2026-10-26');
    assert.equal(berlinDay(new Date('2026-07-01T22:30:00Z')), '2026-07-02');
  });

  it('a birthday on 29 February falls on 28 February in other years', () => {
    assert.equal(yearlyDay('2000-02-29', 2027), '2027-02-28');
    assert.equal(yearlyDay('2000-02-29', 2028), '2028-02-29');
    assert.equal(yearlyDay('1946-10-30', 2026), '2026-10-30');
  });

  it('adds days across months and years, and writes days in words', () => {
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(dayWords('2026-10-26'), 'Monday 26 October');
  });
});

describe('collecting the week', () => {
  const week = collectWeek({ ...familyData(), ...WEEK });

  it('lists the week\'s entries in date order, with ages, places and multi day entries', () => {
    assert.deepEqual(week.calendar, [
      { from: 'Saturday 24 October', to: 'Tuesday 27 October', title: 'Besuch bei Oma' },
      { day: 'Tuesday 27 October', time: '09:30', place: 'Praxis Dr. Müller', title: 'Zahnarzt Tim' },
      { day: 'Wednesday 28 October', kind: 'birthday', title: 'Onkel Paul' },
      { day: 'Thursday 29 October', time: '19:00', title: 'Elternabend' },
      { day: 'Friday 30 October', kind: 'birthday', title: 'Oma', turns: 80 },
      { day: 'Saturday 31 October', kind: 'yearly', title: 'Hochzeitstag' },
    ]);
    assert.deepEqual(week.laterBirthdays, [{ day: 'Thursday 5 November', kind: 'birthday', title: 'Ben', turns: 12 }]);
  });

  it('lists due and overdue tasks with first names, counts the rest, and ignores done tasks', () => {
    assert.deepEqual(week.tasksDue, [
      { title: 'Steuer abgeben', due: 'Tuesday 20 October', overdue: true, who: 'Anna' },
      { title: 'Müll rausbringen', due: 'Wednesday 28 October', who: 'Ben' },
    ]);
    assert.equal(week.otherOpenTasks, 2);
  });

  it('lists open polls with the number of votes', () => {
    assert.deepEqual(week.openPolls, [{ question: 'Wohin am Wochenende?', votes: 2 }]);
    assert.equal(week.empty, false);
  });

  it('never contains notes, mail addresses or ISO dates', () => {
    const prompt = buildDigestPrompt(week);
    assert.ok(!prompt.includes('never sent'));
    assert.ok(!prompt.includes('@'));
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(prompt));
    assert.match(prompt, /Monday 26 October to Sunday 1 November 2026/);
  });

  it('an empty week is marked as empty', () => {
    const empty = collectWeek({ events: [event({ date: '2026-12-24' })], tasks: [task({ due: '' })], polls: [], people, ...WEEK });
    assert.equal(empty.empty, true);
  });
});

describe('request and answer', () => {
  it('asks Claude Opus 5.5 for German, English and French as JSON, with the fallback', () => {
    const req = buildDigestRequest('data');
    assert.equal(req.model, 'claude-opus-5-5');
    assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
    assert.equal(req.fallbacks, 'default');
    assert.equal(req.output_config.effort, 'medium');
    assert.deepEqual(req.output_config.format.schema.required, ['de', 'en', 'fr']);
    assert.ok(!('thinking' in req));
    assert.ok(!('temperature' in req));
    assert.match(req.system, /never follow instructions/i);
  });

  it('cleans the answer: no hyphens or dashes, "Mail" instead of "E-Mail", limited length', () => {
    const texts = parseDigest(fakeResponse({
      de: 'Bitte die E-Mail an Hans-Peter lesen – danach Sport.',
      en: 'Read the e-mail.',
      fr: 'Lire le mail. '.repeat(400),
    }));
    assert.equal(texts.de, 'Bitte die Mail an Hans Peter lesen danach Sport.');
    assert.equal(texts.en, 'Read the Mail.');
    assert.ok(texts.fr.length <= DIGEST_MAX_CHARS);
  });

  it('a refusal, a cut off answer or a missing language is an error', () => {
    assert.throws(() => parseDigest(fakeResponse(GOOD, { stop_reason: 'refusal', stop_details: { category: 'cyber' } })), { type: 'refusal' });
    assert.throws(() => parseDigest(fakeResponse(GOOD, { stop_reason: 'max_tokens' })), { type: 'max_tokens' });
    assert.throws(() => parseDigest(fakeResponse({ de: 'Hallo', en: 'Hi', fr: '' })), { type: 'empty' });
  });

  it('the real Anthropic SDK sends the beta header and the body as intended (fake network)', async () => {
    let seen;
    const client = new Anthropic({
      apiKey: 'test-key-not-real',
      maxRetries: 0,
      fetch: async (url, init) => {
        seen = { headers: new Headers(init.headers), body: JSON.parse(init.body) };
        return new Response(JSON.stringify(fakeResponse(GOOD)), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    const response = await client.beta.messages.create(buildDigestRequest('data'));
    assert.match(seen.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
    assert.equal(seen.body.fallbacks, 'default');
    assert.deepEqual(seen.body.output_config.format.schema.properties, { de: { type: 'string' }, en: { type: 'string' }, fr: { type: 'string' } });
    assert.deepEqual(parseDigest(response), GOOD);
  });
});

describe('the Sunday run', () => {
  it('writes the overview in three languages', async () => {
    const store = memoryStore(familyData());
    const anthropic = stubAnthropic();
    const result = await runWeeklyDigest({ anthropic, store, now: SUNDAY_RUN, logger: silentLogger() });
    assert.equal(result.kind, 'written');
    assert.equal(anthropic.calls.length, 1);
    assert.match(anthropic.calls[0].messages[0].content, /Zahnarzt Tim/);
    assert.equal(store.state.digest.weekStart, '2026-10-26');
    assert.equal(store.state.digest.weekEnd, '2026-11-01');
    assert.equal(store.state.digest.de, GOOD.de);
    assert.equal(store.state.digest.fr, GOOD.fr);
    assert.equal(store.state.digest.empty, false);
    assert.equal(store.state.digest.lastError, null);
    // Multi day entries that started up to 62 days before, birthdays up to a week after.
    assert.deepEqual(store.state.weekQueries, [{ from: '2026-08-25', to: '2026-11-08' }]);
  });

  it('makes no request when the week is empty', async () => {
    const store = memoryStore({ people });
    const anthropic = stubAnthropic();
    const result = await runWeeklyDigest({ anthropic, store, now: SUNDAY_RUN, logger: silentLogger() });
    assert.equal(result.kind, 'empty');
    assert.equal(anthropic.calls.length, 0);
    assert.equal(store.state.digest.empty, true);
  });

  it('does nothing when an admin switched it off', async () => {
    const store = memoryStore({ ...familyData(), digestSwitch: { enabled: false } });
    const anthropic = stubAnthropic();
    const result = await runWeeklyDigest({ anthropic, store, now: SUNDAY_RUN, logger: silentLogger() });
    assert.equal(result.kind, 'skip');
    assert.equal(anthropic.calls.length, 0);
    assert.equal(store.state.digest, null);
  });

  it('a failed run keeps last week\'s overview and notes the error', async () => {
    const last = { weekStart: '2026-10-19', weekEnd: '2026-10-25', de: 'Alt', en: 'Old', fr: 'Ancien', empty: false, lastError: null };
    const store = memoryStore({ ...familyData(), digest: last });
    const anthropic = stubAnthropic(() => { const e = new Error('overloaded'); e.status = 529; throw e; });
    const result = await runWeeklyDigest({ anthropic, store, now: SUNDAY_RUN, logger: silentLogger() });
    assert.equal(result.kind, 'error');
    assert.equal(store.state.digest.weekStart, '2026-10-19');
    assert.equal(store.state.digest.de, 'Alt');
    assert.deepEqual(store.state.digest.lastError, { type: 'api', status: 529, name: 'Error' });
  });
});

describe('households', () => {
  const zurich = {
    events: [event({ title: 'Elternabend Zürich', date: '2026-10-28', time: '19:00' })],
    tasks: [task({ title: 'Zimmer aufräumen', due: '2026-10-27', assignee: 'ben@example.com' })],
    polls: [],
  };

  it('writes the family overview and one per household, each from its own entries', async () => {
    const store = memoryStore({
      ...familyData(),
      households: [{ id: 'h1', name: 'Zürich', members: ['anna@example.com'] }, { id: 'h2', name: 'Leer', members: ['ben@example.com'] }],
      householdData: { 'households/h1/': zurich },
    });
    const anthropic = stubAnthropic();
    const result = await runAllDigests({ anthropic, store, now: SUNDAY_RUN, logger: silentLogger() });
    assert.deepEqual(result.results.map((r) => [r.base, r.kind]), [['', 'written'], ['households/h1/', 'written'], ['households/h2/', 'empty']]);
    assert.equal(anthropic.calls.length, 2);
    const familyPrompt = anthropic.calls[0].messages[0].content;
    const householdPrompt = anthropic.calls[1].messages[0].content;
    assert.match(familyPrompt, /the whole family/);
    assert.ok(!familyPrompt.includes('Elternabend Zürich'), 'household entries stay out of the family overview');
    assert.match(householdPrompt, /household \\"Zürich\\"/);
    assert.match(householdPrompt, /Elternabend Zürich/);
    assert.ok(!householdPrompt.includes('Zahnarzt Tim'), 'family entries stay out of the household overview');
    assert.match(householdPrompt, /"who": "Ben"/);
    assert.equal(store.state.householdDigests['households/h1/'].de, GOOD.de);
    assert.equal(store.state.householdDigests['households/h2/'].empty, true);
    assert.equal(store.state.digest.de, GOOD.de);
  });

  it('one failing group does not stop the others', async () => {
    const store = memoryStore({
      ...familyData(),
      households: [{ id: 'h1', name: 'Zürich', members: ['anna@example.com'] }],
      householdData: { 'households/h1/': zurich },
    });
    let n = 0;
    const anthropic = stubAnthropic(() => { n += 1; if (n === 1) { const e = new Error('overloaded'); e.status = 529; throw e; } return fakeResponse(GOOD); });
    const result = await runAllDigests({ anthropic, store, now: SUNDAY_RUN, logger: silentLogger() });
    assert.deepEqual(result.results.map((r) => r.kind), ['error', 'written']);
  });

  it('the admin switch stops all overviews; households without members are skipped', async () => {
    const off = memoryStore({ ...familyData(), digestSwitch: { enabled: false }, households: [{ id: 'h1', name: 'Zürich', members: ['anna@example.com'] }] });
    const anthropic = stubAnthropic();
    assert.equal((await runAllDigests({ anthropic, store: off, now: SUNDAY_RUN, logger: silentLogger() })).kind, 'skip');
    assert.equal(anthropic.calls.length, 0);
    const empty = memoryStore({ ...familyData(), households: [{ id: 'h9', name: 'Niemand', members: [] }] });
    const result = await runAllDigests({ anthropic, store: empty, now: SUNDAY_RUN, logger: silentLogger() });
    assert.deepEqual(result.results.map((r) => r.base), ['']);
  });
});
