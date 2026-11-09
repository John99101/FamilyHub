// Security rules tests for groups: the group document (name, pages, look),
// finding one's own groups, and market access. Run with: npm run test:rules
import { describe, it, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collectionGroup, query, where,
  serverTimestamp, setLogLevel,
} from 'firebase/firestore';
import { GROUP, seedGroup, memberEntry } from './group-seed.js';

setLogLevel('silent');

const ADMIN = { uid: 'u_admin', email: 'chef@example.com', name: 'Chef Familie' };
const ANNA = { uid: 'u_anna', email: 'anna@example.com', name: 'Anna' };
const STRANGER = { uid: 'u_fremd', email: 'fremd@example.com', name: 'Fremd' };

let env;

const dbAs = (user, provider = 'google.com') => env.authenticatedContext(user.uid, {
  email: user.email, email_verified: true, name: user.name, firebase: { sign_in_provider: provider },
}).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const groupDoc = (user) => doc(dbAs(user), 'groups', GROUP);
const change = (user, fields) => updateDoc(groupDoc(user), { ...fields, updatedAt: serverTimestamp(), updatedBy: user.uid });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-familyhub',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await seed((db) => seedGroup(db, { admins: [ADMIN], members: [ANNA] }));
});

describe('the group document', () => {
  it('members read their group, strangers and signed out visitors do not', async () => {
    await assertSucceeds(getDoc(groupDoc(ANNA)));
    await assertFails(getDoc(groupDoc(STRANGER)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'groups', GROUP)));
  });

  it('nobody creates a group from the app (only the Cloud Function does)', async () => {
    await assertFails(setDoc(doc(dbAs(STRANGER), 'groups', 'neu'), { name: 'Neu', icon: '🌳' }));
  });

  it('admin changes name, icon, pages and look', async () => {
    await assertSucceeds(change(ADMIN, {
      name: 'Familie Muster', icon: '🌳',
      features: { chat: true, markets: false, tree: false },
      design: {
        theme: 'forest', main: '#2f6b3a', accent: '#e0a030', background: '',
        pattern: 'leaves', patternStrength: 40, font: 'round', corners: 'square', spacing: 'compact',
        cards: ['notices', 'days', 'chat'], welcome: 'Schön, dass du da bist',
      },
    }));
  });

  it('members cannot change the group', async () => {
    await assertFails(change(ANNA, { name: 'Meine Gruppe' }));
  });

  it('nobody changes the code, the markets switch or the creator from the app', async () => {
    await assertFails(change(ADMIN, { code: 'ABC-1234' }));
    await assertFails(change(ADMIN, { marketsUnlocked: true }));
    await assertFails(change(ADMIN, { createdBy: ANNA.uid }));
    await assertFails(change(ADMIN, { extra: 1 }));
  });

  it('a change carries server time and the admin\'s own id, and a valid name and icon', async () => {
    await assertFails(updateDoc(groupDoc(ADMIN), { name: 'X' }));
    await assertFails(updateDoc(groupDoc(ADMIN), { name: 'X', updatedAt: serverTimestamp(), updatedBy: ANNA.uid }));
    await assertFails(change(ADMIN, { name: '  ' }));
    await assertFails(change(ADMIN, { name: 'x'.repeat(41) }));
    await assertFails(change(ADMIN, { icon: '' }));
  });

  it('pages: only known switches, only true or false', async () => {
    await assertFails(change(ADMIN, { features: { chat: 'yes' } }));
    await assertFails(change(ADMIN, { features: { games: true } }));
    await assertFails(change(ADMIN, { features: ['chat'] }));
  });

  it('look: unknown values are refused', async () => {
    const bad = [
      { theme: 'neon' }, { mode: 'dark' }, { main: 'red' }, { main: '#FFFFFF' }, { accent: '#12345' },
      { pattern: 'skulls' }, { patternStrength: 101 }, { patternStrength: -1 }, { patternStrength: 2.5 },
      { font: 'comic' }, { corners: 'oval' }, { spacing: 'wide' }, { cards: ['ads'] }, { cards: ['chat', 'chat'] },
      { welcome: 'x'.repeat(121) }, { logo: 'x' },
    ];
    for (const design of bad) await assertFails(change(ADMIN, { design }));
    await assertSucceeds(change(ADMIN, { design: {} }));
  });

  it('only an admin deletes the group', async () => {
    await assertFails(deleteDoc(groupDoc(ANNA)));
    await assertSucceeds(deleteDoc(groupDoc(ADMIN)));
  });

  it('a member signed in with mail and password reads the group too', async () => {
    await assertSucceeds(getDoc(doc(dbAs(ANNA, 'password'), 'groups', GROUP)));
  });
});

describe('my groups', () => {
  const mine = (user) => getDocs(query(collectionGroup(dbAs(user), 'members'), where('uid', '==', user.uid)));

  it('everyone finds their own memberships in all groups', async () => {
    await seed((db) => setDoc(doc(db, 'groups', 'g2', 'members', ANNA.uid), memberEntry(ANNA, 'admin')));
    const snap = await assertSucceeds(mine(ANNA));
    if (snap.size !== 2) throw new Error(`expected 2 groups, got ${snap.size}`);
    await assertSucceeds(mine(STRANGER));
  });

  it('nobody lists the memberships of others', async () => {
    await assertFails(getDocs(query(collectionGroup(dbAs(STRANGER), 'members'), where('uid', '==', ANNA.uid))));
    await assertFails(getDocs(collectionGroup(dbAs(STRANGER), 'members')));
  });
});

describe('market access', () => {
  it('a group member without market access sees no market data', async () => {
    await seed((db) => setDoc(doc(db, 'market', 'latest'), { quotes: [] }));
    await assertFails(getDoc(doc(dbAs(ANNA), 'market', 'latest')));
    await seed((db) => setDoc(doc(db, 'marketAccess', ANNA.uid), {}));
    await assertSucceeds(getDoc(doc(dbAs(ANNA), 'market', 'latest')));
  });

  it('everyone reads only their own market access, and nobody writes it', async () => {
    await seed((db) => setDoc(doc(db, 'marketAccess', ANNA.uid), {}));
    await assertSucceeds(getDoc(doc(dbAs(ANNA), 'marketAccess', ANNA.uid)));
    await assertSucceeds(getDoc(doc(dbAs(STRANGER), 'marketAccess', STRANGER.uid)));
    await assertFails(getDoc(doc(dbAs(STRANGER), 'marketAccess', ANNA.uid)));
    await assertFails(setDoc(doc(dbAs(STRANGER), 'marketAccess', STRANGER.uid), { admin: true }));
    await assertFails(updateDoc(doc(dbAs(ANNA), 'marketAccess', ANNA.uid), { admin: true }));
  });
});
