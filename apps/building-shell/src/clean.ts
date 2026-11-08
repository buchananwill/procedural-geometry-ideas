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
// - vertices nearer than the tolerance are clustered, regardless of connectivity (journal decision 122, F-C and G2;
//   decision 110's one-edge-at-a-time collapse and its link check refused valid unions);
// - zero-volume sheets, coincident opposite faces Manifold's union left unfused, are removed (decision 122, G1);
// - every cap left is flipped away across its long edge, as Manifold's `SwapDegenerates` does, where that leaves no
//   cap; otherwise its near-collinear apex merges into its long edge (journal decision 110, C2);
// - every vertex's total displacement is bounded (decision 122, F-D);
// - the result goes back through `Manifold.ofMesh` (in `union.ts`) to prove it is still a closed manifold.
import type {Mesh} from 'manifold-3d';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {Plane3, Vec3, samePlane} from './tags.ts';
import type {ShellMesh} from './mesh.ts';
import {UnionFind, makeUnionFind} from './halfedge.ts';
import {add3, cross3, dist3, dot3, lineOffset, lineParam, pointAt, scale3, sub3, unit3} from './vec3.ts';
import {SNAP_STEPS_PER_CM, TriIndices, WorkTri} from './weld.ts';

/**
 * The cleaning tolerance, in cm: four 1/1024 cm grid steps, about 3.9e-3 cm. Measured over the raw unions of the ten
 * fixtures, the 580 pitch-sweep cases and the 80 random Ring fixtures, it sits in a clear gap:
 * - **Above the noise and the snap cell.** Every edge under 0.05 cm is 1e-4 to 1.74e-3 cm long, and every cap under
 *   0.01 cm high is 1e-4 to 1e-3 cm high; the tolerance is 2.2 times the longest. It is also above a grid cell's
 *   diagonal, `sqrt(3) / 1024` (1.69e-3 cm): two points farther apart than that never snap to one grid point, so once
 *   no edge is shorter than the tolerance, no edge's two ends merge under `snapCm`.
 * - **Below every genuine feature and `SHELL_TOLERANCE_CM` (0.01 cm).** No edge is 2e-3 to 0.05 cm long, and the
 *   thinnest genuine triangle is 1.0e-2 cm high, 2.6 times the tolerance. No vertex moves further than
 *   `CLEAN_MAX_MOVE_CM`, the shell's tolerance, and a flip or an apex merge moves the surface less than this
 *   tolerance, so no feature step 4 resolves (every test there is at 0.01 cm) is changed.
 */
export const CLEAN_TOLERANCE_CM = 4 / SNAP_STEPS_PER_CM;

/**
 * The furthest the cleaning may move any vertex from its union position, every step together, in cm: the shell's
 * tolerance (journal decision 122, G2 and F-D; half of it refused valid unions). Clusters can chain, so one can span
 * more than `CLEAN_TOLERANCE_CM`; a vertex that would move further than this is a hard error, never moved.
 */
export const CLEAN_MAX_MOVE_CM = SHELL_TOLERANCE_CM;

export interface CleanStats {
  /** Vertices merged into another: by clustering, or a cap's apex into its long edge (C2). */
  merged: number;
  /** Triangles dropped because a merge collapsed two of their corners together. */
  collapsed: number;
  /** Caps flipped away across their long edge. */
  flipped: number;
  /** Triangles dropped as zero-volume sheets (journal decision 122, G1). */
  sheetTris: number;
  /** Cap chains dropped as zero-area pairs, where sliding the apex would pass the move bound (F-D). */
  pairs: number;
  /** Cap apexes that met their long edge's end part way, the bound short of the end (F-D). */
  met: number;
  /**
   * Largest total displacement of any vertex from its union position, every step together, in cm (F-D), read on the
   * float32 positions as written (journal decision 150, F5).
   */
  maxMoveCm: number;
}

/** The stats of a mesh the cleaning leaves as it is (journal decision 107, N10). */
export const NO_CLEAN: Readonly<CleanStats> = {merged: 0, collapsed: 0, flipped: 0, sheetTris: 0, pairs: 0, met: 0, maxMoveCm: 0};

