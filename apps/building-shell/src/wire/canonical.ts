// The canonical, id-free form of a building shell and the diff of two (journal decisions 124 and 126). Browser-safe.
//
// THE CANONICAL FORM, which every engine's output maps into before it is compared:
// - faces: a multiset of `{kind, area}`. `kind` is the face's kind, `Wall`, `Gable`, `Roof`, `Underside`, `Ground` or
//   `Cheek` (tags.ts's `ShellKind`); `area` is the face's area in cm².
// - edges: a multiset of `{kind, a, b}`. `kind` is an `EdgeKind` name (edges.ts, spec decision 21); `a` and `b` are the
//   ends of one maximal straight run with the same two faces either side (spec decision 19), in UE actor-local cm, Z up
//   (journal decision 126), snapped to the 1/1024 cm grid and ordered so that `a` sorts first, x then y then z.
// - Nothing else: no ids, no vertices, no Cells, no face loops, no ordering. Two lists that differ only by order or by
//   an edge's direction are the same form.
//
// How the C++ legacy export must map into it (its USTRUCTs do not exist yet, journal decisions 126 and 127): each
// legacy Surface and roof face becomes one `{kind, area}` in the kinds above; its net Edges, which have no vertices,
// become `{kind, a, b}` by their end positions, with collinear same-kind Edges between the same two faces merged into
// one maximal run so they compare against a `ShellEdge` and not a `NetEdge`.
import {SHELL_TOLERANCE_CM} from '../constants.ts';
import {snapPoint} from '../edges.ts';
import type {BuildingShell} from '../shell.ts';
import type {Vec3} from '../tags.ts';

export interface CanonicalFace { kind: string; area: number }
export interface CanonicalEdge { kind: string; a: Vec3; b: Vec3 }

/** Both multisets, each sorted: faces by kind then area, edges by kind then `a` then `b`. */
export interface CanonicalShell { faces: CanonicalFace[]; edges: CanonicalEdge[] }

/** How far two canonical records may be apart and still match. */
export interface CanonicalTolerance { areaCm2: number; pointCm: number }

/** The default: 0.05 cm² on area, as the shell's own area tests assert, and the app's one geometric tolerance. */
export const CANONICAL_TOLERANCE: CanonicalTolerance = {areaCm2: 0.05, pointCm: SHELL_TOLERANCE_CM};

const cmpPoint = (p: Vec3, q: Vec3): number => p[0] - q[0] || p[1] - q[1] || p[2] - q[2];
const cmpStr = (s: string, t: string): number => (s < t ? -1 : s > t ? 1 : 0);

/** One edge in canonical form: both ends snapped, the lesser first. */
export function canonicalEdge(kind: string, p: Vec3, q: Vec3): CanonicalEdge {
  const a = snapPoint(p), b = snapPoint(q);
  return cmpPoint(a, b) <= 0 ? {kind, a, b} : {kind, a: b, b: a};
}

/** Sorts two raw multisets into a `CanonicalShell`. */
export function canonicalShell(faces: CanonicalFace[], edges: CanonicalEdge[]): CanonicalShell {
  return {
    faces: [...faces].sort((f, g) => cmpStr(f.kind, g.kind) || f.area - g.area),
    edges: [...edges].sort((e, f) => cmpStr(e.kind, f.kind) || cmpPoint(e.a, f.a) || cmpPoint(e.b, f.b)),
  };
}

/** The prototype's `BuildingShell` in canonical form: its ShellFaces' kinds and areas, its ShellEdges' kinds and ends. */
export function canonicalOfShell(s: BuildingShell): CanonicalShell {
  return canonicalShell(
    s.faces.map(f => ({kind: f.tag.kind, area: f.area})),
    s.edges.map(e => canonicalEdge(e.kind, e.a, e.b)),
  );
}

/** What one side holds and the other does not, after every record that matches within tolerance is paired off. */
export interface CanonicalDiff {
  facesOnlyA: CanonicalFace[];
  facesOnlyB: CanonicalFace[];
  edgesOnlyA: CanonicalEdge[];
  edgesOnlyB: CanonicalEdge[];
}

export const isEmptyDiff = (d: CanonicalDiff): boolean =>
  !d.facesOnlyA.length && !d.facesOnlyB.length && !d.edgesOnlyA.length && !d.edgesOnlyB.length;

