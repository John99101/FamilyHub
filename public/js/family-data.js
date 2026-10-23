// Live copies of the family documents in Firestore, shared by the pages
// (Start, calendar, tasks, polls, chat rooms, weather) so each is read once.
// Recipes and contacts are only loaded when their page is opened.
import {
  db, collection, doc, query, where, orderBy, limit, onSnapshot, setDoc, serverTimestamp,
} from './firebase.js';
import { todayIso, addDays } from './dates.js';

export const MAIN_ROOM = 'familie';
// Multi day entries may start up to this many days before the day shown.
export const EVENT_LOOKBACK_DAYS = 62;

const rows = (snap) => snap.docs.map((d) => ({
  id: d.id,
  ...d.data({ serverTimestamps: 'estimate' }),
  pending: d.metadata.hasPendingWrites,
}));

export const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v ? new Date(v) : null);
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

export function createFamilyData(session) {
  const state = {
    events: [],      // single and multi day entries from EVENT_LOOKBACK_DAYS ago on
    yearly: [],      // birthdays and other yearly entries
    tasksOpen: [],
    tasksDone: [],   // the 20 most recently done
    polls: [],       // the 30 newest
    places: [],
    people: [],
    rooms: [],       // rooms this person may use, main room first, then by newest message
    digest: null,
    digestSwitch: null,
    loaded: {},
  };
  const listeners = new Set();
  const roomParts = { main: [], open: [], mine: [] };
  const roomPartLoaded = { main: false, open: false, mine: false };
  let queued = false;

  function notify() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      for (const fn of listeners) fn(state);
    });
  }

  const onError = (what) => (err) => console.warn(`Reading ${what} failed`, err.code);

  function watch(key, ref, map = rows) {
    return onSnapshot(ref, (snap) => {
      state[key] = map(snap);
      state.loaded[key] = true;
      if (key === 'people') ensureOwnProfile();
      notify();
    }, onError(key));
  }

  function watchDoc(key, ref) {
    return watch(key, ref, (snap) => (snap.exists() ? { id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) } : null));
  }

  function mergeRooms() {
    const byId = new Map();
    for (const room of [...roomParts.main, ...roomParts.open, ...roomParts.mine]) byId.set(room.id, room);
    const lastMs = (r) => toDate(r.last?.at)?.getTime() || toDate(r.createdAt)?.getTime() || 0;
    state.rooms = [...byId.values()].sort((a, b) => {
      if (a.id === MAIN_ROOM) return -1;
      if (b.id === MAIN_ROOM) return 1;
      return lastMs(b) - lastMs(a) || String(a.name).localeCompare(String(b.name));
    });
    // Only "loaded" once all three lists answered, so a closed room is never missed at the start.
    state.loaded.rooms = roomPartLoaded.main && roomPartLoaded.open && roomPartLoaded.mine;
    notify();
  }

  function watchRooms(part, ref, isDoc = false) {
    return onSnapshot(ref, (snap) => {
      if (isDoc) roomParts[part] = snap.exists() ? [{ id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) }] : [];
      else roomParts[part] = rows(snap);
      roomPartLoaded[part] = true;
      mergeRooms();
    }, onError(`rooms (${part})`));
  }

  // Everyone keeps their own name and photo in people/{uid}, so others see names in lists.
  let profileChecked = false;
  function ensureOwnProfile() {
    if (profileChecked) return;
    profileChecked = true;
    const name = typeof session.claims.name === 'string' ? session.claims.name : '';
    const photo = typeof session.claims.picture === 'string' ? session.claims.picture : '';
    const mine = state.people.find((p) => p.id === session.user.uid);
    if (mine && mine.name === name && mine.photo === photo && mine.mail === session.mail) return;
    setDoc(doc(db, 'people', session.user.uid), { name, mail: session.mail, photo, updatedAt: serverTimestamp() })
      .catch((err) => console.warn('Saving the profile failed', err.code));
  }

  const since = addDays(todayIso(), -EVENT_LOOKBACK_DAYS);
  const stops = [
    watch('events', query(collection(db, 'events'), where('date', '>=', since)),
      (snap) => rows(snap).filter((e) => e.repeat !== 'yearly')),
    watch('yearly', query(collection(db, 'events'), where('repeat', '==', 'yearly'))),
    watch('tasksOpen', query(collection(db, 'tasks'), where('done', '==', false))),
    watch('tasksDone', query(collection(db, 'tasks'), where('done', '==', true), orderBy('doneAt', 'desc'), limit(20))),
    watch('polls', query(collection(db, 'polls'), orderBy('createdAt', 'desc'), limit(30))),
    watch('places', collection(db, 'places')),
    watch('people', collection(db, 'people')),
    watchDoc('digest', doc(db, 'digest', 'current')),
    watchDoc('digestSwitch', doc(db, 'config', 'digest')),
    watchRooms('main', doc(db, 'rooms', MAIN_ROOM), true),
    watchRooms('open', query(collection(db, 'rooms'), where('open', '==', true))),
    watchRooms('mine', query(collection(db, 'rooms'), where('members', 'array-contains', session.mail))),
  ];

  // ---------- names ----------

  function personByMail(mail) {
    return state.people.find((p) => p.mail === mail) || null;
  }

  /** Display name for a mail address on the allow list (the part before @ if the person never signed in). */
  function nameForMail(mail) {
    if (!mail) return '';
    const p = personByMail(mail);
    return (p && p.name) || mail.split('@')[0];
  }

  function nameForUid(uid) {
    const p = state.people.find((x) => x.id === uid);
    return p ? p.name || p.mail.split('@')[0] : '';
  }

  /** Everyone on the allow list, with names where known, sorted by name. */
  function family() {
    const access = session.access || {};
    const mails = [...new Set([...(access.admins || []), ...(access.members || [])])];
    return mails
      .map((mail) => {
        const p = personByMail(mail);
        return { mail, name: nameForMail(mail), uid: p ? p.id : null, photo: p ? p.photo : '' };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    state,
    session,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    nameForMail,
    nameForUid,
    family,
    stop() { for (const s of stops) s(); listeners.clear(); },
  };
}

/** True if a created entry may be changed by this person (creator or admin). */
export function canEdit(session, item) {
  return !!item && (item.createdBy === session.user.uid || session.isAdmin);
}

/** "Name" of the current user as Google gave it (also what the rules check). */
export function myName(session) {
  return typeof session.claims.name === 'string' ? session.claims.name : '';
}

/** Fields every created entry carries (checked by the rules). */
export function createdFields(session) {
  return { createdBy: session.user.uid, createdByName: myName(session), createdAt: serverTimestamp() };
}
