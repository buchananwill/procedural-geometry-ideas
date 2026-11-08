// Step 4, second part: the shell's Edges read off the manifold's edges (spec decisions 19 to 21), the net's vertex
// records (journal decision 58) and the NetEdge record (journal decision 59).
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {FaceAssembly, FaceSource, destOf, meshPoint, originOf, prevHalf, triOf} from './faces.ts';
import {FaceTag, ShellKind, Vec3} from './tags.ts';
import {dot3, lineDistance, sub3} from './vec3.ts';
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
      reg.origins[got] = {at: 'mesh', vertices: copyNonEmpty(origin.vertices), point: origin.point};
    } else if (origin.at === 'edge' && o.at === 'edge') {
      for (const e of origin.edges) if (!o.edges.includes(e)) o.edges.push(e);
    }
    return got;
  }
  if (origin.at === 'mesh') origin = {at: 'mesh', vertices: copyNonEmpty(origin.vertices), point: origin.point};
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
 * Spec decision 19: every manifold edge between two different faces, grouped by the face pair and chained into
 * maximal straight runs. A run breaks where its chain branches, or where it would bring a vertex further than
 * `SHELL_TOLERANCE_CM` from its own final chord (`straightRuns`). Each run is classified by decisions 20 and 21: `q` is
 * read over every manifold edge of the run, and the one furthest from A's plane decides.
 */
export function buildShellEdges(src: FaceSource, asm: FaceAssembly, reg: VertexRegistry, storeyHeight: number): EdgeAssembly {
  const {tris, positions} = src.mesh;
  const P = (v: number): Vec3 => meshPoint(positions, v);
  // Directed segments per face pair, each a half-edge of the lower face.
  const groups = new Map<string, number[]>();
  for (let h = 0; h < tris.length; h++) {
    const f = asm.triFace[triOf(h)], g = asm.triFace[triOf(asm.topo.twin[h])];
    if (f >= g) continue;
    const k = `${f}|${g}`;
    const list = groups.get(k);
    if (list) list.push(h); else groups.set(k, [h]);
  }

  const edges: ShellEdge[] = [];
  const runs: number[][] = [];
  const halves: number[][] = [];
  const endpoints = new Set<number>();
  for (const [k, hs] of groups) {
    const [fa, fb] = k.split('|').map(Number);
    const outOf = new Map<number, number[]>();
    const inDeg = new Map<number, number>();
    for (const h of hs) {
      const o = originOf(tris, h);
      const list = outOf.get(o);
      if (list) list.push(h); else outOf.set(o, [h]);
      inDeg.set(destOf(tris, h), (inDeg.get(destOf(tris, h)) ?? 0) + 1);
    }
    const through = (v: number): boolean => (outOf.get(v)?.length ?? 0) === 1 && inDeg.get(v) === 1;
    const used = new Set<number>();
    /** Walks a chain of half-edges from `h0` while its vertices are pass-through, stopping at `h0` on a cycle. */
    const walk = (h0: number): number[] => {
      const chain = [h0];
      used.add(h0);
      let h = h0;
      for (;;) {
        const d = destOf(tris, h);
        if (!through(d)) break;
        const nxt = (outOf.get(d) ?? [])[0];
        if (nxt === undefined || used.has(nxt)) break;
        chain.push(nxt);
        used.add(nxt);
        h = nxt;
      }
      return chain;
    };
    const chains: number[][] = [];
    for (const h of hs) if (!used.has(h) && !through(originOf(tris, h))) chains.push(walk(h));
    // What is left is closed cycles. Rotate each to start at a bend, so the split below never runs across its seam.
    for (const h of hs) {
      if (used.has(h)) continue;
      const cyc = walk(h);
      const bendAt = cyc.findIndex((hh, i) => {
        const prev = cyc[(i - 1 + cyc.length) % cyc.length];
        return lineDistance(P(originOf(tris, hh)), P(originOf(tris, prev)), P(destOf(tris, hh))) > SHELL_TOLERANCE_CM;
      });
      if (bendAt < 0) throw new Error(`faces ${fa} and ${fb}: a closed run of manifold edges with no bend`);
      chains.push([...cyc.slice(bendAt), ...cyc.slice(0, bendAt)]);
    }
    for (const chain of chains) {
      // Split the chain into straight runs, each measured against its own final chord (journal decision 110, C5).
      const points = [originOf(tris, chain[0]), ...chain.map(h => destOf(tris, h))].map(P);
      for (const [s, e] of straightRuns(points)) {
        const piece = chain.slice(s, e);
        const verts = [originOf(tris, piece[0]), ...piece.map(h => destOf(tris, h))];
        edges.push(makeEdge(src, asm, reg, edges.length, fa, fb, piece, verts, storeyHeight));
        runs.push(verts);
        halves.push(piece);
        endpoints.add(verts[0]);
        endpoints.add(verts[verts.length - 1]);
      }
    }
  }
  return {edges, runs, halves, endpoints};
}

function makeEdge(
  src: FaceSource, asm: FaceAssembly, reg: VertexRegistry, id: number, fa: number, fb: number,
  piece: number[], verts: number[], storeyHeight: number,
): ShellEdge {
  const {positions} = src.mesh;
  const va = verts[0], vb = verts[verts.length - 1];
  const a = meshPoint(positions, va), b = meshPoint(positions, vb);
  const nA = asm.planes[fa].n, nB = asm.planes[fb].n;
  // The manifold edge whose B triangle reaches furthest from A's plane decides the sign.
  const lift = piece.map(h => liftAcross(src, asm, h, nA)).reduce((best, x) => (Math.abs(x) > Math.abs(best) ? x : best), 0);
  const geometry: EdgeGeometry = {
    shape: edgeShape(nA, nB, lift),
    horizontal: Math.abs(a[2] - b[2]) <= SHELL_TOLERANCE_CM,
    vertical: Math.hypot(a[0] - b[0], a[1] - b[1]) <= SHELL_TOLERANCE_CM,
    z: (a[2] + b[2]) / 2,
  };
  const kind = classifyEdge(asm.faces[fa].tag, asm.faces[fb].tag, geometry, storeyHeight);
  const v: [number, number] = [vertexAt(reg, a, meshOrigin(va, a)), vertexAt(reg, b, meshOrigin(vb, b))];
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
