// Fills the LOCAL Firestore emulator with made up family data (calendar,
// tasks, polls, recipes, contacts, places, chat rooms, a weekly overview
// written by a fake Claude). Nothing real is called.
//
//   1. npm run emulators          (in the project folder, keep it running)
//   2. npm run demo:family        (second window)
//   3. Sign in on http://127.0.0.1:5000 with "Add new account", mail chef@example.com
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createFirestoreStore } from '../firestore-store.js';
import { runAllDigests, addDays } from '../digest.js';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
const PROJECT = 'demo-familyhub';
if (!PROJECT.startsWith('demo-')) throw new Error('Only for the local demo project.');

initializeApp({ projectId: PROJECT });
const db = getFirestore();

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const day = (n) => addDays(today, n);
const ago = (minutes) => Timestamp.fromMillis(Date.now() - minutes * 60000);
const by = (uid, name) => ({ createdBy: uid, createdByName: name, createdAt: ago(600) });
const ANNA = ['demo_anna', 'Anna Beispiel'];
const BEN = ['demo_ben', 'Ben Beispiel'];

await db.doc('config/access').set({ admins: ['chef@example.com'], members: ['anna@example.com', 'ben@example.com'] });
await db.doc('people/demo_anna').set({ name: 'Anna Beispiel', mail: 'anna@example.com', photo: '', color: 'pink', updatedAt: ago(1) });
await db.doc('people/demo_ben').set({ name: 'Ben Beispiel', mail: 'ben@example.com', photo: '', color: 'sky', updatedAt: ago(1) });
await db.doc('colors/pink').set({ uid: 'demo_anna' });
await db.doc('colors/sky').set({ uid: 'demo_ben' });

// ---------- households (chef@example.com is in "Zürich", not in "Bei Oma") ----------
await db.doc('households/h_zh').set({ name: 'Zürich', members: ['chef@example.com', 'anna@example.com'], updatedAt: ago(100), updatedBy: 'chef@example.com' });
await db.doc('households/h_oma').set({ name: 'Bei Oma', members: ['ben@example.com'], updatedAt: ago(100), updatedBy: 'chef@example.com' });
await db.doc('households/h_zh/rooms/main').set({ name: 'Zürich', createdAt: ago(100), last: { uid: 'demo_anna', name: 'Anna Beispiel', text: 'Wer kauft Brot?', at: ago(15) } });
await db.doc('households/h_zh/rooms/main/messages/z1').set({ uid: 'demo_anna', name: 'Anna Beispiel', photo: '', text: 'Wer kauft Brot?', createdAt: ago(15) });
await db.doc('households/h_oma/events/o1').set({
  title: 'Nur im Haushalt Bei Oma', date: today, endDate: '', time: '', place: '', note: '', kind: 'event', repeat: 'none',
  yearKnown: true, person: 'ben@example.com', createdBy: 'demo_ben', createdByName: 'Ben Beispiel', createdAt: ago(100), updatedAt: ago(100),
});

// ---------- chat ----------
const msg = (uid, name, text, minutes, extra = {}) => ({ uid, name, photo: '', text, createdAt: ago(minutes), ...extra });
await db.doc('rooms/familie').set({ name: 'Familie', createdAt: ago(5000), last: { uid: 'demo_ben', name: 'Ben Beispiel', text: 'Ich bringe den Kuchen mit!', at: ago(3) } });
await db.doc('rooms/familie/messages/d1').set(msg(...ANNA, 'Wer kommt am Samstag zu Oma?', 40, { reactions: { like: ['demo_ben'] } }));
await db.doc('rooms/familie/messages/d2').set(msg(...BEN, 'Ich bringe den Kuchen mit!', 3, {
  replyTo: { id: 'd1', name: 'Anna Beispiel', text: 'Wer kommt am Samstag zu Oma?' }, reactions: { love: ['demo_anna'], laugh: ['demo_anna'] },
}));
await db.doc('rooms/urlaub').set({ name: 'Urlaub 2027', open: true, members: [], ...by(...BEN), last: { uid: 'demo_ben', name: 'Ben Beispiel', text: 'Bretagne oder Allgäu?', at: ago(90) } });
await db.doc('rooms/urlaub/messages/u1').set(msg(...BEN, 'Bretagne oder Allgäu?', 90));
await db.doc('rooms/eltern').set({ name: 'Geschenk für Ben', open: false, members: ['chef@example.com', 'anna@example.com'], ...by(...ANNA), last: { uid: 'demo_anna', name: 'Anna Beispiel', text: 'Fahrrad?', at: ago(200) } });
await db.doc('rooms/eltern/messages/e1').set(msg(...ANNA, 'Fahrrad?', 200));
await db.doc('rooms/nur-ben').set({ name: 'Nur Ben und Anna', open: false, members: ['ben@example.com', 'anna@example.com'], ...by(...BEN) });

