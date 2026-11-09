// Settings: account, language, light or dark look, the watchlist and the
// market switches (people with market access), and the group's AI switches
// (group admins). Who is in the group is on the group page.
import { auth, db, doc, setDoc, serverTimestamp, arrayUnion, arrayRemove, sendPasswordResetEmail } from './firebase.js';
import { $, el, avatar, toast, formatDateTime } from './ui.js';
import { SYMBOL_PATTERN, WATCHLIST_MAX, findQuote, toDate } from './market-data.js';
import { t, languageChoice, setLanguageChoice } from './i18n.js';
import { isSimpleMode, setSimpleMode } from './simple.js';

const THEME_KEY = 'familyhub-theme';

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

export function createSettings(session, { onSignOut, marketData, familyData }) {
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

  // Mail and password accounts: a link to choose a new password goes to their own mail
  // (Google accounts change their password at Google).
  const passwordButton = $('btn-password');
  passwordButton.hidden = !session.user.providerData.some((p) => p.providerId === 'password');
  passwordButton.onclick = async () => {
    passwordButton.disabled = true;
    try {
      await sendPasswordResetEmail(auth, session.user.email);
      toast(t('settings.passwordMailSent', { mail: session.user.email }));
    } catch (err) {
      console.warn('Password mail failed', err.code);
      toast(t(err.code === 'auth/too-many-requests' ? 'start.err.tooMany' : 'start.err.failed'));
    } finally {
      passwordButton.disabled = false;
    }
  };

  // ---------- watchlist (everyone with market access) ----------

  $('card-watchlist').hidden = !session.markets;

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

  // ---------- market and AI switches, API usage (market admins only) ----------

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
    marketCard.hidden = !(session.markets && session.marketAdmin);
    if (marketCard.hidden) return;
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

  // ---------- weekly overview and translation switches (group admins; missing counts as on) ----------

  const digestCard = $('card-digest-admin');
  const digestSwitch = $('digest-switch');

  digestSwitch.onchange = async () => {
    const enabled = digestSwitch.checked;
    try {
      await setDoc(doc(db, 'config', 'digest'), { enabled, updatedAt: serverTimestamp(), updatedBy: session.mail });
      toast(t(enabled ? 'settings.digestOn' : 'settings.digestOff'));
    } catch (err) {
      console.warn('Saving the overview switch failed', err.code);
      toast(t('common.saveFailed'));
      digestSwitch.checked = !enabled;
    }
  };

  const translateSwitch = $('translate-switch');
  translateSwitch.onchange = async () => {
    const enabled = translateSwitch.checked;
    try {
      await setDoc(doc(db, 'config', 'translate'), { enabled, updatedAt: serverTimestamp(), updatedBy: session.mail });
      toast(t(enabled ? 'settings.translateOn' : 'settings.translateOff'));
    } catch (err) {
      console.warn('Saving the translation switch failed', err.code);
      toast(t('common.saveFailed'));
      translateSwitch.checked = !enabled;
    }
  };

  function renderDigestAdmin(state) {
    digestCard.hidden = !session.isAdmin;
    if (!session.isAdmin) return;
    digestSwitch.checked = state.digestSwitch?.enabled !== false;
    translateSwitch.checked = state.translateSwitch?.enabled !== false;
  }

  // ---------- simple mode (this device only) ----------

  const simpleSwitch = $('simple-switch');
  simpleSwitch.checked = isSimpleMode();
  simpleSwitch.onchange = () => setSimpleMode(simpleSwitch.checked);

  const stopMarket = marketData.subscribe((state) => { renderWatch(state); renderMarketAdmin(state); });
  const stopFamily = familyData.subscribe(renderDigestAdmin);

  return {
    update() {
      $('card-watchlist').hidden = !session.markets;
      renderMarketAdmin(marketData.state);
      renderDigestAdmin(familyData.state);
    },
    stop() { stopMarket(); stopFamily(); },
  };
}
