// Before a group is open: sign in with mail and password (register, confirm
// the mail, reset the password), choose one of your groups, join one with
// its code and password, or set up a new one in five steps.
import {
  auth, db, doc, getDoc, getDocs, updateDoc, collectionGroup, query, where, serverTimestamp, callFunction,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, updateProfile,
} from './firebase.js';
import { $, el, toast } from './ui.js';
import { t } from './i18n.js';
import { applyDesign, storedDesign, FEATURES } from './design.js';
import {
  nameAndIcon, passwordFields, passwordProblem, featureSwitches, designEditor, cleanDesign,
} from './group-forms.js';

const AUTH_ERRORS = {
  'auth/invalid-credential': 'start.err.credentials',
  'auth/wrong-password': 'start.err.credentials',
  'auth/user-not-found': 'start.err.credentials',
  'auth/email-already-in-use': 'start.err.taken',
  'auth/invalid-email': 'start.err.mail',
  'auth/weak-password': 'start.err.weak',
  'auth/too-many-requests': 'start.err.tooMany',
  'auth/network-request-failed': 'common.offline',
};
const authError = (err) => t(AUTH_ERRORS[err?.code] || 'start.err.failed');

function field(label, props) {
  const input = el('input', { id: `start-${props.name}`, ...props });
  return [el('label', { class: 'field-label', for: input.id, text: label }), input];
}

// ---------- sign in with mail and password ----------

/** Fills the mail part of the sign in screen (below the Google button). */
export function setupMailSignIn() {
  const box = $('signin-mail');
  let mode = 'signin'; // signin | register | reset

  function render() {
    const error = el('p', { class: 'form-error', role: 'alert' });
    const [nameLabel, name] = field(t('start.name'), { name: 'name', type: 'text', autocomplete: 'name', maxlength: '60' });
    const [mailLabel, mail] = field(t('start.mail'), { name: 'mail', type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false' });
    const [pwLabel, pw] = field(t('start.password'), { name: 'pw', type: 'password', autocomplete: mode === 'register' ? 'new-password' : 'current-password' });
    const submit = el('button', { class: 'btn btn-primary', type: 'submit', text: t(`start.${mode}`) });

    const form = el('form', { class: 'form-stack start-form', novalidate: true }, [
      mode === 'register' ? nameLabel : null, mode === 'register' ? name : null,
      mailLabel, mail,
      mode === 'reset' ? null : pwLabel, mode === 'reset' ? null : pw,
      submit, error,
    ]);
    form.onsubmit = async (event) => {
      event.preventDefault();
      error.textContent = '';
      const address = mail.value.trim();
      if (!address) { error.textContent = t('start.err.mail'); return; }
      submit.disabled = true;
      try {
        if (mode === 'reset') {
          await sendPasswordResetEmail(auth, address);
          toast(t('start.resetSent'));
          mode = 'signin';
          render();
        } else if (mode === 'register') {
          if (!name.value.trim()) { error.textContent = t('start.err.name'); return; }
          if (pw.value.length < 8) { error.textContent = t('group.pw.rule'); return; }
          const { user } = await createUserWithEmailAndPassword(auth, address, pw.value);
          await updateProfile(user, { displayName: name.value.trim() });
          await sendEmailVerification(user);
        } else {
          await signInWithEmailAndPassword(auth, address, pw.value);
        }
      } catch (err) {
        console.warn('Mail sign in failed', err.code);
        error.textContent = authError(err);
      } finally {
        submit.disabled = false;
      }
    };

    const links = el('p', { class: 'start-links' }, [
      el('button', { class: 'btn-link', type: 'button', text: t(mode === 'register' ? 'start.toSignin' : 'start.toRegister'),
        onclick: () => { mode = mode === 'register' ? 'signin' : 'register'; render(); } }),
      mode === 'signin' ? el('button', { class: 'btn-link', type: 'button', text: t('start.forgot'), onclick: () => { mode = 'reset'; render(); } }) : null,
      mode === 'reset' ? el('button', { class: 'btn-link', type: 'button', text: t('start.toSignin'), onclick: () => { mode = 'signin'; render(); } }) : null,
    ]);
    box.replaceChildren(el('p', { class: 'start-or', text: t('start.or') }), form, links);
  }

  render();
}

// ---------- confirm the mail ----------

export function showVerify(user, { onConfirmed, onSignOut }) {
  const note = el('p', { class: 'form-error', role: 'alert' });
  const check = el('button', {
    class: 'btn btn-primary', type: 'button', text: t('start.verified'),
    onclick: async () => {
      note.textContent = '';
      await user.reload();
      if (!auth.currentUser?.emailVerified) { note.textContent = t('start.notYet'); return; }
      await auth.currentUser.getIdToken(true); // the new token says the mail is confirmed
      onConfirmed(auth.currentUser);
    },
  });
  $('screen-verify').replaceChildren(el('div', { class: 'start-panel' }, [
    el('h1', { text: t('start.verifyTitle') }),
    el('p', { text: t('start.verifyText', { mail: user.email || '' }) }),
    check,
    el('button', { class: 'btn', type: 'button', text: t('start.resend'), onclick: async () => {
      try { await sendEmailVerification(user); toast(t('start.resent')); } catch (err) { note.textContent = authError(err); }
    } }),
    note,
    el('button', { class: 'btn-link', type: 'button', text: t('common.signout'), onclick: onSignOut }),
  ]));
}

// ---------- choose, join or set up a group ----------

async function myGroups(uid) {
  const snap = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)));
  const groups = await Promise.all(snap.docs.map(async (m) => {
    const id = m.ref.parent.parent.id;
    try {
      const g = await getDoc(doc(db, 'groups', id));
      return g.exists() ? { id, ...g.data(), role: m.data().role } : null;
    } catch (err) {
      console.warn('Reading a group failed', err.code);
      return null;
    }
  }));
  return groups.filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * The group screen: your groups, joining with code and password, and the
 * button for a new group.
 */
