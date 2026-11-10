// Building blocks for setting up and changing a group: icon choice, password
// with a strength hint, page switches and the look (themes, colors, art,
// fonts, corners, spacing, start page). Used by the group wizard and the
// group page. Each editor changes the object it gets and calls onChange.
import { el } from './ui.js';
import { t } from './i18n.js';
import {
  FEATURES, HOME_CARDS, THEMES, PATTERNS, FONTS, ICONS, SWATCHES, modeColors, patternImage, adjustedColors, homeCards,
} from './design.js';

let counter = 0;
const uid = (prefix) => `${prefix}-${(counter += 1)}`;

/** A row of radio buttons; options are [value, label or node]. */
function choiceRow(name, options, value, onPick, className = '') {
  const group = uid(name);
  return el('div', { class: `choice-row ${className}`, role: 'radiogroup' }, options.map(([v, label]) => {
    const input = el('input', { type: 'radio', name: group, value: v, checked: v === value, onchange: () => onPick(v) });
    return el('label', { class: 'choice' }, [input, el('span', { class: 'choice-face' }, [label])]);
  }));
}

function section(title, children, hint) {
  return el('fieldset', { class: 'form-section' }, [
    el('legend', { text: title }),
    hint ? el('p', { class: 'muted small', text: hint }) : null,
    ...children,
  ]);
}

// ---------- name and icon ----------

export function nameAndIcon(draft, onChange) {
  const name = el('input', {
    type: 'text', maxlength: '40', value: draft.name || '', autocomplete: 'off', required: true,
    oninput: () => { draft.name = name.value; onChange(); },
  });
  const nameId = uid('group-name');
  name.id = nameId;
  return el('div', { class: 'form-stack' }, [
    el('label', { class: 'field-label', for: nameId, text: t('group.name') }),
    name,
    section(t('group.icon'), [choiceRow('icon', ICONS.map((i) => [i, el('span', { class: 'icon-face', text: i })]), draft.icon,
      (v) => { draft.icon = v; onChange(); }, 'icon-row')]),
  ]);
}

// ---------- password ----------

/** 0 to 4: length, upper and lower case, digits, other characters. */
export function passwordStrength(pw) {
  if (!pw || pw.length < 8) return 0;
  let score = pw.length >= 12 ? 2 : 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(4, score);
}

export function passwordFields(draft, onChange) {
  const first = el('input', { type: 'password', autocomplete: 'new-password', maxlength: '100', id: uid('pw') });
  const second = el('input', { type: 'password', autocomplete: 'new-password', maxlength: '100', id: uid('pw2') });
  const meter = el('meter', { min: '0', max: '4', low: '2', high: '3', optimum: '4', value: '0' });
  const hint = el('p', { class: 'muted small', 'aria-live': 'polite' });
  const update = () => {
    const level = passwordStrength(first.value);
    meter.value = level;
    hint.textContent = first.value ? t(`group.pw.level${level}`) : t('group.pw.rule');
    draft.password = first.value;
    draft.passwordAgain = second.value;
    onChange();
  };
  first.oninput = update;
  second.oninput = update;
  update();
  return el('div', { class: 'form-stack' }, [
    el('label', { class: 'field-label', for: first.id, text: t('group.password') }), first, meter, hint,
    el('label', { class: 'field-label', for: second.id, text: t('group.passwordAgain') }), second,
    el('p', { class: 'muted small', text: t('group.passwordShare') }),
  ]);
}

export function passwordProblem(draft) {
  if (!draft.password || draft.password.length < 8) return t('group.pw.rule');
  if (draft.password !== draft.passwordAgain) return t('group.pw.mismatch');
  return '';
}

// ---------- pages ----------

export function featureSwitches(features, onChange, { marketsUnlocked = false } = {}) {
  return el('div', { class: 'switch-list' }, FEATURES.map((f) => {
    const locked = f === 'markets' && !marketsUnlocked;
    const input = el('input', {
      type: 'checkbox', role: 'switch', checked: !locked && features[f] !== false, disabled: locked,
      onchange: () => { features[f] = input.checked; onChange(); },
    });
    return el('label', { class: 'switch-row' }, [
      input,
      el('span', {}, [t(`feature.${f}`), el('span', { class: 'muted small switch-sub', text: locked ? t('feature.locked') : t(`feature.${f}.sub`) })]),
    ]);
  }));
}

// ---------- look ----------

function themeFace(theme) {
  const c = modeColors({ theme }, 'l');
  const face = el('span', { class: 'theme-face' }, [
    el('span', { class: 'theme-dot' }), el('span', { class: 'theme-dot' }), el('span', { class: 'theme-name', text: t(`design.theme.${theme}`) }),
  ]);
  face.style.setProperty('--tb', c.bg);
  face.children[0].style.setProperty('--td', c.primary);
  face.children[1].style.setProperty('--td', c.accent);
  return face;
}

function colorPicker(design, key, onChange) {
  const id = uid(`color-${key}`);
  const picker = el('input', {
    type: 'color', id, value: design[key] || modeColors(design, 'l')[key === 'main' ? 'primary' : key === 'accent' ? 'accent' : 'bg'],
    oninput: () => { design[key] = picker.value.toLowerCase(); onChange(); },
  });
  const swatches = SWATCHES.map((c) => {
    const b = el('button', { type: 'button', class: 'look-swatch', title: c, 'aria-label': c, onclick: () => { design[key] = c; picker.value = c; onChange(); } });
    b.style.setProperty('--sw', c);
    return b;
  });
  const reset = el('button', { type: 'button', class: 'btn-link', text: t('design.themeColor'), onclick: () => { design[key] = ''; onChange(true); } });
  return el('div', { class: 'color-line' }, [
    el('label', { class: 'field-label', for: id, text: t(`design.color.${key}`) }),
    el('div', { class: 'swatch-row' }, [...(key === 'background' ? [] : swatches), picker, reset]),
  ]);
}

