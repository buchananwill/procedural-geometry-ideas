// Step 4, second part: the shell's Edges read off the manifold's edges (spec decisions 19 to 21), the net's vertex
// records (journal decision 58) and the NetEdge record (journal decision 59).
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {FaceAssembly, FaceSource, destOf, meshPoint, originOf, prevHalf, triOf} from './faces.ts';
import {FaceTag, ShellKind, Vec3, samePlane} from './tags.ts';
import {dist3, dot3, lineDistance, lineParam, sub3} from './vec3.ts';
import {snapCm} from './weld.ts';

/**
 * Spec decision 21 as amended (journal decision 44): exactly these 21 members. The first 16 are Piste Perfect's
 * `EModularEdgeKind`, in its order; the last 5 are new.
 */
export const EDGE_KINDS = [
  'WallVertical', 'WallHorizontal', 'FloorLine', 'ExternalCorner', 'InternalCorner', 'RingJunction', 'Eaves',
  'RoofInterior', 'WallPlate', 'GableHorizontal', 'GableVertical', 'Verge', 'Ridge', 'Hip', 'Valley', 'GroundLine',
  'RoofSeam', 'GableSloped', 'SoffitEdge', 'SoffitJunction', 'Unclassified',
] as const;

export type EdgeKind = typeof EDGE_KINDS[number];

/** The names not in `EModularEdgeKind` (spec decision 21), which the report lists as such when it emits them. */
export const NEW_EDGE_KINDS: readonly EdgeKind[] = ['RoofSeam', 'GableSloped', 'SoffitEdge', 'SoffitJunction', 'Unclassified'];

/** Spec decision 19: a maximal straight run of manifold edges with the same two ShellFaces either side. */
export interface ShellEdge {
  id: number;
  kind: EdgeKind;
  /** The run's ends as the manifold carries them; `faces[0]` lies on the left of `a` to `b` seen from outside. */
  a: Vec3;
  b: Vec3;
  /** The endpoint vertex ids, `a`'s first. */
  v: [number, number];
  /** The two faces, the lower id first. */
  faces: [number, number];
}

/** Journal decision 59: the segment between two consecutive vertices along any Cell side. */
export interface NetEdge {
  id: number;
  kind: EdgeKind;
  v: [number, number];
  /** The one or two Cells it borders: one where the far face has no Cells. */
  cells: number[];
  /** The ShellEdge it lies on, or -1 for an interior lattice side. */
  shellEdge: number;
}

/** Journal decisions 58 to 60: every ShellEdge endpoint and every Cell corner, with its incidences in cyclic order. */
export interface ShellVertex {
  id: number;
  /** On the 1/1024 cm grid (spec decision 11). */
  p: Vec3;
  /** NetEdge ids, counter-clockwise seen from outside. */
  edges: number[];
  /** Cell ids, counter-clockwise seen from outside. */
  cells: number[];
  /** Face ids, counter-clockwise seen from outside. */
  faces: number[];
}

// ---- Vertices ---------------------------------------------------------------------------------------------------

/** A list with at least one member. */
export type NonEmpty<T> = [T, ...T[]];

/** A fresh copy of a non-empty list, so a registered origin never shares its list with the caller's. */
export const copyNonEmpty = <T>(xs: NonEmpty<T>): NonEmpty<T> => [xs[0], ...xs.slice(1)];

/**
 * A vertex of the net found at mesh vertices ending ShellEdges. `vertices` is one mesh vertex, or several at one exact
 * position `point` where Manifold writes a non-manifold pinch as coincident vertices with no edge between them
 * (journal decision 110, C1): each is one sheet of the surface through the point.
 */
export interface MeshOrigin {
  at: 'mesh';
  vertices: NonEmpty<number>;
  point: Vec3;
  /**
   * The ShellEdges this vertex lies inside, as a T-point (journal decision 96, F1). Where two storeys' solids touch
   * along an edge (journal decision 140, F5), the face across can run straight past the vertex without it in its
   * triangles, so its fans miss that edge's faces.
   */
  inside?: number[];
}

