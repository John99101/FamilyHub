// Layout of the family tree: who stands in which row (generation), partners
// side by side, children under their parents, and the connecting lines.
// No page code here, so it can be tested in Node (tests/tree-layout.test.js).

export const NODE_W = 136;
export const NODE_H = 64;
export const GAP_X = 28;        // between families in a row
export const PARTNER_GAP = 16;  // between partners
export const GAP_Y = 84;        // between generations

/**
 * @param {Array<{ id, name, birthYear?, parents?: string[], partners?: string[] }>} people
 * @returns {{ nodes: Array<{id, x, y, gen}>, couples: Array<{x1, x2, y}>,
 *   families: Array<{ fromX, fromY, busY, children: Array<{x, y}> }>, width, height }}
 */
export function layoutTree(people) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const parentsOf = (id) => [...new Set((byId.get(id)?.parents || []).filter((x) => x !== id && byId.has(x)))];

  // Partner links in both directions.
  const partners = new Map(people.map((p) => [p.id, new Set()]));
  for (const p of people) {
    for (const q of p.partners || []) {
      if (q === p.id || !byId.has(q)) continue;
      partners.get(p.id).add(q);
      partners.get(q).add(p.id);
    }
  }

  // Generations: one below the lowest parent; partners in the same row.
  const gen = new Map();
  const genOf = (id, path = new Set()) => {
    if (gen.has(id)) return gen.get(id);
    if (path.has(id)) return 0; // a loop in the data: stop here
    path.add(id);
    const ps = parentsOf(id);
    const value = ps.length ? Math.max(...ps.map((x) => genOf(x, path))) + 1 : 0;
    path.delete(id);
    gen.set(id, value);
    return value;
  };
  for (const p of people) genOf(p.id);
  for (let round = 0; round < people.length + 2; round += 1) {
    let changed = false;
    for (const [a, set] of partners) {
      for (const b of set) {
        if (gen.get(a) < gen.get(b)) { gen.set(a, gen.get(b)); changed = true; }
      }
    }
    for (const p of people) {
      const ps = parentsOf(p.id);
      if (!ps.length) continue;
      const need = Math.max(...ps.map((x) => gen.get(x))) + 1;
      if (gen.get(p.id) < need && need <= people.length) { gen.set(p.id, need); changed = true; }
    }
    if (!changed) break;
  }

  // Units: partners in the same row stand together (the one with most partners in the middle).
  const byAge = (a, b) => (byId.get(a).birthYear ?? 9999) - (byId.get(b).birthYear ?? 9999)
    || String(byId.get(a).name).localeCompare(String(byId.get(b).name));
  const rows = new Map();
  const seen = new Set();
  for (const p of [...people].sort((a, b) => byAge(a.id, b.id))) {
    if (seen.has(p.id)) continue;
    const g = gen.get(p.id);
    const group = [];
    const stack = [p.id];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id) || gen.get(id) !== g) continue;
      seen.add(id);
      group.push(id);
      for (const q of partners.get(id)) stack.push(q);
    }
    const hub = [...group].sort((a, b) => partners.get(b).size - partners.get(a).size || byAge(a, b))[0];
    const others = group.filter((x) => x !== hub).sort(byAge);
    const left = others.filter((_, i) => i % 2 === 1).reverse();
    const right = others.filter((_, i) => i % 2 === 0);
    const members = [...left, hub, ...right];
    if (!rows.has(g)) rows.set(g, []);
    rows.get(g).push({ members });
  }

  // Place rows from the top: each family near the middle of its parents, never overlapping.
  const pos = new Map();
  const unitWidth = (u) => u.members.length * NODE_W + (u.members.length - 1) * PARTNER_GAP;
  const center = (id) => pos.get(id).x + NODE_W / 2;
  let width = 0;
  for (const g of [...rows.keys()].sort((a, b) => a - b)) {
    const units = rows.get(g);
    for (const u of units) {
      const parentCenters = u.members.flatMap((id) => parentsOf(id)).filter((id) => pos.has(id)).map(center);
      u.want = parentCenters.length ? parentCenters.reduce((s, x) => s + x, 0) / parentCenters.length : null;
      u.age = Math.min(...u.members.map((id) => byId.get(id).birthYear ?? 9999));
    }
    units.sort((a, b) => {
      if (a.want !== null && b.want !== null && a.want !== b.want) return a.want - b.want;
      if ((a.want === null) !== (b.want === null)) return a.want === null ? 1 : -1;
      return a.age - b.age;
    });
    let cursor = 0;
    for (const u of units) {
      const w = unitWidth(u);
      const x = Math.max(cursor, u.want === null ? cursor : u.want - w / 2);
      u.members.forEach((id, i) => pos.set(id, { x: x + i * (NODE_W + PARTNER_GAP), y: g * (NODE_H + GAP_Y) }));
      cursor = x + w + GAP_X;
    }
    width = Math.max(width, cursor - GAP_X);
  }

  // Lines between partners standing next to each other.
  const couples = [];
  for (const units of rows.values()) {
    for (const u of units) {
      for (let i = 0; i + 1 < u.members.length; i += 1) {
        const a = u.members[i];
        const b = u.members[i + 1];
        if (!partners.get(a).has(b)) continue;
        couples.push({ x1: pos.get(a).x + NODE_W, x2: pos.get(b).x, y: pos.get(a).y + NODE_H / 2 });
      }
    }
  }

  // Lines from parents down to their children (children with the same parents share a line).
  const groups = new Map();
  for (const p of people) {
    const ps = parentsOf(p.id).filter((id) => pos.has(id));
    if (!ps.length) continue;
    const key = [...ps].sort().join('+');
    if (!groups.has(key)) groups.set(key, { parents: ps, children: [] });
    groups.get(key).children.push(p.id);
  }
  const families = [];
  for (const { parents, children } of groups.values()) {
    const xs = parents.map(center);
    const fromX = xs.reduce((s, x) => s + x, 0) / xs.length;
    const together = parents.length === 2 && partners.get(parents[0]).has(parents[1])
      && pos.get(parents[0]).y === pos.get(parents[1]).y;
    const parentY = Math.max(...parents.map((id) => pos.get(id).y));
    const fromY = together ? parentY + NODE_H / 2 : parentY + NODE_H;
    const kids = children.map((id) => ({ x: center(id), y: pos.get(id).y }));
    const busY = Math.min(...kids.map((k) => k.y)) - GAP_Y / 2;
    families.push({ fromX, fromY, busY, children: kids });
  }

  const nodes = people.map((p) => ({ id: p.id, ...pos.get(p.id), gen: gen.get(p.id) }));
  const height = nodes.length ? Math.max(...nodes.map((n) => n.y)) + NODE_H : 0;
  return { nodes, couples, families, width, height };
}
