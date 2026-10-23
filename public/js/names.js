// Visible names: the name each person chooses for everyone to see (instead
// of the Google name). Same checks as validDisplayName in firestore.rules;
// names/{name} documents make a name impossible to use twice.
// No page code here, so it can be tested in Node (tests/names.test.js).

export const NAME_MAX = 40;

/** Visible name of a person: the chosen one, else the Google name, else the part before @. */
export function visibleName(p) {
  if (!p) return '';
  return p.displayName || p.name || (p.mail ? p.mail.split('@')[0] : '');
}

/**
 * Checks a new visible name. Returns '' when fine, else a reason:
 * 'empty', 'long', 'chars' (/, | or a leading dot), 'taken' (someone else uses it).
 */
export function checkDisplayName(raw, { uid, people = [], names = {} }) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!name) return 'empty';
  if (name.length > NAME_MAX) return 'long';
  if (/[/|]/.test(name) || name.startsWith('.')) return 'chars';
  if (names[name] && names[name] !== uid) return 'taken';
  const lower = name.toLowerCase();
  if (people.some((p) => p.id !== uid && visibleName(p).toLowerCase() === lower)) return 'taken';
  return '';
}

/** The cleaned name that would be saved. */
export const cleanDisplayName = (raw) => String(raw || '').replace(/\s+/g, ' ').trim();

/**
 * Name locks to give back or free: this person's locks other than their
 * current name, and locks of others whose profile shows another name.
 * @returns {{ release: string[], orphans: string[] }}
 */
export function planNameWork({ uid, people, names }) {
  const me = people.find((p) => p.id === uid) || null;
  const plan = { release: [], orphans: [] };
  for (const [name, holder] of Object.entries(names)) {
    if (holder === uid) {
      if (!me || me.displayName !== name) plan.release.push(name);
      continue;
    }
    const p = people.find((x) => x.id === holder);
    if (!p || p.displayName !== name) plan.orphans.push(name);
  }
  return plan;
}
