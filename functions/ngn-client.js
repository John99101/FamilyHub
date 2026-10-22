// Small client for the NGN Market REST API (US endpoints, free plan only).
// Docs: https://docs.ngnmarket.com/us/introduction
//
// Every successful response looks like { success: true, data, meta } and
// every error like { success: false, error: { code, message }, meta? }.
// The API key is only ever put into the Authorization header; it is never
// logged and never part of an error message.

export const NGN_BASE_URL = 'https://api.ngnmarket.com/v1';

export class NgnError extends Error {
  constructor({ status, code, message, retryAfterSeconds = null, meta = null }) {
    super(`${code} (HTTP ${status}): ${message}`);
    this.name = 'NgnError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.meta = meta;
  }
}

/**
 * @param {object} options
 * @param {string} options.apiKey   NGN_API_KEY from Secret Manager.
 * @param {Function} [options.fetchImpl]  Injected in tests so they never call the real API.
 * @param {string} [options.baseUrl]
 * @param {number} [options.timeoutMs]
 */
export function createNgnClient({ apiKey, fetchImpl = globalThis.fetch, baseUrl = NGN_BASE_URL, timeoutMs = 20000 }) {
  if (!apiKey) throw new Error('NGN_API_KEY is missing');

  async function get(path, params = {}) {
    const url = new URL(baseUrl + path);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new NgnError({ status: 0, code: 'NETWORK_ERROR', message: err?.name || 'request failed' });
    }

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || !body || body.success !== true) {
      const header = response.headers?.get?.('retry-after');
      const retryAfter = Number(header) || Number(body?.meta?.retry_after) || null;
      throw new NgnError({
        status: response.status,
        code: body?.error?.code || `HTTP_${response.status}`,
        message: body?.error?.message || 'request failed',
        retryAfterSeconds: retryAfter,
        meta: body?.meta || null,
      });
    }
    return { data: body.data, meta: body.meta || {} };
  }

  return {
    // GET /v1/us/tickers (free). Params: type, sector, search, sort, order, page, limit (max 200).
    usTickers: (params) => get('/us/tickers', params),
    // GET /v1/us/indices (free).
    usIndices: () => get('/us/indices'),
    // GET /v1/us/market/holidays (free). Params: upcoming (default true), limit (max 100).
    usHolidays: (params) => get('/us/market/holidays', params),
  };
}
