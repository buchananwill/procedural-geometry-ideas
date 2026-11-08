// Journal decisions 124 and 140: the canonical, id-free diff of two shells. Multisets of face kind and area, and of
// edge kind with snapped endpoints, paired by maximum matching within tolerance; and the legacy baseline.
import {beforeAll, describe, expect, it} from 'vitest';
import {fixtureByName} from '../src/fixture.ts';
import {BuildingShell, buildShell} from '../src/shell.ts';
import {
  CANONICAL_TOLERANCE, CanonicalShell, areaTolerance, canonicalEdge, canonicalOfShell, canonicalShell, diffBaseline,
  diffCanonical, diffReport, diffReportLines, isEmptyDiff, matchAreas,
} from '../src/wire/canonical.ts';
import type {InputReport} from '../src/wire/input-adapter.ts';

const NO_INPUT: InputReport = {flags: [], info: [], maxCornerDriftCm: 0};
const EMPTY = {facesOnlyA: [], facesOnlyB: [], edgesOnlyA: [], edgesOnlyB: []};

let shell: BuildingShell;
let base: CanonicalShell;
let chalet: CanonicalShell;
beforeAll(async () => {
  shell = await buildShell(fixtureByName('SingleStoreyT'));
  base = canonicalOfShell(shell);
  chalet = canonicalOfShell(await buildShell(fixtureByName('DefaultChalet')));
}, 60_000);

/** A copy of the base form with edge `i`'s far end moved by `d` cm along x. */
const movedEdge = (i: number, d: number): CanonicalShell => canonicalShell(base.faces, base.edges.map((e, k) => (k === i ? canonicalEdge(e.kind, e.a, [e.b[0] + d, e.b[1], e.b[2]]) : e)));

/** A copy of the base form with face `i`'s area changed by `d` cm². */
const resizedFace = (i: number, d: number): CanonicalShell => canonicalShell(base.faces.map((f, k) => (k === i ? {...f, area: f.area + d} : f)), base.edges);

describe('the canonical form', () => {
  it('holds every ShellFace and ShellEdge, without ids', () => {
    expect(base.faces).toHaveLength(shell.faces.length);
    expect(base.edges).toHaveLength(shell.edges.length);
    expect(Object.keys(base.faces[0]).sort()).toEqual(['area', 'kind', 'perimeter']);
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
    expect(diffCanonical(base, base)).toEqual(EMPTY);
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

  it('shows a face whose area changed past its tolerance, and matches one within it', () => {
    const tol = areaTolerance(base.faces[0], base.faces[0]);
    const d = diffCanonical(base, resizedFace(0, 2 * tol));
    expect(d.facesOnlyA).toEqual([base.faces[0]]);
    expect(d.facesOnlyB).toEqual([{...base.faces[0], area: base.faces[0].area + 2 * tol}]);
    expect(isEmptyDiff(diffCanonical(base, resizedFace(0, tol / 2)))).toBe(true);
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

describe('the area tolerance (decision 140, F3)', () => {
  it("matches DefaultChalet's exact double-precision areas, which the 1/1024 snap shifts past 0.05 cm²", () => {
    const h = 500 * Math.tan((22.5 * Math.PI) / 180);
    const exact: Record<string, number> = {Roof: 1000 * Math.hypot(500, h), Gable: (1000 * h) / 2, Wall: 1000 * 250, Ground: 1000 * 1000};
    const exactChalet = canonicalShell(chalet.faces.map(f => ({...f, area: exact[f.kind]})), chalet.edges);
    expect(chalet.faces.some(f => Math.abs(f.area - exact[f.kind]) > 0.05)).toBe(true);
    expect(diffCanonical(chalet, exactChalet)).toEqual(EMPTY);
  });

  it('is the larger perimeter × 1/1024, never under 0.05 cm²', () => {
    expect(areaTolerance({kind: 'Wall', area: 1, perimeter: 10}, {kind: 'Wall', area: 1, perimeter: 2048})).toBe(2);
    expect(areaTolerance({kind: 'Wall', area: 1, perimeter: 10}, {kind: 'Wall', area: 1, perimeter: 0})).toBe(0.05);
  });
});

describe('the matching (decision 140, F8)', () => {
  it("pairs the reviewer's two Hips, which greedy first-fit leaves unpaired", () => {
    const u = 1 / 1024;
    const A = canonicalShell([], [canonicalEdge('Hip', [0, 0, 0], [100, 0, 0]), canonicalEdge('Hip', [u, 12 * u, 0], [100, 0, 0])]);
    const B = canonicalShell([], [canonicalEdge('Hip', [0, 5 * u, 0], [100, 0, 0]), canonicalEdge('Hip', [5 * u, -9 * u, 0], [100, 0, 0])]);
    expect(diffCanonical(A, B)).toEqual(EMPTY);
  });

  it('sorts its own input: two unsorted lists of one multiset match', () => {
    const A = [{kind: 'Wall' as const, area: 10, perimeter: 0}, {kind: 'Wall' as const, area: 5, perimeter: 0}];
    const B = [{kind: 'Wall' as const, area: 5, perimeter: 0}, {kind: 'Wall' as const, area: 10, perimeter: 0}];
    expect(matchAreas(A, B)).toEqual([[], []]);
    expect(diffCanonical({faces: A, edges: []}, {faces: B, edges: []})).toEqual(EMPTY);
  });
});

describe('the legacy baseline (decision 140, F9)', () => {
  it('compares face kind and area and edge-kind counts, and nothing else', () => {
    const kinds = base.edges.map(e => e.kind);
    expect(diffBaseline(base, base.faces, kinds)).toEqual({facesOnlyA: [], facesOnlyB: [], edgeKindCounts: []});
    expect(kinds).not.toContain('Unclassified');
    const n = kinds.filter(k => k === kinds[0]).length;
    const d = diffBaseline(base, base.faces, ['Unclassified', ...kinds.slice(1)]);
    expect(d.edgeKindCounts).toEqual([{kind: kinds[0], a: n, b: n - 1}, {kind: 'Unclassified', a: 0, b: 1}].sort((x, y) => (x.kind === 'Unclassified' ? 1 : y.kind === 'Unclassified' ? -1 : 0)));
    expect(d.facesOnlyA).toEqual([]);
  });
});

describe('the diff report', () => {
  it("names both engines, carries the input's flags and information, and lists each difference", () => {
    const input: InputReport = {flags: ['model-index order and ring (root) order disagree'], info: ['Ring 0 side 1 (E) is bEmptied'], maxCornerDriftCm: 0};
    const r = diffReport('probe', ['prototype', 'cpp-legacy'], input, base, movedEdge(3, 1));
    expect(r.mode === 'full' && r.same).toBe(false);
    const lines = diffReportLines(r);
    expect(lines.slice(0, 2)).toEqual(['probe: FLAG model-index order and ring (root) order disagree', 'probe: INFO Ring 0 side 1 (E) is bEmptied']);
    expect(lines.filter(l => l.startsWith('probe: edge only in prototype: '))).toHaveLength(1);
    expect(lines.filter(l => l.startsWith('probe: edge only in cpp-legacy: '))).toHaveLength(1);
    expect(lines).toHaveLength(4);
    expect(diffReportLines(diffReport('same', ['a', 'b'], NO_INPUT, base, base))).toEqual([]);
  });
});
