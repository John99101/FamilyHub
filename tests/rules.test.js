// Firestore security rules tests. Run with: npm run test:rules
// (starts the Firestore emulator, runs this file, stops the emulator).
import { describe, it, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs,
  query, orderBy, limit, serverTimestamp, Timestamp, setLogLevel,
} from 'firebase/firestore';
import { GROUP, seedGroup } from './group-seed.js';

// The expected denials would otherwise flood the output with warnings.
setLogLevel('silent');

const ADMIN = { uid: 'u_admin', email: 'chef@example.com', name: 'Chef Familie', picture: 'https://lh3.googleusercontent.com/a/chef' };
const MEMBER = { uid: 'u_anna', email: 'anna@example.com', name: 'Anna', picture: 'https://lh3.googleusercontent.com/a/anna' };
const MEMBER2 = { uid: 'u_ben', email: 'ben@example.com', name: 'Ben', picture: 'https://lh3.googleusercontent.com/a/ben' };
const STRANGER = { uid: 'u_fremd', email: 'fremd@example.com', name: 'Fremd', picture: 'https://lh3.googleusercontent.com/a/fremd' };

let env;

function tokenFor(user, extra = {}) {
  return {
    email: user.email,
    email_verified: true,
    name: user.name,
    picture: user.picture,
    firebase: { sign_in_provider: 'google.com' },
    ...extra,
  };
}

function dbAs(user, extra) {
  return env.authenticatedContext(user.uid, tokenFor(user, extra)).firestore();
}

function messageFrom(user, overrides = {}) {
  return {
    uid: user.uid,
    name: user.name,
    photo: user.picture,
    text: 'Hallo zusammen',
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

const messages = (db) => collection(db, 'groups', GROUP, 'rooms', 'familie', 'messages');

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-familyhub',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await seedGroup(db, { admins: [ADMIN], members: [MEMBER, MEMBER2] });
    // Market access is separate from the group: the admin manages the markets.
    await setDoc(doc(db, 'marketAccess', ADMIN.uid), { admin: true });
    await setDoc(doc(db, 'marketAccess', MEMBER.uid), {});
    await setDoc(doc(db, 'marketAccess', MEMBER2.uid), {});
    await setDoc(doc(db, 'groups', GROUP, 'rooms', 'familie'), { name: 'Familie', createdAt: Timestamp.now() });
    await setDoc(doc(db, 'groups', GROUP, 'rooms', 'familie', 'messages', 'm_anna'), {
      uid: MEMBER.uid, name: MEMBER.name, photo: MEMBER.picture, text: 'Von Anna', createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'groups', GROUP, 'rooms', 'familie', 'messages', 'm_ben'), {
      uid: MEMBER2.uid, name: MEMBER2.name, photo: MEMBER2.picture, text: 'Von Ben', createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'secrets', 'x'), { a: 1 });
    await setDoc(doc(db, 'market', 'latest'), { updatedAt: Timestamp.now(), quotes: [{ symbol: 'AAPL', price: 1 }], indices: [] });
    await setDoc(doc(db, 'market', 'status'), { state: 'ok' });
    await setDoc(doc(db, 'market', 'risk'), { asOf: '2026-10-21', symbols: [] });
    await setDoc(doc(db, 'market', 'riskSummary'), { asOf: '2026-10-21', en: 'note', fr: 'note' });
    await setDoc(doc(db, 'marketHistory', 'AAPL'), { symbol: 'AAPL', closes: { '2026-10-21': 1 } });
    await setDoc(doc(db, 'config', 'watchlist'), { symbols: ['AAPL'] });
    await setDoc(doc(db, 'config', 'market'), { enabled: false });
  });
});

