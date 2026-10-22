// Risiko page: risk figures of the watchlist (computed by the server in plain
// code from stored closing prices) and the daily AI summary in English and
// French. Only shows stored data; no advice.
import { $, el, formatDay, formatShortDay } from './ui.js';
import { t, lang } from './i18n.js';
import { formatPercent, formatNumber, changeNode } from './markets.js';
import { toDate } from './market-data.js';

/** A signed plain number (beta, correlation) without a minus sign. */
function signedNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return t('risk.notAvailable');
  return value < 0 ? t('risk.negative', { v: formatNumber(value) }) : formatNumber(value);
}

function metric(label, value) {
  return el('div', { class: 'metric' }, [
    el('span', { class: 'metric-label', text: label }),
    el('span', { class: 'metric-value' }, [value]),
  ]);
}

function levelBadge(level) {
  if (!level) return null;
  return el('span', { class: `badge level level-${level}`, text: t('risk.levelLabel', { level: t(`risk.level.${level}`) }) });
}

function symbolItem(s, minDays) {
  const head = el('div', { class: 'risk-head' }, [
    el('div', { class: 'q-main' }, [
      el('span', { class: 'q-name', text: s.name || s.symbol }),
      el('span', { class: 'q-sub', text: `${s.symbol} · ${t('risk.days', { n: s.days })}` }),
    ]),
    s.enough ? levelBadge(s.level) : null,
  ]);
  if (!s.enough) {
    return el('li', { class: 'risk-item' }, [head, el('p', { class: 'muted small', text: t('risk.notEnough', { have: s.days, need: minDays }) })]);
  }
  const worst = el('span', {}, [
    changeNode(s.worstDay * 100, 1),
    el('span', { class: 'q-sub', text: ` ${t('risk.onDate', { date: formatShortDay(s.worstDayDate) })}` }),
  ]);
  return el('li', { class: 'risk-item' }, [head, el('div', { class: 'metrics' }, [
    metric(t('risk.volatility'), formatPercent(s.volatility)),
    metric(t('risk.maxDrawdown'), formatPercent(s.maxDrawdown)),
    metric(t('risk.currentDrawdown'), formatPercent(s.currentDrawdown)),
    metric(t('risk.var95'), formatPercent(s.var95)),
    metric(t('risk.worstDay'), worst),
    metric(t('risk.change'), changeNode(s.periodReturn * 100, 1)),
    metric(t('risk.beta'), signedNumber(s.beta)),
    metric(t('risk.correlation'), signedNumber(s.correlation)),
  ])]);
}

function portfolioCard(p, symbolsWithData) {
  if (!p) return null;
  if (!p.enough) {
    return symbolsWithData >= 1 ? el('p', { class: 'muted small portfolio-note', text: t('risk.portfolioNotEnough') }) : null;
  }
  return el('div', { class: 'portfolio' }, [
    el('div', { class: 'risk-head' }, [
      el('div', { class: 'q-main' }, [
        el('span', { class: 'q-name', text: t('risk.portfolio') }),
        el('span', { class: 'q-sub', text: t('risk.days', { n: p.days }) }),
      ]),
      levelBadge(p.level),
    ]),
    el('div', { class: 'metrics' }, [
      metric(t('risk.volatility'), formatPercent(p.volatility)),
      metric(t('risk.maxDrawdown'), formatPercent(p.maxDrawdown)),
      metric(t('risk.var95'), formatPercent(p.var95)),
      metric(t('risk.avgCorrelation'), signedNumber(p.averageCorrelation)),
    ]),
  ]);
}

export function createRiskPage(data) {
  const asOf = $('risk-asof');
  const stateLine = $('risk-state');
  const intro = $('risk-intro');
  const portfolioBox = $('risk-portfolio');
  const list = $('risk-list');
  const summaryText = $('summary-text');
  const summaryNote = $('summary-note');
  const toggles = [...document.querySelectorAll('[data-summary-lang]')];
  let summaryLang = lang === 'fr' ? 'fr' : 'en';

  function renderSummary(state) {
    const s = state.riskSummary;
    const aiOff = state.switch?.aiEnabled === false;
    const has = Boolean(s && s.en && s.fr);
    for (const btn of toggles) {
      btn.hidden = !has;
      btn.setAttribute('aria-pressed', String(btn.dataset.summaryLang === summaryLang));
    }
    if (!has) {
      summaryText.textContent = aiOff ? t('risk.summaryOff') : t('risk.summaryNone');
      summaryText.removeAttribute('lang');
      summaryText.classList.add('muted');
      summaryNote.textContent = '';
      return;
    }
    summaryText.textContent = s[summaryLang];
    summaryText.setAttribute('lang', summaryLang);
    summaryText.classList.remove('muted');
    const created = toDate(s.createdAt);
    const attempt = toDate(s.lastAttemptAt);
    const stale = s.lastError && attempt && created && attempt > created;
    summaryNote.textContent = [
      t('risk.summaryNote', { date: formatDay(s.asOf) }),
      lang === 'de' ? t('risk.summaryLanguages') : '',
      stale ? t('risk.summaryStale') : '',
      aiOff ? t('risk.summaryOff') : '',
    ].filter(Boolean).join(' ');
  }

  function render(state) {
    renderSummary(state);
    const risk = state.risk;

    let message = '';
    if (state.loaded.watchlist && !state.watchlist.length) message = t('risk.watchEmpty');
    else if (state.loaded.risk && !risk) message = t('risk.none');
    stateLine.textContent = message;
    stateLine.hidden = !message;

    if (!risk) {
      asOf.textContent = '';
      intro.textContent = '';
      portfolioBox.replaceChildren();
      list.replaceChildren();
      return;
    }
    asOf.textContent = t('risk.asOf', { date: formatDay(risk.asOf) });
    intro.textContent = t('risk.intro', { days: risk.windowDays });
    const symbols = risk.symbols || [];
    const withData = symbols.filter((s) => s.enough).length;
    portfolioBox.replaceChildren(...[portfolioCard(risk.portfolio, withData)].filter(Boolean));
    list.replaceChildren(...symbols.map((s) => symbolItem(s, risk.minDays)));
  }

  for (const btn of toggles) {
    btn.onclick = () => {
      summaryLang = btn.dataset.summaryLang;
      renderSummary(data.state);
    };
  }

  const unsubscribe = data.subscribe(render);
  return { stop() { unsubscribe(); } };
}
