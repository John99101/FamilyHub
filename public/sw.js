// FamilyHub service worker.
// It only keeps the page files (HTML, CSS, JS, icons) so the app opens
// quickly and can be installed. Chat messages, market data and anything from
// Google or other servers are never touched or stored here.
const VERSION = '1.2.0';
const CACHE = `familyhub-page-${VERSION}`;
const PAGE_FILES = [
  '/',
  '/index.html',
  '/css/app.css',
  '/css/family.css',
  '/js/theme-boot.js',
  '/js/app.js',
  '/js/firebase.js',
  '/js/firebase-config.js',
  '/js/ui.js',
  '/js/chat.js',
  '/js/settings.js',
  '/js/market-data.js',
  '/js/markets.js',
  '/js/risk-page.js',
  '/js/i18n.js',
  '/js/strings.js',
  '/js/strings-family.js',
  '/js/dates.js',
  '/js/dialog.js',
  '/js/family-data.js',
  '/js/home.js',
  '/js/calendar.js',
  '/js/tasks.js',
  '/js/polls.js',
  '/js/recipes.js',
  '/js/contacts.js',
  '/js/weather.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PAGE_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('familyhub-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Other servers (Firebase, Google, fonts, data): not our business.
  if (url.origin !== self.location.origin) return;
  // Firebase reserved paths (sign in handler and so on).
  if (url.pathname.startsWith('/__/')) return;

  const isPage = request.mode === 'navigate';
  const path = isPage ? '/index.html' : url.pathname;
  if (!PAGE_FILES.includes(path)) return;

  // Network first, so updates show up at once; the stored copy is only a fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(path, copy));
        }
        return response;
      })
      .catch(() => caches.match(path)),
  );
});