describe('markets', () => {
  const watch = (user, symbols, extra = {}) => setDoc(doc(dbAs(user), 'config', 'watchlist'), {
    symbols, updatedAt: serverTimestamp(), updatedBy: user.email, ...extra,
  });

  it('members can read market data, the watchlist and the switch', async () => {
    const db = dbAs(MEMBER);
    await assertSucceeds(getDoc(doc(db, 'market', 'latest')));
    await assertSucceeds(getDoc(doc(db, 'market', 'status')));
    await assertSucceeds(getDoc(doc(db, 'marketHistory', 'AAPL')));
    await assertSucceeds(getDoc(doc(db, 'config', 'watchlist')));
    await assertSucceeds(getDoc(doc(db, 'config', 'market')));
  });

  it('strangers cannot read market data', async () => {
    const db = dbAs(STRANGER);
    await assertFails(getDoc(doc(db, 'market', 'latest')));
    await assertFails(getDoc(doc(db, 'marketHistory', 'AAPL')));
    await assertFails(getDoc(doc(db, 'config', 'watchlist')));
    await assertFails(watch(STRANGER, ['MSFT']));
  });

  it('members and admins cannot write market data (only the Cloud Function can)', async () => {
    for (const user of [MEMBER, ADMIN]) {
      const db = dbAs(user);
      await assertFails(setDoc(doc(db, 'market', 'latest'), { quotes: [{ symbol: 'AAPL', price: 999 }] }));
      await assertFails(updateDoc(doc(db, 'market', 'status'), { state: 'ok' }));
      await assertFails(setDoc(doc(db, 'market', 'new'), { a: 1 }));
      await assertFails(deleteDoc(doc(db, 'market', 'latest')));
      await assertFails(setDoc(doc(db, 'marketHistory', 'AAPL'), { closes: {} }));
    }
  });

  it('members can change the watchlist (up to 10 valid symbols)', async () => {
    await assertSucceeds(watch(MEMBER, ['AAPL', 'MSFT', 'BRK.B', 'BF-B']));
    await assertSucceeds(watch(MEMBER, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']));
    await assertSucceeds(watch(MEMBER, []));
  });

  it('watchlist: more than 10, duplicates and bad symbols are rejected', async () => {
    await assertFails(watch(MEMBER, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']));
    await assertFails(watch(MEMBER, ['AAPL', 'AAPL']));
    await assertFails(watch(MEMBER, ['aapl']));
    await assertFails(watch(MEMBER, ['AA PL']));
    await assertFails(watch(MEMBER, ['AAPL|MSFT']));
    await assertFails(watch(MEMBER, ['']));
    await assertFails(watch(MEMBER, ['ABCDEFGHIJKLM']));
    await assertFails(watch(MEMBER, ['<script>']));
    await assertFails(watch(MEMBER, [42]));
    await assertFails(watch(MEMBER, 'AAPL'));
  });

  it('watchlist: must carry server time and own mail, no extra fields', async () => {
    await assertFails(setDoc(doc(dbAs(MEMBER), 'config', 'watchlist'), { symbols: ['AAPL'] }));
    await assertFails(watch(MEMBER, ['AAPL'], { updatedBy: ADMIN.email }));
    await assertFails(watch(MEMBER, ['AAPL'], { updatedAt: Timestamp.now() }));
    await assertFails(watch(MEMBER, ['AAPL'], { note: 'x' }));
  });

  it('only admins can switch the market part on or off', async () => {
    const change = (user, enabled, extra = {}) => setDoc(doc(dbAs(user), 'config', 'market'), {
      enabled, updatedAt: serverTimestamp(), updatedBy: user.email, ...extra,
    });
    await assertFails(change(MEMBER, true));
    await assertSucceeds(change(ADMIN, true));
    await assertSucceeds(change(ADMIN, false));
    await assertFails(change(ADMIN, 'yes'));
    await assertFails(change(ADMIN, true, { extra: 1 }));
    await assertFails(deleteDoc(doc(dbAs(ADMIN), 'config', 'market')));
  });

  it('only admins can switch the AI summary on or off (a true or false value)', async () => {
    const change = (user, aiEnabled) => setDoc(doc(dbAs(user), 'config', 'market'), {
      enabled: true, aiEnabled, updatedAt: serverTimestamp(), updatedBy: user.email,
    });
    await assertSucceeds(change(ADMIN, false));
    await assertSucceeds(change(ADMIN, true));
    await assertFails(change(ADMIN, 'off'));
    await assertFails(change(MEMBER, false));
  });

  it('members read the risk figures and the AI summary but cannot write them', async () => {
    for (const id of ['risk', 'riskSummary']) {
      await assertSucceeds(getDoc(doc(dbAs(MEMBER), 'market', id)));
      await assertFails(getDoc(doc(dbAs(STRANGER), 'market', id)));
      await assertFails(setDoc(doc(dbAs(ADMIN), 'market', id), { en: 'fake' }));
      await assertFails(updateDoc(doc(dbAs(MEMBER), 'market', id), { en: 'fake' }));
    }
  });
});

describe('strangers and incomplete sign ins', () => {
  it('signed out visitor can read nothing', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'groups', GROUP)));
    await assertFails(getDocs(messages(db)));
    await assertFails(getDoc(doc(db, 'groups', GROUP, 'rooms', 'familie')));
  });

  it('stranger (not in the group) is denied everywhere', async () => {
    const db = dbAs(STRANGER);
    await assertFails(getDoc(doc(db, 'groups', GROUP)));
    await assertFails(getDoc(doc(db, 'groups', GROUP, 'rooms', 'familie')));
    await assertFails(getDocs(messages(db)));
    await assertFails(getDoc(doc(db, 'groups', GROUP, 'rooms', 'familie', 'messages', 'm_anna')));
    await assertFails(addDoc(messages(db), messageFrom(STRANGER)));
    await assertFails(deleteDoc(doc(db, 'groups', GROUP, 'rooms', 'familie', 'messages', 'm_anna')));
    await assertFails(setDoc(doc(db, 'groups', GROUP, 'members', STRANGER.uid), { uid: STRANGER.uid, role: 'member' }));
    await assertFails(setDoc(doc(db, 'groups', GROUP, 'rooms', 'neu'), { name: 'Neu', createdAt: serverTimestamp() }));
    await assertFails(getDoc(doc(db, 'secrets', 'x')));
  });

  it('member whose mail is not verified is denied', async () => {
    const db = dbAs(MEMBER, { email_verified: false });
    await assertFails(getDocs(messages(db)));
    await assertFails(addDoc(messages(db), messageFrom(MEMBER)));
  });

  it('member signed in with mail and password (verified) is let in', async () => {
    const db = env.authenticatedContext(MEMBER.uid, {
      email: MEMBER.email, email_verified: true, name: MEMBER.name, firebase: { sign_in_provider: 'password' },
    }).firestore();
    await assertSucceeds(getDocs(messages(db)));
  });

  it('member signed in with another provider (anonymous, phone) is denied', async () => {
    for (const provider of ['anonymous', 'phone', 'custom']) {
      await assertFails(getDocs(messages(dbAs(MEMBER, { firebase: { sign_in_provider: provider } }))));
    }
  });
});

