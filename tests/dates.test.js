// Tests for the calendar day helpers in public/js/dates.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoOf, addDays, daysBetween, weekdayIndex, yearlyDay, shiftMonth, monthGrid, yearsOn,
  entriesByDay, upcoming, isIso,
} from '../public/js/dates.js';

const ev = (overrides) => ({ title: 'X', date: '2026-10-27', endDate: '', time: '', kind: 'event', repeat: 'none', yearKnown: true, ...overrides });

describe('calendar days', () => {
  it('works with local days and plain day strings', () => {
    assert.equal(isoOf(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-03-01', -1), '2028-02-29');
    assert.equal(daysBetween('2026-10-22', '2026-11-01'), 10);
    assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // across the change to summer time
    assert.equal(weekdayIndex('2026-10-26'), 0); // Monday
    assert.equal(weekdayIndex('2026-11-01'), 6); // Sunday
    assert.ok(isIso('2026-02-28'));
    assert.ok(!isIso('2026-2-28'));
  });

  it('moves between months and builds a 6 week grid starting on Monday', () => {
    assert.equal(shiftMonth('2026-12', 1), '2027-01');
    assert.equal(shiftMonth('2026-01', -1), '2025-12');
    const grid = monthGrid('2026-10');
    assert.equal(grid.length, 42);
    assert.equal(grid[0], '2026-09-28');
    assert.equal(weekdayIndex(grid[0]), 0);
    assert.ok(grid.includes('2026-10-31'));
  });

  it('a birthday on 29 February falls on 28 February in other years', () => {
    assert.equal(yearlyDay('2000-02-29', 2027), '2027-02-28');
    assert.equal(yearlyDay('2000-02-29', 2028), '2028-02-29');
  });

  it('knows the age only when the year of birth is known', () => {
    assert.equal(yearsOn(ev({ kind: 'birthday', repeat: 'yearly', date: '1946-10-30' }), '2026-10-30'), 80);
    assert.equal(yearsOn(ev({ kind: 'birthday', repeat: 'yearly', date: '2000-10-30', yearKnown: false }), '2026-10-30'), null);
    assert.equal(yearsOn(ev({}), '2026-10-30'), null);
  });
});

describe('entries on days', () => {
  const events = [
    ev({ title: 'Zahnarzt', date: '2026-10-27', time: '09:30' }),
    ev({ title: 'Frühstück', date: '2026-10-27', time: '08:00' }),
    ev({ title: 'Besuch', date: '2026-10-24', endDate: '2026-10-28' }),
    ev({ title: 'Oma', kind: 'birthday', repeat: 'yearly', date: '1946-10-30' }),
    ev({ title: 'Silvester', repeat: 'yearly', date: '1999-12-31' }),
  ];

  it('puts multi day entries on every day and yearly ones on their day', () => {
    const map = entriesByDay(events, '2026-10-26', '2026-11-01');
    assert.deepEqual(map.get('2026-10-27').map((e) => e.event.title), ['Besuch', 'Frühstück', 'Zahnarzt']);
    assert.deepEqual(map.get('2026-10-26').map((e) => [e.event.title, e.first, e.last]), [['Besuch', false, false]]);
    assert.deepEqual(map.get('2026-10-28').map((e) => [e.event.title, e.last]), [['Besuch', true]]);
    assert.deepEqual(map.get('2026-10-30').map((e) => [e.event.title, e.years]), [['Oma', 80]]);
    assert.ok(!map.has('2026-10-29'));
  });

  it('yearly entries work across the turn of the year', () => {
    const map = entriesByDay(events, '2026-12-28', '2027-01-03');
    assert.deepEqual(map.get('2026-12-31').map((e) => e.event.title), ['Silvester']);
  });

  it('lists each entry once, from its first day in the range', () => {
    const list = upcoming(events, '2026-10-26', '2026-11-01');
    assert.deepEqual(list.map((e) => [e.day, e.event.title]), [
      ['2026-10-26', 'Besuch'],
      ['2026-10-27', 'Frühstück'],
      ['2026-10-27', 'Zahnarzt'],
      ['2026-10-30', 'Oma'],
    ]);
  });
});
