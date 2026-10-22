// Settings: account, language, light or dark look, the family watchlist, and
// (admins only) the market and AI switches and the allow list.
import { db, doc, setDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from './firebase.js';
import { $, el, avatar, toast, formatDateTime } from './ui.js';
import { SYMBOL_PATTERN, WATCHLIST_MAX, findQuote, toDate } from './market-data.js';
import { t, locale, languageChoice, setLanguageChoice } from './i18n.js';

const THEME_KEY = 'familyhub-theme';
const MAX_MEMBERS = 100;
const MAX_ADMINS = 20;
const MAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- appearance (stored on this device only) ----------

export function currentTheme() {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'light' || theme === 'dark' ? theme : 'auto';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage blocked */ }
  updateThemeColor();
}

export function updateThemeColor() {
  const theme = currentTheme();
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#171b20' : '#ffffff');
}

// ---------- settings page ----------

export function createSettings(session, { onSignOut, marketData }) {
  const accessRef = doc(db, 'config', 'access');
  const card = $('card-access');
  const listBox = $('access-list');
  const form = $('access-form');
  const input = $('access-input');
  const error = $('access-error');
  let busy = false;

  // Account
  const name = session.user.displayName || session.claims.name || '';
  $('account-avatar').replaceChildren(avatar(name, session.user.photoURL || session.claims.picture, true));
  $('account-name').textContent = name || t('settings.noName');
  $('account-mail').textContent = session.mail;

  // Language (this device only; the page reloads in the new language)
  const language = languageChoice();
  for (const radio of document.querySelectorAll('input[name="language"]')) {
    radio.checked = radio.value === language;
    radio.onchange = () => { if (radio.checked) setLanguageChoice(radio.value); };
  }

  // Appearance
  const theme = currentTheme();
  for (const radio of document.querySelectorAll('input[name="theme"]')) {
    radio.checked = radio.value === theme;
    radio.onchange = () => { if (radio.checked) applyTheme(radio.value); };
  }

  $('btn-signout').onclick = onSignOut;

  // Allow list (admins only)
  function people() {
    const admins = new Set(session.access.admins || []);
    const members = new Set(session.access.members || []);
    const all = [...new Set([...admins, ...members])];
    all.sort((a, b) => (admins.has(b) - admins.has(a)) || a.localeCompare(b, locale));
    return all.map((mail) => ({ mail, admin: admins.has(mail), me: mail === session.mail }));
  }

  async function save(change, okText) {
    if (busy) return;
    busy = true;
    error.textContent = '';
    try {
      await updateDoc(accessRef, { ...change, updatedAt: serverTimestamp(), updatedBy: session.mail });
      if (okText) toast(okText);
    } catch (err) {
      console.warn('Saving the allow list failed', err.code);
      error.textContent = t('common.saveFailed');
    } finally {
      busy = false;
    }
  }

  function renderAccess() {
    card.hidden = !session.isAdmin;
    if (!session.isAdmin) { listBox.replaceChildren(); return; }
    const adminCount = (session.access.admins || []).length;
    listBox.replaceChildren(...people().map((p) => {
      const actions = el('div', { class: 'person-actions' });
      if (p.admin && !p.me) {
        actions.append(el('button', {
          class: 'btn-link', type: 'button', text: t('settings.revokeAdmin'),
          onclick: () => save({ admins: arrayRemove(p.mail), members: arrayUnion(p.mail) }, t('settings.adminRevoked')),
        }));
      }
      if (!p.admin) {
        actions.append(el('button', {
          class: 'btn-link', type: 'button', text: t('settings.makeAdmin'), disabled: adminCount >= MAX_ADMINS,
          onclick: () => save({ admins: arrayUnion(p.mail), members: arrayRemove(p.mail) }, t('settings.adminAdded')),
        }));
      }
      if (!p.me) {
        actions.append(el('button', {
          class: 'btn-link danger', type: 'button', text: t('common.remove'),
          onclick: () => {
            if (!confirm(t('settings.confirmRemove', { mail: p.mail }))) return;
            save({ admins: arrayRemove(p.mail), members: arrayRemove(p.mail) }, t('settings.removed'));
          },
        }));
      }
      return el('li', { class: 'person' }, [
        el('span', { class: 'person-mail' }, [
          p.mail,
          p.me ? el('span', { class: 'muted', text: ` ${t('settings.you')}` }) : null,
          p.admin ? el('span', { class: 'badge', text: t('settings.adminBadge') }) : null,
        ]),
        actions,
      ]);
    }));
  }

  form.onsubmit = (event) => {
    event.preventDefault();
    const mail = input.value.trim().toLowerCase();
    error.textContent = '';
    if (!MAIL_PATTERN.test(mail)) { error.textContent = t('settings.mailInvalid'); return; }
    if (people().some((p) => p.mail === mail)) { error.textContent = t('settings.mailDuplicate'); return; }
    if ((session.access.members || []).length >= MAX_MEMBERS) { error.textContent = t('settings.listFull', { max: MAX_MEMBERS }); return; }
    save({ members: arrayUnion(mail) }, t('settings.mailAdded')).then(() => {
      if (!error.textContent) input.value = '';
    });
  };

  // ---------- watchlist (all members) ----------

  const watchRef = doc(db, 'config', 'watchlist');
  const watchList = $('watch-list');
  const watchForm = $('watch-form');
  const watchInput = $('watch-input');
  const watchError = $('watch-error');

  async function saveWatch(change, okText) {
    watchError.textContent = '';
    try {
      await setDoc(watchRef, { symbols: change, updatedAt: serverTimestamp(), updatedBy: session.mail }, { merge: true });
      if (okText) toast(okText);
      return true;
    } catch (err) {
      console.warn('Saving the watchlist failed', err.code);
      watchError.textContent = t('common.saveFailed');
      return false;
    }
  }

  function renderWatch(state) {
    watchList.replaceChildren(...state.watchlist.map((symbol) => {
      const quote = findQuote(state.latest, symbol);
      return el('li', { class: 'person' }, [
        el('span', { class: 'person-mail' }, [
          el('strong', { text: symbol }),
          quote?.name ? el('span', { class: 'muted', text: ` ${quote.name}` }) : null,
        ]),
        el('div', { class: 'person-actions' }, [el('button', {
          class: 'btn-link danger', type: 'button', text: t('common.remove'),
          onclick: () => saveWatch(arrayRemove(symbol), t('settings.symbolRemoved', { symbol })),
        })]),
      ]);
    }));
    if (!state.watchlist.length) watchList.append(el('li', { class: 'person muted small', text: t('settings.noSymbols') }));
  }

  watchForm.onsubmit = async (event) => {
    event.preventDefault();
    const symbol = watchInput.value.trim().toUpperCase();
    const current = marketData.state.watchlist;
    watchError.textContent = '';
    if (!SYMBOL_PATTERN.test(symbol)) { watchError.textContent = t('settings.symbolInvalid'); return; }
    if (current.includes(symbol)) { watchError.textContent = t('settings.symbolDuplicate'); return; }
    if (current.length >= WATCHLIST_MAX) { watchError.textContent = t('settings.watchFull', { max: WATCHLIST_MAX }); return; }
    if (await saveWatch(arrayUnion(symbol), t('settings.symbolAdded', { symbol }))) watchInput.value = '';
  };

  // ---------- market and AI switches, API usage (admins only) ----------

  const marketCard = $('card-market-admin');
  const marketSwitch = $('market-switch');
  const aiSwitch = $('ai-switch');
  const usage = $('market-usage');

  // Both switches live in config/market; a missing value counts as on.
  async function saveSwitches(next, okText, revert) {
    try {
      await setDoc(doc(db, 'config', 'market'), { ...next, updatedAt: serverTimestamp(), updatedBy: session.mail });
      toast(okText);
    } catch (err) {
      console.warn('Saving the switches failed', err.code);
      toast(t('common.saveFailed'));
      revert();
    }
  }

  const currentSwitches = () => ({
    enabled: marketData.state.switch?.enabled !== false,
    aiEnabled: marketData.state.switch?.aiEnabled !== false,
  });

  marketSwitch.onchange = () => {
    const enabled = marketSwitch.checked;
    if (enabled && !confirm(t('settings.confirmMarketOn'))) {
      marketSwitch.checked = false;
      return;
    }
    saveSwitches({ ...currentSwitches(), enabled }, t(enabled ? 'settings.marketOn' : 'settings.marketOff'), () => { marketSwitch.checked = !enabled; });
  };

  aiSwitch.onchange = () => {
    const aiEnabled = aiSwitch.checked;
    saveSwitches({ ...currentSwitches(), aiEnabled }, t(aiEnabled ? 'settings.aiOn' : 'settings.aiOff'), () => { aiSwitch.checked = !aiEnabled; });
  };

  function renderMarketAdmin(state) {
    marketCard.hidden = !session.isAdmin;
    if (!session.isAdmin) return;
    marketSwitch.checked = state.switch?.enabled !== false;
    aiSwitch.checked = state.switch?.aiEnabled !== false;
    const s = state.status;
    if (s && typeof s.callsRemaining === 'number') {
      const reset = toDate(s.resetAt);
      const lastRun = toDate(s.lastRunAt);
      usage.textContent = [
        t('settings.usage', { used: s.callsUsed ?? '?', remaining: s.callsRemaining }),
        reset ? t('settings.usageReset', { time: formatDateTime(reset) }) : '',
        lastRun ? t('settings.usageLastRun', { time: formatDateTime(lastRun) }) : '',
      ].filter(Boolean).join(' ');
    } else {
      usage.textContent = t('settings.usageNone');
    }
  }

  renderAccess();
  const stopMarket = marketData.subscribe((state) => { renderWatch(state); renderMarketAdmin(state); });

  return {
    update() {
      renderAccess();
      renderMarketAdmin(marketData.state);
    },
    stop() { stopMarket(); },
  };
}
