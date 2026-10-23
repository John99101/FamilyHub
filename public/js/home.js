// Start page: the weekly overview, the next days, birthdays, tasks, polls
// that wait for a vote, the newest chat messages and the weather.
import { $, el, card, emptyNote, formatWeekdayDay, formatDayMonth, formatTime, relativeDays } from './ui.js';
import { t, lang } from './i18n.js';
import { todayIso, addDays, daysBetween, upcoming } from './dates.js';
import { firstName, myName, toDate } from './family-data.js';
import { entryMeta, entryIcon } from './calendar.js';
import { taskItem, sortOpenTasks } from './tasks.js';
import { myVote, voteCount } from './polls.js';
import { weatherInfo } from './weather.js';

const NEXT_DAYS = 7;
const BIRTHDAY_DAYS = 30;

function greeting(name) {
  const hour = new Date().getHours();
  const key = hour < 11 ? 'home.morning' : hour < 18 ? 'home.day' : 'home.evening';
  return name ? t(`${key}Name`, { name }) : t(key);
}

const link = (href, text) => el('a', { class: 'btn-link', href, text });

export function createHome(data, pages) {
  const root = $('home-content');
  const session = data.session;
  let visible = false;

  function digestCard() {
    const sw = data.state.digestSwitch;
    if (sw && sw.enabled === false) return null;
    const d = data.state.digest;
    let body;
    if (!d || (!d.weekStart && !d.empty)) {
      body = emptyNote(t('home.digestFirst'));
    } else if (d.empty) {
      body = emptyNote(t('home.digestEmpty'));
    } else {
      body = el('p', { class: 'summary-text', text: d[lang] || d.de || '' });
    }
    const note = d && d.weekStart
      ? t('home.digestNote', { date: formatWeekdayDay(d.weekStart) })
      : t('home.digestAbout');
    return card(t('home.digestTitle'), [body, el('p', { class: 'muted small', text: note })], { className: 'card-digest' });
  }

  function nextDaysCard() {
    const today = todayIso();
    const items = upcoming([...data.state.events, ...data.state.yearly], today, addDays(today, NEXT_DAYS - 1));
    const action = link('#/kalender', t('home.toCalendar'));
    if (!items.length) return card(t('home.nextDays'), emptyNote(data.state.loaded.events ? t('home.nothingPlanned') : t('common.loading')), { action });
    const groups = [];
    for (const item of items.slice(0, 12)) {
      let group = groups[groups.length - 1];
      if (!group || group.day !== item.day) { group = { day: item.day, items: [] }; groups.push(group); }
      group.items.push(item);
    }
    const list = groups.map((g) => {
      const diff = daysBetween(today, g.day);
      const label = diff <= 1 ? `${relativeDays(diff)} · ${formatWeekdayDay(g.day)}` : formatWeekdayDay(g.day);
      return el('div', { class: 'home-day' }, [
        el('h3', { class: 'home-day-title', text: label }),
        el('ul', { class: 'entry-list' }, g.items.map((item) => {
          const e = item.event;
          const meta = entryMeta(item, item.day);
          return el('li', {}, [el('button', {
            class: 'entry', type: 'button',
            onclick: () => { location.hash = '#/kalender'; pages.calendar.showDay(item.day); },
          }, [
            el('span', { class: `entry-time ${e.time ? '' : 'entry-icon'}`, text: e.time || entryIcon(e) || t('cal.allDay') }),
            el('span', { class: 'entry-main' }, [
              el('span', { class: 'entry-title', text: e.title }),
              meta ? el('span', { class: 'entry-meta', text: meta }) : null,
            ]),
          ])]);
        })),
      ]);
    });
    return card(t('home.nextDays'), list, { action });
  }

  function birthdaysCard() {
    const today = todayIso();
    const from = addDays(today, NEXT_DAYS); // the next 7 days are already above
    const items = upcoming(data.state.yearly.filter((e) => e.kind === 'birthday'), from, addDays(today, BIRTHDAY_DAYS)).slice(0, 5);
    if (!items.length) return null;
    return card(t('home.birthdays'), el('ul', { class: 'simple-list' }, items.map((item) => el('li', {}, [
      el('span', { class: 'simple-main', text: `🎂 ${item.event.title}` }),
      el('span', { class: 'muted small', text: [formatDayMonth(item.day), relativeDays(daysBetween(today, item.day)), item.years ? t('cal.turns', { n: item.years }) : ''].filter(Boolean).join(' · ') }),
    ]))));
  }

  function tasksCard() {
    const today = todayIso();
    const open = sortOpenTasks(data.state.tasksOpen);
    const soon = addDays(today, NEXT_DAYS - 1);
    const mine = open.filter((x) => x.assignee === session.mail || (!x.assignee && x.due && x.due <= soon));
    const action = link('#/aufgaben', t('home.toTasks'));
    if (!open.length) return card(t('home.tasks'), emptyNote(data.state.loaded.tasksOpen ? t('home.noTasks') : t('common.loading')), { action });
    const shown = mine.slice(0, 6);
    const children = shown.length
      ? [el('ul', { class: 'task-list' }, shown.map((x) => taskItem(data, x, { onOpen: (task) => { location.hash = '#/aufgaben'; pages.tasks.open(task); } })))]
      : [emptyNote(t('home.nothingForYou'))];
    const rest = open.length - shown.length;
    if (rest > 0) children.push(el('p', { class: 'muted small', text: t('home.moreTasks', { n: rest }) }));
    return card(t('home.tasks'), children, { action });
  }

  function pollsCard() {
    const waiting = data.state.polls.filter((p) => !p.closed && !myVote(p, session.user.uid).length);
    if (!waiting.length) return null;
    return card(t('home.polls'), el('ul', { class: 'simple-list' }, waiting.slice(0, 4).map((p) => el('li', {}, [
      el('a', { class: 'simple-main link-plain', href: '#/umfragen', text: p.question }),
      el('span', { class: 'muted small', text: t('polls.votes', { n: voteCount(p) }) }),
    ]))), { action: link('#/umfragen', t('home.toPolls')) });
  }

  function chatCard() {
    const rooms = data.state.rooms.filter((r) => r.last && r.last.text).slice(0, 4);
    const action = link('#/chat', t('home.toChat'));
    if (!rooms.length) return card(t('home.chat'), emptyNote(t('home.noMessages')), { action });
    return card(t('home.chat'), el('ul', { class: 'simple-list' }, rooms.map((r) => {
      const at = toDate(r.last.at);
      const unread = pages.chat.isUnread(r);
      const who = r.last.uid === session.user.uid ? t('home.you') : firstName(r.last.name) || '?';
      return el('li', {}, [
        el('button', { class: `room-line ${unread ? 'unread' : ''}`, type: 'button', onclick: () => { pages.chat.openRoom(r.id); location.hash = '#/chat'; } }, [
          el('span', { class: 'room-line-head' }, [
            el('span', { class: 'room-line-name', text: r.name }),
            unread ? el('span', { class: 'unread-dot', 'aria-label': t('home.unread') }) : null,
            at ? el('span', { class: 'muted small', text: daysBetween(todayIso(), todayIso(at)) === 0 ? formatTime(at) : formatDayMonth(todayIso(at)) }) : null,
          ]),
          el('span', { class: 'room-line-text', text: `${who}: ${r.last.text}` }),
        ]),
      ]);
    })), { action });
  }

  function weatherCard() {
    const places = data.state.places;
    if (!places.length) return null;
    const forecasts = pages.weather.forecasts();
    const items = [...places].sort((a, b) => String(a.name).localeCompare(String(b.name))).map((p) => {
      const f = forecasts.get(p.id);
      const info = f?.current ? weatherInfo(f.current.weather_code) : null;
      return el('li', { class: 'weather-mini' }, [
        el('span', { class: 'weather-icon', text: info ? info.icon : '·', 'aria-hidden': 'true' }),
        el('span', { class: 'weather-mini-temp', text: f?.current ? `${Math.round(f.current.temperature_2m)}°` : '…' }),
        el('span', { class: 'weather-mini-name', text: p.name }),
      ]);
    });
    return card(t('nav.weather'), el('ul', { class: 'weather-strip' }, items), { action: link('#/wetter', t('home.toWeather')) });
  }

  function render() {
    const name = firstName(myName(session));
    root.replaceChildren(
      el('div', { class: 'home-hello' }, [
        el('p', { class: 'home-greeting', text: greeting(name) }),
        el('p', { class: 'muted', text: formatWeekdayDay(todayIso()) }),
      ]),
      ...[digestCard(), nextDaysCard(), birthdaysCard(), tasksCard(), pollsCard(), chatCard(), weatherCard()].filter(Boolean),
    );
  }

  const stopData = data.subscribe(() => { if (visible) render(); });
  const stopWeather = pages.weather.subscribe(() => { if (visible) render(); });

  return {
    onShow() { visible = true; render(); pages.weather.ensureFresh(); },
    onHide() { visible = false; },
    stop() { stopData(); stopWeather(); root.replaceChildren(); },
  };
}