/**
 * A vertex of the net found inside ShellEdges: one, or two coincident ones where a pinch's two sheets share a segment
 * (journal decision 110, C1).
 */
export interface EdgeOrigin { at: 'edge'; edges: NonEmpty<number> }

/** A vertex of the net found inside a face: an interior lattice corner. */
export interface FaceOrigin { at: 'face'; face: number }

/** Where a vertex was first found: at mesh vertices ending ShellEdges, inside ShellEdges, or inside a face. */
export type VertexOrigin = MeshOrigin | EdgeOrigin | FaceOrigin;

/** The origin of a vertex first found at mesh vertex `vertex`, at `point`. */
export const meshOrigin = (vertex: number, point: Vec3): MeshOrigin => ({at: 'mesh', vertices: [vertex], point});

/**
 * Every vertex of the net, keyed by its snapped position (journal decision 58): two points are one vertex exactly
 * when `snapCm` gives them the same three coordinates.
 */
export interface VertexRegistry {
  positions: Vec3[];
  origins: VertexOrigin[];
  byKey: Map<string, number>;
}

export const makeVertexRegistry = (): VertexRegistry => ({positions: [], origins: [], byKey: new Map()});

export const snapPoint = (p: Vec3): Vec3 => [snapCm(p[0]), snapCm(p[1]), snapCm(p[2])];

const pointKey = (p: Vec3): string => `${p[0]},${p[1]},${p[2]}`;

/** Two points at one exact position. */
const samePoint = (p: Vec3, q: Vec3): boolean => p[0] === q[0] && p[1] === q[1] && p[2] === q[2];

/**
 * The id of the vertex at `p`, registering it on first sight.
 * - Two mesh vertices at one exact position are one pinched vertex (journal decision 110, C1): the second joins the
 *   first's origin as another sheet. The cleaning leaves no edge shorter than its tolerance, so no edge joins them.
 * - Two distinct mesh vertices at different positions snapping to one grid point would merge two ShellEdge
 *   endpoints, so that is a hard error.
 */
export function vertexAt(reg: VertexRegistry, p: Vec3, origin: VertexOrigin): number {
  const s = snapPoint(p);
  const k = pointKey(s);
  const got = reg.byKey.get(k);
  if (got !== undefined) {
    const o = reg.origins[got];
    if (origin.at === 'mesh' && o.at === 'mesh') {
      for (const v of origin.vertices) {
        if (o.vertices.includes(v)) continue;
        if (!samePoint(o.point, origin.point)) {
          throw new Error(`vertex (${k}): mesh vertices ${o.vertices.join(', ')} and ${v} snap to one grid point`);
        }
        o.vertices.push(v);
      }
    } else if (origin.at === 'mesh') {
      reg.origins[got] = {...origin, vertices: copyNonEmpty(origin.vertices)};
    } else if (origin.at === 'edge' && o.at === 'edge') {
      for (const e of origin.edges) if (!o.edges.includes(e)) o.edges.push(e);
    }
    return got;
  }
  if (origin.at === 'mesh') origin = {...origin, vertices: copyNonEmpty(origin.vertices)};
  if (origin.at === 'edge') origin = {at: 'edge', edges: copyNonEmpty(origin.edges)};
  reg.positions.push(s);
  reg.origins.push(origin);
  reg.byKey.set(k, reg.positions.length - 1);
  return reg.positions.length - 1;
}

/** The id of the vertex at `p` if one is registered. */
export const findVertex = (reg: VertexRegistry, p: Vec3): number | undefined => reg.byKey.get(pointKey(snapPoint(p)));

// ---- Classification (spec decisions 20 and 21) ---------------------------------------------------------------------

/** The flat test's bound on `|dot(nA, nB) - 1|` (spec decision 20). */
export const FLAT_DOT_TOL = 1e-6;

