// Family chat: rooms (the main room "Familie" plus rooms for everyone or for
// chosen people), live updates, older messages in pages of 50, replies,
// reactions, and "new" markers per room.
//
// How loading works: one live listener watches the newest N messages of the
// open room (N starts at 50). Scrolling to the top raises N by 50 and
// restarts the listener, so every message on screen stays live.
import {
  db, collection, doc, query, orderBy, limit, onSnapshot, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  writeBatch, serverTimestamp, arrayUnion, arrayRemove,
} from './firebase.js';
import { $, el, avatar, svgIcon, TRASH_ICON, toast, formatTime, formatDateTime, dayKey, dayLabel } from './ui.js';
import { t, lang } from './i18n.js';
import { MAIN_ROOM, canEdit, createdFields, toDate } from './family-data.js';
import { paint } from './colors.js';
import { isSimpleMode } from './simple.js';
import { openForm, openDialog } from './dialog.js';

export const ROOM_ID = MAIN_ROOM;
const ROOM_NAME = 'Familie';
const PAGE_SIZE = 50;
export const MAX_LENGTH = 2000;
const COUNTER_FROM = 1800;
const GROUP_GAP_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 150;
const ROOM_KEY = 'familyhub-room';
const SEEN_KEY = 'familyhub-seen';
const MORE_ICON = ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'];
const REPLY_ICON = ['m9 14-5-5 5-5', 'M4 9h10a6 6 0 0 1 6 6v4'];
const TRANSLATE_ICON = ['M4 5h8', 'M8 3v2', 'M5.5 9a7 7 0 0 0 5.5 4', 'M11 5c0 4-3 7-7 8', 'm12 21 4-9 4 9', 'M13.5 18h5'];
const TRANSLATION_LANGS = ['de', 'en', 'fr'];

export const REACTIONS = [
  ['like', '👍'], ['love', '❤️'], ['laugh', '😂'], ['wow', '😮'], ['sad', '😢'], ['thanks', '🙏'],
];

/** Where a room is stored: family rooms at rooms/{id}, a household's room at households/{id}/rooms/main. */
export const roomPath = (id) => (id.startsWith('h:') ? `households/${id.slice(2)}/rooms/main` : `rooms/${id}`);

// ---------- "new" markers: when each room was last looked at (this device only) ----------

function loadSeen() {
  try {
    const saved = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null');
    if (saved && typeof saved === 'object') return saved;
  } catch { /* storage blocked */ }
  // First start on this device: everything before now counts as seen.
  return { _since: Date.now() };
}

