// The canonical, id-free form of a building shell and the diff of two (journal decisions 124, 126 and 140).
// Browser-safe.
//
// THE CANONICAL FORM, which every engine's output maps into before it is compared:
// - faces: a multiset of `{kind, area, perimeter}`. `kind` is a `ShellKind` (tags.ts), `Internal` included, since a
//   surviving Internal face is a real difference; `area` is in cm²; `perimeter`, in cm, sets the area tolerance only
//   and is never matched itself.
// - edges: a multiset of `{kind, a, b}`. `kind` is an `EdgeKind` (edges.ts, spec decision 21); `a` and `b` are the ends
//   of one maximal straight run with the same two faces either side (spec decision 19), in UE actor-local cm, Z up
//   (decision 126), snapped to the 1/1024 cm grid, the lesser first, x then y then z.
// - Nothing else: no ids, no vertices, no Cells, no face loops, no order, no edge direction.
//
// THE MATCH (decision 140, F3 and F8): records pair by maximum bipartite matching within each kind, so a pairing exists
// whenever any one-to-one pairing within tolerance does. Two faces match within the larger perimeter × 1/1024 cm,
// never less than 0.05 cm²: that bounds the area the 1/1024 snap can shift, so an exact double-precision engine is not
// reported as different. Two edges match when both ends lie within `SHELL_TOLERANCE_CM` per axis, either way round.
//
// THE LEGACY C++ BASELINE (decision 140, F9): the legacy net's Edges have no endpoints (journal F49) and it staircases
// roof lines, so against it only face kind and area, and the count of edges of each kind, are compared, and nothing
// else. It is labelled a baseline, never a pass or a fail. Each legacy Surface and roof face maps to one canonical
// face; each legacy Edge to one edge of its kind with no ends. Once the port's own output exists, the full diff applies.
import {SHELL_TOLERANCE_CM} from '../constants.ts';
import {EDGE_KINDS, EdgeKind, snapPoint} from '../edges.ts';
import type {BuildingShell} from '../shell.ts';
import type {ShellKind, Vec3} from '../tags.ts';
import {dist3} from '../vec3.ts';
import {SNAP_STEPS_PER_CM} from '../weld.ts';
import type {InputReport} from './input-adapter.ts';

/** Every `ShellKind`, as a runtime list for the output boundary's validation. */
export const SHELL_KINDS = ['Wall', 'Gable', 'Roof', 'Underside', 'Ground', 'Cheek', 'Internal'] as const satisfies readonly ShellKind[];
/** Compile-time: `SHELL_KINDS` names every `ShellKind`. */
const everyShellKind: readonly ShellKind[] extends readonly (typeof SHELL_KINDS)[number][] ? true : never = true;
void everyShellKind;
export {EDGE_KINDS};

export interface CanonicalFace { kind: ShellKind; area: number; perimeter: number }
export interface CanonicalEdge { kind: EdgeKind; a: Vec3; b: Vec3 }

/** Both multisets, each sorted: faces by kind then area, edges by kind then `a` then `b`. */
export interface CanonicalShell { faces: CanonicalFace[]; edges: CanonicalEdge[] }

/** How far two canonical records may be apart and still match. */
export interface CanonicalTolerance {
  /** The least area tolerance, cm². */
  areaFloorCm2: number;
  /** Area tolerance per cm of the larger perimeter: the snap step. */
  areaPerPerimeterCm: number;
  /** Per axis, on each edge end. */
  pointCm: number;
}

export const CANONICAL_TOLERANCE: CanonicalTolerance = {areaFloorCm2: 0.05, areaPerPerimeterCm: 1 / SNAP_STEPS_PER_CM, pointCm: SHELL_TOLERANCE_CM};

/** The area tolerance between two faces: the larger perimeter × the snap step, never less than the floor. */
export const areaTolerance = (f: CanonicalFace, g: CanonicalFace, tol: CanonicalTolerance = CANONICAL_TOLERANCE): number =>
  Math.max(tol.areaFloorCm2, Math.max(f.perimeter, g.perimeter) * tol.areaPerPerimeterCm);

const cmpPoint = (p: Vec3, q: Vec3): number => p[0] - q[0] || p[1] - q[1] || p[2] - q[2];
const cmpStr = (s: string, t: string): number => (s < t ? -1 : s > t ? 1 : 0);
const byFace = (f: CanonicalFace, g: CanonicalFace): number => cmpStr(f.kind, g.kind) || f.area - g.area;
const byEdge = (e: CanonicalEdge, f: CanonicalEdge): number => cmpStr(e.kind, f.kind) || cmpPoint(e.a, f.a) || cmpPoint(e.b, f.b);

