// Groups: set up a group, join one with its code and password, change the
// password. Called from the app through the callable functions in index.js.
//
//   groups/{g}                 { name, icon, code, features, design, marketsUnlocked, createdBy, createdAt, updatedAt, updatedBy }
//   groups/{g}/members/{uid}   { uid, mail, name, role: 'admin' | 'member', joinedAt }
//   groupCodes/{code}          { group }                     code → group (so every code is used once)
//   groupSecrets/{g}           { salt, hash, fails, since }  the password (scrypt), wrong tries for the group
//   joinAttempts/{uid}         { count, since }              wrong tries of one person
//   marketAccess/{uid}         { grantedAt }                 given when joining a group whose markets are unlocked
//
// The app can read none of the last four except its own marketAccess.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export const FEATURES = ['chat', 'calendar', 'tasks', 'polls', 'trips', 'board', 'tree', 'question',
  'recipes', 'contacts', 'weather', 'markets'];
export const NAME_MAX = 40;
export const ICON_MAX = 8;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 100;
export const PERSON_TRIES = 5;   // wrong tries per person and hour
export const GROUP_TRIES = 20;   // wrong tries per group and hour (against many accounts)
export const TRY_WINDOW_MS = 60 * 60 * 1000;
export const GROUPS_PER_PERSON = 10;

// No 0/O, 1/I/L: codes are read aloud and typed on phones.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A clear message for the app; code is one of the callable error codes. */
export class GroupError extends Error {
  constructor(code, reason) {
    super(reason);
    this.code = code;
    this.reason = reason;
  }
}

/** 'FAM 7K2Q' (a space, no dash: codes are shown in the app): three letters from the name, then four random characters. */
export function makeCode(name, bytes = randomBytes(4)) {
  const letters = String(name).normalize('NFD').toUpperCase().replace(/[^A-Z]/g, '');
  const prefix = (letters + 'GRP').slice(0, 3);
  const tail = [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  return `${prefix} ${tail}`;
}

/** What people type: any case, spaces or a missing dash are fine. */
export function normalizeCode(input) {
  if (typeof input !== 'string') return '';
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.length === 7 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : '';
}

export function checkGroupInput({ name, icon, password }) {
  if (typeof name !== 'string' || !name.trim() || name.length > NAME_MAX) throw new GroupError('invalid-argument', 'name');
  if (typeof icon !== 'string' || !icon.trim() || icon.length > ICON_MAX) throw new GroupError('invalid-argument', 'icon');
  checkPasswordRules(password);
  return { name: name.trim(), icon: icon.trim() };
}

export function checkPasswordRules(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new GroupError('invalid-argument', 'password');
  }
}

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = (await scryptAsync(password, salt, 32)).toString('hex');
  return { salt, hash };
}

export async function passwordMatches(password, secret) {
  if (typeof password !== 'string' || !secret || !secret.salt || !secret.hash) return false;
  const { hash } = await hashPassword(password, secret.salt);
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(secret.hash, 'hex'));
}

/** Wrong tries within the last hour; older ones no longer count. */
export function triesLeft(record, now, limit) {
  if (!record || now - record.since >= TRY_WINDOW_MS) return limit;
  return Math.max(0, limit - record.count);
}

export function addWrongTry(record, now) {
  if (!record || now - record.since >= TRY_WINDOW_MS) return { count: 1, since: now };
  return { count: record.count + 1, since: record.since };
}

/** Who calls: signed in, mail confirmed, Google or mail and password. */
export function caller(auth) {
  const token = auth?.token;
  if (!auth?.uid || !token || typeof token.email !== 'string' || token.email_verified !== true
    || !['google.com', 'password'].includes(token.firebase?.sign_in_provider)) {
    throw new GroupError('unauthenticated', 'signin');
  }
  const mail = token.email.toLowerCase();
  return { uid: auth.uid, mail, name: String(token.name || mail.split('@')[0]).slice(0, 100) };
}

const memberEntry = (who, role, now) => ({ uid: who.uid, mail: who.mail, name: who.name, role, joinedAt: now });

/**
 * Sets up a group with the caller as its admin. Pages and look are set by the
 * app right after (the security rules check them).
 * @returns {Promise<{ groupId: string, code: string }>}
 */
