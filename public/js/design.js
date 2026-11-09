// The look and the pages of a group: theme presets, own colors (with an
// automatic contrast check), background patterns, fonts, corners, spacing,
// start page cards. Group admins choose them; every device draws them by
// setting CSS variables (app.css falls back to the usual look).

export const FEATURES = ['chat', 'calendar', 'tasks', 'polls', 'trips', 'vouchers', 'board', 'tree', 'question',
  'recipes', 'contacts', 'weather', 'markets'];
export const HOME_CARDS = ['notices', 'digest', 'days', 'birthdays', 'trips', 'tasks', 'question', 'polls', 'vouchers', 'chat', 'weather'];
export const THEMES = ['calm', 'warm', 'forest', 'ocean', 'playful', 'night',
  'sunset', 'berry', 'mint', 'sand', 'slate', 'lavender', 'sky', 'autumn'];
export const PATTERNS = ['none', 'dots', 'grid', 'waves', 'hearts', 'stars', 'leaves', 'flowers',
  'mountains', 'bubbles', 'confetti', 'stripes', 'houses'];
export const FONTS = ['clean', 'round', 'classic', 'hand'];
export const ICONS = ['🏡', '👪', '🌳', '❤️', '⭐', '🌻', '🏖️', '⚽', '🎵', '🍀', '🐾', '🎉'];
// A handful of colors to pick from; any other comes from the color picker.
export const SWATCHES = ['#0f766e', '#2f6b3a', '#1d4ed8', '#0891b2', '#7c3aed', '#db2777', '#b45309', '#c0262d', '#4338ca', '#334155'];

// Main, accent and background for light and dark; "calm" is the usual look.
const PRESETS = {
  calm: { l: ['#0f766e', '#2563eb', '#f4f6f8'], d: ['#2cc5b4', '#7aa7ff', '#0e1114'] },
  warm: { l: ['#b45309', '#db2777', '#fbf6f0'], d: ['#f59e0b', '#f472b6', '#16110d'] },
  forest: { l: ['#2f6b3a', '#a16207', '#f3f6f1'], d: ['#6fcf7f', '#e0b04a', '#0d130e'] },
  ocean: { l: ['#1d4ed8', '#0891b2', '#f1f6fb'], d: ['#7aa7ff', '#22d3ee', '#0b1220'] },
  playful: { l: ['#7c3aed', '#ea580c', '#faf5ff'], d: ['#c4a5ff', '#fb923c', '#140f1c'] },
  night: { l: ['#4338ca', '#9333ea', '#eef0f7'], d: ['#a5b4fc', '#c084fc', '#0a0b14'] },
  sunset: { l: ['#c2410c', '#be185d', '#fff7ed'], d: ['#fb923c', '#f472b6', '#170f0b'] },
  berry: { l: ['#be185d', '#7c3aed', '#fdf2f8'], d: ['#f472b6', '#c4a5ff', '#170d13'] },
  mint: { l: ['#047857', '#0891b2', '#effcf7'], d: ['#34d399', '#22d3ee', '#0b1412'] },
  sand: { l: ['#92400e', '#0f766e', '#faf6ee'], d: ['#e0b04a', '#2cc5b4', '#15120c'] },
  slate: { l: ['#334155', '#0284c7', '#f1f5f9'], d: ['#cbd5e1', '#38bdf8', '#0c1014'] },
  lavender: { l: ['#6d28d9', '#0d9488', '#f5f3ff'], d: ['#b9a6ff', '#2dd4bf', '#100e1a'] },
  sky: { l: ['#0369a1', '#ea580c', '#f0f9ff'], d: ['#7dd3fc', '#fb923c', '#0a1118'] },
  autumn: { l: ['#9a3412', '#a16207', '#fdf6ec'], d: ['#f0884a', '#e0b04a', '#16100b'] },
};

