// Start page: notices, the weekly overview, the next days, birthdays, trips,
// tasks, the question of the day, polls that wait for a vote, the newest chat
// messages and the weather. In simple mode: big text, today and tomorrow,
// big call buttons, the newest messages.
import { $, el, card, emptyNote, formatWeekdayDay, formatDayMonth, formatTime, relativeDays } from './ui.js';
import { t, lang } from './i18n.js';
import { todayIso, addDays, daysBetween, upcoming } from './dates.js';
import { firstName, myName, toDate } from './family-data.js';
import { entryButton, entryColor } from './calendar.js';
import { paint } from './colors.js';
import { taskItem, sortOpenTasks } from './tasks.js';
import { myVote, voteCount } from './polls.js';
import { weatherInfo } from './weather.js';
import { db, collection, query, where, onSnapshot } from './firebase.js';
import { activeNotices, noticeNode } from './board.js';
import { tripStatus, tripRange } from './trips.js';
import { questionFor } from './questions.js';
import { telHref } from './contacts.js';
import { isSimpleMode, setSimpleMode } from './simple.js';
import { featureOn, homeCards } from './design.js';

const NEXT_DAYS = 7;
const BIRTHDAY_DAYS = 30;

function greeting(name) {
  const hour = new Date().getHours();
  const key = hour < 11 ? 'home.morning' : hour < 18 ? 'home.day' : 'home.evening';
  return name ? t(`${key}Name`, { name }) : t(key);
}

const link = (href, text) => el('a', { class: 'btn-link', href, text });

// The group page each start card belongs to (the overview is always there).
const CARD_FEATURE = {
  notices: 'board', days: 'calendar', birthdays: 'calendar', trips: 'trips', tasks: 'tasks',
  question: 'question', polls: 'polls', chat: 'chat', weather: 'weather',
};

