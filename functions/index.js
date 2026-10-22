// FamilyHub Cloud Functions (Node.js 22, firebase-functions v2 API).
//
// marketUpdate: every 30 minutes on US trading days during regular hours
// (09:30 to 16:00 New York time), plus one run 30 minutes after the close.
// It fetches delayed US quotes from NGN Market and stores them in Firestore.
// The browser only ever reads Firestore; it never talks to NGN Market and
// never sees the key, which lives only in Secret Manager (NGN_API_KEY).
import { onSchedule } from 'firebase-functions/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createNgnClient } from './ngn-client.js';
import { createFirestoreStore } from './firestore-store.js';
import { runMarketUpdate } from './market.js';

const NGN_API_KEY = defineSecret('NGN_API_KEY');

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
