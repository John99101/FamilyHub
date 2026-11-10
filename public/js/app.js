// FamilyHub main script: sign in (Google, or mail and password), choosing a
// group, navigation, and starting the pages once the person is in the group.
import {
  auth, db, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, doc, collection, getDoc, onSnapshot,
} from './firebase.js';
import { $, toast } from './ui.js';
import { t, translatePage } from './i18n.js';
import { activeGroup, setActiveGroup } from './scope.js';
import { applyDesign, storedDesign, featureOn } from './design.js';
import { setupMailSignIn, showVerify, showGroups } from './start.js';
import { createGroupPage } from './group-page.js';
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
import { createBoard } from './board.js';
import { createTrips } from './trips.js';
import { createVoucherPage } from './voucher-page.js';
import { createQuestionPage } from './question-page.js';
import { createTree } from './tree.js';
import { isSimpleMode, SIMPLE_ROUTES } from './simple.js';
import { buildSidebar, setupMorePage } from './nav.js';

export const APP_VERSION = '1.8.2';

// Fill all static text in the chosen language before anything is shown.
translatePage();
// The sidebar copies the translated page names; the More page gets search and pins.
buildSidebar();
const morePage = setupMorePage();

// The look of the group used last on this device, until the group itself is read.
applyDesign(storedDesign(), { keep: false });

// Simple mode (big text, only the essentials) is chosen per device.
const SIMPLE = isSimpleMode();
document.documentElement.classList.toggle('simple', SIMPLE);

const SCREENS = ['loading', 'signin', 'verify', 'groups', 'app'];
// tab: which tab is highlighted; back: a page under "Mehr" (shows a back link).
const ROUTES = {
  start: { title: 'nav.home', view: 'view-home', page: 'home', tab: 'start' },
  chat: { title: 'nav.chat', view: 'view-chat', page: 'chat', tab: 'chat' },
  kalender: { title: 'nav.calendar', view: 'view-calendar', page: 'calendar', tab: 'kalender' },
  aufgaben: { title: 'nav.tasks', view: 'view-tasks', page: 'tasks', tab: 'aufgaben' },
  mehr: { title: 'nav.more', view: 'view-more', tab: 'mehr' },
  gruppe: { title: 'nav.group', view: 'view-group', page: 'group', tab: 'mehr', back: true },
  familie: { title: 'nav.family', view: 'view-family', page: 'family', tab: 'mehr', back: true },
  pinnwand: { title: 'nav.board', view: 'view-board', page: 'board', tab: 'mehr', back: true },
  reisen: { title: 'nav.trips', view: 'view-trips', page: 'trips', tab: 'mehr', back: true },
  gutscheine: { title: 'nav.vouchers', view: 'view-vouchers', page: 'vouchers', tab: 'mehr', back: true },
  frage: { title: 'nav.question', view: 'view-question', page: 'question', tab: 'mehr', back: true },
  stammbaum: { title: 'nav.tree', view: 'view-tree', page: 'tree', tab: 'mehr', back: true },
  umfragen: { title: 'nav.polls', view: 'view-polls', page: 'polls', tab: 'mehr', back: true },
  rezepte: { title: 'nav.recipes', view: 'view-recipes', page: 'recipes', tab: 'mehr', back: true },
  kontakte: { title: 'nav.contacts', view: 'view-contacts', page: 'contacts', tab: 'mehr', back: true },
  wetter: { title: 'nav.weather', view: 'view-weather', page: 'weather', tab: 'mehr', back: true },
  boerse: { title: 'nav.markets', view: 'view-markets', page: 'markets', tab: 'mehr', back: true },
  risiko: { title: 'nav.risk', view: 'view-risk', page: 'risk', tab: 'mehr', back: true },
  einstellungen: { title: 'nav.settings', view: 'view-settings', page: 'settings', tab: 'mehr', back: true },
};
// The group page switch each route belongs to (a switched off page leads to the start page).
const ROUTE_FEATURE = {
  chat: 'chat', kalender: 'calendar', aufgaben: 'tasks', umfragen: 'polls', reisen: 'trips', gutscheine: 'vouchers', pinnwand: 'board',
  stammbaum: 'tree', frage: 'question', rezepte: 'recipes', kontakte: 'contacts', wetter: 'weather', boerse: 'markets', risiko: 'markets',
};

// { user, claims, mail, groupId, group, members, access: { members, admins }, isAdmin, markets, marketUser, marketAdmin }
let session = null;
let stops = [];       // listeners of the open group
let pages = null;     // all pages, created once the group is read
let familyData = null;
let marketData = null;
let currentPage = null;
let authRound = 0;

function showScreen(name) {
  for (const screen of SCREENS) $(`screen-${screen}`).hidden = screen !== name;
}