describe('members in the chat', () => {
  it('member can read the group, the room and the messages', async () => {
    const db = dbAs(MEMBER);
    await assertSucceeds(getDoc(doc(db, 'groups', GROUP)));
    await assertSucceeds(getDoc(doc(db, 'groups', GROUP, 'rooms', 'familie')));
    await assertSucceeds(getDocs(query(messages(db), orderBy('createdAt', 'desc'), limit(50))));
  });

  it('member can send a message as themselves', async () => {
    await assertSucceeds(addDoc(messages(dbAs(MEMBER)), messageFrom(MEMBER)));
  });

  it('member without a Google name or photo can still send (empty name and photo)', async () => {
    const user = { ...MEMBER };
    const db = env.authenticatedContext(user.uid, {
      email: user.email, email_verified: true, firebase: { sign_in_provider: 'google.com' },
    }).firestore();
    await assertSucceeds(addDoc(messages(db), messageFrom(user, { name: '', photo: '' })));
  });

  it('member cannot send as someone else', async () => {
    const db = dbAs(MEMBER);
    await assertFails(addDoc(messages(db), messageFrom(MEMBER, { uid: MEMBER2.uid })));
    await assertFails(addDoc(messages(db), messageFrom(MEMBER, { name: 'Ben' })));
    await assertFails(addDoc(messages(db), messageFrom(MEMBER, { photo: MEMBER2.picture })));
  });

  it('member must use the server time', async () => {
    const db = dbAs(MEMBER);
    await assertFails(addDoc(messages(db), messageFrom(MEMBER, { createdAt: Timestamp.now() })));
    await assertFails(addDoc(messages(db), messageFrom(MEMBER, { createdAt: Timestamp.fromDate(new Date('2030-01-01')) })));
  });

  it('member can delete their own message', async () => {
    await assertSucceeds(deleteDoc(doc(dbAs(MEMBER), 'groups', GROUP, 'rooms', 'familie', 'messages', 'm_anna')));
  });

  it('member cannot delete another member\'s message', async () => {
    await assertFails(deleteDoc(doc(dbAs(MEMBER), 'groups', GROUP, 'rooms', 'familie', 'messages', 'm_ben')));
  });

  it('nobody can edit a message, not even the sender', async () => {
    await assertFails(updateDoc(doc(dbAs(MEMBER), 'groups', GROUP, 'rooms', 'familie', 'messages', 'm_anna'), { text: 'Geändert' }));
    await assertFails(updateDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'rooms', 'familie', 'messages', 'm_anna'), { text: 'Geändert' }));
  });

  it('member cannot write into a room that does not exist', async () => {
    const db = dbAs(MEMBER);
    await assertFails(addDoc(collection(db, 'groups', GROUP, 'rooms', 'geheim', 'messages'), messageFrom(MEMBER)));
  });

  it('member cannot create a room without the room fields', async () => {
    await assertFails(setDoc(doc(dbAs(MEMBER), 'groups', GROUP, 'rooms', 'neu'), { name: 'Neu', createdAt: serverTimestamp() }));
  });

  it('nobody can read or write documents outside the data model', async () => {
    await assertFails(getDoc(doc(dbAs(MEMBER), 'secrets', 'x')));
    await assertFails(getDoc(doc(dbAs(ADMIN), 'secrets', 'x')));
    await assertFails(setDoc(doc(dbAs(ADMIN), 'anything', 'y'), { a: 1 }));
  });
});