/** One edge in canonical form: both ends snapped, the lesser first. */
export function canonicalEdge(kind: EdgeKind, p: Vec3, q: Vec3): CanonicalEdge {
  const a = snapPoint(p), b = snapPoint(q);
  return cmpPoint(a, b) <= 0 ? {kind, a, b} : {kind, a: b, b: a};
}

/** Sorts two raw multisets into a `CanonicalShell`. */
export const canonicalShell = (faces: CanonicalFace[], edges: CanonicalEdge[]): CanonicalShell =>
  ({faces: [...faces].sort(byFace), edges: [...edges].sort(byEdge)});

const loopPerimeter = (l: Vec3[]): number => l.reduce((s, p, i) => s + dist3(p, l[(i + 1) % l.length]), 0);

/** The prototype's `BuildingShell` in canonical form: its ShellFaces and its ShellEdges. */
export function canonicalOfShell(s: BuildingShell): CanonicalShell {
  return canonicalShell(
    s.faces.map(f => ({kind: f.tag.kind, area: f.area, perimeter: f.loops.reduce((t, l) => t + loopPerimeter(l), 0)})),
    s.edges.map(e => canonicalEdge(e.kind, e.a, e.b)),
  );
}

/**
 * A maximum bipartite matching (Kuhn's augmenting paths) of `a` against `b`: `match[j]` is the `a` index paired with
 * `b[j]`, or -1.
 */
function maximumMatching<A, B>(a: A[], b: B[], fits: (x: A, y: B) => boolean): number[] {
  const adj = a.map(x => b.flatMap((y, j) => (fits(x, y) ? [j] : [])));
  const match = new Array<number>(b.length).fill(-1);
  const augment = (i: number, seen: boolean[]): boolean => {
    for (const j of adj[i]) {
      if (seen[j]) continue;
      seen[j] = true;
      if (match[j] < 0 || augment(match[j], seen)) { match[j] = i; return true; }
    }
    return false;
  };
  a.forEach((_, i) => augment(i, new Array<boolean>(b.length).fill(false)));
  return match;
}

/** What `a` and `b` hold unpaired under a maximum matching. */
function unmatched<A, B>(a: A[], b: B[], fits: (x: A, y: B) => boolean): [A[], B[]] {
  const match = maximumMatching(a, b, fits);
  const paired = new Set(match.filter(i => i >= 0));
  return [a.filter((_, i) => !paired.has(i)), b.filter((_, j) => match[j] < 0)];
}

/** Faces of one kind, each list sorted here, whatever order it came in. */
export function matchAreas(a: CanonicalFace[], b: CanonicalFace[], tol: CanonicalTolerance = CANONICAL_TOLERANCE): [CanonicalFace[], CanonicalFace[]] {
  return unmatched([...a].sort(byFace), [...b].sort(byFace), (f, g) => Math.abs(f.area - g.area) <= areaTolerance(f, g, tol));
}

const near = (p: Vec3, q: Vec3, tol: number): boolean =>
  Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol;

/** Edges of one kind: an edge fits another when both ends lie within tolerance, either way round. */
export function matchEdges(a: CanonicalEdge[], b: CanonicalEdge[], tol: CanonicalTolerance = CANONICAL_TOLERANCE): [CanonicalEdge[], CanonicalEdge[]] {
  const t = tol.pointCm;
  return unmatched([...a].sort(byEdge), [...b].sort(byEdge), (e, f) => (near(e.a, f.a, t) && near(e.b, f.b, t)) || (near(e.a, f.b, t) && near(e.b, f.a, t)));
}

/** What one side holds and the other does not, after the maximum matching pairs every record it can. */
export interface CanonicalDiff {
  facesOnlyA: CanonicalFace[];
  facesOnlyB: CanonicalFace[];
  edgesOnlyA: CanonicalEdge[];
  edgesOnlyB: CanonicalEdge[];
}

export const isEmptyDiff = (d: CanonicalDiff): boolean =>
  !d.facesOnlyA.length && !d.facesOnlyB.length && !d.edgesOnlyA.length && !d.edgesOnlyB.length;

function groupBy<T extends {kind: string}>(xs: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(x.kind, [...(m.get(x.kind) ?? []), x]);
  return m;
}

/** Runs `match` on each kind either side holds, and gathers what it leaves. */
function byKind<T extends {kind: string}>(a: T[], b: T[], match: (x: T[], y: T[]) => [T[], T[]]): [T[], T[]] {
  const ga = groupBy(a), gb = groupBy(b);
  const onlyA: T[] = [], onlyB: T[] = [];
  for (const k of [...new Set([...ga.keys(), ...gb.keys()])].sort()) {
    const [x, y] = match(ga.get(k) ?? [], gb.get(k) ?? []);
    onlyA.push(...x);
    onlyB.push(...y);
  }
  return [onlyA, onlyB];
}

