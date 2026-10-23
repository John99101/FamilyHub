// Dialogs (bottom sheet on phones, centred box on computers): one for
// showing things, one for forms. Everything is built as elements with text,
// never as HTML.
import { el, svgIcon } from './ui.js';
import { t } from './i18n.js';

let counter = 0;
const nextId = (prefix) => `${prefix}-${(counter += 1)}`;
const CLOSE_ICON = ['M18 6 6 18', 'm6 6 12 12'];

/**
 * @param {object} o
 * @param {string} o.title
 * @param {Node|Node[]} o.content
 * @param {Array<{label, kind?, onClick}>} [o.buttons]  onClick(close) may be async
 */
export function openDialog({ title, content, buttons = [], onClose }) {
  const titleId = nextId('dlg-title');
  const dialog = el('dialog', { class: 'sheet', 'aria-labelledby': titleId });
  const close = () => { if (dialog.open) dialog.close(); };

  const head = el('div', { class: 'sheet-head' }, [
    el('h2', { id: titleId, text: title }),
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.close'), onclick: close }, [svgIcon(CLOSE_ICON)]),
  ]);
  const body = el('div', { class: 'sheet-body' }, [].concat(content));
  const foot = el('div', { class: 'sheet-foot' }, buttons.map((b) => {
    const btn = el('button', { class: `btn ${b.kind === 'primary' ? 'btn-primary' : ''} ${b.kind === 'danger' ? 'btn-danger' : ''}`, type: 'button', text: b.label });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await b.onClick(close); } finally { btn.disabled = false; }
    });
    return btn;
  }));

  dialog.append(head, body);
  if (buttons.length) dialog.append(foot);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (onClose) onClose(); });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

// ---------- forms ----------

function fieldRow(f, control, labelFor) {
  const children = [];
  if (f.label && f.type !== 'checkbox') children.push(el('label', { class: 'field-label', for: labelFor, text: f.label }));
  children.push(control);
  if (f.hint) children.push(el('p', { class: 'field-hint', text: f.hint }));
  return el('div', { class: `field field-${f.type}` }, children);
}

function buildField(f) {
  const id = nextId(`f-${f.name}`);
  const common = { id, name: f.name };
  switch (f.type) {
    case 'textarea': {
      const input = el('textarea', { ...common, rows: f.rows || 4, maxlength: f.maxlength, placeholder: f.placeholder });
      input.value = f.value ?? '';
      return { row: fieldRow(f, input, id), get: () => input.value, focus: input };
    }
    case 'date':
    case 'time': {
      const input = el('input', { ...common, type: f.type });
      input.value = f.value ?? '';
      return { row: fieldRow(f, input, id), get: () => input.value, focus: input };
    }
    case 'select': {
      const select = el('select', common, f.options.map((o) => el('option', { value: o.value, text: o.label })));
      select.value = f.value ?? f.options[0]?.value ?? '';
      return { row: fieldRow(f, select, id), get: () => select.value, focus: select };
    }
    case 'checkbox': {
      const input = el('input', { ...common, type: 'checkbox' });
      input.checked = !!f.value;
      const label = el('label', { class: 'check-row', for: id }, [input, el('span', { text: f.label })]);
      return { row: fieldRow(f, label, id), get: () => input.checked, focus: input };
    }
    case 'segmented': {
      const group = el('fieldset', { class: 'segmented', role: 'radiogroup' }, [el('legend', { class: 'sr-only', text: f.label || '' })]);
      group.style.gridTemplateColumns = `repeat(${f.options.length}, 1fr)`;
      const radios = f.options.map((o) => {
        const input = el('input', { type: 'radio', name: id, value: o.value });
        input.checked = o.value === f.value;
        group.append(el('label', {}, [input, el('span', { text: o.label })]));
        return input;
      });
      const row = el('div', { class: 'field field-segmented' }, [group]);
      return { row, get: () => radios.find((r) => r.checked)?.value ?? f.value, focus: null };
    }
    case 'people': {
      const box = el('div', { class: 'check-list', id });
      const inputs = f.options.map((o) => {
        const input = el('input', { type: 'checkbox', value: o.value });
        input.checked = (f.value || []).includes(o.value);
        if (o.locked) { input.checked = true; input.disabled = true; }
        box.append(el('label', { class: 'check-row' }, [input, el('span', { text: o.label })]));
        return input;
      });
      const label = el('p', { class: 'field-label', text: f.label });
      const row = el('div', { class: 'field field-people' }, [label, box]);
      return { row, get: () => inputs.filter((i) => i.checked).map((i) => i.value), focus: null };
    }
    case 'options': {
      const list = el('div', { class: 'option-list' });
      const max = f.max || 10;
      const addBtn = el('button', { class: 'btn btn-small', type: 'button', text: f.addLabel || t('common.add') });
      const update = () => {
        const rows = [...list.children];
        addBtn.hidden = rows.length >= max;
        rows.forEach((r, i) => { r.querySelector('button').hidden = rows.length <= (f.min || 2); r.querySelector('input').setAttribute('aria-label', `${f.itemLabel || ''} ${i + 1}`.trim()); });
      };
      const addRow = (value = '') => {
        const input = el('input', { type: 'text', maxlength: f.maxlength || 80, autocomplete: 'off' });
        input.value = value;
        const remove = el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.remove') }, [svgIcon(CLOSE_ICON)]);
        const row = el('div', { class: 'option-row' }, [input, remove]);
        remove.addEventListener('click', () => { row.remove(); update(); });
        list.append(row);
        update();
        return input;
      };
      for (const v of (f.value && f.value.length ? f.value : ['', ''])) addRow(v);
      addBtn.addEventListener('click', () => addRow().focus());
      const label = el('p', { class: 'field-label', text: f.label });
      const row = el('div', { class: 'field field-options' }, [label, list, addBtn]);
      return { row, get: () => [...list.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean), focus: list.querySelector('input') };
    }
    case 'info':
      return { row: el('p', { class: 'field-hint', text: f.text }), get: () => undefined, focus: null };
    default: {
      const input = el('input', { ...common, type: f.inputType || 'text', maxlength: f.maxlength, placeholder: f.placeholder, inputmode: f.inputmode, autocomplete: f.autocomplete || 'off' });
      input.value = f.value ?? '';
      return { row: fieldRow(f, input, id), get: () => input.value, focus: input };
    }
  }
}