describe('message field checks', () => {
  const send = (overrides) => addDoc(messages(dbAs(MEMBER)), messageFrom(MEMBER, overrides));

  it('text of 1 and of 2000 characters is accepted', async () => {
    await assertSucceeds(send({ text: 'a' }));
    await assertSucceeds(send({ text: 'a'.repeat(2000) }));
  });

  it('empty text, only spaces, or more than 2000 characters is rejected', async () => {
    await assertFails(send({ text: '' }));
    await assertFails(send({ text: '   \n  ' }));
    await assertFails(send({ text: 'a'.repeat(2001) }));
  });

  it('length is counted like JavaScript counts it (an emoji counts as 2)', async () => {
    await assertSucceeds(send({ text: '😀'.repeat(1000) }));
    await assertFails(send({ text: '😀'.repeat(1001) }));
  });

  it('text must be a string', async () => {
    await assertFails(send({ text: 42 }));
    await assertFails(send({ text: ['a'] }));
  });

  it('extra fields are rejected', async () => {
    await assertFails(send({ image: 'https://example.com/x.png' }));
    await assertFails(send({ isAdmin: true }));
  });

  it('missing fields are rejected', async () => {
    const db = dbAs(MEMBER);
    const { photo, ...withoutPhoto } = messageFrom(MEMBER);
    const { createdAt, ...withoutTime } = messageFrom(MEMBER);
    await assertFails(addDoc(messages(db), withoutPhoto));
    await assertFails(addDoc(messages(db), withoutTime));
  });
});

