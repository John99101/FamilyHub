// Polls: a question with 2 to 10 answers, one or several choices, live
// results with names. The creator or an admin closes or deletes a poll.
// Polls belong to the whole family or to a household.
import { db, collection, doc, addDoc, updateDoc, deleteDoc, deleteField } from './firebase.js';
import { $, el, svgIcon, toast, card, emptyNote, addButton, formatDateTime } from './ui.js';
import { t } from './i18n.js';
import { canEdit, createdFields, toDate, baseOf } from './family-data.js';
import { ALL, inGroup, groupChips, groupField, defaultGroup, groupBadge } from './groups.js';
import { openForm } from './dialog.js';

const MAX_OPTIONS = 10;

export const myVote = (poll, uid) => (Array.isArray(poll.votes?.[uid]) ? poll.votes[uid] : []);
export const voteCount = (poll) => Object.keys(poll.votes || {}).length;

export function createPolls(data) {
  const root = $('polls-content');
  const session = data.session;
  const uid = session.user.uid;
  let group = ALL;

  async function vote(poll, index) {
    const mine = myVote(poll, uid);
    let next;
    if (poll.multi) next = mine.includes(index) ? mine.filter((i) => i !== index) : [...mine, index].sort((a, b) => a - b);
    else next = mine.length === 1 && mine[0] === index ? [] : [index];
    try {
      await updateDoc(doc(db, poll.path), { [`votes.${uid}`]: next.length ? next : deleteField() });
    } catch (err) {
      console.warn('Voting failed', err.code);
      toast(t('common.saveFailed'));
    }
  }

  function pollCard(poll) {
    const mine = myVote(poll, uid);
    const total = voteCount(poll);
    const counts = poll.options.map(() => []);
    for (const [voter, choice] of Object.entries(poll.votes || {})) {
      for (const i of Array.isArray(choice) ? choice : []) if (counts[i]) counts[i].push(voter);
    }
    const max = Math.max(1, ...counts.map((c) => c.length));
    const options = poll.options.map((label, i) => {
      const chosen = mine.includes(i);
      const share = total ? Math.round((counts[i].length / total) * 100) : 0;
      const bar = el('span', { class: 'poll-bar', 'aria-hidden': 'true' });
      bar.style.width = `${(counts[i].length / max) * 100}%`;
      const names = counts[i].map((v) => data.shortNameForUid(v) || '?').join(', ');
      return el('li', {}, [
        el('button', {
          class: `poll-option ${chosen ? 'chosen' : ''}`, type: 'button',
          role: poll.multi ? 'checkbox' : 'radio', 'aria-checked': chosen ? 'true' : 'false',
          disabled: poll.closed, onclick: () => vote(poll, i),
        }, [
          bar,
          el('span', { class: 'poll-check', 'aria-hidden': 'true' }, chosen ? [svgIcon(['m5 12 5 5 9-10'])] : []),
          el('span', { class: 'poll-label' }, [
            el('span', { class: 'poll-text', text: label }),
            names ? el('span', { class: 'poll-names', text: names }) : null,
          ]),
          el('span', { class: 'poll-count', text: total ? `${counts[i].length} · ${share} %` : '0' }),
        ]),
      ]);
    });

    const created = toDate(poll.createdAt);
    const meta = [t('common.addedBy', { name: data.nameForUid(poll.createdBy, poll.createdByName) || '?' })];
    if (created) meta.push(formatDateTime(created));
    meta.push(t('polls.votes', { n: total }));
    if (poll.multi) meta.push(t('polls.multiShort'));

    const actions = [];
    if (canEdit(session, poll)) {
      actions.push(el('button', { class: 'btn-link', type: 'button', text: poll.closed ? t('polls.reopen') : t('polls.close'), onclick: () => setClosed(poll, !poll.closed) }));
      actions.push(el('button', { class: 'btn-link danger', type: 'button', text: t('common.delete'), onclick: () => remove(poll) }));
    }

    return el('article', { class: `poll ${poll.closed ? 'closed' : ''}`.trim() }, [
      el('div', { class: 'poll-head' }, [
        el('h3', { class: 'poll-question', text: poll.question }),
        groupBadge(data, poll),
        poll.closed ? el('span', { class: 'badge', text: t('polls.closed') }) : null,
      ]),
      el('p', { class: 'muted small', text: meta.join(' · ') }),
      el('ul', { class: 'poll-options', role: poll.multi ? 'group' : 'radiogroup', 'aria-label': poll.question }, options),
      !poll.closed && !mine.length ? el('p', { class: 'small poll-hint', text: poll.multi ? t('polls.hintMulti') : t('polls.hintSingle') }) : null,
      actions.length ? el('div', { class: 'poll-actions' }, actions) : null,
    ]);
  }

  function render() {
    const polls = data.state.polls.filter((p) => inGroup(p, group))
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
    const open = polls.filter((p) => !p.closed);
    const closed = polls.filter((p) => p.closed);
    const children = [groupChips(data, group, (value) => { group = value; render(); })];
    if (!polls.length) children.push(emptyNote(data.state.loaded.polls ? t('polls.none') : t('common.loading')));
    children.push(...open.map(pollCard));
    const main = card(t('nav.polls'), children, { action: addButton(t('polls.add'), openEditor) });
    const parts = [main];
    if (closed.length) parts.push(card(t('polls.closedTitle'), closed.map(pollCard)));
    root.replaceChildren(...parts);
  }

  function openEditor() {
    openForm({
      title: t('polls.newTitle'),
      fields: [
        { name: 'question', type: 'text', label: t('polls.question'), maxlength: 200, required: true },
        { name: 'options', type: 'options', label: t('polls.options'), itemLabel: t('polls.option'), addLabel: t('polls.addOption'), max: MAX_OPTIONS, maxlength: 80, required: true, min: 2, requiredText: t('polls.twoOptions') },
        { name: 'multi', type: 'checkbox', label: t('polls.multi'), value: false },
        groupField(data, defaultGroup(data, group)),
      ],
      submitLabel: t('polls.start'),
      onSubmit: async (v) => {
        // "|" separates answers in the security rules, so it is replaced.
        const options = v.options.map((o) => o.replace(/\|/g, '/').slice(0, 80));
        if (options.length < 2) return t('polls.twoOptions');
        if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return t('polls.duplicate');
        try {
          await addDoc(collection(db, `${baseOf(v.household || '')}polls`), {
            question: v.question.trim(), options, multi: !!v.multi, closed: false, votes: {}, ...createdFields(session),
          });
          toast(t('polls.started'));
          return undefined;
        } catch (err) {
          console.warn('Starting the poll failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  async function setClosed(poll, closed) {
    try {
      await updateDoc(doc(db, poll.path), { closed });
    } catch (err) {
      console.warn('Closing the poll failed', err.code);
      toast(t('common.saveFailed'));
    }
  }

  async function remove(poll) {
    if (!confirm(t('polls.confirmDelete', { question: poll.question }))) return;
    try {
      await deleteDoc(doc(db, poll.path));
      toast(t('common.deleted'));
    } catch (err) {
      console.warn('Deleting the poll failed', err.code);
      toast(t('common.saveFailed'));
    }
  }

  const stop = data.subscribe(render);
  return {
    onShow() { render(); },
    add: openEditor,
    stop() { stop(); root.replaceChildren(); },
  };
}