export function createChat(session, data) {
  const scrollBox = $('chat-scroll');
  const list = $('chat-messages');
  const topLine = $('chat-top');
  const empty = $('chat-empty');
  const pill = $('chat-new-pill');
  const form = $('chat-form');
  const input = $('chat-input');
  const sendBtn = $('chat-send');
  const counter = $('chat-counter');
  const notice = $('chat-notice');
  const roomList = $('room-list');
  const replyBar = $('reply-bar');
  const coarsePointer = matchMedia('(pointer: coarse)').matches;
  const uid = session.user.uid;

  let roomId = MAIN_ROOM;
  // Simple mode has no room bar: it always shows the main room.
  try { roomId = isSimpleMode() ? MAIN_ROOM : localStorage.getItem(ROOM_KEY) || MAIN_ROOM; } catch { /* storage blocked */ }
  let messagesRef = collection(db, roomPath(roomId), 'messages');
  const messages = new Map(); // id -> message
  const nodeCache = new Map(); // id -> { key, node }
  const seen = loadSeen();

  let windowSize = PAGE_SIZE;
  let unsubscribe = null;
  let hasMore = false;
  let loadingOlder = false;
  let waitingForServer = true;
  let firstRenderDone = false;
  let newestId = null;
  let stickToBottom = true;
  let roomReady = false;
  let stopped = false;
  let visible = false;
  let activeId = null; // message whose actions are open
  // Translations shown here: message id → { status: 'pending' | 'done' | 'error', text, from, reason }
  const translations = new Map();
  const translationStops = new Map();
  let reply = null; // { id, name, text }

  // ---------- rooms ----------

  const currentRoom = () => data.state.rooms.find((r) => r.id === roomId) || null;
  const lastMs = (room) => toDate(room?.last?.at)?.getTime() || 0;

  function isUnread(room) {
    if (!room || !room.last || room.last.uid === uid) return false;
    return lastMs(room) > (seen[room.id] || seen._since || 0);
  }

  function markSeen() {
    const room = currentRoom();
    if (!visible || !room) return;
    const ms = Math.max(lastMs(room), Date.now());
    if ((seen[room.id] || 0) >= ms) return;
    seen[room.id] = ms;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* storage blocked */ }
    renderRooms();
  }

  function renderRooms() {
    const rooms = data.state.rooms;
    roomList.replaceChildren(...rooms.map((r) => el('button', {
      class: `room-chip ${isUnread(r) ? 'unread' : ''}`.trim(), type: 'button',
      'aria-pressed': r.id === roomId ? 'true' : 'false',
      onclick: () => openRoom(r.id),
    }, [
      r.household ? el('span', { class: 'room-lock', 'aria-label': t('rooms.householdRoom'), text: '🏠' }) : null,
      r.open === false ? el('span', { class: 'room-lock', 'aria-label': t('rooms.closedRoom'), text: '🔒' }) : null,
      el('span', { text: r.id === MAIN_ROOM ? t('rooms.main') : r.name }),
    ])));
    const anyUnread = rooms.some((r) => isUnread(r) && !(visible && r.id === roomId));
    for (const dot of document.querySelectorAll('.chat-dot')) dot.hidden = !anyUnread;
    roomList.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function openRoom(id) {
    if (id === roomId && unsubscribe) { markSeen(); return; }
    roomId = id;
    try { localStorage.setItem(ROOM_KEY, id); } catch { /* storage blocked */ }
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    messagesRef = collection(db, roomPath(roomId), 'messages');
    messages.clear();
    nodeCache.clear();
    stopTranslations();
    list.replaceChildren();
    windowSize = PAGE_SIZE;
    hasMore = false;
    loadingOlder = false;
    firstRenderDone = false;
    newestId = null;
    stickToBottom = true;
    activeId = null;
    setReply(null);
    pill.hidden = true;
    topLine.textContent = '';
    empty.hidden = true;
    roomReady = false;
    updateComposer();
    subscribe();
    ensureRoom();
    renderRooms();
    markSeen();
  }

  // When the rooms change: leave a room that was deleted or that this person is no longer in.
  let roomsKnown = false;
  function onRoomsChanged() {
    if (!data.state.loaded.rooms) return;
    const wasKnown = roomsKnown;
    roomsKnown = true;
    if (roomId !== MAIN_ROOM && !currentRoom()) {
      // A room saved on this device from earlier is simply not opened again;
      // a room that disappears while the app is open gets a short note.
      if (wasKnown) toast(t('rooms.gone'));
      openRoom(MAIN_ROOM);
      return;
    }
    if (!roomReady && currentRoom()) ensureRoom();
    renderRooms();
    markSeen();
    // Names (nicknames) and colors may have changed: redraw (unchanged messages are reused).
    render();
  }

  // ---------- data ----------

  function timeOf(snap) {
    const ts = snap.get('createdAt', { serverTimestamps: 'estimate' });
    return ts ? ts.toMillis() : Date.now();
  }

  function toMessage(snap) {
    const d = snap.data({ serverTimestamps: 'estimate' });
    const r = d.replyTo && typeof d.replyTo === 'object' ? d.replyTo : null;
    return {
      id: snap.id,
      uid: d.uid,
      name: typeof d.name === 'string' ? d.name : '',
      photo: typeof d.photo === 'string' ? d.photo : '',
      text: typeof d.text === 'string' ? d.text : '',
      replyTo: r && typeof r.id === 'string' ? { id: r.id, name: String(r.name || ''), text: String(r.text || '') } : null,
      reactions: d.reactions && typeof d.reactions === 'object' ? d.reactions : {},
      ms: timeOf(snap),
      pending: snap.metadata.hasPendingWrites,
    };
  }

  function subscribe() {
    if (unsubscribe) unsubscribe();
    waitingForServer = true;
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(windowSize));
    const thisRoom = roomId;
    unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snap) => { if (thisRoom === roomId) onData(snap); }, onError);
  }

  function onData(snap) {
    const docs = snap.docs;
    const full = docs.length >= windowSize;
    const oldestInWindow = docs.length ? timeOf(docs[docs.length - 1]) : null;
    const fromServer = !snap.metadata.fromCache;

    // First answer from the server after (re)starting the listener:
    // forget messages that were deleted while nobody was listening.
    if (waitingForServer && fromServer) {
      const ids = new Set(docs.map((d) => d.id));
      for (const [id, m] of messages) {
        if (ids.has(id)) continue;
        if (!full || (oldestInWindow !== null && m.ms >= oldestInWindow)) messages.delete(id);
      }
      waitingForServer = false;
      loadingOlder = false;
    }

    for (const change of snap.docChanges({ includeMetadataChanges: true })) {
      if (change.type === 'removed') {
        // A message that only slid out of the window (because a newer one
        // arrived) stays on screen. A deleted one goes away.
        const slidOut = full && oldestInWindow !== null && timeOf(change.doc) <= oldestInWindow;
        if (!slidOut) messages.delete(change.doc.id);
      } else {
        messages.set(change.doc.id, toMessage(change.doc));
      }
    }

    hasMore = full;
    render();
    markSeen();
  }

  function onError(err) {
    console.warn('Chat listener error', err.code);
    // Losing access to the whole app is handled by app.js ("Kein Zugang").
    if (err.code !== 'permission-denied') toast(t('chat.unavailable'));
  }

  function loadOlder() {
    if (!hasMore || loadingOlder || stopped) return;
    loadingOlder = true;
    topLine.textContent = t('chat.loadingOlder');
    windowSize = messages.size + PAGE_SIZE;
    subscribe();
  }

  // ---------- drawing ----------

  function isNearBottom() {
    return scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight < NEAR_BOTTOM_PX;
  }

  function scrollToBottom() {
    scrollBox.scrollTop = scrollBox.scrollHeight;
    pill.hidden = true;
  }

  // Remembers which message is at the top of the screen, so the view does
  // not jump when older messages are added above it.
  function captureAnchor() {
    const boxTop = scrollBox.getBoundingClientRect().top;
    for (const node of list.children) {
      if (!node.dataset.id) continue;
      const rect = node.getBoundingClientRect();
      if (rect.bottom > boxTop) return { id: node.dataset.id, offset: rect.top - boxTop };
    }
    return null;
  }

  function restoreAnchor(anchor) {
    const cached = anchor && nodeCache.get(anchor.id);
    if (!cached || !cached.node.isConnected) return;
    const boxTop = scrollBox.getBoundingClientRect().top;
    scrollBox.scrollTop += (cached.node.getBoundingClientRect().top - boxTop) - anchor.offset;
  }

  function canDelete(m) {
    return m.uid === uid || session.isAdmin;
  }

  function scrollToMessage(id) {
    const cached = nodeCache.get(id);
    if (!cached || !cached.node.isConnected) { toast(t('chat.originalNotLoaded')); return; }
    cached.node.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    cached.node.classList.add('flash');
    setTimeout(() => cached.node.classList.remove('flash'), 1400);
  }

  function reactionRow(m) {
    const pills = [];
    for (const [key, emoji] of REACTIONS) {
      const who = Array.isArray(m.reactions[key]) ? m.reactions[key] : [];
      if (!who.length) continue;
      const mine = who.includes(uid);
      const names = who.map((x) => (x === uid ? t('home.you') : data.shortNameForUid(x) || '?')).join(', ');
      pills.push(el('button', {
        class: `reaction ${mine ? 'mine' : ''}`.trim(), type: 'button', 'aria-pressed': mine ? 'true' : 'false',
        title: names, 'aria-label': `${emoji} ${who.length}: ${names}`,
        onclick: () => toggleReaction(m, key),
      }, [el('span', { text: emoji, 'aria-hidden': 'true' }), el('span', { text: String(who.length), 'aria-hidden': 'true' })]));
    }
    return pills.length ? el('div', { class: 'reactions' }, pills) : null;
  }

  // ---------- translations (Claude) ----------

  // Where the message lives, as the translations rules expect it.
  function messagePlace(messageId, language = lang) {
    const room = currentRoom();
    const household = room?.household || (roomId.startsWith('h:') ? roomId.slice(2) : '');
    const room2 = household ? 'main' : roomId;
    return { id: `t_${household}_${room2}_${messageId}_${language}`, household, roomId: room2 };
  }

  function stopTranslations() {
    for (const stop of translationStops.values()) stop();
    translationStops.clear();
    translations.clear();
  }

  function hideTranslation(m) {
    translationStops.get(m.id)?.();
    translationStops.delete(m.id);
    translations.delete(m.id);
    render();
  }

  function translate(m) {
    if (data.state.translateSwitch?.enabled === false) { toast(t('chat.translateOff')); return; }
    if (translationStops.has(m.id)) return;
    const place = messagePlace(m.id);
    translations.set(m.id, { status: 'pending' });
    render();
    let asked = false;
    const stop = onSnapshot(doc(db, 'translations', place.id), (snap) => {
      if (!snap.exists()) {
        if (asked) return;
        asked = true;
        // Ask for it; the translateMessage function answers in the same document.
        setDoc(doc(db, 'translations', place.id), {
          household: place.household, roomId: place.roomId, messageId: m.id, lang, uid, createdAt: serverTimestamp(), status: 'pending',
        }).catch((err) => {
          console.warn('Asking for a translation failed', err.code);
          translations.set(m.id, { status: 'error', reason: 'failed' });
          render();
        });
        return;
      }
      const d = snap.data();
      if (d.status === 'done') translations.set(m.id, { status: 'done', text: String(d.text || ''), from: d.from || 'other' });
      else if (d.status === 'error') translations.set(m.id, { status: 'error', reason: d.reason || 'failed' });
      else translations.set(m.id, { status: 'pending' });
      render();
    }, (err) => {
      console.warn('Reading the translation failed', err.code);
      translations.set(m.id, { status: 'error', reason: 'failed' });
      render();
    });
    translationStops.set(m.id, stop);
  }

  // A failed attempt is removed (the rules allow that) and asked again.
  async function retryTranslation(m) {
    const place = messagePlace(m.id);
    hideTranslation(m);
    try { await deleteDoc(doc(db, 'translations', place.id)); } catch (err) { console.warn('Removing a failed translation failed', err.code); }
    translate(m);
  }

  function translationBlock(m) {
    const tr = translations.get(m.id);
    if (!tr) return null;
    if (tr.status === 'pending') return el('p', { class: 'translation pending', text: t('chat.translating') });
    if (tr.status === 'error') {
      const key = { limit: 'chat.translateLimit', off: 'chat.translateOff', missing: 'chat.translateMissing' }[tr.reason] || 'chat.translateFailed';
      return el('div', { class: 'translation error' }, [
        el('span', { text: t(key) }),
        tr.reason === 'limit' || tr.reason === 'off' ? null : el('button', { class: 'btn-link', type: 'button', text: t('chat.retry'), onclick: () => retryTranslation(m) }),
      ]);
    }
    const same = tr.from === lang;
    return el('div', { class: 'translation' }, [
      same ? null : el('p', { class: 'translation-text', text: tr.text }),
      el('p', { class: 'translation-note' }, [
        el('span', { text: same ? t('chat.alreadyYourLanguage') : t(`chat.from.${['de', 'en', 'fr'].includes(tr.from) ? tr.from : 'other'}`) }),
        el('button', { class: 'btn-link', type: 'button', text: t('chat.hideTranslation'), onclick: () => hideTranslation(m) }),
      ]),
    ]);
  }

  function actionRow(m) {
    const buttons = REACTIONS.map(([key, emoji]) => el('button', {
      class: 'react-btn', type: 'button', 'aria-label': t(`chat.react.${key}`), title: t(`chat.react.${key}`),
      onclick: () => { activeId = null; toggleReaction(m, key); render(); },
    }, [el('span', { text: emoji, 'aria-hidden': 'true' })]));
    buttons.push(el('button', {
      class: 'act-btn', type: 'button', onclick: () => { activeId = null; setReply(m); render(); },
    }, [svgIcon(REPLY_ICON), el('span', { text: t('chat.reply') })]));
    if (m.uid !== uid && data.state.translateSwitch?.enabled !== false) {
      const shown = translations.has(m.id);
      buttons.push(el('button', {
        class: 'act-btn', type: 'button',
        onclick: () => { activeId = null; if (shown) hideTranslation(m); else { translate(m); render(); } },
      }, [svgIcon(TRANSLATE_ICON), el('span', { text: shown ? t('chat.hideTranslation') : t('chat.translate') })]));
    }
    if (canDelete(m)) {
      buttons.push(el('button', {
        class: 'act-btn danger', type: 'button', onclick: () => { activeId = null; render(); removeMessage(m); },
      }, [svgIcon(TRASH_ICON), el('span', { text: t('chat.delete') })]));
    }
    return el('div', { class: 'msg-actions' }, buttons);
  }

  function messageNode(m, continued) {
    const own = m.uid === uid;
    const active = activeId === m.id;
    // The name this person sees (their own nickname for the sender, if any) and the sender's color.
    const shown = data.nameForUid(m.uid, m.name) || t('chat.unknownSender');
    const color = data.colorForUid(m.uid);
    const quoteName = m.replyTo ? data.nameForGoogleName(m.replyTo.name) : '';
    const key = [m.text, shown, color, quoteName, m.photo, m.pending, continued, canDelete(m), active, JSON.stringify(m.reactions), m.replyTo?.id, Math.floor(m.ms / 60000), JSON.stringify(translations.get(m.id) || null)].join('|');
    const cached = nodeCache.get(m.id);
    if (cached && cached.key === key) return cached.node;

    const date = new Date(m.ms);
    const meta = el('div', { class: 'msg-meta' }, [
      m.pending
        ? el('span', { text: t('chat.sending') })
        : el('time', { datetime: date.toISOString(), title: formatDateTime(date), text: formatTime(date) }),
    ]);
    if (!m.pending) {
      meta.append(el('button', {
        class: 'msg-more', type: 'button', 'aria-label': t('chat.actions'), title: t('chat.actions'), 'aria-expanded': active ? 'true' : 'false',
        onclick: () => { activeId = active ? null : m.id; render(); },
      }, [svgIcon(MORE_ICON)]));
    }

    const quote = m.replyTo ? el('button', { class: 'reply-quote', type: 'button', onclick: () => scrollToMessage(m.replyTo.id) }, [
      el('span', { class: 'reply-quote-name', text: quoteName || t('chat.unknownSender') }),
      el('span', { class: 'reply-quote-text', text: m.replyTo.text }),
    ]) : null;

    const bubble = el('div', { class: 'bubble' }, [
      paint(el('div', { class: 'msg-name', text: shown }), color),
      quote,
      el('div', { class: 'msg-text', text: m.text }),
      translationBlock(m),
      meta,
    ]);

    const classes = ['msg'];
    if (own) classes.push('own');
    if (continued) classes.push('cont');
    if (m.pending) classes.push('pending');
    const column = el('div', { class: 'msg-col' }, [bubble, reactionRow(m), active ? actionRow(m) : null]);
    const node = el('div', { class: classes.join(' '), 'data-id': m.id }, own ? [column] : [avatar(shown, m.photo, false, color), column]);
    nodeCache.set(m.id, { key, node });
    return node;
  }

  function render() {
    if (stopped) return;
    const wasNearBottom = isNearBottom();
    const anchor = wasNearBottom ? null : captureAnchor();

    const sorted = [...messages.values()].sort((a, b) => a.ms - b.ms || (a.id < b.id ? -1 : 1));
    const children = [];
    let prev = null;
    for (const m of sorted) {
      const date = new Date(m.ms);
      const newDay = !prev || dayKey(new Date(prev.ms)) !== dayKey(date);
      if (newDay) children.push(el('div', { class: 'day' }, [el('span', { text: dayLabel(date) })]));
      const continued = !newDay && prev.uid === m.uid && m.ms - prev.ms < GROUP_GAP_MS;
      children.push(messageNode(m, continued));
      prev = m;
    }
    list.replaceChildren(...children);
    for (const id of nodeCache.keys()) if (!messages.has(id)) nodeCache.delete(id);

    empty.hidden = sorted.length > 0 || waitingForServer;
    if (loadingOlder) topLine.textContent = t('chat.loadingOlder');
    else if (hasMore) topLine.textContent = '';
    else topLine.textContent = sorted.length > 0 ? t('chat.start') : '';

    const newest = sorted[sorted.length - 1];
    const newestChanged = newest && newest.id !== newestId;
    newestId = newest ? newest.id : null;

    if (!firstRenderDone) {
      if (!waitingForServer || sorted.length) scrollToBottom();
      firstRenderDone = !waitingForServer;
    } else if (newestChanged && newest.uid === uid) {
      scrollToBottom();
    } else if (wasNearBottom) {
      scrollToBottom();
    } else {
      restoreAnchor(anchor);
      if (newestChanged) pill.hidden = false;
    }

    fillScreen();
  }

  // Screen not full yet but there are older messages: fetch the next page.
  // Only while the chat is visible (a hidden chat has no height).
  function fillScreen() {
    if (hasMore && !loadingOlder && scrollBox.clientHeight > 0
      && scrollBox.scrollHeight <= scrollBox.clientHeight + LOAD_OLDER_PX) loadOlder();
  }

  // ---------- actions ----------

  async function toggleReaction(m, key) {
    const mine = Array.isArray(m.reactions[key]) && m.reactions[key].includes(uid);
    try {
      await updateDoc(doc(messagesRef, m.id), { [`reactions.${key}`]: mine ? arrayRemove(uid) : arrayUnion(uid) });
    } catch (err) {
      console.warn('Reaction failed', err.code);
      toast(t('common.saveFailed'));
    }
  }

  async function removeMessage(m) {
    if (!confirm(t('chat.confirmDelete'))) return;
    try {
      // Translations of the message go with it (the rules allow that once the message is gone).
      const ids = TRANSLATION_LANGS.map((language) => messagePlace(m.id, language).id);
      const found = await Promise.all(ids.map((id) => getDoc(doc(db, 'translations', id)).then((snap) => (snap.exists() ? id : null)).catch(() => null)));
      const batch = writeBatch(db);
      batch.delete(doc(messagesRef, m.id));
      for (const id of found.filter(Boolean)) batch.delete(doc(db, 'translations', id));
      await batch.commit();
      hideTranslation(m);
    } catch (err) {
      console.warn('Delete failed', err.code);
      toast(t('chat.deleteFailed'));
    }
  }

  function setReply(m) {
    reply = m ? { id: m.id, name: (m.name || '').slice(0, 100), text: m.text.replace(/\s+/g, ' ').trim().slice(0, 140) } : null;
    replyBar.hidden = !reply;
    $('reply-name').textContent = reply ? t('chat.replyTo', { name: (m && data.nameForUid(m.uid, reply.name)) || t('chat.unknownSender') }) : '';
    $('reply-snippet').textContent = reply ? reply.text : '';
    if (reply && !coarsePointer) input.focus({ preventScroll: true });
  }

  function updateComposer() {
    const length = input.value.length;
    const ok = roomReady && input.value.trim().length > 0 && length <= MAX_LENGTH;
    sendBtn.disabled = !ok;
    counter.hidden = length < COUNTER_FROM;
    counter.textContent = t('chat.counter', { n: length, max: MAX_LENGTH });
    counter.classList.toggle('over', length > MAX_LENGTH);
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 2, 160)}px`;
  }

  async function send() {
    const text = input.value.trim();
    if (!roomReady || !text || text.length > MAX_LENGTH) return;
    const replyTo = reply;
    input.value = '';
    setReply(null);
    updateComposer();
    stickToBottom = true;
    const name = typeof session.claims.name === 'string' ? session.claims.name : '';
    const message = {
      uid,
      // Must match what Google put into the sign in token (checked by the rules).
      name,
      photo: typeof session.claims.picture === 'string' ? session.claims.picture : '',
      text,
      createdAt: serverTimestamp(),
    };
    if (replyTo) message.replyTo = replyTo;
    // The message and the room preview (newest message) are written together.
    const batch = writeBatch(db);
    batch.set(doc(messagesRef), message);
    batch.update(doc(db, roomPath(roomId)), {
      last: { uid, name, text: text.replace(/\s+/g, ' ').slice(0, 120), at: serverTimestamp() },
    });
    try {
      await batch.commit();
    } catch (err) {
      console.warn('Send failed', err.code);
      toast(t('chat.sendFailed'));
      if (!input.value) { input.value = text; updateComposer(); }
      if (replyTo && !reply) setReply({ id: replyTo.id, name: replyTo.name, text: replyTo.text });
    }
  }

  async function ensureRoom() {
    if (roomId !== MAIN_ROOM) {
      roomReady = !!currentRoom();
      notice.hidden = true;
      updateComposer();
      return;
    }
    const roomRef = doc(db, 'rooms', MAIN_ROOM);
    try {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        if (!session.isAdmin) {
          notice.textContent = t('chat.notReady');
          notice.hidden = false;
          return;
        }
        await setDoc(roomRef, { name: ROOM_NAME, createdAt: serverTimestamp() });
      }
      notice.hidden = true;
      if (roomId === MAIN_ROOM) roomReady = true;
      updateComposer();
    } catch (err) {
      console.warn('Room check failed', err.code);
    }
  }

  // ---------- creating and changing rooms ----------

  function roomFields(room = {}) {
    const me = session.mail;
    const people = data.family().map((p) => ({ value: p.mail, label: p.mail === me ? `${p.name} (${t('home.you')})` : p.name, locked: p.mail === me }));
    return [
      { name: 'name', type: 'text', label: t('rooms.name'), value: room.name || '', maxlength: 40, required: true },
      { name: 'who', type: 'segmented', label: t('rooms.who'), value: room.open === false ? 'some' : 'all', options: [
        { value: 'all', label: t('rooms.forAll') }, { value: 'some', label: t('rooms.forSome') },
      ] },
      { name: 'members', type: 'people', label: t('rooms.members'), value: room.members || [me], options: people, showIf: (v) => v.who === 'some' },
      { name: 'hint', type: 'info', text: t('rooms.privacyHint') },
    ];
  }

  function roomData(v) {
    const open = v.who !== 'some';
    const members = open ? [] : [...new Set([session.mail, ...v.members])];
    return { name: v.name.trim(), open, members };
  }

  function openNewRoom() {
    openForm({
      title: t('rooms.new'),
      fields: roomFields(),
      submitLabel: t('rooms.create'),
      onSubmit: async (v) => {
        try {
          const ref = await addDoc(collection(db, 'rooms'), { ...roomData(v), ...createdFields(session) });
          toast(t('rooms.created'));
          setTimeout(() => openRoom(ref.id), 0);
          return undefined;
        } catch (err) {
          console.warn('Creating the room failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  function openRoomInfo() {
    const room = currentRoom();
    if (!room) return;
    const content = [];
    if (room.id === MAIN_ROOM) {
      content.push(el('p', { text: t('rooms.mainInfo') }));
    } else if (room.household) {
      const h = data.state.households.find((x) => x.id === room.household);
      content.push(el('p', { text: t('rooms.householdInfo', { names: (h?.members || []).map((x) => data.nameForMail(x)).join(', ') }) }));
    } else {
      content.push(el('p', { text: room.open ? t('rooms.forAllInfo') : t('rooms.forSomeInfo', { names: (room.members || []).map((m) => data.nameForMail(m)).join(', ') }) }));
      content.push(el('p', { class: 'muted small', text: t('rooms.createdBy', { name: room.createdByName || '?' }) }));
    }
    const buttons = [];
    if (room.id !== MAIN_ROOM && !room.household && room.createdBy === uid) {
      buttons.push({ label: t('common.edit'), onClick: (close) => { close(); openEditRoom(room); } });
    }
    if (room.id !== MAIN_ROOM && !room.household && canEdit(session, room)) {
      buttons.push({ label: t('rooms.delete'), kind: 'danger', onClick: async (close) => { if (await removeRoom(room)) close(); } });
    }
    openDialog({ title: room.id === MAIN_ROOM ? t('rooms.main') : room.name, content, buttons });
  }

  function openEditRoom(room) {
    openForm({
      title: t('rooms.edit'),
      fields: roomFields(room),
      onSubmit: async (v) => {
        try {
          await updateDoc(doc(db, 'rooms', room.id), roomData(v));
          toast(t('common.saved'));
          return undefined;
        } catch (err) {
          console.warn('Changing the room failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  async function removeRoom(room) {
    if (!confirm(t('rooms.confirmDelete', { name: room.name }))) return false;
    try {
      await deleteDoc(doc(db, 'rooms', room.id));
      toast(t('rooms.deleted'));
      openRoom(MAIN_ROOM);
      return true;
    } catch (err) {
      console.warn('Deleting the room failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  // ---------- events ----------

  const onScroll = () => {
    stickToBottom = isNearBottom();
    if (stickToBottom) pill.hidden = true;
    if (scrollBox.scrollTop < LOAD_OLDER_PX) loadOlder();
  };
  const onSubmit = (event) => { event.preventDefault(); send(); };
  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !coarsePointer) {
      event.preventDefault();
      send();
    }
    if (event.key === 'Escape' && reply) setReply(null);
  };
  const onPill = () => scrollToBottom();
  const onCancelReply = () => setReply(null);

  scrollBox.addEventListener('scroll', onScroll, { passive: true });
  form.addEventListener('submit', onSubmit);
  input.addEventListener('input', updateComposer);
  input.addEventListener('keydown', onKeyDown);
  pill.addEventListener('click', onPill);
  $('reply-cancel').addEventListener('click', onCancelReply);
  $('room-add').onclick = openNewRoom;
  $('room-settings').onclick = openRoomInfo;

  topLine.textContent = '';
  empty.hidden = true;
  updateComposer();
  subscribe();
  ensureRoom();
  const stopRooms = data.subscribe(onRoomsChanged);

  return {
    // Called when the chat tab becomes visible again.
    onShow() {
      visible = true;
      if (stickToBottom) scrollToBottom();
      fillScreen();
      markSeen();
      renderRooms();
      if (!coarsePointer) input.focus({ preventScroll: true });
    },
    onHide() { visible = false; renderRooms(); },
    openRoom,
    isUnread,
    // Called when admin rights change (delete buttons on other people's messages).
    onRoleChange() {
      if (!roomReady) ensureRoom();
      nodeCache.clear();
      render();
    },
    stop() {
      stopped = true;
      stopRooms();
      if (unsubscribe) unsubscribe();
      scrollBox.removeEventListener('scroll', onScroll);
      form.removeEventListener('submit', onSubmit);
      input.removeEventListener('input', updateComposer);
      input.removeEventListener('keydown', onKeyDown);
      pill.removeEventListener('click', onPill);
      $('reply-cancel').removeEventListener('click', onCancelReply);
      list.replaceChildren();
      roomList.replaceChildren();
      topLine.textContent = '';
      notice.hidden = true;
      pill.hidden = true;
      setReply(null);
      input.value = '';
      counter.hidden = true;
      for (const dot of document.querySelectorAll('.chat-dot')) dot.hidden = true;
      messages.clear();
      nodeCache.clear();
      stopTranslations();
    },
  };
}
