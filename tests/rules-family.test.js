// Security rules tests for the family hub parts: people, chat rooms,
// reactions and replies, calendar, tasks, polls, recipes, contacts, places
// and the weekly overview. Run with: npm run test:rules
import { describe, it, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, orderBy, limit,
  serverTimestamp, Timestamp, arrayUnion, arrayRemove, deleteField, writeBatch, setLogLevel,
} from 'firebase/firestore';

setLogLevel('silent');

const ADMIN = { uid: 'u_admin', email: 'chef@example.com', name: 'Chef Familie', picture: 'https://lh3.googleusercontent.com/a/chef' };
const ANNA = { uid: 'u_anna', email: 'anna@example.com', name: 'Anna', picture: 'https://lh3.googleusercontent.com/a/anna' };
const BEN = { uid: 'u_ben', email: 'ben@example.com', name: 'Ben', picture: 'https://lh3.googleusercontent.com/a/ben' };
const STRANGER = { uid: 'u_fremd', email: 'fremd@example.com', name: 'Fremd', picture: '' };

let env;

const dbAs = (user, extra = {}) => env.authenticatedContext(user.uid, {
  email: user.email, email_verified: true, name: user.name, picture: user.picture,
  firebase: { sign_in_provider: 'google.com' }, ...extra,
}).firestore();