// Text and card colors stay as in app.css; they decide what "readable" means.
const MODE = {
  l: { text: '#16191d', surface: '#ffffff', toward: '#000000', darkBase: null },
  d: { text: '#e7eaee', surface: '#171b20', toward: '#ffffff', darkBase: '#0e1114' },
};

const FONT_STACKS = {
  clean: null,
  round: 'ui-rounded, "SF Pro Rounded", Nunito, "Varela Round", "Arial Rounded MT Bold", system-ui, sans-serif',
  classic: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
  hand: null,
};
const HAND_HEADINGS = '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive';

// ---------- colors ----------

const HEX = /^#[0-9a-f]{6}$/;

function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function toHex(values) {
  return `#${values.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** a mixed with b; amount 0 = a, 1 = b. */
export function mix(a, b, amount) {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * amount));
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Moves color toward `toward` in small steps until it reaches the contrast min against `against`. */
export function readable(color, against, min, toward) {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(color, toward, step / 20);
    if (contrast(candidate, against) >= min) return candidate;
  }
  return toward;
}

/** White or near black, whichever is easier to read on this color. */
function onColor(color) {
  return contrast('#ffffff', color) >= contrast('#111418', color) ? '#ffffff' : '#111418';
}

/** Colors of one mode (l or d) after presets, own colors and the contrast check. */
export function modeColors(design = {}, mode = 'l') {
  const preset = PRESETS[design.theme] || PRESETS.calm;
  const m = MODE[mode];
  const own = (key) => (HEX.test(design[key] || '') ? design[key] : '');
  // Own colors are chosen for the light look; the dark look gets a matching version.
  const pick = (key, index, darkVersion) => {
    const value = own(key);
    if (!value) return preset[mode][index];
    return mode === 'l' ? value : darkVersion(value);
  };
  const bg = readable(pick('background', 2, (c) => mix(c, m.darkBase, 0.88)), m.text, 7, mode === 'l' ? '#ffffff' : '#000000');
  const primary = readable(pick('main', 0, (c) => mix(c, '#ffffff', 0.35)), m.surface, 4.5, m.toward);
  const accent = readable(pick('accent', 1, (c) => mix(c, '#ffffff', 0.3)), m.surface, 3, m.toward);
  return {
    bg,
    primary,
    primaryStrong: mix(primary, m.toward, 0.2),
    onPrimary: onColor(primary),
    bubble: mix(primary, m.surface, mode === 'l' ? 0.82 : 0.7),
    accent,
  };
}

/** Which own colors had to be changed to stay readable (for a hint in the editor). */
export function adjustedColors(design = {}) {
  const light = modeColors(design, 'l');
  return [['main', light.primary], ['accent', light.accent], ['background', light.bg]]
    .filter(([key, used]) => HEX.test(design[key] || '') && design[key] !== used)
    .map(([key]) => key);
}

// ---------- background patterns (drawn here, no pictures to load) ----------

const PATTERN_SVG = {
  dots: [20, 20, '<circle cx="10" cy="10" r="2.2"/>'],
  grid: [24, 24, '<path d="M0 .5H24M.5 0V24" fill="none" stroke="C" stroke-width="1"/>'],
  waves: [40, 20, '<path d="M0 10q10-10 20 0t20 0" fill="none" stroke="C" stroke-width="1.6"/>'],
  hearts: [44, 44, '<path d="M22 30s-9-5.5-9-11a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 5.5-9 11-9 11z"/>'],
  stars: [44, 44, '<path d="m22 11 3 7h7l-5.5 4.5 2 7.5-6.5-4.5-6.5 4.5 2-7.5L12 18h7z"/>'],
  leaves: [44, 44, '<path d="M12 32c0-12 8-20 20-20 0 12-8 20-20 20z"/><path d="M12 32 26 18" fill="none" stroke="C" stroke-width="1"/>'],
  flowers: [44, 44, '<circle cx="22" cy="15" r="4"/><circle cx="29" cy="21" r="4"/><circle cx="26" cy="29" r="4"/><circle cx="18" cy="29" r="4"/><circle cx="15" cy="21" r="4"/>'],
  mountains: [48, 32, '<path d="M0 30 12 14l8 10 8-14 20 20" fill="none" stroke="C" stroke-width="1.6" stroke-linejoin="round"/>'],
  bubbles: [60, 60, '<g fill="none" stroke="C" stroke-width="1.4"><circle cx="15" cy="16" r="8"/><circle cx="42" cy="40" r="12"/><circle cx="45" cy="12" r="4"/></g>'],
  confetti: [48, 48, '<rect x="6" y="8" width="8" height="3" rx="1" transform="rotate(25 10 9)"/><rect x="30" y="6" width="3" height="8" rx="1" transform="rotate(20 31 10)"/><rect x="18" y="30" width="8" height="3" rx="1" transform="rotate(-30 22 31)"/><circle cx="40" cy="36" r="2"/>'],
  stripes: [16, 16, '<path d="M-4 4 4-4M0 16 16 0M12 20 20 12" fill="none" stroke="C" stroke-width="1.4"/>'],
  houses: [48, 48, '<path d="M14 34V24l10-8 10 8v10h-7v-6h-6v6z"/>'],
};

/** The pattern as a CSS url() in this color; strength 0 to 100. */
export function patternImage(pattern, color, strength = 30) {
  const spec = PATTERN_SVG[pattern];
  if (!spec) return 'none';
  const [w, h, body] = spec;
  const opacity = (0.03 + (Math.min(100, Math.max(0, strength)) / 100) * 0.27).toFixed(3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" fill="${color}" fill-opacity="${opacity}" stroke-opacity="${opacity}">${body.replaceAll('"C"', `"${color}"`)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---------- applying ----------

/** All CSS variables for a design (both modes), as name → value. */
export function designVariables(design = {}) {
  const vars = {};
  for (const mode of ['l', 'd']) {
    const c = modeColors(design, mode);
    vars[`--g-bg-${mode}`] = c.bg;
    vars[`--g-primary-${mode}`] = c.primary;
    vars[`--g-primary-strong-${mode}`] = c.primaryStrong;
    vars[`--g-on-primary-${mode}`] = c.onPrimary;
    vars[`--g-bubble-${mode}`] = c.bubble;
    vars[`--g-accent-${mode}`] = c.accent;
    vars[`--g-pattern-${mode}`] = patternImage(design.pattern, c.accent, design.patternStrength ?? 30);
  }
  const font = FONT_STACKS[design.font];
  if (font) vars['--g-font'] = font;
  if (design.font === 'hand') vars['--g-font-heading'] = HAND_HEADINGS;
  if (design.corners === 'square') vars['--g-radius'] = '5px';
  return vars;
}

const STORE_KEY = 'familyhub-design';
let appliedNames = [];

/** Draws a design on this page; keep: remember it, so the next start shows it at once. */
export function applyDesign(design = {}, { keep = true } = {}) {
  const root = document.documentElement;
  const vars = designVariables(design);
  for (const name of appliedNames) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  appliedNames = Object.keys(vars);
  root.classList.toggle('compact', design.spacing === 'compact');
  if (!keep) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(design)); } catch { /* storage blocked */ }
}

/** The design last shown on this device (or the usual look). */
export function storedDesign() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/** Features a group has switched on; missing switches count as on, markets only when unlocked. */
export function featureOn(group, feature) {
  if (feature === 'markets' && group?.marketsUnlocked !== true) return false;
  return group?.features?.[feature] !== false;
}

/** Start page cards in the chosen order (all of them when nothing was chosen). */
export function homeCards(design = {}) {
  return Array.isArray(design.cards) ? design.cards.filter((c) => HOME_CARDS.includes(c)) : [...HOME_CARDS];
}
