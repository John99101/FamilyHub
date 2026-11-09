// The group page: name, code and password, which pages the group uses, its
// look, and who is in it. Admins change everything; everyone can switch
// groups or leave (admins first hand the admin role to someone else).
import { db, doc, updateDoc, deleteDoc, serverTimestamp, callFunction } from './firebase.js';
import { $, el, card, toast } from './ui.js';
import { t, locale } from './i18n.js';
import { groupErrorKey } from './group-errors.js';
import { openDialog } from './dialog.js';
import { applyDesign } from './design.js';
import { nameAndIcon, passwordFields, passwordProblem, featureSwitches, designEditor, cleanDesign } from './group-forms.js';

export function createGroupPage(session, { onSwitch }) {
  const root = $('group-page');
  const groupRef = doc(db, 'groups', session.groupId);
  let visible = false;
  let editingLook = false;

  async function saveGroup(changes, okText) {
    const g = session.group;
    try {
      await updateDoc(groupRef, {
        name: g.name, icon: g.icon, features: g.features || {}, design: g.design || {},
        ...changes, updatedAt: serverTimestamp(), updatedBy: session.user.uid,
      });
      toast(okText);
      return true;
    } catch (err) {
      console.warn('Saving the group failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  function editName() {
    const draft = { name: session.group.name, icon: session.group.icon };
    openDialog({
      title: t('group.editName'),
      content: nameAndIcon(draft, () => {}),
      buttons: [{ label: t('common.save'), kind: 'primary', onClick: async (close) => {
        if (!draft.name.trim()) { toast(t('start.err.groupName')); return; }
        if (await saveGroup({ name: draft.name.trim(), icon: draft.icon }, t('group.saved'))) close();
      } }],
    });
  }

  function changePassword() {
    const draft = { password: '', passwordAgain: '' };
    openDialog({
      title: t('group.changePassword'),
      content: passwordFields(draft, () => {}),
      buttons: [{ label: t('common.save'), kind: 'primary', onClick: async (close) => {
        const p = passwordProblem(draft);
        if (p) { toast(p); return; }
        try {
          await callFunction('setGroupPasswordCall', { groupId: session.groupId, password: draft.password });
          toast(t('group.passwordSaved'));
          close();
        } catch (err) {
          console.warn('Changing the password failed', err.code);
          toast(t(groupErrorKey(err, 'common.saveFailed')));
        }
      } }],
    });
  }

  function infoCard() {
    const g = session.group;
    return card(`${g.icon} ${g.name}`, [
      el('p', { class: 'muted small', text: t('group.codeHint') }),
      el('p', { class: 'group-code', text: g.code }),
      el('div', { class: 'button-row' }, [
        el('button', { class: 'btn btn-small', type: 'button', text: t('start.copyCode'), onclick: async () => {
          try { await navigator.clipboard.writeText(g.code); toast(t('start.copied')); } catch { toast(g.code); }
        } }),
        session.isAdmin ? el('button', { class: 'btn btn-small', type: 'button', text: t('group.editName'), onclick: editName }) : null,
        session.isAdmin ? el('button', { class: 'btn btn-small', type: 'button', text: t('group.changePassword'), onclick: changePassword }) : null,
      ]),
    ]);
  }

  function pagesCard() {
    if (!session.isAdmin) return null;
    const features = { ...(session.group.features || {}) };
    return card(t('group.pages'), [
      el('p', { class: 'muted small', text: t('group.pagesHint') }),
      featureSwitches(features, () => {}, { marketsUnlocked: session.group.marketsUnlocked === true }),
      el('button', { class: 'btn btn-primary btn-small', type: 'button', text: t('common.save'), onclick: () => saveGroup({ features }, t('group.saved')) }),
    ]);
  }

  function lookCard() {
    if (!session.isAdmin) return null;
    if (!editingLook) {
      return card(t('group.look'), [
        el('p', { class: 'muted small', text: t('group.lookHint') }),
        el('button', { class: 'btn btn-small', type: 'button', text: t('group.editLook'), onclick: () => { editingLook = true; render(); } }),
      ]);
    }
    const design = structuredClone(session.group.design || {});
    const stop = () => { editingLook = false; applyDesign(session.group.design || {}); render(); };
    return card(t('group.look'), [
      designEditor(design, (d) => applyDesign(d, { keep: false })),
      el('div', { class: 'button-row' }, [
        el('button', { class: 'btn', type: 'button', text: t('common.cancel'), onclick: stop }),
        el('button', { class: 'btn btn-primary', type: 'button', text: t('common.save'), onclick: async () => {
          if (await saveGroup({ design: cleanDesign(design) }, t('group.saved'))) { editingLook = false; render(); }
        } }),
      ]),
    ]);
  }

  async function setRole(member, role) {
    try {
      await updateDoc(doc(db, 'groups', session.groupId, 'members', member.uid), { role });
      toast(t(role === 'admin' ? 'settings.adminAdded' : 'settings.adminRevoked'));
    } catch (err) {
      console.warn('Changing the role failed', err.code);
      toast(t('common.saveFailed'));
    }
  }

  async function remove(member) {
    if (!confirm(t('group.confirmRemove', { name: member.name || member.mail }))) return;
    try {
      await deleteDoc(doc(db, 'groups', session.groupId, 'members', member.uid));
      toast(t('group.removed'));
    } catch (err) {
      console.warn('Removing failed', err.code);
      toast(t('common.saveFailed'));
    }
  }

  function membersCard() {
    const me = session.user.uid;
    const members = [...session.members].sort((a, b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1)
      || String(a.name).localeCompare(String(b.name), locale));
    return card(t('group.members', { count: members.length }), [
      el('ul', { class: 'people' }, members.map((m) => el('li', { class: 'person' }, [
        el('span', { class: 'person-mail' }, [
          el('strong', { text: m.name || m.mail }), ` ${m.mail}`,
          m.uid === me ? el('span', { class: 'muted', text: ` ${t('settings.you')}` }) : null,
          m.role === 'admin' ? el('span', { class: 'badge', text: t('settings.adminBadge') }) : null,
        ]),
        session.isAdmin && m.uid !== me ? el('div', { class: 'person-actions' }, [
          el('button', { class: 'btn-link', type: 'button', text: t(m.role === 'admin' ? 'settings.revokeAdmin' : 'settings.makeAdmin'),
            onclick: () => setRole(m, m.role === 'admin' ? 'member' : 'admin') }),
          m.role === 'member' ? el('button', { class: 'btn-link danger', type: 'button', text: t('common.remove'), onclick: () => remove(m) }) : null,
        ]) : null,
      ]))),
      el('p', { class: 'muted small', text: t('group.membersHint') }),
    ]);
  }

  async function leave() {
    if (!confirm(t('group.confirmLeave', { name: session.group.name }))) return;
    try {
      await deleteDoc(doc(db, 'groups', session.groupId, 'members', session.user.uid));
      onSwitch();
    } catch (err) {
      console.warn('Leaving failed', err.code);
      toast(t('common.saveFailed'));
    }
  }

  async function deleteGroup() {
    const typed = prompt(t('group.confirmDelete', { name: session.group.name }));
    if (typed === null) return;
    if (typed.trim() !== session.group.name.trim()) { toast(t('group.deleteMismatch')); return; }
    try {
      await deleteDoc(groupRef);
      onSwitch();
    } catch (err) {
      console.warn('Deleting the group failed', err.code);
      toast(t('common.saveFailed'));
    }
  }

  function actionsCard() {
    return card(t('group.actions'), [
      el('div', { class: 'button-row' }, [
        el('button', { class: 'btn btn-small', type: 'button', text: t('group.switch'), onclick: onSwitch }),
        session.isAdmin ? null : el('button', { class: 'btn btn-small', type: 'button', text: t('group.leave'), onclick: leave }),
        session.isAdmin ? el('button', { class: 'btn btn-small btn-danger', type: 'button', text: t('group.delete'), onclick: deleteGroup }) : null,
      ]),
      session.isAdmin ? el('p', { class: 'muted small', text: t('group.adminLeaveHint') }) : null,
    ]);
  }

  function render() {
    if (!visible) return;
    root.replaceChildren(...[infoCard(), pagesCard(), lookCard(), membersCard(), actionsCard()].filter(Boolean));
  }

  return {
    onShow() { visible = true; render(); },
    onHide() {
      visible = false;
      if (editingLook) { editingLook = false; applyDesign(session.group.design || {}); }
    },
    // The group, its members or my role changed; the look editor keeps its draft.
    update() { if (!editingLook) render(); },
    stop() { root.replaceChildren(); },
  };
}
