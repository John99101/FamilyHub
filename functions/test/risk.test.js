// Tests for the risk figures (pure code, hand checkable numbers).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  seriesFromCloses, dailyReturns, stdev, annualizedVolatility, maxDrawdown, currentDrawdown,
  percentile, valueAtRisk95, betaAndCorrelation, riskLevel, symbolRisk, portfolioRisk,
  computeRiskReport, RISK_MIN_RETURNS, RISK_WINDOW, TRADING_DAYS_PER_YEAR,
} from '../risk.js';
import { makeCloses } from './helpers.js';

const near = (actual, expected, eps = 1e-6) => assert.ok(Math.abs(actual - expected) < eps, `${actual} is not close to ${expected}`);
const returnsFrom = (values, start = '2026-01-01') => values.map((r, i) => ({ date: `${start.slice(0, 8)}${String(i + 1).padStart(2, '0')}`, r }));

describe('basic statistics', () => {
  it('sorts closes and drops broken values', () => {
    const s = seriesFromCloses({ '2026-10-02': 11, '2026-10-01': 10, bad: 5, '2026-10-03': null, '2026-10-04': -1, '2026-10-05': 12 });
    assert.deepEqual(s, [{ date: '2026-10-01', price: 10 }, { date: '2026-10-02', price: 11 }, { date: '2026-10-05', price: 12 }]);
  });

  it('daily returns between neighbouring closes', () => {
    const r = dailyReturns([{ date: 'a', price: 100 }, { date: 'b', price: 110 }, { date: 'c', price: 99 }]);
    near(r[0].r, 0.1);
    near(r[1].r, -0.1);
    assert.equal(r[1].date, 'c');
  });

  it('sample standard deviation and yearly volatility', () => {
    near(stdev([1, 2, 3, 4]), Math.sqrt(5 / 3));
    assert.equal(stdev([1]), null);
    near(annualizedVolatility([0.01, -0.01, 0.01, -0.01]), stdev([0.01, -0.01, 0.01, -0.01]) * Math.sqrt(TRADING_DAYS_PER_YEAR));
  });

  it('largest fall from a peak and distance to the peak', () => {
    near(maxDrawdown([100, 120, 90, 110, 80]), 1 - 80 / 120);
    assert.equal(maxDrawdown([1, 2, 3]), 0);
    near(currentDrawdown([100, 120, 90]), 0.25);
    assert.equal(currentDrawdown([100, 120]), 0);
  });

  it('percentile and 95 % value at risk', () => {
    near(percentile([5, 1, 3, 2, 4], 0.5), 3);
    near(percentile([0, 10], 0.25), 2.5);
    const steps = Array.from({ length: 21 }, (_, i) => (i - 10) / 100); // -0.10 .. +0.10
    near(valueAtRisk95(steps), 0.09);
    assert.equal(valueAtRisk95([0.01, 0.02, 0.03]), 0, 'no losses means a value at risk of 0');
  });

  it('beta and correlation, matched by date', () => {
    const b = returnsFrom(Array.from({ length: 25 }, (_, i) => Math.sin(i) / 100));
    const double = b.map((x) => ({ date: x.date, r: 2 * x.r }));
    const mirror = b.map((x) => ({ date: x.date, r: -x.r }));
    const twice = betaAndCorrelation(double, b);
    near(twice.beta, 2);
    near(twice.correlation, 1);
    const opposite = betaAndCorrelation(mirror, b);
    near(opposite.beta, -1);
    near(opposite.correlation, -1);
    const few = betaAndCorrelation(double.slice(0, RISK_MIN_RETURNS - 1), b);
    assert.equal(few.beta, null);
    assert.equal(few.pairs, RISK_MIN_RETURNS - 1);
  });

  it('risk level from yearly volatility', () => {
    assert.equal(riskLevel(0.15), 'low');
    assert.equal(riskLevel(0.2), 'medium');
    assert.equal(riskLevel(0.349), 'medium');
    assert.equal(riskLevel(0.35), 'high');
    assert.equal(riskLevel(null), null);
  });
});

describe('figures per stock and for the watchlist', () => {
  it('no figures before 20 daily returns', () => {
    const r = symbolRisk({ symbol: 'NEW', closes: makeCloses('2026-10-21', RISK_MIN_RETURNS, (i) => 100 + i) });
    assert.equal(r.enough, false);
    assert.equal(r.days, RISK_MIN_RETURNS - 1);
    assert.equal(r.volatility, undefined);
  });

  it('uses only the last 60 returns and fills every figure', () => {
    const closes = makeCloses('2026-10-21', 100, (i) => 100 * (1 + 0.02 * Math.sin(i)));
    const bench = dailyReturns(seriesFromCloses(makeCloses('2026-10-21', 100, (i) => 5000 * (1 + 0.01 * Math.sin(i)))));
    const r = symbolRisk({ symbol: 'AAPL', name: 'Apple Inc.', closes, benchmarkReturns: bench });
    assert.equal(r.enough, true);
    assert.equal(r.days, RISK_WINDOW);
    assert.equal(r.to, '2026-10-21');
    for (const key of ['volatility', 'maxDrawdown', 'currentDrawdown', 'var95', 'worstDay', 'periodReturn', 'beta', 'correlation']) {
      assert.equal(typeof r[key], 'number', key);
    }
    assert.ok(r.correlation > 0.9, 'moves with the benchmark');
    assert.ok(['low', 'medium', 'high'].includes(r.level));
    assert.match(r.worstDayDate, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('watchlist of two identical stocks: correlation 1, same volatility', () => {
    const rets = returnsFrom(Array.from({ length: 30 }, (_, i) => Math.cos(i) / 50));
    const p = portfolioRisk({ A: rets, B: rets });
    assert.equal(p.enough, true);
    near(p.averageCorrelation, 1);
    near(p.volatility, annualizedVolatility(rets.map((x) => x.r)), 1e-6);
  });

  it('watchlist needs 20 common days', () => {
    const a = returnsFrom(Array.from({ length: 25 }, () => 0.01));
    const b = returnsFrom(Array.from({ length: 25 }, () => 0.01), '2026-02-01');
    assert.equal(portfolioRisk({ A: a, B: b }).enough, false);
    assert.equal(portfolioRisk({}), null);
  });

  it('full report keeps the watchlist order and marks short histories', () => {
    const histories = {
      AAPL: makeCloses('2026-10-21', 40, (i) => 100 + Math.sin(i) * 3),
      NVDA: makeCloses('2026-10-21', 40, (i) => 50 + Math.cos(i) * 4),
      NEW: makeCloses('2026-10-21', 5, (i) => 10 + i),
      $SPX: makeCloses('2026-10-21', 40, (i) => 6000 + Math.sin(i) * 30),
    };
    const report = computeRiskReport({
      watchlist: ['NVDA', 'AAPL', 'NEW'], histories, names: { AAPL: 'Apple Inc.' }, benchmarkSymbol: '$SPX', asOf: '2026-10-21', now: new Date('2026-10-21T20:30:00Z'),
    });
    assert.deepEqual(report.symbols.map((s) => s.symbol), ['NVDA', 'AAPL', 'NEW']);
    assert.equal(report.symbols[1].name, 'Apple Inc.');
    assert.equal(report.symbols[2].enough, false);
    assert.equal(report.benchmarkDays, 39);
    assert.equal(report.portfolio.symbols, 2, 'only stocks with enough data count');
    assert.equal(report.asOf, '2026-10-21');
    assert.equal(report.minDays, RISK_MIN_RETURNS);
  });
});
