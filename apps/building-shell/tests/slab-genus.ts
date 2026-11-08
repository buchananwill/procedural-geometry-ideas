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
// Genus is predicted per connected component (spec decision 32 as amended by journal decision 135): a component's
// genus is 1 − χ of its interior. Manifold's own figure sums over components, 1 − (components) + Σ genus, which is what
// `invariantViolations` asserts until it asserts per component.
//
// Not covered: a roof tall enough to reach a storey two above its own where the storey between is absent, filling a
// tunnel the boxes leave open (the correctness review's `TallRoofThroughTunnel60`: predicted 1, measured 0). The genus
// check reports it.
import type {ShellFixture} from '../src/fixture.ts';
import * as invariants from './shell-invariants.ts';
import type {ShellExpectation} from './shell-invariants.ts';

interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

const boxesOf = (f: ShellFixture): Box[] =>
  f.rings.map(r => ({x0: r.rect[0], y0: r.rect[1], x1: r.rect[2], y1: r.rect[3], z0: r.baseStorey, z1: r.baseStorey + r.storeys}));

/** The length of the overlap of two closed intervals, negative when they are apart. */
const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.min(a1, b1) - Math.max(a0, b0);

/** Whether two boxes meet in a contact of positive area: overlapping on at least two axes, touching on the third. */
function joined(a: Box, b: Box): boolean {
  const o = [overlap(a.x0, a.x1, b.x0, b.x1), overlap(a.y0, a.y1, b.y0, b.y1), overlap(a.z0, a.z1, b.z0, b.z1)];
  return o.every(v => v >= 0) && o.filter(v => v > 0).length >= 2;
}

/** The boxes grouped into components by positive-area contact. */
function components(boxes: Box[]): Box[][] {
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  boxes.forEach((a, i) => boxes.forEach((b, j) => { if (j > i && joined(a, b)) parent[find(i)] = find(j); }));
  const groups = new Map<number, Box[]>();
  boxes.forEach((b, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), b]));
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

/** Spec decision 32 as amended by decision 135: each component's predicted genus, 1 − χ of its interior, highest first. */
export const predictedComponentGenera = (f: ShellFixture): number[] => components(boxesOf(f)).map(c => 1 - interiorEuler(c)).sort((a, b) => b - a);

/** Manifold's single figure, summed over components: 1 − (components) + Σ genus. */
export function predictedGenus(f: ShellFixture): number {
  const g = predictedComponentGenera(f);
  return 1 - g.length + g.reduce((s, x) => s + x, 0);
}

/**
 * The genus `invariantViolations` should be handed for a fixture. WP3.7 is landing a per-component
 * `ShellExpectation.genus` (a list, highest first, decision 135) alongside its `componentGenera`; until it lands the
 * expectation is Manifold's one summed figure. The two agree on one component. Once WP3.7 lands, this returns
 * `predictedComponentGenera` alone.
 */
export function expectedGenus(f: ShellFixture): ShellExpectation['genus'] {
  const perComponent = 'componentGenera' in invariants;
  return (perComponent ? predictedComponentGenera(f) : predictedGenus(f)) as ShellExpectation['genus'];
}
