// Journal decision 124: the canonical, id-free diff of two shells. Multisets of face kind and area, and of edge kind with
// snapped endpoints, matched within tolerance.
import {beforeAll, describe, expect, it} from 'vitest';
import {fixtureByName} from '../src/fixture.ts';
import {BuildingShell, buildShell} from '../src/shell.ts';
import {
  CANONICAL_TOLERANCE, CanonicalShell, canonicalEdge, canonicalOfShell, canonicalShell, diffCanonical, diffReport,
  diffReportLines, isEmptyDiff,
} from '../src/wire/canonical.ts';

let shell: BuildingShell;
let base: CanonicalShell;
beforeAll(async () => {
  shell = await buildShell(fixtureByName('SingleStoreyT'));
  base = canonicalOfShell(shell);
}, 60_000);

/** A copy of the base form with edge `i`'s far end moved by `d` cm along x. */
const movedEdge = (i: number, d: number): CanonicalShell => canonicalShell(base.faces, base.edges.map((e, k) => (k === i ? canonicalEdge(e.kind, e.a, [e.b[0] + d, e.b[1], e.b[2]]) : e)));

/** A copy of the base form with face `i`'s area changed by `d` cm². */
const resizedFace = (i: number, d: number): CanonicalShell => canonicalShell(base.faces.map((f, k) => (k === i ? {...f, area: f.area + d} : f)), base.edges);

describe('the canonical form', () => {
  it('holds every ShellFace and ShellEdge, without ids', () => {
    expect(base.faces).toHaveLength(shell.faces.length);
    expect(base.edges).toHaveLength(shell.edges.length);
    expect(Object.keys(base.faces[0]).sort()).toEqual(['area', 'kind']);
    expect(Object.keys(base.edges[0]).sort()).toEqual(['a', 'b', 'kind']);
  });

  it('ignores record order, edge direction and ids', () => {
    const renumbered: BuildingShell = {
      ...shell,
      faces: [...shell.faces].reverse().map((f, i) => ({...f, id: 100 + i})),
      edges: [...shell.edges].reverse().map((e, i) => ({...e, id: 500 + i, a: e.b, b: e.a})),
    };
    expect(canonicalOfShell(renumbered)).toEqual(base);
    expect(isEmptyDiff(diffCanonical(base, canonicalOfShell(renumbered)))).toBe(true);
  });
});

describe('the diff', () => {
  it('is empty for a shell against itself', () => {
    expect(diffCanonical(base, base)).toEqual({facesOnlyA: [], facesOnlyB: [], edgesOnlyA: [], edgesOnlyB: []});
  });

  it('shows a moved edge endpoint, as exactly that edge on each side', () => {
    const d = diffCanonical(base, movedEdge(3, 1));
    expect(d.facesOnlyA).toEqual([]);
    expect(d.facesOnlyB).toEqual([]);
    expect(d.edgesOnlyA).toEqual([base.edges[3]]);
    expect(d.edgesOnlyB).toHaveLength(1);
    expect(d.edgesOnlyB[0].kind).toBe(base.edges[3].kind);
  });

  it('matches an endpoint moved within tolerance', () => {
    expect(isEmptyDiff(diffCanonical(base, movedEdge(3, CANONICAL_TOLERANCE.pointCm / 2)))).toBe(true);
  });

  it('shows a face whose area changed past tolerance, and matches one within it', () => {
    const d = diffCanonical(base, resizedFace(0, 1));
    expect(d.facesOnlyA).toEqual([base.faces[0]]);
    expect(d.facesOnlyB).toEqual([{...base.faces[0], area: base.faces[0].area + 1}]);
    expect(isEmptyDiff(diffCanonical(base, resizedFace(0, CANONICAL_TOLERANCE.areaCm2 / 2)))).toBe(true);
  });

  it('shows an edge whose kind changed, though its ends did not move', () => {
    const e = base.edges[0];
    const other = e.kind === 'Hip' ? 'Valley' : 'Hip';
    const d = diffCanonical(base, canonicalShell(base.faces, [{...e, kind: other}, ...base.edges.slice(1)]));
    expect(d.edgesOnlyA).toEqual([e]);
    expect(d.edgesOnlyB).toEqual([{...e, kind: other}]);
  });

  it('shows a missing face and a missing edge', () => {
    const d = diffCanonical(base, canonicalShell(base.faces.slice(1), base.edges.slice(1)));
    expect(d.facesOnlyA).toEqual([base.faces[0]]);
    expect(d.edgesOnlyA).toEqual([base.edges[0]]);
  });
});

describe('the diff report', () => {
  it('names both engines, carries the adapter\'s flags, and lists each difference', () => {
    const r = diffReport('probe', ['prototype', 'cpp-legacy'], ['model-index order and ring (root) order disagree'], base, movedEdge(3, 1));
    expect(r.same).toBe(false);
    const lines = diffReportLines(r);
    expect(lines[0]).toBe('probe: FLAG model-index order and ring (root) order disagree');
    expect(lines.filter(l => l.startsWith('probe: edge only in prototype: '))).toHaveLength(1);
    expect(lines.filter(l => l.startsWith('probe: edge only in cpp-legacy: '))).toHaveLength(1);
    expect(lines).toHaveLength(3);
  });
});
