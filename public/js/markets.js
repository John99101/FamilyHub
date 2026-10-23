// Börse page: US indices, the family watchlist with small charts, and the
// largest US stocks. Only shows the copy stored by the server. No trading,
// no advice, no alerts.
import { $, el, formatDateTime } from './ui.js';
import { findQuote, toDate } from './market-data.js';
import { t, locale } from './i18n.js';

const PAGE = 25;
const SVG_NS = 'http://www.w3.org/2000/svg';

const usd = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });
const points = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent2 = new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent1 = new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayMonthTime = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayMonthYear = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });

const INDEX_NAMES = {
  $SPX: 'S&P 500', $DJI: 'Dow Jones', $COMP: 'Nasdaq Composite', $NDX: 'Nasdaq 100',
  $NYA: 'NYSE Composite', $RUT: 'Russell 2000', $VIX: 'VIX',
};

function prettyIndexName(index) {
  if (INDEX_NAMES[index.symbol]) return INDEX_NAMES[index.symbol];
  return String(index.name || index.symbol).toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()).replace(/\bIndex\b/, '').trim();
}

/** A fraction (0.234) as percent in the current language, without any sign. */
export function formatPercent(fraction, digits = 1) {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return '';
  return (digits === 2 ? percent2 : percent1).format(Math.abs(fraction));
}

export function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? points.format(Math.abs(value)) : '';
}

export function formatQuoteTime(value, now = new Date()) {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? time.format(date) : dayMonthTime.format(date).replace(',', '');
}

/**
 * Change with arrow and colour class. Never uses a minus or dash sign.
 * @param {number} changePct  change in percent (1.23 means 1.23 %)
 * @param {number} digits     decimals shown
 */
export function changeNode(changePct, digits = 2) {
  if (typeof changePct !== 'number' || !Number.isFinite(changePct)) return el('span', { class: 'chg', text: '' });
  const factor = 10 ** digits;
  const rounded = Math.round(changePct * factor) / factor;
  const text = formatPercent(rounded / 100, digits);
  if (rounded > 0) return el('span', { class: 'chg up', 'aria-label': t('markets.up', { v: text }), text: `▲ ${text}` });
  if (rounded < 0) return el('span', { class: 'chg down', 'aria-label': t('markets.down', { v: text }), text: `▼ ${text}` });
  return el('span', { class: 'chg', text });
}

function sparkline(history) {
  const closes = history?.closes || {};
  const dates = Object.keys(closes).sort().slice(-90);
  const values = dates.map((d) => closes[d]).filter((v) => typeof v === 'number');
  if (values.length < 2) return el('span', { class: 'spark-empty', text: t('markets.chartSoon') });

  const w = 96; const h = 32; const pad = 2;
  const min = Math.min(...values); const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - 2 * pad)) / (values.length - 1);
    const y = pad + (h - 2 * pad) * (1 - (v - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  // On phones the chart is stretched to the row width; keep the line even.
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', `spark ${values[values.length - 1] >= values[0] ? 'up' : 'down'}`);
  svg.setAttribute('role', 'img');
  const [y, m, d] = dates[0].split('-').map(Number);
  const label = t('markets.chartLabel', { date: dayMonthYear.format(new Date(y, m - 1, d)) });
  svg.setAttribute('aria-label', label);
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = label;
  const line = document.createElementNS(SVG_NS, 'polyline');
  line.setAttribute('points', pts);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '1.6');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(title, line);
  return svg;
}

function quoteRow(quote, { symbol, history, showChart = false, note = '' } = {}) {
  const sym = quote?.symbol || symbol;
  const main = el('div', { class: 'q-main' }, [
    el('span', { class: 'q-name', text: quote?.name || sym }),
    el('span', { class: 'q-sub', text: [sym, quote ? formatQuoteTime(quote.quoteTime) : ''].filter(Boolean).join(' · ') }),
  ]);
  const nums = el('div', { class: 'q-num' }, quote && typeof quote.price === 'number'
    ? [el('span', { class: 'q-price', text: usd.format(quote.price) }), changeNode(quote.changePct)]
    : [el('span', { class: 'q-sub', text: note || t('markets.noData') })]);
  return el('li', { class: 'quote' }, [main, showChart ? el('div', { class: 'q-chart' }, [sparkline(history)]) : null, nums]);
}

export function createMarkets(data) {
  const updated = $('market-updated');
  const stateLine = $('market-state');
  const indicesBox = $('market-indices');
  const watchBox = $('market-watch');
  const topBox = $('market-top');
  const filter = $('market-filter');
  const more = $('market-more');
  let shown = PAGE;

  function render(state) {
    const latest = state.latest;
    const status = state.status;
    const now = new Date();

    // Update time and state
    const updatedAt = toDate(latest?.updatedAt);
    updated.textContent = updatedAt ? t('markets.updated', { time: formatDateTime(updatedAt) }) : '';

    const pausedUntil = toDate(status?.pausedUntil);
    let message = '';
    if (state.loaded.switch && state.switch?.enabled === false) {
      message = t('markets.off');
    } else if (pausedUntil && pausedUntil > now) {
      message = t('markets.paused', { time: formatDateTime(pausedUntil) });
    } else if (status?.state === 'error') {
      message = t('markets.error');
    } else if (state.loaded.latest && !latest) {
      message = t('markets.noneYet');
    }
    stateLine.textContent = message;
    stateLine.hidden = !message;

    // Indices
    const indices = latest?.indices || [];
    indicesBox.replaceChildren(...(indices.length ? indices.map((index) => el('div', { class: 'index' }, [
      el('span', { class: 'index-name', text: prettyIndexName(index) }),
      el('span', { class: 'index-value', text: typeof index.price === 'number' ? points.format(index.price) : t('markets.noData') }),
      el('span', { class: 'index-foot' }, [changeNode(index.changePct), el('span', { class: 'q-sub', text: formatQuoteTime(index.quoteTime) })]),
    ])) : [el('p', { class: 'muted small', text: t('markets.noIndices') })]));

    // Watchlist
    const unknown = status?.unknownSymbols || {};
    watchBox.replaceChildren(...(state.watchlist.length ? state.watchlist.map((symbol) => {
      const quote = findQuote(latest, symbol);
      const note = quote ? '' : (unknown[symbol] ? t('markets.symbolNotFound') : t('markets.notYet'));
      return quoteRow(quote, { symbol, history: state.history[symbol], showChart: true, note });
    }) : [el('li', { class: 'muted small empty', text: t('markets.watchEmpty') })]));

    renderTop(latest);
  }

  function renderTop(latest) {
    const term = filter.value.trim().toLowerCase();
    const all = latest?.quotes || [];
    const list = term ? all.filter((q) => q.symbol.toLowerCase().includes(term) || String(q.name).toLowerCase().includes(term)) : all;
    topBox.replaceChildren(...list.slice(0, shown).map((q) => quoteRow(q)));
    if (!list.length) topBox.append(el('li', { class: 'muted small empty', text: term ? t('markets.nothingFound') : t('markets.noQuotes') }));
    more.hidden = list.length <= shown;
  }

  filter.value = '';
  filter.oninput = () => { shown = PAGE; renderTop(data.state.latest); };
  more.onclick = () => { shown += PAGE; renderTop(data.state.latest); };
  const unsubscribe = data.subscribe(render);

  return {
    onShow() { data.refreshHistory(); },
    stop() { unsubscribe(); },
  };
}
