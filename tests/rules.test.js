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
  query, orderBy, limit, serverTimestamp, Timestamp, arrayUnion, setLogLevel,
} from 'firebase/firestore';

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

const messages = (db) => collection(db, 'rooms', 'familie', 'messages');

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
    await setDoc(doc(db, 'config', 'access'), {
      members: [MEMBER.email, MEMBER2.email],
      admins: [ADMIN.email],
    });
    await setDoc(doc(db, 'rooms', 'familie'), { name: 'Familie', createdAt: Timestamp.now() });
    await setDoc(doc(db, 'rooms', 'familie', 'messages', 'm_anna'), {
      uid: MEMBER.uid, name: MEMBER.name, photo: MEMBER.picture, text: 'Von Anna', createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'rooms', 'familie', 'messages', 'm_ben'), {
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
    await assertFails(getDoc(doc(db, 'config', 'access')));
    await assertFails(getDocs(messages(db)));
    await assertFails(getDoc(doc(db, 'rooms', 'familie')));
  });

  it('stranger (not on the allow list) is denied everywhere', async () => {
    const db = dbAs(STRANGER);
    await assertFails(getDoc(doc(db, 'config', 'access')));
    await assertFails(getDoc(doc(db, 'rooms', 'familie')));
    await assertFails(getDocs(messages(db)));
    await assertFails(getDoc(doc(db, 'rooms', 'familie', 'messages', 'm_anna')));
    await assertFails(addDoc(messages(db), messageFrom(STRANGER)));
    await assertFails(deleteDoc(doc(db, 'rooms', 'familie', 'messages', 'm_anna')));
    await assertFails(updateDoc(doc(db, 'config', 'access'), { members: [STRANGER.email] }));
    await assertFails(setDoc(doc(db, 'rooms', 'neu'), { name: 'Neu', createdAt: serverTimestamp() }));
    await assertFails(getDoc(doc(db, 'secrets', 'x')));
  });

  it('listed mail that is not verified is denied', async () => {
    const db = dbAs(MEMBER, { email_verified: false });
    await assertFails(getDocs(messages(db)));
    await assertFails(addDoc(messages(db), messageFrom(MEMBER)));
  });

  it('listed mail signed in with another provider than Google is denied', async () => {
    const db = dbAs(MEMBER, { firebase: { sign_in_provider: 'password' } });
    await assertFails(getDocs(messages(db)));
    await assertFails(getDoc(doc(db, 'config', 'access')));
  });

  it('mail on the list is matched without regard to upper or lower case', async () => {
    const db = dbAs(MEMBER, { email: 'Anna@Example.com' });
    await assertSucceeds(getDoc(doc(db, 'config', 'access')));
  });
});

