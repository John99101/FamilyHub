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

/** Puts a person color on an element as the CSS variable --pc (used for dots, bars, names). */
export function paint(node, hex) {
  node.style.setProperty('--pc', hex || NEUTRAL);
  return node;
}
