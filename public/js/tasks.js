// Tasks: quick add, who does it and by when, tick off (anyone), and the
// recently done ones. Tasks belong to the whole family or to a household.
import { db, collection, doc, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from './firebase.js';
import { $, el, svgIcon, toast, card, emptyNote, addButton, formatWeekdayShort, relativeDays } from './ui.js';
import { t } from './i18n.js';
import { todayIso, daysBetween, isIso, isoOf } from './dates.js';
import { canEdit, createdFields, myName, toDate, baseOf } from './family-data.js';
import { paint } from './colors.js';
import { ALL, inGroup, groupChips, groupField, defaultGroup, groupBadge } from './groups.js';
import { openForm, openDialog } from './dialog.js';

const CHECK_ICON = ['m5 12 5 5 9-10'];

/** Open tasks: overdue and due ones first (by date), then the rest (newest first). */
export function sortOpenTasks(tasks) {
  const created = (x) => toDate(x.createdAt)?.getTime() || 0;
  return [...tasks].sort((a, b) => {
    if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : created(b) - created(a);
    if (a.due) return -1;
    if (b.due) return 1;
    return created(b) - created(a);
  });
}

const sortDone = (tasks) => [...tasks].sort((a, b) => (toDate(b.doneAt)?.getTime() || 0) - (toDate(a.doneAt)?.getTime() || 0));

export async function setDone(session, task, done) {
  try {
    await updateDoc(doc(db, task.path), done
      ? { done: true, doneAt: serverTimestamp(), doneBy: myName(session), updatedAt: serverTimestamp() }
      : { done: false, doneAt: null, doneBy: '', updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Ticking the task failed', err.code);
    toast(t('common.saveFailed'));
  }
}

/** One task line (also used on the Start page). */
export function taskItem(data, task, { onOpen } = {}) {
  const session = data.session;
  const today = todayIso();
  const meta = [];
  if (task.done) {
    const when = toDate(task.doneAt);
    meta.push(el('span', { text: t('tasks.doneBy', { name: data.nameForGoogleName(task.doneBy) || '?' }) }));
    if (when) meta.push(el('span', { text: formatWeekdayShort(isoOf(when)) }));
  } else {
    meta.push(task.assignee
      ? paint(el('span', { class: 'who' }, [el('span', { class: 'person-dot', 'aria-hidden': 'true' }), data.shortNameForMail(task.assignee)]), data.colorForMail(task.assignee))
      : el('span', { text: t('tasks.anyone') }));
    if (task.due) {
      const diff = daysBetween(today, task.due);
      const text = Math.abs(diff) <= 6 ? relativeDays(diff) : formatWeekdayShort(task.due);
      meta.push(el('span', { class: diff < 0 ? 'overdue' : diff <= 1 ? 'due-soon' : '', text: t('tasks.dueOn', { when: text }) }));
    }
    if (task.note) meta.push(el('span', { text: '✎', title: t('tasks.hasNote'), 'aria-label': t('tasks.hasNote') }));
  }
  const badge = groupBadge(data, task);
  if (badge) meta.push(badge);
  const box = el('button', {
    class: `check ${task.done ? 'checked' : ''}`, type: 'button', role: 'checkbox',
    'aria-checked': task.done ? 'true' : 'false',
    'aria-label': task.done ? t('tasks.markOpen', { title: task.title }) : t('tasks.markDone', { title: task.title }),
    onclick: () => setDone(session, task, !task.done),
  }, [svgIcon(CHECK_ICON)]);
  const mine = task.assignee && task.assignee === session.mail;
  return el('li', { class: `task ${task.done ? 'done' : ''} ${mine ? 'mine' : ''}`.trim() }, [
    box,
    el('button', { class: 'task-main', type: 'button', onclick: () => (onOpen ? onOpen(task) : null) }, [
      el('span', { class: 'task-title', text: task.title }),
      el('span', { class: 'task-meta' }, meta),
    ]),
  ]);
}

export function createTasks(data) {
  const root = $('tasks-content');
  const session = data.session;
  let filter = 'open'; // open | mine | done
  let group = ALL;     // '*' all, '' whole family, or a household id

  // ---------- drawing ----------

  function quickAdd() {
    const input = el('input', { type: 'text', maxlength: 200, autocomplete: 'off', placeholder: t('tasks.quickPlaceholder'), 'aria-label': t('tasks.quickPlaceholder') });
    const form = el('form', { class: 'add-row', novalidate: true }, [
      input,
      el('button', { class: 'btn btn-primary btn-small', type: 'submit', text: t('common.add') }),
    ]);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      input.value = '';
      const problem = await create({ title, note: '', assignee: '', due: '', household: defaultGroup(data, group) });
      if (problem) { toast(problem); input.value = title; }
    });
    return form;
  }

  function filters() {
    const options = [['open', t('tasks.filterOpen')], ['mine', t('tasks.filterMine')], ['done', t('tasks.filterDone')]];
    return el('div', { class: 'chips', role: 'group', 'aria-label': t('tasks.filterLabel') }, options.map(([value, label]) => el('button', {
      class: 'chip', type: 'button', 'aria-pressed': filter === value ? 'true' : 'false', text: label,
      onclick: () => { filter = value; render(); },
    })));
  }

  function render() {
    const open = sortOpenTasks(data.state.tasksOpen.filter((x) => inGroup(x, group)));
    const done = sortDone(data.state.tasksDone.filter((x) => inGroup(x, group)));
    let list;
    let empty;
    if (filter === 'done') { list = done; empty = t('tasks.noneDone'); }
    else if (filter === 'mine') { list = open.filter((x) => x.assignee === session.mail); empty = t('tasks.noneMine'); }
    else { list = open; empty = t('tasks.noneOpen'); }

    filterBox.replaceChildren(groupChips(data, group, (value) => { group = value; render(); }) || '', filters());
    listBox.replaceChildren(
      list.length
        ? el('ul', { class: 'task-list' }, list.map((task) => taskItem(data, task, { onOpen: openTask })))
        : emptyNote(data.state.loaded.tasksOpen ? empty : t('common.loading')),
      filter === 'done' && done.length
        ? el('button', { class: 'btn btn-small more-btn', type: 'button', text: t('tasks.clearDone'), onclick: () => clearDone(done) })
        : '',
    );
  }

  // The quick add field is built once, so live updates never wipe what someone is typing.
  const filterBox = el('div');
  const listBox = el('div');
  root.replaceChildren(card(t('nav.tasks'), [quickAdd(), filterBox, listBox], { action: addButton(t('tasks.add'), () => openEditor(null)) }));

  // ---------- details and editing ----------

  function openTask(task) {
    if (canEdit(session, task)) { openEditor(task); return; }
    const lines = [
      el('p', { text: task.assignee ? t('tasks.who', { name: data.nameForMail(task.assignee) }) : t('tasks.anyone') }),
      task.due ? el('p', { text: t('tasks.dueOn', { when: formatWeekdayShort(task.due) }) }) : null,
      task.household ? el('p', { text: t('house.inHousehold', { name: data.householdName(task.household) }) }) : null,
      task.note ? el('p', { class: 'pre', text: task.note }) : null,
      el('p', { class: 'muted small', text: t('common.addedBy', { name: data.nameForUid(task.createdBy, task.createdByName) || '?' }) }),
    ];
    openDialog({
      title: task.title,
      content: lines,
      buttons: [{ label: task.done ? t('tasks.reopen') : t('tasks.done'), kind: 'primary', onClick: async (close) => { await setDone(session, task, !task.done); close(); } }],
    });
  }

  function openEditor(existing) {
    const task = existing || {};
    const people = [{ value: '', label: t('tasks.anyone') }, ...data.family().map((p) => ({ value: p.mail, label: p.name }))];
    // Only the creator moves an open task to another group (it is written there new).
    const mayMove = !existing || (existing.createdBy === session.user.uid && !existing.done);
    openForm({
      title: existing ? t('tasks.editTitle') : t('tasks.newTitle'),
      fields: [
        { name: 'title', type: 'text', label: t('tasks.titleLabel'), value: task.title || '', maxlength: 200, required: true },
        { name: 'assignee', type: 'select', label: t('tasks.whoLabel'), value: task.assignee || '', options: people },
        { name: 'due', type: 'date', label: t('tasks.dueLabel'), value: task.due || '', hint: t('tasks.dueHint') },
        mayMove ? groupField(data, existing ? existing.household : defaultGroup(data, group)) : null,
        { name: 'note', type: 'textarea', label: t('tasks.noteLabel'), value: task.note || '', maxlength: 1000, rows: 3 },
      ],
      danger: existing ? { label: t('common.delete'), onClick: () => remove(existing) } : null,
      onSubmit: (v) => (existing ? update(existing, v) : create(v)),
    });
  }

  const clean = (v) => ({
    title: v.title.trim(),
    note: (v.note || '').trim(),
    assignee: v.assignee || '',
    due: isIso(v.due) ? v.due : '',
  });
  const fresh = (v) => ({ ...clean(v), done: false, doneAt: null, doneBy: '', ...createdFields(session), updatedAt: serverTimestamp() });

  async function create(v) {
    try {
      await addDoc(collection(db, `${baseOf(v.household || '')}tasks`), fresh(v));
      return undefined;
    } catch (err) {
      console.warn('Saving the task failed', err.code);
      return t('common.saveFailed');
    }
  }

  async function update(existing, v) {
    try {
      if (v.household !== undefined && v.household !== (existing.household || '')) {
        const batch = writeBatch(db);
        batch.set(doc(collection(db, `${baseOf(v.household)}tasks`)), fresh(v));
        batch.delete(doc(db, existing.path));
        await batch.commit();
      } else {
        await updateDoc(doc(db, existing.path), { ...clean(v), updatedAt: serverTimestamp() });
      }
      toast(t('common.saved'));
      return undefined;
    } catch (err) {
      console.warn('Saving the task failed', err.code);
      return t('common.saveFailed');
    }
  }

  async function remove(existing) {
    if (!confirm(t('tasks.confirmDelete', { title: existing.title }))) return false;
    try {
      await deleteDoc(doc(db, existing.path));
      toast(t('common.deleted'));
      return true;
    } catch (err) {
      console.warn('Deleting the task failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  async function clearDone(done) {
    if (!done.length || !confirm(t('tasks.confirmClear', { n: done.length }))) return;
    const batch = writeBatch(db);
    for (const task of done) batch.delete(doc(db, task.path));
    try {
      await batch.commit();
      toast(t('common.deleted'));
    } catch (err) {
      console.warn('Removing done tasks failed', err.code);
      toast(t('common.saveFailed'));
    }
  }

  const stop = data.subscribe(render);
  return {
    onShow() { render(); },
    add() { openEditor(null); },
    open: openTask,
    stop() { stop(); root.replaceChildren(); },
  };
}
