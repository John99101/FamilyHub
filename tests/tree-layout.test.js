// Tests for the family tree layout (public/js/tree-layout.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutTree, NODE_W } from '../public/js/tree-layout.js';

const p = (id, extra = {}) => ({ id, name: id, birthYear: null, parents: [], partners: [], ...extra });

function noOverlap(nodes) {
  const rows = new Map();
  for (const n of nodes) {
    if (!rows.has(n.y)) rows.set(n.y, []);
    rows.get(n.y).push(n);
  }
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i += 1) assert.ok(row[i].x >= row[i - 1].x + NODE_W, `overlap between ${row[i - 1].id} and ${row[i].id}`);
  }
}

describe('family tree layout', () => {
  const family = [
    p('oma', { birthYear: 1946, partners: ['opa'] }),
    p('opa', { birthYear: 1944 }),
    p('anna', { birthYear: 1975, parents: ['oma', 'opa'], partners: ['jonas'] }),
    p('jonas', { birthYear: 1973 }),
    p('paul', { birthYear: 1978, parents: ['oma', 'opa'] }),
    p('lena', { birthYear: 2005, parents: ['anna', 'jonas'] }),
    p('tim', { birthYear: 2008, parents: ['anna', 'jonas'] }),
  ];

  it('puts each generation in its own row, partners in the row of their partner', () => {
    const { nodes } = layoutTree(family);
    const gen = Object.fromEntries(nodes.map((n) => [n.id, n.gen]));
    assert.deepEqual(gen, { oma: 0, opa: 0, anna: 1, jonas: 1, paul: 1, lena: 2, tim: 2 });
  });

  it('places partners next to each other and nobody on top of anybody', () => {
    const { nodes, couples } = layoutTree(family);
    noOverlap(nodes);
    const x = Object.fromEntries(nodes.map((n) => [n.id, n.x]));
    assert.equal(Math.abs(x.oma - x.opa), NODE_W + 16);
    assert.equal(Math.abs(x.anna - x.jonas), NODE_W + 16);
    assert.equal(couples.length, 2);
  });

  it('draws one line per set of parents down to all their children', () => {
    const { families, nodes } = layoutTree(family);
    assert.equal(families.length, 2);
    const kids = families.map((f) => f.children.length).sort();
    assert.deepEqual(kids, [2, 2]);
    const y = Object.fromEntries(nodes.map((n) => [n.id, n.y]));
    for (const f of families) for (const c of f.children) assert.ok(f.busY > f.fromY && f.busY < c.y);
    assert.ok(y.lena > y.anna && y.anna > y.oma);
  });

  it('children stand roughly under their parents', () => {
    const { nodes } = layoutTree(family);
    const cx = Object.fromEntries(nodes.map((n) => [n.id, n.x + NODE_W / 2]));
    const parents = (cx.anna + cx.jonas) / 2;
    const kids = (cx.lena + cx.tim) / 2;
    assert.ok(Math.abs(parents - kids) < NODE_W, `kids at ${kids}, parents at ${parents}`);
  });

  it('copes with loops and links to people who are not in the tree', () => {
    const { nodes } = layoutTree([p('a', { parents: ['b'] }), p('b', { parents: ['a'] }), p('c', { parents: ['missing'], partners: ['c', 'gone'] })]);
    assert.equal(nodes.length, 3);
    noOverlap(nodes);
  });

  it('an empty tree has no size', () => {
    assert.deepEqual(layoutTree([]), { nodes: [], couples: [], families: [], width: 0, height: 0 });
  });
});
