// Checks the app text in all three languages: same keys, same {placeholders},
// no hyphen or dash characters, and "Mail" instead of "E-Mail".
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STRINGS } from '../public/js/strings.js';
import { COLOR_IDS } from '../public/js/colors.js';

const LANGS = ['de', 'en', 'fr'];
const DASHES = /[-‐-―−﹘﹣－]/;
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('app text', () => {
  it('has German, English and French with exactly the same keys', () => {
    assert.deepEqual(Object.keys(STRINGS).sort(), [...LANGS].sort());
    const keys = Object.keys(STRINGS.de).sort();
    for (const lang of ['en', 'fr']) assert.deepEqual(Object.keys(STRINGS[lang]).sort(), keys, lang);
  });

  it('uses the same placeholders in every language', () => {
    for (const key of Object.keys(STRINGS.de)) {
      for (const lang of ['en', 'fr']) assert.deepEqual(placeholders(STRINGS[lang][key]), placeholders(STRINGS.de[key]), `${lang} ${key}`);
    }
  });

  it('contains no hyphen or dash characters and no empty texts', () => {
    for (const lang of LANGS) {
      for (const [key, text] of Object.entries(STRINGS[lang])) {
        assert.ok(text.trim().length > 0, `${lang} ${key} is empty`);
        assert.ok(!DASHES.test(text), `${lang} ${key}: "${text}"`);
      }
    }
  });

  it('says "Mail", never "E-Mail" or "email"', () => {
    for (const lang of LANGS) {
      for (const [key, text] of Object.entries(STRINGS[lang])) {
        // Catches "email", "e-mail", "E-Mail" as words, not "diese Mail".
        assert.ok(!/\be[‐-―-]?mail/i.test(text), `${lang} ${key}: "${text}"`);
      }
    }
  });

  it('every key used in the page exists', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    const used = new Set();
    for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) used.add(pair.split(':')[1].trim());
    const jsDir = new URL('../public/js/', import.meta.url);
    for (const file of readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
      const src = readFileSync(new URL(file, jsDir), 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1]);
    }
    for (const key of used) assert.ok(key in STRINGS.de, `missing key ${key}`);
  });

  it('the page knows the same 16 person colors as the security rules', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    const block = /function palette\(\) \{\s*return \[([^\]]+)\]/.exec(rules);
    assert.ok(block, 'palette() not found in firestore.rules');
    const inRules = [...block[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    assert.deepEqual(inRules, COLOR_IDS);
    assert.equal(new Set(COLOR_IDS).size, 16);
  });

  it('every key built in code (categories, groups, reactions, weather) exists', () => {
    const built = [
      ...['main', 'starter', 'dessert', 'baking', 'breakfast', 'drink', 'other'].map((c) => `recipes.cat.${c}`),
      ...['emergency', 'family', 'health', 'service', 'other'].map((g) => `contacts.group.${g}`),
      ...['like', 'love', 'laugh', 'wow', 'sad', 'thanks'].map((r) => `chat.react.${r}`),
      ...['morning', 'day', 'evening'].flatMap((k) => [`home.${k}`, `home.${k}Name`]),
      ...COLOR_IDS.map((c) => `color.${c}`),
    ];
    // Plus every quoted key such as 'weather.clear' or 'settings.digestOn' in the page code.
    const prefixes = 'cal|tasks|polls|recipes|contacts|weather|rooms|chat|home|settings|day|nav|common|more|form|family|house|color';
    const jsDir = new URL('../public/js/', import.meta.url);
    for (const file of readdirSync(jsDir).filter((f) => f.endsWith('.js') && !f.startsWith('strings'))) {
      const src = readFileSync(new URL(file, jsDir), 'utf8');
      for (const m of src.matchAll(new RegExp(`'((?:${prefixes})\\.[A-Za-z][\\w.]*)'`, 'g'))) built.push(m[1]);
    }
    for (const lang of LANGS) {
      for (const key of built) assert.ok(key in STRINGS[lang], `${lang} is missing ${key}`);
    }
  });
});
