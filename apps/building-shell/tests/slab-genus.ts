// The genus a fixture's shell should measure, predicted from its Rings alone, so an ingested file's genus is checked
// against its input and never pinned to what the build measured.
//
// Each Ring is a box, its rect over storeys [baseStorey, baseStorey + storeys). A storey's roof is a cap on its own
// plan, which leaves its solid's topology that of the plan extruded, so the shell is the union of the boxes up to
// homotopy, joined only where Manifold joins solids: through a contact of positive area (journal decision 140, F5).
// Boxes touching along an edge or at a point stay apart. So the prediction is taken on the union's interior U, an open
// 3-manifold, whose components are the shell's. For U, χ(U) = −χ_c(U) (Poincaré duality in odd dimension), and χ_c
// counts (−1)^dimension over the open cells of the boxes' coordinate grid that lie inside U: those whose every
// neighbouring grid box is in the union.
//
// One more contact joins solids (journal decision 143, F2): a gable. A box's top storey is roofed above its plate, and
// a gabled side's gable stands on the side's own plane, so a box one storey up on the far side of that plane, its span
// overlapping the side's with positive length, touches the gable in a contact of positive area, though the two boxes
// meet only along an edge. Each such contact is a disc glued between two solids, so it lowers χ by one: it joins two
// components, or, within one, adds a handle. The side's form is the Ring's own; a gable that a lower-index Ring's form
// overrides on the union wall is not modelled.
//
// Genus is predicted per connected component (spec decision 32 as amended by journal decision 135): a component's
// genus is 1 − χ of its interior. Manifold's own figure sums over components, 1 − (components) + Σ genus, and the
// playtest check compares that summed figure (decision 143, F3), never the per-component list: WP3.7's per-component
// genera count surfaces, a cavity its own surface, while this prediction counts solids. Both sums are Euler
// characteristics, so they agree.
//
// Not covered: a roof tall enough to reach a storey two above its own where the storey between is absent, filling a
// tunnel the boxes leave open (the correctness review's `TallRoofThroughTunnel60`: predicted 1, measured 0). The genus
// check reports it.
import type {RingSide, ShellFixture} from '../src/fixture.ts';
import type {ShellBuild} from '../src/shell.ts';
import {componentGenera, invariantViolations} from './shell-invariants.ts';

/** A Ring's box, in storey units on z, with the sides its Ring gables. */
interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; gables: ReadonlySet<RingSide> }

const boxesOf = (f: ShellFixture): Box[] =>
  f.rings.map(r => ({
    x0: r.rect[0], y0: r.rect[1], x1: r.rect[2], y1: r.rect[3], z0: r.baseStorey, z1: r.baseStorey + r.storeys,
    gables: new Set((Object.keys(r.sides ?? {}) as RingSide[]).filter(s => r.sides?.[s]?.form === 'gable')),
  }));

/** The length of the overlap of two closed intervals, negative when they are apart. */
const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.min(a1, b1) - Math.max(a0, b0);

/** Whether two boxes meet in a contact of positive area: overlapping on at least two axes, touching on the third. */
function joined(a: Box, b: Box): boolean {
  const o = [overlap(a.x0, a.x1, b.x0, b.x1), overlap(a.y0, a.y1, b.y0, b.y1), overlap(a.z0, a.z1, b.z0, b.z1)];
  return o.every(v => v >= 0) && o.filter(v => v > 0).length >= 2;
}

/** Decision 143, F2: whether `lo`'s top-storey gable on a side plane touches `up`, the box one storey up beyond it. */
function gableTouches(lo: Box, up: Box): boolean {
  if (lo.z1 !== up.z0) return false;
  const alongX = overlap(lo.x0, lo.x1, up.x0, up.x1) > 0, alongY = overlap(lo.y0, lo.y1, up.y0, up.y1) > 0;
  return (lo.gables.has('E') && lo.x1 === up.x0 && alongY) || (lo.gables.has('W') && lo.x0 === up.x1 && alongY)
    || (lo.gables.has('N') && lo.y1 === up.y0 && alongX) || (lo.gables.has('S') && lo.y0 === up.y1 && alongX);
}

/** Whether a gable joins the two boxes, either one the lower. */
const gableJoined = (a: Box, b: Box): boolean => gableTouches(a, b) || gableTouches(b, a);

/** One component: its boxes, and how many gable contacts glue them. */
interface Component { boxes: Box[]; gableContacts: number }

