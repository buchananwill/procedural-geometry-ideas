// ISSUE-building-shell-mixed-pitch-island-folded-roof.md (BSA.F105, BSA.D326): single-loop islands of mixed pitch whose
// roof the skeleton folds. RED BY DESIGN (BSA.D266): each test asserts what a sound roof is, on the final union mesh
// alone, and fails because the roof built is not. A cure turns them green; none is pinned as it builds today.
//
// The property, read only from the union's output triangles tagged Roof: on a sampling grid over the storey's plan, and
// at the plan centroid of every Roof triangle, a point inside the footprint is covered by exactly one Roof triangle and a
// point outside it by none; and no Roof triangle faces down. A single storey of hipped Rings has no other roof, so each
// of these holds of every sound build.
import {describe, expect, it} from 'vitest';
import {RingSides, ring} from '../src/fixture.ts';
import type {Rect} from '../src/roof/model.ts';
import {ShellUnion, unionShell} from '../src/union.ts';
import {shellFixture} from './test-builds.ts';

/** One Ring of a specimen: its rectangle and its sides' pitches in degrees, S, E, N, W. */
type SpecimenRing = readonly [rect: Rect, s: number, e: number, n: number, w: number];

/** A specimen of the issue note, one storey, every side hipped at its own pitch. */
interface Specimen { name: string; rings: readonly SpecimenRing[]; wrong: string }

/** The reviewer's three specimens (BSA.F105), each as the issue note gives it. */
const SPECIMENS: readonly Specimen[] = [
  {name: 'S13R20', wrong: 'Roof folded over itself: three layers over one plan point, one facing down', rings: [
    [[150, 750, 650, 1000], 30, 30, 22.5, 37], [[300, 550, 750, 800], 60, 30, 30, 22.5],
    [[700, 550, 1150, 1100], 60, 30, 30, 37], [[150, 350, 700, 950], 52.5, 30, 60, 60],
  ]},
  {name: 'S7R26', wrong: 'Roof folded over itself, a triangle facing down', rings: [
    [[450, 0, 950, 150], 30, 37, 52.5, 60], [[550, 500, 1150, 1100], 37, 22.5, 22.5, 30], [[600, 150, 1100, 600], 22.5, 30, 60, 60],
  ]},
  {name: 'S15R29', wrong: 'Roof standing outside the footprint', rings: [
    [[150, 600, 400, 800], 52.5, 37, 37, 45], [[300, 300, 650, 750], 22.5, 60, 60, 30],
    [[750, 0, 1000, 450], 52.5, 37, 60, 22.5], [[550, 600, 750, 800], 37, 52.5, 22.5, 60],
  ]},
  // Not the reviewer's: draw 4902 of node 9's closing-pass fuzz of the same recipe. The three above each throw later, in
  // Cell laying, with an error that names a Cell and not the roof; this one builds its whole shell with no error at all.
  {name: 'M4902', wrong: 'Roof folded over itself, two triangles facing down, and the whole shell built with no error', rings: [
    [[800, 350, 1400, 550], 30, 60, 52.5, 52.5], [[850, 0, 1250, 600], 52.5, 22.5, 22.5, 30],
    [[800, 600, 1300, 850], 60, 52.5, 45, 22.5], [[450, 850, 900, 1050], 60, 30, 37, 22.5],
  ]},
];

const specimenFixture = (s: Specimen) => shellFixture(s.name, s.rings.map(([rect, S, E, N, W]) => {
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
function roofViolations(u: ShellUnion, rects: readonly Rect[]): string[] {
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

describe('single-loop islands of mixed pitch (ISSUE-building-shell-mixed-pitch-island-folded-roof.md): red until cured', () => {
  it.each(SPECIMENS.map(s => [s.name, s] as const))('%s: its Roof covers the footprint exactly once in plan, faces up, and stands on the footprint', async (_, s) => {
    const u = await unionShell(specimenFixture(s));
    expect(roofViolations(u, s.rings.map(r => r[0])), `${s.name} builds ${s.wrong}`).toEqual([]);
  });

  // The checker's own control: a single-loop island of mixed pitch the skeleton roofs soundly passes it, so a red test
  // above is its specimen's roof and not the checker.
  it('passes a sound mixed-pitch L, the control', async () => {
    const control: Specimen = {name: 'MixedPitchLControl', wrong: '', rings: [[[0, 0, 1000, 400], 30, 45, 30, 60], [[600, 0, 1000, 800], 30, 22.5, 45, 30]]};
    const u = await unionShell(specimenFixture(control));
    expect(roofViolations(u, control.rings.map(r => r[0]))).toEqual([]);
  });
});