describe('members in the chat', () => {
  it('member can read the allow list, the room and the messages', async () => {
    const db = dbAs(MEMBER);
    await assertSucceeds(getDoc(doc(db, 'config', 'access')));
    await assertSucceeds(getDoc(doc(db, 'rooms', 'familie')));
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
    await assertSucceeds(deleteDoc(doc(dbAs(MEMBER), 'rooms', 'familie', 'messages', 'm_anna')));
  });

  it('member cannot delete another member\'s message', async () => {
    await assertFails(deleteDoc(doc(dbAs(MEMBER), 'rooms', 'familie', 'messages', 'm_ben')));
  });

  it('nobody can edit a message, not even the sender', async () => {
    await assertFails(updateDoc(doc(dbAs(MEMBER), 'rooms', 'familie', 'messages', 'm_anna'), { text: 'Geändert' }));
    await assertFails(updateDoc(doc(dbAs(ADMIN), 'rooms', 'familie', 'messages', 'm_anna'), { text: 'Geändert' }));
  });

  it('member cannot write into a room that does not exist', async () => {
    const db = dbAs(MEMBER);
    await assertFails(addDoc(collection(db, 'rooms', 'geheim', 'messages'), messageFrom(MEMBER)));
  });

  it('member cannot create rooms or change the allow list', async () => {
    const db = dbAs(MEMBER);
    await assertFails(setDoc(doc(db, 'rooms', 'neu'), { name: 'Neu', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'config', 'access'), {
      members: arrayUnion(STRANGER.email), updatedAt: serverTimestamp(), updatedBy: MEMBER.email,
    }));
    await assertFails(updateDoc(doc(db, 'config', 'access'), {
      admins: arrayUnion(MEMBER.email), updatedAt: serverTimestamp(), updatedBy: MEMBER.email,
    }));
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
    await assertSucceeds(deleteDoc(doc(dbAs(ADMIN), 'rooms', 'familie', 'messages', 'm_anna')));
    await assertSucceeds(deleteDoc(doc(dbAs(ADMIN), 'rooms', 'familie', 'messages', 'm_ben')));
  });

  it('admin can add and remove members and admins', async () => {
    const db = dbAs(ADMIN);
    await assertSucceeds(updateDoc(doc(db, 'config', 'access'), {
      members: [MEMBER.email, STRANGER.email],
      admins: [ADMIN.email, MEMBER.email],
      updatedAt: serverTimestamp(),
      updatedBy: ADMIN.email,
    }));
    // The new member can now read, the removed one (Ben) cannot.
    await assertSucceeds(getDocs(messages(dbAs(STRANGER))));
    await assertFails(getDocs(messages(dbAs(MEMBER2))));
    // The new admin can delete any message.
    await assertSucceeds(deleteDoc(doc(dbAs(MEMBER), 'rooms', 'familie', 'messages', 'm_ben')));
  });

  it('admin cannot remove themselves from the admins', async () => {
    await assertFails(updateDoc(doc(dbAs(ADMIN), 'config', 'access'), {
      admins: [MEMBER.email], updatedAt: serverTimestamp(), updatedBy: ADMIN.email,
    }));
  });

  it('admin changes must carry server time and the admin\'s own mail', async () => {
    const db = dbAs(ADMIN);
    await assertFails(updateDoc(doc(db, 'config', 'access'), { members: [MEMBER.email] }));
    await assertFails(updateDoc(doc(db, 'config', 'access'), {
      members: [MEMBER.email], updatedAt: serverTimestamp(), updatedBy: 'someone@example.com',
    }));
    await assertFails(updateDoc(doc(db, 'config', 'access'), {
      members: [MEMBER.email], updatedAt: serverTimestamp(), updatedBy: ADMIN.email, extra: true,
    }));
  });

  it('allow list entries must be lower case mail addresses, each only once', async () => {
    const db = dbAs(ADMIN);
    const save = (members, admins = [ADMIN.email]) => updateDoc(doc(db, 'config', 'access'), {
      members, admins, updatedAt: serverTimestamp(), updatedBy: ADMIN.email,
    });
    await assertSucceeds(save([]));
    await assertSucceeds(save(['anna@example.com', 'o.brien+fh@mail.example.co.uk', "d'arc@example.fr"]));
    await assertFails(save(['Anna@Example.com']));
    await assertFails(save(['anna@example.com', 'anna@example.com']));
    await assertFails(save(['not a mail']));
    await assertFails(save(['anna@example']));
    await assertFails(save(['anna@example.com|ben@example.com']));
    await assertFails(save([42]));
    await assertFails(save([], [ADMIN.email, 'Chef2@example.com']));
    await assertFails(save([], [ADMIN.email, ADMIN.email]));
  });

  it('nobody can delete or recreate the allow list from the app', async () => {
    await assertFails(deleteDoc(doc(dbAs(ADMIN), 'config', 'access')));
  });

  it('admin can create a room with a valid name', async () => {
    const db = dbAs(ADMIN);
    await assertSucceeds(setDoc(doc(db, 'rooms', 'urlaub'), { name: 'Urlaub', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'rooms', 'leer'), { name: '', createdAt: serverTimestamp() }));
  });
});
