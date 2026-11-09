// Checks the group look: readable colors, patterns, start cards, pages, and
// that the page offers exactly the choices the security rules accept.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  contrast, readable, modeColors, adjustedColors, patternImage, designVariables, featureOn, homeCards,
  FEATURES, HOME_CARDS, THEMES, PATTERNS, FONTS, ICONS,
} from '../public/js/design.js';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const listIn = (pattern) => {
  const m = pattern.exec(rules);
  assert.ok(m, `not found in firestore.rules: ${pattern}`);
  return [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
};

describe('group look', () => {
  it('offers the same themes, patterns, fonts, cards and pages as the security rules', () => {
    assert.deepEqual(listIn(/d\.get\('theme', 'calm'\) in \[([^\]]+)\]/), THEMES);
    assert.deepEqual(listIn(/d\.get\('pattern', 'none'\) in \[([^\]]+)\]/), PATTERNS);
    assert.deepEqual(listIn(/d\.get\('font', 'clean'\) in \[([^\]]+)\]/), FONTS);
    assert.deepEqual(listIn(/d\.get\('cards', \[\]\)\.hasOnly\(\[([^\]]+)\]/), HOME_CARDS);
    assert.deepEqual(listIn(/f\.keys\(\)\.hasOnly\(\[([^\]]+)\]/), FEATURES);
  });

  it('every icon fits the 8 characters the rules allow', () => {
    for (const icon of ICONS) assert.ok(icon.length <= 8, icon);
  });

  it('contrast is measured like WCAG', () => {
    assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
    assert.equal(contrast('#777777', '#777777'), 1);
  });

  it('a color too light for white cards is darkened until it is readable', () => {
    const fixed = readable('#ffee88', '#ffffff', 4.5, '#000000');
    assert.ok(contrast(fixed, '#ffffff') >= 4.5);
    assert.equal(readable('#0f766e', '#ffffff', 4.5, '#000000'), '#0f766e');
  });

  it('every theme is readable in light and dark', () => {
    for (const theme of THEMES) {
      for (const [mode, surface, text] of [['l', '#ffffff', '#16191d'], ['d', '#171b20', '#e7eaee']]) {
        const c = modeColors({ theme }, mode);
        assert.ok(contrast(c.primary, surface) >= 4.5, `${theme} ${mode} main`);
        assert.ok(contrast(c.onPrimary, c.primary) >= 4.5, `${theme} ${mode} text on main`);
        assert.ok(contrast(text, c.bg) >= 7, `${theme} ${mode} background`);
      }
    }
  });

  it('own colors that are hard to read are adjusted, and the editor is told which', () => {
    assert.deepEqual(adjustedColors({ main: '#ffff00', background: '#222222', accent: '#1d4ed8' }), ['main', 'background']);
    assert.deepEqual(adjustedColors({ main: '#1d4ed8' }), []);
    const dark = modeColors({ main: '#1d4ed8', background: '#fdf2f8' }, 'd');
    assert.ok(contrast('#e7eaee', dark.bg) >= 7, 'own background turns dark in the dark look');
  });

  it('patterns are small pictures in the accent color, "none" draws nothing', () => {
    assert.equal(patternImage('none', '#123456'), 'none');
    assert.equal(patternImage('unknown', '#123456'), 'none');
    for (const p of PATTERNS.filter((x) => x !== 'none')) {
      const image = patternImage(p, '#123456', 50);
      assert.match(image, /^url\("data:image\/svg\+xml,/, p);
      assert.ok(decodeURIComponent(image).includes('#123456'), p);
    }
  });

  it('sets variables for both looks; fonts and corners only when chosen', () => {
    const plain = designVariables({});
    assert.ok(plain['--g-primary-l'] && plain['--g-primary-d']);
    assert.equal(plain['--g-font'], undefined);
    const own = designVariables({ font: 'hand', corners: 'square' });
    assert.ok(own['--g-font-heading']);
    assert.equal(own['--g-radius'], '5px');
  });

  it('pages are on unless switched off; markets need the unlock', () => {
    assert.equal(featureOn({ features: {} }, 'chat'), true);
    assert.equal(featureOn({ features: { chat: false } }, 'chat'), false);
    assert.equal(featureOn({ features: { markets: true } }, 'markets'), false);
    assert.equal(featureOn({ features: { markets: true }, marketsUnlocked: true }, 'markets'), true);
  });

  it('start page cards: the chosen ones in order, all of them by default', () => {
    assert.deepEqual(homeCards({}), HOME_CARDS);
    assert.deepEqual(homeCards({ cards: ['chat', 'notices', 'nope'] }), ['chat', 'notices']);
  });
});
