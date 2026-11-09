// Gifts of time: activities, trips and vouchers people gave each other for a
// birthday or Christmas, so they really happen. Each gift nudges louder the
// longer it waits; planning it can put the day in the calendar; redeeming it
// throws confetti and keeps a short memory. Private ones are seen only by
// their givers and receivers (the rules make sure of that).
import { db, collection, doc, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from './firebase.js';
import { $, el, toast, card, emptyNote, addButton, formatDay, relativeDays } from './ui.js';
import { t, locale } from './i18n.js';
import { todayIso } from './dates.js';
import { createdFields } from './family-data.js';
import { featureOn } from './design.js';
import { openForm } from './dialog.js';
import { KINDS, KIND_ICONS, voucherMood, sortVouchers, isInvolved } from './vouchers.js';

const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
const names = new Intl.ListFormat(locale, { type: 'conjunction' });

/** "vor 3 Tagen", "vor 2 Monaten": the larger units read better for old gifts. */
function since(days) {
  if (days < 14) return relativeDays(-days);
  if (days < 60) return rtf.format(-Math.round(days / 7), 'week');
  if (days < 730) return rtf.format(-Math.round(days / 30), 'month');
  return rtf.format(-Math.round(days / 365), 'year');
}

/** The nudge a gift shows today, with its icon. */
export function moodLine(v, today = todayIso()) {
  const m = voucherMood(v, today);
  const text = {
    fresh: () => t('vouchers.mood.fresh', { when: since(m.days) }),
    waiting: () => t('vouchers.mood.waiting', { when: since(m.days) }),
    dusty: () => t('vouchers.mood.dusty', { when: since(m.days) }),
    fossil: () => t('vouchers.mood.fossil', { when: since(m.days) }),
    expiring: () => t('vouchers.mood.expiring', { date: formatDay(v.until), when: relativeDays(m.days) }),
    expired: () => t('vouchers.mood.expired', { date: formatDay(v.until) }),
    planned: () => t('vouchers.mood.planned', { date: formatDay(v.plannedOn), when: relativeDays(m.days) }),
    today: () => t('vouchers.mood.today'),
    didIt: () => t('vouchers.mood.didIt', { date: formatDay(v.plannedOn) }),
    done: () => t('vouchers.mood.done', { date: formatDay(v.doneOn) }),
  }[m.mood]();
  return `${m.icon} ${text}`;
}

/** "Von Anna für Ben und Carla"; nameOf gives everyone's real names for shared text (no private nicknames). */
export function fromTo(data, v, nameOf = data.shortNameForMail) {
  const list = (mails) => names.format((mails || []).map((m) => nameOf(m) || '?'));
  return t('vouchers.fromTo', { from: list(v.givers), to: list(v.receivers) });
}

const kindIcon = (v) => KIND_ICONS[v.kind] || KIND_ICONS.voucher;

/** A short burst of confetti (skipped when the device asks for less motion). */
function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['var(--primary)', 'var(--accent)', '#f59e0b', '#db2777', '#22c55e', '#3b82f6'];
  const burst = el('div', { class: 'confetti-burst', 'aria-hidden': 'true' });
  for (let i = 0; i < 48; i += 1) {
    const bit = el('span');
    bit.style.setProperty('--x', `${Math.round((Math.random() * 2 - 1) * 45)}vw`);
    bit.style.setProperty('--y', `${Math.round(10 + Math.random() * 55)}vh`);
    bit.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    bit.style.setProperty('--c', colors[i % colors.length]);
    bit.style.animationDelay = `${Math.round(Math.random() * 150)}ms`;
    burst.append(bit);
  }
  document.body.append(burst);
  setTimeout(() => burst.remove(), 2000);
}

