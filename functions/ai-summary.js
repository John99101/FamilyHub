// Daily AI summary of the risk figures (English and French), written by
// Claude Opus 5.5. The model only gets the numbers that risk.js computed;
// it does not calculate, does not get chat messages, and must not give advice.
import { nyParts } from './market.js';

export const AI_MODEL = 'claude-opus-5-5';
export const AI_EFFORT = 'medium';
export const AI_MAX_TOKENS = 8000;          // room for thinking plus two short notes
export const SUMMARY_MAX_CHARS = 1200;

export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    en: { type: 'string' },
    fr: { type: 'string' },
  },
  required: ['en', 'fr'],
  additionalProperties: false,
};

export const SYSTEM_PROMPT = `You write a short daily note about risk figures for a private family website. The readers are family members, not finance professionals.

You receive figures that were already calculated in code from past daily closing prices of the family watchlist. Your job is to explain the two or three most notable points in plain words: for example which stock moved the most, the biggest fall from a peak, or how closely the watchlist followed the S&P 500.

Rules:
1. Use only the figures given. Do not calculate new figures, and do not add news, reasons, company facts or forecasts.
2. Describe, never advise. Do not suggest buying, selling, holding or changing anything, and do not say what anyone should do.
3. Say once, briefly, that the figures describe the past only. If the window is shorter than 60 trading days, mention that the data history is still short.
4. If a stock has too few days of data, say that its figures are not available yet.
5. Keep it between 50 and 110 words per language, in short sentences.
6. Never use hyphens or dashes of any kind. Write losses and falls in words ("a fall of 4.2 %", "une baisse de 4,2 %"), write dates in words ("2 October", "2 octobre"), and write compound words without hyphens.
7. Write one note in English ("en") and the same note in French ("fr"). In French use a decimal comma.`;

const pct = (v, digits = 1) => `${(Math.abs(v) * 100).toFixed(digits)} %`;
const dateWords = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const changeWords = (v) => (v > 0 ? `a rise of ${pct(v)}` : v < 0 ? `a fall of ${pct(v)}` : 'no change');
const fixed2 = (v) => (v === null || v === undefined ? 'not available' : v.toFixed(2));

/** The user message: the computed figures as short English lines. */
export function buildRiskPrompt(risk) {
  const lines = [
    `Risk figures for the family watchlist, from daily closing prices up to ${dateWords(risk.asOf)} (New York date).`,
    `Window: up to ${risk.windowDays} trading days. A stock needs at least ${risk.minDays} days of data before figures exist.`,
    `Benchmark for beta and correlation: S&P 500 (${risk.benchmarkDays || 0} days of data).`,
    '',
    'Per stock:',
  ];
  for (const s of risk.symbols || []) {
    const label = s.name && s.name !== s.symbol ? `${s.symbol} (${s.name})` : s.symbol;
    if (!s.enough) {
      lines.push(`* ${label}: only ${s.days} days of data, figures not available yet.`);
      continue;
    }
    lines.push(`* ${label}: ${s.days} days of data. Yearly volatility ${pct(s.volatility)}, risk level ${s.level}. `
      + `Biggest fall from a peak ${pct(s.maxDrawdown)}. Now ${pct(s.currentDrawdown)} below its highest price in the window. `
      + `On 95 % of days the daily loss was at most ${pct(s.var95)}. Worst day: ${changeWords(s.worstDay)} on ${dateWords(s.worstDayDate)}. `
      + `Over the window: ${changeWords(s.periodReturn)}. Beta ${fixed2(s.beta)}, correlation ${fixed2(s.correlation)} with the S&P 500.`);
  }
  const p = risk.portfolio;
  lines.push('');
  if (p && p.enough) {
    lines.push(`Watchlist as a whole (equal weights, ${p.days} common days): yearly volatility ${pct(p.volatility)}, risk level ${p.level}, `
      + `biggest fall from a peak ${pct(p.maxDrawdown)}, average correlation between the stocks ${fixed2(p.averageCorrelation)}.`);
  } else {
    lines.push('Watchlist as a whole: not enough common days yet.');
  }
  lines.push('', 'Write the daily note now.');
  return lines.join('\n');
}

