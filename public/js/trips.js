// Trip planner: trips with dates, destination and who is coming; journeys,
// accommodation and a day by day plan. A trip belongs to the whole family or
// to a household. The parts of a trip are only read while it is open.
import {
  db, collection, doc, onSnapshot, getDocs, addDoc, updateDoc, writeBatch, serverTimestamp,
} from './firebase.js';
import { $, el, svgIcon, toast, card, emptyNote, addButton, formatWeekdayShort, formatDayMonth, relativeDays } from './ui.js';
import { t } from './i18n.js';
import { todayIso, addDays, daysBetween, isIso } from './dates.js';
import { canEdit, createdFields, baseOf } from './family-data.js';
import { paint } from './colors.js';
import { ALL, inGroup, groupChips, groupField, defaultGroup, groupBadge } from './groups.js';
import { openForm, openDialog } from './dialog.js';

const MAX_TRIP_DAYS = 60;
const BACK_ICON = ['m15 18-6-6 6-6'];

/** "in 12 Tagen", "läuft gerade", "vorbei" for a trip. */
export function tripStatus(trip, today = todayIso()) {
  if (trip.start > today) return relativeDays(daysBetween(today, trip.start));
  if (trip.end >= today) return t('trips.ongoing', { n: daysBetween(today, trip.end) + 1 });
  return t('trips.past');
}

export const tripRange = (trip) => (trip.end > trip.start
  ? t('trips.range', { from: formatDayMonth(trip.start), to: formatDayMonth(trip.end) })
  : formatDayMonth(trip.start));

/** Small colored chips with the people coming along. */
export function peopleChips(data, mails) {
  return el('div', { class: 'member-chips' }, (mails || []).map((mail) => el('span', { class: 'member-chip' }, [
    paint(el('span', { class: 'person-dot' }), data.colorForMail(mail)), el('span', { text: data.shortNameForMail(mail) }),
  ])));
}

