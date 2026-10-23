// Tests for how the app keeps exactly one color per person and frees stuck
// colors (planColorWork in public/js/colors.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planColorWork, COLOR_IDS } from '../public/js/colors.js';

const ME = 'u_me';

describe('one color per person', () => {
  it('someone without a color takes the first free one', () => {
    const plan = planColorWork({ uid: ME, people: [{ id: ME }], colors: { red: 'u_x' } });
    assert.deepEqual(plan, { take: 'orange', repair: null, release: [], orphans: ['red'] });
  });

  it('nothing to do when the profile and the lock agree', () => {
    const plan = planColorWork({ uid: ME, people: [{ id: ME, color: 'red' }, { id: 'u_x', color: 'blue' }], colors: { red: ME, blue: 'u_x' } });
    assert.deepEqual(plan, { take: null, repair: null, release: [], orphans: [] });
  });

  it('extra colors this person holds are given back', () => {
    const plan = planColorWork({ uid: ME, people: [{ id: ME, color: 'orange' }], colors: { red: ME, orange: ME, gold: ME } });
    assert.deepEqual(plan.release, ['red', 'gold']);
    assert.equal(plan.take, null);
  });

  it('a lost profile color is written back instead of taking another one', () => {
    const plan = planColorWork({ uid: ME, people: [{ id: ME }], colors: { green: ME, teal: ME } });
    assert.deepEqual([plan.repair, plan.release, plan.take], ['green', ['teal'], null]);
  });

  it('colors stuck with someone whose profile shows another color are freed', () => {
    const people = [{ id: ME, color: 'red' }, { id: 'u_ben', color: 'sky' }];
    const colors = { red: ME, sky: 'u_ben', blue: 'u_ben', pink: 'u_gone' };
    assert.deepEqual(planColorWork({ uid: ME, people, colors }).orphans, ['blue', 'pink']);
  });

  it('when all colors are held, nobody new gets one', () => {
    const colors = Object.fromEntries(COLOR_IDS.map((c, i) => [c, `u_${i}`]));
    const people = COLOR_IDS.map((c, i) => ({ id: `u_${i}`, color: c }));
    const plan = planColorWork({ uid: ME, people: [...people, { id: ME }], colors });
    assert.deepEqual(plan, { take: null, repair: null, release: [], orphans: [] });
  });
});
