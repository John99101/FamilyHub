// FamilyHub main script: sign in, allow list check, navigation.
import {
  auth, db, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, doc, onSnapshot,
} from './firebase.js';
import { $, toast } from './ui.js';
import { t, translatePage } from './i18n.js';
import { createChat } from './chat.js';
import { createSettings, updateThemeColor } from './settings.js';
import { createMarketData } from './market-data.js';
import { createMarkets } from './markets.js';
import { createRiskPage } from './risk-page.js';

export const APP_VERSION = '1.1.0';

// Fill all static text in the chosen language before anything is shown.
translatePage();

const SCREENS = ['loading', 'signin', 'noaccess', 'app'];
const ROUTES = {
  chat: { title: 'nav.chat', view: 'view-chat' },
  boerse: { title: 'nav.markets', view: 'view-markets' },
  risiko: { title: 'nav.risk', view: 'view-risk' },
  einstellungen: { title: 'nav.settings', view: 'view-settings' },
};

let session = null;   // { user, claims, mail, access, isAdmin }
let stopAccess = null;
let chat = null;
let settings = null;
let marketData = null;
let markets = null;
let riskPage = null;
let authRound = 0;

function showScreen(name) {
  for (const screen of SCREENS) $(`screen-${screen}`).hidden = screen !== name;
}

function teardown() {
  if (stopAccess) stopAccess();
  stopAccess = null;
  if (chat) chat.stop();
  if (markets) markets.stop();
  if (riskPage) riskPage.stop();
  if (settings) settings.stop();
  if (marketData) marketData.stop();
  chat = null;
  settings = null;
  markets = null;
  riskPage = null;
  marketData = null;
  session = null;
}

// ---------- sign in ----------

function isInstalledApp() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  $('signin-error').textContent = '';
  try {
    // The installed app on phones handles popups badly, so it uses a full page redirect.
    if (isInstalledApp()) await signInWithRedirect(auth, provider);
    else await signInWithPopup(auth, provider);
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    console.warn('Sign in failed', err.code);
    $('signin-error').textContent = t('signin.failed');
  }
}

async function doSignOut() {
  teardown();
  await signOut(auth);
}

$('btn-signin').addEventListener('click', signIn);
$('btn-noaccess-signout').addEventListener('click', doSignOut);

getRedirectResult(auth).catch((err) => {
  console.warn('Redirect sign in failed', err.code);
  $('signin-error').textContent = t('signin.failed');
});

// ---------- access check ----------
// The allow list (config/access) can only be read by people who are on it.
// So: reading it works → member. Reading it is refused → "Kein Zugang" (no access).

onAuthStateChanged(auth, async (user) => {
  const round = ++authRound;
  teardown();
  if (!user) {
    showScreen('signin');
    return;
  }
  showScreen('loading');
  let claims;
  try {
    claims = (await user.getIdTokenResult()).claims;
  } catch (err) {
    console.warn('Token failed', err.code);
    showScreen('noaccess');
    return;
  }
  if (round !== authRound) return;

  session = { user, claims, mail: (user.email || '').toLowerCase(), access: null, isAdmin: false };
  stopAccess = onSnapshot(doc(db, 'config', 'access'), (snap) => {
    if (!session) return;
    const wasAdmin = session.isAdmin;
    session.access = snap.data() || { members: [], admins: [] };
    session.isAdmin = Array.isArray(session.access.admins) && session.access.admins.includes(session.mail);
    if (!chat) {
      startApp();
    } else {
      settings.update();
      if (wasAdmin !== session.isAdmin) chat.onRoleChange();
    }
  }, (err) => {
    console.warn('Access check failed', err.code);
    teardown();
    showScreen('noaccess');
  });
});

// ---------- app ----------

function startApp() {
  showScreen('app');
  chat = createChat(session);
  marketData = createMarketData();
  markets = createMarkets(marketData);
  riskPage = createRiskPage(marketData);
  settings = createSettings(session, { onSignOut: doSignOut, marketData });
  route();
}

function route() {
  if (!session || !chat) return;
  let name = location.hash.replace(/^#\/?/, '');
  if (!ROUTES[name]) name = 'chat';
  for (const [key, r] of Object.entries(ROUTES)) $(r.view).hidden = key !== name;
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.route === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  const title = t(ROUTES[name].title);
  $('view-title').textContent = title;
  document.title = `${title} · FamilyHub`;
  if (name === 'chat') chat.onShow();
  if (name === 'boerse') markets.onShow();
}

window.addEventListener('hashchange', route);

// ---------- look and installable app ----------

$('app-version').textContent = APP_VERSION;
updateThemeColor();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeColor);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker failed', err));
  });
}

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.code === 'unavailable') toast(t('common.offline'));
});
