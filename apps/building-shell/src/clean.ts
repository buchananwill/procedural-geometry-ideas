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
// - every edge shorter than the tolerance collapses, one at a time, each after a link-condition check (journal
//   decision 110, C8), and the triangles left with two corners in one place are dropped;
// - every cap left is flipped away across its long edge, as Manifold's `SwapDegenerates` does, where that leaves no
//   cap; otherwise its near-collinear apex merges into its long edge (journal decision 110, C2);
// - the result goes back through `Manifold.ofMesh` (in `union.ts`) to prove it is still a closed manifold.
import type {Mesh} from 'manifold-3d';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {nextHalf} from './halfedge.ts';
import type {Vec3} from './tags.ts';
import type {ShellMesh} from './union.ts';
import {cross3, dot3, sub3} from './vec3.ts';
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
 *   `CLEAN_MAX_MOVE_CM`, half the shell's tolerance, and a flip or an apex merge moves the surface less than this
 *   tolerance, so no feature step 4 resolves (every test there is at 0.01 cm) is changed.
 */
export const CLEAN_TOLERANCE_CM = 4 / SNAP_STEPS_PER_CM;

/**
 * The furthest a short-edge collapse may move any vertex, in cm. Short edges can chain, so a cluster can span more
 * than `CLEAN_TOLERANCE_CM`; a cluster reaching further than this is a hard error, never merged.
 */
export const CLEAN_MAX_MOVE_CM = SHELL_TOLERANCE_CM / 2;

export interface CleanStats {
  /** Vertices merged into another: by a short-edge collapse, or a cap's apex into its long edge (C2). */
  merged: number;
  /** Triangles dropped because a merge collapsed two of their corners together. */
  collapsed: number;
  /** Caps flipped away across their long edge. */
  flipped: number;
  /** Largest distance a short-edge collapse moved any vertex, in cm. */
  maxMoveCm: number;
}

/** The stats of a mesh the cleaning leaves as it is (journal decision 107, N10). */
export const NO_CLEAN: Readonly<CleanStats> = {merged: 0, collapsed: 0, flipped: 0, maxMoveCm: 0};

export interface CleanResult { mesh: ShellMesh; stats: CleanStats }

/** Journal decision 107, N10: a Manifold mesh read as a `ShellMesh`: float32 positions, triangles, faceIDs. */
export function meshOf(out: Mesh): ShellMesh {
  const positions = new Float32Array(3 * out.numVert);
  for (let v = 0; v < out.numVert; v++) for (let a = 0; a < 3; a++) positions[3 * v + a] = out.vertProperties[out.numProp * v + a];
  return {positions, tris: Uint32Array.from(out.triVerts), faceIDs: Uint32Array.from(out.faceID)};
}

/** A triangle being cleaned: three vertex indices and its faceID. */
type CleanTri = [a: number, b: number, c: number, faceID: number];

/** A cap (journal decision 107, N13): its long edge `a` to `b`, in winding order, and the apex `c` lying on it. */
export interface CapTri { a: number; b: number; c: number }

/**
 * Cleans the union's output at `tol`, in two passes.
 * - **Collapse.** Edges shorter than `tol` collapse one at a time, each into its lower-numbered end, whose position is
 *   kept, so every position is one of the union's. Before each, the link condition is checked: the two ends' common
 *   neighbours must be exactly the far corners of the two triangles on the edge, or the collapse would pinch the
 *   surface, which is a hard error (journal decision 110, C8). A triangle left with two corners in one place is
 *   dropped; every other keeps its faceID.
 * - **Caps.** A triangle whose height over its longest edge is under `tol` has its apex on that edge.
 *   - Where the triangle across that edge is no cap and flipping the edge leaves no cap, the edge flips to join the
 *     apex to the far corner across. The two new triangles cover the triangle across, so they take its faceID.
 *   - Otherwise the apex merges into the nearer end of its long edge (journal decision 110, C2), after the link
 *     condition and a check that no surviving triangle turns over or moves off its plane by `tol` or more.
 * Vertices are renumbered in order of first use, unused ones dropped.
 */