/**
 * The cleaned mesh, what the cleaning did, and `vertexOf`: each input vertex's vertex in the cleaned mesh, or -1 where
 * no triangle keeps it, so a test can measure every move on the float32 positions as written (journal decision 150, F5).
 */
export interface CleanResult { mesh: ShellMesh; stats: CleanStats; vertexOf: Int32Array }

/** One float32 unit in the last place at `x`: the spacing of float32 values of `x`'s magnitude. */
export function float32Ulp(x: number): number {
  const a = Math.abs(x);
  return a < 2 ** -126 ? 2 ** -149 : 2 ** (Math.floor(Math.log2(a)) - 23);
}

/**
 * Journal decision 150, F5: how far short of the move bound the meeting point aims, for points of magnitude up to
 * `largest`: four float32 ulps there, wider than the rounding of the float32 write (half an ulp per axis, √3/2 in all),
 * so a point placed within the bound in double stays within it as written.
 */
export const meetMargin = (largest: number): number => 4 * float32Ulp(largest);

/** Journal decision 107, N10: a Manifold mesh read as a `ShellMesh`: float32 positions, triangles, faceIDs. */
export function meshOf(out: Mesh): ShellMesh {
  const positions = new Float32Array(3 * out.numVert);
  for (let v = 0; v < out.numVert; v++) for (let a = 0; a < 3; a++) positions[3 * v + a] = out.vertProperties[out.numProp * v + a];
  return {positions, tris: Uint32Array.from(out.triVerts), faceIDs: Uint32Array.from(out.faceID)};
}


/** A cap (journal decision 107, N13): its long edge `a` to `b`, in winding order, and the apex `c` lying on it. */
export interface CapTri { a: number; b: number; c: number }

/** The triangle `u` across a cap's long edge, and its corner `d` off that edge. */
export interface CapAcross { u: number; d: number }

/** A cap found in the working triangles: its index `t` and its shape. */
export interface CapAt { t: number; cap: CapTri }

/** A Manifold mesh vertex's position in the working (double) copy the cleaning moves. */
type Positions = Float64Array;

/** The undirected key of an edge between two vertices. */
const undirected = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

/**
 * Journal decision 145, N2: `stitchOpen` cannot close what a dropped cap pair leaves open. `tryDropPair` catches
 * exactly this, and every other error still fails the build.
 */
export class StitchRefusal extends Error {
  override name = 'StitchRefusal';
}

/**
 * Journal decision 122, F-C and G2: every pair of vertices nearer than `tol` joins one cluster, whatever the mesh's
 * connectivity, found through a spatial hash of `tol`-wide cells. Returns each vertex's cluster root, its lowest index.
 */
function clusterVertices(X: Positions, tol: number): (v: number) => number {
  const nV = X.length / 3;
  const uf = makeUnionFind(nV);
  const cell = (v: number, a: number): number => Math.floor(X[3 * v + a] / tol);
  const grid = new Map<string, number[]>();
  for (let v = 0; v < nV; v++) {
    const cx = cell(v, 0), cy = cell(v, 1), cz = cell(v, 2);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const w of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        if (Math.hypot(X[3 * v] - X[3 * w], X[3 * v + 1] - X[3 * w + 1], X[3 * v + 2] - X[3 * w + 2]) < tol) uf.join(v, w);
      }
    }
    const k = `${cx},${cy},${cz}`;
    const list = grid.get(k);
    if (list) list.push(v); else grid.set(k, [v]);
  }
  return uf.find;
}

