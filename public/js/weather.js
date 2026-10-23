// Weather for the places where the family lives, from Open-Meteo (free for
// non commercial use, no key, licence CC BY 4.0). The browser asks
// Open-Meteo directly with the coordinates of the saved places (rounded to
// about 1 km); nothing else is sent. Answers are kept for 30 minutes.
import { db, collection, doc, addDoc, deleteDoc } from './firebase.js';
import { $, el, svgIcon, toast, card, emptyNote, addButton, formatWeekdayShort } from './ui.js';
import { t, lang } from './i18n.js';
import { canEdit, createdFields } from './family-data.js';
import { openDialog } from './dialog.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FRESH_MS = 30 * 60 * 1000;
const CACHE_KEY = 'familyhub-weather';
export const MAX_PLACES = 10;

/** WMO weather code → icon and text key. */
export function weatherInfo(code) {
  if (code === 0) return { icon: '☀️', key: 'weather.clear' };
  if (code === 1) return { icon: '🌤️', key: 'weather.mostlyClear' };
  if (code === 2) return { icon: '⛅', key: 'weather.partly' };
  if (code === 3) return { icon: '☁️', key: 'weather.cloudy' };
  if (code === 45 || code === 48) return { icon: '🌫️', key: 'weather.fog' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', key: 'weather.drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', key: code >= 80 ? 'weather.showers' : 'weather.rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: '🌨️', key: 'weather.snow' };
  if (code >= 95) return { icon: '⛈️', key: 'weather.thunder' };
  return { icon: '🌡️', key: 'weather.unknown' };
}

const round2 = (n) => Math.round(n * 100) / 100;
const deg = (n) => `${Math.round(n)}°`;

export function attribution() {
  return el('p', { class: 'footer-note' }, [
    t('weather.source'), ' ',
    el('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener noreferrer', text: 'Open Meteo' }),
    ' (', el('a', { href: 'https://creativecommons.org/licenses/by/4.0/', target: '_blank', rel: 'noopener noreferrer', text: 'CC BY 4.0' }), ')',
  ]);
}