export function cleanMesh(mesh: ShellMesh, tol: number = CLEAN_TOLERANCE_CM): CleanResult {
  const P = mesh.positions;
  const T = mesh.tris;
  const nV = P.length / 3;
  const pt = (v: number): Vec3 => [P[3 * v], P[3 * v + 1], P[3 * v + 2]];
  const dist = (i: number, j: number): number => Math.hypot(P[3 * i] - P[3 * j], P[3 * i + 1] - P[3 * j + 1], P[3 * i + 2] - P[3 * j + 2]);
  const stats: CleanStats = {...NO_CLEAN};

  let work: CleanTri[] = [];
  for (let t = 0; t < T.length / 3; t++) work.push([T[3 * t], T[3 * t + 1], T[3 * t + 2], mesh.faceIDs[t]]);

  /** The link condition for edge `a`-`b` in `work`: their common neighbours are the far corners of its triangles. */
  const linkHolds = (a: number, b: number): boolean => {
    const na = new Set<number>(), nb = new Set<number>(), far = new Set<number>();
    for (const [p, q, r] of work) {
      const vs = [p, q, r];
      const hasA = vs.includes(a), hasB = vs.includes(b);
      if (hasA) vs.forEach(v => na.add(v));
      if (hasB) vs.forEach(v => nb.add(v));
      if (hasA && hasB) vs.forEach(v => { if (v !== a && v !== b) far.add(v); });
    }
    const common = [...na].filter(v => v !== a && v !== b && nb.has(v));
    return common.length === far.size && common.every(v => far.has(v));
  };
  /** Replaces vertex `gone` by `keep` everywhere, dropping the triangles that collapse. */
  const merge = (gone: number, keep: number): void => {
    const next: CleanTri[] = [];
    for (const [p, q, r, f] of work) {
      const [a, b, c] = [p, q, r].map(v => (v === gone ? keep : v));
      if (a === b || b === c || c === a) { stats.collapsed++; continue; }
      next.push([a, b, c, f]);
    }
    work = next;
  };

  // Collapse, one short edge at a time.
  const repOf = Int32Array.from({length: nV}, (_, i) => i);
  const rep = (v: number): number => {
    while (repOf[v] !== v) v = repOf[v];
    return v;
  };
  const short: [number, number][] = [];
  for (let h = 0; h < T.length; h++) {
    const a = T[h], b = T[nextHalf(h)];
    if (a < b && dist(a, b) < tol) short.push([a, b]);
  }
  for (const [a0, b0] of short) {
    const a = rep(a0), b = rep(b0);
    if (a === b) continue;
    if (!linkHolds(a, b)) throw new Error(`cleanMesh: collapsing the short edge ${a0}-${b0} would pinch the surface`);
    const keep = Math.min(a, b), gone = Math.max(a, b);
    repOf[gone] = keep;
    merge(gone, keep);
    stats.merged++;
  }
  for (let v = 0; v < nV; v++) {
    const r = rep(v);
    if (r === v) continue;
    const d = dist(v, r);
    stats.maxMoveCm = Math.max(stats.maxMoveCm, d);
    if (d > CLEAN_MAX_MOVE_CM) {
      throw new Error(`cleanMesh: vertex ${v} would move ${d.toExponential(3)} cm onto vertex ${r}, past ${CLEAN_MAX_MOVE_CM} cm`);
    }
  }

  // Caps.
  const key = (a: number, b: number): string => `${a},${b}`;
  let owner = new Map<string, number>();
  const own = (t: number): void => {
    const [a, b, c] = work[t];
    owner.set(key(a, b), t); owner.set(key(b, c), t); owner.set(key(c, a), t);
  };
  const disown = (t: number): void => {
    const [a, b, c] = work[t];
    owner.delete(key(a, b)); owner.delete(key(b, c)); owner.delete(key(c, a));
  };
  const reown = (): void => { owner = new Map(); work.forEach((_, t) => own(t)); };
  reown();
  /** The cap among triangle `p`, `q`, `r`: its long edge and apex, when its height over that edge is under `tol`. */
  const capOfCorners = (p: number, q: number, r: number): CapTri | null => {
    const rot: [number, number, number][] = [[p, q, r], [q, r, p], [r, p, q]];
    const [a, b, c] = rot.reduce((best, x) => (dist(x[0], x[1]) > dist(best[0], best[1]) ? x : best));
    const twice = Math.hypot(...cross3(sub3(pt(b), pt(a)), sub3(pt(c), pt(a))));
    return twice / dist(a, b) < tol ? {a, b, c} : null;
  };
  const capOf = (t: number): CapTri | null => capOfCorners(work[t][0], work[t][1], work[t][2]);
  const normal = (p: number, q: number, r: number): Vec3 => {
    const n = cross3(sub3(pt(q), pt(p)), sub3(pt(r), pt(p)));
    const L = Math.hypot(...n);
    return [n[0] / L, n[1] / L, n[2] / L];
  };
  /** Whether merging `gone` into `keep` keeps every surviving triangle facing its way and within `tol` of its plane. */
  const mergeKeepsSurface = (gone: number, keep: number): boolean => work.every(([p, q, r]) => {
    const vs = [p, q, r];
    if (!vs.includes(gone) || vs.includes(keep)) return true;
    const before = normal(p, q, r);
    const [a, b, c] = vs.map(v => (v === gone ? keep : v));
    const twice = Math.hypot(...cross3(sub3(pt(b), pt(a)), sub3(pt(c), pt(a))));
    if (twice === 0) return false;
    return dot3(before, normal(a, b, c)) > 0 && Math.abs(dot3(before, sub3(pt(keep), pt(gone)))) < tol;
  });

  /** The triangle across cap `t`'s long edge and its far corner. */
  const across = (t: number, {a, b}: CapTri): {u: number; d: number} => {
    const u = owner.get(key(b, a));
    if (u === undefined) throw new Error(`cleanMesh: cap ${t}'s long edge ${a}-${b} has no twin: the union is not closed`);
    const d = work[u].slice(0, 3).find(x => x !== a && x !== b);
    if (d === undefined) throw new Error(`cleanMesh: cap ${t}'s neighbour ${u} is degenerate`);
    return {u, d};
  };
  /** Flips cap `t` when the triangle across is no cap and the flip leaves none: one cap fewer, none made. */
  const tryFlip = (t: number, cap: CapTri): boolean => {
    const {a, b, c} = cap;
    const {u, d} = across(t, cap);
    if (capOf(u) || owner.has(key(c, d)) || owner.has(key(d, c)) || capOfCorners(a, d, c) || capOfCorners(d, b, c)) return false;
    const f = work[u][3];
    disown(t); disown(u);
    work[t] = [a, d, c, f];
    work[u] = [d, b, c, f];
    own(t); own(u);
    stats.flipped++;
    return true;
  };
  /** Merges cap `t`'s apex into the nearer end of its long edge, when the link and the surface allow it. */
  const tryMerge = (cap: CapTri): boolean => {
    const {a, b, c} = cap;
    const keep = dist(c, a) <= dist(c, b) ? a : b;
    if (!linkHolds(c, keep) || !mergeKeepsSurface(c, keep)) return false;
    merge(c, keep);
    reown();
    stats.merged++;
    return true;
  };

  // Every cap that can flip cleanly flips first; only when none can does an apex merge (journal decision 110, C2), so
  // two caps sharing a long edge resolve from the side whose neighbour is sound.
  const limit = 4 * work.length;
  for (let steps = 0; ; steps++) {
    if (steps > limit) throw new Error(`cleanMesh: caps still changing after ${limit} steps`);
    const caps = work.map((_, t) => ({t, cap: capOf(t)})).filter((x): x is {t: number; cap: CapTri} => x.cap !== null);
    if (!caps.length) break;
    if (caps.some(({t, cap}) => tryFlip(t, cap))) continue;
    if (caps.some(({cap}) => tryMerge(cap))) continue;
    const {t, cap} = caps[0];
    throw new Error(`cleanMesh: cap ${t} (${cap.a}-${cap.b}, apex ${cap.c}) can neither flip nor merge its apex into its long edge`);
  }
  if (stats.merged === 0 && stats.flipped === 0) return {mesh, stats};

  const index = new Int32Array(nV).fill(-1);
  const positions: number[] = [];
  const tris: number[] = [];
  const faceIDs: number[] = [];
  const keepVertex = (v: number): number => {
    if (index[v] < 0) { index[v] = positions.length / 3; positions.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); }
    return index[v];
  };
  for (const [a, b, c, f] of work) { tris.push(keepVertex(a), keepVertex(b), keepVertex(c)); faceIDs.push(f); }
  return {mesh: {positions: Float32Array.from(positions), tris: Uint32Array.from(tris), faceIDs: Uint32Array.from(faceIDs)}, stats};
}
