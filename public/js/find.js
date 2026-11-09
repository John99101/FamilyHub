// Finding pages by name: case and accents do not matter ("borse" finds "Börse").
// No DOM here, so it can be tested.

export const searchKey = (text) => String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** True when every word of the query appears in one of the texts. */
export function matchesQuery(texts, query) {
  const words = searchKey(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = texts.map(searchKey).join(' ');
  return words.every((w) => hay.includes(w));
}

/** Keeps only known pages, without doubles, in the order given. */
export function cleanPins(list, known) {
  return Array.isArray(list) ? [...new Set(list.filter((x) => known.includes(x)))] : [];
}