/** The diff of two canonical shells within `tol`. */
export function diffCanonical(a: CanonicalShell, b: CanonicalShell, tol: CanonicalTolerance = CANONICAL_TOLERANCE): CanonicalDiff {
  const [facesOnlyA, facesOnlyB] = byKind(a.faces, b.faces, (x, y) => matchAreas(x, y, tol));
  const [edgesOnlyA, edgesOnlyB] = byKind(a.edges, b.edges, (x, y) => matchEdges(x, y, tol));
  return {facesOnlyA, facesOnlyB, edgesOnlyA, edgesOnlyB};
}

/** An edge kind whose count differs between the two engines. */
export interface EdgeKindCount { kind: EdgeKind; a: number; b: number }

/** Decision 140, F9: the legacy baseline's diff. Face kind and area, and edge-kind counts, nothing else. */
export interface BaselineDiff { facesOnlyA: CanonicalFace[]; facesOnlyB: CanonicalFace[]; edgeKindCounts: EdgeKindCount[] }

/** The baseline diff of a canonical shell against faces and edge kinds with no ends. */
export function diffBaseline(a: CanonicalShell, bFaces: CanonicalFace[], bEdgeKinds: EdgeKind[], tol: CanonicalTolerance = CANONICAL_TOLERANCE): BaselineDiff {
  const [facesOnlyA, facesOnlyB] = byKind(a.faces, bFaces, (x, y) => matchAreas(x, y, tol));
  const count = (ks: EdgeKind[], k: EdgeKind): number => ks.filter(x => x === k).length;
  const aKinds = a.edges.map(e => e.kind);
  const edgeKindCounts = EDGE_KINDS.map(kind => ({kind, a: count(aKinds, kind), b: count(bEdgeKinds, kind)})).filter(c => c.a !== c.b);
  return {facesOnlyA, facesOnlyB, edgeKindCounts};
}

/** The two engines a report compares, the first the `A` side of every diff. */
export type EnginePair = readonly [a: string, b: string];

/** A playtest dump's report: the engines, the input side's report, and either the full diff or the legacy baseline. */
export type DiffReport =
  | {name: string; engines: EnginePair; input: InputReport; mode: 'full'; diff: CanonicalDiff; same: boolean}
  | {name: string; engines: EnginePair; input: InputReport; mode: 'baseline'; diff: BaselineDiff};

export function diffReport(name: string, engines: EnginePair, input: InputReport, a: CanonicalShell, b: CanonicalShell, tol: CanonicalTolerance = CANONICAL_TOLERANCE): DiffReport {
  const diff = diffCanonical(a, b, tol);
  return {name, engines, input, mode: 'full', diff, same: isEmptyDiff(diff)};
}

export function baselineReport(name: string, engines: EnginePair, input: InputReport, a: CanonicalShell, bFaces: CanonicalFace[], bEdgeKinds: EdgeKind[], tol: CanonicalTolerance = CANONICAL_TOLERANCE): DiffReport {
  return {name, engines, input, mode: 'baseline', diff: diffBaseline(a, bFaces, bEdgeKinds, tol)};
}

const faceText = (f: CanonicalFace): string => `${f.kind} ${f.area.toFixed(3)} cm²`;
const edgeText = (e: CanonicalEdge): string => `${e.kind} (${e.a.join(', ')}) to (${e.b.join(', ')})`;

/** A report as text lines: flags first, then information, then each difference. */
export function diffReportLines(r: DiffReport): string[] {
  const [x, y] = r.engines;
  const head = [...r.input.flags.map(f => `${r.name}: FLAG ${f}`), ...r.input.info.map(i => `${r.name}: INFO ${i}`)];
  const faces = [
    ...r.diff.facesOnlyA.map(f => `${r.name}: face only in ${x}: ${faceText(f)}`),
    ...r.diff.facesOnlyB.map(f => `${r.name}: face only in ${y}: ${faceText(f)}`),
  ];
  if (r.mode === 'baseline') {
    return [`${r.name}: BASELINE against ${y}, not a pass or a fail`, ...head, ...faces,
      ...r.diff.edgeKindCounts.map(c => `${r.name}: ${c.kind} edges: ${c.a} in ${x}, ${c.b} in ${y}`)];
  }
  return [...head, ...faces,
    ...r.diff.edgesOnlyA.map(e => `${r.name}: edge only in ${x}: ${edgeText(e)}`),
    ...r.diff.edgesOnlyB.map(e => `${r.name}: edge only in ${y}: ${edgeText(e)}`)];
}