/** Decision 20's outcome: `Indeterminate` when the edge is not flat and `q` lies within tolerance of A's plane. */
export type EdgeShape = 'Flat' | 'Convex' | 'Concave' | 'Indeterminate';

/**
 * Spec decision 20, stated once. `nA` and `nB` are the faces' outward unit normals; `lift` is `dot(nA, q - p)` for
 * `p` on the edge and `q` the vertex of B's incident triangle opposite the edge. The flat test runs first.
 */
export function edgeShape(nA: Vec3, nB: Vec3, lift: number): EdgeShape {
  if (Math.abs(dot3(nA, nB) - 1) < FLAT_DOT_TOL) return 'Flat';
  if (lift < -SHELL_TOLERANCE_CM) return 'Convex';
  if (lift > SHELL_TOLERANCE_CM) return 'Concave';
  return 'Indeterminate';
}

/** What the edge table reads besides the two tags. */
export interface EdgeGeometry {
  shape: EdgeShape;
  /** z extent within tolerance. */
  horizontal: boolean;
  /** Plan extent within tolerance. */
  vertical: boolean;
  /** The edge's height, read when it is horizontal. */
  z: number;
}

/** Spec decision 21 as amended (journal decision 77): a Cheek reads as a Gable for the edge table. */
const tableKind = (k: ShellKind): ShellKind => (k === 'Cheek' ? 'Gable' : k);

/**
 * Spec decision 21's table, read for the unordered pair of tags. A cell marked none, and any pair not in the table,
 * gives `Unclassified`. `storeyHeight` places a Gable's own plate at `(storey + 1) * storeyHeight`.
 */
export function classifyEdge(ta: FaceTag, tb: FaceTag, g: EdgeGeometry, storeyHeight: number): EdgeKind {
  const a = tableKind(ta.kind), b = tableKind(tb.kind);
  const is = (x: ShellKind, y: ShellKind): boolean => (a === x && b === y) || (a === y && b === x);
  const {shape, horizontal, vertical} = g;
  const byShape = (flat: EdgeKind | null, convex: EdgeKind | null, concave: EdgeKind | null): EdgeKind =>
    (shape === 'Flat' ? flat : shape === 'Convex' ? convex : shape === 'Concave' ? concave : null) ?? 'Unclassified';
  if (is('Roof', 'Roof')) return byShape('RoofSeam', horizontal ? 'Ridge' : 'Hip', 'Valley');
  if (is('Roof', 'Wall')) return byShape(null, 'Eaves', 'RingJunction');
  if (is('Roof', 'Gable')) return byShape(null, 'Verge', 'RingJunction');
  if (is('Wall', 'Wall')) return byShape(horizontal ? 'FloorLine' : 'WallVertical', 'ExternalCorner', 'InternalCorner');
  if (is('Wall', 'Gable')) {
    const gable = tableKind(ta.kind) === 'Gable' ? ta : tb;
    const atPlate = horizontal && Math.abs(g.z - (gable.storey + 1) * storeyHeight) <= SHELL_TOLERANCE_CM;
    const flat: EdgeKind = atPlate ? 'WallPlate' : horizontal ? 'GableHorizontal' : vertical ? 'GableVertical' : 'GableSloped';
    return byShape(flat, 'ExternalCorner', 'InternalCorner');
  }
  if (is('Gable', 'Gable')) {
    // WP3.7, F50 (for the lead's ruling on spec 21): a flat Gable-Gable edge that is neither vertical nor horizontal is
    // `GableSloped`, as the Wall-Gable row reads it. It arises wherever a lower storey's gable rises above the plate of
    // the storey over it on the same wall line: the lower Gable wins its own triangle (decision 14), and its rake is a
    // sloped seam between two storeys' Gable faces on one plane. The table gave such an edge as none.
    const flat: EdgeKind = vertical ? 'GableVertical' : horizontal ? 'GableHorizontal' : 'GableSloped';
    return byShape(flat, 'ExternalCorner', 'InternalCorner');
  }
  if (is('Wall', 'Ground') || is('Gable', 'Ground')) return byShape(null, 'GroundLine', null);
  if (is('Wall', 'Underside')) return byShape(null, 'SoffitEdge', 'SoffitJunction');
  // Journal decision 146, F52 (for the lead's ruling on spec 21): a roof rising into the storey floor above it, as
  // BridgeOverBlock's block hip meets the bridge's floor from 40 degrees up. Every such edge measured is concave and
  // horizontal, at the floor. The Underside row's precedent names its concave junction `SoffitJunction`, so a soffit's
  // every concave boundary takes one name, whatever meets it; no convex or flat Roof-Underside edge has been seen.
  if (is('Roof', 'Underside')) return byShape(null, null, 'SoffitJunction');
  return 'Unclassified';
}

