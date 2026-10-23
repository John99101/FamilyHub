// Calendar days as plain 'YYYY-MM-DD' strings (no time zone), and how
// calendar entries fall on days: single days, several days, every year.
// No page code here, so it can be tested in Node (tests/dates.test.js).

const pad = (n) => String(n).padStart(2, '0');

/** A local Date → 'YYYY-MM-DD' (the day as the person sees it). */
export function isoOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayIso = (now = new Date()) => isoOf(now);

export function isIso(v) {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);
}

const toUtc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export function addDays(iso, days) {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from a to b (b later = positive). */
export function daysBetween(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso) {
  return (toUtc(iso).getUTCDay() + 6) % 7;
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The day a yearly entry falls on in a given year (29 February → 28 February in other years). */
export function yearlyDay(iso, year) {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const day = m === 2 && d === 29 && !isLeap(year) ? 28 : d;
  return `${year}-${pad(m)}-${pad(day)}`;
}

/** 'YYYY-MM' of a day, and the first day of the month before or after. */
export const monthOf = (iso) => iso.slice(0, 7);
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** The 42 days (6 weeks, Monday first) shown for a month 'YYYY-MM'. */
export function monthGrid(month) {
  const first = `${month}-01`;
  const start = addDays(first, -weekdayIndex(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Age (or number of years) for a yearly entry on a day, if the first year is known. */
export function yearsOn(event, day) {
  if (event.repeat !== 'yearly' || event.yearKnown === false) return null;
  const years = Number(day.slice(0, 4)) - Number(event.date.slice(0, 4));
  return years > 0 ? years : null;
}

/**
 * Every day between from and to (inclusive) on which entries fall.
 * @returns {Map<string, Array<{ event, years, first, last }>>}
 *   first/last: whether this day is the first or last day of a multi day entry.
 */
export function entriesByDay(events, from, to) {
  const out = new Map();
  const add = (day, item) => {
    if (day < from || day > to) return;
    if (!out.has(day)) out.set(day, []);
    out.get(day).push(item);
  };
  for (const event of events) {
    if (!event || !isIso(event.date)) continue;
    if (event.repeat === 'yearly') {
      for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y += 1) {
        const day = yearlyDay(event.date, y);
        add(day, { event, years: yearsOn(event, day), first: true, last: true });
      }
      continue;
    }
    const end = isIso(event.endDate) && event.endDate > event.date ? event.endDate : event.date;
    if (end < from || event.date > to) continue;
    let day = event.date < from ? from : event.date;
    while (day <= end && day <= to) {
      add(day, { event, years: null, first: day === event.date, last: day === end });
      day = addDays(day, 1);
    }
  }
  for (const list of out.values()) list.sort(compareEntries);
  return out;
}

/** All day and yearly entries first, then by time, then by title. */
export function compareEntries(a, b) {
  const ta = a.event.time || '';
  const tb = b.event.time || '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return String(a.event.title).localeCompare(String(b.event.title));
}

/**
 * Entries between from and to as a list, each once, on its first day in the
 * range (a multi day entry that already started counts from 'from').
 * @returns {Array<{ event, day, years }>} sorted by day and time
 */
export function upcoming(events, from, to) {
  const list = [];
  for (const [day, items] of entriesByDay(events, from, to)) {
    for (const item of items) {
      if (item.first || day === from) list.push({ event: item.event, day, years: item.years });
    }
  }
  return list.sort((a, b) => (a.day !== b.day ? (a.day < b.day ? -1 : 1) : compareEntries(a, b)));
}

/** Whether an entry lasts several days (drawn as a line in the month view). */
export const isMultiDay = (e) => e.repeat !== 'yearly' && isIso(e.endDate) && e.endDate > e.date;

/**
 * Lines for entries over several days in one week: which columns they span
 * and on which lane (row) they are drawn, so lines never overlap.
 */
export function weekLines(events, weekDays) {
  const first = weekDays[0];
  const last = weekDays[6];
  const segments = events
    .filter((e) => isMultiDay(e) && e.date <= last && e.endDate >= first)
    .map((e) => ({
      event: e,
      from: daysBetween(first, e.date < first ? first : e.date),
      to: daysBetween(first, e.endDate > last ? last : e.endDate),
      startsHere: e.date >= first,
      endsHere: e.endDate <= last,
    }))
    .sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from) || String(a.event.title).localeCompare(String(b.event.title)));
  const lanes = [];
  for (const s of segments) {
    let lane = lanes.findIndex((end) => end < s.from);
    if (lane === -1) { lane = lanes.length; lanes.push(-1); }
    lanes[lane] = s.to;
    s.lane = lane;
  }
  return segments;
}