function patternFace(pattern, design) {
  const face = el('span', { class: 'pattern-face' }, [el('span', { class: 'pattern-name', text: t(`design.pattern.${pattern}`) })]);
  const c = modeColors(design, 'l');
  face.style.setProperty('--pb', c.bg);
  face.style.setProperty('--pi', patternImage(pattern, c.accent, 70));
  return face;
}

function cardList(design, onChange) {
  const box = el('ol', { class: 'card-order' });
  const save = (list) => { design.cards = list; onChange(true); };
  const render = () => {
    const list = homeCards(design);
    const hidden = HOME_CARDS.filter((c) => !list.includes(c));
    box.replaceChildren(
      ...list.map((c, i) => el('li', { class: 'card-order-row' }, [
        el('span', { text: t(`design.card.${c}`) }),
        el('span', { class: 'person-actions' }, [
          el('button', { type: 'button', class: 'btn-link', text: '↑', 'aria-label': t('design.moveUp'), disabled: i === 0,
            onclick: () => { const l = [...list]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; save(l); } }),
          el('button', { type: 'button', class: 'btn-link', text: '↓', 'aria-label': t('design.moveDown'), disabled: i === list.length - 1,
            onclick: () => { const l = [...list]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; save(l); } }),
          el('button', { type: 'button', class: 'btn-link', text: t('design.hide'), onclick: () => save(list.filter((x) => x !== c)) }),
        ]),
      ])),
      ...hidden.map((c) => el('li', { class: 'card-order-row muted' }, [
        el('span', { text: t(`design.card.${c}`) }),
        el('button', { type: 'button', class: 'btn-link', text: t('design.show'), onclick: () => save([...list, c]) }),
      ])),
    );
  };
  render();
  return { node: box, render };
}

/**
 * The whole look editor. onChange(design) runs after every change (the page
 * can show it at once).
 */
export function designEditor(design, onChange) {
  const root = el('div', { class: 'form-stack design-editor' });
  const warn = el('p', { class: 'form-hint', role: 'status' });
  const cards = cardList(design, () => changed(true));

  function changed(rebuild = false) {
    const fixed = adjustedColors(design);
    warn.textContent = fixed.length ? t('design.contrastFixed', { which: fixed.map((k) => t(`design.color.${k}`)).join(', ') }) : '';
    onChange(design);
    if (rebuild) build();
  }

  function build() {
    const strength = el('input', {
      type: 'range', min: '0', max: '100', step: '10', value: String(design.patternStrength ?? 30), id: uid('strength'),
      oninput: () => { design.patternStrength = Number(strength.value); changed(); },
    });
    const welcome = el('input', {
      type: 'text', maxlength: '120', value: design.welcome || '', id: uid('welcome'),
      oninput: () => { design.welcome = welcome.value; changed(); },
    });
    cards.render();
    root.replaceChildren(
      section(t('design.theme'), [choiceRow('theme', THEMES.map((x) => [x, themeFace(x)]), design.theme || 'calm',
        (v) => { design.theme = v; design.main = ''; design.accent = ''; design.background = ''; changed(true); }, 'theme-row')], t('design.themeHint')),
      section(t('design.colors'), [colorPicker(design, 'main', changed), colorPicker(design, 'accent', changed), colorPicker(design, 'background', changed), warn]),
      section(t('design.pattern'), [
        choiceRow('pattern', PATTERNS.map((p) => [p, patternFace(p, design)]), design.pattern || 'none', (v) => { design.pattern = v; changed(); }, 'pattern-row'),
        el('label', { class: 'field-label', for: strength.id, text: t('design.strength') }), strength,
      ]),
      section(t('design.font'), [choiceRow('font', FONTS.map((f) => [f, el('span', { class: `font-face font-${f}`, text: t(`design.font.${f}`) })]),
        design.font || 'clean', (v) => { design.font = v; changed(); })]),
      section(t('design.shape'), [
        choiceRow('corners', [['round', t('design.corners.round')], ['square', t('design.corners.square')]], design.corners || 'round',
          (v) => { design.corners = v; changed(); }),
        choiceRow('spacing', [['normal', t('design.spacing.normal')], ['compact', t('design.spacing.compact')]], design.spacing || 'normal',
          (v) => { design.spacing = v; changed(); }),
      ]),
      section(t('design.start'), [
        el('label', { class: 'field-label', for: welcome.id, text: t('design.welcome') }), welcome,
        cards.node,
      ], t('design.startHint')),
    );
  }

  build();
  changed();
  return root;
}

/** Only the fields the rules accept, with empty values left out. */
export function cleanDesign(design) {
  const out = {};
  for (const key of ['theme', 'main', 'accent', 'background', 'pattern', 'font', 'corners', 'spacing']) {
    if (design[key]) out[key] = design[key];
  }
  if (Number.isInteger(design.patternStrength)) out.patternStrength = design.patternStrength;
  if (Array.isArray(design.cards)) out.cards = design.cards;
  if (design.welcome && design.welcome.trim()) out.welcome = design.welcome.trim();
  return out;
}