// ---- ShellEdges -------------------------------------------------------------------------------------------------

/** The ShellEdges and, per edge, the mesh vertices its run passes through and the half-edges it is made of. */
export interface EdgeAssembly {
  edges: ShellEdge[];
  /** Per edge: its run's mesh vertices, `a` first. */
  runs: number[][];
  /** Per edge: its manifold half-edges, each in `faces[0]`'s triangle. */
  halves: number[][];
  /** Every mesh vertex that ends a ShellEdge. */
  endpoints: Set<number>;
}

/**
 * Journal decision 110, C5: a chain of points cut into maximal straight runs, as `[start, end)` ranges of its edges
 * (edge `i` runs from `points[i]` to `points[i + 1]`). A run grows while every point inside it lies within
 * `SHELL_TOLERANCE_CM` of its final chord, from its first point to its last; measured segment by segment instead, a
 * chain drifting a little at each vertex could bow far off its chord unseen.
 */
export function straightRuns(points: Vec3[]): [start: number, end: number][] {
  const out: [number, number][] = [];
  const n = points.length - 1;
  let start = 0;
  while (start < n) {
    let end = start + 1;
    while (end < n && points.slice(start + 1, end + 1).every(p => lineDistance(p, points[start], points[end + 1]) <= SHELL_TOLERANCE_CM)) end++;
    out.push([start, end]);
    start = end;
  }
  return out;
}

/**
 * Decision 20's `dot(nA, q - p)` over one manifold half-edge `h` of face A: `p` is the edge's midpoint, `q` the vertex
 * of B's triangle (the twin's) opposite the edge.
 */
export function liftAcross(src: FaceSource, asm: FaceAssembly, h: number, nA: Vec3): number {
  const {tris, positions} = src.mesh;
  const g = asm.topo.twin[h];
  const a = meshPoint(positions, originOf(tris, h)), b = meshPoint(positions, destOf(tris, h));
  const q = meshPoint(positions, originOf(tris, prevHalf(g)));
  const p: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return dot3(nA, sub3(q, p));
}

/**
 * One straight piece a ShellEdge is chained from: a manifold half-edge of its lower face, or a segment of a tuck's rim
 * read through the tuck (journal decision 272).
 */
interface EdgeSeg {
  /** Its ends' chaining keys: mesh vertex indices for a half-edge, snapped positions on a rim. */
  from: string;
  to: string;
  /** Its ends' snapped-position keys, which a face pair with a rim segment chains on. */
  fromAt: string;
  toAt: string;
  a: Vec3;
  b: Vec3;
  /** The mesh vertices at each end: one for a half-edge; at a rim, every rim vertex of either layer there. */
  at: [NonEmpty<number>, NonEmpty<number>];
  /** Decision 20's `dot(nA, q - p)` over it. */
  lift: number;
  /** The half-edge of the lower face's triangle it lies on. */
  half: number;
}

/** A position's chaining key on a rim: its point on the 1/1024 cm grid. */
const atKey = (p: Vec3): string => `@${pointKey(snapPoint(p))}`;

