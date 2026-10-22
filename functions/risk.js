// Risk figures for the watchlist, computed in plain code from the daily
// closing prices the app stores itself (marketHistory). No API calls, no AI:
// every number here is reproducible and covered by tests.
//
// All results are fractions (0.234 = 23.4 %). Figures look backwards only.

export const RISK_WINDOW = 60;        // use at most the last 60 daily returns
export const RISK_MIN_RETURNS = 20;   // fewer than 20 daily returns: no figures yet
export const TRADING_DAYS_PER_YEAR = 252;
export const BENCHMARK_SYMBOL = '$SPX';

const round = (v, digits = 6) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** digits) / 10 ** digits);

/** { 'YYYY-MM-DD': price } → [{ date, price }] sorted by date, only valid prices. */
export function seriesFromCloses(closes = {}) {
  return Object.entries(closes || {})
    .filter(([date, price]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof price === 'number' && Number.isFinite(price) && price > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, price]) => ({ date, price }));
}

/** Daily returns between neighbouring stored closes: [{ date, r }]. */
export function dailyReturns(series) {
  const out = [];
  for (let i = 1; i < series.length; i += 1) {
    out.push({ date: series[i].date, r: series[i].price / series[i - 1].price - 1 });
  }
  return out;
}

export function mean(xs) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/** Sample standard deviation (n - 1). */
export function stdev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function annualizedVolatility(returns) {
  const sd = stdev(returns);
  return sd === null ? null : sd * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Largest fall from a running peak, as a positive fraction. */
export function maxDrawdown(prices) {
  let peak = -Infinity;
  let worst = 0;
  for (const p of prices) {
    peak = Math.max(peak, p);
    worst = Math.max(worst, 1 - p / peak);
  }
  return prices.length ? worst : null;
}

/** How far the last price is below the highest price in the window. */
export function currentDrawdown(prices) {
  if (!prices.length) return null;
  return 1 - prices[prices.length - 1] / Math.max(...prices);
}

/** Percentile with linear interpolation (p between 0 and 1). */
export function percentile(xs, p) {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Historical one day loss that was not exceeded on 95 % of the days (positive fraction). */
export function valueAtRisk95(returns) {
  const q = percentile(returns, 0.05);
  return q === null ? null : Math.max(0, -q);
}

/** Beta and correlation of returns A against returns B, matched by date. */
export function betaAndCorrelation(returnsA, returnsB, minPairs = RISK_MIN_RETURNS) {
  const byDate = new Map(returnsB.map((x) => [x.date, x.r]));
  const pairs = returnsA.filter((x) => byDate.has(x.date)).map((x) => [x.r, byDate.get(x.date)]);
  if (pairs.length < minPairs) return { beta: null, correlation: null, pairs: pairs.length };
  const a = pairs.map((p) => p[0]);
  const b = pairs.map((p) => p[1]);
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0; let va = 0; let vb = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return {
    beta: vb > 0 ? cov / vb : null,
    correlation: va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null,
    pairs: pairs.length,
  };
}

/** Simple label from the yearly volatility. */
export function riskLevel(volatility) {
  if (volatility === null) return null;
  if (volatility < 0.2) return 'low';
  if (volatility < 0.35) return 'medium';
  return 'high';
}

/** Figures for one symbol. */
export function symbolRisk({ symbol, name, closes, benchmarkReturns = [], window = RISK_WINDOW }) {
  const series = seriesFromCloses(closes).slice(-(window + 1));
  const returns = dailyReturns(series);
  const values = returns.map((x) => x.r);
  const base = { symbol, name: name || symbol, days: returns.length, from: series[0]?.date || null, to: series[series.length - 1]?.date || null };
  if (returns.length < RISK_MIN_RETURNS) return { ...base, enough: false };

  const prices = series.map((x) => x.price);
  const worst = returns.reduce((w, x) => (x.r < w.r ? x : w), returns[0]);
  const vol = annualizedVolatility(values);
  const { beta, correlation } = betaAndCorrelation(returns, benchmarkReturns);
  return {
    ...base,
    enough: true,
    volatility: round(vol),
    maxDrawdown: round(maxDrawdown(prices)),
    currentDrawdown: round(currentDrawdown(prices)),
    var95: round(valueAtRisk95(values)),
    worstDay: round(worst.r),
    worstDayDate: worst.date,
    periodReturn: round(prices[prices.length - 1] / prices[0] - 1),
    beta: round(beta),
    correlation: round(correlation),
    level: riskLevel(vol),
  };
}

/** The watchlist as a whole, equal weights, on the days where every symbol has a return. */
export function portfolioRisk(returnsBySymbol) {
  const symbols = Object.keys(returnsBySymbol);
  if (!symbols.length) return null;
  const maps = symbols.map((s) => new Map(returnsBySymbol[s].map((x) => [x.date, x.r])));
  const dates = returnsBySymbol[symbols[0]].map((x) => x.date).filter((d) => maps.every((m) => m.has(d)));
  if (dates.length < RISK_MIN_RETURNS) return { symbols: symbols.length, days: dates.length, enough: false };

  const daily = dates.map((d) => mean(maps.map((m) => m.get(d))));
  const curve = [1];
  for (const r of daily) curve.push(curve[curve.length - 1] * (1 + r));

  const correlations = [];
  for (let i = 0; i < symbols.length; i += 1) {
    for (let j = i + 1; j < symbols.length; j += 1) {
      const { correlation } = betaAndCorrelation(returnsBySymbol[symbols[i]], returnsBySymbol[symbols[j]]);
      if (correlation !== null) correlations.push(correlation);
    }
  }
  const vol = annualizedVolatility(daily);
  return {
    symbols: symbols.length,
    days: dates.length,
    enough: true,
    volatility: round(vol),
    maxDrawdown: round(maxDrawdown(curve)),
    var95: round(valueAtRisk95(daily)),
    averageCorrelation: correlations.length ? round(mean(correlations)) : null,
    level: riskLevel(vol),
  };
}

/**
 * The complete report stored in market/risk.
 * @param {object} p
 * @param {string[]} p.watchlist
 * @param {Object<string, object>} p.histories  symbol → closes map
 * @param {Object<string, string>} p.names      symbol → company name
 * @param {string|null} p.benchmarkSymbol
 * @param {string} p.asOf  New York date of the run
 * @param {Date} p.now
 */
export function computeRiskReport({ watchlist, histories, names = {}, benchmarkSymbol = BENCHMARK_SYMBOL, asOf, now, window = RISK_WINDOW }) {
  const benchmarkSeries = benchmarkSymbol ? seriesFromCloses(histories[benchmarkSymbol]).slice(-(window + 1)) : [];
  const benchmarkReturns = dailyReturns(benchmarkSeries);
  const symbols = watchlist.map((symbol) => symbolRisk({
    symbol, name: names[symbol], closes: histories[symbol], benchmarkReturns, window,
  }));

  const returnsBySymbol = {};
  for (const s of symbols) {
    if (s.enough) returnsBySymbol[s.symbol] = dailyReturns(seriesFromCloses(histories[s.symbol]).slice(-(window + 1)));
  }

  return {
    computedAt: now,
    asOf,
    windowDays: window,
    minDays: RISK_MIN_RETURNS,
    benchmark: benchmarkSymbol,
    benchmarkDays: benchmarkReturns.length,
    symbols,
    portfolio: portfolioRisk(returnsBySymbol),
  };
}
