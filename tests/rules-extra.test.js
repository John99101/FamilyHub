// Security rules tests for visible names, chat translations, trips, the
// notice board and notebook, the family tree and the question of the day.
// Run with: npm run test:rules
import { describe, it, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, serverTimestamp, Timestamp,
  writeBatch, deleteField, setLogLevel,
} from 'firebase/firestore';
import { GROUP, seedGroup } from './group-seed.js';

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
const seededBy = (user) => ({ createdBy: user.uid, createdByName: user.name, createdAt: Timestamp.now() });
const profile = (user, extra = {}) => ({ name: user.name, mail: user.email, photo: user.picture, updatedAt: serverTimestamp(), ...extra });
const msg = (user, text) => ({ uid: user.uid, name: user.name, photo: user.picture, text, createdAt: Timestamp.now() });

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
    await seedGroup(db, { admins: [ADMIN], members: [ANNA, BEN] });
    await setDoc(doc(db, 'groups', GROUP, 'people', BEN.uid), { name: BEN.name, mail: BEN.email, photo: BEN.picture, displayName: 'Benni', updatedAt: Timestamp.now() });
    await setDoc(doc(db, 'groups', GROUP, 'names', 'Benni'), { uid: BEN.uid });
    await setDoc(doc(db, 'groups', GROUP, 'rooms', 'familie'), { name: 'Familie', createdAt: Timestamp.now() });
    await setDoc(doc(db, 'groups', GROUP, 'rooms', 'familie', 'messages', 'm1'), msg(BEN, 'Hello everyone'));
    await setDoc(doc(db, 'groups', GROUP, 'rooms', 'eltern'), { name: 'Eltern', open: false, members: [ADMIN.email, ANNA.email], ...seededBy(ANNA) });
    await setDoc(doc(db, 'groups', GROUP, 'rooms', 'eltern', 'messages', 'e1'), msg(ANNA, 'Secret'));
    await setDoc(doc(db, 'groups', GROUP, 'households', 'h1'), { name: 'Zürich', members: [ANNA.email], updatedAt: Timestamp.now(), updatedBy: ADMIN.email });
    await setDoc(doc(db, 'groups', GROUP, 'households', 'h1', 'rooms', 'main'), { name: 'Zürich', createdAt: Timestamp.now() });
    await setDoc(doc(db, 'groups', GROUP, 'households', 'h1', 'rooms', 'main', 'messages', 'z1'), msg(ANNA, 'Brot?'));
    await setDoc(doc(db, 'groups', GROUP, 'trips', 'trip1'), {
      title: 'Bretagne', destination: 'Quiberon', start: '2027-07-10', end: '2027-07-20', people: [ANNA.email, BEN.email], note: '',
      ...seededBy(ANNA), updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'groups', GROUP, 'tree', 'p1'), {
      name: 'Oma Erika', birthYear: 1946, deathYear: null, mail: '', parents: [], partners: [], birthdayId: '', note: '',
      ...seededBy(ANNA), updatedAt: Timestamp.now(), updatedBy: ANNA.uid,
    });
    await setDoc(doc(db, 'groups', GROUP, 'days', '2026-10-23', 'answers', BEN.uid), { text: 'Das Fußballspiel', name: BEN.name, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  });
});

// ---------- visible names ----------

function takeName(user, name, previous) {
  const db = dbAs(user);
  const batch = writeBatch(db);
  if (previous) batch.delete(doc(db, 'groups', GROUP, 'names', previous));
  batch.set(doc(db, 'groups', GROUP, 'names', name), { uid: user.uid });
  batch.set(doc(db, 'groups', GROUP, 'people', user.uid), profile(user, { displayName: name }), { merge: true });
  return batch.commit();
}