/** A mesh vertex's place for an error: its position on the 1/1024 cm grid. */
const placeOf = (p: Vec3): string => `(${snapPoint(p).join(', ')})`;

/** Whether faces' oriented planes are each other's reverse: a fold, where the surface turns back through 180 degrees. */
const backToBack = (asm: FaceAssembly, f: number, g: number): boolean => dot3(asm.planes[f].n, asm.planes[g].n) + 1 < FLAT_DOT_TOL;

/**
 * Journal decision 272: a fold left between two faces that are not both a tuck's layers is an unlabelled tuck, a hard
 * error naming its place and both faces.
 */
function foldError(src: FaceSource, asm: FaceAssembly, h: number, f: number, g: number): Error {
  const {tris, positions} = src.mesh;
  const a = meshPoint(positions, originOf(tris, h)), b = meshPoint(positions, destOf(tris, h));
  const face = (x: number): string => `face ${x} (${asm.identities[x]})`;
  return new Error(`a fold from ${placeOf(a)} to ${placeOf(b)} between ${face(f)} and ${face(g)}: a tuck left unlabelled`);
}

/** One half-edge of a tuck's rim: in real face `real`'s triangle, its twin in Tuck face `tuck`. */
interface RimHalf { h: number; real: number; tuck: number; a: Vec3; b: Vec3 }

/**
 * Journal decision 272: a tuck's rim read through the tuck. On every rim line one layer meets a real face X and the
 * other layer a real face Y, and the true building has one edge there, X against Y. Each rim half-edge is paired with
 * the rim half-edges of the tuck's other layer lying on its line, and cut at their ends; each piece is one segment of
 * the face pair X, Y, made once, from the lower face's side, so it chains with that pair's own half-edges.
 * - Its `q` (decision 20) is the vertex of Y's triangle across Y's rim half-edge.
 * - A rim piece with no face, or more than one, across the tuck is a hard error naming its place: the true building's
 *   edge there is not clear.
 * - A piece whose X and Y are one face, or one identity on one plane, is no edge of the true building, and yields none.
 * - A rim half-edge back to back with its Tuck face is a fold the labelling missed, and a hard error.
 */