export async function showGroups(session, { onOpen, onSignOut }) {
  const screen = $('screen-groups');
  const list = el('ul', { class: 'group-list' }, [el('li', { class: 'muted', text: t('common.loading') })]);
  const error = el('p', { class: 'form-error', role: 'alert' });
  const [codeLabel, code] = field(t('start.code'), { name: 'code', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '9', placeholder: 'FAM 7K2Q' });
  const [pwLabel, pw] = field(t('group.password'), { name: 'join-pw', type: 'password', autocomplete: 'off', maxlength: '100' });
  const join = el('button', { class: 'btn btn-primary', type: 'submit', text: t('start.join') });
  const joinForm = el('form', { class: 'form-stack', novalidate: true }, [codeLabel, code, pwLabel, pw, join, error]);

  joinForm.onsubmit = async (event) => {
    event.preventDefault();
    error.textContent = '';
    join.disabled = true;
    try {
      const { groupId } = await callFunction('joinGroupCall', { code: code.value, password: pw.value });
      onOpen(groupId);
    } catch (err) {
      console.warn('Joining failed', err.code);
      error.textContent = t(err.code === 'functions/permission-denied' ? 'start.err.wrongCode'
        : err.code === 'functions/resource-exhausted' ? 'start.err.locked' : 'start.err.failed');
    } finally {
      join.disabled = false;
    }
  };

  screen.replaceChildren(el('div', { class: 'start-panel' }, [
    el('h1', { text: t('start.groupsTitle') }),
    el('p', { class: 'muted', text: t('start.hello', { name: session.user.displayName || session.mail }) }),
    el('section', { class: 'card' }, [el('h2', { text: t('start.myGroups') }), list]),
    el('section', { class: 'card' }, [el('h2', { text: t('start.joinTitle') }), el('p', { class: 'muted small', text: t('start.joinHint') }), joinForm]),
    el('section', { class: 'card' }, [
      el('h2', { text: t('start.newTitle') }),
      el('p', { class: 'muted small', text: t('start.newHint') }),
      el('button', { class: 'btn', type: 'button', text: t('start.newButton'), onclick: () => showWizard(session, { onOpen, onBack: () => showGroups(session, { onOpen, onSignOut }) }) }),
    ]),
    el('button', { class: 'btn-link', type: 'button', text: t('common.signout'), onclick: onSignOut }),
  ]));

  try {
    const groups = await myGroups(session.user.uid);
    list.replaceChildren(...(groups.length ? groups.map((g) => el('li', {}, [
      el('button', { class: 'group-pick', type: 'button', onclick: () => onOpen(g.id) }, [
        el('span', { class: 'group-pick-icon', text: g.icon || '🏡' }),
        el('span', { class: 'group-pick-name', text: g.name }),
        g.role === 'admin' ? el('span', { class: 'badge', text: t('settings.adminBadge') }) : null,
      ]),
    ])) : [el('li', { class: 'muted', text: t('start.noGroups') })]));
  } catch (err) {
    console.warn('Reading my groups failed', err.code);
    list.replaceChildren(el('li', { class: 'form-error', text: t('start.err.failed') }));
  }
}

// ---------- the five steps for a new group ----------

const STEPS = ['name', 'password', 'pages', 'look', 'summary'];