describe('visible names', () => {
  it('a free name can be chosen, one someone uses cannot', async () => {
    await assertSucceeds(takeName(ANNA, 'Mama Anna'));
    await assertFails(takeName(ADMIN, 'Benni'));
    await assertFails(takeName(ADMIN, 'Mama Anna'));
    await assertFails(takeName(STRANGER, 'Fremder'));
  });

  it('names are 1 to 40 characters without "/" or "|" and without spaces at the ends', async () => {
    // "a/b" cannot even become a document ID, so a profile with it is refused.
    await assertFails(setDoc(doc(dbAs(ANNA), 'groups', GROUP, 'people', ANNA.uid), profile(ANNA, { displayName: 'a/b' })));
    await assertFails(takeName(ANNA, ' Anna'));
    await assertFails(takeName(ANNA, 'Anna '));
    await assertFails(takeName(ANNA, '.Anna'));
    await assertFails(takeName(ANNA, 'A|B'));
    await assertFails(takeName(ANNA, 'x'.repeat(41)));
    await assertSucceeds(takeName(ANNA, 'Grand-maman Anna 🌻'));
  });

  it('the profile name must be locked by the same person', async () => {
    await assertFails(setDoc(doc(dbAs(ANNA), 'groups', GROUP, 'people', ANNA.uid), profile(ANNA, { displayName: 'Benni' })));
    await assertFails(setDoc(doc(dbAs(ANNA), 'groups', GROUP, 'people', ANNA.uid), profile(ANNA, { displayName: 'Ohne Schloss' })));
    await assertFails(setDoc(doc(dbAs(ANNA), 'groups', GROUP, 'names', 'Anna'), { uid: ANNA.uid }));
  });

  it('changing the name gives the old one back; going back to the Google name too', async () => {
    await assertSucceeds(takeName(ANNA, 'Mama'));
    await assertSucceeds(takeName(ANNA, 'Mami', 'Mama'));
    await assertSucceeds(takeName(ADMIN, 'Mama'));
    const db = dbAs(ANNA);
    const batch = writeBatch(db);
    batch.delete(doc(db, 'groups', GROUP, 'names', 'Mami'));
    batch.set(doc(db, 'groups', GROUP, 'people', ANNA.uid), profile(ANNA, { displayName: deleteField() }), { merge: true });
    await assertSucceeds(batch.commit());
  });

  it('nobody frees a name in use; a stuck name can be freed by any member', async () => {
    await assertFails(deleteDoc(doc(dbAs(ANNA), 'groups', GROUP, 'names', 'Benni')));
    await seed((db) => setDoc(doc(db, 'groups', GROUP, 'names', 'Alter Name'), { uid: BEN.uid }));
    await assertSucceeds(deleteDoc(doc(dbAs(ANNA), 'groups', GROUP, 'names', 'Alter Name')));
  });
});

// ---------- translations ----------

const request = (user, overrides = {}) => {
  const d = { household: '', roomId: 'familie', messageId: 'm1', lang: 'en', uid: user.uid, createdAt: serverTimestamp(), status: 'pending', ...overrides };
  return { id: `t_${d.household}_${d.roomId}_${d.messageId}_${d.lang}`, data: d };
};
const ask = (user, overrides, id) => {
  const r = request(user, overrides);
  return setDoc(doc(dbAs(user), 'groups', GROUP, 'translations', id || r.id), r.data);
};

