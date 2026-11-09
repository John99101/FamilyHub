// One time move of the family's data (from before groups) into the group
// "Familie". Run by the owner with functions/scripts/migrate-to-groups.mjs.
// The old data stays where it is; nothing is deleted.
import { FEATURES, makeCode, hashPassword, checkPasswordRules } from './groups.js';

export const GROUP_ID = 'familie';

// Top level data that belongs to the person or the whole app, not to a group.
const GLOBAL = new Set(['groups', 'groupCodes', 'groupSecrets', 'nicknames', 'market', 'marketHistory', 'marketAccess', 'translateUsage', 'joinAttempts']);
// Of the config documents, only these belong to the group.
const GROUP_CONFIG = new Set(['digest', 'translate']);

/** Whether the top level document collection/id is family data to copy into the group. */
export function belongsToGroup(collection, id) {
  if (GLOBAL.has(collection)) return false;
  return collection !== 'config' || GROUP_CONFIG.has(id);
}

/**
 * Who becomes a member: every mail of the old allow list, admins stay admins.
 * people: [{ uid, mail, name }] from the old people documents; findAccount(mail)
 * returns { uid, name } or null (the sign in accounts).
 */
export async function planMembers(access, people, findAccount) {
  const admins = new Set((access?.admins || []).map((m) => String(m).toLowerCase()));
  const mails = [...new Set([...admins, ...(access?.members || []).map((m) => String(m).toLowerCase())])];
  const byMail = new Map(people.filter((p) => typeof p.mail === 'string').map((p) => [p.mail.toLowerCase(), p]));
  const members = [];
  const missing = [];
  for (const mail of mails) {
    const known = byMail.get(mail) || (await findAccount(mail));
    if (!known?.uid) { missing.push(mail); continue; }
    members.push({ uid: known.uid, mail, name: String(known.name || mail).slice(0, 80), role: admins.has(mail) ? 'admin' : 'member' });
  }
  return { members, missing };
}

/** Copies a collection with all documents and subcollections (also parents that only hold subcollections). */
async function copyCollection(from, to, writer, skip, counter) {
  for (const ref of await from.listDocuments()) {
    const snap = await ref.get();
    if (snap.exists && !skip(snap)) {
      writer.set(to.doc(ref.id), snap.data());
      counter.docs += 1;
    }
    for (const sub of await ref.listCollections()) {
      await copyCollection(sub, to.doc(ref.id).collection(sub.id), writer, skip, counter);
    }
  }
}

/**
 * The whole move. write: false only reports what would happen. Returns
 * { code, members, missing, collections, docs }.
 */
export async function migrateToGroups({ db, findAccount, password, write = false, now = new Date(), log = console.log }) {
  if ((await db.doc(`groups/${GROUP_ID}`).get()).exists) throw new Error(`groups/${GROUP_ID} already exists. The move was done before.`);
  const access = (await db.doc('config/access').get()).data();
  if (!access) throw new Error('config/access not found: nothing to move.');
  const people = (await db.collection('people').get()).docs.map((d) => ({ uid: d.id, mail: d.get('mail'), name: d.get('name') }));
  const { members, missing } = await planMembers(access, people, findAccount);
  const owner = members.find((m) => m.role === 'admin');
  if (!owner) throw new Error('No admin of the old allow list has an account. Stopping.');

  const collections = (await db.listCollections()).filter((col) => !GLOBAL.has(col.id));
  log(`Members: ${members.map((m) => `${m.mail} (${m.role})`).join(', ')}`);
  if (missing.length) log(`Without an account (they join later with code and password): ${missing.join(', ')}`);
  log(`Collections to copy: ${collections.map((c) => c.id).join(', ')}`);
  if (!write) return { code: '', members, missing, collections: collections.map((c) => c.id), docs: 0 };

  checkPasswordRules(password);
  const code = makeCode('Familie');
  const secret = await hashPassword(password);
  const group = db.doc(`groups/${GROUP_ID}`);
  await db.runTransaction(async (tx) => {
    const codeRef = db.doc(`groupCodes/${code}`);
    if ((await tx.get(codeRef)).exists) throw new Error('Code clash, please run again.');
    tx.create(codeRef, { group: GROUP_ID });
    tx.create(group, {
      name: 'Familie', icon: '🏡', code,
      features: Object.fromEntries(FEATURES.map((f) => [f, true])),
      design: {},
      marketsUnlocked: true,
      createdBy: owner.uid, createdAt: now, updatedAt: now, updatedBy: owner.uid,
    });
    tx.create(db.doc(`groupSecrets/${GROUP_ID}`), { ...secret, fails: 0, since: 0 });
  });

  const writer = db.bulkWriter();
  for (const m of members) {
    writer.set(group.collection('members').doc(m.uid), { ...m, joinedAt: now });
    writer.set(db.doc(`marketAccess/${m.uid}`), m.role === 'admin' ? { admin: true } : {});
  }
  const counter = { docs: 0 };
  // An open translation request would ask Claude again for an old message.
  const skip = (snap) => (snap.ref.parent.id === 'config' && !belongsToGroup('config', snap.id))
    || (snap.ref.parent.id === 'translations' && snap.get('status') === 'pending');
  for (const col of collections) await copyCollection(col, group.collection(col.id), writer, skip, counter);
  await writer.close();
  return { code, members, missing, collections: collections.map((c) => c.id), docs: counter.docs };
}
