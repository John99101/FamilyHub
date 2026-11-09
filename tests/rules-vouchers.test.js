// Security rules tests for gifts of time (activities, trips and vouchers
// people gave each other), including private ones.
// Run with: npm run test:rules
import { describe, it, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, serverTimestamp, Timestamp,
  setLogLevel,
} from 'firebase/firestore';
import { GROUP, seedGroup } from './group-seed.js';

setLogLevel('silent');

const ADMIN = { uid: 'u_admin', email: 'chef@example.com', name: 'Chef Familie' };
const ANNA = { uid: 'u_anna', email: 'anna@example.com', name: 'Anna' };
const BEN = { uid: 'u_ben', email: 'ben@example.com', name: 'Ben' };
const CARL = { uid: 'u_carl', email: 'carl@example.com', name: 'Carl' };
const STRANGER = { uid: 'u_fremd', email: 'fremd@example.com', name: 'Fremd' };

let env;

const dbAs = (user) => env.authenticatedContext(user.uid, {
  email: user.email, email_verified: true, name: user.name, firebase: { sign_in_provider: 'google.com' },
}).firestore();

const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const vouchers = (db) => collection(db, 'groups', GROUP, 'vouchers');
const ref = (db, id) => doc(db, 'groups', GROUP, 'vouchers', id);

const fields = (overrides = {}) => ({
  title: 'Escape Room', kind: 'voucher', occasion: 'Weihnachten', note: '',
  givers: [ANNA.email], receivers: [BEN.email], givenOn: '2026-12-24', until: '',
  status: 'open', plannedOn: '', doneOn: '', memory: '', private: false, ...overrides,
});
const created = (user, overrides) => ({
  ...fields(overrides), createdBy: user.uid, createdByName: user.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});
const seeded = (user, overrides) => ({
  ...fields(overrides), createdBy: user.uid, createdByName: user.name, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
});
const change = (values) => ({ ...values, updatedAt: serverTimestamp() });

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
    await seedGroup(db, { admins: [ADMIN], members: [ANNA, BEN, CARL] });
    // Shared: Anna gave Ben an escape room. Private: Ben gave Anna a weekend in Rome.
    await setDoc(ref(db, 'shared'), seeded(ANNA));
    await setDoc(ref(db, 'secret'), seeded(BEN, { title: 'Wochenende in Rom', kind: 'trip', givers: [BEN.email], receivers: [ANNA.email], private: true }));
  });
});

describe('gifts: reading', () => {
  it('every member reads shared ones, strangers none', async () => {
    await assertSucceeds(getDoc(ref(dbAs(CARL), 'shared')));
    await assertFails(getDoc(ref(dbAs(STRANGER), 'shared')));
  });

  it('a private one only its givers and receivers read, not even an admin', async () => {
    await assertSucceeds(getDoc(ref(dbAs(BEN), 'secret')));
    await assertSucceeds(getDoc(ref(dbAs(ANNA), 'secret')));
    await assertFails(getDoc(ref(dbAs(CARL), 'secret')));
    await assertFails(getDoc(ref(dbAs(ADMIN), 'secret')));
  });

  it('the three lists the app reads work, an unfiltered list does not', async () => {
    const db = dbAs(CARL);
    await assertSucceeds(getDocs(query(vouchers(db), where('private', '==', false))));
    await assertSucceeds(getDocs(query(vouchers(db), where('givers', 'array-contains', CARL.email))));
    await assertSucceeds(getDocs(query(vouchers(db), where('receivers', 'array-contains', CARL.email))));
    await assertFails(getDocs(vouchers(db)));
  });
});