/**
 * Cleans the union's output at `tol` (journal decisions 101, 110 and 122). Every vertex's total displacement from its
 * union position, by every step together, is reported in `maxMoveCm` and bounded by `CLEAN_MAX_MOVE_CM`, past which
 * the cleaning is a hard error. Vertices are renumbered in order of first use, unused ones dropped.
 * - **Clustering** (F-C, G2). Vertices nearer than `tol` are clustered regardless of connectivity, and every member
 *   takes its cluster's lowest-numbered vertex's position, so every position is one of the union's. Members joined
 *   by a mesh edge become one vertex, and the triangles left with two corners in one place are dropped. Members of one
 *   cluster on separate sheets keep their own vertex at the one position: a pinch, as Manifold writes one (C1).
 * - **Zero-volume sheets** (G1). Manifold's own union can leave coincident, opposite-facing faces unfused, as a
 *   pillow or a slit. Two triangles on the same three vertices wound opposite ways are dropped. Then, given each
 *   faceID's generating plane (`planes`), every edge-connected region of triangles on one oriented plane whose twin
 *   region on the opposite plane covers exactly the same ground (the same area, and each boundary on the other) is
 *   dropped with its twin. The boundary each leaves open is stitched to the other: their vertices within `tol` are
 *   welded, and every open edge holding another open vertex is split at it, as the weld's T-junction split is.
 * - **Caps.** A triangle whose height over its longest edge is under `tol` has its apex on that edge.
 *   - Where the triangle across that edge is no cap and flipping the edge leaves no cap, the edge flips to join the
 *     apex to the far corner across. The two new triangles cover the triangle across, so they take its faceID.
 *   - Otherwise the apex merges into the nearer end of its long edge (journal decision 110, C2), after the link
 *     condition and a check that no surviving triangle turns over or moves off its plane by `tol` or more. Where
 *     that end lies further than `CLEAN_MAX_MOVE_CM` from where the apex started, the two meet half way instead (F-D).
 * The result goes back through `Manifold.ofMesh` (in `union.ts`) to prove it is still a closed manifold.
 */