/**
 * A form in a dialog.
 * @param {object} o
 * @param {Array<object>} o.fields  { name, type, label, value, required, maxlength, options, showIf(values), hint }
 * @param {(values) => Promise<string|void>} o.onSubmit  returns an error text to keep the dialog open
 * @param {{ label, onClick }} [o.danger]  e.g. delete; onClick returns true to close
 */
export function openForm({ title, fields, submitLabel, onSubmit, danger, intro }) {
  const form = el('form', { class: 'form', novalidate: true });
  const controls = {};
  if (intro) form.append(el('p', { class: 'field-hint', text: intro }));
  for (const f of fields.filter(Boolean)) {
    const c = buildField(f);
    controls[f.name || nextId('info')] = { ...c, field: f };
    form.append(c.row);
  }
  const error = el('p', { class: 'form-error', role: 'alert' });
  form.append(error);

  const values = () => {
    const out = {};
    for (const [name, c] of Object.entries(controls)) if (c.field.name) out[name] = c.get();
    return out;
  };
  const refresh = () => {
    const v = values();
    for (const c of Object.values(controls)) if (c.field.showIf) c.row.hidden = !c.field.showIf(v);
  };
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  refresh();

  let busy = false;
  async function submit(close) {
    if (busy) return;
    error.textContent = '';
    const v = values();
    for (const c of Object.values(controls)) {
      const f = c.field;
      if (!f.required || c.row.hidden) continue;
      const value = v[f.name];
      const missing = Array.isArray(value) ? value.length < (f.min || 1) : !String(value ?? '').trim();
      if (missing) {
        error.textContent = f.requiredText || t('form.required', { field: f.label || '' });
        c.focus?.focus();
        return;
      }
    }
    busy = true;
    try {
      const problem = await onSubmit(v);
      if (problem) error.textContent = problem;
      else close();
    } finally {
      busy = false;
    }
  }

  const buttons = [];
  if (danger) {
    buttons.push({ label: danger.label, kind: 'danger', onClick: async (close) => { if (await danger.onClick()) close(); } });
  }
  buttons.push({ label: submitLabel || t('common.save'), kind: 'primary', onClick: submit });

  const handle = openDialog({ title, content: form, buttons });
  form.addEventListener('submit', (event) => { event.preventDefault(); submit(handle.close); });
  // Enter in a single line field submits; the hidden button makes that work in every browser.
  form.append(el('button', { type: 'submit', hidden: true, tabindex: -1, 'aria-hidden': 'true' }));
  const first = Object.values(controls).find((c) => c.focus && !c.row.hidden);
  if (first && !matchMedia('(pointer: coarse)').matches) first.focus.focus();
  return { ...handle, values };
}