/** The boxes grouped into components by positive-area contact, a gable's included. */
function components(boxes: Box[]): Component[] {
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const gablePairs: [number, number][] = [];
  boxes.forEach((a, i) => boxes.forEach((b, j) => {
    if (j <= i) return;
    if (joined(a, b)) parent[find(i)] = find(j);
    else if (gableJoined(a, b)) { parent[find(i)] = find(j); gablePairs.push([i, j]); }
  }));
  const groups = new Map<number, Component>();
  boxes.forEach((b, i) => {
    const g = groups.get(find(i)) ?? {boxes: [], gableContacts: 0};
    g.boxes.push(b);
    groups.set(find(i), g);
  });
  for (const [i] of gablePairs) {
    const g = groups.get(find(i));
    if (g) g.gableContacts++;
  }
  return [...groups.values()];
}

/** One axis's grid: each coordinate (dimension 0) then each gap's midpoint (dimension 1), and the gaps' midpoints alone. */
function axisGrid(values: number[]): {cells: [number, number][]; gaps: number[]} {
  const v = [...new Set(values)].sort((a, b) => a - b);
  const gaps = v.slice(1).map((x, i) => (v[i] + x) / 2);
  const cells = v.flatMap((x, i): [number, number][] => (i < gaps.length ? [[x, 0], [gaps[i], 1]] : [[x, 0]]));
  return {cells, gaps};
}

/** The neighbouring grid gaps of one cell coordinate: itself for a gap, the gaps either side for a grid line. */
const around = (c: number, dim: number, gaps: number[]): number[] =>
  dim === 1 ? [c] : [gaps.filter(g => g < c).at(-1), gaps.find(g => g > c)].filter((g): g is number => g !== undefined);

/** The Euler characteristic of the interior of a union of boxes. */
export function interiorEuler(boxes: Box[]): number {
  const X = axisGrid(boxes.flatMap(b => [b.x0, b.x1])), Y = axisGrid(boxes.flatMap(b => [b.y0, b.y1])), Z = axisGrid(boxes.flatMap(b => [b.z0, b.z1]));
  const solid = (x: number, y: number, z: number): boolean => boxes.some(b => b.x0 < x && x < b.x1 && b.y0 < y && y < b.y1 && b.z0 < z && z < b.z1);
  let chiC = 0;
  for (const [x, dx] of X.cells) {
    const ax = around(x, dx, X.gaps);
    for (const [y, dy] of Y.cells) {
      const ay = around(y, dy, Y.gaps);
      for (const [z, dz] of Z.cells) {
        const az = around(z, dz, Z.gaps);
        // A cell on the hull's edge has fewer than 2 neighbours on some axis, and lies on the union's boundary.
        if ((dx === 0 && ax.length < 2) || (dy === 0 && ay.length < 2) || (dz === 0 && az.length < 2)) continue;
        if (ax.every(gx => ay.every(gy => az.every(gz => solid(gx, gy, gz))))) chiC += (dx + dy + dz) % 2 ? -1 : 1;
      }
    }
  }
  return -chiC;
}

/**
 * Each component's predicted genus, highest first: 1 − χ, where χ is its boxes' interior less one per gable contact.
 * Reported for reading; the playtest check compares the summed figure only (decision 143, F3).
 */
export const predictedComponentGenera = (f: ShellFixture): number[] =>
  components(boxesOf(f)).map(c => 1 - (interiorEuler(c.boxes) - c.gableContacts)).sort((a, b) => b - a);

/** Manifold's single figure, summed over components: 1 − (components) + Σ genus. */
export function predictedGenus(f: ShellFixture): number {
  const g = predictedComponentGenera(f);
  return 1 - g.length + g.reduce((s, x) => s + x, 0);
}

/**
 * Every invariant of `shell-invariants.ts` for a build from a wire file, with its genus checked summed (decision 143,
 * F3): Manifold's summed figure against `predictedGenus`. `invariantViolations`'s own per-component genus check is
 * handed the measured list, so it never fires here; the summed check stands in for it, as its first line.
 */
export function wireInvariantViolations(b: ShellBuild, f: ShellFixture, cheeks: number): string[] {
  const out = invariantViolations(b, {genus: componentGenera(b.union.mesh), cheeks});
  const want = predictedGenus(f);
  return b.union.genus === want ? out : [`summed genus ${b.union.genus}, predicted ${want} from the Rings (journal decision 143)`, ...out];
}
