// Tests for public/js/vouchers.js: how loudly a gift asks to be redeemed, and the order.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { voucherMood, sortVouchers, mergeVouchers, myOpenVouchers, isInvolved } from '../public/js/vouchers.js';

const TODAY = '2027-03-01';
const gift = (overrides) => ({
  id: 'x', title: 'Escape Room', givers: ['anna@example.com'], receivers: ['ben@example.com'], givenOn: '2027-02-20',
  until: '', status: 'open', plannedOn: '', doneOn: '', ...overrides,
});
const mood = (overrides) => voucherMood(gift(overrides), TODAY);

describe('gift moods', () => {
  it('grows older: fresh, waiting, dusty, fossil', () => {
    assert.deepEqual(mood({ givenOn: '2027-02-20' }), { mood: 'fresh', days: 9, icon: '✨' });
    assert.equal(mood({ givenOn: '2027-01-30' }).mood, 'waiting');
    assert.equal(mood({ givenOn: '2026-12-01' }).mood, 'dusty');
    assert.deepEqual(mood({ givenOn: '2026-03-01' }), { mood: 'fossil', days: 365, icon: '🦖' });
  });

  it('a last valid day wins over age while it is near or past', () => {
    assert.deepEqual(mood({ givenOn: '2025-01-01', until: '2027-03-31' }), { mood: 'expiring', days: 30, icon: '⏰' });
    assert.equal(mood({ until: '2027-04-01' }).mood, 'fresh');
    assert.deepEqual(mood({ until: '2027-02-27' }), { mood: 'expired', days: 2, icon: '⌛' });
  });

  it('a planned one counts down, cheers on the day and asks afterwards', () => {
    assert.deepEqual(mood({ status: 'planned', plannedOn: '2027-03-05', until: '2027-03-02' }), { mood: 'planned', days: 4, icon: '📅' });
    assert.equal(mood({ status: 'planned', plannedOn: TODAY }).mood, 'today');
    assert.deepEqual(mood({ status: 'planned', plannedOn: '2027-02-26' }), { mood: 'didIt', days: 3, icon: '🤔' });
    assert.equal(mood({ status: 'done', doneOn: '2027-02-26' }).mood, 'done');
  });
});

describe('gift order and lists', () => {
  it('sorts the most urgent first, the nearest date or the oldest gift within a mood', () => {
    const list = [
      gift({ id: 'fresh', givenOn: '2027-02-25' }),
      gift({ id: 'planLater', status: 'planned', plannedOn: '2027-04-01' }),
      gift({ id: 'planSoon', status: 'planned', plannedOn: '2027-03-03' }),
      gift({ id: 'dustyOld', givenOn: '2026-08-01' }),
      gift({ id: 'dustyNew', givenOn: '2026-11-01' }),
      gift({ id: 'expiring', until: '2027-03-10' }),
      gift({ id: 'today', status: 'planned', plannedOn: TODAY }),
    ];
    assert.deepEqual(sortVouchers(list, TODAY).map((v) => v.id),
      ['today', 'expiring', 'planSoon', 'planLater', 'dustyOld', 'dustyNew', 'fresh']);
  });

  it('merges the three lists without doubles', () => {
    const a = gift({ id: 'a' });
    const merged = mergeVouchers([a, gift({ id: 'b' })], [gift({ id: 'a', title: 'newer copy' })], undefined);
    assert.deepEqual(merged.map((v) => [v.id, v.title]), [['a', 'newer copy'], ['b', 'Escape Room']]);
  });

  it('my open gifts are the ones I give or get and that are not redeemed', () => {
    const list = [
      gift({ id: 'given' }),
      gift({ id: 'got', givers: ['carl@example.com'], receivers: ['anna@example.com'] }),
      gift({ id: 'others', givers: ['carl@example.com'] }),
      gift({ id: 'done', status: 'done', doneOn: '2027-02-01' }),
    ];
    assert.deepEqual(myOpenVouchers(list, 'anna@example.com', TODAY).map((v) => v.id).sort(), ['given', 'got']);
    assert.ok(isInvolved(list[1], 'anna@example.com'));
    assert.ok(!isInvolved(list[2], 'anna@example.com'));
  });
});
