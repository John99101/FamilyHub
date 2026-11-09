// The active group. Everything a group shares lives under groups/{g}/, so
// firebase.js puts that prefix in front of every path unless the path is one
// of the few that belong to no group (markets, nicknames, groups themselves).
// Switching groups reloads the page, so nothing from the old group lingers.

const KEY = 'familyhub-group';
const GLOBAL = /^(groups|nicknames|market|marketHistory|marketAccess)(\/|$)|^config\/(watchlist|market)$/;

let active = '';
try { active = globalThis.localStorage?.getItem(KEY) || ''; } catch { /* storage blocked: choose again after each start */ }

export function activeGroup() {
  return active;
}

/** Remembers the group on this device (empty string forgets it). */
export function setActiveGroup(id) {
  active = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked: the choice lasts until the page closes */ }
}

/** 'rooms/x' → 'groups/{g}/rooms/x'; global paths stay as they are. */
export function scopedPath(path, group = active) {
  if (GLOBAL.test(path)) return path;
  if (!group) throw new Error('No group chosen');
  return `groups/${group}/${path}`;
}