describe('admins', () => {
  it('admin can delete any message', async () => {
    await assertSucceeds(deleteDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'rooms', 'familie', 'messages', 'm_anna')));
    await assertSucceeds(deleteDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'rooms', 'familie', 'messages', 'm_ben')));
  });

  it('admin makes a member admin, and removes members who then lose access', async () => {
    const db = dbAs(ADMIN);
    await assertSucceeds(updateDoc(doc(db, 'groups', GROUP, 'members', MEMBER.uid), { role: 'admin' }));
    // The new admin can delete any message.
    await assertSucceeds(deleteDoc(doc(dbAs(MEMBER), 'groups', GROUP, 'rooms', 'familie', 'messages', 'm_ben')));
    await assertSucceeds(deleteDoc(doc(db, 'groups', GROUP, 'members', MEMBER2.uid)));
    await assertFails(getDocs(messages(dbAs(MEMBER2))));
  });

  it('admin cannot change their own role or other member fields', async () => {
    const db = dbAs(ADMIN);
    await assertFails(updateDoc(doc(db, 'groups', GROUP, 'members', ADMIN.uid), { role: 'member' }));
    await assertFails(updateDoc(doc(db, 'groups', GROUP, 'members', MEMBER.uid), { role: 'owner' }));
    await assertFails(updateDoc(doc(db, 'groups', GROUP, 'members', MEMBER.uid), { mail: 'x@example.com' }));
  });

  it('members cannot change roles or remove others', async () => {
    const db = dbAs(MEMBER);
    await assertFails(updateDoc(doc(db, 'groups', GROUP, 'members', MEMBER.uid), { role: 'admin' }));
    await assertFails(updateDoc(doc(db, 'groups', GROUP, 'members', MEMBER2.uid), { role: 'admin' }));
    await assertFails(deleteDoc(doc(db, 'groups', GROUP, 'members', MEMBER2.uid)));
  });

  it('a member may leave; an admin first loses the admin role, and no admin removes another admin', async () => {
    await assertSucceeds(deleteDoc(doc(dbAs(MEMBER), 'groups', GROUP, 'members', MEMBER.uid)));
    await assertFails(deleteDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'members', ADMIN.uid)));
    await assertSucceeds(updateDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'members', MEMBER2.uid), { role: 'admin' }));
    await assertFails(deleteDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'members', MEMBER2.uid)));
  });

  it('nobody joins or adds people from the app (only the Cloud Function does)', async () => {
    const entry = (user, role) => ({ uid: user.uid, mail: user.email, name: user.name, role, joinedAt: serverTimestamp() });
    await assertFails(setDoc(doc(dbAs(STRANGER), 'groups', GROUP, 'members', STRANGER.uid), entry(STRANGER, 'member')));
    await assertFails(setDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'members', STRANGER.uid), entry(STRANGER, 'member')));
  });

  it('member lists (households, rooms) must be lower case mail addresses, each only once', async () => {
    const db = dbAs(ADMIN);
    const save = (members) => setDoc(doc(db, 'groups', GROUP, 'households', 'hx'), {
      name: 'Haus', members, updatedAt: serverTimestamp(), updatedBy: ADMIN.email,
    });
    await assertSucceeds(save(['anna@example.com', 'o.brien+fh@mail.example.co.uk', "d'arc@example.fr"]));
    await assertFails(save(['Anna@Example.com']));
    await assertFails(save(['anna@example.com', 'anna@example.com']));
    await assertFails(save(['not a mail']));
    await assertFails(save(['anna@example']));
    await assertFails(save(['anna@example.com|ben@example.com']));
    await assertFails(save([42]));
  });

  it('only an admin sets up the main room "familie" (other rooms need the full room fields)', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'groups', GROUP, 'rooms', 'familie')));
    await assertFails(setDoc(doc(dbAs(MEMBER), 'groups', GROUP, 'rooms', 'familie'), { name: 'Familie', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'rooms', 'familie'), { name: '', createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'rooms', 'familie'), { name: 'Familie', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(dbAs(ADMIN), 'groups', GROUP, 'rooms', 'urlaub'), { name: 'Urlaub', createdAt: serverTimestamp() }));
  });
});
