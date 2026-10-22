// Language handling: German, English, French. The choice is stored on this
// device only ("auto" follows the browser). Changing it reloads the page.
import { STRINGS } from './strings.js';

export const LANGUAGES = ['de', 'en', 'fr'];
const LOCALES = { de: 'de-DE', en: 'en-GB', fr: 'fr-FR' };
const STORAGE_KEY = 'familyhub-lang';

export function languageChoice() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function browserLanguage() {
  for (const tag of navigator.languages || [navigator.language]) {
    const base = String(tag || '').slice(0, 2).toLowerCase();
    if (LANGUAGES.includes(base)) return base;
  }
  return 'de';
}

const choice = languageChoice();
export const lang = choice === 'auto' ? browserLanguage() : choice;
export const locale = LOCALES[lang];
document.documentElement.lang = lang;

/** Text for a key in the current language; {name} is replaced from vars. */
export function t(key, vars = {}) {
  const text = STRINGS[lang]?.[key] ?? STRINGS.de[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/**
 * Fills the static page text.
 *   data-i18n="key"                      → text content
 *   data-i18n-attr="placeholder:key;aria-label:key2"  → attributes
 */
export function translatePage(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of node.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    }
  }
}

export function setLanguageChoice(value) {
  try {
    if (value === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // storage blocked: the choice cannot be kept, nothing else to do
  }
  location.reload();
}