export function createVoucherPage(data) {
  const root = $('vouchers-content');
  const session = data.session;
  const uid = session.user.uid;

  // Givers and receivers plan and redeem; admins see (and so change) only shared ones.
  const mayChange = (v) => v.createdBy === uid || isInvolved(v, session.mail) || (session.isAdmin && !v.private);
  const mayDelete = (v) => v.createdBy === uid || (session.isAdmin && !v.private);

  async function save(v, values, okText) {
    try {
      await updateDoc(doc(db, v.path), { ...values, updatedAt: serverTimestamp() });
      if (okText) toast(okText);
      return undefined;
    } catch (err) {
      console.warn('Saving the gift failed', err.code);
      return t('common.saveFailed');
    }
  }

  // ---------- list ----------

  function voucherCard(v) {
    const done = v.status === 'done';
    const meta = [v.occasion, t('vouchers.givenOn', { date: formatDay(v.givenOn) })].filter(Boolean);
    const actions = [];
    if (mayChange(v) && !done) {
      actions.push(el('button', { class: 'btn btn-small', type: 'button', text: v.status === 'planned' ? t('vouchers.replan') : t('vouchers.plan'), onclick: () => openPlan(v) }));
      actions.push(el('button', { class: 'btn btn-small btn-primary', type: 'button', text: t('vouchers.redeem'), onclick: () => openRedeem(v) }));
    }
    if (mayChange(v) && done) {
      actions.push(el('button', { class: 'btn-link', type: 'button', text: t('vouchers.reopen'), onclick: () => save(v, { status: 'open', doneOn: '' }, t('vouchers.reopened')) }));
    }
    if (mayChange(v)) actions.push(el('button', { class: 'btn-link', type: 'button', text: t('common.edit'), onclick: () => openEditor(v) }));

    return el('article', { class: `voucher voucher-${voucherMood(v, todayIso()).mood}`, 'data-id': v.id }, [
      el('div', { class: 'voucher-head' }, [
        el('span', { class: 'voucher-icon', text: kindIcon(v), 'aria-hidden': 'true' }),
        el('h3', { class: 'voucher-title', text: v.title }),
        v.private ? el('span', { class: 'badge', text: t('vouchers.privateBadge') }) : null,
      ]),
      el('p', { class: 'voucher-people', text: fromTo(data, v) }),
      el('p', { class: 'muted small', text: meta.join(' · ') }),
      el('p', { class: 'voucher-nudge', text: moodLine(v) }),
      v.note ? el('p', { class: 'voucher-note', text: v.note }) : null,
      done && v.memory ? el('blockquote', { class: 'voucher-memory', text: v.memory }) : null,
      actions.length ? el('div', { class: 'voucher-actions' }, actions) : null,
    ]);
  }

  // Picks one of this person's unplanned gifts at random and points at it.
  function rollDice(candidates) {
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const node = root.querySelector(`[data-id="${CSS.escape(pick.id)}"]`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.classList.remove('voucher-picked');
      void node.offsetWidth; // restarts the highlight
      node.classList.add('voucher-picked');
    }
    toast(t('vouchers.diced', { title: pick.title }));
  }

  function render() {
    const today = todayIso();
    const all = data.state.vouchers;
    const open = sortVouchers(all.filter((v) => v.status !== 'done'), today);
    const done = all.filter((v) => v.status === 'done').sort((a, b) => (a.doneOn < b.doneOn ? 1 : -1));
    const dice = open.filter((v) => v.status === 'open' && isInvolved(v, session.mail));

    const children = [];
    if (all.length) {
      const bar = el('span', { class: 'voucher-progress-bar' });
      bar.style.width = `${Math.round((done.length / all.length) * 100)}%`;
      children.push(el('div', { class: 'voucher-progress' }, [
        el('p', { class: 'small', text: t('vouchers.progress', { done: done.length, all: all.length }) }),
        el('div', { class: 'voucher-progress-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(all.length), 'aria-valuenow': String(done.length) }, [bar]),
      ]));
    }
    if (dice.length >= 2) {
      children.push(el('button', { class: 'btn btn-small voucher-dice', type: 'button', text: t('vouchers.dice'), onclick: () => rollDice(dice) }));
    }
    if (!open.length) children.push(emptyNote(data.state.loaded.vouchers ? t(all.length ? 'vouchers.allDone' : 'vouchers.none') : t('common.loading')));
    children.push(...open.map(voucherCard));

    const parts = [card(t('nav.vouchers'), children, { action: addButton(t('vouchers.add'), () => openEditor(null)) })];
    if (done.length) parts.push(card(t('vouchers.memories'), done.map(voucherCard), { className: 'card-memories' }));
    root.replaceChildren(...parts);
  }

  // ---------- dialogs ----------

  function peopleOptions(extra) {
    const family = data.family().map((p) => ({ value: p.mail, label: p.me ? `${p.name} (${t('home.you')})` : p.name }));
    // People who left the group stay on the gift (and in the form) until someone removes them.
    const known = new Set(family.map((p) => p.value));
    const gone = [...new Set(extra)].filter((m) => !known.has(m)).map((m) => ({ value: m, label: data.nameForMail(m) || m }));
    return [...family, ...gone];
  }

  function openEditor(v) {
    const options = peopleOptions([...(v?.givers || []), ...(v?.receivers || [])]);
    openForm({
      title: v ? t('vouchers.editTitle') : t('vouchers.newTitle'),
      intro: v ? undefined : t('vouchers.intro'),
      fields: [
        { name: 'title', type: 'text', label: t('vouchers.what'), placeholder: t('vouchers.whatExample'), maxlength: 100, required: true, value: v?.title || '' },
        { name: 'kind', type: 'segmented', label: t('vouchers.kind'), value: v?.kind || 'activity', options: KINDS.map((k) => ({ value: k, label: `${KIND_ICONS[k]} ${t(`vouchers.kind.${k}`)}` })) },
        { name: 'givers', type: 'people', label: t('vouchers.givers'), value: v?.givers || [session.mail], options, required: true, requiredText: t('vouchers.needGivers') },
        { name: 'receivers', type: 'people', label: t('vouchers.receivers'), value: v?.receivers || [], options, required: true, requiredText: t('vouchers.needReceivers') },
        { name: 'occasion', type: 'text', label: t('vouchers.occasion'), placeholder: t('vouchers.occasionExample'), maxlength: 60, value: v?.occasion || '' },
        { name: 'givenOn', type: 'date', label: t('vouchers.givenOnLabel'), value: v?.givenOn || todayIso(), required: true },
        { name: 'until', type: 'date', label: t('vouchers.until'), hint: t('vouchers.untilHint'), value: v?.until || '' },
        { name: 'note', type: 'textarea', label: t('vouchers.note'), maxlength: 1000, rows: 3, value: v?.note || '' },
        { name: 'private', type: 'checkbox', label: t('vouchers.private'), value: !!v?.private },
      ],
      submitLabel: v ? t('common.save') : t('vouchers.addSubmit'),
      danger: v && mayDelete(v) ? { label: t('common.delete'), onClick: () => remove(v) } : undefined,
      onSubmit: async (values) => {
        const fields = {
          title: values.title.trim().slice(0, 100),
          kind: values.kind,
          givers: [...new Set(values.givers)],
          receivers: [...new Set(values.receivers)],
          occasion: values.occasion.trim().slice(0, 60),
          givenOn: values.givenOn,
          until: values.until,
          note: values.note.trim().slice(0, 1000),
          private: !!values.private,
        };
        if (fields.private && !isInvolved(fields, session.mail)) return t('vouchers.privateNeedsYou');
        if (v) return save(v, fields, t('common.saved'));
        try {
          await addDoc(collection(db, 'vouchers'), {
            ...fields, status: 'open', plannedOn: '', doneOn: '', memory: '', ...createdFields(session), updatedAt: serverTimestamp(),
          });
          toast(t('vouchers.added'));
          return undefined;
        } catch (err) {
          console.warn('Adding the gift failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  function openPlan(v) {
    // A calendar entry everyone sees fits only shared gifts.
    const calendar = featureOn(session.group, 'calendar') && !v.private;
    openForm({
      title: t('vouchers.planTitle', { title: v.title }),
      fields: [
        { name: 'plannedOn', type: 'date', label: t('vouchers.planDay'), value: v.plannedOn || '', required: true },
        calendar ? { name: 'toCalendar', type: 'checkbox', label: t('vouchers.toCalendar'), value: v.status !== 'planned' } : null,
      ],
      submitLabel: t('vouchers.planSubmit'),
      danger: v.status === 'planned'
        ? { label: t('vouchers.unplan'), onClick: async () => !(await save(v, { status: 'open', plannedOn: '' }, t('vouchers.unplanned'))) }
        : undefined,
      onSubmit: async (values) => {
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, v.path), { status: 'planned', plannedOn: values.plannedOn, updatedAt: serverTimestamp() });
          if (values.toCalendar) {
            batch.set(doc(collection(db, 'events')), {
              title: `${kindIcon(v)} ${v.title}`.slice(0, 100), date: values.plannedOn, endDate: '', time: '', place: '',
              note: fromTo(data, v, data.realNameForMail).slice(0, 500), kind: 'event', repeat: 'none', yearKnown: true, person: '',
              ...createdFields(session), updatedAt: serverTimestamp(),
            });
          }
          await batch.commit();
          toast(t('vouchers.planned'));
          return undefined;
        } catch (err) {
          console.warn('Planning the gift failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  function openRedeem(v) {
    const today = todayIso();
    openForm({
      title: t('vouchers.redeemTitle'),
      intro: t('vouchers.redeemIntro', { title: v.title }),
      fields: [
        { name: 'doneOn', type: 'date', label: t('vouchers.doneOn'), value: v.plannedOn && v.plannedOn <= today ? v.plannedOn : today, required: true },
        { name: 'memory', type: 'textarea', label: t('vouchers.memory'), placeholder: t('vouchers.memoryExample'), maxlength: 500, rows: 3, value: v.memory || '' },
      ],
      submitLabel: t('vouchers.redeemSubmit'),
      onSubmit: async (values) => {
        const problem = await save(v, { status: 'done', doneOn: values.doneOn, memory: values.memory.trim().slice(0, 500) }, t('vouchers.redeemed'));
        if (!problem) celebrate();
        return problem;
      },
    });
  }

  async function remove(v) {
    if (!confirm(t('vouchers.confirmDelete', { title: v.title }))) return false;
    try {
      await deleteDoc(doc(db, v.path));
      toast(t('common.deleted'));
      return true;
    } catch (err) {
      console.warn('Deleting the gift failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  const stop = data.subscribe(render);
  return {
    onShow() { render(); },
    stop() { stop(); root.replaceChildren(); },
  };
}
