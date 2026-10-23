// Family calendar: month view with the colors of the people, entries over
// several days as a colored line from the first to the last day, the
// entries of the chosen day, and a form for appointments (one day, several
// days, or every year) and birthdays. Entries belong to the whole family or
// to a household.
import {
  db, collection, doc, query, where, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp,
} from './firebase.js';
import {
  $, el, svgIcon, toast, card, emptyNote, addButton, formatWeekdayDay, formatMonth, formatDayMonth, weekdayNames, relativeDays,
} from './ui.js';
import { t } from './i18n.js';
import {
  todayIso, addDays, daysBetween, monthOf, shiftMonth, monthGrid, entriesByDay, isIso, compareEntries, isMultiDay, weekLines,
} from './dates.js';

export { isMultiDay };
import { canEdit, createdFields, baseOf, EVENT_LOOKBACK_DAYS } from './family-data.js';
import { NEUTRAL, paint } from './colors.js';
import { ALL, inGroup, groupChips, groupField, defaultGroup, groupBadge } from './groups.js';
import { openForm, openDialog } from './dialog.js';

const MAX_DAYS = 60;
const MAX_LANES = 3;
const CAKE = '🎂';
const REPEAT = '↻';
const BIRTHDAY_COLOR = 'var(--birthday)';

/** The color of an entry: the person it is for, nobody (grey), or (older entries) its creator. */
export function entryColor(data, e) {
  if (e.kind === 'trip') return 'var(--primary)';
  if ('person' in e) {
    if (e.person) return data.colorForMail(e.person);
    return e.kind === 'birthday' ? BIRTHDAY_COLOR : NEUTRAL;
  }
  return e.kind === 'birthday' ? BIRTHDAY_COLOR : data.colorForUid(e.createdBy);
}

/** One line describing an entry on a day: age, until when, for whom, place. */
export function entryMeta(data, item, day) {
  const e = item.event;
  const parts = [];
  if (e.kind === 'birthday') {
    if (item.years) parts.push(t('cal.turns', { n: item.years }));
  } else if (e.repeat === 'yearly') {
    if (item.years) parts.push(t('cal.years', { n: item.years }));
  } else if (isMultiDay(e)) {
    parts.push(day === e.date ? t('cal.until', { date: formatDayMonth(e.endDate) }) : t('cal.since', { date: formatDayMonth(e.date) }));
  }
  if (e.person) parts.push(data.shortNameForMail(e.person));
  if (e.place) parts.push(e.place);
  return parts.join(' · ');
}

export function entryIcon(e) {
  if (e.kind === 'birthday') return CAKE;
  if (e.kind === 'trip') return '✈️';
  return e.repeat === 'yearly' ? REPEAT : '';
}

/** One entry line (also used on the Start page). */
export function entryButton(data, item, day, onOpen) {
  const e = item.event;
  const time = e.time || entryIcon(e) || t('cal.allDay');
  const meta = entryMeta(data, item, day);
  return paint(el('button', { class: 'entry', type: 'button', onclick: () => onOpen(e) }, [
    el('span', { class: `entry-time ${e.time ? '' : 'entry-icon'}`, text: time }),
    el('span', { class: 'entry-main' }, [
      el('span', { class: 'entry-title' }, [e.title, groupBadge(data, e)]),
      meta ? el('span', { class: 'entry-meta', text: meta }) : null,
    ]),
  ]), entryColor(data, e));
}

