// Question of the day: everyone gets the same question on the same day, each
// in their own language. The answers live in days/{YYYY-MM-DD}/answers/{uid}.
// Rules for the text: no hyphens or dashes; French with a no break space
// ( ) before "?". No page code here, so it can be tested in Node.

export const QUESTIONS = [
  { de: 'Was war das Schönste an deiner Woche?', en: 'What was the best part of your week?', fr: 'Quel a été le meilleur moment de ta semaine ?' },
  { de: 'Worüber hast du heute gelacht?', en: 'What made you laugh today?', fr: 'Qui ou quoi t’a fait rire aujourd’hui ?' },
  { de: 'Welches Essen könntest du jeden Tag essen?', en: 'Which food could you eat every day?', fr: 'Quel plat tu pourrais manger tous les jours ?' },
  { de: 'Wohin würdest du gern einmal reisen?', en: 'Where would you love to travel one day?', fr: 'Où tu aimerais voyager un jour ?' },
  { de: 'Was ist deine schönste Kindheitserinnerung?', en: 'What is your favourite childhood memory?', fr: 'Quel est ton plus beau souvenir d’enfance ?' },
  { de: 'Wofür bist du heute dankbar?', en: 'What are you grateful for today?', fr: 'Une chose pour laquelle tu es reconnaissant aujourd’hui ?' },
  { de: 'Welches Buch, welchen Film oder welche Serie empfiehlst du gerade?', en: 'Which book, film or series would you recommend right now?', fr: 'Quel livre, film ou série tu recommandes en ce moment ?' },
  { de: 'Was hast du diese Woche Neues gelernt?', en: 'What did you learn this week?', fr: 'Tu as appris quoi de nouveau cette semaine ?' },
  { de: 'Welches Lied hörst du gerade am liebsten?', en: 'Which song do you like most at the moment?', fr: 'Quelle chanson tu préfères en ce moment ?' },
  { de: 'Was würdest du mit einem freien Tag machen?', en: 'What would you do with a free day?', fr: 'Tu ferais quoi d’une journée libre ?' },
  { de: 'Welche Familientradition magst du am meisten?', en: 'Which family tradition do you like most?', fr: 'Quelle tradition familiale tu aimes le plus ?' },
  { de: 'Was war dein bester Urlaub?', en: 'What was your best holiday?', fr: 'Quelles ont été tes meilleures vacances ?' },
  { de: 'Welches Tier wärst du gern für einen Tag?', en: 'Which animal would you like to be for a day?', fr: 'Quel animal tu aimerais être pendant une journée ?' },
  { de: 'Was möchtest du dieses Jahr noch erleben?', en: 'What would you still like to do this year?', fr: 'Tu voudrais encore vivre quoi cette année ?' },
  { de: 'Wer hat dir diese Woche geholfen?', en: 'Who helped you this week?', fr: 'Qui t’a aidé cette semaine ?' },
  { de: 'Was ist dein Lieblingsort zu Hause?', en: 'What is your favourite spot at home?', fr: 'Quel est ton endroit préféré à la maison ?' },
  { de: 'Welches Spiel spielst du am liebsten?', en: 'Which game do you like to play most?', fr: 'À quel jeu tu préfères jouer ?' },
  { de: 'Was war das leckerste Essen der letzten Zeit?', en: 'What was the tastiest meal you had lately?', fr: 'Quel a été le repas le plus délicieux de ces derniers temps ?' },
  { de: 'Welche Superkraft hättest du gern?', en: 'Which superpower would you like to have?', fr: 'Quel super pouvoir tu aimerais avoir ?' },
  { de: 'Worauf freust du dich gerade?', en: 'What are you looking forward to?', fr: 'Tu attends quoi avec impatience en ce moment ?' },
  { de: 'Was hat dich diese Woche überrascht?', en: 'What surprised you this week?', fr: 'Quelle chose t’a surpris cette semaine ?' },
  { de: 'Welches Hobby würdest du gern ausprobieren?', en: 'Which hobby would you like to try?', fr: 'Quel loisir tu aimerais essayer ?' },
  { de: 'Was ist dein Lieblingswetter?', en: 'What is your favourite weather?', fr: 'Quel est ton temps préféré ?' },
  { de: 'Was machst du, wenn du schlechte Laune hast?', en: 'What do you do when you are in a bad mood?', fr: 'Tu fais quoi quand tu es de mauvaise humeur ?' },
  { de: 'Welche Jahreszeit magst du am liebsten und warum?', en: 'Which season do you like best, and why?', fr: 'Quelle saison tu préfères, et pourquoi ?' },
  { de: 'Was war dein erster Berufswunsch?', en: 'What did you first want to be when you grew up?', fr: 'Quel était ton premier rêve de métier ?' },
  { de: 'Welche Person aus der Familie würdest du gern öfter sehen?', en: 'Who in the family would you like to see more often?', fr: 'Qui dans la famille tu aimerais voir plus souvent ?' },
  { de: 'Was ist das Beste an deinem Wohnort?', en: 'What is the best thing about where you live?', fr: 'Le meilleur côté de l’endroit où tu habites ?' },
  { de: 'Welches Geräusch magst du?', en: 'Which sound do you love?', fr: 'Quel bruit tu aimes bien ?' },
  { de: 'Was war heute schwierig, und was hat geholfen?', en: 'What was hard today, and what helped?', fr: 'Ce qui a été difficile aujourd’hui, et ce qui a aidé ?' },
  { de: 'Welches Foto auf deinem Handy magst du gerade am meisten?', en: 'Which photo on your phone do you like most right now?', fr: 'Quelle photo de ton téléphone tu préfères en ce moment ?' },
  { de: 'Was würdest du kochen, wenn die ganze Familie kommt?', en: 'What would you cook if the whole family came over?', fr: 'Tu cuisinerais quoi si toute la famille venait ?' },
  { de: 'Welchen Rat hat dir jemand gegeben, der dir geblieben ist?', en: 'What advice has stayed with you?', fr: 'Quel conseil t’est resté ?' },
  { de: 'Was ist dein liebstes Wort in einer anderen Sprache?', en: 'What is your favourite word in another language?', fr: 'Quel est ton mot préféré dans une autre langue ?' },
  { de: 'Wann hast du dich zuletzt richtig erholt?', en: 'When did you last feel really rested?', fr: 'La dernière fois que tu t’es vraiment reposé, c’était quand ?' },
  { de: 'Was möchtest du der Familie heute sagen?', en: 'What would you like to tell the family today?', fr: 'Tu voudrais dire quoi à la famille aujourd’hui ?' },
  { de: 'Welcher Ausflug in der Nähe lohnt sich?', en: 'Which nearby outing is worth it?', fr: 'Quelle sortie près de chez toi vaut le détour ?' },
  { de: 'Was sammelst du, oder was hast du früher gesammelt?', en: 'What do you collect, or what did you collect as a child?', fr: 'Tu collectionnes quoi, ou tu collectionnais quoi autrefois ?' },
  { de: 'Welche kleine Sache macht dich glücklich?', en: 'Which small thing makes you happy?', fr: 'Quelle petite chose te rend heureux ?' },
  { de: 'Was war das Mutigste, das du je getan hast?', en: 'What is the bravest thing you have ever done?', fr: 'Quelle est la chose la plus courageuse que tu aies faite ?' },
];

/** The answers of a day are stored under the plain day 'YYYY-MM-DD'. */
export const dayQuestionKey = (iso) => iso;

/** Which question belongs to a day (the same for everyone, going round the list). */
export function questionIndex(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return ((days % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length;
}

export function questionFor(iso, lang) {
  const q = QUESTIONS[questionIndex(iso)];
  return q[lang] || q.de;
}
