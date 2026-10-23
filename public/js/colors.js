// The 16 person colors (same list as palette() in firestore.rules). Each
// color can be held by one person only; people without a color are grey.
export const PALETTE = [
  { id: 'red', hex: '#e5484d' },
  { id: 'orange', hex: '#f76b15' },
  { id: 'amber', hex: '#f5a524' },
  { id: 'gold', hex: '#c9a227' },
  { id: 'lime', hex: '#7cb518' },
  { id: 'green', hex: '#2f9e44' },
  { id: 'teal', hex: '#0f9d8a' },
  { id: 'cyan', hex: '#0aa2c0' },
  { id: 'sky', hex: '#3b9eff' },
  { id: 'blue', hex: '#2563eb' },
  { id: 'indigo', hex: '#4f46e5' },
  { id: 'violet', hex: '#7c3aed' },
  { id: 'purple', hex: '#a21caf' },
  { id: 'pink', hex: '#db2777' },
  { id: 'brown', hex: '#8d5a3b' },
  { id: 'slate', hex: '#64748b' },
];

export const NEUTRAL = '#8a94a0';
export const COLOR_IDS = PALETTE.map((c) => c.id);

export function hexOf(id) {
  return PALETTE.find((c) => c.id === id)?.hex || NEUTRAL;
}

/**
 * What to do so this person holds exactly one color and no color is stuck.
 * colors: color → uid of the lock holder; people: [{ id, color }].
 * @returns {{ take: string|null, repair: string|null, release: string[], orphans: string[] }}
 *   take:    a free color to take (this person has none yet)
 *   repair:  a color this person already holds but their profile lost: write it back
 *   release: other colors this person holds: give them back
 *   orphans: colors held by someone whose profile shows another color: stuck, free them
 */
export function planColorWork({ uid, people, colors }) {
  const me = people.find((p) => p.id === uid) || null;
  const held = COLOR_IDS.filter((c) => colors[c] === uid);
  const plan = { take: null, repair: null, release: [], orphans: [] };
  const current = me && me.color && colors[me.color] === uid ? me.color : null;
  if (current) {
    plan.release = held.filter((c) => c !== current);
  } else if (held.length) {
    plan.repair = held[0];
    plan.release = held.slice(1);
  } else {
    plan.take = COLOR_IDS.find((c) => !colors[c]) || null;
  }
  for (const [c, owner] of Object.entries(colors)) {
    if (owner === uid) continue;
    const p = people.find((x) => x.id === owner);
    if (!p || p.color !== c) plan.orphans.push(c);
  }
  return plan;
}

/** Puts a person color on an element as the CSS variable --pc (used for dots, bars, names). */
export function paint(node, hex) {
  node.style.setProperty('--pc', hex || NEUTRAL);
  return node;
}
