// Tests for setting up and joining groups (no network, no emulator: a small
// in-memory stand-in for the Firestore Admin SDK).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeCode, normalizeCode, hashPassword, passwordMatches, triesLeft, addWrongTry, caller,
  createGroup, joinGroup, setGroupPassword, PERSON_TRIES, TRY_WINDOW_MS, GROUPS_PER_PERSON,
} from '../groups.js';

/** Just enough of the Admin SDK for groups.js: docs, auto IDs, count, transactions. */
function memoryDb() {
  const docs = new Map();
  let nextId = 1;
  const snap = (path) => ({ exists: docs.has(path), data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined) });
  const docRef = (path) => ({
    path,
    id: path.split('/').pop(),
    get: async () => snap(path),
    set: async (data) => { docs.set(path, structuredClone(data)); },
    collection: (name) => collectionRef(`${path}/${name}`),
  });
  const inCollection = (path, p) => p.startsWith(`${path}/`) && p.split('/').length === path.split('/').length + 1;
  const collectionRef = (path) => ({
    doc: (id = `auto${nextId++}`) => docRef(`${path}/${id}`),
    where: (field, op, value) => ({
      count: () => ({
        get: async () => {
          const n = [...docs.entries()].filter(([p, d]) => inCollection(path, p) && d[field] === value).length;
          return { data: () => ({ count: n }) };
        },
      }),
    }),
  });
  return {
    docs,
    doc: docRef,
    collection: collectionRef,
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: async (ref) => snap(ref.path),
        create: (ref, data) => writes.push(() => { if (docs.has(ref.path)) throw new Error('exists'); docs.set(ref.path, structuredClone(data)); }),
        set: (ref, data, opts) => writes.push(() => docs.set(ref.path, opts?.merge ? { ...(docs.get(ref.path) || {}), ...structuredClone(data) } : structuredClone(data))),
        update: (ref, data) => writes.push(() => docs.set(ref.path, { ...docs.get(ref.path), ...structuredClone(data) })),
        delete: (ref) => writes.push(() => docs.delete(ref.path)),
      };
      const result = await fn(tx);
      for (const w of writes) w();
      return result;
    },
  };
}

const authFor = (uid, extra = {}) => ({
  uid,
  token: { email: `${uid}@Example.com`, email_verified: true, name: `Name ${uid}`, firebase: { sign_in_provider: 'google.com' }, ...extra },
});
const NOW = new Date('2026-11-09T12:00:00Z');
const fixedRandom = () => Buffer.from([0, 1, 2, 3]);
const join = (db, uid, code, password, now = NOW) => joinGroup({ db, auth: authFor(uid), data: { code, password }, now });

async function setUp() {
  const db = memoryDb();
  const { groupId, code } = await createGroup({
    db, auth: authFor('chef'), data: { name: 'Familie', icon: '🏡', password: 'geheim123' }, now: NOW, random: fixedRandom,
  });
  return { db, groupId, code };
}

describe('group codes', () => {
  it('start with three letters of the name and use no look-alike characters', () => {
    assert.equal(makeCode('Familie', Buffer.from([0, 1, 2, 3])), 'FAM ABCD');
    assert.equal(makeCode('Öhm', Buffer.from([30, 31, 32, 33])), 'OHM 9ABC');
    assert.equal(makeCode('42', Buffer.from([0, 0, 0, 0])), 'GRP AAAA');
    assert.match(makeCode('x', Buffer.from([255, 128, 77, 9])), /^XGR [A-HJKMNP-Z2-9]{4}$/);
  });

  it('are understood with any case, spaces or without the dash', () => {
    assert.equal(normalizeCode('fam-7k2q'), 'FAM 7K2Q');
    assert.equal(normalizeCode(' FAM 7K2Q '), 'FAM 7K2Q');
    assert.equal(normalizeCode('fam7k2q'), 'FAM 7K2Q');
    assert.equal(normalizeCode('FAM-7K2'), '');
    assert.equal(normalizeCode(42), '');
  });
});

describe('passwords and wrong tries', () => {
  it('a stored password matches only itself', async () => {
    const secret = await hashPassword('geheim123');
    assert.notEqual(secret.hash, 'geheim123');
    assert.equal(await passwordMatches('geheim123', secret), true);
    assert.equal(await passwordMatches('geheim124', secret), false);
    assert.equal(await passwordMatches(undefined, secret), false);
  });

  it('wrong tries count for one hour', () => {
    let rec = null;
    for (let i = 0; i < PERSON_TRIES; i += 1) rec = addWrongTry(rec, 1000);
    assert.equal(triesLeft(rec, 1000, PERSON_TRIES), 0);
    assert.equal(triesLeft(rec, 1000 + TRY_WINDOW_MS, PERSON_TRIES), PERSON_TRIES);
    assert.deepEqual(addWrongTry(rec, 1000 + TRY_WINDOW_MS), { count: 1, since: 1000 + TRY_WINDOW_MS });
  });

  it('only signed in people with a confirmed mail may call', () => {
    assert.throws(() => caller(null), /signin/);
    assert.throws(() => caller(authFor('a', { email_verified: false })), /signin/);
    assert.throws(() => caller(authFor('a', { firebase: { sign_in_provider: 'anonymous' } })), /signin/);
    assert.equal(caller(authFor('a', { firebase: { sign_in_provider: 'password' } })).mail, 'a@example.com');
  });
});

