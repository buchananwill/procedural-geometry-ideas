// Journal decision 272 (WP-C3): the x-mirror oracle against a false seam. BSA.F87 measured that the tuck inputs build
// with no tuck once mirrored in x, so a labelled build, its Tuck faces set aside, must be the mirror image of the clean
// build: the same faces, ShellEdges, Cells and NetEdges, compared order-free, every position within
// `SHELL_TOLERANCE_CM`. Any difference is listed, never absorbed.
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {RING_SIDES, RingSide, RingSides, ShellFixture} from '../src/fixture.ts';
import type {BuildingShell} from '../src/shell.ts';
import type {Vec3} from '../src/tags.ts';

/** The plan axis a mirror reflects: 0 mirrors in x, 1 in y (journal decision 278 reads both). */
export type MirrorAxis = 0 | 1;

/**
 * The fixture mirrored in x about `x = span / 2`, or in y about `y = span / 2` when `axis` is 1: every Ring's rectangle
 * reflected, its E and W sides (or its S and N sides) swapped.
 */
export function mirrorFixture(f: ShellFixture, span: number, axis: MirrorAxis = 0): ShellFixture {
  const swap: Record<RingSide, RingSide> = axis === 0 ? {S: 'S', N: 'N', E: 'W', W: 'E'} : {S: 'N', N: 'S', E: 'E', W: 'W'};
  return {
    ...f, name: `${f.name}~mirror`,
    rings: f.rings.map(r => {
      const sides: RingSides = {};
      for (const s of RING_SIDES) { const form = r.sides?.[s]; if (form) sides[swap[s]] = form; }
      const [x0, y0, x1, y1] = r.rect;
      return {...r, rect: axis === 0 ? [span - x1, y0, span - x0, y1] : [x0, span - y1, x1, span - y0], sides};
    }),
  };
}

/** One record reduced to what the oracle compares: a discrete key and the numbers read within tolerance. */
interface Item { key: string; at: number[]; label: string }

const fmt = (xs: number[]): string => `(${xs.map(x => Math.round(x * 1000) / 1000).join(', ')})`;

/** Points as one flat list, sorted so the order of a polygon's or a segment's points does not matter. */
function pointSet(ps: Vec3[]): number[] {
  const sorted = [...ps].sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  return sorted.flat();
}

/** Pairs every item of `a` with one of `b` of the same key whose numbers all lie within `tol`. */
function unmatched(a: Item[], b: Item[], tol: number): {onlyA: Item[]; onlyB: Item[]; worst: number} {
  const left = [...b];
  const onlyA: Item[] = [];
  let worst = 0;
  for (const x of a) {
    let best = -1, bestD = Infinity;
    left.forEach((y, i) => {
      if (y.key !== x.key || y.at.length !== x.at.length) return;
      const d = Math.max(0, ...x.at.map((v, k) => Math.abs(v - y.at[k])));
      if (d < bestD) { best = i; bestD = d; }
    });
    if (best >= 0 && bestD <= tol) { worst = Math.max(worst, bestD); left.splice(best, 1); } else onlyA.push(x);
  }
  return {onlyA, onlyB: left, worst};
}

/** Which face kinds a comparison reads: every one, or (say) Roof alone, with the Edges, Cells and NetEdges on them. */
export type Scope = (kind: string) => boolean;

/**
 * A shell's records as items, its Tuck faces set aside; `mirror` reflects every position on `axis` about `span / 2`.
 */
