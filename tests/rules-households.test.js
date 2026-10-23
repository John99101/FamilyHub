// Security rules tests for colors (never two people with the same color),
// private nicknames, and households (separate calendar, tasks, polls, chat
// room and weekly overview). Run with: npm run test:rules
import { describe, it, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, orderBy, limit,
  serverTimestamp, Timestamp, arrayUnion, writeBatch, setLogLevel,
} from 'firebase/firestore';

setLogLevel('silent');

const ADMIN = { uid: 'u_admin', email: 'chef@example.com', name: 'Chef Familie', picture: 'https://lh3.googleusercontent.com/a/chef' };
const ANNA = { uid: 'u_anna', email: 'anna@example.com', name: 'Anna', picture: 'https://lh3.googleusercontent.com/a/anna' };
const BEN = { uid: 'u_ben', email: 'ben@example.com', name: 'Ben', picture: 'https://lh3.googleusercontent.com/a/ben' };
const STRANGER = { uid: 'u_fremd', email: 'fremd@example.com', name: 'Fremd', picture: '' };

let env;

const dbAs = (user) => env.authenticatedContext(user.uid, {
  email: user.email, email_verified: true, name: user.name, picture: user.picture,
  firebase: { sign_in_provider: 'google.com' },
}).firestore();

const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const created = (user) => ({ createdBy: user.uid, createdByName: user.name, createdAt: serverTimestamp() });
const profile = (user, extra = {}) => ({ name: user.name, mail: user.email, photo: user.picture, updatedAt: serverTimestamp(), ...extra });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-familyhub',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'config', 'access'), { members: [ANNA.email, BEN.email], admins: [ADMIN.email] });
    await setDoc(doc(db, 'people', BEN.uid), { name: BEN.name, mail: BEN.email, photo: BEN.picture, color: 'red', updatedAt: Timestamp.now() });
    await setDoc(doc(db, 'colors', 'red'), { uid: BEN.uid });
    await setDoc(doc(db, 'households', 'h1'), { name: 'Zürich', members: [ANNA.email, ADMIN.email], updatedAt: Timestamp.now(), updatedBy: ADMIN.email });
    await setDoc(doc(db, 'households', 'h2'), { name: 'Bei Ben', members: [BEN.email], updatedAt: Timestamp.now(), updatedBy: ADMIN.email });
    await setDoc(doc(db, 'households', 'h1', 'rooms', 'main'), { name: 'Zürich', createdAt: Timestamp.now() });
    await setDoc(doc(db, 'households', 'h1', 'rooms', 'main', 'messages', 'm1'), {
      uid: ADMIN.uid, name: ADMIN.name, photo: ADMIN.picture, text: 'Hallo Zürich', createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'households', 'h1', 'events', 'e1'), {
      title: 'Elternabend', date: '2026-11-03', endDate: '', time: '19:00', place: '', note: '', kind: 'event', repeat: 'none',
      yearKnown: true, person: ANNA.email, createdBy: ANNA.uid, createdByName: ANNA.name, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'households', 'h1', 'digest', 'current'), { de: 'Text', en: 'Text', fr: 'Texte' });
    await setDoc(doc(db, 'households', 'h2', 'events', 'e2'), {
      title: 'Nur Ben', date: '2026-11-04', endDate: '', time: '', place: '', note: '', kind: 'event', repeat: 'none',
      yearKnown: true, createdBy: BEN.uid, createdByName: BEN.name, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
  });
});

// Takes a color the way the app does: the lock and the profile in one write.
function takeColor(user, color, previous) {
  const db = dbAs(user);
  const batch = writeBatch(db);
  if (previous) batch.delete(doc(db, 'colors', previous));
  batch.set(doc(db, 'colors', color), { uid: user.uid });
  batch.set(doc(db, 'people', user.uid), profile(user, { color }));
  return batch.commit();
}