export function createWeather(data) {
  const root = $('weather-content');
  const session = data.session;
  const listeners = new Set();
  let forecasts = new Map(); // place id → forecast
  let fetchedAt = 0;
  let fetchedFor = '';
  let loading = false;
  let failed = false;

  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (saved && Date.now() - saved.at < FRESH_MS) {
      forecasts = new Map(saved.items);
      fetchedAt = saved.at;
      fetchedFor = saved.key;
    }
  } catch { /* storage blocked or old format */ }

  const placesKey = () => data.state.places.map((p) => `${p.id}:${p.lat},${p.lon}`).sort().join('|');
  const notify = () => { for (const fn of listeners) fn(); };

  /** Fetches the forecasts if they are older than 30 minutes or the places changed. */
  async function ensureFresh() {
    const places = data.state.places;
    const key = placesKey();
    if (!places.length || loading) return;
    if (key === fetchedFor && Date.now() - fetchedAt < FRESH_MS) return;
    loading = true;
    failed = false;
    notify();
    try {
      const params = new URLSearchParams({
        latitude: places.map((p) => p.lat).join(','),
        longitude: places.map((p) => p.lon).join(','),
        current: 'temperature_2m,weather_code,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        timezone: 'auto',
        forecast_days: '4',
      });
      const response = await fetch(`${FORECAST_URL}?${params}`, { referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const json = await response.json();
      const list = Array.isArray(json) ? json : [json];
      forecasts = new Map(places.map((p, i) => [p.id, list[i]]));
      fetchedAt = Date.now();
      fetchedFor = key;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: fetchedAt, key, items: [...forecasts] })); } catch { /* storage blocked */ }
    } catch (err) {
      console.warn('Weather failed', err.message);
      failed = true;
    } finally {
      loading = false;
      notify();
    }
  }

  // ---------- drawing ----------

  function placeCard(place) {
    const f = forecasts.get(place.id);
    const remove = canEdit(session, place)
      ? el('button', { class: 'btn-link danger', type: 'button', text: t('common.remove'), onclick: () => removePlace(place) })
      : null;
    const head = el('div', { class: 'card-head' }, [
      el('h2', {}, [place.name, place.country ? el('span', { class: 'muted place-country', text: ` ${place.country}` }) : null]),
      remove,
    ]);
    if (!f || !f.current || !f.daily) {
      return el('section', { class: 'card weather-card' }, [head, emptyNote(failed ? t('weather.failed') : t('common.loading'))]);
    }
    const now = weatherInfo(f.current.weather_code);
    const current = el('div', { class: 'weather-now' }, [
      el('span', { class: 'weather-icon big', text: now.icon, 'aria-hidden': 'true' }),
      el('span', { class: 'weather-temp', text: deg(f.current.temperature_2m) }),
      el('span', { class: 'weather-desc' }, [
        el('span', { text: t(now.key) }),
        el('span', { class: 'muted small', text: t('weather.wind', { n: Math.round(f.current.wind_speed_10m) }) }),
      ]),
    ]);
    const days = f.daily.time.map((day, i) => {
      const info = weatherInfo(f.daily.weather_code[i]);
      const rain = f.daily.precipitation_probability_max?.[i];
      return el('li', { class: 'weather-day' }, [
        el('span', { class: 'weather-dayname', text: i === 0 ? t('day.today') : formatWeekdayShort(day) }),
        el('span', { class: 'weather-icon', text: info.icon, title: t(info.key), 'aria-label': t(info.key) }),
        el('span', { class: 'weather-range', text: `${deg(f.daily.temperature_2m_max[i])} / ${deg(f.daily.temperature_2m_min[i])}` }),
        el('span', { class: 'muted small weather-rain', text: typeof rain === 'number' ? t('weather.rainChance', { n: rain }) : '' }),
      ]);
    });
    return el('section', { class: 'card weather-card' }, [head, current, el('ul', { class: 'weather-days' }, days)]);
  }

  function render() {
    const places = data.state.places;
    const parts = [];
    const add = places.length < MAX_PLACES ? addButton(t('weather.addPlace'), openAddPlace) : null;
    if (!places.length) {
      parts.push(card(t('nav.weather'), emptyNote(data.state.loaded.places ? t('weather.noPlaces') : t('common.loading')), { action: add }));
    } else {
      parts.push(el('div', { class: 'page-actions' }, [add]));
      parts.push(...[...places].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(placeCard));
    }
    parts.push(attribution());
    root.replaceChildren(...parts);
  }

  // ---------- adding a place ----------

  function openAddPlace() {
    const input = el('input', { class: 'search-input', type: 'search', placeholder: t('weather.searchPlaceholder'), 'aria-label': t('weather.searchPlaceholder'), autocomplete: 'off' });
    const results = el('ul', { class: 'place-results', 'aria-live': 'polite' });
    const form = el('form', { class: 'add-row', novalidate: true }, [input, el('button', { class: 'btn btn-primary btn-small', type: 'submit', text: t('weather.search') })]);
    const credit = el('p', { class: 'field-hint' }, [
      t('weather.geoSource'), ' ',
      el('a', { href: 'https://www.geonames.org/', target: '_blank', rel: 'noopener noreferrer', text: 'GeoNames' }),
      ' (', el('a', { href: 'https://creativecommons.org/licenses/by/4.0/', target: '_blank', rel: 'noopener noreferrer', text: 'CC BY 4.0' }), ')',
    ]);
    const handle = openDialog({ title: t('weather.addPlace'), content: [el('p', { class: 'field-hint', text: t('weather.searchHint') }), form, results, credit] });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (name.length < 2) return;
      results.replaceChildren(el('li', { class: 'muted small', text: t('common.loading') }));
      try {
        const params = new URLSearchParams({ name, count: '6', language: lang, format: 'json' });
        const response = await fetch(`${GEOCODING_URL}?${params}`, { referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const found = (await response.json()).results || [];
        if (!found.length) { results.replaceChildren(el('li', { class: 'muted small', text: t('weather.nothingFound') })); return; }
        results.replaceChildren(...found.map((r) => {
          const where = [r.admin1, r.country].filter(Boolean).join(', ');
          return el('li', {}, [el('button', {
            class: 'place-result', type: 'button',
            onclick: async () => { if (await savePlace(r)) handle.close(); },
          }, [el('span', { class: 'place-name', text: r.name }), el('span', { class: 'muted small', text: where })])]);
        }));
      } catch (err) {
        console.warn('Place search failed', err.message);
        results.replaceChildren(el('li', { class: 'form-error', text: t('weather.failed') }));
      }
    });
    if (!matchMedia('(pointer: coarse)').matches) input.focus();
  }

  async function savePlace(r) {
    if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return false;
    try {
      await addDoc(collection(db, 'places'), {
        name: String(r.name || '').slice(0, 60) || '?',
        country: String(r.country || '').slice(0, 60),
        lat: round2(r.latitude),
        lon: round2(r.longitude),
        ...createdFields(session),
      });
      toast(t('weather.placeAdded', { name: r.name }));
      return true;
    } catch (err) {
      console.warn('Saving the place failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  async function removePlace(place) {
    if (!confirm(t('weather.confirmRemove', { name: place.name }))) return;
    try {
      await deleteDoc(doc(db, 'places', place.id));
    } catch (err) {
      console.warn('Removing the place failed', err.code);
      toast(t('common.saveFailed'));
    }
  }

  let visible = false;
  listeners.add(() => { if (visible) render(); });
  const stop = data.subscribe(() => { if (visible) { render(); ensureFresh(); } });

  return {
    forecasts: () => forecasts,
    isFailed: () => failed,
    ensureFresh,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onShow() { visible = true; render(); ensureFresh(); },
    onHide() { visible = false; },
    stop() { stop(); listeners.clear(); root.replaceChildren(); },
  };
}
