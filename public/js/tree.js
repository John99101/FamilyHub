// Family tree: everyone may add and change people, parents and partners.
// Tap a person for details, their birthday from the calendar, and quick
// buttons to add a child, partner or parent. People who use the app (linked
// by mail) show in their color. Scroll to move around, + and − to zoom.
import { db, collection, doc, onSnapshot, writeBatch, serverTimestamp } from './firebase.js';
import { $, el, svgIcon, toast, card, emptyNote, addButton, formatDayMonth, relativeDays } from './ui.js';
import { t, locale } from './i18n.js';
import { todayIso, addDays, daysBetween, upcoming } from './dates.js';
import { canEdit, createdFields } from './family-data.js';
import { paint, NEUTRAL } from './colors.js';
import { layoutTree, NODE_W, NODE_H } from './tree-layout.js';
import { openForm, openDialog } from './dialog.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 24;
const ZOOMS = [0.5, 0.65, 0.8, 1, 1.2, 1.4];

const yearText = (p) => {
  if (p.birthYear && p.deathYear) return t('tree.years', { from: p.birthYear, to: p.deathYear });
  if (p.birthYear) return String(p.birthYear);
  if (p.deathYear) return t('tree.died', { year: p.deathYear });
  return '';
};

export function createTree(data) {
  const root = $('tree-content');
  const session = data.session;
  let people = [];
  let loaded = false;
  let unsubscribe = null;
  // Start a bit smaller on phones, so more of the family fits on the screen.
  let zoom = window.innerWidth < 600 ? 1 : 3;

  function start() {
    if (unsubscribe) return;
    unsubscribe = onSnapshot(collection(db, 'tree'), (snap) => {
      people = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded = true;
      render();
    }, (err) => console.warn('Reading the family tree failed', err.code));
  }

  const byId = (id) => people.find((p) => p.id === id) || null;
  const nameOf = (id) => byId(id)?.name || '?';
  const childrenOf = (id) => people.filter((p) => (p.parents || []).includes(id));
  const partnersOf = (p) => [...new Set([...(p.partners || []), ...people.filter((x) => (x.partners || []).includes(p.id)).map((x) => x.id)])].filter((id) => id !== p.id && byId(id));
  const colorOf = (p) => (p.mail ? data.colorForMail(p.mail) : NEUTRAL);

  /** The birthday from the calendar: the linked entry, or one with the same name. */
  function birthdayOf(p) {
    const birthdays = data.state.yearly.filter((e) => e.kind === 'birthday');
    const linked = p.birthdayId ? birthdays.find((e) => e.id === p.birthdayId) : null;
    const event = linked || birthdays.find((e) => String(e.title).trim().toLowerCase() === String(p.name).trim().toLowerCase());
    if (!event) return null;
    const today = todayIso();
    const [next] = upcoming([event], today, addDays(today, 366));
    return next ? { event, day: next.day, years: next.years } : null;
  }

  // ---------- drawing ----------

  function svgLine(points) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', points.map(([x, y], i) => `${i ? 'L' : 'M'}${x + PAD} ${y + PAD}`).join(' '));
    return path;
  }

  function canvas() {
    const layout = layoutTree(people);
    const w = layout.width + PAD * 2;
    const h = layout.height + PAD * 2;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'tree-lines');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('aria-hidden', 'true');
    for (const c of layout.couples) svg.append(svgLine([[c.x1, c.y], [c.x2, c.y]]));
    for (const f of layout.families) {
      svg.append(svgLine([[f.fromX, f.fromY], [f.fromX, f.busY]]));
      const xs = [f.fromX, ...f.children.map((k) => k.x)];
      svg.append(svgLine([[Math.min(...xs), f.busY], [Math.max(...xs), f.busY]]));
      for (const k of f.children) svg.append(svgLine([[k.x, f.busY], [k.x, k.y]]));
    }
    const nodes = layout.nodes.map((n) => {
      const p = byId(n.id);
      const node = paint(el('button', { class: `tree-node ${p.mail ? 'linked' : ''}`.trim(), type: 'button', onclick: () => openPerson(p) }, [
        el('span', { class: 'tree-name', text: p.mail ? data.nameForMail(p.mail) || p.name : p.name }),
        yearText(p) ? el('span', { class: 'tree-years', text: yearText(p) }) : null,
      ]), colorOf(p));
      node.style.left = `${n.x + PAD}px`;
      node.style.top = `${n.y + PAD}px`;
      node.style.width = `${NODE_W}px`;
      node.style.height = `${NODE_H}px`;
      return node;
    });
    const inner = el('div', { class: 'tree-canvas' }, [svg, ...nodes]);
    inner.style.width = `${w}px`;
    inner.style.height = `${h}px`;
    inner.style.transform = `scale(${ZOOMS[zoom]})`;
    const sizer = el('div', { class: 'tree-sizer' }, [inner]);
    sizer.style.width = `${w * ZOOMS[zoom]}px`;
    sizer.style.height = `${h * ZOOMS[zoom]}px`;
    return el('div', { class: 'tree-scroll' }, [sizer]);
  }

  function render() {
    const tools = el('div', { class: 'tree-tools' }, [
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('tree.zoomOut'), title: t('tree.zoomOut'), disabled: zoom === 0, onclick: () => { zoom = Math.max(0, zoom - 1); render(); } }, [svgIcon(['M5 12h14'])]),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('tree.zoomIn'), title: t('tree.zoomIn'), disabled: zoom === ZOOMS.length - 1, onclick: () => { zoom = Math.min(ZOOMS.length - 1, zoom + 1); render(); } }, [svgIcon(['M12 5v14', 'M5 12h14'])]),
    ]);
    const body = people.length
      ? [el('p', { class: 'muted small', text: t('tree.hint') }), tools, canvas()]
      : [emptyNote(loaded ? t('tree.empty') : t('common.loading'))];
    root.replaceChildren(card(t('nav.tree'), body, { action: addButton(t('tree.add'), () => openEditor(null)), className: 'tree-card' }));
  }

  // ---------- details ----------

  function openPerson(p) {
    const lines = [];
    if (yearText(p)) lines.push(el('p', { class: 'detail-strong', text: yearText(p) }));
    const bd = birthdayOf(p);
    if (bd) {
      const diff = daysBetween(todayIso(), bd.day);
      lines.push(el('p', { text: [t('tree.birthday', { date: formatDayMonth(bd.day) }), bd.years ? t('cal.turns', { n: bd.years }) : '', relativeDays(diff)].filter(Boolean).join(' · ') }));
    }
    if (p.mail) lines.push(paint(el('p', { class: 'who' }, [el('span', { class: 'person-dot' }), t('tree.usesApp', { name: data.nameForMail(p.mail) })]), colorOf(p)));
    const rel = (key, ids) => (ids.length ? lines.push(el('p', { text: `${t(key)}: ${ids.map(nameOf).join(', ')}` })) : null);
    rel('tree.parents', (p.parents || []).filter((id) => byId(id)));
    rel('tree.partners', partnersOf(p));
    rel('tree.children', childrenOf(p.id).map((c) => c.id));
    if (p.note) lines.push(el('p', { class: 'pre', text: p.note }));
    lines.push(el('div', { class: 'tree-quick' }, [
      el('button', { class: 'btn btn-small', type: 'button', text: t('tree.addChild'), onclick: () => { handle.close(); openEditor(null, { parents: [p.id, ...partnersOf(p).slice(0, 1)] }); } }),
      el('button', { class: 'btn btn-small', type: 'button', text: t('tree.addPartner'), onclick: () => { handle.close(); openEditor(null, { partners: [p.id] }); } }),
      (p.parents || []).length < 2
        ? el('button', { class: 'btn btn-small', type: 'button', text: t('tree.addParent'), onclick: () => { handle.close(); openEditor(null, {}, p); } })
        : null,
    ]));
    const handle = openDialog({
      title: p.name,
      content: lines,
      buttons: [{ label: t('common.edit'), kind: 'primary', onClick: (close) => { close(); openEditor(p); } }],
    });
  }

  // ---------- editing ----------

  /**
   * @param existing  person to change, or null for a new one
   * @param preset    { parents, partners } for a new person
   * @param childOf   for "add parent": the person who gets the new person as a parent
   */
  function openEditor(existing, preset = {}, childOf = null) {
    const p = existing || { parents: preset.parents || [], partners: preset.partners || [] };
    const others = people.filter((x) => !existing || x.id !== existing.id)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), locale))
      .map((x) => ({ value: x.id, label: yearText(x) ? `${x.name} (${yearText(x)})` : x.name }));
    const mails = [{ value: '', label: t('tree.noApp') }, ...data.family().map((f) => ({ value: f.mail, label: f.name }))];
    const birthdays = [{ value: '', label: t('tree.noBirthday') }, ...data.state.yearly.filter((e) => e.kind === 'birthday')
      .map((e) => ({ value: e.id, label: `${e.title} (${formatDayMonth(e.date)})` }))];
    openForm({
      title: existing ? t('tree.editTitle') : childOf ? t('tree.parentOf', { name: childOf.name }) : t('tree.newTitle'),
      fields: [
        { name: 'name', type: 'text', label: t('tree.name'), value: p.name || '', maxlength: 60, required: true },
        { name: 'birthYear', type: 'text', inputmode: 'numeric', label: t('tree.birthYear'), value: p.birthYear ? String(p.birthYear) : '', maxlength: 4 },
        { name: 'deathYear', type: 'text', inputmode: 'numeric', label: t('tree.deathYear'), value: p.deathYear ? String(p.deathYear) : '', maxlength: 4 },
        { name: 'mail', type: 'select', label: t('tree.mail'), value: p.mail || '', options: mails, hint: t('tree.mailHint') },
        others.length ? { name: 'parents', type: 'people', label: t('tree.parentsLabel'), value: p.parents || [], options: others } : null,
        others.length ? { name: 'partners', type: 'people', label: t('tree.partnersLabel'), value: p.partners || [], options: others } : null,
        { name: 'birthdayId', type: 'select', label: t('tree.birthdayLink'), value: p.birthdayId || '', options: birthdays },
        { name: 'note', type: 'textarea', label: t('cal.note'), value: p.note || '', maxlength: 500, rows: 2 },
      ],
      danger: existing && canEdit(session, existing) ? { label: t('common.delete'), onClick: () => remove(existing) } : null,
      onSubmit: (v) => save(existing, v, childOf),
    });
  }

  const year = (s) => {
    const txt = String(s || '').trim();
    if (!txt) return null;
    const n = Number(txt);
    return Number.isInteger(n) && n >= 1700 && n <= 2100 ? n : NaN;
  };

  async function save(existing, v, childOf) {
    const birthYear = year(v.birthYear);
    const deathYear = year(v.deathYear);
    if (Number.isNaN(birthYear) || Number.isNaN(deathYear)) return t('tree.yearWrong');
    if (birthYear && deathYear && deathYear < birthYear) return t('tree.yearOrder');
    const parents = [...new Set(v.parents || [])];
    if (parents.length > 2) return t('tree.twoParents');
    const fields = {
      name: v.name.trim(), birthYear, deathYear, mail: v.mail || '', parents,
      partners: [...new Set(v.partners || [])].slice(0, 6), birthdayId: v.birthdayId || '', note: v.note.trim(),
      updatedAt: serverTimestamp(), updatedBy: session.user.uid,
    };
    const batch = writeBatch(db);
    try {
      if (existing) {
        batch.update(doc(db, 'tree', existing.id), fields);
      } else {
        const ref = doc(collection(db, 'tree'));
        batch.set(ref, { ...fields, ...createdFields(session) });
        // "Add parent": the new person becomes a parent of the chosen one.
        if (childOf) {
          batch.update(doc(db, 'tree', childOf.id), {
            parents: [...new Set([...(childOf.parents || []), ref.id])].slice(0, 2),
            updatedAt: serverTimestamp(), updatedBy: session.user.uid,
          });
        }
      }
      await batch.commit();
      toast(t('common.saved'));
      return undefined;
    } catch (err) {
      console.warn('Saving the person failed', err.code);
      return t('common.saveFailed');
    }
  }

  async function remove(p) {
    if (!confirm(t('tree.confirmDelete', { name: p.name }))) return false;
    try {
      // Also remove the links others have to this person.
      const batch = writeBatch(db);
      batch.delete(doc(db, 'tree', p.id));
      for (const x of people) {
        if (x.id === p.id) continue;
        const parents = (x.parents || []).filter((id) => id !== p.id);
        const partners = (x.partners || []).filter((id) => id !== p.id);
        if (parents.length !== (x.parents || []).length || partners.length !== (x.partners || []).length) {
          batch.update(doc(db, 'tree', x.id), { parents, partners, updatedAt: serverTimestamp(), updatedBy: session.user.uid });
        }
      }
      await batch.commit();
      toast(t('common.deleted'));
      return true;
    } catch (err) {
      console.warn('Deleting the person failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  let visible = false;
  const stop = data.subscribe(() => { if (visible && loaded) render(); });
  return {
    onShow() { visible = true; start(); render(); },
    onHide() { visible = false; },
    stop() { stop(); if (unsubscribe) unsubscribe(); root.replaceChildren(); },
  };
}