function showWizard(session, { onOpen, onBack }) {
  const screen = $('screen-groups');
  const draft = { name: '', icon: '🏡', password: '', passwordAgain: '' };
  const features = Object.fromEntries(FEATURES.map((f) => [f, f !== 'markets']));
  const design = {};
  const before = storedDesign();
  let step = 0;
  let busy = false;

  const problem = () => {
    if (step === 0 && !draft.name.trim()) return t('start.err.groupName');
    if (step === 1) return passwordProblem(draft);
    return '';
  };

  function leave() {
    applyDesign(before, { keep: false });
    onBack();
  }

  function summary() {
    const pages = FEATURES.filter((f) => features[f] !== false && f !== 'markets').map((f) => t(`feature.${f}`));
    return el('dl', { class: 'wizard-summary' }, [
      el('dt', { text: t('group.name') }), el('dd', { text: `${draft.icon} ${draft.name.trim()}` }),
      el('dt', { text: t('group.password') }), el('dd', { text: '•'.repeat(Math.min(12, draft.password.length)) }),
      el('dt', { text: t('start.step.pages') }), el('dd', { text: pages.join(', ') || t('start.noPages') }),
      el('dt', { text: t('start.step.look') }), el('dd', { text: `${t(`design.theme.${design.theme || 'calm'}`)}, ${t(`design.pattern.${design.pattern || 'none'}`)}, ${t(`design.font.${design.font || 'clean'}`)}` }),
    ]);
  }

  async function create(error) {
    if (busy) return;
    busy = true;
    error.textContent = '';
    try {
      const { groupId, code } = await callFunction('createGroupCall', { name: draft.name.trim(), icon: draft.icon, password: draft.password });
      try {
        await updateDoc(doc(db, 'groups', groupId), { features, design: cleanDesign(design), updatedAt: serverTimestamp(), updatedBy: session.user.uid });
      } catch (err) {
        console.warn('Saving pages and look failed', err.code);
        toast(t('start.err.lookLater'));
      }
      showCreated(groupId, code);
    } catch (err) {
      console.warn('Setting up the group failed', err.code, err.message);
      error.textContent = t(err.message === 'too-many-groups' ? 'start.err.tooManyGroups' : 'start.err.failed');
    } finally {
      busy = false;
    }
  }

  function showCreated(groupId, code) {
    screen.replaceChildren(el('div', { class: 'start-panel' }, [
      el('h1', { text: t('start.createdTitle', { name: draft.name.trim() }) }),
      el('p', { text: t('start.createdText') }),
      el('p', { class: 'group-code', text: code }),
      el('button', { class: 'btn', type: 'button', text: t('start.copyCode'), onclick: async () => {
        try { await navigator.clipboard.writeText(code); toast(t('start.copied')); } catch { toast(code); }
      } }),
      el('p', { class: 'muted small', text: t('start.createdPw') }),
      el('button', { class: 'btn btn-primary', type: 'button', text: t('start.openGroup'), onclick: () => onOpen(groupId) }),
    ]));
  }

  function render() {
    const error = el('p', { class: 'form-error', role: 'alert' });
    const name = STEPS[step];
    const body = {
      name: () => nameAndIcon(draft, () => { error.textContent = ''; }),
      password: () => passwordFields(draft, () => { error.textContent = ''; }),
      pages: () => featureSwitches(features, () => {}),
      look: () => designEditor(design, (d) => applyDesign(d, { keep: false })),
      summary,
    }[name]();
    const next = el('button', {
      class: 'btn btn-primary', type: 'button', text: step === STEPS.length - 1 ? t('start.create') : t('start.next'),
      onclick: () => {
        const p = problem();
        if (p) { error.textContent = p; return; }
        if (step === STEPS.length - 1) { create(error); return; }
        step += 1;
        render();
      },
    });
    const back = el('button', { class: 'btn', type: 'button', text: t(step === 0 ? 'common.cancel' : 'start.back'), onclick: () => {
      if (step === 0) { leave(); return; }
      step -= 1;
      render();
    } });
    screen.replaceChildren(el('div', { class: 'start-panel wizard' }, [
      el('p', { class: 'muted small', text: t('start.stepOf', { n: step + 1, total: STEPS.length }) }),
      el('ol', { class: 'step-dots', 'aria-hidden': 'true' }, STEPS.map((s, i) => el('li', { class: i <= step ? 'done' : '' }))),
      el('h1', { text: t(`start.step.${name}`) }),
      el('p', { class: 'muted', text: t(`start.step.${name}.hint`) }),
      body,
      error,
      el('div', { class: 'wizard-buttons' }, [back, next]),
    ]));
    screen.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  render();
}
