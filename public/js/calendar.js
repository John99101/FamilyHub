// Family calendar: month view, the entries of the chosen day, and a form for
// appointments (one day, several days, or every year) and birthdays.
import {
  db, collection, doc, query, where, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from './firebase.js';
import {
  $, el, svgIcon, toast, card, emptyNote, addButton, formatWeekdayDay, formatMonth, formatDayMonth, weekdayNames, relativeDays,
} from './ui.js';
import { t } from './i18n.js';
import { todayIso, addDays, daysBetween, monthOf, shiftMonth, monthGrid, entriesByDay, isIso } from './dates.js';
import { canEdit, createdFields, EVENT_LOOKBACK_DAYS } from './family-data.js';
import { openForm, openDialog } from './dialog.js';

const MAX_DAYS = 60;
const CAKE = '🎂';
const REPEAT = '↻';

/** One line describing an entry on a day: time or "all day", age, until when. */
export function entryMeta(item, day) {
  const e = item.event;
  const parts = [];
  if (e.kind === 'birthday') {
    if (item.years) parts.push(t('cal.turns', { n: item.years }));
  } else if (e.repeat === 'yearly') {
    if (item.years) parts.push(t('cal.years', { n: item.years }));
  } else if (e.endDate && e.endDate > e.date) {
    parts.push(day === e.date ? t('cal.until', { date: formatDayMonth(e.endDate) }) : t('cal.since', { date: formatDayMonth(e.date) }));
  }
  if (e.place) parts.push(e.place);
  return parts.join(' · ');
}

export function entryIcon(e) {
  if (e.kind === 'birthday') return CAKE;
  return e.repeat === 'yearly' ? REPEAT : '';
}

export function createCalendar(data) {
  const root = $('calendar-content');
  const session = data.session;
  const liveSince = addDays(todayIso(), -EVENT_LOOKBACK_DAYS);
  const pastCache = new Map(); // month → entries (months before the live range; read once, not live)
  let month = monthOf(todayIso());
  let selected = todayIso();

  async function loadPast(m) {
    pastCache.set(m, null);
    const last = addDays(`${shiftMonth(m, 1)}-01`, -1);
    try {
      const snap = await getDocs(query(collection(db, 'events'),
        where('date', '>=', addDays(`${m}-01`, -EVENT_LOOKBACK_DAYS - 7)), where('date', '<=', last)));
      pastCache.set(m, snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.repeat !== 'yearly'));
    } catch (err) {
      console.warn('Reading older entries failed', err.code);
      pastCache.set(m, []);
    }
    render();
  }

  function entriesFor(grid) {
    let dated = data.state.events;
    if (grid[0] < liveSince) {
      const past = pastCache.get(month);
      if (past === undefined) loadPast(month);
      if (past) {
        const ids = new Set(dated.map((e) => e.id));
        dated = [...dated, ...past.filter((e) => !ids.has(e.id))];
      }
    }
    return entriesByDay([...dated, ...data.state.yearly], grid[0], grid[grid.length - 1]);
  }

  // ---------- drawing ----------

  function monthHeader() {
    const nav = (delta, label, path) => el('button', {
      class: 'icon-btn', type: 'button', 'aria-label': label, title: label,
      onclick: () => { month = shiftMonth(month, delta); render(); },
    }, [svgIcon([path])]);
    const today = el('button', {
      class: 'btn btn-small', type: 'button', text: t('day.today'),
      onclick: () => { selected = todayIso(); month = monthOf(selected); render(); },
    });
    return el('div', { class: 'month-head' }, [
      nav(-1, t('cal.prevMonth'), 'm15 18-6-6 6-6'),
      el('h2', { class: 'month-title', text: formatMonth(month), 'aria-live': 'polite' }),
      nav(1, t('cal.nextMonth'), 'm9 18 6-6-6-6'),
      today,
    ]);
  }

  function grid(days, byDay) {
    const today = todayIso();
    const cells = days.map((day) => {
      const items = byDay.get(day) || [];
      const classes = ['day-cell'];
      if (monthOf(day) !== month) classes.push('other');
      if (day === today) classes.push('today');
      if (day === selected) classes.push('selected');
      const dots = el('span', { class: 'dots', 'aria-hidden': 'true' }, items.slice(0, 3).map((i) => el('span', { class: `dot ${i.event.kind === 'birthday' ? 'dot-birthday' : ''}` })));
      const label = items.length ? `${formatWeekdayDay(day)}: ${t('cal.entries', { n: items.length })}` : formatWeekdayDay(day);
      return el('button', {
        class: classes.join(' '), type: 'button', 'aria-label': label, 'aria-pressed': day === selected ? 'true' : 'false',
        onclick: () => { selected = day; if (monthOf(day) !== month) month = monthOf(day); render(); },
      }, [el('span', { class: 'day-num', text: String(Number(day.slice(8))) }), dots]);
    });
    const names = weekdayNames().map((n) => el('span', { class: 'weekday', text: n }));
    return el('div', { class: 'month-grid' }, [...names, ...cells]);
  }

  function entryNode(item, day) {
    const e = item.event;
    const time = e.time || (e.kind === 'birthday' || e.repeat === 'yearly' ? entryIcon(e) : t('cal.allDay'));
    const meta = entryMeta(item, day);
    return el('li', {}, [
      el('button', { class: 'entry', type: 'button', onclick: () => openEntry(e) }, [
        el('span', { class: `entry-time ${e.time ? '' : 'entry-icon'}`, text: time }),
        el('span', { class: 'entry-main' }, [
          el('span', { class: 'entry-title', text: e.title }),
          meta ? el('span', { class: 'entry-meta', text: meta }) : null,
        ]),
      ]),
    ]);
  }

  function dayCard(byDay) {
    const items = byDay.get(selected) || [];
    const diff = daysBetween(todayIso(), selected);
    const title = `${formatWeekdayDay(selected)}`;
    const sub = Math.abs(diff) <= 30 ? el('p', { class: 'muted small day-rel', text: relativeDays(diff) }) : null;
    const list = items.length
      ? el('ul', { class: 'entry-list' }, items.map((i) => entryNode(i, selected)))
      : emptyNote(t('cal.noEntries'));
    return card(title, [sub, list], { action: addButton(t('cal.add'), () => openEditor(null)) });
  }

  function render() {
    const days = monthGrid(month);
    const byDay = entriesFor(days);
    root.replaceChildren(
      el('section', { class: 'card calendar-card' }, [monthHeader(), grid(days, byDay)]),
      dayCard(byDay),
    );
  }

  // ---------- details and editing ----------

  function openEntry(e) {
    if (canEdit(session, e)) { openEditor(e); return; }
    const lines = [];
    const day = e.repeat === 'yearly' ? formatDayMonth(e.date) : formatWeekdayDay(e.date);
    lines.push(el('p', { class: 'detail-strong', text: e.endDate ? `${day} · ${t('cal.until', { date: formatDayMonth(e.endDate) })}` : day }));
    if (e.time) lines.push(el('p', { text: e.time }));
    if (e.kind === 'birthday' && e.yearKnown) lines.push(el('p', { text: t('cal.born', { year: e.date.slice(0, 4) }) }));
    if (e.repeat === 'yearly' && e.kind !== 'birthday') lines.push(el('p', { text: t('cal.everyYear') }));
    if (e.place) lines.push(el('p', { text: e.place }));
    if (e.note) lines.push(el('p', { class: 'pre', text: e.note }));
    lines.push(el('p', { class: 'muted small', text: t('common.addedBy', { name: e.createdByName || '?' }) }));
    openDialog({ title: `${entryIcon(e)} ${e.title}`.trim(), content: lines });
  }

  function openEditor(existing) {
    const e = existing || {};
    const isBirthday = e.kind === 'birthday';
    const allDay = !e.time;
    openForm({
      title: existing ? t('cal.editTitle') : t('cal.newTitle'),
      fields: [
        { name: 'kind', type: 'segmented', label: t('cal.kind'), value: isBirthday ? 'birthday' : 'event', options: [
          { value: 'event', label: t('cal.kindEvent') }, { value: 'birthday', label: t('cal.kindBirthday') },
        ] },
        { name: 'title', type: 'text', label: t('cal.titleLabel'), value: isBirthday ? '' : e.title, maxlength: 100, required: true, showIf: (v) => v.kind === 'event' },
        { name: 'person', type: 'text', label: t('cal.personLabel'), value: isBirthday ? e.title : '', maxlength: 100, required: true, showIf: (v) => v.kind === 'birthday' },
        { name: 'date', type: 'date', label: t('cal.date'), value: e.date || selected, required: true },
        { name: 'yearUnknown', type: 'checkbox', label: t('cal.yearUnknown'), value: isBirthday && e.yearKnown === false, showIf: (v) => v.kind === 'birthday' },
        { name: 'allDay', type: 'checkbox', label: t('cal.allDay'), value: allDay, showIf: (v) => v.kind === 'event' },
        { name: 'time', type: 'time', label: t('cal.time'), value: e.time || '', showIf: (v) => v.kind === 'event' && !v.allDay },
        { name: 'yearly', type: 'checkbox', label: t('cal.repeatYearly'), value: !isBirthday && e.repeat === 'yearly', showIf: (v) => v.kind === 'event' && !v.multiDay },
        { name: 'multiDay', type: 'checkbox', label: t('cal.multiDay'), value: !!e.endDate, showIf: (v) => v.kind === 'event' && !v.yearly },
        { name: 'endDate', type: 'date', label: t('cal.endDate'), value: e.endDate || '', showIf: (v) => v.kind === 'event' && v.multiDay && !v.yearly },
        { name: 'place', type: 'text', label: t('cal.place'), value: e.place || '', maxlength: 100, showIf: (v) => v.kind === 'event' },
        { name: 'note', type: 'textarea', label: t('cal.note'), value: e.note || '', maxlength: 500, rows: 3 },
      ],
      submitLabel: t('common.save'),
      danger: existing ? { label: t('common.delete'), onClick: () => remove(existing) } : null,
      onSubmit: (v) => save(existing, v),
    });
  }

  async function save(existing, v) {
    const birthday = v.kind === 'birthday';
    if (!isIso(v.date)) return t('cal.dateMissing');
    const multi = !birthday && v.multiDay && !v.yearly;
    if (multi) {
      if (!isIso(v.endDate) || v.endDate <= v.date) return t('cal.endAfterStart');
      if (daysBetween(v.date, v.endDate) > MAX_DAYS) return t('cal.tooLong', { n: MAX_DAYS });
    }
    if (!birthday && !v.allDay && !/^\d{2}:\d{2}$/.test(v.time)) return t('cal.timeMissing');
    const entry = {
      title: (birthday ? v.person : v.title).trim(),
      // An unknown year is stored as 2000 (a leap year, so 29 February works).
      date: birthday && v.yearUnknown ? `2000-${v.date.slice(5)}` : v.date,
      endDate: multi ? v.endDate : '',
      time: !birthday && !v.allDay ? v.time : '',
      place: birthday ? '' : v.place.trim(),
      note: v.note.trim(),
      kind: birthday ? 'birthday' : 'event',
      repeat: birthday || v.yearly ? 'yearly' : 'none',
      yearKnown: !(birthday && v.yearUnknown),
      updatedAt: serverTimestamp(),
    };
    try {
      if (existing) await updateDoc(doc(db, 'events', existing.id), entry);
      else await addDoc(collection(db, 'events'), { ...entry, ...createdFields(session) });
    } catch (err) {
      console.warn('Saving the entry failed', err.code);
      return t('common.saveFailed');
    }
    pastCache.delete(monthOf(entry.date));
    selected = v.date;
    month = monthOf(v.date);
    toast(t('common.saved'));
    render();
    return undefined;
  }

  async function remove(existing) {
    if (!confirm(t('cal.confirmDelete', { title: existing.title }))) return false;
    try {
      await deleteDoc(doc(db, 'events', existing.id));
      pastCache.delete(monthOf(existing.date));
      toast(t('common.deleted'));
      return true;
    } catch (err) {
      console.warn('Deleting the entry failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  const stop = data.subscribe(render);

  return {
    onShow() { render(); },
    /** Opens the calendar on a day (from the Start page). */
    showDay(day) { selected = day; month = monthOf(day); render(); },
    add() { openEditor(null); },
    stop() { stop(); root.replaceChildren(); },
  };
}
