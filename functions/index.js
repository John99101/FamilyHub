// FamilyHub Cloud Functions (Node.js 22, firebase-functions v2 API).
// Both run on Google's servers on a timer; no computer of yours has to be on.
//
// marketUpdate: every 30 minutes on US trading days during regular hours
// (09:30 to 16:00 New York time), plus one run 30 minutes after the close.
// It fetches delayed US quotes from NGN Market and stores them in Firestore.
// The run after the close also stores daily closes and computes the risk
// figures (market/risk) in plain code.
//
// riskSummary: 17:15 New York time on weekdays. Sends the computed risk
// figures (numbers only) to Claude Opus 5.5 and stores a short note in
// English and French (market/riskSummary).
//
// weeklyDigest: Sunday 17:00 Berlin time. Sends the coming week's calendar
// entries, due tasks and open polls (no chat, contacts or recipes) to Claude
// Opus 5.5 and stores a short overview in German, English and French
// (digest/current). If nothing is planned, nothing is sent.
//
// translateMessage: when someone asks for a chat translation (a new
// translations/{id} document, allowed by the rules only for people who may
// read that message), sends that one message to Claude Opus 5.5 and stores
// the translation. Limited to 100 translations per person and day.
//
// cleanupRoom: when a chat room is deleted in the app, deletes its messages
// and their translations.
// cleanupHousehold: when an admin deletes a household, deletes everything in
// it (calendar, tasks, polls, trips, notes, chat room with messages and
// translations, weekly overview).
//
// The browser only ever reads and writes Firestore; it never talks to NGN
// Market or Anthropic and never sees a key. Keys live only in Secret Manager.
import { onSchedule } from 'firebase-functions/scheduler';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import { createNgnClient } from './ngn-client.js';
import { createFirestoreStore } from './firestore-store.js';
import { runMarketUpdate } from './market.js';
import { runRiskSummary } from './ai-summary.js';
import { runAllDigests, DIGEST_TIME_ZONE } from './digest.js';
import { runTranslation } from './translate.js';

const NGN_API_KEY = defineSecret('NGN_API_KEY');
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

initializeApp();

export const marketUpdate = onSchedule(
  {
    // Every 30 minutes from 09:00 to 16:30 New York time, Monday to Friday.
    // The code skips 09:00 (before the open), holidays, and runs after an early close.
    schedule: '*/30 9-16 * * 1-5',
    timeZone: 'America/New_York',
    region: 'europe-west3',
    secrets: [NGN_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
    retryCount: 0, // never retry automatically; the next scheduled run tries again
  },
  async () => {
    const result = await runMarketUpdate({
      client: createNgnClient({ apiKey: NGN_API_KEY.value() }),
      store: createFirestoreStore(getFirestore()),
      now: new Date(),
      logger,
    });
    if (result.kind === 'skip' && result.calls === 0) logger.debug('NGN market run skipped', { reason: result.reason });
  },
);

export const riskSummary = onSchedule(
  {
    // Once per weekday, 45 minutes after the market run that computes the risk figures.
    schedule: '15 17 * * 1-5',
    timeZone: 'America/New_York',
    region: 'europe-west3',
    secrets: [ANTHROPIC_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 300,
    maxInstances: 1,
    retryCount: 0, // a failed day simply has no new summary; the last one stays visible
  },
  async () => {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 1, timeout: 180000 });
    const result = await runRiskSummary({
      anthropic,
      store: createFirestoreStore(getFirestore()),
      now: new Date(),
      logger,
    });
    if (result.kind === 'skip') logger.info('AI summary skipped', { reason: result.reason });
  },
);

export const weeklyDigest = onSchedule(
  {
    schedule: '0 17 * * 0', // Sunday 17:00
    timeZone: DIGEST_TIME_ZONE,
    region: 'europe-west3',
    secrets: [ANTHROPIC_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 300,
    maxInstances: 1,
    retryCount: 0, // a failed week keeps the last overview visible
  },
  async () => {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 1, timeout: 180000 });
    // The family overview, then one per household.
    const result = await runAllDigests({
      anthropic,
      store: createFirestoreStore(getFirestore()),
      now: new Date(),
      logger,
    });
    if (result.kind === 'skip') logger.info('Weekly overview skipped', { reason: result.reason });
  },
);

// Deleting a room in the app removes the room document; its messages are
// deleted here (the app itself may only delete each person's own messages).
export const cleanupRoom = onDocumentDeleted(
  { document: 'rooms/{roomId}', region: 'europe-west3', memory: '256MiB', timeoutSeconds: 300, maxInstances: 1 },
  async (event) => {
    const roomId = event.params.roomId;
    if (roomId === 'familie') return;
    const db = getFirestore();
    await db.recursiveDelete(db.collection('rooms').doc(roomId).collection('messages'));
    await deleteTranslations(db, '', roomId);
    logger.info('Messages of a deleted room removed', { roomId });
  },
);

/** Translations of a deleted room (or of all rooms of a deleted household). */
async function deleteTranslations(db, household, roomId) {
  let q = db.collection('translations').where('household', '==', household);
  if (roomId) q = q.where('roomId', '==', roomId);
  const snap = await q.get();
  const writer = db.bulkWriter();
  for (const d of snap.docs) writer.delete(d.ref);
  await writer.close();
}

// A new translation request: read that one message, ask Claude, store the result.
export const translateMessage = onDocumentCreated(
  {
    document: 'translations/{id}', region: 'europe-west3', secrets: [ANTHROPIC_API_KEY],
    memory: '256MiB', timeoutSeconds: 120, maxInstances: 3, retry: false,
  },
  async (event) => {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 1, timeout: 60000 });
    await runTranslation({
      anthropic,
      store: createFirestoreStore(getFirestore()),
      id: event.params.id,
      request: event.data?.data(),
      now: new Date(),
      logger,
    });
  },
);

export const cleanupHousehold = onDocumentDeleted(
  { document: 'households/{householdId}', region: 'europe-west3', memory: '256MiB', timeoutSeconds: 300, maxInstances: 1 },
  async (event) => {
    const { householdId } = event.params;
    const db = getFirestore();
    // Deletes every collection below the (already deleted) household document.
    await db.recursiveDelete(db.collection('households').doc(householdId));
    await deleteTranslations(db, householdId, '');
    logger.info('Contents of a deleted household removed', { householdId });
  },
);