function rimSegments(src: FaceSource, asm: FaceAssembly, rim: number[]): {pair: [number, number]; seg: EdgeSeg}[] {
  const {tris, positions} = src.mesh;
  const P = (v: number): Vec3 => meshPoint(positions, v);
  const halves: RimHalf[] = rim.map(h => ({h, real: asm.triFace[triOf(h)], tuck: asm.triFace[triOf(asm.topo.twin[h])], a: P(originOf(tris, h)), b: P(destOf(tris, h))}));
  for (const r of halves) if (backToBack(asm, r.real, r.tuck)) throw foldError(src, asm, r.h, r.real, r.tuck);
  const tol = SHELL_TOLERANCE_CM;
  const out: {pair: [number, number]; seg: EdgeSeg}[] = [];
  for (const r of halves) {
    const L = dist3(r.a, r.b);
    if (L <= tol) continue;
    const across = halves.filter(o => backToBack(asm, o.tuck, r.tuck) && lineDistance(o.a, r.a, r.b) <= tol && lineDistance(o.b, r.a, r.b) <= tol);
    const span = (o: RimHalf): [number, number] => {
      const u = lineParam(o.a, r.a, r.b), w = lineParam(o.b, r.a, r.b);
      return u < w ? [u, w] : [w, u];
    };
    // Breakpoints along r: its ends, and every end of a rim half-edge across lying inside it.
    const stops: {u: number; p: Vec3}[] = [{u: 0, p: r.a}, {u: 1, p: r.b}];
    for (const o of across) for (const p of [o.a, o.b]) { const u = lineParam(p, r.a, r.b); if (u * L > tol && (1 - u) * L > tol) stops.push({u, p}); }
    stops.sort((x, y) => x.u - y.u);
    const kept = stops.filter((s, i) => i === 0 || (s.u - stops[i - 1].u) * L > tol);
    if ((1 - kept[kept.length - 1].u) * L <= tol) kept[kept.length - 1] = stops[stops.length - 1];
    for (let i = 0; i + 1 < kept.length; i++) {
      const s0 = kept[i], s1 = kept[i + 1];
      const mid = (s0.u + s1.u) / 2;
      const by = across.filter(o => { const [lo, hi] = span(o); return mid > lo && mid < hi; });
      const where = `a tuck's rim from ${placeOf(s0.p)} to ${placeOf(s1.p)} on face ${r.real} (${asm.identities[r.real]})`;
      if (by.length !== 1) throw new Error(`${where}: ${by.length} faces across the tuck, so the true building's edge there is not clear`);
      const o = by[0];
      // Both layers meet one face, or one identity on one plane: the true building's surface runs on, with no edge.
      if (o.real === r.real || (asm.identities[o.real] === asm.identities[r.real] && samePlane(asm.planes[o.real], asm.planes[r.real]))) continue;
      if (r.real > o.real) continue;
      const atEnd = (p: Vec3): NonEmpty<number> => {
        const k = atKey(p);
        const vs = [...new Set([r, ...across].flatMap(x => [[x.a, originOf(tris, x.h)], [x.b, destOf(tris, x.h)]] as [Vec3, number][])
          .filter(([q]) => atKey(q) === k).map(([, v]) => v))].sort((x, y) => x - y);
        if (!vs.length) throw new Error(`${where}: no mesh vertex at its end ${placeOf(p)}`);
        return [vs[0], ...vs.slice(1)];
      };
      const a = s0.p, b = s1.p;
      const q = P(originOf(tris, prevHalf(o.h)));
      const p: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const lift = dot3(asm.planes[r.real].n, sub3(q, p));
      out.push({pair: [r.real, o.real], seg: {from: atKey(a), to: atKey(b), fromAt: atKey(a), toAt: atKey(b), a, b, at: [atEnd(a), atEnd(b)], lift, half: r.h}});
    }
  }
  return out;
}

/**
 * Spec decision 19: every manifold edge between two different faces, grouped by the face pair and chained into
 * maximal straight runs. A run breaks where its chain branches, or where it would bring a vertex further than
 * `SHELL_TOLERANCE_CM` from its own final chord (`straightRuns`). Each run is classified by decisions 20 and 21: `q` is
 * read over every manifold edge of the run, and the one furthest from A's plane decides.
 *
 * Journal decision 272: a manifold edge between two Tuck faces (a fold, or a seam inside one layer) is no ShellEdge. A
 * tuck's rim is read through the tuck (`rimSegments`): its segments join the half-edges of the face pair they belong
 * to, and that pair chains on snapped positions, since its two layers' vertices are separate mesh vertices. A fold
 * between two faces that are not both Tuck is a hard error.
 */
