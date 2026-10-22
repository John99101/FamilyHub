// Settings: account, light or dark look, the family watchlist, and (admins
// only) the market switch and the allow list.
import { db, doc, setDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from './firebase.js';
import { $, el, avatar, toast, formatDateTime } from './ui.js';
import { SYMBOL_PATTERN, WATCHLIST_MAX, findQuote, toDate } from './market-data.js';

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
  $('account-name').textContent = name || 'Ohne Namen';
  $('account-mail').textContent = session.mail;

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
    all.sort((a, b) => (admins.has(b) - admins.has(a)) || a.localeCompare(b, 'de'));
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
      error.textContent = 'Speichern hat nicht geklappt. Bitte erneut versuchen.';
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
          class: 'btn-link', type: 'button', text: 'Adminrechte entziehen',
          onclick: () => save({ admins: arrayRemove(p.mail), members: arrayUnion(p.mail) }, 'Adminrechte entzogen'),
        }));
      }
      if (!p.admin) {
        actions.append(el('button', {
          class: 'btn-link', type: 'button', text: 'Zum Admin machen', disabled: adminCount >= MAX_ADMINS,
          onclick: () => save({ admins: arrayUnion(p.mail), members: arrayRemove(p.mail) }, 'Neuer Admin gespeichert'),
        }));
      }
      if (!p.me) {
        actions.append(el('button', {
          class: 'btn-link danger', type: 'button', text: 'Entfernen',
          onclick: () => {
            if (!confirm(`${p.mail} entfernen? Diese Person kann sich danach nicht mehr anmelden.`)) return;
            save({ admins: arrayRemove(p.mail), members: arrayRemove(p.mail) }, 'Zugang entfernt');
          },
        }));
      }
      return el('li', { class: 'person' }, [
        el('span', { class: 'person-mail' }, [
          p.mail,
          p.me ? el('span', { class: 'muted', text: ' (du)' }) : null,
          p.admin ? el('span', { class: 'badge', text: 'Admin' }) : null,
        ]),
        actions,
      ]);
    }));
  }

  form.onsubmit = (event) => {
    event.preventDefault();
    const mail = input.value.trim().toLowerCase();
    error.textContent = '';
    if (!MAIL_PATTERN.test(mail)) { error.textContent = 'Bitte eine gültige Mailadresse eingeben.'; return; }
    if (people().some((p) => p.mail === mail)) { error.textContent = 'Diese Mailadresse ist schon in der Liste.'; return; }
    if ((session.access.members || []).length >= MAX_MEMBERS) { error.textContent = `Die Liste ist voll (höchstens ${MAX_MEMBERS} Mitglieder).`; return; }
    save({ members: arrayUnion(mail) }, 'Mailadresse hinzugefügt').then(() => {
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
      watchError.textContent = 'Speichern hat nicht geklappt. Bitte erneut versuchen.';
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
          class: 'btn-link danger', type: 'button', text: 'Entfernen',
          onclick: () => saveWatch(arrayRemove(symbol), `${symbol} entfernt`),
        })]),
      ]);
    }));
    if (!state.watchlist.length) watchList.append(el('li', { class: 'person muted small', text: 'Noch keine Symbole.' }));
  }

  watchForm.onsubmit = async (event) => {
    event.preventDefault();
    const symbol = watchInput.value.trim().toUpperCase();
    const current = marketData.state.watchlist;
    watchError.textContent = '';
    if (!SYMBOL_PATTERN.test(symbol)) { watchError.textContent = 'Bitte ein gültiges Symbol eingeben, zum Beispiel AAPL oder BRK.B.'; return; }
    if (current.includes(symbol)) { watchError.textContent = 'Dieses Symbol ist schon in der Watchlist.'; return; }
    if (current.length >= WATCHLIST_MAX) { watchError.textContent = `Die Watchlist ist voll (höchstens ${WATCHLIST_MAX} Symbole).`; return; }
    if (await saveWatch(arrayUnion(symbol), `${symbol} hinzugefügt`)) watchInput.value = '';
  };

  // ---------- market switch and API usage (admins only) ----------

  const marketCard = $('card-market-admin');
  const marketSwitch = $('market-switch');
  const usage = $('market-usage');

  marketSwitch.onchange = async () => {
    const enabled = marketSwitch.checked;
    if (enabled && !confirm('Kursabruf einschalten? Der Server holt dann an US Handelstagen alle 30 Minuten Kurse von NGN Market.')) {
      marketSwitch.checked = false;
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'market'), { enabled, updatedAt: serverTimestamp(), updatedBy: session.mail });
      toast(enabled ? 'Kursabruf eingeschaltet' : 'Kursabruf ausgeschaltet');
    } catch (err) {
      console.warn('Saving the market switch failed', err.code);
      toast('Speichern hat nicht geklappt.');
      marketSwitch.checked = !enabled;
    }
  };

  function renderMarketAdmin(state) {
    marketCard.hidden = !session.isAdmin;
    if (!session.isAdmin) return;
    marketSwitch.checked = state.switch?.enabled === true;
    const s = state.status;
    if (s && typeof s.callsRemaining === 'number') {
      const reset = toDate(s.resetAt);
      const lastRun = toDate(s.lastRunAt);
      usage.textContent = `NGN Abrufe: ${s.callsUsed ?? '?'} verbraucht, ${s.callsRemaining} übrig.`
        + (reset ? ` Neues Kontingent ab ${formatDateTime(reset)}.` : '')
        + (lastRun ? ` Letzter Lauf: ${formatDateTime(lastRun)}.` : '');
    } else {
      usage.textContent = 'Noch kein Abruf gelaufen.';
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