describe('chat translations', () => {
  it('a member asks for a translation of a message they can read', async () => {
    await assertSucceeds(ask(ANNA));
    await assertSucceeds(ask(ANNA, { roomId: 'eltern', messageId: 'e1', lang: 'fr' }));
    await assertSucceeds(ask(ANNA, { household: 'h1', roomId: 'main', messageId: 'z1', lang: 'de' }));
  });

  it('nobody asks for messages they cannot read, missing messages, or with a wrong ID', async () => {
    await assertFails(ask(BEN, { roomId: 'eltern', messageId: 'e1' }));
    await assertFails(ask(BEN, { household: 'h1', roomId: 'main', messageId: 'z1' }));
    await assertFails(ask(ANNA, { messageId: 'missing' }));
    await assertFails(ask(ANNA, {}, 'my_own_id'));
    await assertFails(ask(ANNA, { lang: 'it' }));
    await assertFails(ask(ANNA, { status: 'done' }));
    await assertFails(ask(ANNA, { uid: BEN.uid }));
    await assertFails(ask(STRANGER));
  });

  it('only people who can read the message read its translation; the app never writes the result', async () => {
    await seed((db) => setDoc(doc(db, 'groups', GROUP, 'translations', 't__eltern_e1_en'), {
      household: '', roomId: 'eltern', messageId: 'e1', lang: 'en', uid: ANNA.uid, createdAt: Timestamp.now(), status: 'done', text: 'Secret',
    }));
    await assertSucceeds(getDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'translations', 't__eltern_e1_en')));
    await assertFails(getDoc(doc(dbAs(BEN), 'groups', GROUP, 'translations', 't__eltern_e1_en')));
    // Waiting for a translation that does not exist yet is fine; listing them never is.
    await assertSucceeds(getDoc(doc(dbAs(BEN), 'groups', GROUP, 'translations', 't__familie_m1_fr')));
    await assertFails(getDocs(collection(dbAs(ADMIN), 'groups', GROUP, 'translations')));
    await assertFails(getDoc(doc(dbAs(STRANGER), 'groups', GROUP, 'translations', 't__familie_m1_fr')));
    await assertFails(updateDoc(doc(dbAs(ANNA), 'groups', GROUP, 'translations', 't__eltern_e1_en'), { text: 'Fake' }));
  });

  it('a translation goes with its message; a failed one may be removed to try again', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'groups', GROUP, 'translations', 't__familie_m1_de'), { household: '', roomId: 'familie', messageId: 'm1', lang: 'de', uid: ANNA.uid, createdAt: Timestamp.now(), status: 'done', text: 'Hallo' });
      await setDoc(doc(db, 'groups', GROUP, 'translations', 't__familie_m1_fr'), { household: '', roomId: 'familie', messageId: 'm1', lang: 'fr', uid: ANNA.uid, createdAt: Timestamp.now(), status: 'error' });
    });
    await assertFails(deleteDoc(doc(dbAs(ANNA), 'groups', GROUP, 'translations', 't__familie_m1_de')));
    await assertSucceeds(deleteDoc(doc(dbAs(ANNA), 'groups', GROUP, 'translations', 't__familie_m1_fr')));
    const db = dbAs(BEN);
    const batch = writeBatch(db);
    batch.delete(doc(db, 'groups', GROUP, 'rooms', 'familie', 'messages', 'm1'));
    batch.delete(doc(db, 'groups', GROUP, 'translations', 't__familie_m1_de'));
    await assertSucceeds(batch.commit());
  });

  it('admins switch translations off; then nobody can ask', async () => {
    await assertFails(setDoc(doc(dbAs(ANNA), 'groups', GROUP, 'config', 'translate'), { enabled: false, updatedAt: serverTimestamp(), updatedBy: ANNA.email }));
    await assertSucceeds(setDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'config', 'translate'), { enabled: false, updatedAt: serverTimestamp(), updatedBy: ADMIN.email }));
    await assertFails(ask(ANNA));
  });
});

// ---------- trips ----------

describe('trips', () => {
  const trip = (user, overrides = {}) => ({
    title: 'Ski', destination: 'Arosa', start: '2027-02-01', end: '2027-02-07', people: [user.email], note: '',
    ...created(user), updatedAt: serverTimestamp(), ...overrides,
  });
  const item = (user, overrides = {}) => ({
    kind: 'travel', date: '2027-07-10', endDate: '', time: '08:15', title: 'Zug nach Quiberon', place: 'Zürich HB', note: '',
    ...created(user), updatedAt: serverTimestamp(), ...overrides,
  });

  it('members plan trips with dates, people, days, stays and journeys', async () => {
    await assertSucceeds(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'trips'), trip(BEN)));
    await assertFails(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'trips'), trip(BEN, { end: '2027-01-31' })));
    await assertFails(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'trips'), trip(BEN, { people: ['Ben'] })));
    await assertSucceeds(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'trips', 'trip1', 'items'), item(BEN)));
    await assertSucceeds(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'trips', 'trip1', 'items'), item(BEN, { kind: 'stay', date: '2027-07-10', endDate: '2027-07-20', time: '', title: 'Ferienhaus' })));
    await assertSucceeds(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'trips', 'trip1', 'items'), item(BEN, { kind: 'day', time: '', title: 'Strandtag' })));
    await assertFails(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'trips', 'trip1', 'items'), item(BEN, { kind: 'party' })));
    await assertFails(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'trips', 'nope', 'items'), item(BEN)));
    await assertFails(getDocs(collection(dbAs(STRANGER), 'groups', GROUP, 'trips')));
  });

  it('the trip creator deletes the trip with everything in it; others cannot', async () => {
    const ref = await addDoc(collection(dbAs(BEN), 'groups', GROUP, 'trips', 'trip1', 'items'), item(BEN));
    await assertFails(deleteDoc(doc(dbAs(BEN), 'groups', GROUP, 'trips', 'trip1')));
    const db = dbAs(ANNA);
    const batch = writeBatch(db);
    batch.delete(doc(db, 'groups', GROUP, 'trips', 'trip1', 'items', ref.id));
    batch.delete(doc(db, 'groups', GROUP, 'trips', 'trip1'));
    await assertSucceeds(batch.commit());
  });

  it('a household trip is only for the household', async () => {
    await assertSucceeds(addDoc(collection(dbAs(ANNA), 'groups', GROUP, 'households', 'h1', 'trips'), trip(ANNA)));
    await assertFails(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'households', 'h1', 'trips'), trip(BEN)));
    await assertFails(getDocs(collection(dbAs(BEN), 'groups', GROUP, 'households', 'h1', 'trips')));
  });
});