export function buildShellEdges(src: FaceSource, asm: FaceAssembly, reg: VertexRegistry, storeyHeight: number): EdgeAssembly {
  const {tris, positions} = src.mesh;
  const P = (v: number): Vec3 => meshPoint(positions, v);
  const isTuck = (f: number): boolean => asm.faces[f].tag.kind === 'Tuck';
  // Directed segments per face pair, each a half-edge of the lower face.
  const groups = new Map<string, EdgeSeg[]>();
  const add = (k: string, s: EdgeSeg): void => {
    const list = groups.get(k);
    if (list) list.push(s); else groups.set(k, [s]);
  };
  const rim: number[] = [];
  for (let h = 0; h < tris.length; h++) {
    const f = asm.triFace[triOf(h)], g = asm.triFace[triOf(asm.topo.twin[h])];
    if (f === g || (isTuck(f) && isTuck(g))) continue;
    if (isTuck(f) || isTuck(g)) { if (isTuck(g)) rim.push(h); continue; }
    if (f > g) continue;
    if (backToBack(asm, f, g)) throw foldError(src, asm, h, f, g);
    const o = originOf(tris, h), d = destOf(tris, h);
    const a = P(o), b = P(d);
    add(`${f}|${g}`, {from: `${o}`, to: `${d}`, fromAt: atKey(a), toAt: atKey(b), a, b, at: [[o], [d]], lift: liftAcross(src, asm, h, asm.planes[f].n), half: h});
  }
  const withRim = new Set<string>();
  for (const {pair: [f, g], seg} of rimSegments(src, asm, rim)) {
    const k = f < g ? `${f}|${g}` : `${g}|${f}`;
    add(k, seg);
    withRim.add(k);
  }

  const edges: ShellEdge[] = [];
  const runs: number[][] = [];
  const halves: number[][] = [];
  const endpoints = new Set<number>();
  for (const [k, segs] of groups) {
    const [fa, fb] = k.split('|').map(Number);
    const rimmed = withRim.has(k);
    const from = (s: EdgeSeg): string => (rimmed ? s.fromAt : s.from);
    const to = (s: EdgeSeg): string => (rimmed ? s.toAt : s.to);
    const outOf = new Map<string, EdgeSeg[]>();
    const inDeg = new Map<string, number>();
    for (const s of segs) {
      const list = outOf.get(from(s));
      if (list) list.push(s); else outOf.set(from(s), [s]);
      inDeg.set(to(s), (inDeg.get(to(s)) ?? 0) + 1);
    }
    const through = (v: string): boolean => (outOf.get(v)?.length ?? 0) === 1 && inDeg.get(v) === 1;
    const used = new Set<EdgeSeg>();
    /** Walks a chain of segments from `s0` while its vertices are pass-through, stopping at `s0` on a cycle. */
    const walk = (s0: EdgeSeg): EdgeSeg[] => {
      const chain = [s0];
      used.add(s0);
      let s = s0;
      for (;;) {
        const d = to(s);
        if (!through(d)) break;
        const nxt = (outOf.get(d) ?? [])[0];
        if (nxt === undefined || used.has(nxt)) break;
        chain.push(nxt);
        used.add(nxt);
        s = nxt;
      }
      return chain;
    };
    const chains: EdgeSeg[][] = [];
    for (const s of segs) if (!used.has(s) && !through(from(s))) chains.push(walk(s));
    // What is left is closed cycles. Rotate each to start at a bend, so the split below never runs across its seam.
    for (const s of segs) {
      if (used.has(s)) continue;
      const cyc = walk(s);
      const bendAt = cyc.findIndex((ss, i) => {
        const prev = cyc[(i - 1 + cyc.length) % cyc.length];
        return lineDistance(ss.a, prev.a, ss.b) > SHELL_TOLERANCE_CM;
      });
      if (bendAt < 0) throw new Error(`faces ${fa} and ${fb}: a closed run of manifold edges with no bend`);
      chains.push([...cyc.slice(bendAt), ...cyc.slice(0, bendAt)]);
    }
    for (const chain of chains) {
      // Split the chain into straight runs, each measured against its own final chord (journal decision 110, C5).
      const points = [chain[0].a, ...chain.map(s => s.b)];
      for (const [s, e] of straightRuns(points)) {
        const piece = chain.slice(s, e);
        const first = piece[0], last = piece[piece.length - 1];
        edges.push(makeEdge(asm, reg, edges.length, fa, fb, piece, storeyHeight));
        runs.push([first.at[0][0], ...piece.map(x => x.at[1][0])]);
        halves.push(piece.map(x => x.half));
        first.at[0].forEach(v => endpoints.add(v));
        last.at[1].forEach(v => endpoints.add(v));
      }
    }
  }
  return {edges, runs, halves, endpoints};
}

