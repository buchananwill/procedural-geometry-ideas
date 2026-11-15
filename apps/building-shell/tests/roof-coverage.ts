// The roof-coverage checker of ISSUE-building-shell-mixed-pitch-island-folded-roof.md (BSA.F105, BSA.D326), shared by
// `mixed-pitch-island.test.ts` and `mixed-pitch-layouts.test.ts`.
//
// The property, read only from the union's output triangles tagged Roof: on a sampling grid over the storey's plan, and
// at the plan centroid of every Roof triangle, a point inside the footprint is covered by exactly one Roof triangle and a
// point outside it by none; and no Roof triangle faces down. A single storey of hipped Rings has no other roof, so each
// of these holds of every sound build.
import {RingSides, ring} from '../src/fixture.ts';
import type {Rect} from '../src/roof/model.ts';
import type {ShellUnion} from '../src/union.ts';
import {shellFixture} from './test-builds.ts';

/** One Ring of a single-storey layout: its rectangle and its sides' pitches in degrees, S, E, N, W. */
export type HippedRing = readonly [rect: Rect, s: number, e: number, n: number, w: number];

/** A layout of hipped Rings, one storey, every side hipped at its own pitch. */
export const hippedFixture = (name: string, rings: readonly HippedRing[]) => shellFixture(name, rings.map(([rect, S, E, N, W]) => {
  const sides: RingSides = {S: {form: 'hip', deg: S}, E: {form: 'hip', deg: E}, N: {form: 'hip', deg: N}, W: {form: 'hip', deg: W}};
  return ring(rect, 0, 1, 30, sides);
}));

/**
 * The sampling grid's step, in cm, and its offsets from the 50 cm lattice in x and in y, unequal so that no sample lies
 * on a wall's line or on a 45 degree hip from a lattice corner.
 */
const GRID_STEP_CM = 5;
const GRID_OFFSET_X_CM = 0.37;
const GRID_OFFSET_Y_CM = 0.29;
/** How far a point may lie outside every Ring and still count as on the footprint's boundary. */
const BOUNDARY_TOL_CM = 0.01;
/** A Roof triangle whose plan area is below this many cm², signed, faces down. */
const DOWN_AREA_CM2 = -1e-3;

type Tri = readonly [readonly number[], readonly number[], readonly number[]];
const planArea = (a: readonly number[], b: readonly number[], c: readonly number[]): number =>
  ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
const at = (x: number, y: number): string => `(${x.toFixed(2)}, ${y.toFixed(2)})`;

/** Every way the union's Roof fails the property above, as text; empty for a sound roof. */
export function roofViolations(u: ShellUnion, rects: readonly Rect[]): string[] {
  const P = u.mesh.positions, T = u.mesh.tris;
  const roof: Tri[] = [];
  for (let t = 0; t < T.length / 3; t++) {
    if (u.triTags[t].kind !== 'Roof') continue;
    const v = (j: number): number[] => { const i = 3 * T[3 * t + j]; return [P[i], P[i + 1], P[i + 2]]; };
    roof.push([v(0), v(1), v(2)]);
  }
  const out: string[] = [];
  const down = roof.filter(([a, b, c]) => planArea(a, b, c) < DOWN_AREA_CM2);
  if (down.length) {
    const [a, b, c] = down[0];
    out.push(`${down.length} Roof triangles face down, the first with its plan centroid at ${at((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3)}`);
  }
  const onFootprint = (x: number, y: number): boolean =>
    rects.some(([x0, y0, x1, y1]) => x >= x0 - BOUNDARY_TOL_CM && x <= x1 + BOUNDARY_TOL_CM && y >= y0 - BOUNDARY_TOL_CM && y <= y1 + BOUNDARY_TOL_CM);
  /**
   * The heights of the Roof triangles over plan point (x, y): those holding it strictly inside, or, with `edges`, those
   * holding it on their boundary too, so that a point on a hip or valley between two faces is not read as bare.
   */
  const layers = (x: number, y: number, edges = false): number[] => roof.flatMap(([a, b, c]) => {
    const d = planArea(a, b, c);
    if (Math.abs(d) < 1e-9) return [];
    const eps = edges ? -1e-9 : 1e-9;
    const l1 = planArea([x, y], b, c) / d, l2 = planArea(a, [x, y], c) / d, l3 = 1 - l1 - l2;
    return l1 > eps && l2 > eps && l3 > eps ? [l1 * a[2] + l2 * b[2] + l3 * c[2]] : [];
  });
  const samples: [number, number][] = roof.map(([a, b, c]) => [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]);
  const xs = rects.flatMap(r => [r[0], r[2]]), ys = rects.flatMap(r => [r[1], r[3]]);
  for (let x = Math.min(...xs) - 50 + GRID_OFFSET_X_CM; x < Math.max(...xs) + 50; x += GRID_STEP_CM) {
    for (let y = Math.min(...ys) - 50 + GRID_OFFSET_Y_CM; y < Math.max(...ys) + 50; y += GRID_STEP_CM) samples.push([x, y]);
  }
  const over: string[] = [], bare: string[] = [], outside: string[] = [];
  for (const [x, y] of samples) {
    const zs = layers(x, y);
    if (!onFootprint(x, y)) { if (zs.length) outside.push(at(x, y)); continue; }
    if (zs.length > 1) over.push(`${at(x, y)} at z ${zs.map(z => z.toFixed(2)).join(' / ')}`);
    if (!layers(x, y, true).length) bare.push(at(x, y));
  }
  if (over.length) out.push(`${over.length} plan points under more than one Roof layer, the first ${over[0]}`);
  if (bare.length) out.push(`${bare.length} plan points of the footprint under no Roof, the first ${bare[0]}`);
  if (outside.length) out.push(`${outside.length} plan points outside the footprint under Roof, the first ${outside[0]}`);
  return out;
}