// ---------- notice board and notebook ----------

describe('notice board and notebook', () => {
  const notice = (user, overrides = {}) => ({ text: 'Müllabfuhr am Dienstag', until: '2026-10-30', ...created(user), updatedAt: serverTimestamp(), ...overrides });
  const note = (user, overrides = {}) => ({
    title: 'Heizung entlüften', body: 'Schlüssel im Werkzeugkasten.', ...created(user), updatedAt: serverTimestamp(),
    updatedBy: user.uid, updatedByName: user.name, ...overrides,
  });

  it('members pin notices; only creator or admin change or remove them', async () => {
    const ref = await addDoc(collection(dbAs(ANNA), 'groups', GROUP, 'notices'), notice(ANNA));
    await assertSucceeds(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'notices'), notice(BEN, { until: '' })));
    await assertFails(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'notices'), notice(BEN, { until: 'Dienstag' })));
    await assertFails(addDoc(collection(dbAs(BEN), 'groups', GROUP, 'notices'), notice(BEN, { text: 'x'.repeat(301) })));
    await assertFails(updateDoc(doc(dbAs(BEN), 'groups', GROUP, 'notices', ref.id), { text: 'Anders', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(dbAs(BEN), 'groups', GROUP, 'notices', ref.id)));
    await assertSucceeds(deleteDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'notices', ref.id)));
  });

  it('anyone improves a notebook page under their own name; only creator or admin delete it', async () => {
    const ref = await addDoc(collection(dbAs(ANNA), 'groups', GROUP, 'notes'), note(ANNA));
    await assertSucceeds(updateDoc(doc(dbAs(BEN), 'groups', GROUP, 'notes', ref.id), { body: 'Schlüssel liegt im Keller.', updatedAt: serverTimestamp(), updatedBy: BEN.uid, updatedByName: BEN.name }));
    await assertFails(updateDoc(doc(dbAs(BEN), 'groups', GROUP, 'notes', ref.id), { body: 'X', updatedAt: serverTimestamp(), updatedBy: ANNA.uid, updatedByName: ANNA.name }));
    await assertFails(updateDoc(doc(dbAs(BEN), 'groups', GROUP, 'notes', ref.id), { createdBy: BEN.uid, updatedAt: serverTimestamp(), updatedBy: BEN.uid, updatedByName: BEN.name }));
    await assertFails(deleteDoc(doc(dbAs(BEN), 'groups', GROUP, 'notes', ref.id)));
    await assertSucceeds(deleteDoc(doc(dbAs(ANNA), 'groups', GROUP, 'notes', ref.id)));
  });

  it('household notices and notes stay in the household', async () => {
    await assertSucceeds(addDoc(collection(dbAs(ANNA), 'groups', GROUP, 'households', 'h1', 'notices'), notice(ANNA)));
    await assertSucceeds(addDoc(collection(dbAs(ANNA), 'groups', GROUP, 'households', 'h1', 'notes'), note(ANNA)));
    await assertFails(getDocs(collection(dbAs(BEN), 'groups', GROUP, 'households', 'h1', 'notices')));
    await assertFails(getDocs(collection(dbAs(BEN), 'groups', GROUP, 'households', 'h1', 'notes')));
  });
});

// ---------- family tree ----------