describe('gifts: adding', () => {
  it('a member adds a shared one, or a private one they are part of', async () => {
    await assertSucceeds(addDoc(vouchers(dbAs(CARL)), created(CARL, { givers: [CARL.email, ANNA.email] })));
    await assertSucceeds(addDoc(vouchers(dbAs(CARL)), created(CARL, { receivers: [CARL.email], private: true })));
    // Someone may also note a shared gift between others.
    await assertSucceeds(addDoc(vouchers(dbAs(CARL)), created(CARL)));
  });

  it('a private one without the writer in it is refused', async () => {
    await assertFails(addDoc(vouchers(dbAs(CARL)), created(CARL, { private: true })));
  });

  it('strangers and wrong creators are refused', async () => {
    await assertFails(addDoc(vouchers(dbAs(STRANGER)), created(STRANGER, { givers: [STRANGER.email] })));
    await assertFails(addDoc(vouchers(dbAs(CARL)), created(ANNA)));
  });

  it('bad fields are refused', async () => {
    const db = dbAs(ANNA);
    for (const bad of [
      { title: ' ' }, { kind: 'car' }, { givers: [] }, { receivers: [] }, { givers: ['Anna@Example.com'] },
      { givenOn: '24.12.2026' }, { until: 'soon' }, { status: 'maybe' },
      { status: 'planned' }, { status: 'done' }, { doneOn: '2027-01-02' }, { private: 'yes' },
      { memory: 'x'.repeat(501) }, { extra: 1 },
    ]) {
      await assertFails(addDoc(vouchers(db), created(ANNA, bad)));
    }
  });
});

describe('gifts: planning and redeeming', () => {
  it('givers and receivers plan and redeem it', async () => {
    await assertSucceeds(updateDoc(ref(dbAs(BEN), 'shared'), change({ status: 'planned', plannedOn: '2027-02-13' })));
    await assertSucceeds(updateDoc(ref(dbAs(ANNA), 'shared'), change({ status: 'done', doneOn: '2027-02-13', memory: 'Knapp geschafft!' })));
  });

  it('others cannot, but an admin can change a shared one', async () => {
    await assertFails(updateDoc(ref(dbAs(CARL), 'shared'), change({ status: 'planned', plannedOn: '2027-02-13' })));
    await assertSucceeds(updateDoc(ref(dbAs(ADMIN), 'shared'), change({ title: 'Escape Room Berlin' })));
    await assertFails(updateDoc(ref(dbAs(ADMIN), 'secret'), change({ title: 'Rom' })));
  });

  it('done needs its day, planned needs its date', async () => {
    await assertFails(updateDoc(ref(dbAs(BEN), 'shared'), change({ status: 'done' })));
    await assertFails(updateDoc(ref(dbAs(BEN), 'shared'), change({ status: 'planned' })));
    await assertFails(updateDoc(ref(dbAs(BEN), 'shared'), change({ status: 'open', doneOn: '2027-02-13' })));
  });

  it('nobody leaves a private one, the creator stays the creator', async () => {
    await assertFails(updateDoc(ref(dbAs(ANNA), 'secret'), change({ receivers: [CARL.email] })));
    await assertFails(updateDoc(ref(dbAs(BEN), 'shared'), change({ createdBy: BEN.uid })));
  });

  it('making a shared one private hides it from the others', async () => {
    await assertSucceeds(updateDoc(ref(dbAs(BEN), 'shared'), change({ private: true })));
    await assertFails(getDoc(ref(dbAs(CARL), 'shared')));
  });
});

describe('gifts: deleting', () => {
  it('the creator deletes it, a receiver does not', async () => {
    await assertFails(deleteDoc(ref(dbAs(BEN), 'shared')));
    await assertSucceeds(deleteDoc(ref(dbAs(ANNA), 'shared')));
  });

  it('an admin deletes shared ones, not private ones', async () => {
    await assertSucceeds(deleteDoc(ref(dbAs(ADMIN), 'shared')));
    await assertFails(deleteDoc(ref(dbAs(ADMIN), 'secret')));
  });
});

describe('gifts as a group page', () => {
  it('admins can switch the page and its start card on and off', async () => {
    await assertSucceeds(updateDoc(doc(dbAs(ADMIN), 'groups', GROUP), {
      features: { vouchers: false }, design: { cards: ['vouchers', 'days'] }, updatedAt: serverTimestamp(), updatedBy: ADMIN.uid,
    }));
  });
});
