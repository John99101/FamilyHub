// Contacts and emergency info: addresses, phone numbers, doctors, notes such
// as allergies. Everyone in the family reads them; only admins change them.
// The contacts are only read when the page is opened for the first time.
import {
  db, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from './firebase.js';
import { $, el, toast, card, emptyNote, addButton } from './ui.js';
import { t, locale } from './i18n.js';
import { openForm } from './dialog.js';

export const GROUPS = ['emergency', 'family', 'health', 'service', 'other'];
const PHONE_PATTERN = /^[0-9+ ()/.-]{0,40}$/;
const MAIL_PATTERN = /^[a-z0-9._%+'-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const fold = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** A phone link that can only ever call a number (digits and a leading +). */
export function telHref(phone) {
  const digits = String(phone || '').replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');
  return digits.length >= 3 ? `tel:${digits}` : null;
}

export function createContacts(data) {
  const root = $('contacts-content');
  const session = data.session;
  let contacts = [];
  let loaded = false;
  let unsubscribe = null;
  let search = '';

  function start() {
    if (unsubscribe) return;
    unsubscribe = onSnapshot(collection(db, 'contacts'), (snap) => {
      contacts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded = true;
      render();
    }, (err) => console.warn('Reading contacts failed', err.code));
  }

  const searchInput = el('input', { class: 'search-input', type: 'search', placeholder: t('contacts.search'), 'aria-label': t('contacts.search'), autocomplete: 'off' });
  searchInput.addEventListener('input', () => { search = fold(searchInput.value.trim()); render(); });
  const note = el('p', { class: 'muted small' });
  const addBox = el('span');
  const listBox = el('div');
  root.replaceChildren(card(t('nav.contacts'), [note, searchInput], { action: addBox }), listBox);

  function contactCard(c) {
    const lines = [];
    for (const phone of [c.phone, c.phone2].filter(Boolean)) {
      const href = telHref(phone);
      lines.push(href ? el('a', { class: 'contact-link', href, text: phone }) : el('span', { text: phone }));
    }
    if (c.mail && MAIL_PATTERN.test(c.mail)) lines.push(el('a', { class: 'contact-link', href: `mailto:${c.mail}`, text: c.mail }));
    if (c.address) {
      lines.push(el('span', { class: 'pre', text: c.address }));
      lines.push(el('a', {
        class: 'contact-link small', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`,
        target: '_blank', rel: 'noopener noreferrer', text: t('contacts.openMap'),
      }));
    }
    if (c.note) lines.push(el('span', { class: 'pre contact-note', text: c.note }));
    if (c.quick) lines.push(el('span', { class: 'muted small', text: t('contacts.quickShown') }));
    const edit = session.isAdmin
      ? el('button', { class: 'btn-link', type: 'button', text: t('common.edit'), onclick: () => openEditor(c) })
      : null;
    return el('li', { class: 'contact' }, [
      el('div', { class: 'contact-head' }, [el('span', { class: 'contact-name', text: c.name }), edit]),
      el('div', { class: 'contact-lines' }, lines),
    ]);
  }

  function render() {
    note.textContent = session.isAdmin ? t('contacts.adminNote') : t('contacts.readOnly');
    addBox.replaceChildren(session.isAdmin ? addButton(t('contacts.add'), () => openEditor(null)) : '');
    const list = contacts
      .filter((c) => !search || fold(`${c.name} ${c.address} ${c.note} ${c.phone}`).includes(search))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), locale));
    if (!list.length) {
      listBox.replaceChildren(emptyNote(!loaded ? t('common.loading') : contacts.length ? t('contacts.noMatch') : t('contacts.none')));
      return;
    }
    listBox.replaceChildren(...GROUPS
      .map((g) => [g, list.filter((c) => c.group === g)])
      .filter(([, items]) => items.length)
      .map(([g, items]) => card(t(`contacts.group.${g}`), el('ul', { class: 'contact-list' }, items.map(contactCard)), { className: g === 'emergency' ? 'card-emergency' : '' })));
  }

  function openEditor(existing) {
    const c = existing || {};
    openForm({
      title: existing ? t('contacts.editTitle') : t('contacts.newTitle'),
      fields: [
        { name: 'name', type: 'text', label: t('contacts.name'), value: c.name || '', maxlength: 100, required: true },
        { name: 'group', type: 'select', label: t('contacts.groupLabel'), value: c.group || 'family', options: GROUPS.map((g) => ({ value: g, label: t(`contacts.group.${g}`) })) },
        { name: 'phone', type: 'text', inputType: 'tel', label: t('contacts.phone'), value: c.phone || '', maxlength: 40, inputmode: 'tel' },
        { name: 'phone2', type: 'text', inputType: 'tel', label: t('contacts.phone2'), value: c.phone2 || '', maxlength: 40, inputmode: 'tel' },
        { name: 'mail', type: 'text', inputType: 'email', label: t('contacts.mail'), value: c.mail || '', maxlength: 100, inputmode: 'email' },
        { name: 'address', type: 'textarea', label: t('contacts.address'), value: c.address || '', maxlength: 300, rows: 2 },
        { name: 'note', type: 'textarea', label: t('contacts.note'), value: c.note || '', maxlength: 1000, rows: 3, hint: t('contacts.noteHint') },
        { name: 'quick', type: 'checkbox', label: t('contacts.quick'), value: !!c.quick },
      ],
      danger: existing ? { label: t('common.delete'), onClick: () => remove(existing) } : null,
      onSubmit: async (v) => {
        const phone = v.phone.trim();
        const phone2 = v.phone2.trim();
        const mail = v.mail.trim().toLowerCase();
        if (!PHONE_PATTERN.test(phone) || !PHONE_PATTERN.test(phone2)) return t('contacts.phoneInvalid');
        if (mail && !MAIL_PATTERN.test(mail)) return t('settings.mailInvalid');
        const contact = {
          name: v.name.trim(), group: GROUPS.includes(v.group) ? v.group : 'other', phone, phone2, mail,
          address: v.address.trim(), note: v.note.trim(), quick: !!v.quick, updatedAt: serverTimestamp(), updatedBy: session.mail,
        };
        try {
          if (existing) await updateDoc(doc(db, 'contacts', existing.id), contact);
          else await addDoc(collection(db, 'contacts'), contact);
          toast(t('common.saved'));
          return undefined;
        } catch (err) {
          console.warn('Saving the contact failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  async function remove(existing) {
    if (!confirm(t('contacts.confirmDelete', { name: existing.name }))) return false;
    try {
      await deleteDoc(doc(db, 'contacts', existing.id));
      toast(t('common.deleted'));
      return true;
    } catch (err) {
      console.warn('Deleting the contact failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  render();
  return {
    onShow() { start(); render(); },
    onRoleChange() { render(); },
    stop() { if (unsubscribe) unsubscribe(); root.replaceChildren(); },
  };
}
