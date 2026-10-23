// Small helpers for building the page safely (text is always set as text,
// never as HTML) and for date and time formats in the chosen language.
import { t, locale } from './i18n.js';

export const $ = (id) => document.getElementById(id);

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svgIcon(paths, viewBox = '0 0 24 24') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export const TRASH_ICON = ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'];

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function avatar(name, photo, large = false) {
  const cls = large ? 'avatar avatar-lg' : 'avatar';
  const fallback = () => el('span', { class: cls, text: initials(name), 'aria-hidden': 'true' });
  if (!photo || !/^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(photo)) return fallback();
  const img = el('img', { class: cls, src: photo, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}

let toastTimer;
export function toast(text) {
  const box = $('toast');
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 3500);
}

const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayFormat = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
const dayYearFormat = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const longDateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDateFormat = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/** 'YYYY-MM-DD' → "02.10.2026" / "02/10/2026". */
export function formatShortDay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return '';
  return shortDateFormat.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

export const formatTime = (date) => timeFormat.format(date);
export const formatDateTime = (date) => dateTimeFormat.format(date);

/** 'YYYY-MM-DD' (a calendar day, no time zone) → "21. Oktober 2026" / "21 October 2026" / "21 octobre 2026". */
export function formatDay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return '';
  return longDateFormat.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

export function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function dayLabel(date, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - that) / 86400000);
  if (diffDays === 0) return t('day.today');
  if (diffDays === 1) return t('day.yesterday');
  return (date.getFullYear() === now.getFullYear() ? dayFormat : dayYearFormat).format(date);
}

// ---------- calendar days in the chosen language ('YYYY-MM-DD', shown as that day) ----------

const utcDay = (iso) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
const weekdayDayFormat = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const weekdayShortFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthTitleFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekdayNameFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
const dayMonthFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** "Dienstag, 27. Oktober" / "Tuesday 27 October" / "mardi 27 octobre". */
export const formatWeekdayDay = (iso) => weekdayDayFormat.format(utcDay(iso));
/** "Di., 27. Okt." */
export const formatWeekdayShort = (iso) => weekdayShortFormat.format(utcDay(iso));
/** "27. Oktober" (birthdays, without the year). */
export const formatDayMonth = (iso) => dayMonthFormat.format(utcDay(iso));
/** "Oktober 2026" for 'YYYY-MM'. */
export const formatMonth = (month) => monthTitleFormat.format(utcDay(`${month}-01`));
/** Short weekday names, Monday first. */
export const weekdayNames = () => Array.from({ length: 7 }, (_, i) => weekdayNameFormat.format(new Date(Date.UTC(2026, 9, 26 + i))));

/** "heute", "morgen", "in 5 Tagen", "vor 2 Tagen" for a number of days from today. */
export function relativeDays(n) {
  if (n === 0) return t('day.today');
  if (n === 1) return t('day.tomorrow');
  if (n === -1) return t('day.yesterday');
  return n > 1 ? t('day.inDays', { n }) : t('day.daysAgo', { n: -n });
}

// ---------- page parts ----------

/** A card with a heading and an optional button or link on the right. */
export function card(title, children, { action, className = '' } = {}) {
  const head = el('div', { class: 'card-head' }, [el('h2', { text: title }), action || null]);
  return el('section', { class: `card ${className}`.trim() }, [head, ...[].concat(children)]);
}

export const emptyNote = (text) => el('p', { class: 'empty-note', text });

/** Small round button with a plus, for "add" actions in card heads. */
export function addButton(label, onClick) {
  return el('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: onClick }, [
    svgIcon(['M12 5v14', 'M5 12h14']), el('span', { text: label }),
  ]);
}
