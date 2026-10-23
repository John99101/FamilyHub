// Live copies of the family documents in Firestore, shared by the pages
// (Start, calendar, tasks, polls, chat rooms, weather) so each is read once.
// Recipes and contacts are only loaded when their page is opened.
//
// Calendar entries, tasks and polls come from the whole family (top level)
// and from each household this person is in (households/{id}/...). Every
// row carries `household` ('' for the whole family) and `path` (where it is
// stored), so the pages can show, filter and change them.
import {
  db, collection, doc, query, where, orderBy, limit, onSnapshot, setDoc, deleteDoc, writeBatch, serverTimestamp,
} from './firebase.js';
import { todayIso, addDays } from './dates.js';
import { hexOf, NEUTRAL, planColorWork } from './colors.js';

export const MAIN_ROOM = 'familie';
// Multi day entries may start up to this many days before the day shown.
export const EVENT_LOOKBACK_DAYS = 62;
const SCOPED = ['events', 'yearly', 'tasksOpen', 'tasksDone', 'polls'];

export const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v ? new Date(v) : null);
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/** Where a group keeps its entries: '' for the whole family, 'households/{id}/' for a household. */
export const baseOf = (household) => (household ? `households/${household}/` : '');

export function createFamilyData(session) {
  const uid = session.user.uid;
  const state = {
    events: [],      // single and multi day entries from EVENT_LOOKBACK_DAYS ago on
    yearly: [],      // birthdays and other yearly entries
    tasksOpen: [],
    tasksDone: [],   // the 20 most recently done (per group)
    polls: [],       // the 30 newest (per group)
    places: [],
    people: [],
    colors: {},      // color → uid of the person holding it
    nicknames: {},   // mail → name this person gave them (only they can read it)
    households: [],  // all households (everyone sees which exist and who is in them)
    rooms: [],       // rooms this person may use, main room first, then household rooms, then by newest message
    digest: null,    // the family's weekly overview
    householdDigests: {}, // household id → its weekly overview
    digestSwitch: null,
    rulesOutdated: false, // the server refused colors, nicknames or households
    loaded: {},
  };
  const listeners = new Set();
  const scopes = { '': {} };          // group → { events: [...], ... }
  const householdStops = new Map();  // household id → stop functions
  const roomParts = { main: [], open: [], mine: [] };
  const roomPartLoaded = { main: false, open: false, mine: false };
  const householdRooms = {};         // household id → room or null
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

  const rowsOf = (snap, household, col) => snap.docs.map((d) => ({
    id: d.id,
    ...d.data({ serverTimestamps: 'estimate' }),
    household,
    path: `${baseOf(household)}${col}/${d.id}`,
    pending: d.metadata.hasPendingWrites,
  }));

  function mergeScoped() {
    for (const key of SCOPED) state[key] = Object.values(scopes).flatMap((s) => s[key] || []);
  }

  // ---------- a group's calendar, tasks and polls ----------

  function watchGroup(household) {
    const base = baseOf(household);
    const scope = (scopes[household] = scopes[household] || {});
    const since = addDays(todayIso(), -EVENT_LOOKBACK_DAYS);
    const put = (key, col, filter) => (snap) => {
      scope[key] = rowsOf(snap, household, col).filter(filter || (() => true));
      if (!household) state.loaded[key] = true;
      mergeScoped();
      notify();
    };
    return [
      onSnapshot(query(collection(db, `${base}events`), where('date', '>=', since)), put('events', 'events', (e) => e.repeat !== 'yearly'), onError(`${base}events`)),
      onSnapshot(query(collection(db, `${base}events`), where('repeat', '==', 'yearly')), put('yearly', 'events'), onError(`${base}yearly`)),
      onSnapshot(query(collection(db, `${base}tasks`), where('done', '==', false)), put('tasksOpen', 'tasks'), onError(`${base}tasks`)),
      onSnapshot(query(collection(db, `${base}tasks`), where('done', '==', true), orderBy('doneAt', 'desc'), limit(20)), put('tasksDone', 'tasks'), onError(`${base}done tasks`)),
      onSnapshot(query(collection(db, `${base}polls`), orderBy('createdAt', 'desc'), limit(30)), put('polls', 'polls'), onError(`${base}polls`)),
    ];
  }

  // ---------- households this person is in ----------

  function syncHouseholds() {
    const mine = new Set(state.households.filter((h) => (h.members || []).includes(session.mail)).map((h) => h.id));
    for (const [id, stops] of householdStops) {
      if (mine.has(id)) continue;
      for (const s of stops) s();
      householdStops.delete(id);
      delete scopes[id];
      delete householdRooms[id];
      delete state.householdDigests[id];
    }
    for (const id of mine) {
      if (householdStops.has(id)) continue;
      const stops = watchGroup(id);
      stops.push(onSnapshot(doc(db, 'households', id, 'rooms', 'main'), (snap) => {
        if (snap.exists()) {
          householdRooms[id] = { ...snap.data({ serverTimestamps: 'estimate' }), id: `h:${id}`, household: id, path: `households/${id}/rooms/main` };
        } else {
          householdRooms[id] = null;
          // The room is set up by the first member who opens the app after the household was created.
          const h = state.households.find((x) => x.id === id);
          setDoc(doc(db, 'households', id, 'rooms', 'main'), { name: String(h?.name || 'Haushalt').slice(0, 40), createdAt: serverTimestamp() })
            .catch(() => { /* someone else was faster, or no access any more */ });
        }
        mergeRooms();
      }, onError(`household room ${id}`)));
      stops.push(onSnapshot(doc(db, 'households', id, 'digest', 'current'), (snap) => {
        if (snap.exists()) state.householdDigests[id] = snap.data({ serverTimestamps: 'estimate' });
        else delete state.householdDigests[id];
        notify();
      }, onError(`household overview ${id}`)));
      householdStops.set(id, stops);
    }
    mergeScoped();
    mergeRooms();
  }

  // ---------- rooms ----------

  function mergeRooms() {
    const byId = new Map();
    for (const room of [...roomParts.main, ...roomParts.open, ...roomParts.mine]) {
      byId.set(room.id, { ...room, household: '', path: `rooms/${room.id}` });
    }
    for (const [hid, room] of Object.entries(householdRooms)) {
      if (!room) continue;
      const h = state.households.find((x) => x.id === hid);
      byId.set(room.id, { ...room, name: h ? h.name : room.name });
    }
    const lastMs = (r) => toDate(r.last?.at)?.getTime() || toDate(r.createdAt)?.getTime() || 0;
    const rank = (r) => (r.id === MAIN_ROOM ? 0 : r.household ? 1 : 2);
    state.rooms = [...byId.values()].sort((a, b) => rank(a) - rank(b) || lastMs(b) - lastMs(a) || String(a.name).localeCompare(String(b.name)));
    // Only "loaded" once all lists answered (also every household room), so no room is missed at the start.
    const mine = state.households.filter((h) => (h.members || []).includes(session.mail)).map((h) => h.id);
    state.loaded.rooms = roomPartLoaded.main && roomPartLoaded.open && roomPartLoaded.mine
      && state.loaded.households === true && mine.every((id) => id in householdRooms);
    notify();
  }

  function watchRooms(part, ref, isDoc = false) {
    return onSnapshot(ref, (snap) => {
      if (isDoc) roomParts[part] = snap.exists() ? [{ id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) }] : [];
      else roomParts[part] = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
      roomPartLoaded[part] = true;
      mergeRooms();
    }, onError(`rooms (${part})`));
  }

  // ---------- own profile and color ----------

  const claimName = typeof session.claims.name === 'string' ? session.claims.name : '';
  const claimPhoto = typeof session.claims.picture === 'string' ? session.claims.picture : '';
  const profileFields = () => ({ name: claimName, mail: session.mail, photo: claimPhoto, updatedAt: serverTimestamp() });
  const me = () => state.people.find((p) => p.id === uid) || null;

  // Everyone keeps their own name, photo and color in people/{uid}, so others see them in lists.
  let profileChecked = false;
  function ensureOwnProfile() {
    if (profileChecked || !state.loaded.people) return;
    profileChecked = true;
    const p = me();
    if (p && p.name === claimName && p.photo === claimPhoto && p.mail === session.mail) return;
    // merge keeps the color
    setDoc(doc(db, 'people', uid), profileFields(), { merge: true })
      .catch((err) => console.warn('Saving the profile failed', err.code));
  }

  /** Takes a color: frees the old one(s) and writes the lock and the profile together. */
  async function setMyColor(color) {
    const batch = writeBatch(db);
    for (const [c, holder] of Object.entries(state.colors)) {
      if (holder === uid && c !== color) batch.delete(doc(db, 'colors', c));
    }
    batch.set(doc(db, 'colors', color), { uid });
    batch.set(doc(db, 'people', uid), { ...profileFields(), color }, { merge: true });
    await batch.commit();
  }

  // Keeps exactly one color for this person: the first free one the first
  // time, its own color written back if the profile lost it, extra colors
  // given back, and colors stuck with others (their profile shows another
  // color) freed. Runs only on data the server has confirmed and never twice
  // at the same time, so it cannot take two colors in a row.
  const sync = {};            // key → { pending, cache } of the last snapshot
  let colorBusy = false;
  let takeTries = 0;
  const orphansTried = new Set();

  async function ensureColor() {
    if (colorBusy || !state.loaded.people || !state.loaded.colors) return;
    if (['people', 'colors'].some((k) => !sync[k] || sync[k].pending || sync[k].cache)) return;
    const plan = planColorWork({ uid, people: state.people, colors: state.colors });
    const orphans = plan.orphans.filter((c) => !orphansTried.has(c));
    if (!plan.take && !plan.repair && !plan.release.length && !orphans.length) return;
    colorBusy = true;
    try {
      if (plan.repair || plan.release.length) {
        const batch = writeBatch(db);
        if (plan.repair) batch.set(doc(db, 'people', uid), { ...profileFields(), color: plan.repair }, { merge: true });
        for (const c of plan.release) batch.delete(doc(db, 'colors', c));
        await batch.commit();
      } else if (plan.take && takeTries < 3) {
        takeTries += 1;
        await setMyColor(plan.take);
      }
      // Stuck colors of others: the rules only allow this when the owner's profile shows another color.
      for (const c of orphans) {
        orphansTried.add(c);
        await deleteDoc(doc(db, 'colors', c)).catch((err) => console.warn('Freeing a stuck color failed', c, err.code));
      }
    } catch (err) {
      console.warn('Keeping the color failed', err.code);
    } finally {
      colorBusy = false;
    }
  }

  // ---------- start ----------

  // Collections the newest security rules are needed for: if the server refuses
  // them, the rules on the server are older than the app (see the Family page).
  const NEEDS_NEW_RULES = new Set(['colors', 'nicknames', 'households']);

  const watchList = (key, ref, map, after) => onSnapshot(ref, { includeMetadataChanges: key === 'people' || key === 'colors' }, (snap) => {
    state[key] = map(snap);
    state.loaded[key] = true;
    sync[key] = { pending: snap.metadata.hasPendingWrites, cache: snap.metadata.fromCache };
    if (after) after();
    notify();
  }, (err) => {
    console.warn(`Reading ${key} failed`, err.code);
    if (err.code === 'permission-denied' && NEEDS_NEW_RULES.has(key)) {
      state.rulesOutdated = true;
      notify();
    }
  });
  const plain = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
  const single = (snap) => (snap.exists() ? { id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) } : null);

  const stops = [
    ...watchGroup(''),
    watchList('places', collection(db, 'places'), plain),
    watchList('people', collection(db, 'people'), plain, () => { ensureOwnProfile(); ensureColor(); }),
    watchList('colors', collection(db, 'colors'), (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, d.data().uid])), ensureColor),
    watchList('nicknames', doc(db, 'nicknames', uid), (snap) => (snap.exists() && snap.data().names) || {}),
    watchList('households', collection(db, 'households'), plain, syncHouseholds),
    watchList('digest', doc(db, 'digest', 'current'), single),
    watchList('digestSwitch', doc(db, 'config', 'digest'), single),
    watchRooms('main', doc(db, 'rooms', MAIN_ROOM), true),
    watchRooms('open', query(collection(db, 'rooms'), where('open', '==', true))),
    watchRooms('mine', query(collection(db, 'rooms'), where('members', 'array-contains', session.mail))),
  ];

  // ---------- names and colors ----------

  function personByMail(mail) {
    return state.people.find((p) => p.mail === mail) || null;
  }

  /** The name as Google gave it (the part before @ if the person never signed in). */
  function realNameForMail(mail) {
    if (!mail) return '';
    const p = personByMail(mail);
    return (p && p.name) || mail.split('@')[0];
  }

  /** The name this person sees: their own nickname for someone, else the real name. */
  function nameForMail(mail) {
    if (!mail) return '';
    if (mail !== session.mail && state.nicknames[mail]) return state.nicknames[mail];
    return realNameForMail(mail);
  }

  /** Short form for tight places: the full nickname, or the first name. */
  function shortNameForMail(mail) {
    if (!mail) return '';
    if (mail !== session.mail && state.nicknames[mail]) return state.nicknames[mail];
    return firstName(realNameForMail(mail));
  }

  const mailForUid = (id) => state.people.find((x) => x.id === id)?.mail || '';
  const nameForUid = (id, fallback = '') => nameForMail(mailForUid(id)) || fallback;
  const shortNameForUid = (id, fallback = '') => shortNameForMail(mailForUid(id)) || firstName(fallback);

  /** For texts that only kept a Google name (for example "done by"): find the person by that name. */
  function nameForGoogleName(name) {
    const p = name ? state.people.find((x) => x.name === name) : null;
    return p ? nameForMail(p.mail) : name;
  }

  function colorForMail(mail) {
    const p = mail ? personByMail(mail) : null;
    return p && p.color && state.colors[p.color] === p.id ? hexOf(p.color) : NEUTRAL;
  }
  const colorForUid = (id) => colorForMail(mailForUid(id));

  /** Everyone on the allow list, with names and colors where known, sorted by name. */
  function family() {
    const access = session.access || {};
    const mails = [...new Set([...(access.admins || []), ...(access.members || [])])];
    return mails
      .map((mail) => {
        const p = personByMail(mail);
        return {
          mail, name: nameForMail(mail), realName: realNameForMail(mail), nickname: mail !== session.mail ? state.nicknames[mail] || '' : '',
          uid: p ? p.id : null, photo: p ? p.photo : '', color: colorForMail(mail), colorId: p?.color || '', me: mail === session.mail,
        };
      })
      .sort((a, b) => (b.me - a.me) || a.name.localeCompare(b.name));
  }

  /** Saves (or with an empty name removes) the nickname this person gives someone. */
  async function setNickname(mail, nickname) {
    const names = { ...state.nicknames };
    const clean = String(nickname || '').replace(/\|/g, '/').trim().slice(0, 40);
    if (clean) names[mail] = clean;
    else delete names[mail];
    await setDoc(doc(db, 'nicknames', uid), { names, updatedAt: serverTimestamp() });
  }

  const myHouseholds = () => state.households
    .filter((h) => (h.members || []).includes(session.mail))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const householdName = (id) => state.households.find((h) => h.id === id)?.name || '';

  return {
    state,
    session,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    nameForMail,
    realNameForMail,
    shortNameForMail,
    nameForUid,
    shortNameForUid,
    nameForGoogleName,
    colorForMail,
    colorForUid,
    family,
    setNickname,
    setMyColor,
    myColor: () => me()?.color || '',
    myHouseholds,
    householdName,
    stop() {
      for (const s of stops) s();
      for (const list of householdStops.values()) for (const s of list) s();
      householdStops.clear();
      listeners.clear();
    },
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