export function createTrips(data) {
  const root = $('trips-content');
  const session = data.session;
  let group = ALL;
  let openPath = null;       // path of the open trip
  let items = [];
  let stopItems = null;

  // ---------- list ----------

  function tripCard(trip) {
    return el('li', {}, [el('button', { class: 'trip-row', type: 'button', onclick: () => open(trip.path) }, [
      el('span', { class: 'trip-title' }, [trip.title, groupBadge(data, trip)]),
      el('span', { class: 'trip-meta', text: [trip.destination, tripRange(trip), tripStatus(trip)].filter(Boolean).join(' · ') }),
      trip.people?.length ? peopleChips(data, trip.people) : null,
    ])]);
  }

  function renderList() {
    const today = todayIso();
    const trips = data.state.trips.filter((x) => inGroup(x, group)).sort((a, b) => (a.start < b.start ? -1 : 1));
    const coming = trips.filter((x) => x.end >= today);
    const past = trips.filter((x) => x.end < today).reverse().slice(0, 10);
    const parts = [groupChips(data, group, (value) => { group = value; render(); })];
    parts.push(card(t('trips.coming'), coming.length
      ? el('ul', { class: 'trip-list' }, coming.map(tripCard))
      : emptyNote(data.state.loaded.trips ? t('trips.none') : t('common.loading')), { action: addButton(t('trips.add'), () => openTripEditor(null)) }));
    if (past.length) parts.push(card(t('trips.pastTitle'), el('ul', { class: 'trip-list' }, past.map(tripCard))));
    root.replaceChildren(...parts.filter(Boolean));
  }

  // ---------- one trip ----------

  function itemLine(it, { showDate = true } = {}) {
    const when = [showDate ? formatWeekdayShort(it.date) : '', it.time].filter(Boolean).join(' · ');
    const range = it.kind === 'stay' && it.endDate ? t('trips.range', { from: formatDayMonth(it.date), to: formatDayMonth(it.endDate) }) : '';
    return el('li', {}, [el('button', { class: 'entry', type: 'button', onclick: () => openItemEditor(it.kind, it) }, [
      el('span', { class: 'entry-time', text: when || '·' }),
      el('span', { class: 'entry-main' }, [
        el('span', { class: 'entry-title', text: it.title }),
        [range, it.place].filter(Boolean).length ? el('span', { class: 'entry-meta', text: [range, it.place].filter(Boolean).join(' · ') }) : null,
        it.note ? el('span', { class: 'entry-meta pre', text: it.note }) : null,
      ]),
    ])]);
  }

  const byWhen = (a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : String(a.time).localeCompare(String(b.time)));

  function renderTrip(trip) {
    const back = el('button', { class: 'btn-link back-row', type: 'button', onclick: close }, [svgIcon(BACK_ICON), el('span', { text: t('trips.all') })]);
    const head = card(trip.title, [
      el('p', { class: 'trip-meta', text: [trip.destination, tripRange(trip), tripStatus(trip)].filter(Boolean).join(' · ') }),
      trip.people?.length ? peopleChips(data, trip.people) : null,
      trip.note ? el('p', { class: 'pre', text: trip.note }) : null,
      el('p', { class: 'muted small' }, [t('common.addedBy', { name: data.nameForUid(trip.createdBy, trip.createdByName) || '?' }), groupBadge(data, trip)]),
    ], { action: canEdit(session, trip) ? el('button', { class: 'btn-link', type: 'button', text: t('common.edit'), onclick: () => openTripEditor(trip) }) : null });

    const travel = items.filter((x) => x.kind === 'travel').sort(byWhen);
    const stays = items.filter((x) => x.kind === 'stay').sort(byWhen);
    const days = [];
    const length = Math.min(daysBetween(trip.start, trip.end), MAX_TRIP_DAYS);
    for (let i = 0; i <= length; i += 1) {
      const day = addDays(trip.start, i);
      const plan = items.filter((x) => x.kind === 'day' && x.date === day).sort(byWhen);
      const moves = travel.filter((x) => x.date === day);
      days.push(el('div', { class: 'trip-day' }, [
        el('div', { class: 'trip-day-head' }, [
          el('h3', { class: 'home-day-title', text: `${formatWeekdayShort(day)} · ${t('trips.dayN', { n: i + 1 })}` }),
          el('button', { class: 'btn-link', type: 'button', text: t('trips.addPlan'), onclick: () => openItemEditor('day', null, day) }),
        ]),
        plan.length || moves.length
          ? el('ul', { class: 'entry-list' }, [...moves.map((x) => itemLine(x, { showDate: false })), ...plan.map((x) => itemLine(x, { showDate: false }))])
          : el('p', { class: 'muted small', text: t('trips.dayEmpty') }),
      ]));
    }

    root.replaceChildren(
      back,
      head,
      card(t('trips.travel'), travel.length ? el('ul', { class: 'entry-list' }, travel.map((x) => itemLine(x))) : emptyNote(t('trips.noTravel')),
        { action: addButton(t('trips.addTravel'), () => openItemEditor('travel', null, trip.start)) }),
      card(t('trips.stays'), stays.length ? el('ul', { class: 'entry-list' }, stays.map((x) => itemLine(x))) : emptyNote(t('trips.noStays')),
        { action: addButton(t('trips.addStay'), () => openItemEditor('stay', null, trip.start)) }),
      card(t('trips.days'), days),
    );
  }

  function currentTrip() {
    return openPath ? data.state.trips.find((x) => x.path === openPath) || null : null;
  }

  function render() {
    const trip = currentTrip();
    if (openPath && !trip && data.state.loaded.trips) { close(); return; }
    if (trip) renderTrip(trip);
    else renderList();
  }

  function open(path) {
    if (stopItems) stopItems();
    openPath = path;
    items = [];
    stopItems = onSnapshot(collection(db, `${path}/items`), (snap) => {
      items = snap.docs.map((d) => ({ id: d.id, ...d.data(), path: `${path}/items/${d.id}` }));
      render();
    }, (err) => console.warn('Reading the trip failed', err.code));
    render();
    root.closest('.view')?.scrollTo(0, 0);
  }

  function close() {
    if (stopItems) stopItems();
    stopItems = null;
    openPath = null;
    items = [];
    render();
  }

  // ---------- editing ----------

  function openTripEditor(existing) {
    const trip = existing || {};
    const people = data.family().map((p) => ({ value: p.mail, label: p.me ? `${p.name} (${t('home.you')})` : p.name }));
    openForm({
      title: existing ? t('trips.editTitle') : t('trips.newTitle'),
      fields: [
        { name: 'title', type: 'text', label: t('trips.titleLabel'), value: trip.title || '', maxlength: 100, required: true, placeholder: t('trips.titleExample') },
        { name: 'destination', type: 'text', label: t('trips.destination'), value: trip.destination || '', maxlength: 100 },
        { name: 'start', type: 'date', label: t('trips.start'), value: trip.start || '', required: true },
        { name: 'end', type: 'date', label: t('trips.end'), value: trip.end || '', required: true },
        { name: 'people', type: 'people', label: t('trips.who'), value: trip.people || [session.mail], options: people },
        { name: 'note', type: 'textarea', label: t('trips.note'), value: trip.note || '', maxlength: 2000, rows: 3 },
        existing ? null : groupField(data, defaultGroup(data, group)),
      ],
      danger: existing ? { label: t('trips.delete'), onClick: () => removeTrip(existing) } : null,
      onSubmit: async (v) => {
        if (!isIso(v.start) || !isIso(v.end) || v.end < v.start) return t('trips.datesWrong');
        if (daysBetween(v.start, v.end) > MAX_TRIP_DAYS) return t('cal.tooLong', { n: MAX_TRIP_DAYS });
        const fields = {
          title: v.title.trim(), destination: v.destination.trim(), start: v.start, end: v.end,
          people: [...new Set(v.people)], note: v.note.trim(), updatedAt: serverTimestamp(),
        };
        try {
          if (existing) await updateDoc(doc(db, existing.path), fields);
          else {
            const ref = await addDoc(collection(db, `${baseOf(v.household || '')}trips`), { ...fields, ...createdFields(session) });
            setTimeout(() => open(ref.path), 0);
          }
          toast(t('common.saved'));
          return undefined;
        } catch (err) {
          console.warn('Saving the trip failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  function openItemEditor(kind, existing, day = '') {
    const trip = currentTrip();
    if (!trip) return;
    if (existing && !canEdit(session, existing) && trip.createdBy !== session.user.uid) {
      openDialog({ title: existing.title, content: [el('ul', { class: 'entry-list' }, [itemLine(existing)])] });
      return;
    }
    const it = existing || {};
    const titles = { day: 'trips.newPlan', stay: 'trips.newStay', travel: 'trips.newTravel' };
    openForm({
      title: existing ? t('trips.editItem') : t(titles[kind]),
      fields: [
        { name: 'title', type: 'text', label: t(`trips.label.${kind}`), value: it.title || '', maxlength: 100, required: true, placeholder: t(`trips.example.${kind}`) },
        { name: 'date', type: 'date', label: kind === 'stay' ? t('trips.checkIn') : t('cal.date'), value: it.date || day || trip.start, required: true },
        kind === 'stay' ? { name: 'endDate', type: 'date', label: t('trips.checkOut'), value: it.endDate || trip.end } : null,
        kind === 'stay' ? null : { name: 'time', type: 'time', label: t('cal.time'), value: it.time || '' },
        { name: 'place', type: 'text', label: kind === 'stay' ? t('contacts.address') : t('cal.place'), value: it.place || '', maxlength: 200 },
        { name: 'note', type: 'textarea', label: t('cal.note'), value: it.note || '', maxlength: 1000, rows: 3 },
      ],
      danger: existing ? { label: t('common.delete'), onClick: () => removeItem(existing) } : null,
      onSubmit: async (v) => {
        if (!isIso(v.date)) return t('cal.dateMissing');
        const endDate = kind === 'stay' && isIso(v.endDate) ? v.endDate : '';
        if (endDate && endDate < v.date) return t('cal.endAfterStart');
        const fields = {
          kind, date: v.date, endDate, time: kind === 'stay' ? '' : (/^\d{2}:\d{2}$/.test(v.time || '') ? v.time : ''),
          title: v.title.trim(), place: v.place.trim(), note: v.note.trim(), updatedAt: serverTimestamp(),
        };
        try {
          if (existing) await updateDoc(doc(db, existing.path), fields);
          else await addDoc(collection(db, `${trip.path}/items`), { ...fields, ...createdFields(session) });
          toast(t('common.saved'));
          return undefined;
        } catch (err) {
          console.warn('Saving the trip part failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  async function removeItem(it) {
    if (!confirm(t('trips.confirmItem', { title: it.title }))) return false;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, it.path));
      await batch.commit();
      return true;
    } catch (err) {
      console.warn('Deleting the trip part failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  async function removeTrip(trip) {
    if (!confirm(t('trips.confirmDelete', { title: trip.title }))) return false;
    try {
      // The trip with everything in it (the rules let the trip's creator delete all parts).
      const parts = await getDocs(collection(db, `${trip.path}/items`));
      const batch = writeBatch(db);
      for (const d of parts.docs) batch.delete(d.ref);
      batch.delete(doc(db, trip.path));
      await batch.commit();
      toast(t('common.deleted'));
      close();
      return true;
    } catch (err) {
      console.warn('Deleting the trip failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  let visible = false;
  const stop = data.subscribe(() => { if (visible) render(); });
  return {
    onShow() { visible = true; render(); },
    onHide() { visible = false; },
    /** Opens one trip (from the Start page or the calendar). */
    open(path) { open(path); },
    stop() { stop(); if (stopItems) stopItems(); root.replaceChildren(); },
  };
}
