// Tests for public/js/find.js: finding pages on the More page, and pinned pages.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchKey, matchesQuery, cleanPins } from '../public/js/find.js';

describe('finding pages', () => {
  it('ignores case and accents', () => {
    assert.equal(searchKey('  Börse '), 'borse');
    assert.ok(matchesQuery(['Börse', 'US Kurse'], 'borse'));
    assert.ok(matchesQuery(['Météo', 'Où vit la famille'], 'METEO'));
  });

  it('needs every word, in the title or the line below it', () => {
    assert.ok(matchesQuery(['Rezepte', 'Das Kochbuch der Familie'], 'koch familie'));
    assert.ok(!matchesQuery(['Rezepte', 'Das Kochbuch der Familie'], 'koch reise'));
  });

  it('an empty search shows everything', () => {
    assert.ok(matchesQuery(['Wetter'], '   '));
  });
});

describe('pinned pages', () => {
  it('keeps known pages once, in order, and survives broken storage', () => {
    assert.deepEqual(cleanPins(['#/reisen', '#/alt', '#/reisen', '#/rezepte'], ['#/rezepte', '#/reisen']), ['#/reisen', '#/rezepte']);
    assert.deepEqual(cleanPins('nonsense', ['#/reisen']), []);
    assert.deepEqual(cleanPins(null, ['#/reisen']), []);
  });
});