// ---------- calendar ----------
const event = (id, fields) => db.doc(`events/${id}`).set({
  endDate: '', time: '', place: '', note: '', kind: 'event', repeat: 'none', yearKnown: true, ...by(...ANNA), updatedAt: ago(5), ...fields,
});
await event('ev1', { title: 'Zahnarzt Tim', date: today, time: '09:30', place: 'Praxis Dr. Müller', person: 'ben@example.com' });
await event('ev2', { title: 'Elternabend', date: day(1), time: '19:00', place: 'Schule' });
await event('ev3', { title: 'Besuch bei Oma', date: day(3), endDate: day(5), note: 'Kuchen nicht vergessen', person: 'anna@example.com' });
await event('ev9', { title: 'Ben im Zeltlager', date: day(4), endDate: day(9), person: 'ben@example.com' });
await event('ev10', { title: 'Messe', date: day(-2), endDate: day(1), person: '' });
const hEvent = (id, fields) => db.doc(`households/h_zh/events/${id}`).set({
  endDate: '', time: '', place: '', note: '', kind: 'event', repeat: 'none', yearKnown: true, person: '', ...by(...ANNA), updatedAt: ago(5), ...fields,
});
await hEvent('z1', { title: 'Elternabend Zürich', date: day(2), time: '19:00', person: 'anna@example.com' });
await hEvent('z2', { title: 'Skiferien', date: day(8), endDate: day(13), person: 'chef@example.com' });
await db.doc('households/h_zh/tasks/zt1').set({
  title: 'Brot kaufen', note: '', assignee: 'anna@example.com', due: day(0), done: false, doneAt: null, doneBy: '', ...by(...ANNA), updatedAt: ago(5),
});
await db.doc('households/h_zh/polls/zp1').set({
  question: 'Raclette oder Fondue?', options: ['Raclette', 'Fondue'], multi: false, closed: false, votes: { demo_anna: [1] }, ...by(...ANNA),
});
await event('ev4', { title: 'Oma', kind: 'birthday', repeat: 'yearly', date: `1946-${day(2).slice(5)}` });
await event('ev5', { title: 'Ben', kind: 'birthday', repeat: 'yearly', date: `2014-${day(12).slice(5)}`, ...by(...BEN) });
await event('ev6', { title: 'Onkel Paul', kind: 'birthday', repeat: 'yearly', date: `2000-${day(20).slice(5)}`, yearKnown: false });
await event('ev7', { title: 'Hochzeitstag', repeat: 'yearly', date: `2001-${day(4).slice(5)}` });
await event('ev8', { title: 'Fußballturnier', date: day(-3), time: '10:00' });

// ---------- tasks ----------
const task = (id, fields) => db.doc(`tasks/${id}`).set({
  note: '', assignee: '', due: '', done: false, doneAt: null, doneBy: '', ...by(...ANNA), updatedAt: ago(5), ...fields,
});
await task('t1', { title: 'Geschenk für Oma kaufen', assignee: 'chef@example.com', due: day(1) });
await task('t2', { title: 'Steuererklärung abgeben', due: day(-2), note: 'Belege liegen im Ordner' });
await task('t3', { title: 'Rasen mähen', assignee: 'ben@example.com', due: day(6), ...by(...BEN) });
await task('t4', { title: 'Fahrradschloss reparieren' });
await task('t5', { title: 'Müll rausbringen', done: true, doneAt: ago(30), doneBy: 'Ben Beispiel' });

