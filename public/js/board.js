// Notice board (short notices, also on the Start page, optionally until a
// date) and family notebook (how-to pages anyone in the group may improve).
// Both belong to the whole family or to a household. Notebook pages are only
// read when this page is opened.
import {
  db, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp,
} from './firebase.js';
import { $, el, toast, card, emptyNote, addButton, formatDayMonth, formatDateTime } from './ui.js';
import { t, locale } from './i18n.js';
import { todayIso, isIso } from './dates.js';
import { canEdit, createdFields, myName, baseOf, toDate } from './family-data.js';
import { ALL, inGroup, groupChips, groupField, defaultGroup, groupBadge } from './groups.js';
import { openForm, openDialog } from './dialog.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Notices that are still current (no end date, or not past it), newest first. */
export function activeNotices(notices, today = todayIso()) {
  return notices
    .filter((n) => !n.until || n.until >= today)
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
}

/** One notice (also used on the Start page). */
export function noticeNode(data, n, { onOpen } = {}) {
  const meta = [data.nameForUid(n.createdBy, n.createdByName) || '?'];
  if (n.until) meta.push(t('board.until', { date: formatDayMonth(n.until) }));
  return el('li', { class: 'notice' }, [
    el('button', { class: 'notice-main', type: 'button', onclick: () => (onOpen ? onOpen(n) : null) }, [
      el('span', { class: 'notice-text pre', text: n.text }),
      el('span', { class: 'notice-meta' }, [meta.join(' · '), groupBadge(data, n)]),
    ]),
  ]);
}

