// Question of the day: the same question for everyone, each in their own
// language. The others' answers only become readable (the security rules
// enforce it) once you answered yourself. Earlier days on request.
import { db, collection, doc, onSnapshot, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from './firebase.js';
import { $, el, toast, card, emptyNote, formatWeekdayDay } from './ui.js';
import { t, lang } from './i18n.js';
import { todayIso, addDays } from './dates.js';
import { myName, toDate } from './family-data.js';
import { paint } from './colors.js';
import { questionFor, dayQuestionKey } from './questions.js';

const ANSWER_MAX = 500;
const EARLIER_DAYS = 7;

export function createQuestionPage(data) {
  const root = $('question-content');
  const session = data.session;
  const uid = session.user.uid;
  let today = todayIso();
  let answers = [];
  let stopAnswers = null;
  let editing = false;
  let earlier = null; // [{ day, mine, answers }] once loaded

  // Built once, so live updates never wipe what someone is typing.
  const input = el('textarea', { rows: 3, maxlength: ANSWER_MAX, 'aria-label': t('question.yourAnswer'), placeholder: t('question.placeholder') });
  const error = el('p', { class: 'form-error', role: 'alert' });
  const form = el('form', { class: 'answer-form', novalidate: true }, [
    input,
    el('button', { class: 'btn btn-primary', type: 'submit', text: t('question.send') }),
  ]);
  form.addEventListener('submit', (event) => { event.preventDefault(); save(); });

  async function save() {
    const text = input.value.trim();
    error.textContent = '';
    if (!text) { error.textContent = t('question.empty'); return; }
    const ref = doc(db, 'days', dayQuestionKey(today), 'answers', uid);
    try {
      if (data.state.myAnswer) await updateDoc(ref, { text, name: myName(session), updatedAt: serverTimestamp() });
      else await setDoc(ref, { text, name: myName(session), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      editing = false;
      input.value = '';
      toast(t('common.saved'));
    } catch (err) {
      console.warn('Saving the answer failed', err.code);
      error.textContent = t('common.saveFailed');
    }
  }

  // The others' answers: only after answering (before, the rules refuse).
  function syncAnswers() {
    const answered = !!data.state.myAnswer;
    if (answered && !stopAnswers) {
      stopAnswers = onSnapshot(collection(db, 'days', dayQuestionKey(today), 'answers'), (snap) => {
        answers = snap.docs.map((d) => ({ uid: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        render();
      }, (err) => console.warn('Reading the answers failed', err.code));
    }
    if (!answered && stopAnswers) { stopAnswers(); stopAnswers = null; answers = []; }
  }

  function answerItem(a) {
    const mine = a.uid === uid;
    return el('li', { class: 'answer' }, [
      el('span', { class: 'answer-head' }, [
        paint(el('span', { class: 'person-dot' }), data.colorForUid(a.uid)),
        el('span', { class: 'answer-name', text: mine ? t('home.you') : data.nameForUid(a.uid, a.name) || '?' }),
      ]),
      el('span', { class: 'pre', text: a.text }),
    ]);
  }

  async function loadEarlier() {
    earlier = [];
    render();
    for (let i = 1; i <= EARLIER_DAYS; i += 1) {
      const day = addDays(today, -i);
      try {
        const mine = await getDoc(doc(db, 'days', dayQuestionKey(day), 'answers', uid));
        const list = mine.exists() ? (await getDocs(collection(db, 'days', dayQuestionKey(day), 'answers'))).docs.map((d) => ({ uid: d.id, ...d.data() })) : [];
        earlier.push({ day, mine: mine.exists(), answers: list });
      } catch (err) {
        console.warn('Reading earlier answers failed', err.code);
      }
      render();
    }
  }

  function render() {
    const mine = data.state.myAnswer;
    const question = questionFor(today, lang);
    const parts = [];
    const children = [el('p', { class: 'question-text', text: question })];
    if (!mine || editing) {
      children.push(el('p', { class: 'muted small', text: mine ? t('question.change') : t('question.hidden') }), form, error);
    } else {
      const others = answers.filter((a) => a.uid !== uid)
        .sort((a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0));
      children.push(
        el('ul', { class: 'answer-list' }, [answerItem({ ...mine, uid }), ...others.map(answerItem)]),
        others.length ? null : emptyNote(t('question.noneYet')),
        el('button', { class: 'btn-link', type: 'button', text: t('question.edit'), onclick: () => { editing = true; input.value = mine.text; render(); input.focus(); } }),
      );
    }
    parts.push(card(t('question.today', { date: formatWeekdayDay(today) }), children, { className: 'card-question' }));

    if (!earlier) {
      parts.push(el('button', { class: 'btn btn-small more-btn', type: 'button', text: t('question.earlier'), onclick: loadEarlier }));
    } else {
      parts.push(card(t('question.earlierTitle'), earlier.length ? earlier.map((e) => el('div', { class: 'earlier-day' }, [
        el('h3', { class: 'home-day-title', text: formatWeekdayDay(e.day) }),
        el('p', { class: 'question-small', text: questionFor(e.day, lang) }),
        e.mine
          ? el('ul', { class: 'answer-list' }, e.answers.map(answerItem))
          : el('p', { class: 'muted small', text: t('question.notAnswered') }),
      ])) : emptyNote(t('common.loading'))));
    }
    root.replaceChildren(...parts);
  }

  let visible = false;
  const stop = data.subscribe(() => { syncAnswers(); if (visible) render(); });
  return {
    onShow() {
      visible = true;
      if (todayIso() !== today) { today = todayIso(); earlier = null; if (stopAnswers) { stopAnswers(); stopAnswers = null; } }
      syncAnswers();
      render();
    },
    onHide() { visible = false; },
    stop() { stop(); if (stopAnswers) stopAnswers(); root.replaceChildren(); },
  };
}