// ---------- polls ----------
await db.doc('polls/p1').set({
  question: 'Wo essen wir am Sonntag?', options: ['Pizzeria', 'Bei Oma', 'Wir kochen selbst'], multi: false, closed: false,
  votes: { demo_anna: [1], demo_ben: [0] }, ...by(...ANNA),
});
await db.doc('polls/p2').set({
  question: 'Welche Tage passen für den Ausflug?', options: ['Freitag', 'Samstag', 'Sonntag'], multi: true, closed: false,
  votes: { demo_ben: [1, 2] }, ...by(...BEN),
});
await db.doc('polls/p3').set({
  question: 'Neue Farbe für den Flur?', options: ['Weiß', 'Hellgrau'], multi: false, closed: true,
  votes: { demo_anna: [0], demo_ben: [0] }, ...by(...ANNA),
});

// ---------- recipes ----------
await db.doc('recipes/r1').set({
  title: 'Omas Apfelkuchen', category: 'baking', servings: '12 Stück', duration: '90 Minuten',
  ingredients: '500 g Mehl\n250 g Butter\n200 g Zucker\n4 Äpfel\n1 Päckchen Backpulver',
  steps: 'Teig kneten und kalt stellen.\nÄpfel schälen und in Spalten schneiden.\nBei 180 Grad 50 Minuten backen.',
  source: 'Oma Erika', ...by(...ANNA), updatedAt: ago(5),
});
await db.doc('recipes/r2').set({
  title: 'Kartoffelsuppe', category: 'starter', servings: '4 Personen', duration: '40 Minuten',
  ingredients: '1 kg Kartoffeln\n2 Möhren\n1 Lauch\n1 l Brühe', steps: 'Gemüse schneiden, in Brühe weich kochen, pürieren.',
  source: '', ...by(...BEN), updatedAt: ago(5),
});

// ---------- contacts ----------
const contact = (id, fields) => db.doc(`contacts/${id}`).set({
  phone: '', phone2: '', mail: '', address: '', note: '', updatedAt: ago(5), updatedBy: 'chef@example.com', ...fields,
});
await contact('c1', { name: 'Notruf (Feuerwehr und Rettung)', group: 'emergency', phone: '112' });
await contact('c2', { name: 'Dr. Müller (Hausarzt)', group: 'health', phone: '030 1234567', mail: 'praxis@example.com', address: 'Hauptstraße 1\n10115 Berlin', note: 'Sprechzeiten Mo bis Fr 8 bis 12 Uhr' });
await contact('c3', { name: 'Ben', group: 'family', phone: '+49 151 1234567', note: 'Allergie: Haselnüsse' });

// ---------- places ----------
await db.doc('places/pl1').set({ name: 'Berlin', country: 'Deutschland', lat: 52.52, lon: 13.41, ...by(...ANNA) });
await db.doc('places/pl2').set({ name: 'Lyon', country: 'France', lat: 45.75, lon: 4.85, ...by(...BEN) });

