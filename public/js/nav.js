// Navigation: the sidebar on wide screens and the More page's search and
// pinned pages. The sidebar is built from the tabs and the More tiles, so
// page names, icons and the group's page switches stay in one place.
// Pins are kept on this device only.
import { $, el, svgIcon } from './ui.js';
import { t } from './i18n.js';
import { matchesQuery, cleanPins } from './find.js';

const PINS_KEY = 'familyhub-pins';
// About the group and this person: at the bottom of the sidebar.
const SIDE_BOTTOM = ['gruppe', 'familie', 'einstellungen'];
const PIN_ICON = ['M12 17v5', 'M9 10.8V4h6v6.8l3 3.2v2H6v-2z'];

function readPins(known) {
  try {
    return cleanPins(JSON.parse(localStorage.getItem(PINS_KEY) || '[]'), known);
  } catch {
    return [];
  }
}

function writePins(pins) {
  try { localStorage.setItem(PINS_KEY, JSON.stringify(pins)); } catch { /* storage blocked: pins last until reload */ }
}

/** A sidebar link with a copy of the tab's or tile's icon. */
function sideLink(route, icon, label) {
  const copy = icon.cloneNode(true);
  copy.removeAttribute('id');
  for (const withId of copy.querySelectorAll('[id]')) withId.removeAttribute('id');
  return el('a', { class: 'side-link', href: `#/${route}`, 'data-route': route }, [copy, el('span', { text: label })]);
}

/** Fills the sidebar (shown on wide screens) with every page, in the usual order. */
export function buildSidebar() {
  const tabs = [...document.querySelectorAll('.tabbar .tab')].filter((a) => a.dataset.route !== 'mehr')
    .map((a) => sideLink(a.dataset.route, a.querySelector('.tab-icon, svg'), a.querySelector('span[data-i18n]').textContent));
  const tiles = [...document.querySelectorAll('#view-more .tile')].map((a) => {
    const route = a.getAttribute('href').slice(2);
    return sideLink(route, a.querySelector('svg'), a.querySelector('.tile-title').textContent);
  });
  const isBottom = (link) => SIDE_BOTTOM.includes(link.dataset.route);
  $('side-main').replaceChildren(...tabs, ...tiles.filter((l) => !isBottom(l)));
  $('side-bottom').replaceChildren(...tiles.filter(isBottom));
}

/** Search and pins on the More page. */
export function setupMorePage() {
  const grid = document.querySelector('#view-more .tiles');
  const tiles = [...grid.querySelectorAll('.tile')];
  const known = tiles.map((a) => a.getAttribute('href'));
  let pins = readPins(known);

  const input = el('input', {
    type: 'search', class: 'more-search', placeholder: t('nav.search'), 'aria-label': t('nav.search'),
    autocomplete: 'off', enterkeyhint: 'go',
  });
  const none = el('p', { class: 'empty-note', text: t('nav.noMatch'), hidden: true });

  const items = tiles.map((a) => {
    const href = a.getAttribute('href');
    const title = a.querySelector('.tile-title').textContent;
    const button = el('button', { class: 'pin-btn', type: 'button' }, [svgIcon(PIN_ICON)]);
    const wrap = el('div', { class: 'tile-wrap' });
    a.replaceWith(wrap);
    wrap.append(a, button);
    button.addEventListener('click', () => {
      pins = pins.includes(href) ? pins.filter((x) => x !== href) : [...pins, href];
      writePins(pins);
      apply();
    });
    return { wrap, button, href, title, texts: [title, a.querySelector('.tile-sub').textContent] };
  });

  const order = (item) => (pins.includes(item.href) ? pins.indexOf(item.href) - 100 : 0);
  const visible = () => items.filter((x) => !x.wrap.hidden && !x.wrap.classList.contains('search-miss'));

  function apply() {
    for (const item of items) {
      const pinned = pins.includes(item.href);
      item.wrap.style.order = String(order(item));
      item.wrap.classList.toggle('pinned', pinned);
      item.button.setAttribute('aria-pressed', pinned ? 'true' : 'false');
      const label = t(pinned ? 'nav.unpin' : 'nav.pin', { page: item.title });
      item.button.setAttribute('aria-label', label);
      item.button.title = label;
      item.wrap.classList.toggle('search-miss', !matchesQuery(item.texts, input.value));
    }
    none.hidden = visible().length > 0;
  }

  input.addEventListener('input', apply);
  // Enter opens the first page found (pinned ones come first).
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const first = visible().sort((a, b) => order(a) - order(b))[0];
    if (first) location.hash = first.href;
  });

  grid.before(el('div', { class: 'more-search-row' }, [input]));
  grid.after(none);
  apply();
  return { refresh: apply };
}
