// Between step 3 and step 4 (journal decision 101, F36): the union's float32 output is cleaned at a stated tolerance.
// Manifold computes its intersections in double precision from float32 inputs, so two raw parts' copies of one point
// can come out as distinct vertices 1e-4 cm apart, joined by a short edge, and a vertex meant to lie on an edge can
// come out a few 1e-4 cm off it, leaving a triangle of no height (a cap). Step 4 keys vertices on the 1/1024 cm grid
// and reads runs of edges at `SHELL_TOLERANCE_CM`, so both must go first.
//
// Manifold's own simplification cannot do it in manifold-3d 3.2.1: `simplify(tol)` and `setTolerance(tol)` raise the
// mesh's `tolerance_`, but its short-edge collapse and its degenerate-triangle swap are bounded by `epsilon_` (the
// float32 rounding of the inputs, about 7.7e-5 cm on these fixtures), so neither moves the 1e-4 cm features (measured:
// 39 vertices before and after on `probe10.mjs`'s fixture, at 0.002 and at 0.05). This is the equivalent, done here:
// - every edge shorter than the tolerance collapses, and the triangles left with two corners in one place are dropped;
// - every cap left is flipped away across its long edge, as Manifold's `SwapDegenerates` does;
// - the result goes back through `Manifold.ofMesh` (in `union.ts`) to prove it is still a closed manifold.
import {SHELL_TOLERANCE_CM} from './constants.ts';
import type {ShellMesh} from './union.ts';
import type {Vec3} from './tags.ts';
import {cross3, sub3} from './vec3.ts';
import {SNAP_STEPS_PER_CM} from './weld.ts';

/**
 * The cleaning tolerance, in cm: four 1/1024 cm grid steps, about 3.9e-3 cm. Measured over the raw unions of the ten
 * fixtures, the 580 pitch-sweep cases and the 80 random Ring fixtures, it sits in a clear gap:
 * - **Above the noise and the snap cell.** Every edge under 0.05 cm is 1e-4 to 1.74e-3 cm long, and every cap under
 *   0.01 cm high is 1e-4 to 1e-3 cm high; the tolerance is 2.2 times the longest. It is also above a grid cell's
 *   diagonal, `sqrt(3) / 1024` (1.69e-3 cm): two points farther apart than that never snap to one grid point, so once
 *   no edge is shorter than the tolerance, no edge's two ends merge under `snapCm`.
 * - **Below every genuine feature and `SHELL_TOLERANCE_CM` (0.01 cm).** No edge is 2e-3 to 0.05 cm long, and the
 *   thinnest genuine triangle is 1.0e-2 cm high, 2.6 times the tolerance. A collapse moves a vertex at most
 *   `CLEAN_MAX_MOVE_CM`, half the shell's tolerance, and a flip moves the surface less than this tolerance, so no
 *   feature step 4 resolves (every test there is at 0.01 cm) is changed.
 */
export const CLEAN_TOLERANCE_CM = 4 / SNAP_STEPS_PER_CM;

/**
 * The furthest the cleaning may move any vertex, in cm. Short edges can chain, so a cluster can span more than
 * `CLEAN_TOLERANCE_CM`; a cluster reaching further than this is a hard error, never merged.
 */
export const CLEAN_MAX_MOVE_CM = SHELL_TOLERANCE_CM / 2;

export interface CleanStats {
  /** Vertices merged into another. */
  merged: number;
  /** Triangles dropped because the merge collapsed two of their corners together. */
  collapsed: number;
  /** Caps flipped away across their long edge. */
  flipped: number;
  /** Largest distance any vertex moved, in cm. */
  maxMoveCm: number;
}

export interface CleanResult { mesh: ShellMesh; stats: CleanStats }

/** A triangle being cleaned: three vertex indices and its faceID. */
type CleanTri = [a: number, b: number, c: number, faceID: number];

/**
 * Cleans the union's output at `tol`, in two passes.
 * - **Collapse.** Each cluster of vertices joined by edges shorter than `tol` becomes its lowest-numbered member,
 *   whose position is kept, so every position is one of the union's. A triangle with two corners in one cluster is
 *   dropped; every other keeps its faceID.
 * - **Flip.** A triangle whose height over its longest edge is under `tol` has its third vertex on that edge: the edge
 *   is flipped to join that vertex to the far corner of the triangle across it. The two new triangles cover the
 *   triangle across, so they take its faceID; the cap, of no area, is gone.
 * Vertices are renumbered in order of first use, unused ones dropped.
 */