export function createBoard(data) {
  const root = $('board-content');
  const session = data.session;
  let group = ALL;
  let search = '';
  const notesByGroup = new Map(); // group → notes
  const noteStops = new Map();
  let notesLoaded = false;

  // ---------- notebook pages: read only while the page is used ----------

  function syncNoteListeners() {
    const groups = ['', ...data.myHouseholds().map((h) => h.id)];
    for (const [g, stop] of noteStops) {
      if (!groups.includes(g)) { stop(); noteStops.delete(g); notesByGroup.delete(g); }
    }
    for (const g of groups) {
      if (noteStops.has(g)) continue;
      noteStops.set(g, onSnapshot(collection(db, `${baseOf(g)}notes`), (snap) => {
        notesByGroup.set(g, snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), household: g, path: `${baseOf(g)}notes/${d.id}` })));
        notesLoaded = true;
        render();
      }, (err) => console.warn('Reading notes failed', err.code)));
    }
  }

  // ---------- drawing (search field built once) ----------

  const searchInput = el('input', { class: 'search-input', type: 'search', placeholder: t('board.search'), 'aria-label': t('board.search'), autocomplete: 'off' });
  searchInput.addEventListener('input', () => { search = fold(searchInput.value.trim()); render(); });
  const chipBox = el('div');
  const noticeBox = el('div');
  const noteBox = el('div');
  root.replaceChildren(
    chipBox,
    card(t('board.notices'), [noticeBox], { action: addButton(t('board.addNotice'), () => openNotice(null)) }),
    card(t('board.notebook'), [el('p', { class: 'muted small', text: t('board.notebookHint') }), searchInput, noteBox], { action: addButton(t('board.addNote'), () => openNoteEditor(null)) }),
  );

  function render() {
    chipBox.replaceChildren(groupChips(data, group, (value) => { group = value; render(); }) || '');
    const notices = activeNotices(data.state.notices.filter((n) => inGroup(n, group)));
    const old = data.state.notices.filter((n) => inGroup(n, group) && n.until && n.until < todayIso());
    noticeBox.replaceChildren(
      notices.length
        ? el('ul', { class: 'notice-list' }, notices.map((n) => noticeNode(data, n, { onOpen: openNotice })))
        : emptyNote(data.state.loaded.notices ? t('board.noNotices') : t('common.loading')),
      old.length ? el('p', { class: 'muted small', text: t('board.expired', { n: old.length }) }) : '',
    );

    const notes = [...notesByGroup.values()].flat()
      .filter((n) => inGroup(n, group))
      .filter((n) => !search || fold(`${n.title} ${n.body}`).includes(search))
      .sort((a, b) => String(a.title).localeCompare(String(b.title), locale));
    noteBox.replaceChildren(notes.length
      ? el('ul', { class: 'note-list' }, notes.map((n) => el('li', {}, [
        el('button', { class: 'note-row', type: 'button', onclick: () => openNote(n) }, [
          el('span', { class: 'note-title' }, [n.title, groupBadge(data, n)]),
          el('span', { class: 'note-snippet', text: String(n.body || '').replace(/\s+/g, ' ').slice(0, 120) }),
        ]),
      ])))
      : emptyNote(!notesLoaded ? t('common.loading') : search ? t('board.noMatch') : t('board.noNotes')));
  }

  // ---------- notices ----------

  function openNotice(existing) {
    if (existing && !canEdit(session, existing)) {
      openDialog({
        title: t('board.notice'),
        content: [
          el('p', { class: 'pre', text: existing.text }),
          existing.until ? el('p', { class: 'muted small', text: t('board.until', { date: formatDayMonth(existing.until) }) }) : null,
          el('p', { class: 'muted small', text: t('common.addedBy', { name: data.nameForUid(existing.createdBy, existing.createdByName) || '?' }) }),
        ],
      });
      return;
    }
    const n = existing || {};
    openForm({
      title: existing ? t('board.editNotice') : t('board.newNotice'),
      fields: [
        { name: 'text', type: 'textarea', label: t('board.noticeText'), value: n.text || '', maxlength: 300, rows: 3, required: true, placeholder: t('board.noticeExample') },
        { name: 'until', type: 'date', label: t('board.untilLabel'), value: n.until || '', hint: t('board.untilHint') },
        existing ? null : groupField(data, defaultGroup(data, group)),
      ],
      danger: existing ? { label: t('common.delete'), onClick: () => remove(existing, 'board.confirmNotice') } : null,
      onSubmit: async (v) => {
        const fields = { text: v.text.trim(), until: isIso(v.until) ? v.until : '', updatedAt: serverTimestamp() };
        try {
          if (existing) await updateDoc(doc(db, existing.path), fields);
          else await addDoc(collection(db, `${baseOf(v.household || '')}notices`), { ...fields, ...createdFields(session) });
          toast(t('common.saved'));
          return undefined;
        } catch (err) {
          console.warn('Saving the notice failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  // ---------- notebook ----------

  function openNote(n) {
    const updated = toDate(n.updatedAt);
    openDialog({
      title: n.title,
      content: [
        el('p', { class: 'pre note-body', text: n.body || '' }),
        el('p', { class: 'muted small', text: t('board.lastChange', { name: data.nameForUid(n.updatedBy, n.updatedByName) || '?', time: updated ? formatDateTime(updated) : '' }) }),
      ],
      buttons: [{ label: t('common.edit'), kind: 'primary', onClick: (close) => { close(); openNoteEditor(n); } }],
    });
  }

  function openNoteEditor(existing) {
    const n = existing || {};
    openForm({
      title: existing ? t('board.editNote') : t('board.newNote'),
      intro: existing ? t('board.everyoneEdits') : null,
      fields: [
        { name: 'title', type: 'text', label: t('board.noteTitle'), value: n.title || '', maxlength: 100, required: true, placeholder: t('board.noteExample') },
        { name: 'body', type: 'textarea', label: t('board.noteBody'), value: n.body || '', maxlength: 10000, rows: 10 },
        existing ? null : groupField(data, defaultGroup(data, group)),
      ],
      danger: existing && canEdit(session, existing) ? { label: t('common.delete'), onClick: () => remove(existing, 'board.confirmNote') } : null,
      onSubmit: async (v) => {
        const fields = {
          title: v.title.trim(), body: v.body.trim(),
          updatedAt: serverTimestamp(), updatedBy: session.user.uid, updatedByName: myName(session),
        };
        try {
          if (existing) await updateDoc(doc(db, existing.path), fields);
          else await addDoc(collection(db, `${baseOf(v.household || '')}notes`), { ...fields, ...createdFields(session) });
          toast(t('common.saved'));
          return undefined;
        } catch (err) {
          console.warn('Saving the note failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  async function remove(item, confirmKey) {
    if (!confirm(t(confirmKey))) return false;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, item.path));
      await batch.commit();
      toast(t('common.deleted'));
      return true;
    } catch (err) {
      console.warn('Deleting failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  let visible = false;
  const stop = data.subscribe(() => { if (visible) { syncNoteListeners(); render(); } });
  return {
    onShow() { visible = true; syncNoteListeners(); render(); },
    onHide() { visible = false; },
    openNotice,
    stop() { stop(); for (const s of noteStops.values()) s(); noteStops.clear(); root.replaceChildren(); },
  };
}