describe('colors', () => {
  it('a free color can be taken, one that someone holds cannot', async () => {
    await assertSucceeds(takeColor(ANNA, 'blue'));
    await assertFails(takeColor(ANNA, 'red', 'blue'));
    await assertFails(takeColor(STRANGER, 'green'));
  });

  it('changing the color gives the old one back, so others can take it', async () => {
    await assertSucceeds(takeColor(ANNA, 'blue'));
    await assertSucceeds(takeColor(ANNA, 'green', 'blue'));
    await assertSucceeds(takeColor(ADMIN, 'blue'));
  });

  it('the profile color must be locked by the same person, and only palette colors exist', async () => {
    await assertFails(setDoc(doc(dbAs(ANNA), 'people', ANNA.uid), profile(ANNA, { color: 'red' })));
    await assertFails(setDoc(doc(dbAs(ANNA), 'people', ANNA.uid), profile(ANNA, { color: 'blue' })));
    await assertFails(takeColor(ANNA, 'rainbow'));
    await assertFails(setDoc(doc(dbAs(ANNA), 'colors', 'blue'), { uid: ANNA.uid }));
    await assertFails(setDoc(doc(dbAs(ANNA), 'colors', 'blue'), { uid: BEN.uid }));
  });

  it('updating name or photo keeps the color', async () => {
    await assertSucceeds(setDoc(doc(dbAs(BEN), 'people', BEN.uid), profile(BEN), { merge: true }));
    const snap = await getDoc(doc(dbAs(BEN), 'people', BEN.uid));
    if (snap.data().color !== 'red') throw new Error('color lost');
  });

  it('nobody frees another person\'s color, except an admin once that person left the family', async () => {
    await assertFails(deleteDoc(doc(dbAs(ANNA), 'colors', 'red')));
    await assertFails(deleteDoc(doc(dbAs(ADMIN), 'colors', 'red')));
    await assertFails(deleteDoc(doc(dbAs(BEN), 'colors', 'red'))); // Ben still uses it
    await seed((db) => setDoc(doc(db, 'config', 'access'), { members: [ANNA.email], admins: [ADMIN.email] }));
    await assertSucceeds(deleteDoc(doc(dbAs(ADMIN), 'colors', 'red')));
  });

  it('a stuck color (its holder\'s profile shows another color) can be freed by any member', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'colors', 'blue'), { uid: BEN.uid });   // Ben holds red in his profile
      await setDoc(doc(db, 'colors', 'gold'), { uid: 'u_nobody' }); // holder without a profile
    });
    await assertSucceeds(deleteDoc(doc(dbAs(ANNA), 'colors', 'blue')));
    await assertSucceeds(deleteDoc(doc(dbAs(ANNA), 'colors', 'gold')));
    await assertFails(deleteDoc(doc(dbAs(ANNA), 'colors', 'red'))); // in use by Ben
    await assertFails(deleteDoc(doc(dbAs(STRANGER), 'colors', 'red')));
  });

  it('someone who holds two colors gives the extra one back and keeps theirs', async () => {
    await seed((db) => setDoc(doc(db, 'colors', 'teal'), { uid: BEN.uid }));
    await assertSucceeds(deleteDoc(doc(dbAs(BEN), 'colors', 'teal')));
    await assertFails(deleteDoc(doc(dbAs(BEN), 'colors', 'red')));
  });

  it('everyone in the family sees who holds which color', async () => {
    await assertSucceeds(getDocs(collection(dbAs(ANNA), 'colors')));
    await assertFails(getDocs(collection(dbAs(STRANGER), 'colors')));
  });
});