function makeEdge(asm: FaceAssembly, reg: VertexRegistry, id: number, fa: number, fb: number, piece: EdgeSeg[], storeyHeight: number): ShellEdge {
  const first = piece[0], last = piece[piece.length - 1];
  const a = first.a, b = last.b;
  const nA = asm.planes[fa].n, nB = asm.planes[fb].n;
  // The manifold edge whose B triangle reaches furthest from A's plane decides the sign.
  const lift = piece.map(s => s.lift).reduce((best, x) => (Math.abs(x) > Math.abs(best) ? x : best), 0);
  const geometry: EdgeGeometry = {
    shape: edgeShape(nA, nB, lift),
    horizontal: Math.abs(a[2] - b[2]) <= SHELL_TOLERANCE_CM,
    vertical: Math.hypot(a[0] - b[0], a[1] - b[1]) <= SHELL_TOLERANCE_CM,
    z: (a[2] + b[2]) / 2,
  };
  const kind = classifyEdge(asm.faces[fa].tag, asm.faces[fb].tag, geometry, storeyHeight);
  const origin = (vs: NonEmpty<number>, p: Vec3): MeshOrigin => ({at: 'mesh', vertices: vs, point: p});
  const v: [number, number] = [vertexAt(reg, a, origin(first.at[0], a)), vertexAt(reg, b, origin(last.at[1], b))];
  return {id, kind, a, b, v, faces: [fa, fb]};
}

/**
 * The triangles around a mesh vertex, counter-clockwise seen from outside, read from the manifold's triangle fan, and
 * the faces they make. `faces` drops a face's repeat only where its triangles follow each other, so a face meeting
 * the vertex twice is named twice (journal decision 96, F3); `faceAt[i]` is the index in `faces` of `halves[i]`'s face.
 */
export interface FaceFan {
  /** Per triangle of the fan: its half-edge leaving the vertex. */
  halves: number[];
  faces: number[];
  faceAt: number[];
}

export function faceFan(src: FaceSource, asm: FaceAssembly, vertex: number, start: number = asm.topo.out[vertex]): FaceFan {
  const h0 = start;
  const halves: number[] = [];
  let h = h0;
  do {
    halves.push(h);
    // The next triangle counter-clockwise owns the reverse of this triangle's edge into the vertex.
    h = asm.topo.twin[prevHalf(h)];
    if (halves.length > src.mesh.tris.length) throw new Error(`faceFan: vertex ${vertex}'s fan does not close`);
  } while (h !== h0);
  const tf = halves.map(x => asm.triFace[triOf(x)]);
  // Start the face runs where the face changes, so the first and last run are never one face split by the seam.
  const n = tf.length;
  const shift = Math.max(0, tf.findIndex((f, i) => f !== tf[(i - 1 + n) % n]));
  const order = Array.from({length: n}, (_, i) => (i + shift) % n);
  const faces: number[] = [];
  const faceAt = new Array<number>(n);
  for (const i of order) {
    if (!faces.length || faces[faces.length - 1] !== tf[i]) faces.push(tf[i]);
    faceAt[i] = faces.length - 1;
  }
  return {halves, faces, faceAt};
}

/**
 * Every triangle fan around a mesh vertex. A manifold vertex has one. Where two solids touch only along an edge or at
 * a point, Manifold can write both sheets through one vertex (journal decision 140, F5), whose half-edges then form
 * one fan per sheet: each is read from its own first half-edge, the fans in order of that half-edge.
 */
export function vertexFans(src: FaceSource, asm: FaceAssembly, vertex: number): FaceFan[] {
  const {tris} = src.mesh;
  const fans: FaceFan[] = [];
  const seen = new Set<number>();
  for (let h = 0; h < tris.length; h++) {
    if (originOf(tris, h) !== vertex || seen.has(h)) continue;
    const fan = faceFan(src, asm, vertex, h);
    fan.halves.forEach(x => seen.add(x));
    fans.push(fan);
  }
  return fans;
}
