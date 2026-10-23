// "Familie" page: your color, everyone in the family (with the private
// names you give them), and the households (admins set them up).
import { db, collection, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from './firebase.js';
import { $, el, svgIcon, toast, card, emptyNote, addButton } from './ui.js';
import { t } from './i18n.js';
import { PALETTE, paint } from './colors.js';
import { openForm } from './dialog.js';

const CHECK_ICON = ['m5 12 5 5 9-10'];

/** A small colored dot for a person. */
export function personDot(hex, label = '') {
  return paint(el('span', { class: 'person-dot', 'aria-hidden': label ? undefined : 'true', title: label || undefined }), hex);
}

export function createFamilyPage(data) {
  const root = $('family-content');
  const session = data.session;
  let busy = false;

  // ---------- my color ----------

  function colorCard() {
    const mine = data.myColor();
    const holders = data.state.colors;
    const swatches = PALETTE.map((c) => {
      const holder = holders[c.id];
      const takenByOther = holder && holder !== session.user.uid;
      const who = takenByOther ? data.nameForUid(holder) : '';
      const label = takenByOther ? t('family.colorTaken', { color: t(`color.${c.id}`), name: who || '?' }) : t(`color.${c.id}`);
      return paint(el('button', {
        class: `swatch ${c.id === mine ? 'mine' : ''} ${takenByOther ? 'taken' : ''}`.trim(), type: 'button',
        'aria-pressed': c.id === mine ? 'true' : 'false', 'aria-label': label, title: label, disabled: !!takenByOther,
        onclick: () => pickColor(c.id),
      }, c.id === mine ? [svgIcon(CHECK_ICON)] : []), c.hex);
    });
    return card(t('family.myColor'), [
      el('p', { class: 'muted small', text: t('family.colorHint') }),
      el('div', { class: 'swatches', role: 'group', 'aria-label': t('family.myColor') }, swatches),
    ]);
  }

  async function pickColor(color) {
    if (busy || color === data.myColor()) return;
    busy = true;
    try {
      await data.setMyColor(color);
      toast(t('family.colorSaved'));
    } catch (err) {
      console.warn('Changing the color failed', err.code);
      toast(t('family.colorGone'));
    } finally {
      busy = false;
    }
  }

  // ---------- people and nicknames ----------

  function peopleCard() {
    const items = data.family().map((p) => {
      const sub = [];
      if (p.me) sub.push(t('home.you'));
      if (p.nickname) sub.push(t('family.realName', { name: p.realName }));
      if (!p.uid) sub.push(t('family.notSignedIn'));
      return el('li', { class: 'person-row' }, [
        personDot(p.color),
        el('span', { class: 'person-text' }, [
          el('span', { class: 'person-name', text: p.name }),
          sub.length ? el('span', { class: 'muted small', text: sub.join(' · ') }) : null,
        ]),
        p.me ? null : el('button', {
          class: 'btn-link', type: 'button', text: p.nickname ? t('family.changeName') : t('family.giveName'),
          onclick: () => openNickname(p),
        }),
      ]);
    });
    return card(t('family.people'), [
      el('p', { class: 'muted small', text: t('family.nicknameHint') }),
      el('ul', { class: 'person-list' }, items),
    ]);
  }

  function openNickname(p) {
    openForm({
      title: t('family.nameFor', { name: p.realName }),
      intro: t('family.nicknameHint'),
      fields: [
        { name: 'nickname', type: 'text', label: t('family.nickname'), value: p.nickname, maxlength: 40, placeholder: p.realName },
      ],
      danger: p.nickname ? { label: t('family.removeName'), onClick: async () => { await saveNickname(p.mail, ''); return true; } } : null,
      onSubmit: async (v) => saveNickname(p.mail, v.nickname),
    });
  }

  async function saveNickname(mail, name) {
    try {
      await data.setNickname(mail, name);
      toast(t('common.saved'));
      return undefined;
    } catch (err) {
      console.warn('Saving the name failed', err.code);
      return t('common.saveFailed');
    }
  }

  // ---------- households ----------

  function householdsCard() {
    const households = [...data.state.households].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const list = households.map((h) => {
      const members = (h.members || []).map((mail) => el('span', { class: 'member-chip' }, [personDot(data.colorForMail(mail)), el('span', { text: data.shortNameForMail(mail) })]));
      const mine = (h.members || []).includes(session.mail);
      return el('li', { class: 'household' }, [
        el('div', { class: 'household-head' }, [
          el('span', { class: 'household-name', text: h.name }),
          mine ? el('span', { class: 'badge', text: t('house.youAreIn') }) : null,
          session.isAdmin ? el('button', { class: 'btn-link', type: 'button', text: t('common.edit'), onclick: () => openHousehold(h) }) : null,
        ]),
        el('div', { class: 'member-chips' }, members),
      ]);
    });
    const children = [el('p', { class: 'muted small', text: t('house.hint') })];
    children.push(list.length ? el('ul', { class: 'household-list' }, list) : emptyNote(t('house.none')));
    if (!session.isAdmin) children.push(el('p', { class: 'muted small', text: t('house.adminsOnly') }));
    return card(t('house.title'), children, { action: session.isAdmin ? addButton(t('house.add'), () => openHousehold(null)) : null });
  }

  function openHousehold(existing) {
    const h = existing || {};
    const people = data.family().map((p) => ({ value: p.mail, label: p.me ? `${p.name} (${t('home.you')})` : p.name }));
    openForm({
      title: existing ? t('house.editTitle') : t('house.newTitle'),
      fields: [
        { name: 'name', type: 'text', label: t('house.name'), value: h.name || '', maxlength: 40, required: true, placeholder: t('house.nameExample') },
        { name: 'members', type: 'people', label: t('house.members'), value: h.members || [], options: people, required: true, min: 1, requiredText: t('house.needMember') },
        { name: 'info', type: 'info', text: t('house.privacy') },
      ],
      danger: existing ? { label: t('house.delete'), onClick: () => removeHousehold(existing) } : null,
      onSubmit: async (v) => {
        const fields = { name: v.name.trim(), members: [...new Set(v.members)], updatedAt: serverTimestamp(), updatedBy: session.mail };
        try {
          if (existing) await updateDoc(doc(db, 'households', existing.id), fields);
          else await setDoc(doc(collection(db, 'households')), fields);
          toast(t('common.saved'));
          return undefined;
        } catch (err) {
          console.warn('Saving the household failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  async function removeHousehold(h) {
    if (!confirm(t('house.confirmDelete', { name: h.name }))) return false;
    try {
      await deleteDoc(doc(db, 'households', h.id));
      toast(t('common.deleted'));
      return true;
    } catch (err) {
      console.warn('Deleting the household failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  function render() {
    root.replaceChildren(colorCard(), peopleCard(), householdsCard());
  }

  let visible = false;
  const stop = data.subscribe(() => { if (visible) render(); });
  return {
    onShow() { visible = true; render(); },
    onHide() { visible = false; },
    onRoleChange() { if (visible) render(); },
    stop() { stop(); root.replaceChildren(); },
  };
}
