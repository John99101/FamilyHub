// Börse page: US indices, the family watchlist with small charts, and the
// largest US stocks. Only shows the copy stored by the server. No trading,
// no advice, no alerts.
import { $, el, formatDateTime } from './ui.js';
import { findQuote, toDate } from './market-data.js';

const PAGE = 25;
const SVG_NS = 'http://www.w3.org/2000/svg';

const usd = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' });
const points = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dayMonthTime = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dayMonthYear = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

const INDEX_NAMES = {
  $SPX: 'S&P 500', $DJI: 'Dow Jones', $COMP: 'Nasdaq Composite', $NDX: 'Nasdaq 100',
  $NYA: 'NYSE Composite', $RUT: 'Russell 2000', $VIX: 'VIX Volatilität',
};

function prettyIndexName(index) {
  if (INDEX_NAMES[index.symbol]) return INDEX_NAMES[index.symbol];
  return String(index.name || index.symbol).toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()).replace(/\bIndex\b/, '').trim();
}

export function formatQuoteTime(value, now = new Date()) {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? time.format(date) : dayMonthTime.format(date).replace(',', '');
}

/** Change in percent with arrow and colour class. Never uses a minus or dash sign. */
export function changeNode(changePct) {
  if (typeof changePct !== 'number' || !Number.isFinite(changePct)) return el('span', { class: 'chg', text: '' });
  const rounded = Math.round(changePct * 100) / 100;
  const text = `${pct.format(Math.abs(rounded))} %`;
  if (rounded > 0) return el('span', { class: 'chg up', 'aria-label': `plus ${text}`, text: `▲ ${text}` });
  if (rounded < 0) return el('span', { class: 'chg down', 'aria-label': `minus ${text}`, text: `▼ ${text}` });
  return el('span', { class: 'chg', text });
}

function sparkline(history) {
  const closes = history?.closes || {};
  const dates = Object.keys(closes).sort().slice(-90);
  const values = dates.map((d) => closes[d]).filter((v) => typeof v === 'number');
  if (values.length < 2) return el('span', { class: 'spark-empty', text: 'Verlauf folgt' });

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
  svg.setAttribute('class', `spark ${values[values.length - 1] >= values[0] ? 'up' : 'down'}`);
  svg.setAttribute('role', 'img');
  const [y, m, d] = dates[0].split('-').map(Number);
  const label = `Schlusskurse seit ${dayMonthYear.format(new Date(y, m - 1, d))}`;
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
  svg.append(title, line);
  return svg;
}

function quoteRow(quote, { symbol, history, showChart = false, note = '' } = {}) {
  const sym = quote?.symbol || symbol;
  const main = el('div', { class: 'q-main' }, [
    el('span', { class: 'q-name', text: quote?.name || sym }),
    el('span', { class: 'q-sub', text: [sym, quote ? formatQuoteTime(quote.quoteTime) : note].filter(Boolean).join(' · ') }),
  ]);
  const nums = el('div', { class: 'q-num' }, quote && typeof quote.price === 'number'
    ? [el('span', { class: 'q-price', text: usd.format(quote.price) }), changeNode(quote.changePct)]
    : [el('span', { class: 'q-sub', text: note || 'Keine Daten' })]);
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
    updated.textContent = updatedAt ? `Letzte Aktualisierung: ${formatDateTime(updatedAt)}` : '';

    const pausedUntil = toDate(status?.pausedUntil);
    let message = '';
    if (state.loaded.switch && state.switch?.enabled !== true) {
      message = 'Der Kursabruf ist ausgeschaltet. Ein Admin kann ihn in den Einstellungen einschalten.';
    } else if (pausedUntil && pausedUntil > now) {
      message = `Kurse pausiert bis ${formatDateTime(pausedUntil)}`;
    } else if (status?.state === 'error') {
      message = 'Die letzte Aktualisierung hat nicht geklappt. Angezeigt werden die zuletzt gespeicherten Kurse.';
    } else if (state.loaded.latest && !latest) {
      message = 'Noch keine Kurse gespeichert. Sie erscheinen nach dem ersten Abruf während der US Handelszeit.';
    }
    stateLine.textContent = message;
    stateLine.hidden = !message;

    // Indices
    const indices = latest?.indices || [];
    indicesBox.replaceChildren(...(indices.length ? indices.map((index) => el('div', { class: 'index' }, [
      el('span', { class: 'index-name', text: prettyIndexName(index) }),
      el('span', { class: 'index-value', text: typeof index.price === 'number' ? points.format(index.price) : 'Keine Daten' }),
      el('span', { class: 'index-foot' }, [changeNode(index.changePct), el('span', { class: 'q-sub', text: formatQuoteTime(index.quoteTime) })]),
    ])) : [el('p', { class: 'muted small', text: 'Keine Indizes gespeichert.' })]));

    // Watchlist
    const unknown = status?.unknownSymbols || {};
    watchBox.replaceChildren(...(state.watchlist.length ? state.watchlist.map((symbol) => {
      const quote = findQuote(latest, symbol);
      const note = quote ? '' : (unknown[symbol] ? 'Symbol nicht gefunden' : 'Noch keine Daten');
      return quoteRow(quote, { symbol, history: state.history[symbol], showChart: true, note });
    }) : [el('li', { class: 'muted small empty', text: 'Die Watchlist ist leer. Symbole fügst du in den Einstellungen hinzu.' })]));

    renderTop(latest);
  }

  function renderTop(latest) {
    const term = filter.value.trim().toLowerCase();
    const all = latest?.quotes || [];
    const list = term ? all.filter((q) => q.symbol.toLowerCase().includes(term) || String(q.name).toLowerCase().includes(term)) : all;
    topBox.replaceChildren(...list.slice(0, shown).map((q) => quoteRow(q)));
    if (!list.length) topBox.append(el('li', { class: 'muted small empty', text: term ? 'Nichts gefunden.' : 'Keine Kurse gespeichert.' }));
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