export function cleanMesh(mesh: ShellMesh, planes: readonly Plane3[] | null = null, tol: number = CLEAN_TOLERANCE_CM): CleanResult {
  const O = mesh.positions;
  const T = mesh.tris;
  const nV = O.length / 3;
  const X: Positions = Float64Array.from(O);
  const pt = (v: number): Vec3 => pointAt(X, v);
  const dist = (i: number, j: number): number => dist3(pt(i), pt(j));
  const setPos = (v: number, p: Vec3): void => { X[3 * v] = p[0]; X[3 * v + 1] = p[1]; X[3 * v + 2] = p[2]; };
  const stats: CleanStats = {...NO_CLEAN};
  /** Every original vertex's current vertex: its own, or the one it merged into. */
  const into = makeUnionFind(nV);
  let moved = false;

  let work: WorkTri[] = [];
  for (let t = 0; t < T.length / 3; t++) work.push([T[3 * t], T[3 * t + 1], T[3 * t + 2], mesh.faceIDs[t]]);

  /** Renames every corner through `to`, dropping the triangles that collapse. */
  const rename = (to: (v: number) => number): void => {
    const next: WorkTri[] = [];
    for (const [p, q, r, f] of work) {
      const [a, b, c] = [p, q, r].map(to);
      if (a === b || b === c || c === a) { stats.collapsed++; continue; }
      next.push([a, b, c, f]);
    }
    work = next;
  };

  // ---- Clustering (F-C, G2) ----
  const cluster = clusterVertices(X, tol);
  for (let v = 0; v < nV; v++) {
    const r = cluster(v);
    if (r !== v && (X[3 * v] !== X[3 * r] || X[3 * v + 1] !== X[3 * r + 1] || X[3 * v + 2] !== X[3 * r + 2])) { setPos(v, pt(r)); moved = true; }
  }
  for (const [a, b, c] of work) for (const [u, w] of [[a, b], [b, c], [c, a]]) if (cluster(u) === cluster(w)) into.join(u, w);
  const before = work.length;
  rename(into.find);
  for (let v = 0; v < nV; v++) if (into.find(v) !== v) stats.merged++;
  if (work.length !== before) moved = true;

  // ---- Zero-volume sheets (G1) ----
  const sheets = removeSheets(work, X, planes, tol, into);
  work = sheets.work;
  stats.sheetTris = sheets.dropped;
  if (sheets.dropped) moved = true;

  // ---- Caps ----
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
  /** The cap among triangle `p`, `q`, `r`: its long edge and apex, when its height over that edge is under `tol`. */
  const capOfCorners = (p: number, q: number, r: number): CapTri | null => {
    const rot: TriIndices[] = [[p, q, r], [q, r, p], [r, p, q]];
    const [a, b, c] = rot.reduce((best, x) => (dist(x[0], x[1]) > dist(best[0], best[1]) ? x : best));
    const twice = Math.hypot(...cross3(sub3(pt(b), pt(a)), sub3(pt(c), pt(a))));
    return twice / dist(a, b) < tol ? {a, b, c} : null;
  };
  const capOf = (t: number): CapTri | null => capOfCorners(work[t][0], work[t][1], work[t][2]);
  const normal = (p: number, q: number, r: number): Vec3 => unit3(cross3(sub3(pt(q), pt(p)), sub3(pt(r), pt(p))));
  /**
   * Whether moving vertex `v` to `to`, and with `gone` merged into it, keeps every surviving triangle facing its way and
   * within `tol` of its plane.
   */
  const moveKeepsSurface = (v: number, to: Vec3, gone: number): boolean => work.every(([p, q, r]) => {
    const vs = [p, q, r];
    if (!vs.includes(v) || (gone >= 0 && vs.includes(gone))) return true;
    const n0 = normal(p, q, r);
    const at = (x: number): Vec3 => (x === v ? to : pt(x));
    const twice = cross3(sub3(at(q), at(p)), sub3(at(r), at(p)));
    if (Math.hypot(...twice) === 0) return false;
    return dot3(n0, twice) > 0 && Math.abs(dot3(n0, sub3(to, pt(v)))) < tol;
  });
  /** The furthest any original vertex now merged into `v`, `v` itself included, would lie from where it started at `p`. */
  const reach = (v: number, p: Vec3): number => {
    let m = 0;
    for (let o = 0; o < nV; o++) if (into.find(o) === v) m = Math.max(m, dist3(p, pointAt(O, o)));
    return m;
  };

  /** The triangle across cap `t`'s long edge and its far corner. */
  const across = (t: number, {a, b}: CapTri): CapAcross => {
    const u = owner.get(key(b, a));
    if (u === undefined) throw new Error(`cleanMesh: cap ${t}'s long edge ${a}-${b} has no twin: the union is not closed`);
    const d = work[u].slice(0, 3).find(x => x !== a && x !== b);
    if (d === undefined) throw new Error(`cleanMesh: cap ${t}'s neighbour ${u} is degenerate`);
    return {u, d};
  };
  /**
   * A cap chain (C2) whose apex lies further along its long edge than the bound allows it to slide: cap `t` and the cap
   * across its long edge cover no area together, so both go, as a zero-volume sheet does, and what they leave open is
   * stitched (F-D). Nothing moves.
   */
  const tryDropPair = (t: number, cap: CapTri): boolean => {
    const {u} = across(t, cap);
    if (!capOf(u)) return false;
    const kept = work.filter((_, i) => i !== t && i !== u);
    let stitched: WorkTri[];
    try {
      stitched = stitchOpen(kept, X, tol, into);
    } catch (e) {
      if (e instanceof StitchRefusal) return false;
      throw e;
    }
    work = stitched;
    reown();
    stats.pairs++;
    moved = true;
    return true;
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
  /**
   * Merges cap `t`'s apex into the nearer end of its long edge, when the link and the surface allow it. Where the end
   * lies beyond `CLEAN_MAX_MOVE_CM` of where the apex and what merged into it started, apex and end meet half way.
   */
  const tryMerge = (cap: CapTri, meet: boolean): boolean => {
    const {a, b, c} = cap;
    const keep = dist(c, a) <= dist(c, b) ? a : b;
    if (!linkHolds(c, keep)) return false;
    let to = pt(keep);
    let meeting = false;
    if (reach(c, to) > CLEAN_MAX_MOVE_CM) {
      if (!meet) return false;
      // F-D: the apex goes as far towards the end as the bound allows, and the end comes the rest of the way.
      const P = pt(c), K = to;
      // Short of the bound by a margin wider than a float32 ulp (F5), so the float32 write cannot carry it past.
      const margin = meetMargin(Math.max(...P.map(Math.abs), ...K.map(Math.abs)));
      const s = Math.max(0, 1 - (CLEAN_MAX_MOVE_CM - margin - reach(c, P)) / dist(c, keep));
      to = add3(K, scale3(sub3(P, K), s));
      if (reach(c, to) > CLEAN_MAX_MOVE_CM || reach(keep, to) > CLEAN_MAX_MOVE_CM || !moveKeepsSurface(keep, to, c)) return false;
      meeting = true;
    }
    if (!moveKeepsSurface(c, to, keep)) return false;
    if (meeting) stats.met++;
    setPos(keep, to);
    into.join(keep, c);
    const root = into.find(keep);
    if (root !== keep) setPos(root, to);
    rename(into.find);
    reown();
    stats.merged++;
    moved = true;
    return true;
  };

  // Every cap that can flip cleanly flips first; only when none can does an apex merge (journal decision 110, C2), so
  // two caps sharing a long edge resolve from the side whose neighbour is sound.
  const limit = 4 * work.length;
  for (let steps = 0; ; steps++) {
    if (steps > limit) throw new Error(`cleanMesh: caps still changing after ${limit} steps`);
    const caps = work.map((_, t) => ({t, cap: capOf(t)})).filter((x): x is CapAt => x.cap !== null);
    if (!caps.length) break;
    if (caps.some(({t, cap}) => tryFlip(t, cap))) { moved = true; continue; }
    if (caps.some(({cap}) => tryMerge(cap, false))) continue;
    if (caps.some(({cap}) => tryMerge(cap, true))) continue;
    if (caps.some(({t, cap}) => tryDropPair(t, cap))) continue;
    const {t, cap} = caps[0];
    throw new Error(`cleanMesh: cap ${t} (${cap.a}-${cap.b}, apex ${cap.c}) can neither flip nor merge its apex into its long edge`);
  }

  // ---- The move bound (F-D), on the float32 positions as written (journal decision 150, F5) ----
  const used = new Set<number>();
  for (const [a, b, c] of work) { used.add(a); used.add(b); used.add(c); }
  const f32 = Math.fround;
  for (let o = 0; o < nV; o++) {
    const r = into.find(o);
    if (!used.has(r)) continue;
    const d = dist3(pointAt(X, r).map(f32) as Vec3, pointAt(O, o));
    stats.maxMoveCm = Math.max(stats.maxMoveCm, d);
    if (d > CLEAN_MAX_MOVE_CM) {
      throw new Error(`cleanMesh: vertex ${o} would move ${d.toExponential(3)} cm onto vertex ${r}, past ${CLEAN_MAX_MOVE_CM} cm`);
    }
  }
  if (!moved) {
    const vertexOf = Int32Array.from({length: nV}, (_, v) => (used.has(v) ? v : -1));
    return {mesh, stats, vertexOf};
  }

  const index = new Int32Array(nV).fill(-1);
  const positions: number[] = [];
  const tris: number[] = [];
  const faceIDs: number[] = [];
  const keepVertex = (v: number): number => {
    if (index[v] < 0) { index[v] = positions.length / 3; positions.push(X[3 * v], X[3 * v + 1], X[3 * v + 2]); }
    return index[v];
  };
  for (const [a, b, c, f] of work) { tris.push(keepVertex(a), keepVertex(b), keepVertex(c)); faceIDs.push(f); }
  const vertexOf = Int32Array.from({length: nV}, (_, o) => index[into.find(o)]);
  return {mesh: {positions: Float32Array.from(positions), tris: Uint32Array.from(tris), faceIDs: Uint32Array.from(faceIDs)}, stats, vertexOf};
}

/** What the sheet pass leaves: the triangles kept and how many it dropped. */
interface SheetResult { work: WorkTri[]; dropped: number }

/** An edge-connected region of triangles on one oriented plane: its triangles, boundary half-edges, and area. */
interface SheetRegion { tris: number[]; boundary: [number, number][]; area: number }

/**
 * Journal decision 122, G1: drops every zero-volume sheet from `work` and stitches what it leaves open (see
 * `cleanMesh`). Welds made while stitching are recorded in `into`.
 */
function removeSheets(
  work: WorkTri[], X: Positions, planes: readonly Plane3[] | null, tol: number, into: UnionFind,
): SheetResult {
  const pt = (v: number): Vec3 => pointAt(X, v);
  const area = (t: WorkTri): number => Math.hypot(...cross3(sub3(pt(t[1]), pt(t[0])), sub3(pt(t[2]), pt(t[0])))) / 2;
  const drop = new Set<number>();

  // Two triangles on one vertex triple wound opposite ways.
  const byTriple = new Map<string, number[]>();
  work.forEach((t, i) => {
    const k = [t[0], t[1], t[2]].sort((x, y) => x - y).join(',');
    const l = byTriple.get(k);
    if (l) l.push(i); else byTriple.set(k, [i]);
  });
  const winding = (t: WorkTri): string => { const m = Math.min(t[0], t[1], t[2]); const i = t.indexOf(m); return `${t[(i + 1) % 3]}`; };
  for (const l of byTriple.values()) {
    if (l.length !== 2) continue;
    if (winding(work[l[0]]) !== winding(work[l[1]])) { drop.add(l[0]); drop.add(l[1]); }
  }

  // Regions on opposite planes covering the same ground.
  if (planes) {
    const present = [...new Set(work.map(t => t[3]))];
    const flip = (p: Plane3): Plane3 => ({n: [-p.n[0], -p.n[1], -p.n[2]], d: -p.d});
    const done = new Set<number>();
    for (const f of present) {
      if (done.has(f)) continue;
      const side = present.filter(g => samePlane(planes[g], planes[f]));
      const opposite = present.filter(g => samePlane(planes[g], flip(planes[f])));
      side.forEach(g => done.add(g));
      opposite.forEach(g => done.add(g));
      if (!opposite.length) continue;
      const ra = regionsOf(work, drop, new Set(side), area);
      const rb = regionsOf(work, drop, new Set(opposite), area);
      for (const a of ra) {
        const b = rb.find(r => !r.tris.some(t => drop.has(t)) && sameGround(a, r, X, tol));
        if (!b || a.tris.some(t => drop.has(t))) continue;
        for (const t of [...a.tris, ...b.tris]) drop.add(t);
      }
    }
  }
  if (!drop.size) return {work, dropped: 0};

  return {work: stitchOpen(work.filter((_, i) => !drop.has(i)), X, tol, into), dropped: drop.size};
}

/** A union-find over vertices, as `cleanMesh` records merges in it. */

/**
 * Closes what dropping zero-volume triangles left open (journal decision 122, G1 and F-D): the open boundary's
 * vertices within `tol` of each other are welded (recorded in `into`), then every open edge holding another open
 * vertex within `tol` of it is split there, as the weld's T-junction split is, until every edge has its twin. A
 * boundary that will not close is a hard error, and leaves `X` and `into` as they were.
 */
function stitchOpen(work: WorkTri[], X: Positions, tol: number, into: UnionFind): WorkTri[] {
  const pt = (v: number): Vec3 => pointAt(X, v);
  let kept = work;
  /** Welds made here, applied to `into` and `X` only once the boundary closes. */
  const weld = new Map<number, number>();
  const root = (v: number): number => weld.get(into.find(v)) ?? into.find(v);
  const openEdges = (): [number, number, number][] => {
    const directed = new Set(kept.flatMap(([a, b, c]) => [`${a},${b}`, `${b},${c}`, `${c},${a}`]));
    const out: [number, number, number][] = [];
    kept.forEach(([a, b, c], t) => {
      for (const [u, v] of [[a, b], [b, c], [c, a]]) if (!directed.has(`${v},${u}`)) out.push([u, v, t]);
    });
    return out;
  };
  let open = openEdges();
  const openVs = [...new Set(open.flatMap(([u, v]) => [u, v]))];
  for (let i = 0; i < openVs.length; i++) {
    for (let j = i + 1; j < openVs.length; j++) {
      const ra = root(openVs[i]), rb = root(openVs[j]);
      if (ra === rb || Math.hypot(...sub3(pt(ra), pt(rb))) >= tol) continue;
      const lo = Math.min(ra, rb), hi = Math.max(ra, rb);
      for (const [k, v] of weld) if (v === hi) weld.set(k, lo);
      weld.set(hi, lo);
    }
  }
  kept = kept.flatMap(([p, q, r, f]): WorkTri[] => {
    const [a, b, c] = [p, q, r].map(root);
    return a === b || b === c || c === a ? [] : [[a, b, c, f]];
  });
  for (let guard = 0; ; guard++) {
    if (guard > 4 * kept.length) throw new StitchRefusal('cleanMesh: stitching a removed sheet does not terminate');
    open = openEdges();
    if (!open.length) break;
    const vs = [...new Set(open.flatMap(([u, v]) => [u, v]))];
    let split = false;
    for (const [u, v, t] of open) {
      const U = pt(u), V = pt(v);
      const L = Math.hypot(...sub3(V, U));
      const on = vs.filter(x => x !== u && x !== v).map(x => ({x, s: lineParam(pt(x), U, V)}))
        .filter(({x, s}) => s * L > tol && (1 - s) * L > tol && lineOffset(pt(x), U, V, s) < tol)
        .sort((m, n) => m.s - n.s);
      if (!on.length) continue;
      const [a, b, c, f] = kept[t];
      const w = [a, b, c].find(y => y !== u && y !== v);
      if (w === undefined) continue;
      const x = on[0].x;
      kept.splice(t, 1, [u, x, w, f], [x, v, w, f]);
      split = true;
      break;
    }
    if (!split) throw new StitchRefusal(`cleanMesh: a removed zero-volume sheet leaves ${open.length} edges open`);
  }
  for (const [v, r] of weld) {
    into.join(v, r);
    const to = pt(into.find(r));
    for (const x of [v, r]) { X[3 * x] = to[0]; X[3 * x + 1] = to[1]; X[3 * x + 2] = to[2]; }
  }
  return kept;
}

/** The edge-connected regions of the triangles of `work` whose faceID is in `ids`, leaving out those in `drop`. */
function regionsOf(work: WorkTri[], drop: Set<number>, ids: Set<number>, area: (t: WorkTri) => number): SheetRegion[] {
  const mine = work.map((t, i) => i).filter(i => ids.has(work[i][3]) && !drop.has(i));
  const byEdge = new Map<string, number[]>();
  for (const i of mine) {
    const [a, b, c] = work[i];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = undirected(u, v);
      const l = byEdge.get(k);
      if (l) l.push(i); else byEdge.set(k, [i]);
    }
  }
  const seen = new Set<number>();
  const out: SheetRegion[] = [];
  for (const i0 of mine) {
    if (seen.has(i0)) continue;
    const tris: number[] = [];
    const stack = [i0];
    seen.add(i0);
    while (stack.length) {
      const i = stack.pop() as number;
      tris.push(i);
      const [a, b, c] = work[i];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        for (const j of byEdge.get(undirected(u, v)) ?? []) if (!seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    const directed = new Set(tris.flatMap(i => { const [a, b, c] = work[i]; return [`${a},${b}`, `${b},${c}`, `${c},${a}`]; }));
    const boundary: [number, number][] = [];
    for (const i of tris) {
      const [a, b, c] = work[i];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) if (!directed.has(`${v},${u}`)) boundary.push([u, v]);
    }
    out.push({tris, boundary, area: tris.reduce((s, i) => s + area(work[i]), 0)});
  }
  return out;
}

/**
 * Whether two regions on opposite planes cover the same ground: their areas agree within `tol` times the longer
 * boundary, and every boundary vertex of each lies within `tol` of the other's boundary.
 */
function sameGround(a: SheetRegion, b: SheetRegion, X: Positions, tol: number): boolean {
  const pt = (v: number): Vec3 => pointAt(X, v);
  const perimeter = (r: SheetRegion): number => r.boundary.reduce((s, [u, v]) => s + Math.hypot(...sub3(pt(v), pt(u))), 0);
  if (Math.abs(a.area - b.area) > tol * Math.max(perimeter(a), perimeter(b))) return false;
  const onBoundary = (v: number, r: SheetRegion): boolean => r.boundary.some(([p, q]) => {
    const P = pt(p), Q = pt(q), V = pt(v);
    if (dot3(sub3(Q, P), sub3(Q, P)) === 0) return Math.hypot(...sub3(V, P)) < tol;
    const s = Math.max(0, Math.min(1, lineParam(V, P, Q)));
    return lineOffset(V, P, Q, s) < tol;
  });
  return a.boundary.every(([v]) => onBoundary(v, b)) && b.boundary.every(([v]) => onBoundary(v, a));
}
