// Tests for visible names (public/js/names.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDisplayName, cleanDisplayName, planNameWork, visibleName } from '../public/js/names.js';

const people = [
  { id: 'u_me', name: 'Jonathan Beispiel', mail: 'me@example.com' },
  { id: 'u_ben', name: 'Ben Beispiel', mail: 'ben@example.com', displayName: 'Benni' },
  { id: 'u_anna', name: 'Anna Muster', mail: 'anna@example.com' },
];

describe('visible names', () => {
  it('the chosen name wins over the Google name', () => {
    assert.equal(visibleName(people[1]), 'Benni');
    assert.equal(visibleName(people[2]), 'Anna Muster');
    assert.equal(visibleName({ mail: 'oma@example.com' }), 'oma');
  });

  it('accepts good names and cleans spaces', () => {
    assert.equal(checkDisplayName('  Papa   Jonathan ', { uid: 'u_me', people }), '');
    assert.equal(cleanDisplayName('  Papa   Jonathan '), 'Papa Jonathan');
    assert.equal(checkDisplayName('Grand-maman 🌻', { uid: 'u_me', people }), '');
  });

  it('refuses empty, too long, odd characters, and names others use', () => {
    const ctx = { uid: 'u_me', people, names: { Benni: 'u_ben' } };
    assert.equal(checkDisplayName('   ', ctx), 'empty');
    assert.equal(checkDisplayName('x'.repeat(41), ctx), 'long');
    assert.equal(checkDisplayName('a/b', ctx), 'chars');
    assert.equal(checkDisplayName('A|B', ctx), 'chars');
    assert.equal(checkDisplayName('.Papa', ctx), 'chars');
    assert.equal(checkDisplayName('Benni', ctx), 'taken');
    assert.equal(checkDisplayName('benni', ctx), 'taken');
    assert.equal(checkDisplayName('anna muster', ctx), 'taken');
    assert.equal(checkDisplayName('Jonathan Beispiel', ctx), '');
  });

  it('gives back extra names and frees names nobody uses any more', () => {
    const plan = planNameWork({
      uid: 'u_me',
      people: [{ id: 'u_me', displayName: 'Papa' }, { id: 'u_ben', displayName: 'Benni' }],
      names: { Papa: 'u_me', Paps: 'u_me', Benni: 'u_ben', 'Ben B': 'u_ben', Weg: 'u_gone' },
    });
    assert.deepEqual(plan, { release: ['Paps'], orphans: ['Ben B', 'Weg'] });
  });
});