export function createCalendar(data) {
  const root = $('calendar-content');
  const session = data.session;
  const liveSince = addDays(todayIso(), -EVENT_LOOKBACK_DAYS);
  const pastCache = new Map(); // month → entries (months before the live range; read once, not live)
  let month = monthOf(todayIso());
  let selected = todayIso();
  let filter = ALL;
  let openTrip = () => {};

  // Trips appear as entries from their first to their last day.
  const tripEntries = () => data.state.trips.map((tr) => ({
    id: tr.id, title: tr.title, date: tr.start, endDate: tr.end > tr.start ? tr.end : '', time: '',
    place: tr.destination || '', note: '', kind: 'trip', repeat: 'none', person: '',
    household: tr.household, path: tr.path, createdBy: tr.createdBy, createdByName: tr.createdByName,
  }));

  async function loadPast(m) {
    pastCache.set(m, null);
    const last = addDays(`${shiftMonth(m, 1)}-01`, -1);
    const groups = ['', ...data.myHouseholds().map((h) => h.id)];
    try {
      const lists = await Promise.all(groups.map(async (household) => {
        const snap = await getDocs(query(collection(db, `${baseOf(household)}events`),
          where('date', '>=', addDays(`${m}-01`, -EVENT_LOOKBACK_DAYS - 7)), where('date', '<=', last)));
        return snap.docs.map((d) => ({ id: d.id, ...d.data(), household, path: `${baseOf(household)}events/${d.id}` }));
      }));
      pastCache.set(m, lists.flat().filter((e) => e.repeat !== 'yearly'));
    } catch (err) {
      console.warn('Reading older entries failed', err.code);
      pastCache.set(m, []);
    }
    render();
  }

  function entriesFor(days) {
    let dated = data.state.events;
    if (days[0] < liveSince) {
      const past = pastCache.get(month);
      if (past === undefined) loadPast(month);
      if (past) {
        const paths = new Set(dated.map((e) => e.path));
        dated = [...dated, ...past.filter((e) => !paths.has(e.path))];
      }
    }
    const events = [...dated, ...data.state.yearly, ...tripEntries()].filter((e) => inGroup(e, filter));
    return { events, byDay: entriesByDay(events, days[0], days[days.length - 1]) };
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

  function dayCell(day, items) {
    const today = todayIso();
    const classes = ['day-cell'];
    if (monthOf(day) !== month) classes.push('other');
    if (day === today) classes.push('today');
    if (day === selected) classes.push('selected');
    // Single days as dots; several days are drawn as lines below.
    const singles = items.filter((i) => !isMultiDay(i.event));
    const dots = el('span', { class: 'dots', 'aria-hidden': 'true' }, singles.slice(0, 3).map((i) => paint(el('span', { class: 'dot' }), entryColor(data, i.event))));
    const label = items.length ? `${formatWeekdayDay(day)}: ${t('cal.entries', { n: items.length })}` : formatWeekdayDay(day);
    return el('button', {
      class: classes.join(' '), type: 'button', 'aria-label': label, 'aria-pressed': day === selected ? 'true' : 'false',
      onclick: () => { selected = day; if (monthOf(day) !== month) month = monthOf(day); render(); },
    }, [el('span', { class: 'day-num', text: String(Number(day.slice(8))) }), dots]);
  }

  function week(weekDays, byDay, events) {
    const lines = weekLines(events, weekDays);
    const shown = lines.filter((s) => s.lane < MAX_LANES);
    const lanes = shown.length ? Math.max(...shown.map((s) => s.lane)) + 1 : 0;
    const row = el('div', { class: 'week' }, weekDays.map((day) => dayCell(day, byDay.get(day) || [])));
    row.style.setProperty('--lanes', String(lanes));
    if (shown.length) {
      const overlay = el('div', { class: 'week-lines', 'aria-hidden': 'true' }, shown.map((s) => {
        const line = el('span', { class: `line ${s.startsHere ? 'starts' : ''} ${s.endsHere ? 'ends' : ''}`.trim(), title: s.event.title });
        line.style.setProperty('--from', String(s.from));
        line.style.setProperty('--span', String(s.to - s.from + 1));
        line.style.setProperty('--lane', String(s.lane));
        return paint(line, entryColor(data, s.event));
      }));
      row.append(overlay);
    }
    return row;
  }

  function grid(days, byDay, events) {
    const names = el('div', { class: 'week-names' }, weekdayNames().map((n) => el('span', { class: 'weekday', text: n })));
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(week(days.slice(i, i + 7), byDay, events));
    return el('div', { class: 'month-grid' }, [names, ...weeks]);
  }

  function dayCard(byDay) {
    const items = (byDay.get(selected) || []).slice().sort(compareEntries);
    const diff = daysBetween(todayIso(), selected);
    const sub = Math.abs(diff) <= 30 ? el('p', { class: 'muted small day-rel', text: relativeDays(diff) }) : null;
    const list = items.length
      ? el('ul', { class: 'entry-list' }, items.map((i) => el('li', {}, [entryButton(data, i, selected, openEntry)])))
      : emptyNote(t('cal.noEntries'));
    return card(formatWeekdayDay(selected), [sub, list], { action: addButton(t('cal.add'), () => openEditor(null)) });
  }

  function render() {
    const days = monthGrid(month);
    const { events, byDay } = entriesFor(days);
    root.replaceChildren(
      el('section', { class: 'card calendar-card' }, [
        groupChips(data, filter, (value) => { filter = value; render(); }),
        monthHeader(),
        grid(days, byDay, events),
      ]),
      dayCard(byDay),
    );
  }

  // ---------- details and editing ----------

  function openEntry(e) {
    if (e.kind === 'trip') { openTrip(e.path); return; }
    if (canEdit(session, e)) { openEditor(e); return; }
    const lines = [];
    const day = e.repeat === 'yearly' ? formatDayMonth(e.date) : formatWeekdayDay(e.date);
    lines.push(el('p', { class: 'detail-strong', text: isMultiDay(e) ? `${day} · ${t('cal.until', { date: formatDayMonth(e.endDate) })}` : day }));
    if (e.time) lines.push(el('p', { text: e.time }));
    if (e.kind === 'birthday' && e.yearKnown) lines.push(el('p', { text: t('cal.born', { year: e.date.slice(0, 4) }) }));
    if (e.repeat === 'yearly' && e.kind !== 'birthday') lines.push(el('p', { text: t('cal.everyYear') }));
    if (e.person) lines.push(el('p', { text: t('cal.forPerson', { name: data.nameForMail(e.person) }) }));
    if (e.household) lines.push(el('p', { text: t('house.inHousehold', { name: data.householdName(e.household) }) }));
    if (e.place) lines.push(el('p', { text: e.place }));
    if (e.note) lines.push(el('p', { class: 'pre', text: e.note }));
    lines.push(el('p', { class: 'muted small', text: t('common.addedBy', { name: data.nameForUid(e.createdBy, e.createdByName) || '?' }) }));
    openDialog({ title: `${entryIcon(e)} ${e.title}`.trim(), content: lines });
  }

  function openEditor(existing) {
    const e = existing || {};
    const isBirthday = e.kind === 'birthday';
    const mayMove = !existing || existing.createdBy === session.user.uid;
    const people = [{ value: '', label: t('cal.forEveryone') }, ...data.family().map((p) => ({ value: p.mail, label: p.me ? `${p.name} (${t('home.you')})` : p.name }))];
    // Only the creator moves an entry to another group (it is written there new).
    const group = mayMove ? groupField(data, existing ? existing.household : defaultGroup(data, filter)) : null;
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
        { name: 'allDay', type: 'checkbox', label: t('cal.allDay'), value: !e.time, showIf: (v) => v.kind === 'event' },
        { name: 'time', type: 'time', label: t('cal.time'), value: e.time || '', showIf: (v) => v.kind === 'event' && !v.allDay },
        { name: 'yearly', type: 'checkbox', label: t('cal.repeatYearly'), value: !isBirthday && e.repeat === 'yearly', showIf: (v) => v.kind === 'event' && !v.multiDay },
        { name: 'multiDay', type: 'checkbox', label: t('cal.multiDay'), value: isMultiDay(e), showIf: (v) => v.kind === 'event' && !v.yearly },
        { name: 'endDate', type: 'date', label: t('cal.endDate'), value: e.endDate || '', showIf: (v) => v.kind === 'event' && v.multiDay && !v.yearly },
        { name: 'forWhom', type: 'select', label: t('cal.forWhom'), value: existing ? (e.person ?? '') : session.mail, options: people, hint: t('cal.forWhomHint') },
        group,
        { name: 'place', type: 'text', label: t('cal.place'), value: e.place || '', maxlength: 100, showIf: (v) => v.kind === 'event' },
        { name: 'note', type: 'textarea', label: t('cal.note'), value: e.note || '', maxlength: 500, rows: 3 },
      ],
      submitLabel: t('common.save'),
      danger: existing ? { label: t('common.delete'), onClick: () => remove(existing) } : null,
      onSubmit: (v) => save(existing, v, mayMove),
    });
  }

  async function save(existing, v, mayMove) {
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
      person: v.forWhom || '',
      updatedAt: serverTimestamp(),
    };
    const household = v.household ?? existing?.household ?? '';
    try {
      if (!existing) {
        await addDoc(collection(db, `${baseOf(household)}events`), { ...entry, ...createdFields(session) });
      } else if (mayMove && household !== (existing.household || '')) {
        // Moving to another group: written there new, removed here.
        const batch = writeBatch(db);
        batch.set(doc(collection(db, `${baseOf(household)}events`)), { ...entry, ...createdFields(session) });
        batch.delete(doc(db, existing.path));
        await batch.commit();
      } else {
        await updateDoc(doc(db, existing.path), entry);
      }
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
      await deleteDoc(doc(db, existing.path));
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
    open: openEntry,
    /** How to open a trip from the calendar (set by app.js). */
    setTripOpener(fn) { openTrip = fn; },
    add() { openEditor(null); },
    stop() { stop(); root.replaceChildren(); },
  };
}