export async function createGroup({ db, auth, data, now = new Date(), random = randomBytes }) {
  const who = caller(auth);
  const { name, icon } = checkGroupInput(data || {});
  const made = await db.collection('groups').where('createdBy', '==', who.uid).count().get();
  if (made.data().count >= GROUPS_PER_PERSON) throw new GroupError('resource-exhausted', 'too-many-groups');

  const secret = await hashPassword(data.password);
  const ref = db.collection('groups').doc();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeCode(name, random(4));
    const codeRef = db.doc(`groupCodes/${code}`);
    const created = await db.runTransaction(async (tx) => {
      if ((await tx.get(codeRef)).exists) return false;
      tx.create(codeRef, { group: ref.id });
      tx.create(ref, {
        name, icon, code,
        features: Object.fromEntries(FEATURES.map((f) => [f, f !== 'markets'])),
        design: {},
        marketsUnlocked: false,
        createdBy: who.uid, createdAt: now, updatedAt: now, updatedBy: who.uid,
      });
      tx.create(db.doc(`groupSecrets/${ref.id}`), { ...secret, fails: 0, since: 0 });
      tx.create(ref.collection('members').doc(who.uid), memberEntry(who, 'admin', now));
      return true;
    });
    if (created) return { groupId: ref.id, code };
  }
  throw new GroupError('internal', 'code');
}

/**
 * Joins the group with this code if the password is right. Wrong codes and
 * wrong passwords look the same and count against the person (5 per hour)
 * and, for a known code, against the group (20 per hour).
 * @returns {Promise<{ groupId: string, joined: boolean }>}
 */
export async function joinGroup({ db, auth, data, now = new Date() }) {
  const who = caller(auth);
  const code = normalizeCode(data?.code);
  const password = data?.password;
  const ms = now.getTime();
  const personRef = db.doc(`joinAttempts/${who.uid}`);

  const result = await db.runTransaction(async (tx) => {
    const person = (await tx.get(personRef)).data();
    if (triesLeft(person, ms, PERSON_TRIES) === 0) return { error: 'locked' };
    const groupId = code ? (await tx.get(db.doc(`groupCodes/${code}`))).data()?.group : null;
    const secretRef = groupId ? db.doc(`groupSecrets/${groupId}`) : null;
    const secret = secretRef ? (await tx.get(secretRef)).data() : null;
    if (secret && triesLeft({ count: secret.fails, since: secret.since }, ms, GROUP_TRIES) === 0) return { error: 'locked' };
    const groupRef = groupId ? db.doc(`groups/${groupId}`) : null;
    const memberRef = groupRef ? groupRef.collection('members').doc(who.uid) : null;
    // All reads come before the writes in a transaction.
    const group = groupRef ? (await tx.get(groupRef)).data() : null;
    const member = memberRef ? await tx.get(memberRef) : null;

    if (!secret || !(await passwordMatches(password, secret))) {
      tx.set(personRef, addWrongTry(person, ms));
      if (secret) {
        const next = addWrongTry({ count: secret.fails, since: secret.since }, ms);
        tx.update(secretRef, { fails: next.count, since: next.since });
      }
      return { error: 'wrong' };
    }

    if (person) tx.delete(personRef);
    if (member.exists) return { groupId, joined: false };
    tx.create(memberRef, memberEntry(who, 'member', now));
    if (group?.marketsUnlocked === true) tx.set(db.doc(`marketAccess/${who.uid}`), { grantedAt: now }, { merge: true });
    return { groupId, joined: true };
  });

  if (result.error === 'locked') throw new GroupError('resource-exhausted', 'locked');
  if (result.error) throw new GroupError('permission-denied', 'wrong');
  return result;
}

/** A group admin sets a new password (the old one stops working at once). */
export async function setGroupPassword({ db, auth, data }) {
  const who = caller(auth);
  const groupId = typeof data?.groupId === 'string' ? data.groupId : '';
  checkPasswordRules(data?.password);
  if (!/^[A-Za-z0-9]{1,40}$/.test(groupId)) throw new GroupError('invalid-argument', 'group');
  const member = await db.doc(`groups/${groupId}/members/${who.uid}`).get();
  if (!member.exists || member.data().role !== 'admin') throw new GroupError('permission-denied', 'admin');
  await db.doc(`groupSecrets/${groupId}`).set({ ...(await hashPassword(data.password)), fails: 0, since: 0 });
  return { ok: true };
}