describe('nicknames', () => {
  const names = (map) => ({ names: map, updatedAt: serverTimestamp() });

  it('each person keeps their own nicknames, which nobody else can read', async () => {
    await assertSucceeds(setDoc(doc(dbAs(ANNA), 'nicknames', ANNA.uid), names({ 'ben@example.com': 'Benni', 'chef@example.com': 'Papa' })));
    await assertSucceeds(getDoc(doc(dbAs(ANNA), 'nicknames', ANNA.uid)));
    await assertFails(getDoc(doc(dbAs(BEN), 'nicknames', ANNA.uid)));
    await assertFails(getDoc(doc(dbAs(ADMIN), 'nicknames', ANNA.uid)));
    await assertFails(setDoc(doc(dbAs(BEN), 'nicknames', ANNA.uid), names({ 'ben@example.com': 'Chef' })));
    await assertSucceeds(setDoc(doc(dbAs(ANNA), 'nicknames', ANNA.uid), names({})));
  });

  it('nicknames are 1 to 40 characters, for mail addresses', async () => {
    const write = (map) => setDoc(doc(dbAs(ANNA), 'nicknames', ANNA.uid), names(map));
    await assertFails(write({ 'ben@example.com': '' }));
    await assertFails(write({ 'ben@example.com': 'x'.repeat(41) }));
    await assertFails(write({ 'ben@example.com': 'Ben|Benni' }));
    await assertFails(write({ 'ben@example.com': 42 }));
    await assertFails(write({ Ben: 'Benni' }));
    await assertFails(setDoc(doc(dbAs(ANNA), 'nicknames', ANNA.uid), { names: { 'ben@example.com': 'Benni' }, updatedAt: serverTimestamp(), extra: 1 }));
  });
});