describe('setting up a group', () => {
  it('makes the caller its admin, keeps only a hash of the password, markets locked', async () => {
    const { db, groupId, code } = await setUp();
    assert.equal(code, 'FAM ABCD');
    const group = db.docs.get(`groups/${groupId}`);
    assert.equal(group.name, 'Familie');
    assert.equal(group.marketsUnlocked, false);
    assert.equal(group.features.markets, false);
    assert.equal(group.features.chat, true);
    assert.equal(db.docs.get(`groups/${groupId}/members/chef`).role, 'admin');
    assert.equal(db.docs.get(`groupCodes/${code}`).group, groupId);
    assert.ok(!JSON.stringify(db.docs.get(`groupSecrets/${groupId}`)).includes('geheim123'));
  });

  it('refuses a missing name, a long icon or a short password', async () => {
    const db = memoryDb();
    const make = (data) => createGroup({ db, auth: authFor('a'), data: { name: 'Gruppe', icon: '🌳', password: 'geheim123', ...data } });
    await assert.rejects(make({ name: '  ' }), /name/);
    await assert.rejects(make({ icon: 'x'.repeat(9) }), /icon/);
    await assert.rejects(make({ password: 'kurz' }), /password/);
  });

  it('takes another code when one is already used', async () => {
    const { db } = await setUp();
    let calls = 0;
    const random = () => (calls++ === 0 ? Buffer.from([0, 1, 2, 3]) : Buffer.from([4, 5, 6, 7]));
    const second = await createGroup({ db, auth: authFor('chef'), data: { name: 'Familie', icon: '🏡', password: 'geheim123' }, random });
    assert.equal(second.code, 'FAM EFGH');
  });

  it('one person sets up at most a few groups', async () => {
    const db = memoryDb();
    let n = 0;
    const random = () => Buffer.from([n++, 0, 0, 0]);
    const make = () => createGroup({ db, auth: authFor('a'), data: { name: 'Gruppe', icon: '🌳', password: 'geheim123' }, random });
    for (let i = 0; i < GROUPS_PER_PERSON; i += 1) await make();
    await assert.rejects(make(), /too-many-groups/);
  });
});

describe('joining a group', () => {
  it('the right code and password make the caller a member', async () => {
    const { db, groupId } = await setUp();
    assert.deepEqual(await join(db, 'anna', 'fam abcd', 'geheim123'), { groupId, joined: true });
    assert.equal(db.docs.get(`groups/${groupId}/members/anna`).role, 'member');
    assert.equal(db.docs.get(`groups/${groupId}/members/anna`).mail, 'anna@example.com');
    assert.equal(db.docs.has('marketAccess/anna'), false);
  });

  it('joining twice changes nothing (an admin stays admin)', async () => {
    const { db, groupId } = await setUp();
    assert.deepEqual(await join(db, 'chef', 'FAM ABCD', 'geheim123'), { groupId, joined: false });
    assert.equal(db.docs.get(`groups/${groupId}/members/chef`).role, 'admin');
  });

  it('wrong password and unknown code look the same', async () => {
    const { db } = await setUp();
    await assert.rejects(join(db, 'anna', 'FAM ABCD', 'falsch123'), /wrong/);
    await assert.rejects(join(db, 'anna', 'XYZ ABCD', 'geheim123'), /wrong/);
  });

  it('after 5 wrong tries even the right password waits an hour', async () => {
    const { db, groupId } = await setUp();
    for (let i = 0; i < PERSON_TRIES; i += 1) await assert.rejects(join(db, 'anna', 'FAM ABCD', 'falsch123'), /wrong/);
    await assert.rejects(join(db, 'anna', 'FAM ABCD', 'geheim123'), /locked/);
    const later = new Date(NOW.getTime() + TRY_WINDOW_MS);
    assert.deepEqual(await join(db, 'anna', 'FAM ABCD', 'geheim123', later), { groupId, joined: true });
    assert.equal(db.docs.has('joinAttempts/anna'), false);
  });

  it('many accounts guessing one group lock that group for an hour', async () => {
    const { db } = await setUp();
    for (let i = 0; i < 20; i += 1) await assert.rejects(join(db, `bot${i}`, 'FAM ABCD', 'falsch123'), /wrong/);
    await assert.rejects(join(db, 'anna', 'FAM ABCD', 'geheim123'), /locked/);
  });

  it('a group with unlocked markets gives market access on joining', async () => {
    const { db, groupId } = await setUp();
    db.docs.set(`groups/${groupId}`, { ...db.docs.get(`groups/${groupId}`), marketsUnlocked: true });
    await join(db, 'anna', 'FAM ABCD', 'geheim123');
    assert.ok(db.docs.has('marketAccess/anna'));
  });
});

describe('changing the group password', () => {
  it('only an admin may, and the old password stops working', async () => {
    const { db, groupId } = await setUp();
    await join(db, 'anna', 'FAM ABCD', 'geheim123');
    await assert.rejects(setGroupPassword({ db, auth: authFor('anna'), data: { groupId, password: 'neues-pw-1' } }), /admin/);
    await setGroupPassword({ db, auth: authFor('chef'), data: { groupId, password: 'neues-pw-1' } });
    await assert.rejects(join(db, 'ben', 'FAM ABCD', 'geheim123'), /wrong/);
    assert.equal((await join(db, 'ben', 'FAM ABCD', 'neues-pw-1')).joined, true);
  });
});
