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
// The browser only ever reads Firestore; it never talks to NGN Market or
// Anthropic and never sees a key. Keys live only in Secret Manager.
import { onSchedule } from 'firebase-functions/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import { createNgnClient } from './ngn-client.js';
import { createFirestoreStore } from './firestore-store.js';
import { runMarketUpdate } from './market.js';
import { runRiskSummary } from './ai-summary.js';

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