export function cleanMesh(mesh: ShellMesh, tol: number = CLEAN_TOLERANCE_CM): CleanResult {
  const P = mesh.positions;
  const T = mesh.tris;
  const nV = P.length / 3;
  const pt = (v: number): Vec3 => [P[3 * v], P[3 * v + 1], P[3 * v + 2]];
  const dist = (i: number, j: number): number => Math.hypot(P[3 * i] - P[3 * j], P[3 * i + 1] - P[3 * j + 1], P[3 * i + 2] - P[3 * j + 2]);

  // Collapse.
  const parent = Int32Array.from({length: nV}, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  for (let h = 0; h < T.length; h++) {
    const a = T[h], b = T[3 * Math.floor(h / 3) + (h % 3 + 1) % 3];
    if (dist(a, b) >= tol) continue;
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  const stats: CleanStats = {merged: 0, collapsed: 0, flipped: 0, maxMoveCm: 0};
  for (let v = 0; v < nV; v++) {
    const r = find(v);
    if (r === v) continue;
    stats.merged++;
    const d = dist(v, r);
    stats.maxMoveCm = Math.max(stats.maxMoveCm, d);
    if (d > CLEAN_MAX_MOVE_CM) {
      throw new Error(`cleanMesh: vertex ${v} would move ${d.toExponential(3)} cm onto vertex ${r}, past ${CLEAN_MAX_MOVE_CM} cm`);
    }
  }
  const work: CleanTri[] = [];
  for (let t = 0; t < T.length / 3; t++) {
    const a = find(T[3 * t]), b = find(T[3 * t + 1]), c = find(T[3 * t + 2]);
    if (a === b || b === c || c === a) { stats.collapsed++; continue; }
    work.push([a, b, c, mesh.faceIDs[t]]);
  }

  // Flip.
  const key = (a: number, b: number): string => `${a},${b}`;
  const owner = new Map<string, number>();
  const own = (t: number): void => {
    const [a, b, c] = work[t];
    owner.set(key(a, b), t); owner.set(key(b, c), t); owner.set(key(c, a), t);
  };
  const disown = (t: number): void => {
    const [a, b, c] = work[t];
    owner.delete(key(a, b)); owner.delete(key(b, c)); owner.delete(key(c, a));
  };
  work.forEach((_, t) => own(t));
  /** The triangle's long edge `(a, b)` and opposite corner `c`, when its height over that edge is under `tol`. */
  const capOf = (t: number): [a: number, b: number, c: number] | null => {
    const [p, q, r] = work[t];
    const rot: [number, number, number][] = [[p, q, r], [q, r, p], [r, p, q]];
    const [a, b, c] = rot.reduce((best, x) => (dist(x[0], x[1]) > dist(best[0], best[1]) ? x : best));
    const twice = Math.hypot(...cross3(sub3(pt(b), pt(a)), sub3(pt(c), pt(a))));
    return twice / dist(a, b) < tol ? [a, b, c] : null;
  };
  const limit = 4 * work.length;
  for (let changed = true; changed;) {
    changed = false;
    for (let t = 0; t < work.length; t++) {
      const cap = capOf(t);
      if (!cap) continue;
      const [a, b, c] = cap;
      const u = owner.get(key(b, a));
      if (u === undefined) throw new Error(`cleanMesh: cap ${t}'s long edge ${a}-${b} has no twin: the union is not closed`);
      const d = work[u].slice(0, 3).find(x => x !== a && x !== b);
      if (d === undefined || owner.has(key(c, d)) || owner.has(key(d, c))) continue; // a flip would duplicate an edge
      const f = work[u][3];
      disown(t); disown(u);
      work[t] = [a, d, c, f];
      work[u] = [d, b, c, f];
      own(t); own(u);
      stats.flipped++;
      changed = true;
      if (stats.flipped > limit) throw new Error(`cleanMesh: caps still flipping after ${limit} flips`);
    }
  }
  if (stats.merged === 0 && stats.flipped === 0) return {mesh, stats};

  const index = new Int32Array(nV).fill(-1);
  const positions: number[] = [];
  const tris: number[] = [];
  const faceIDs: number[] = [];
  const keep = (v: number): number => {
    if (index[v] < 0) { index[v] = positions.length / 3; positions.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); }
    return index[v];
  };
  for (const [a, b, c, f] of work) { tris.push(keep(a), keep(b), keep(c)); faceIDs.push(f); }
  return {mesh: {positions: Float32Array.from(positions), tris: Uint32Array.from(tris), faceIDs: Uint32Array.from(faceIDs)}, stats};
}
