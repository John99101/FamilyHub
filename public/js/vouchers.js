// Gifts of time: activities, trips and vouchers people gave each other, and
// how loudly each one asks to be redeemed. No Firebase here, so it can be tested.
import { daysBetween } from './dates.js';

export const KINDS = ['activity', 'trip', 'voucher'];
export const KIND_ICONS = { activity: '🎟️', trip: '🧳', voucher: '🎁' };
export const EXPIRING_DAYS = 30;
export const DUSTY_DAYS = 90;
export const FOSSIL_DAYS = 365;

// Most urgent first: the page and the start card sort by this.
const RANK = ['today', 'didIt', 'expiring', 'expired', 'planned', 'fossil', 'dusty', 'waiting', 'fresh', 'done'];

export const isInvolved = (v, mail) => (v.givers || []).includes(mail) || (v.receivers || []).includes(mail);

/**
 * What a gift tells people today: { mood, days, icon }.
 * days: until the planned day (planned), until the last valid day (expiring), or since it was given.
 */
export function voucherMood(v, today) {
  if (v.status === 'done') return { mood: 'done', days: 0, icon: '🎉' };
  if (v.status === 'planned' && v.plannedOn) {
    const days = daysBetween(today, v.plannedOn);
    if (days === 0) return { mood: 'today', days, icon: '🥳' };
    if (days < 0) return { mood: 'didIt', days: -days, icon: '🤔' };
    return { mood: 'planned', days, icon: '📅' };
  }
  if (v.until) {
    const left = daysBetween(today, v.until);
    if (left < 0) return { mood: 'expired', days: -left, icon: '⌛' };
    if (left <= EXPIRING_DAYS) return { mood: 'expiring', days: left, icon: '⏰' };
  }
  const age = Math.max(0, daysBetween(v.givenOn, today));
  if (age >= FOSSIL_DAYS) return { mood: 'fossil', days: age, icon: '🦖' };
  if (age >= DUSTY_DAYS) return { mood: 'dusty', days: age, icon: '🕸️' };
  if (age >= 30) return { mood: 'waiting', days: age, icon: '⏳' };
  return { mood: 'fresh', days: age, icon: '✨' };
}

/** Most urgent first; within a mood the nearest date or the oldest gift first. */
export function sortVouchers(list, today) {
  const keyed = list.map((v) => ({ v, m: voucherMood(v, today) }));
  const soonFirst = new Set(['planned', 'expiring']);
  keyed.sort((a, b) => RANK.indexOf(a.m.mood) - RANK.indexOf(b.m.mood)
    || (soonFirst.has(a.m.mood) ? a.m.days - b.m.days : b.m.days - a.m.days)
    || String(a.v.title).localeCompare(String(b.v.title)));
  return keyed.map((k) => k.v);
}

/** Joins the three lists the app reads (shared, given, received) without doubles. */
export function mergeVouchers(...lists) {
  const byId = new Map();
  for (const list of lists) for (const v of list || []) byId.set(v.id, v);
  return [...byId.values()];
}

/** The open gifts this person gives or gets, most urgent first. */
export function myOpenVouchers(list, mail, today) {
  return sortVouchers(list.filter((v) => v.status !== 'done' && isInvolved(v, mail)), today);
}