const groupBy = <T extends {kind: string}>(xs: T[]): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(x.kind, [...(m.get(x.kind) ?? []), x]);
  return m;
};

/** Areas of one kind, both sorted ascending: the two-pointer match pairs as many as any matching can within `tol`. */
function matchAreas(a: CanonicalFace[], b: CanonicalFace[], tol: number): [CanonicalFace[], CanonicalFace[]] {
  const onlyA: CanonicalFace[] = [], onlyB: CanonicalFace[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (Math.abs(a[i].area - b[j].area) <= tol) { i++; j++; }
    else if (a[i].area < b[j].area) onlyA.push(a[i++]);
    else onlyB.push(b[j++]);
  }
  return [[...onlyA, ...a.slice(i)], [...onlyB, ...b.slice(j)]];
}

const near = (p: Vec3, q: Vec3, tol: number): boolean =>
  Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol;

/** Edges of one kind: each `a` edge pairs with the first unpaired `b` edge whose ends lie within `tol`, either way round. */
function matchEdges(a: CanonicalEdge[], b: CanonicalEdge[], tol: number): [CanonicalEdge[], CanonicalEdge[]] {
  const used = new Array<boolean>(b.length).fill(false);
  const onlyA = a.filter(e => {
    const k = b.findIndex((f, j) => !used[j] && ((near(e.a, f.a, tol) && near(e.b, f.b, tol)) || (near(e.a, f.b, tol) && near(e.b, f.a, tol))));
    if (k < 0) return true;
    used[k] = true;
    return false;
  });
  return [onlyA, b.filter((_, j) => !used[j])];
}

/** The diff of two canonical shells within `tol`. */
export function diffCanonical(a: CanonicalShell, b: CanonicalShell, tol: CanonicalTolerance = CANONICAL_TOLERANCE): CanonicalDiff {
  const d: CanonicalDiff = {facesOnlyA: [], facesOnlyB: [], edgesOnlyA: [], edgesOnlyB: []};
  const fa = groupBy(a.faces), fb = groupBy(b.faces);
  for (const k of new Set([...fa.keys(), ...fb.keys()])) {
    const [oa, ob] = matchAreas(fa.get(k) ?? [], fb.get(k) ?? [], tol.areaCm2);
    d.facesOnlyA.push(...oa);
    d.facesOnlyB.push(...ob);
  }
  const ea = groupBy(a.edges), eb = groupBy(b.edges);
  for (const k of new Set([...ea.keys(), ...eb.keys()])) {
    const [oa, ob] = matchEdges(ea.get(k) ?? [], eb.get(k) ?? [], tol.pointCm);
    d.edgesOnlyA.push(...oa);
    d.edgesOnlyB.push(...ob);
  }
  return d;
}

/** The diff report of one playtest file: the two engines named, the adapter's flags, and the diff. */
export interface DiffReport { name: string; engines: [string, string]; flags: string[]; diff: CanonicalDiff; same: boolean }

export function diffReport(name: string, engines: [string, string], flags: string[], a: CanonicalShell, b: CanonicalShell, tol: CanonicalTolerance = CANONICAL_TOLERANCE): DiffReport {
  const diff = diffCanonical(a, b, tol);
  return {name, engines, flags, diff, same: isEmptyDiff(diff)};
}

/** A report as text lines, for a test failure or a console. */
export function diffReportLines(r: DiffReport): string[] {
  const face = (f: CanonicalFace): string => `${f.kind} ${f.area.toFixed(3)} cm²`;
  const edge = (e: CanonicalEdge): string => `${e.kind} (${e.a.join(', ')}) to (${e.b.join(', ')})`;
  const [x, y] = r.engines;
  return [
    ...r.flags.map(f => `${r.name}: FLAG ${f}`),
    ...r.diff.facesOnlyA.map(f => `${r.name}: face only in ${x}: ${face(f)}`),
    ...r.diff.facesOnlyB.map(f => `${r.name}: face only in ${y}: ${face(f)}`),
    ...r.diff.edgesOnlyA.map(e => `${r.name}: edge only in ${x}: ${edge(e)}`),
    ...r.diff.edgesOnlyB.map(e => `${r.name}: edge only in ${y}: ${edge(e)}`),
  ];
}
