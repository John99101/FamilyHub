// FamilyHub main script: sign in, allow list check, navigation, and starting
// the pages once someone on the allow list is signed in.
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
import { createFamilyData } from './family-data.js';
import { createHome } from './home.js';
import { createCalendar } from './calendar.js';
import { createTasks } from './tasks.js';
import { createPolls } from './polls.js';
import { createRecipes } from './recipes.js';
import { createContacts } from './contacts.js';
import { createWeather } from './weather.js';
import { createFamilyPage } from './family-page.js';

export const APP_VERSION = '1.3.0';

// Fill all static text in the chosen language before anything is shown.
translatePage();

const SCREENS = ['loading', 'signin', 'noaccess', 'app'];
// tab: which tab is highlighted; back: a page under "Mehr" (shows a back link).
const ROUTES = {
  start: { title: 'nav.home', view: 'view-home', page: 'home', tab: 'start' },
  chat: { title: 'nav.chat', view: 'view-chat', page: 'chat', tab: 'chat' },
  kalender: { title: 'nav.calendar', view: 'view-calendar', page: 'calendar', tab: 'kalender' },
  aufgaben: { title: 'nav.tasks', view: 'view-tasks', page: 'tasks', tab: 'aufgaben' },
  mehr: { title: 'nav.more', view: 'view-more', tab: 'mehr' },
  familie: { title: 'nav.family', view: 'view-family', page: 'family', tab: 'mehr', back: true },
  umfragen: { title: 'nav.polls', view: 'view-polls', page: 'polls', tab: 'mehr', back: true },
  rezepte: { title: 'nav.recipes', view: 'view-recipes', page: 'recipes', tab: 'mehr', back: true },
  kontakte: { title: 'nav.contacts', view: 'view-contacts', page: 'contacts', tab: 'mehr', back: true },
  wetter: { title: 'nav.weather', view: 'view-weather', page: 'weather', tab: 'mehr', back: true },
  boerse: { title: 'nav.markets', view: 'view-markets', page: 'markets', tab: 'mehr', back: true },
  risiko: { title: 'nav.risk', view: 'view-risk', page: 'risk', tab: 'mehr', back: true },
  einstellungen: { title: 'nav.settings', view: 'view-settings', page: 'settings', tab: 'mehr', back: true },
};

let session = null;   // { user, claims, mail, access, isAdmin }
let stopAccess = null;
let pages = null;     // all pages, created once access is confirmed
let familyData = null;
let marketData = null;
let currentPage = null;
let authRound = 0;

function showScreen(name) {
  for (const screen of SCREENS) $(`screen-${screen}`).hidden = screen !== name;
}

function teardown() {
  if (stopAccess) stopAccess();
  stopAccess = null;
  if (pages) for (const page of Object.values(pages)) page.stop();
  if (familyData) familyData.stop();
  if (marketData) marketData.stop();
  pages = null;
  familyData = null;
  marketData = null;
  currentPage = null;
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
    if (!pages) {
      startApp();
    } else {
      pages.settings.update();
      if (wasAdmin !== session.isAdmin) {
        pages.chat.onRoleChange();
        pages.contacts.onRoleChange();
        pages.family.onRoleChange();
      }
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
  familyData = createFamilyData(session);
  marketData = createMarketData();
  const weather = createWeather(familyData);
  const calendar = createCalendar(familyData);
  const tasks = createTasks(familyData);
  const chat = createChat(session, familyData);
  pages = {
    chat,
    calendar,
    tasks,
    weather,
    family: createFamilyPage(familyData),
    polls: createPolls(familyData),
    recipes: createRecipes(familyData),
    contacts: createContacts(familyData),
    markets: createMarkets(marketData),
    risk: createRiskPage(marketData),
    settings: createSettings(session, { onSignOut: doSignOut, marketData, familyData }),
  };
  pages.home = createHome(familyData, { calendar, tasks, chat, weather });
  route();
}

function route() {
  if (!session || !pages) return;
  let name = location.hash.replace(/^#\/?/, '');
  if (!ROUTES[name]) name = 'start';
  const r = ROUTES[name];
  for (const [key, other] of Object.entries(ROUTES)) $(other.view).hidden = key !== name;
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.route === r.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  $('back-link').hidden = !r.back;
  const title = t(r.title);
  $('view-title').textContent = title;
  document.title = `${title} · FamilyHub`;
  const page = r.page ? pages[r.page] : null;
  if (currentPage && currentPage !== page && currentPage.onHide) currentPage.onHide();
  currentPage = page;
  if (page && page.onShow) page.onShow();
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