const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const created = (user) => ({ createdBy: user.uid, createdByName: user.name, createdAt: serverTimestamp() });
const seededBy = (user) => ({ createdBy: user.uid, createdByName: user.name, createdAt: Timestamp.now() });

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
    await setDoc(doc(db, 'rooms', 'familie'), { name: 'Familie', createdAt: Timestamp.now() });
    await setDoc(doc(db, 'rooms', 'familie', 'messages', 'm1'), {
      uid: BEN.uid, name: BEN.name, photo: BEN.picture, text: 'Hallo', createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'rooms', 'eltern'), { name: 'Eltern', open: false, members: [ADMIN.email, ANNA.email], ...seededBy(ANNA) });
    await setDoc(doc(db, 'rooms', 'eltern', 'messages', 'e1'), {
      uid: ANNA.uid, name: ANNA.name, photo: ANNA.picture, text: 'Geschenk für Ben?', createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'rooms', 'urlaub'), { name: 'Urlaub', open: true, members: [], ...seededBy(BEN) });
    await setDoc(doc(db, 'events', 'ev1'), validEventData(ANNA, { createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
    await setDoc(doc(db, 'tasks', 't1'), validTaskData(ANNA, { createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
    await setDoc(doc(db, 'tasks', 'tdone'), validTaskData(ANNA, {
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(), done: true, doneAt: Timestamp.now(), doneBy: 'Anna',
    }));
    await setDoc(doc(db, 'polls', 'p1'), { ...validPollData(ANNA), createdAt: Timestamp.now() });
    await setDoc(doc(db, 'polls', 'pmulti'), { ...validPollData(ANNA), multi: true, createdAt: Timestamp.now() });
    await setDoc(doc(db, 'recipes', 'r1'), validRecipeData(ANNA, { createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
    await setDoc(doc(db, 'contacts', 'c1'), validContactData(ADMIN, { updatedAt: Timestamp.now() }));
    await setDoc(doc(db, 'places', 'pl1'), { name: 'Berlin', country: 'Deutschland', lat: 52.52, lon: 13.41, ...seededBy(ANNA) });
    await setDoc(doc(db, 'digest', 'current'), { de: 'Text', en: 'Text', fr: 'Texte' });
  });
});

function validEventData(user, overrides = {}) {
  return {
    title: 'Zahnarzt', date: '2026-11-03', endDate: '', time: '09:30', place: 'Praxis', note: '',
    kind: 'event', repeat: 'none', yearKnown: true, ...created(user), updatedAt: serverTimestamp(), ...overrides,
  };
}

function validTaskData(user, overrides = {}) {
  return {
    title: 'Müll rausbringen', note: '', assignee: BEN.email, due: '2026-11-01',
    done: false, doneAt: null, doneBy: '', ...created(user), updatedAt: serverTimestamp(), ...overrides,
  };
}

function validPollData(user, overrides = {}) {
  return { question: 'Wann treffen wir uns?', options: ['Samstag', 'Sonntag', 'Montag'], multi: false, closed: false, votes: {}, ...created(user), ...overrides };
}

function validRecipeData(user, overrides = {}) {
  return {
    title: 'Omas Apfelkuchen', category: 'baking', servings: '12 Stück', duration: '90 Minuten',
    ingredients: '500 g Mehl\n4 Äpfel', steps: 'Alles mischen.', source: 'Oma',
    ...created(user), updatedAt: serverTimestamp(), ...overrides,
  };
}

function validContactData(user, overrides = {}) {
  return {
    name: 'Dr. Müller', group: 'health', phone: '+49 30 123456', phone2: '', mail: 'praxis@example.com',
    address: 'Hauptstraße 1, Berlin', note: 'Hausarzt', updatedAt: serverTimestamp(), updatedBy: user.email, ...overrides,
  };
}

// ---------- people ----------

describe('people', () => {
  const profile = (user, overrides = {}) => ({ name: user.name, mail: user.email, photo: user.picture, updatedAt: serverTimestamp(), ...overrides });

  it('members write their own profile exactly as Google gave it; everyone in the family reads it', async () => {
    await assertSucceeds(setDoc(doc(dbAs(ANNA), 'people', ANNA.uid), profile(ANNA)));
    await assertSucceeds(getDoc(doc(dbAs(BEN), 'people', ANNA.uid)));
    await assertFails(setDoc(doc(dbAs(ANNA), 'people', BEN.uid), profile(ANNA)));
    await assertFails(setDoc(doc(dbAs(ANNA), 'people', ANNA.uid), profile(ANNA, { name: 'Königin Anna' })));
    await assertFails(setDoc(doc(dbAs(ANNA), 'people', ANNA.uid), profile(ANNA, { mail: 'other@example.com' })));
    await assertFails(setDoc(doc(dbAs(ANNA), 'people', ANNA.uid), profile(ANNA, { admin: true })));
  });

  it('strangers can neither write nor read profiles', async () => {
    await assertFails(setDoc(doc(dbAs(STRANGER), 'people', STRANGER.uid), profile(STRANGER)));
    await assertFails(getDoc(doc(dbAs(STRANGER), 'people', ANNA.uid)));
  });
});

// ---------- chat rooms ----------

describe('chat rooms', () => {
  const room = (user, overrides = {}) => ({ name: 'Ausflug', open: true, members: [], ...created(user), ...overrides });

  it('members open rooms for everyone or for chosen people (always including themselves)', async () => {
    await assertSucceeds(setDoc(doc(dbAs(BEN), 'rooms', 'r_open'), room(BEN)));
    await assertSucceeds(setDoc(doc(dbAs(BEN), 'rooms', 'r_closed'), room(BEN, { open: false, members: [BEN.email, ANNA.email] })));
    await assertFails(setDoc(doc(dbAs(BEN), 'rooms', 'r_without_me'), room(BEN, { open: false, members: [ANNA.email] })));
    await assertFails(setDoc(doc(dbAs(BEN), 'rooms', 'r_long'), room(BEN, { name: 'x'.repeat(41) })));
    await assertFails(setDoc(doc(dbAs(BEN), 'rooms', 'r_badmail'), room(BEN, { open: false, members: [BEN.email, 'Anna@Example.com'] })));
    await assertFails(setDoc(doc(dbAs(BEN), 'rooms', 'r_other'), room(BEN, { createdBy: ANNA.uid })));
    await assertFails(setDoc(doc(dbAs(BEN), 'rooms', 'r_last'), room(BEN, { last: { uid: BEN.uid, name: BEN.name, text: 'x', at: serverTimestamp() } })));
    await assertFails(setDoc(doc(dbAs(STRANGER), 'rooms', 'r_x'), room(STRANGER)));
  });

  it('the room list works with the two queries the app uses (open rooms, rooms I am in)', async () => {
    await assertSucceeds(getDocs(query(collection(dbAs(BEN), 'rooms'), where('open', '==', true))));
    await assertSucceeds(getDocs(query(collection(dbAs(BEN), 'rooms'), where('members', 'array-contains', BEN.email))));
    // Asking for all rooms at once is refused, because closed rooms of others would be in it.
    await assertFails(getDocs(collection(dbAs(BEN), 'rooms')));
  });

  it('a closed room and its messages are only for the people in it', async () => {
    await assertSucceeds(getDoc(doc(dbAs(ANNA), 'rooms', 'eltern')));
    await assertSucceeds(getDocs(collection(dbAs(ANNA), 'rooms', 'eltern', 'messages')));
    await assertFails(getDoc(doc(dbAs(BEN), 'rooms', 'eltern')));
    await assertFails(getDocs(collection(dbAs(BEN), 'rooms', 'eltern', 'messages')));
    await assertFails(getDoc(doc(dbAs(BEN), 'rooms', 'eltern', 'messages', 'e1')));
    await assertFails(addDoc(collection(dbAs(BEN), 'rooms', 'eltern', 'messages'), {
      uid: BEN.uid, name: BEN.name, photo: BEN.picture, text: 'Hallo?', createdAt: serverTimestamp(),
    }));
  });

  it('only the person who set up a room renames it or changes who is in it', async () => {
    await assertSucceeds(updateDoc(doc(dbAs(ANNA), 'rooms', 'eltern'), { name: 'Eltern und Oma', members: arrayUnion(BEN.email) }));
    await assertFails(updateDoc(doc(dbAs(ADMIN), 'rooms', 'eltern'), { name: 'Neu' }));
    await assertFails(updateDoc(doc(dbAs(BEN), 'rooms', 'urlaub'), { createdBy: ANNA.uid }));
    await assertFails(updateDoc(doc(dbAs(ANNA), 'rooms', 'urlaub'), { name: 'Meins' }));
    await assertFails(updateDoc(doc(dbAs(ANNA), 'rooms', 'eltern'), { members: [ADMIN.email] }));
    await assertFails(updateDoc(doc(dbAs(ADMIN), 'rooms', 'familie'), { name: 'Anders' }));
  });

  it('creator or admin deletes a room; the main room cannot be deleted', async () => {
    await assertFails(deleteDoc(doc(dbAs(ANNA), 'rooms', 'urlaub')));
    await assertSucceeds(deleteDoc(doc(dbAs(BEN), 'rooms', 'urlaub')));
    await assertSucceeds(deleteDoc(doc(dbAs(ADMIN), 'rooms', 'eltern')));
    await assertFails(deleteDoc(doc(dbAs(ADMIN), 'rooms', 'familie')));
  });

  it('a message and the room preview are written together; the preview must be honest', async () => {
    const send = (user, roomId, last) => {
      const db = dbAs(user);
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'rooms', roomId, 'messages')), {
        uid: user.uid, name: user.name, photo: user.picture, text: 'Bin unterwegs', createdAt: serverTimestamp(),
      });
      batch.update(doc(db, 'rooms', roomId), { last });
      return batch.commit();
    };
    const last = (user, overrides = {}) => ({ uid: user.uid, name: user.name, text: 'Bin unterwegs', at: serverTimestamp(), ...overrides });
    await assertSucceeds(send(BEN, 'familie', last(BEN)));
    await assertSucceeds(send(ANNA, 'eltern', last(ANNA)));
    await assertSucceeds(send(BEN, 'urlaub', last(BEN)));
    await assertFails(send(BEN, 'familie', last(BEN, { name: 'Anna' })));
    await assertFails(send(BEN, 'familie', last(BEN, { text: 'x'.repeat(121) })));
    await assertFails(send(BEN, 'familie', last(BEN, { at: Timestamp.now() })));
    await assertFails(send(BEN, 'eltern', last(BEN)));
  });
});

// ---------- replies and reactions ----------

describe('replies and reactions', () => {
  const msg = (overrides = {}) => ({ uid: ANNA.uid, name: ANNA.name, photo: ANNA.picture, text: 'Ja!', createdAt: serverTimestamp(), ...overrides });
  const familie = (db) => collection(db, 'rooms', 'familie', 'messages');

  it('a reply points to an existing message in the same room', async () => {
    await assertSucceeds(addDoc(familie(dbAs(ANNA)), msg({ replyTo: { id: 'm1', name: 'Ben', text: 'Hallo' } })));
    await assertFails(addDoc(familie(dbAs(ANNA)), msg({ replyTo: { id: 'missing', name: 'Ben', text: 'Hallo' } })));
    await assertFails(addDoc(familie(dbAs(ANNA)), msg({ replyTo: { id: 'm1', name: 'Ben', text: 'x'.repeat(141) } })));
    await assertFails(addDoc(familie(dbAs(ANNA)), msg({ replyTo: { id: 'm1', name: 'Ben', text: 'Hallo', extra: 1 } })));
    await assertFails(addDoc(familie(dbAs(ANNA)), msg({ replyTo: 'm1' })));
  });

  it('members add and take back their own reactions', async () => {
    const ref = (user) => doc(dbAs(user), 'rooms', 'familie', 'messages', 'm1');
    await assertSucceeds(updateDoc(ref(ANNA), { 'reactions.like': arrayUnion(ANNA.uid) }));
    await assertSucceeds(updateDoc(ref(ADMIN), { 'reactions.like': arrayUnion(ADMIN.uid) }));
    await assertSucceeds(updateDoc(ref(ANNA), { 'reactions.love': arrayUnion(ANNA.uid) }));
    await assertSucceeds(updateDoc(ref(ANNA), { 'reactions.like': arrayRemove(ANNA.uid) }));
    const after = await getDoc(ref(ANNA));
    if (JSON.stringify(after.data().reactions) !== JSON.stringify({ like: [ADMIN.uid], love: [ANNA.uid] })
      && JSON.stringify(after.data().reactions) !== JSON.stringify({ love: [ANNA.uid], like: [ADMIN.uid] })) {
      throw new Error(`unexpected reactions ${JSON.stringify(after.data().reactions)}`);
    }
  });

  it('nobody reacts for someone else, uses unknown reactions, or changes the text with it', async () => {
    const ref = doc(dbAs(ANNA), 'rooms', 'familie', 'messages', 'm1');
    await assertFails(updateDoc(ref, { 'reactions.like': arrayUnion(BEN.uid) }));
    await assertFails(updateDoc(ref, { 'reactions.like': [ANNA.uid, ANNA.uid] }));
    await assertFails(updateDoc(ref, { 'reactions.angry': arrayUnion(ANNA.uid) }));
    await assertFails(updateDoc(ref, { 'reactions.like': arrayUnion(ANNA.uid), text: 'Geändert' }));
    await assertFails(updateDoc(doc(dbAs(BEN), 'rooms', 'eltern', 'messages', 'e1'), { 'reactions.like': arrayUnion(BEN.uid) }));
    await assertFails(updateDoc(doc(dbAs(STRANGER), 'rooms', 'familie', 'messages', 'm1'), { 'reactions.like': arrayUnion(STRANGER.uid) }));
  });

  it('removing someone else\'s reaction is refused', async () => {
    await seed((db) => updateDoc(doc(db, 'rooms', 'familie', 'messages', 'm1'), { reactions: { like: [BEN.uid] } }));
    await assertFails(updateDoc(doc(dbAs(ANNA), 'rooms', 'familie', 'messages', 'm1'), { 'reactions.like': arrayRemove(BEN.uid) }));
    await assertFails(updateDoc(doc(dbAs(ANNA), 'rooms', 'familie', 'messages', 'm1'), { reactions: deleteField() }));
  });
});

// ---------- calendar ----------

describe('calendar', () => {
  const add = (user, overrides) => setDoc(doc(dbAs(user), 'events', `e_${Math.random().toString(36).slice(2)}`), validEventData(user, overrides));

  it('members add appointments and birthdays', async () => {
    await assertSucceeds(add(BEN));
    await assertSucceeds(add(BEN, { time: '', endDate: '2026-11-07', title: 'Besuch bei Oma' }));
    await assertSucceeds(add(BEN, { kind: 'birthday', repeat: 'yearly', time: '', title: 'Oma', date: '1950-05-12' }));
    await assertSucceeds(add(BEN, { kind: 'birthday', repeat: 'yearly', time: '', title: 'Onkel Paul', date: '2000-02-29', yearKnown: false }));
    await assertSucceeds(add(BEN, { repeat: 'yearly', time: '', title: 'Hochzeitstag', date: '2001-06-30' }));
    await assertFails(add(STRANGER));
  });

  it('wrong calendar entries are refused', async () => {
    await assertFails(add(BEN, { title: '' }));
    await assertFails(add(BEN, { title: 'x'.repeat(101) }));
    await assertFails(add(BEN, { date: '3.11.2026' }));
    await assertFails(add(BEN, { date: '2026-13-01' }));
    await assertFails(add(BEN, { endDate: '2026-11-01' }));
    await assertFails(add(BEN, { time: '25:00' }));
    await assertFails(add(BEN, { kind: 'birthday', repeat: 'none', time: '' }));
    await assertFails(add(BEN, { kind: 'birthday', repeat: 'yearly', time: '10:00' }));
    await assertFails(add(BEN, { repeat: 'yearly', endDate: '2026-11-05' }));
    await assertFails(add(BEN, { kind: 'holiday' }));
    await assertFails(add(BEN, { createdBy: ANNA.uid }));
    await assertFails(add(BEN, { createdByName: 'Anna' }));
    await assertFails(add(BEN, { extra: true }));
  });

  it('creator or admin change and delete an entry; others only read', async () => {
    const ref = (user) => doc(dbAs(user), 'events', 'ev1');
    await assertSucceeds(getDoc(ref(BEN)));
    await assertFails(updateDoc(ref(BEN), { title: 'Mein Termin', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref(BEN)));
    await assertSucceeds(updateDoc(ref(ANNA), { title: 'Zahnarzt Tim', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(ANNA), { createdBy: BEN.uid, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref(ADMIN), { time: '10:00', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref(ADMIN)));
  });

  it('the calendar queries the app uses are allowed', async () => {
    const events = collection(dbAs(BEN), 'events');
    await assertSucceeds(getDocs(query(events, where('date', '>=', '2026-09-01'))));
    await assertSucceeds(getDocs(query(events, where('repeat', '==', 'yearly'))));
  });
});

// ---------- tasks ----------

describe('tasks', () => {
  const ref = (user, id = 't1') => doc(dbAs(user), 'tasks', id);

  it('members add tasks for themselves, someone on the list, or nobody', async () => {
    await assertSucceeds(setDoc(ref(BEN, 'new1'), validTaskData(BEN)));
    await assertSucceeds(setDoc(ref(BEN, 'new2'), validTaskData(BEN, { assignee: '', due: '' })));
    await assertFails(setDoc(ref(BEN, 'new3'), validTaskData(BEN, { assignee: 'Ben' })));
    await assertFails(setDoc(ref(BEN, 'new4'), validTaskData(BEN, { done: true, doneAt: serverTimestamp(), doneBy: 'Ben' })));
    await assertFails(setDoc(ref(BEN, 'new5'), validTaskData(BEN, { title: '   ' })));
    await assertFails(setDoc(ref(BEN, 'new6'), validTaskData(BEN, { due: 'morgen' })));
    await assertFails(setDoc(ref(STRANGER, 'new7'), validTaskData(STRANGER)));
  });

  it('everyone ticks a task as done (with their own name and the server time) or unticks it', async () => {
    await assertSucceeds(updateDoc(ref(BEN), { done: true, doneAt: serverTimestamp(), doneBy: 'Ben', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref(ADMIN), { done: false, doneAt: null, doneBy: '', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(BEN), { done: true, doneAt: serverTimestamp(), doneBy: 'Anna', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(BEN), { done: true, doneAt: Timestamp.now(), doneBy: 'Ben', updatedAt: serverTimestamp() }));
  });

  it('only creator or admin change the task itself', async () => {
    await assertFails(updateDoc(ref(BEN), { title: 'Etwas anderes', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(BEN), { done: true, doneAt: serverTimestamp(), doneBy: 'Ben', title: 'X', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref(ANNA), { title: 'Altpapier rausbringen', assignee: ANNA.email, updatedAt: serverTimestamp() }));
  });

  it('open tasks are deleted by creator or admin; done tasks by anyone', async () => {
    await assertFails(deleteDoc(ref(BEN)));
    await assertSucceeds(deleteDoc(ref(BEN, 'tdone')));
    await assertSucceeds(deleteDoc(ref(ADMIN)));
  });

  it('the task queries the app uses are allowed', async () => {
    const tasks = collection(dbAs(BEN), 'tasks');
    await assertSucceeds(getDocs(query(tasks, where('done', '==', false))));
    await assertSucceeds(getDocs(query(tasks, where('done', '==', true), orderBy('doneAt', 'desc'), limit(20))));
  });
});

// ---------- polls ----------

describe('polls', () => {
  const ref = (user, id = 'p1') => doc(dbAs(user), 'polls', id);
  const vote = (user, choice, id = 'p1') => updateDoc(ref(user, id), { [`votes.${user.uid}`]: choice });

  it('members start polls with 2 to 10 different answers', async () => {
    await assertSucceeds(setDoc(ref(BEN, 'new'), validPollData(BEN)));
    await assertSucceeds(setDoc(ref(BEN, 'ten'), validPollData(BEN, { options: Array.from({ length: 10 }, (_, i) => `Antwort ${i + 1}`) })));
    await assertFails(setDoc(ref(BEN, 'one'), validPollData(BEN, { options: ['Ja'] })));
    await assertFails(setDoc(ref(BEN, 'eleven'), validPollData(BEN, { options: Array.from({ length: 11 }, (_, i) => `A${i}`) })));
    await assertFails(setDoc(ref(BEN, 'dupe'), validPollData(BEN, { options: ['Ja', 'Ja'] })));
    await assertFails(setDoc(ref(BEN, 'empty'), validPollData(BEN, { options: ['Ja', ''] })));
    await assertFails(setDoc(ref(BEN, 'pipe'), validPollData(BEN, { options: ['Ja|Nein', 'Vielleicht'] })));
    await assertFails(setDoc(ref(BEN, 'votes'), validPollData(BEN, { votes: { [BEN.uid]: [0] } })));
    await assertFails(setDoc(ref(BEN, 'closed'), validPollData(BEN, { closed: true })));
  });

  it('everyone votes, changes and takes back only their own vote', async () => {
    await assertSucceeds(vote(BEN, [1]));
    await assertSucceeds(vote(BEN, [2]));
    await assertSucceeds(vote(ANNA, [0]));
    await assertSucceeds(updateDoc(ref(BEN), { [`votes.${BEN.uid}`]: deleteField() }));
    await assertFails(updateDoc(ref(BEN), { [`votes.${ANNA.uid}`]: [1] }));
    await assertFails(updateDoc(ref(BEN), { [`votes.${ANNA.uid}`]: deleteField() }));
    await assertFails(updateDoc(ref(STRANGER), { [`votes.${STRANGER.uid}`]: [0] }));
  });

  it('a vote must name existing answers, one unless several are allowed', async () => {
    await assertFails(vote(BEN, [3]));
    await assertFails(vote(BEN, [-1]));
    await assertFails(vote(BEN, []));
    await assertFails(vote(BEN, [0, 1]));
    await assertFails(vote(BEN, ['0']));
    await assertSucceeds(vote(BEN, [0, 2], 'pmulti'));
    await assertFails(vote(BEN, [0, 0], 'pmulti'));
  });

  it('creator or admin close a poll; then nobody can vote', async () => {
    await assertFails(updateDoc(ref(BEN), { closed: true }));
    await assertFails(updateDoc(ref(ANNA), { question: 'Neu?' }));
    await assertSucceeds(updateDoc(ref(ANNA), { closed: true }));
    await assertFails(vote(BEN, [0]));
    await assertSucceeds(updateDoc(ref(ADMIN), { closed: false }));
    await assertFails(deleteDoc(ref(BEN)));
    await assertSucceeds(deleteDoc(ref(ANNA)));
  });
});

// ---------- recipes, contacts, places, overview ----------

describe('recipes', () => {
  it('members add recipes; creator or admin change and delete them', async () => {
    await assertSucceeds(setDoc(doc(dbAs(BEN), 'recipes', 'new'), validRecipeData(BEN)));
    await assertFails(setDoc(doc(dbAs(BEN), 'recipes', 'bad'), validRecipeData(BEN, { category: 'snack' })));
    await assertFails(setDoc(doc(dbAs(BEN), 'recipes', 'long'), validRecipeData(BEN, { steps: 'x'.repeat(8001) })));
    await assertFails(updateDoc(doc(dbAs(BEN), 'recipes', 'r1'), { title: 'Bens Kuchen', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(dbAs(ANNA), 'recipes', 'r1'), { servings: '16 Stück', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(dbAs(BEN), 'recipes', 'r1')));
    await assertSucceeds(deleteDoc(doc(dbAs(ADMIN), 'recipes', 'r1')));
    await assertFails(getDoc(doc(dbAs(STRANGER), 'recipes', 'r1')));
  });
});

describe('contacts and emergency info', () => {
  it('everyone in the family reads, only admins write', async () => {
    await assertSucceeds(getDocs(collection(dbAs(BEN), 'contacts')));
    await assertFails(getDocs(collection(dbAs(STRANGER), 'contacts')));
    await assertFails(setDoc(doc(dbAs(BEN), 'contacts', 'new'), validContactData(BEN)));
    await assertFails(updateDoc(doc(dbAs(BEN), 'contacts', 'c1'), { phone: '+49 30 999999', updatedAt: serverTimestamp(), updatedBy: BEN.email }));
    await assertFails(deleteDoc(doc(dbAs(BEN), 'contacts', 'c1')));
    await assertSucceeds(setDoc(doc(dbAs(ADMIN), 'contacts', 'new'), validContactData(ADMIN)));
    await assertSucceeds(updateDoc(doc(dbAs(ADMIN), 'contacts', 'c1'), { phone: '030 999 999', updatedAt: serverTimestamp(), updatedBy: ADMIN.email }));
    await assertSucceeds(deleteDoc(doc(dbAs(ADMIN), 'contacts', 'c1')));
  });

  it('phone numbers, mail and group are checked', async () => {
    const add = (overrides) => setDoc(doc(dbAs(ADMIN), 'contacts', 'x'), validContactData(ADMIN, overrides));
    await assertFails(add({ phone: 'javascript:alert(1)' }));
    await assertFails(add({ phone2: '0'.repeat(41) }));
    await assertFails(add({ mail: 'not a mail' }));
    await assertFails(add({ group: 'secret' }));
    await assertFails(add({ updatedBy: ANNA.email }));
    await assertSucceeds(add({ mail: '', phone: '' }));
  });
});

describe('places for the weather', () => {
  const place = (user, overrides = {}) => ({ name: 'Paris', country: 'France', lat: 48.85, lon: 2.35, ...created(user), ...overrides });

  it('members add places with valid coordinates; creator or admin remove them', async () => {
    await assertSucceeds(setDoc(doc(dbAs(BEN), 'places', 'new'), place(BEN)));
    await assertSucceeds(setDoc(doc(dbAs(BEN), 'places', 'int'), place(BEN, { lat: 48, lon: 2 })));
    await assertFails(setDoc(doc(dbAs(BEN), 'places', 'lat'), place(BEN, { lat: 91 })));
    await assertFails(setDoc(doc(dbAs(BEN), 'places', 'lon'), place(BEN, { lon: '2.35' })));
    await assertFails(updateDoc(doc(dbAs(ANNA), 'places', 'pl1'), { name: 'Hamburg' }));
    await assertFails(deleteDoc(doc(dbAs(BEN), 'places', 'pl1')));
    await assertSucceeds(deleteDoc(doc(dbAs(ANNA), 'places', 'pl1')));
  });
});

describe('weekly overview', () => {
  it('members read the overview; nobody writes it from the app; admins switch it', async () => {
    await assertSucceeds(getDoc(doc(dbAs(BEN), 'digest', 'current')));
    await assertFails(getDoc(doc(dbAs(STRANGER), 'digest', 'current')));
    await assertFails(setDoc(doc(dbAs(ADMIN), 'digest', 'current'), { de: 'Gefälscht' }));
    const sw = (user, overrides = {}) => setDoc(doc(dbAs(user), 'config', 'digest'), {
      enabled: false, updatedAt: serverTimestamp(), updatedBy: user.email, ...overrides,
    });
    await assertFails(sw(BEN));
    await assertFails(sw(ADMIN, { enabled: 'no' }));
    await assertSucceeds(sw(ADMIN));
    await assertSucceeds(getDoc(doc(dbAs(BEN), 'config', 'digest')));
  });
});