function teardown() {
  for (const stop of stops) stop();
  stops = [];
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
setupMailSignIn();

getRedirectResult(auth).catch((err) => {
  console.warn('Redirect sign in failed', err.code);
  $('signin-error').textContent = t('signin.failed');
});

onAuthStateChanged(auth, (user) => { openSession(user); });

async function openSession(user) {
  const round = ++authRound;
  teardown();
  if (!user) { outsideGroup('signin'); return; }
  // Mail and password: only after the mail is confirmed (Google mails always are).
  if (!user.emailVerified) {
    outsideGroup('verify');
    showVerify(user, { onConfirmed: openSession, onSignOut: doSignOut });
    return;
  }
  showScreen('loading');
  let claims;
  try {
    claims = (await user.getIdTokenResult()).claims;
  } catch (err) {
    console.warn('Token failed', err.code);
    showScreen('signin');
    return;
  }
  if (round !== authRound) return;
  session = {
    user, claims, mail: (user.email || '').toLowerCase(), groupId: activeGroup(), group: null, members: [],
    access: { members: [], admins: [] }, isAdmin: false, markets: false, marketUser: false, marketAdmin: false,
  };
  if (session.groupId) openGroup(round);
  else pickGroup();
}

/** Screens outside a group (sign in, mail check, group list, wizard) get the usual look and title. */
function outsideGroup(screen) {
  applyDesign({}, { keep: false });
  document.title = 'FamilyHub';
  showScreen(screen);
}

function pickGroup() {
  outsideGroup('groups');
  showGroups(session, { onOpen: switchTo, onSignOut: doSignOut });
}

/** Opens another group (or the group list with ''): a fresh start, so nothing of the old group remains. */
function switchTo(groupId) {
  setActiveGroup(groupId);
  location.hash = '#/start';
  location.reload();
}

// ---------- the open group ----------
// Members read their group; for anyone else every read is refused. So a
// refused read means: removed from the group, or the group is gone.

function openGroup(round) {
  const { uid } = session.user;
  const g = session.groupId;
  const loaded = { member: false, group: false, members: false, markets: false };
  let lost = false;

  const leave = (err) => {
    if (lost || round !== authRound) return;
    lost = true;
    console.warn('Group not available', err?.code || 'not a member');
    switchTo('');
  };

  const ready = (key) => {
    loaded[key] = true;
    if (round !== authRound || lost) return;
    if (!pages) {
      if (Object.values(loaded).every(Boolean)) startApp();
      return;
    }
    groupChanged();
  };

  stops.push(onSnapshot(doc(db, 'groups', g, 'members', uid), (snap) => {
    if (!snap.exists()) { leave(); return; }
    const wasAdmin = session.isAdmin;
    session.isAdmin = snap.data().role === 'admin';
    ready('member');
    if (pages && wasAdmin !== session.isAdmin) {
      pages.chat.onRoleChange();
      pages.contacts.onRoleChange();
      pages.family.onRoleChange();
    }
  }, leave));

  stops.push(onSnapshot(doc(db, 'groups', g), (snap) => {
    if (!snap.exists()) { leave(); return; }
    session.group = snap.data();
    applyDesign(session.group.design || {});
    ready('group');
  }, leave));

  stops.push(onSnapshot(collection(db, 'groups', g, 'members'), (snap) => {
    session.members = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    const mails = (role) => session.members.filter((m) => m.role === role && typeof m.mail === 'string').map((m) => m.mail);
    session.access = { admins: mails('admin'), members: mails('member') };
    ready('members');
  }, leave));

  // Market access belongs to the person, not the group (phase 3 adds an unlock code).
  getDoc(doc(db, 'marketAccess', uid)).then((snap) => {
    session.marketUser = snap.exists();
    session.marketAdmin = snap.exists() && snap.data().admin === true;
  }).catch((err) => console.warn('Reading market access failed', err.code))
    .finally(() => ready('markets'));
}

function routeOn(name) {
  const feature = ROUTE_FEATURE[name];
  if (!feature) return true;
  if (feature === 'markets') return session.markets;
  return featureOn(session.group, feature);
}

/** Shows the group's name, and only the tabs and tiles of its pages. */
function showGroupFrame() {
  session.markets = featureOn(session.group, 'markets') && session.marketUser;
  const groupName = `${session.group.icon || ''} ${session.group.name || ''}`.trim();
  $('app-name').textContent = groupName;
  $('side-group').textContent = groupName;
  for (const link of document.querySelectorAll('.tab[data-route], .tile[href^="#/"], .side-link')) {
    const name = link.dataset.route || link.getAttribute('href').slice(2);
    (link.closest('.tile-wrap') || link).hidden = !routeOn(name);
  }
  morePage.refresh();
}

function groupChanged() {
  showGroupFrame();
  pages.settings.update();
  pages.group.update();
  pages.home.update();
  const name = location.hash.replace(/^#\/?/, '');
  if (ROUTES[name] && !routeOn(name)) location.hash = '#/start';
}

// ---------- app ----------

function startApp() {
  showScreen('app');
  showGroupFrame();
  familyData = createFamilyData(session);
  marketData = createMarketData(session.markets);
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
    board: createBoard(familyData),
    trips: createTrips(familyData),
    vouchers: createVoucherPage(familyData),
    question: createQuestionPage(familyData),
    tree: createTree(familyData),
    polls: createPolls(familyData),
    recipes: createRecipes(familyData),
    contacts: createContacts(familyData),
    markets: createMarkets(marketData),
    risk: createRiskPage(marketData),
    settings: createSettings(session, { onSignOut: doSignOut, marketData, familyData }),
    group: createGroupPage(session, { onSwitch: () => switchTo('') }),
  };
  pages.home = createHome(familyData, { calendar, tasks, chat, weather, board: pages.board, trips: pages.trips });
  calendar.setTripOpener((path) => { location.hash = '#/reisen'; pages.trips.open(path); });
  route();
}

function route() {
  if (!session || !pages) return;
  let name = location.hash.replace(/^#\/?/, '');
  if (!ROUTES[name]) name = 'start';
  if (SIMPLE && !SIMPLE_ROUTES.has(name)) name = 'start';
  if (!routeOn(name)) name = 'start';
  const r = ROUTES[name];
  for (const [key, other] of Object.entries(ROUTES)) $(other.view).hidden = key !== name;
  for (const tab of document.querySelectorAll('.tab, .side-link')) {
    const current = tab.classList.contains('side-link') ? name : r.tab;
    if (tab.dataset.route === current) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  $('back-link').hidden = !r.back;
  const title = t(r.title);
  $('view-title').textContent = title;
  document.title = `${title} · ${session.group.name || 'FamilyHub'}`;
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
