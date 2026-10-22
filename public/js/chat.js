// Family chat: one room ("Familie"), live updates, older messages in pages of 50.
//
// How loading works: one live listener watches the newest N messages
// (N starts at 50). Scrolling to the top raises N by 50 and restarts the
// listener, so every message on screen stays live (deletions included).
import {
  db, collection, doc, query, orderBy, limit, onSnapshot, getDoc, setDoc, addDoc, deleteDoc, serverTimestamp,
} from './firebase.js';
import { $, el, avatar, svgIcon, TRASH_ICON, toast, formatTime, formatDateTime, dayKey, dayLabel } from './ui.js';

export const ROOM_ID = 'familie';
const ROOM_NAME = 'Familie';
const PAGE_SIZE = 50;
export const MAX_LENGTH = 2000;
const COUNTER_FROM = 1800;
const GROUP_GAP_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 150;

export function createChat(session) {
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

  const messagesRef = collection(db, 'rooms', ROOM_ID, 'messages');
  const messages = new Map(); // id -> message
  const nodeCache = new Map(); // id -> { key, node }
  const coarsePointer = matchMedia('(pointer: coarse)').matches;

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

  // ---------- data ----------

  function timeOf(snap) {
    const ts = snap.get('createdAt', { serverTimestamps: 'estimate' });
    return ts ? ts.toMillis() : Date.now();
  }

  function toMessage(snap) {
    const d = snap.data({ serverTimestamps: 'estimate' });
    const ms = timeOf(snap);
    return {
      id: snap.id,
      uid: d.uid,
      name: typeof d.name === 'string' ? d.name : '',
      photo: typeof d.photo === 'string' ? d.photo : '',
      text: typeof d.text === 'string' ? d.text : '',
      ms,
      pending: snap.metadata.hasPendingWrites,
    };
  }

  function subscribe() {
    if (unsubscribe) unsubscribe();
    waitingForServer = true;
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(windowSize));
    unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, onData, onError);
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
  }

  function onError(err) {
    console.warn('Chat listener error', err.code);
    // Losing access is handled by the app (it shows "Kein Zugang").
    if (err.code !== 'permission-denied') toast('Der Chat ist gerade nicht erreichbar.');
  }

  function loadOlder() {
    if (!hasMore || loadingOlder || stopped) return;
    loadingOlder = true;
    topLine.textContent = 'Ältere Nachrichten werden geladen';
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
    return m.uid === session.user.uid || session.isAdmin;
  }

  function messageNode(m, continued) {
    const own = m.uid === session.user.uid;
    const deletable = canDelete(m);
    const key = [m.text, m.name, m.photo, m.pending, continued, deletable, Math.floor(m.ms / 60000)].join('|');
    const cached = nodeCache.get(m.id);
    if (cached && cached.key === key) return cached.node;

    const date = new Date(m.ms);
    const meta = el('div', { class: 'msg-meta' }, [
      m.pending
        ? el('span', { text: 'Wird gesendet' })
        : el('time', { datetime: date.toISOString(), title: formatDateTime(date), text: formatTime(date) }),
    ]);
    if (deletable && !m.pending) {
      const btn = el('button', { class: 'msg-del', type: 'button', 'aria-label': 'Nachricht löschen', title: 'Löschen' }, [svgIcon(TRASH_ICON)]);
      btn.addEventListener('click', () => removeMessage(m));
      meta.append(btn);
    }

    const bubble = el('div', { class: 'bubble' }, [
      el('div', { class: 'msg-name', text: m.name || 'Unbekannt' }),
      el('div', { class: 'msg-text', text: m.text }),
      meta,
    ]);

    const classes = ['msg'];
    if (own) classes.push('own');
    if (continued) classes.push('cont');
    if (m.pending) classes.push('pending');
    const node = el('div', { class: classes.join(' '), 'data-id': m.id }, own ? [bubble] : [avatar(m.name, m.photo), bubble]);
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
    if (loadingOlder) topLine.textContent = 'Ältere Nachrichten werden geladen';
    else if (hasMore) topLine.textContent = '';
    else topLine.textContent = sorted.length > 0 ? 'Anfang des Chats' : '';

    const newest = sorted[sorted.length - 1];
    const newestChanged = newest && newest.id !== newestId;
    newestId = newest ? newest.id : null;

    if (!firstRenderDone) {
      if (!waitingForServer || sorted.length) scrollToBottom();
      firstRenderDone = !waitingForServer;
    } else if (newestChanged && newest.uid === session.user.uid) {
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

  async function removeMessage(m) {
    if (!confirm('Diese Nachricht löschen?')) return;
    try {
      await deleteDoc(doc(messagesRef, m.id));
    } catch (err) {
      console.warn('Delete failed', err.code);
      toast('Löschen hat nicht geklappt.');
    }
  }

  function updateComposer() {
    const length = input.value.length;
    const ok = roomReady && input.value.trim().length > 0 && length <= MAX_LENGTH;
    sendBtn.disabled = !ok;
    counter.hidden = length < COUNTER_FROM;
    counter.textContent = `${length} von ${MAX_LENGTH} Zeichen`;
    counter.classList.toggle('over', length > MAX_LENGTH);
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 2, 160)}px`;
  }

  async function send() {
    const text = input.value.trim();
    if (!roomReady || !text || text.length > MAX_LENGTH) return;
    input.value = '';
    updateComposer();
    stickToBottom = true;
    try {
      await addDoc(messagesRef, {
        uid: session.user.uid,
        // Must match what Google put into the sign in token (checked by the rules).
        name: typeof session.claims.name === 'string' ? session.claims.name : '',
        photo: typeof session.claims.picture === 'string' ? session.claims.picture : '',
        text,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Send failed', err.code);
      toast('Senden hat nicht geklappt. Bitte erneut versuchen.');
      if (!input.value) { input.value = text; updateComposer(); }
    }
  }

  async function ensureRoom() {
    const roomRef = doc(db, 'rooms', ROOM_ID);
    try {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        if (!session.isAdmin) {
          notice.textContent = 'Der Chat wird eingerichtet, sobald ein Admin FamilyHub öffnet.';
          notice.hidden = false;
          return;
        }
        await setDoc(roomRef, { name: ROOM_NAME, createdAt: serverTimestamp() });
      }
      notice.hidden = true;
      roomReady = true;
      updateComposer();
    } catch (err) {
      console.warn('Room check failed', err.code);
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
  };
  const onPill = () => scrollToBottom();

  scrollBox.addEventListener('scroll', onScroll, { passive: true });
  form.addEventListener('submit', onSubmit);
  input.addEventListener('input', updateComposer);
  input.addEventListener('keydown', onKeyDown);
  pill.addEventListener('click', onPill);

  topLine.textContent = '';
  empty.hidden = true;
  updateComposer();
  subscribe();
  ensureRoom();

  return {
    // Called when the chat tab becomes visible again.
    onShow() {
      if (stickToBottom) scrollToBottom();
      fillScreen();
      if (!coarsePointer) input.focus({ preventScroll: true });
    },
    // Called when admin rights change (delete buttons on other people's messages).
    onRoleChange() {
      if (!roomReady) ensureRoom();
      render();
    },
    stop() {
      stopped = true;
      if (unsubscribe) unsubscribe();
      scrollBox.removeEventListener('scroll', onScroll);
      form.removeEventListener('submit', onSubmit);
      input.removeEventListener('input', updateComposer);
      input.removeEventListener('keydown', onKeyDown);
      pill.removeEventListener('click', onPill);
      list.replaceChildren();
      topLine.textContent = '';
      notice.hidden = true;
      pill.hidden = true;
      input.value = '';
      counter.hidden = true;
      messages.clear();
      nodeCache.clear();
    },
  };
}