/** Request for client.beta.messages.create (Claude API, Anthropic SDK). */
export function buildSummaryRequest(prompt) {
  return {
    model: AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    // If Opus 5.5 declines, Anthropic retries once on its recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    output_config: {
      effort: AI_EFFORT,
      format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
    },
    messages: [{ role: 'user', content: prompt }],
  };
}

/** Removes hyphens and dashes (app text rule), tidies spaces, limits the length. */
export function cleanSummaryText(text) {
  let s = String(text || '')
    .replace(/[‐-―−⸺⸻﹘﹣－-]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ([,.;:!?])/g, (m, c) => (c === ':' || c === '!' || c === '?' || c === ';' ? m : c))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (s.length > SUMMARY_MAX_CHARS) {
    const cut = s.slice(0, SUMMARY_MAX_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
    s = (end > 200 ? cut.slice(0, end + 1) : cut).trim();
  }
  return s;
}

export class SummaryError extends Error {
  constructor(type, message, extra = {}) {
    super(message);
    this.type = type;
    Object.assign(this, extra);
  }
}

/** Reads { en, fr } from the response; throws SummaryError if unusable. */
export function parseSummary(response) {
  if (response?.stop_reason === 'refusal') {
    throw new SummaryError('refusal', 'the model declined', { category: response.stop_details?.category ?? null });
  }
  if (response?.stop_reason === 'max_tokens') throw new SummaryError('max_tokens', 'answer was cut off');
  const text = (response?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SummaryError('bad_json', 'answer was not valid JSON');
  }
  const en = cleanSummaryText(data?.en);
  const fr = cleanSummaryText(data?.fr);
  if (!en || !fr) throw new SummaryError('empty', 'a language is missing');
  return { en, fr };
}

/**
 * One scheduled run (17:15 New York time on weekdays).
 * @param {object} deps
 * @param {object} deps.anthropic  Anthropic client (a stub in tests)
 * @param {object} deps.store      firestore-store.js or the in-memory store
 */
export async function runRiskSummary({ anthropic, store, now = new Date(), logger = console }) {
  const skip = (reason) => ({ kind: 'skip', reason });

  const switches = await store.getMarketSwitch();
  if (switches && switches.enabled === false) return skip('market part switched off');
  if (switches && switches.aiEnabled === false) return skip('AI summary switched off');

  const risk = await store.getRisk();
  if (!risk) return skip('no risk figures yet');
  const today = nyParts(now).date;
  if (risk.asOf !== today) return skip(`risk figures are from ${risk.asOf}, not today`);
  const previous = await store.getRiskSummary();
  if (previous && previous.asOf === risk.asOf && previous.en) return skip('already written today');
  if (!(risk.symbols || []).some((s) => s.enough)) return skip('not enough data yet');

  const request = buildSummaryRequest(buildRiskPrompt(risk));
  let response;
  try {
    response = await anthropic.beta.messages.create(request);
  } catch (err) {
    const error = { type: 'api', status: err?.status ?? null, name: err?.name || 'Error' };
    await store.saveRiskSummary({ lastAttemptAt: now, lastError: error });
    logger.warn('AI summary failed', error);
    return { kind: 'error', reason: 'API error', error };
  }

  let texts;
  try {
    texts = parseSummary(response);
  } catch (err) {
    const error = { type: err.type || 'unknown', category: err.category ?? null };
    await store.saveRiskSummary({ lastAttemptAt: now, lastError: error });
    logger.warn('AI summary unusable', error);
    return { kind: 'error', reason: err.message, error };
  }

  const usage = { inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null };
  await store.saveRiskSummary({
    asOf: risk.asOf,
    createdAt: now,
    model: response.model || AI_MODEL,
    en: texts.en,
    fr: texts.fr,
    lastAttemptAt: now,
    lastError: null,
    usage,
  });
  logger.info('AI summary written', { asOf: risk.asOf, model: response.model, ...usage });
  return { kind: 'written', asOf: risk.asOf, usage };
}