// ---------- visible name, notices, notebook, trip, tree, question, call buttons ----------
await db.doc('people/demo_ben').set({ displayName: 'Benni' }, { merge: true });
await db.doc('names/Benni').set({ uid: 'demo_ben' });
await db.doc('notices/n1').set({ text: 'Müllabfuhr ist diese Woche am Dienstag', until: day(4), ...by(...ANNA), updatedAt: ago(5) });
await db.doc('notices/n2').set({ text: 'Der Schlüssel für den Keller hängt jetzt neben der Tür.', until: '', ...by(...BEN), updatedAt: ago(5) });
await db.doc('households/h_zh/notices/zn1').set({ text: 'Zürich: Putzfrau kommt am Freitag', until: day(1), ...by(...ANNA), updatedAt: ago(5) });
const note = (id, title, body, who) => db.doc(`notes/${id}`).set({
  title, body, ...by(...who), updatedAt: ago(30), updatedBy: who[0], updatedByName: who[1],
});
await note('w1', 'Heizung entlüften', 'Entlüftungsschlüssel liegt im Werkzeugkasten.\nVentil oben am Heizkörper langsam öffnen, bis Wasser kommt.', ANNA);
await note('w2', 'WLAN für Gäste', 'Netzwerk: Familie Gast\nDas Passwort steht auf dem Router.', BEN);
await db.doc('trips/t1').set({
  title: 'Sommer in der Bretagne', destination: 'Quiberon', start: day(10), end: day(16),
  people: ['chef@example.com', 'anna@example.com', 'ben@example.com'], note: 'Fahrräder mitnehmen', ...by(...ANNA), updatedAt: ago(5),
});
const item = (id, fields) => db.doc(`trips/t1/items/${id}`).set({ endDate: '', time: '', place: '', note: '', ...by(...ANNA), updatedAt: ago(5), ...fields });
await item('i1', { kind: 'travel', date: day(10), time: '07:40', title: 'Zug Zürich nach Paris', place: 'Zürich HB' });
await item('i2', { kind: 'stay', date: day(10), endDate: day(16), title: 'Ferienhaus Kerlann', place: '12 Rue de la Plage, Quiberon' });
await item('i3', { kind: 'day', date: day(11), title: 'Strandtag', note: 'Sonnencreme!' });
await item('i4', { kind: 'day', date: day(12), time: '10:00', title: 'Fahrradtour zur Pointe du Conguel' });
const person = (id, fields) => db.doc(`tree/${id}`).set({
  birthYear: null, deathYear: null, mail: '', parents: [], partners: [], birthdayId: '', note: '',
  ...by(...ANNA), updatedAt: ago(5), updatedBy: 'demo_anna', ...fields,
});
await person('erika', { name: 'Oma Erika', birthYear: 1946, partners: ['hans'], birthdayId: 'ev4' });
await person('hans', { name: 'Opa Hans', birthYear: 1944, deathYear: 2019 });
await person('anna', { name: 'Anna', birthYear: 1975, parents: ['erika', 'hans'], partners: ['jonas'], mail: 'anna@example.com' });
await person('jonas', { name: 'Jonas', birthYear: 1973, mail: 'chef@example.com' });
await person('paul', { name: 'Onkel Paul', birthYear: 1978, parents: ['erika', 'hans'] });
await person('ben', { name: 'Ben', birthYear: 2014, parents: ['anna', 'jonas'], mail: 'ben@example.com', birthdayId: 'ev5' });
await person('lena', { name: 'Lena', birthYear: 2010, parents: ['anna', 'jonas'] });
await db.doc(`days/${today}/answers/demo_anna`).set({ text: 'Der Spaziergang am Sonntag mit allen.', name: 'Anna Beispiel', createdAt: ago(120), updatedAt: ago(120) });
await db.doc(`days/${today}/answers/demo_ben`).set({ text: 'Mein Tor beim Fußball!', name: 'Ben Beispiel', createdAt: ago(60), updatedAt: ago(60) });
await db.doc('contacts/c1').set({ quick: true }, { merge: true });
await db.doc('contacts/c3').set({ quick: true }, { merge: true });

// ---------- weekly overview from a fake Claude ----------
await db.doc('digest/current').delete();
const fakeClaude = {
  beta: { messages: { create: async () => ({
    model: 'demo (no real AI call)', stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    content: [{ type: 'text', text: JSON.stringify({
      de: 'DEMOTEXT, nicht von einer KI. Diese Woche wird Oma 80, und am Wochenende besucht ihr sie. Tim hat einen Termin beim Zahnarzt, und für den Ausflug läuft noch eine Umfrage.',
      en: 'DEMO TEXT, not written by an AI. This week Grandma turns 80, and at the weekend you visit her. Tim has a dentist appointment, and a poll about the trip is still open.',
      fr: 'TEXTE DE DÉMONSTRATION, non rédigé par une IA. Cette semaine, Mamie fête ses 80 ans, et vous lui rendez visite. Tim a rendez vous chez le dentiste, et un sondage sur la sortie est encore ouvert.',
    }) }],
  }) } },
};
// The overview is about the 7 days after the run, so it is "run" yesterday evening.
await db.doc('households/h_zh/digest/current').delete();
const result = await runAllDigests({ anthropic: fakeClaude, store: createFirestoreStore(db), now: new Date(Date.now() - 24 * 3600 * 1000), logger: { info: () => {}, warn: console.warn } });
console.log('Demo family data written. Weekly overviews:', result.results.map((r) => `${r.base || 'family'} ${r.kind}`).join(', '));
process.exit(0);