describe('family tree', () => {
  const person = (user, overrides = {}) => ({
    name: 'Opa Hans', birthYear: 1944, deathYear: 2019, mail: '', parents: [], partners: ['p1'], birthdayId: '', note: '',
    ...created(user), updatedAt: serverTimestamp(), updatedBy: user.uid, ...overrides,
  });

  it('members add people with parents, partners and years', async () => {
    await assertSucceeds(setDoc(doc(dbAs(BEN), 'groups', GROUP, 'tree', 'p2'), person(BEN)));
    await assertSucceeds(setDoc(doc(dbAs(BEN), 'groups', GROUP, 'tree', 'p3'), person(BEN, { name: 'Anna', birthYear: 1975, deathYear: null, mail: ANNA.email, parents: ['p1', 'p2'], partners: [] })));
    await assertFails(setDoc(doc(dbAs(BEN), 'groups', GROUP, 'tree', 'p4'), person(BEN, { parents: ['p1', 'p2', 'p3'] })));
    await assertFails(setDoc(doc(dbAs(BEN), 'groups', GROUP, 'tree', 'p4'), person(BEN, { parents: ['p1', 'p1'] })));
    await assertFails(setDoc(doc(dbAs(BEN), 'groups', GROUP, 'tree', 'p4'), person(BEN, { parents: ['../x'] })));
    await assertFails(setDoc(doc(dbAs(BEN), 'groups', GROUP, 'tree', 'p4'), person(BEN, { birthYear: 1990, deathYear: 1980 })));
    await assertFails(setDoc(doc(dbAs(BEN), 'groups', GROUP, 'tree', 'p4'), person(BEN, { birthYear: '1990' })));
    await assertFails(setDoc(doc(dbAs(BEN), 'groups', GROUP, 'tree', 'p4'), person(BEN, { mail: 'not a mail' })));
    await assertFails(setDoc(doc(dbAs(STRANGER), 'groups', GROUP, 'tree', 'p4'), person(STRANGER)));
  });

  it('anyone changes a person under their own id; only creator or admin delete', async () => {
    await assertSucceeds(updateDoc(doc(dbAs(BEN), 'groups', GROUP, 'tree', 'p1'), { birthYear: 1947, updatedAt: serverTimestamp(), updatedBy: BEN.uid }));
    await assertFails(updateDoc(doc(dbAs(BEN), 'groups', GROUP, 'tree', 'p1'), { birthYear: 1947, updatedAt: serverTimestamp(), updatedBy: ANNA.uid }));
    await assertFails(deleteDoc(doc(dbAs(BEN), 'groups', GROUP, 'tree', 'p1')));
    await assertSucceeds(deleteDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'tree', 'p1')));
  });
});

// ---------- question of the day ----------

describe('question of the day', () => {
  const answer = (user, text = 'Der Ausflug') => ({ text, name: user.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const answers = (user) => collection(dbAs(user), 'groups', GROUP, 'days', '2026-10-23', 'answers');

  it('the others\' answers stay hidden until you answered yourself', async () => {
    // Asking for one's own (missing) answer is fine: that is how the app knows you did not answer yet.
    await assertSucceeds(getDoc(doc(dbAs(ANNA), 'groups', GROUP, 'days', '2026-10-23', 'answers', ANNA.uid)));
    await assertFails(getDocs(answers(ANNA)));
    await assertFails(getDoc(doc(dbAs(ANNA), 'groups', GROUP, 'days', '2026-10-23', 'answers', BEN.uid)));
    await assertSucceeds(setDoc(doc(dbAs(ANNA), 'groups', GROUP, 'days', '2026-10-23', 'answers', ANNA.uid), answer(ANNA)));
    await assertSucceeds(getDocs(answers(ANNA)));
  });

  it('each person writes only their own answer, under their own name', async () => {
    await assertFails(setDoc(doc(dbAs(ANNA), 'groups', GROUP, 'days', '2026-10-23', 'answers', BEN.uid), answer(ANNA)));
    await assertFails(setDoc(doc(dbAs(ANNA), 'groups', GROUP, 'days', '2026-10-23', 'answers', ANNA.uid), { ...answer(ANNA), name: 'Ben' }));
    await assertFails(setDoc(doc(dbAs(ANNA), 'groups', GROUP, 'days', '2026-10-23', 'answers', ANNA.uid), answer(ANNA, '')));
    await assertFails(setDoc(doc(dbAs(ANNA), 'groups', GROUP, 'days', 'heute', 'answers', ANNA.uid), answer(ANNA)));
    await assertSucceeds(updateDoc(doc(dbAs(BEN), 'groups', GROUP, 'days', '2026-10-23', 'answers', BEN.uid), { text: 'Das Fußballspiel am Samstag', name: BEN.name, updatedAt: serverTimestamp() }));
    await assertFails(getDocs(answers(STRANGER)));
  });
});

// ---------- contacts for the simple mode ----------

describe('quick contacts', () => {
  it('admins mark contacts for big call buttons', async () => {
    const contact = (quick) => ({
      name: 'Notruf', group: 'emergency', phone: '112', phone2: '', mail: '', address: '', note: '', quick,
      updatedAt: serverTimestamp(), updatedBy: ADMIN.email,
    });
    await assertSucceeds(setDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'contacts', 'c1'), contact(true)));
    await assertFails(setDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'contacts', 'c2'), contact('yes')));
  });
});