function itemsOf(s: BuildingShell, span: number, mirror: boolean, scope: Scope, axis: MirrorAxis): Record<'faces' | 'edges' | 'cells' | 'netEdges', Item[]> {
  const flip = (p: Vec3, v: (c: number) => number): Vec3 => [axis === 0 ? v(p[0]) : p[0], axis === 1 ? v(p[1]) : p[1], p[2]];
  const m = (p: Vec3): Vec3 => (mirror ? flip(p, c => span - c) : p);
  const kindOf = (f: number): string => s.faces[f].tag.kind;
  const inScope = (f: number): boolean => scope(s.faces[f].tag.kind);
  const faces = s.faces.filter(f => f.tag.kind !== 'Tuck' && inScope(f.id)).map((f): Item => {
    const n: Vec3 = mirror ? flip(f.normal, c => -c || 0) : f.normal;
    const d = mirror ? f.offset - f.normal[axis] * span : f.offset;
    // The area in hundreds of cm², so `tol` bounds it at 100 tol cm²: float32 positions at a face's size move it so far.
    return {key: `${f.tag.kind}|${f.tag.storey}`, at: [...n, d, f.area / 100], label: `${f.tag.kind} storey ${f.tag.storey} n=${fmt(n)} d=${d.toFixed(3)} area ${f.area.toFixed(3)}`};
  });
  const edges = s.edges.filter(e => e.faces.some(inScope)).map((e): Item => {
    const kinds = e.faces.map(kindOf).sort().join('+');
    const at = pointSet([m(e.a), m(e.b)]);
    return {key: `${e.kind}|${kinds}`, at, label: `${e.kind} between ${kinds} ${fmt(at.slice(0, 3))} to ${fmt(at.slice(3))}`};
  });
  const cellAt = (c: number): number[] => pointSet(s.cells[c].polygon.map(m));
  const cells = s.cells.filter(c => inScope(c.face)).map((c): Item => {
    const at = cellAt(c.id);
    return {key: `${kindOf(c.face)}|${c.whole}|${c.polygon.length}`, at, label: `${kindOf(c.face)} Cell ${c.whole ? 'whole' : 'partial'} ${fmt(at)}`};
  });
  const netEdges = s.netEdges.filter(n => n.cells.some(c => inScope(s.cells[c].face))).map((n): Item => {
    const ends = pointSet([m(s.vertices[n.v[0]].p), m(s.vertices[n.v[1]].p)]);
    // The Cells it carries, each by its corners' mean, in a fixed order.
    const carried = n.cells.map(c => {
      const ps = s.cells[c].polygon.map(m);
      return {kind: kindOf(s.cells[c].face), mean: [0, 1, 2].map(k => ps.reduce((t, p) => t + p[k], 0) / ps.length)};
    }).sort((p, q) => p.kind.localeCompare(q.kind) || p.mean[0] - q.mean[0] || p.mean[1] - q.mean[1] || p.mean[2] - q.mean[2]);
    return {key: `${n.kind}|${carried.map(c => c.kind).join('+')}`, at: [...ends, ...carried.flatMap(c => c.mean)], label: `${n.kind} NetEdge ${fmt(ends)} carrying ${carried.map(c => `${c.kind} ${fmt(c.mean)}`).join(', ')}`};
  });
  return {faces, edges, cells, netEdges};
}

/** What differs between a labelled build and a clean build's mirror image, record by record, and the worst match. */
export interface MirrorDiff { differences: string[]; worst: number }

/**
 * The labelled build `tucked`, its Tuck faces set aside, against `clean` mirrored in x about `span / 2`. Every
 * position and area is matched within `tol` (`SHELL_TOLERANCE_CM` unless given), every discrete field exactly. `scope`
 * narrows it to the faces of some kinds and the Edges, Cells and NetEdges on them. `axis` 1 mirrors in y instead.
 */
export function mirrorDifferences(tucked: BuildingShell, clean: BuildingShell, span: number, scope: Scope = () => true, tol = SHELL_TOLERANCE_CM, axis: MirrorAxis = 0): MirrorDiff {
  const a = itemsOf(tucked, span, false, scope, axis), b = itemsOf(clean, span, true, scope, axis);
  const differences: string[] = [];
  let worst = 0;
  for (const k of ['faces', 'edges', 'cells', 'netEdges'] as const) {
    const r = unmatched(a[k], b[k], tol);
    worst = Math.max(worst, r.worst);
    for (const x of r.onlyA) differences.push(`${k}: only in the labelled build: ${x.label}`);
    for (const x of r.onlyB) differences.push(`${k}: only in the mirror: ${x.label}`);
  }
  return {differences, worst};
}