export function createHome(data, pages) {
  const root = $('home-content');
  const session = data.session;
  let visible = false;
  const on = (card) => !CARD_FEATURE[card] || featureOn(session.group, CARD_FEATURE[card]);

  function hello(name) {
    const welcome = session.group?.design?.welcome;
    return el('div', { class: 'home-hello' }, [
      el('p', { class: 'home-greeting', text: greeting(name) }),
      welcome ? el('p', { class: 'home-welcome', text: welcome }) : null,
      el('p', { class: 'muted', text: formatWeekdayDay(todayIso()) }),
    ]);
  }

  // The family's overview, and one for each household this person is in.
  function digestCards() {
    const sw = data.state.digestSwitch;
    if (sw && sw.enabled === false) return [];
    const cards = [digestCard(data.state.digest, t('home.digestTitle'))];
    for (const h of data.myHouseholds()) {
      const d = data.state.householdDigests[h.id];
      if (d) cards.push(digestCard(d, t('home.digestHousehold', { name: h.name })));
    }
    return cards;
  }

  function digestCard(d, title) {
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
    return card(title, [body, el('p', { class: 'muted small', text: note })], { className: 'card-digest' });
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
        el('ul', { class: 'entry-list' }, g.items.map((item) => el('li', {}, [
          entryButton(data, item, item.day, () => { location.hash = '#/kalender'; pages.calendar.showDay(item.day); }),
        ]))),
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
      paint(el('span', { class: 'simple-main colored-line', text: `🎂 ${item.event.title}` }), entryColor(data, item.event)),
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
      const who = r.last.uid === session.user.uid ? t('home.you') : data.shortNameForUid(r.last.uid, r.last.name) || '?';
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

  function noticesCard() {
    const notices = activeNotices(data.state.notices).slice(0, 5);
    if (!notices.length) return null;
    // Simple mode has no notice board page: the notices are just shown.
    const simple = isSimpleMode();
    return card(t('board.notices'), el('ul', { class: 'notice-list' }, notices.map((n) => noticeNode(data, n, {
      onOpen: simple ? null : (x) => { location.hash = '#/pinnwand'; pages.board.openNotice(x); },
    }))), { action: simple ? null : link('#/pinnwand', t('home.toBoard')), className: 'card-notices' });
  }

  function tripsCard() {
    const today = todayIso();
    const soon = addDays(today, 60);
    const trips = data.state.trips.filter((x) => x.end >= today && x.start <= soon).sort((a, b) => (a.start < b.start ? -1 : 1)).slice(0, 3);
    if (!trips.length) return null;
    return card(t('home.trips'), el('ul', { class: 'simple-list' }, trips.map((x) => el('li', {}, [
      el('button', { class: 'room-line', type: 'button', onclick: () => { location.hash = '#/reisen'; pages.trips.open(x.path); } }, [
        el('span', { class: 'room-line-name', text: `✈️ ${x.title}` }),
        el('span', { class: 'room-line-text', text: [x.destination, tripRange(x), tripStatus(x)].filter(Boolean).join(' · ') }),
      ]),
    ]))), { action: link('#/reisen', t('home.toTrips')) });
  }

  function questionCard() {
    const answered = !!data.state.myAnswer;
    return card(t('question.title'), [
      el('p', { class: 'question-small', text: questionFor(todayIso(), lang) }),
      el('a', { class: 'btn btn-small', href: '#/frage', text: answered ? t('home.seeAnswers') : t('home.answerNow') }),
    ], { className: 'card-question' });
  }

  // ---------- simple mode ----------

  let quickContacts = [];
  let stopQuick = null;
  function watchQuickContacts() {
    if (stopQuick) return;
    stopQuick = onSnapshot(query(collection(db, 'contacts'), where('quick', '==', true)), (snap) => {
      quickContacts = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (visible) render();
    }, (err) => console.warn('Reading the call buttons failed', err.code));
  }

  function simpleDay(day, title) {
    const items = upcoming([...data.state.events, ...data.state.yearly], day, day);
    return card(title, items.length
      ? el('ul', { class: 'entry-list' }, items.map((item) => el('li', {}, [entryButton(data, item, day, () => { location.hash = '#/start'; })])))
      : emptyNote(t('home.nothingPlanned')));
  }

  function renderSimple(name) {
    watchQuickContacts();
    const calls = quickContacts.map((c) => [c, telHref(c.phone)]).filter(([, href]) => href)
      .map(([c, href]) => el('a', { class: 'call-btn', href }, [el('span', { class: 'call-name', text: c.name }), el('span', { class: 'call-number', text: c.phone })]));
    const rooms = data.state.rooms.filter((r) => r.last && r.last.text).slice(0, 3);
    root.replaceChildren(...[
      hello(name),
      on('notices') ? noticesCard() : null,
      simpleDay(todayIso(), t('day.today')),
      simpleDay(addDays(todayIso(), 1), t('day.tomorrow')),
      card(t('simple.call'), calls.length ? el('div', { class: 'call-grid' }, calls) : emptyNote(t('simple.noCalls'))),
      on('chat') && card(t('home.chat'), [
        rooms.length ? el('ul', { class: 'simple-list' }, rooms.map((r) => el('li', {}, [
          el('span', { class: 'simple-main', text: r.id === 'familie' ? t('rooms.main') : r.name }),
          el('span', { class: 'room-line-text', text: `${r.last.uid === session.user.uid ? t('home.you') : data.shortNameForUid(r.last.uid, r.last.name)}: ${r.last.text}` }),
        ]))) : emptyNote(t('home.noMessages')),
        el('a', { class: 'btn btn-primary big-btn', href: '#/chat', text: t('home.toChat') }),
      ]),
      el('button', { class: 'btn big-btn simple-off', type: 'button', text: t('simple.off'), onclick: () => setSimpleMode(false) }),
    ].filter(Boolean));
  }

  function render() {
    const name = data.myDisplayName() || firstName(myName(session));
    if (isSimpleMode()) { renderSimple(name); return; }
    const build = {
      notices: noticesCard, digest: digestCards, days: nextDaysCard, birthdays: birthdaysCard, trips: tripsCard,
      tasks: tasksCard, question: questionCard, polls: pollsCard, chat: chatCard, weather: weatherCard,
    };
    // The cards the group chose, in its order, for the pages it uses.
    const cards = homeCards(session.group?.design).filter(on).flatMap((c) => build[c]());
    root.replaceChildren(hello(name), ...cards.filter(Boolean));
  }

  const stopData = data.subscribe(() => { if (visible) render(); });
  const stopWeather = pages.weather.subscribe(() => { if (visible) render(); });

  return {
    onShow() { visible = true; render(); if (on('weather')) pages.weather.ensureFresh(); },
    update() { if (visible) render(); },
    onHide() { visible = false; },
    stop() { stopData(); stopWeather(); if (stopQuick) stopQuick(); root.replaceChildren(); },
  };
}