describe('households', () => {
  const household = (overrides = {}) => ({ name: 'Oma und Opa', members: [ANNA.email], updatedAt: serverTimestamp(), updatedBy: ADMIN.email, ...overrides });

  it('admins set up households; everyone sees which exist and who is in them', async () => {
    await assertSucceeds(setDoc(doc(dbAs(ADMIN), 'households', 'h3'), household()));
    await assertFails(setDoc(doc(dbAs(ANNA), 'households', 'h4'), household({ updatedBy: ANNA.email })));
    await assertFails(setDoc(doc(dbAs(ADMIN), 'households', 'h5'), household({ members: [] })));
    await assertFails(setDoc(doc(dbAs(ADMIN), 'households', 'h6'), household({ members: ['Anna'] })));
    await assertSucceeds(getDocs(collection(dbAs(BEN), 'households')));
    await assertFails(getDocs(collection(dbAs(STRANGER), 'households')));
    await assertSucceeds(updateDoc(doc(dbAs(ADMIN), 'households', 'h1'), { members: arrayUnion(BEN.email), updatedAt: serverTimestamp(), updatedBy: ADMIN.email }));
    await assertFails(deleteDoc(doc(dbAs(ANNA), 'households', 'h1')));
    await assertSucceeds(deleteDoc(doc(dbAs(ADMIN), 'households', 'h1')));
  });

  it('a household calendar is only for its members, admins included', async () => {
    await assertSucceeds(getDocs(query(collection(dbAs(ANNA), 'households', 'h1', 'events'), where('date', '>=', '2026-01-01'))));
    await assertFails(getDocs(collection(dbAs(BEN), 'households', 'h1', 'events')));
    await assertFails(getDoc(doc(dbAs(BEN), 'households', 'h1', 'events', 'e1')));
    await assertFails(getDocs(collection(dbAs(ADMIN), 'households', 'h2', 'events')));
    await assertSucceeds(getDocs(collection(dbAs(BEN), 'households', 'h2', 'events')));
    const entry = (user) => ({
      title: 'Kino', date: '2026-11-05', endDate: '', time: '', place: '', note: '', kind: 'event', repeat: 'none',
      yearKnown: true, person: '', ...created(user), updatedAt: serverTimestamp(),
    });
    await assertSucceeds(addDoc(collection(dbAs(ANNA), 'households', 'h1', 'events'), entry(ANNA)));
    await assertFails(addDoc(collection(dbAs(BEN), 'households', 'h1', 'events'), entry(BEN)));
    await assertSucceeds(updateDoc(doc(dbAs(ADMIN), 'households', 'h1', 'events', 'e1'), { time: '19:30', updatedAt: serverTimestamp() }));
  });

  it('household tasks and polls are only for its members', async () => {
    const task = (user) => ({
      title: 'Müll', note: '', assignee: '', due: '', done: false, doneAt: null, doneBy: '', ...created(user), updatedAt: serverTimestamp(),
    });
    const ref = await addDoc(collection(dbAs(ANNA), 'households', 'h1', 'tasks'), task(ANNA));
    await assertSucceeds(updateDoc(doc(dbAs(ADMIN), 'households', 'h1', 'tasks', ref.id), { done: true, doneAt: serverTimestamp(), doneBy: ADMIN.name, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(dbAs(BEN), 'households', 'h1', 'tasks', ref.id), { done: false, doneAt: null, doneBy: '', updatedAt: serverTimestamp() }));
    await assertFails(addDoc(collection(dbAs(BEN), 'households', 'h1', 'tasks'), task(BEN)));
    await assertSucceeds(getDocs(query(collection(dbAs(ANNA), 'households', 'h1', 'tasks'), where('done', '==', true), orderBy('doneAt', 'desc'), limit(20))));

    const poll = { question: 'Pizza?', options: ['Ja', 'Nein'], multi: false, closed: false, votes: {}, ...created(ANNA) };
    const p = await addDoc(collection(dbAs(ANNA), 'households', 'h1', 'polls'), poll);
    await assertSucceeds(updateDoc(doc(dbAs(ADMIN), 'households', 'h1', 'polls', p.id), { [`votes.${ADMIN.uid}`]: [0] }));
    await assertFails(updateDoc(doc(dbAs(BEN), 'households', 'h1', 'polls', p.id), { [`votes.${BEN.uid}`]: [1] }));
    await assertFails(getDocs(collection(dbAs(BEN), 'households', 'h1', 'polls')));
  });

  it('the household chat room is only for its members', async () => {
    const send = (user, extra = {}) => {
      const db = dbAs(user);
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'households', 'h1', 'rooms', 'main', 'messages')), {
        uid: user.uid, name: user.name, photo: user.picture, text: 'Bis später', createdAt: serverTimestamp(), ...extra,
      });
      batch.update(doc(db, 'households', 'h1', 'rooms', 'main'), { last: { uid: user.uid, name: user.name, text: 'Bis später', at: serverTimestamp() } });
      return batch.commit();
    };
    await assertSucceeds(send(ANNA));
    await assertSucceeds(send(ANNA, { replyTo: { id: 'm1', name: 'Chef Familie', text: 'Hallo Zürich' } }));
    await assertFails(send(ANNA, { replyTo: { id: 'missing', name: 'X', text: 'X' } }));
    await assertFails(send(BEN));
    await assertFails(getDocs(collection(dbAs(BEN), 'households', 'h1', 'rooms', 'main', 'messages')));
    await assertSucceeds(updateDoc(doc(dbAs(ANNA), 'households', 'h1', 'rooms', 'main', 'messages', 'm1'), { 'reactions.like': arrayUnion(ANNA.uid) }));
    await assertFails(updateDoc(doc(dbAs(ANNA), 'households', 'h1', 'rooms', 'main', 'messages', 'm1'), { text: 'Geändert' }));
    await assertFails(setDoc(doc(dbAs(BEN), 'households', 'h2', 'rooms', 'other'), { name: 'Neben', createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(dbAs(BEN), 'households', 'h2', 'rooms', 'main'), { name: 'Bei Ben', createdAt: serverTimestamp() }));
  });

  it('the household overview is read only, and only by its members', async () => {
    await assertSucceeds(getDoc(doc(dbAs(ANNA), 'households', 'h1', 'digest', 'current')));
    await assertFails(getDoc(doc(dbAs(BEN), 'households', 'h1', 'digest', 'current')));
    await assertFails(setDoc(doc(dbAs(ANNA), 'households', 'h1', 'digest', 'current'), { de: 'Gefälscht' }));
  });
});

describe('calendar entries for a person', () => {
  it('"for whom" is a mail address or empty', async () => {
    const entry = (person) => ({
      title: 'Zahnarzt', date: '2026-11-03', endDate: '', time: '09:00', place: '', note: '', kind: 'event', repeat: 'none',
      yearKnown: true, person, ...created(ANNA), updatedAt: serverTimestamp(),
    });
    await assertSucceeds(addDoc(collection(dbAs(ANNA), 'events'), entry(BEN.email)));
    await assertSucceeds(addDoc(collection(dbAs(ANNA), 'events'), entry('')));
    await assertFails(addDoc(collection(dbAs(ANNA), 'events'), entry('Ben')));
    await assertFails(addDoc(collection(dbAs(ANNA), 'events'), entry(42)));
  });
});
