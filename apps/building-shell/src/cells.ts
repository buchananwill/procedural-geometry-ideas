// Step 4, last part: Cells laid on the final ShellFaces only (spec decisions 22 to 25), the NetEdges along their sides
// and every vertex's incidences in cyclic order (journal decisions 58 to 60).
import type {CrossSection, SimplePolygon, Vec2} from 'manifold-3d';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {
  EdgeAssembly, EdgeKind, FaceFan, NetEdge, ShellEdge, ShellVertex, VertexOrigin, VertexRegistry, findVertex, snapPoint, vertexAt, vertexFans,
} from './edges.ts';
import {FaceAssembly, FaceSource, ShellFace, destOf, meshPoint, originOf, prevHalf, splitSimpleLoops, triOf} from './faces.ts';
import {Wasm} from './manifold.ts';
import {snapCm} from './weld.ts';
import {Vec3, tagLabel} from './tags.ts';
import {add3, cross2, cross3, dist3, dot3, lineDistance, lineOffset, lineParam, scale3, sub3, unit3} from './vec3.ts';

/** Spec decision 23 as amended (journal decisions 44, 58 and 59). */
export interface ShellCell {
  id: number;
  face: number;
  /** The lattice square's indices along the face's two lattice axes. */
  lattice: [number, number];
  /** Counter-clockwise seen from outside, every boundary vertex kept, on the 1/1024 cm grid. */
  polygon: Vec3[];
  /** `corners[i]` is the vertex id of `polygon[i]`. */
  corners: number[];
  /** `sides[i]` is the NetEdge id of the side from `polygon[i]` to `polygon[i + 1]`. */
  sides: number[];
  whole: boolean;
}

export type Axis = 0 | 1 | 2;

/**
 * How a face is laid on the global lattice (spec decision 22): its lattice coordinates are world axes `s` and `t`,
 * world axis `r` is solved from the face's plane, and `sign` is +1 when `(s, t)` turns counter-clockwise seen from
 * outside.
 */
export interface FaceFrame { s: Axis; t: Axis; r: Axis; sign: 1 | -1 }

/**
 * Spec decision 22 as amended (journal decision 77): Wall, Gable and Cheek faces in `(u, z)`, `u` world x for a
 * normal along ±y and world y for one along ±x; Roof and Underside in plan `(x, y)`; Ground and Internal get none.
 * A wall-kind face off the vertical, or a plan face on a vertical plane, has no lattice and is a hard error.
 */
export function faceFrame(face: ShellFace): FaceFrame | null {
  const n = face.normal;
  const make = (s: Axis, t: Axis, r: Axis): FaceFrame => {
    const es: Vec3 = [0, 0, 0], et: Vec3 = [0, 0, 0];
    es[s] = 1; et[t] = 1;
    return {s, t, r, sign: dot3(cross3(es, et), n) > 0 ? 1 : -1};
  };
  const where = (): string => `face ${face.id} (${tagLabel(face.tag)})`;
  switch (face.tag.kind) {
    case 'Wall': case 'Gable': case 'Cheek': {
      if (Math.abs(n[2]) > 1e-6 || Math.max(Math.abs(n[0]), Math.abs(n[1])) < 1 - 1e-6) {
        throw new Error(`${where()}: a ${face.tag.kind} face off an axis-aligned vertical plane has no (u, z) lattice`);
      }
      return Math.abs(n[1]) > Math.abs(n[0]) ? make(0, 2, 1) : make(1, 2, 0);
    }
    case 'Roof': case 'Underside':
      if (Math.abs(n[2]) < 1e-3) throw new Error(`${where()}: a ${face.tag.kind} face on a vertical plane has no plan lattice`);
      return make(0, 1, 2);
    case 'Ground': case 'Internal':
      return null;
  }
}

/** The point of the face's plane at lattice coordinates `(s, t)`. */
function lift(face: ShellFace, fr: FaceFrame, s: number, t: number): Vec3 {
  const p: Vec3 = [0, 0, 0];
  p[fr.s] = s;
  p[fr.t] = t;
  p[fr.r] = (face.offset - face.normal[fr.s] * s - face.normal[fr.t] * t) / face.normal[fr.r];
  return p;
}

const to2 = (fr: FaceFrame, p: Vec3): Vec2 => [p[fr.s], p[fr.t]];

/**
 * `p` projected along the face's normal onto its plane: distances to a point lifted onto the plane are then measured
 * in the plane itself, never foreshortened (journal decision 122, G4), and blind to a vertex's float32 offset off it.
 */
const onFace = (face: ShellFace, p: Vec3): Vec3 => sub3(p, scale3(face.normal, dot3(face.normal, p) - face.offset));

/** Per face: the lattice frame its Cells are laid in, or null for a face with no Cells. */
export type FrameTable = (FaceFrame | null)[];

/** A ShellEdge's vertices in order from `a` to `b`: its ends, every ShellEdge end inside it, every lattice crossing. */
export interface EdgePoints { ids: number[] }

/**
 * Journal decision 122, G3: a line along which one lattice square of a face is split, because the square holds a hole
 * of the face. It runs along the face's lattice axis `axis` (0 for `s`, 1 for `t`) held at `at`, over `[lo, hi]` of
 * the other axis: the square's (or a piece's) extent.
 */
export interface SplitLine { axis: 0 | 1; at: number; lo: number; hi: number }

/** Per face: the lines its lattice squares are split along (G3). */
export type SplitTable = SplitLine[][];

/**
 * Whether a point of the face's lattice frame, `held` on `axis` and `other` on the other, lies on split line `x`: on
 * its line and within its extent, both within `SHELL_TOLERANCE_CM` (journal decision 150, F8).
 */
export const onSplitLine = (x: SplitLine, axis: 0 | 1, held: number, other: number): boolean =>
  x.axis === axis && Math.abs(held - x.at) <= SHELL_TOLERANCE_CM && other >= x.lo - SHELL_TOLERANCE_CM && other <= x.hi + SHELL_TOLERANCE_CM;

/**
 * A point found inside a ShellEdge, at parameter `t` from `a`: a vertex already registered (`id`, a ShellEdge end
 * lying inside this edge) or a lattice crossing still to register (`p`).
 */
export type EdgeCrossing = {t: number; id: number} | {t: number; p: Vec3};

/**
 * Journal decisions 59 and 96 (F1): the vertices along one ShellEdge, shared by both faces' Cells.
 * - its two ends;
 * - every other ShellEdge's end lying inside it (a T-point: a face pinched against the edge ends edges there while
 *   the face across runs straight on);
 * - every point where a lattice line of either face crosses it (world `x`, `y` or `z` at a multiple of `cellSize`,
 *   for the axes that face is laid on);
 * - every point where a split line of either face crosses it, within the split's extent (journal decision 122, G3).
 * Points within `SHELL_TOLERANCE_CM` of an end or of each other are one point, a registered end winning.
 */
export function edgePoints(
  edge: ShellEdge, frames: FrameTable, reg: VertexRegistry, cellSize: number, ends: readonly number[], splits: SplitTable = [],
): EdgePoints {
  const A = reg.positions[edge.v[0]], B = reg.positions[edge.v[1]];
  const AB = sub3(B, A);
  const L = Math.hypot(...AB);
  const inside = (t: number): boolean => t * L > SHELL_TOLERANCE_CM && (1 - t) * L > SHELL_TOLERANCE_CM;
  const found: EdgeCrossing[] = [];
  for (const id of ends) {
    if (id === edge.v[0] || id === edge.v[1]) continue;
    const t = lineParam(reg.positions[id], A, B);
    if (!inside(t)) continue;
    if (lineOffset(reg.positions[id], A, B, t) <= SHELL_TOLERANCE_CM) found.push({t, id});
  }
  const axes = new Set<Axis>();
  for (const f of edge.faces) {
    const fr = frames[f];
    if (fr) { axes.add(fr.s); axes.add(fr.t); }
  }
  for (const ax of axes) {
    const c0 = A[ax], c1 = B[ax];
    if (Math.abs(c1 - c0) <= SHELL_TOLERANCE_CM) continue;
    const lo = Math.min(c0, c1), hi = Math.max(c0, c1);
    for (let k = Math.ceil(lo / cellSize); k * cellSize <= hi; k++) {
      const value = k * cellSize;
      const t = (value - c0) / (c1 - c0);
      if (!inside(t)) continue;
      const p = add3(A, scale3(AB, t));
      p[ax] = value;
      found.push({t, p});
    }
  }
  for (const f of edge.faces) {
    const fr = frames[f];
    if (!fr) continue;
    for (const sp of splits[f] ?? []) {
      const ax = sp.axis === 0 ? fr.s : fr.t, other = sp.axis === 0 ? fr.t : fr.s;
      const c0 = A[ax], c1 = B[ax];
      if (Math.abs(c1 - c0) <= SHELL_TOLERANCE_CM) continue;
      const t = (sp.at - c0) / (c1 - c0);
      if (!inside(t)) continue;
      const p = add3(A, scale3(AB, t));
      p[ax] = sp.at;
      if (p[other] < sp.lo - SHELL_TOLERANCE_CM || p[other] > sp.hi + SHELL_TOLERANCE_CM) continue;
      found.push({t, p});
    }
  }
  found.sort((x, y) => x.t - y.t);
  const kept: EdgeCrossing[] = [];
  for (const c of found) {
    const last = kept[kept.length - 1];
    if (last && (c.t - last.t) * L <= SHELL_TOLERANCE_CM) {
      if ('id' in c && !('id' in last)) kept[kept.length - 1] = c;
      continue;
    }
    kept.push(c);
  }
  const ids = [edge.v[0], ...kept.map(c => ('id' in c ? c.id : vertexAt(reg, c.p, {at: 'edge', edges: [edge.id]}))), edge.v[1]];
  return {ids};
}

/** A boundary vertex of a face in its lattice coordinates. */
export interface BoundaryPoint { id: number; at: Vec2 }

/** A boundary vertex found on a Cell side, `u` along it from its start. */
export interface SidePoint { u: number; id: number }

/** A closed 2D polygon's signed area: positive when it winds counter-clockwise. */
export const shoelace = (poly: Vec2[]): number => poly.reduce((s, p, i) => s + cross2(p, poly[(i + 1) % poly.length]), 0) / 2;

/** Journal decision 100, N5: whether a coordinate lies on a lattice line of spacing `cellSize`, within tolerance. */
export const onLattice = (v: number, cellSize: number): boolean =>
  Math.abs(v / cellSize - Math.round(v / cellSize)) * cellSize <= SHELL_TOLERANCE_CM;

/** One piece of a Cell contour: its corner ids and its signed area in the face's lattice frame. */
export interface ContourLobe { ids: number[]; area: number }

/**
 * A Cell contour's corner ids split into simple lobes, each one Cell (journal decision 92). Spec decision 23 as amended
 * (journal decision 119, F43): a lobe is a Cell exactly when it has at least three distinct vertices, ids being
 * positions on the 1/1024 cm snap grid, however small its area. A lobe of fewer is no Cell. A Cell that winds
 * clockwise, or has no area, is a hard error, as a contour hole is (journal decision 101).
 */
export function contourLobes(ids: number[], at: (id: number) => Vec2, where: string): ContourLobe[] {
  const out: ContourLobe[] = [];
  for (const lobe of splitSimpleLoops(ids)) {
    if (new Set(lobe).size < 3) continue;
    const area = shoelace(lobe.map(at));
    if (!(area > 0)) throw new Error(`${where}: a lobe of ${lobe.length} distinct corners winds clockwise or has no area (${area})`);
    out.push({ids: lobe, area});
  }
  return out;
}

/**
 * Journal decision 59: inserts into each side of a Cell polygon every boundary vertex lying on that side, so a side
 * on a ShellEdge carries the points where the neighbouring face's lattice meets it. Journal decision 122, G4: vertex
 * coincidence is decided by vertex identity, never in the face's projected frame, where a steep Roof's plan
 * foreshortens two distinct vertices to within tolerance.
 * - **A side on one ShellEdge** (both its ends in that edge's vertex sequence, `chains`) carries exactly the edge's
 *   vertices between its ends, in order.
 * - **Any other side** (a lattice side, or one spanning a straight run of several ShellEdges) carries every boundary
 *   vertex within `SHELL_TOLERANCE_CM` of it in 3D and further than that from both its ends.
 */
export function withBoundaryPoints(ids: number[], reg: VertexRegistry, boundary: BoundaryPoint[], chains: readonly number[][] = []): number[] {
  const out: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i], b = ids[(i + 1) % ids.length];
    out.push(a);
    if (a === b) continue;
    const chain = chains.find(ch => ch.includes(a) && ch.includes(b));
    if (chain) {
      const ia = chain.indexOf(a), ib = chain.indexOf(b);
      const between = ia < ib ? chain.slice(ia + 1, ib) : chain.slice(ib + 1, ia).reverse();
      for (const id of between) if (out[out.length - 1] !== id) out.push(id);
      continue;
    }
    const A = reg.positions[a], B = reg.positions[b];
    const L = dist3(A, B);
    const on: SidePoint[] = [];
    for (const c of boundary) {
      if (c.id === a || c.id === b) continue;
      const C = reg.positions[c.id];
      const u = lineParam(C, A, B);
      if (u * L <= SHELL_TOLERANCE_CM || (1 - u) * L <= SHELL_TOLERANCE_CM) continue;
      if (lineOffset(C, A, B, u) > SHELL_TOLERANCE_CM) continue;
      on.push({u, id: c.id});
    }
    on.sort((x, y) => x.u - y.u);
    for (const {id} of on) if (out[out.length - 1] !== id) out.push(id);
  }
  return out;
}

/** Drops cyclically repeated neighbours: two polygon corners that are one vertex. */
const dedupeCyclic = (ids: number[]): number[] => ids.filter((v, i) => v !== ids[(i + 1) % ids.length]);

/** One lattice square of a face: its indices and the contours of its pieces, split through any hole it holds. */
interface SquarePieces { i: number; j: number; contours: SimplePolygon[] }

/**
 * Journal decision 122, G3 (spec decision 23 to be amended): the contours of `region` within the rectangle `lo` to
 * `hi`. A rectangle holding a hole of the face (a contour of negative area, at least `SHELL_TOLERANCE_CM`²) is split
 * by a lattice-parallel line through the middle of the hole's extent along its wider axis, snapped to the 1/1024 cm
 * grid, and each part is read again, until no part holds a hole. Each split is recorded in `out`. Smaller negative
 * contours are float noise, and are dropped. A hole that cannot be split is a hard error naming `where`.
 */
export function splitAtHoles(region: CrossSection, lo: Vec2, hi: Vec2, out: SplitLine[], where: string, depth = 0): SimplePolygon[][] {
  const piece = region.intersect([[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]]);
  let contours: SimplePolygon[];
  try {
    contours = piece.isEmpty() ? [] : piece.toPolygons();
  } finally {
    piece.delete();
  }
  const hole = contours.find(c => shoelace(c) <= -(SHELL_TOLERANCE_CM ** 2));
  if (!hole) return [contours.filter(c => shoelace(c) >= 0)];
  const ext = (ax: 0 | 1): [number, number] => [Math.min(...hole.map(p => p[ax])), Math.max(...hole.map(p => p[ax]))];
  const [xs, ys] = [ext(0), ext(1)];
  const axis: 0 | 1 = xs[1] - xs[0] >= ys[1] - ys[0] ? 0 : 1;
  const [a, b] = axis === 0 ? xs : ys;
  const at = snapCm((a + b) / 2);
  if (depth > MAX_SPLIT_DEPTH || !(at > lo[axis] && at < hi[axis])) throw new Error(`${where} holds a hole of the face that no split line divides`);
  out.push({axis, at, lo: lo[1 - axis], hi: hi[1 - axis]});
  const firstHi: Vec2 = axis === 0 ? [at, hi[1]] : [hi[0], at];
  const secondLo: Vec2 = axis === 0 ? [at, lo[1]] : [lo[0], at];
  return [...splitAtHoles(region, lo, firstHi, out, where, depth + 1), ...splitAtHoles(region, secondLo, hi, out, where, depth + 1)];
}

/** How many times one lattice square may be split before its holes are a hard error: far more than any face holds. */
const MAX_SPLIT_DEPTH = 16;

/** The Cells, the NetEdges along their sides, and each face's lattice frame. */
export interface CellNet { cells: ShellCell[]; netEdges: NetEdge[]; frames: FrameTable }

/**
 * Spec decisions 22 to 25: each face with a lattice is intersected, square by square, with the global `cellSize`
 * lattice by `CrossSection.intersect`; each piece is one Cell (a square the face cuts into several pieces gives one
 * Cell per piece, all with that square's lattice index). A piece is a Cell exactly when it keeps at least three
 * distinct snapped vertices (spec decision 23 as amended, journal decision 119); a contour of negative area, a hole
 * piece, is a hard error unless it is under `SHELL_TOLERANCE_CM`², float noise. Each corner
 * is mapped to a ShellEdge vertex or an interior lattice corner, every boundary vertex on a side is inserted, and the
 * polygon is wound counter-clockwise seen from outside.
 */
export function layCells(wasm: Wasm, src: FaceSource, asm: FaceAssembly, ea: EdgeAssembly, reg: VertexRegistry, cellSize: number): CellNet {
  const {faces} = asm;
  const frames: FrameTable = faces.map(faceFrame);
  const ends = [...new Set(ea.edges.flatMap(e => e.v))];
  const where = (f: number): string => `face ${f} (${asm.identities[f]})`;

  // Every face's region and its lattice squares' pieces, each square split through any hole it holds (G3), before
  // any ShellEdge's vertices are fixed, since a split line adds a vertex where it crosses a ShellEdge.
  const splits: SplitTable = faces.map(() => []);
  const squares: SquarePieces[][] = faces.map(() => []);
  for (const face of faces) {
    const fr = frames[face.id];
    if (!fr) continue;
    const loops = asm.loopVerts[face.id].map(l => l.map(v => {
      const id = findVertex(reg, meshPoint(src.mesh.positions, v));
      if (id === undefined) throw new Error(`${where(face.id)}: loop vertex ${v} is no ShellEdge endpoint`);
      return to2(fr, reg.positions[id]);
    }));
    const region = new wasm.CrossSection(loops, 'EvenOdd');
    try {
      const {min, max} = region.bounds();
      for (let i = Math.floor(min[0] / cellSize); i * cellSize < max[0]; i++) {
        for (let j = Math.floor(min[1] / cellSize); j * cellSize < max[1]; j++) {
          const lo: Vec2 = [i * cellSize, j * cellSize], hi: Vec2 = [lo[0] + cellSize, lo[1] + cellSize];
          const pieces = splitAtHoles(region, lo, hi, splits[face.id], `${where(face.id)}: lattice square (${i}, ${j})`);
          squares[face.id].push({i, j, contours: pieces.flat()});
        }
      }
    } finally {
      region.delete();
    }
  }
  const pts = ea.edges.map(e => edgePoints(e, frames, reg, cellSize, ends, splits));
  for (const [e, {ids}] of pts.entries()) {
    for (const id of ids.slice(1, -1)) {
      const o = reg.origins[id];
      if (o.at === 'mesh') o.inside = [...(o.inside ?? []), e];
    }
  }
  const faceEdges: number[][] = faces.map(() => []);
  for (const e of ea.edges) for (const f of e.faces) faceEdges[f].push(e.id);

  const cells: ShellCell[] = [];
  for (const face of faces) {
    const fr = frames[face.id];
    if (!fr) continue;
    const boundary: BoundaryPoint[] = [];
    const seen = new Set<number>();
    const chains = faceEdges[face.id].map(e => pts[e].ids);
    for (const e of faceEdges[face.id]) {
      for (const id of pts[e].ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        boundary.push({id, at: to2(fr, reg.positions[id])});
      }
    }
    const faceSplits = splits[face.id];
    /**
     * A Cell corner's lattice coordinate on `axis`: on a lattice line, or on one of the face's split lines (G3) within
     * that line's extent (journal decision 150, F8).
     */
    const onLine = (q: Vec2, axis: 0 | 1): number | null => {
      const v = q[axis];
      const k = Math.round(v / cellSize);
      if (Math.abs(v - k * cellSize) <= SHELL_TOLERANCE_CM) return k * cellSize;
      const sp = faceSplits.find(x => onSplitLine(x, axis, v, q[1 - axis]));
      return sp ? sp.at : null;
    };
    /** The face-interior vertices made on split lines, which neighbouring Cells' sides must carry too (G3). */
    const splitVerts = new Set<number>();
    // Journal decision 122, G4: a corner is matched to a boundary vertex in 3D, in the face's plane.
    const mapCorner = (q: Vec2): number => {
      const Q = lift(face, fr, q[0], q[1]);
      let best = -1, bestD = SHELL_TOLERANCE_CM;
      for (const c of boundary) {
        const d = dist3(onFace(face, reg.positions[c.id]), Q);
        if (d <= bestD) { best = c.id; bestD = d; }
      }
      if (best >= 0) return best;
      const s0 = onLine(q, 0), t0 = onLine(q, 1);
      if (s0 !== null && t0 !== null) {
        const id = vertexAt(reg, lift(face, fr, s0, t0), {at: 'face', face: face.id});
        if (!onLattice(s0, cellSize) || !onLattice(t0, cellSize)) splitVerts.add(id);
        return id;
      }
      throw new Error(`${where(face.id)}: a Cell corner at (${q[0]}, ${q[1]}) is neither on a ShellEdge nor a lattice corner`);
    };
    const first = cells.length;
    for (const {i, j, contours} of squares[face.id]) {
      for (const c of contours) {
        let ids = dedupeCyclic(c.map(mapCorner));
        ids = dedupeCyclic(withBoundaryPoints(ids, reg, boundary, chains));
        // A contour touching itself at a vertex is two pieces of the square: one Cell each (journal decision 92).
        for (const {ids: lobe, area} of contourLobes(ids, id => to2(fr, reg.positions[id]), `${where(face.id)}: lattice square (${i}, ${j})`)) {
          if (fr.sign < 0) lobe.reverse();
          cells.push({
            id: cells.length, face: face.id, lattice: [i, j], polygon: lobe.map(id => reg.positions[id]), corners: lobe, sides: [],
            whole: cellSize * cellSize - area <= SHELL_TOLERANCE_CM * cellSize,
          });
        }
      }
    }
    // G3: a split line's end on a lattice line is a corner of the split pieces and a point on the side of the Cell
    // across that lattice line.
    if (splitVerts.size) {
      const extra: BoundaryPoint[] = [...splitVerts].map(id => ({id, at: to2(fr, reg.positions[id])}));
      for (const cell of cells.slice(first)) {
        cell.corners = dedupeCyclic(withBoundaryPoints(cell.corners, reg, extra));
        cell.polygon = cell.corners.map(id => reg.positions[id]);
      }
    }
  }

  const netEdges = assembleNetEdges(cells, faces, frames, ea.edges, pts, faceEdges, reg, cellSize, splits);
  return {cells, netEdges, frames};
}

/**
 * Spec decision 25 as amended (journal decisions 61 and 77): the kind of a Cell side on no ShellEdge, by its face's
 * kind and the side's direction.
 */
export function interiorSideKind(face: ShellFace, a: Vec3, b: Vec3): EdgeKind {
  const level = Math.abs(a[2] - b[2]) <= SHELL_TOLERANCE_CM;
  switch (face.tag.kind) {
    case 'Wall': return level ? 'WallHorizontal' : 'WallVertical';
    case 'Gable': case 'Cheek': return level ? 'GableHorizontal' : 'GableVertical';
    case 'Roof': case 'Underside': return 'RoofInterior';
    case 'Ground': case 'Internal': throw new Error(`face ${face.id}: a ${face.tag.kind} face has no Cells`);
  }
}

const sideKey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

/**
 * Two ShellEdges sharing a segment: one segment of a pinch, written on each of its two sheets. At an overhang's foot
 * (journal decision 110, C1) they run between the same two vertices; where two storeys' solids touch along an edge
 * (journal decision 140, F5) they overlap over part of their length, between different ends. Both lie on one line
 * within `SHELL_TOLERANCE_CM`, and overlap along it by more than that.
 */
function coincident(e: ShellEdge, f: ShellEdge): boolean {
  if (sideKey(e.v[0], e.v[1]) === sideKey(f.v[0], f.v[1])) return true;
  if ([f.a, f.b].some(p => lineDistance(p, e.a, e.b) > SHELL_TOLERANCE_CM) || [e.a, e.b].some(p => lineDistance(p, f.a, f.b) > SHELL_TOLERANCE_CM)) return false;
  const L = dist3(e.a, e.b);
  const [s0, s1] = [lineParam(f.a, e.a, e.b), lineParam(f.b, e.a, e.b)].sort((x, y) => x - y);
  return (Math.min(1, s1) - Math.max(0, s0)) * L > SHELL_TOLERANCE_CM;
}

/**
 * Journal decision 59: one NetEdge per pair of consecutive vertices along any Cell side and the ShellEdge it lies on.
 * A side lies on a ShellEdge when both its ends are among that edge's vertices; otherwise it must lie on a lattice
 * line of its face. Journal decision 110, C1: where an upper storey overhangs a lower reflex corner, the two sheets of
 * the pinch share a segment, which the union writes as two coincident ShellEdges. Their sides are two NetEdges on one
 * pair of vertices, one per ShellEdge; any other pair of vertices reading two ShellEdges is a hard error.
 */
function assembleNetEdges(
  cells: ShellCell[], faces: ShellFace[], frames: FrameTable, edges: ShellEdge[], pts: EdgePoints[],
  faceEdges: number[][], reg: VertexRegistry, cellSize: number, splits: SplitTable,
): NetEdge[] {
  const onEdge = pts.map(p => new Set(p.ids));
  const netEdges: NetEdge[] = [];
  const byKey = new Map<string, number>();
  const byPair = new Map<string, number[]>();
  for (const cell of cells) {
    const face = faces[cell.face];
    const fr = frames[cell.face];
    if (!fr) throw new Error(`cell ${cell.id}: its face ${cell.face} has no lattice`);
    cell.sides = cell.corners.map((a, i) => {
      const b = cell.corners[(i + 1) % cell.corners.length];
      const hits = faceEdges[cell.face].filter(e => onEdge[e].has(a) && onEdge[e].has(b));
      if (hits.length > 1) throw new Error(`cell ${cell.id}: side ${a}-${b} lies on ShellEdges ${hits.join(' and ')}`);
      const shellEdge = hits.length ? hits[0] : -1;
      const pair = sideKey(a, b);
      const k = `${pair}|${shellEdge}`;
      let id = byKey.get(k);
      if (id === undefined) {
        for (const other of byPair.get(pair) ?? []) {
          const s = netEdges[other].shellEdge;
          if (shellEdge < 0 || s < 0 || !coincident(edges[shellEdge], edges[s])) {
            throw new Error(`cell ${cell.id}: side ${a}-${b} reads ShellEdge ${shellEdge}, its NetEdge ${s}`);
          }
        }
        const A = reg.positions[a], B = reg.positions[b];
        if (shellEdge < 0) {
          // Journal decision 150, F8: a side lies on a split line only within that line's extent.
          const onSplit = (axis: 0 | 1): boolean => {
            const [held, other] = axis === 0 ? [fr.s, fr.t] : [fr.t, fr.s];
            return splits[cell.face].some(x => onSplitLine(x, axis, A[held], A[other]) && onSplitLine(x, axis, B[held], B[other]));
          };
          const alongS = Math.abs(A[fr.s] - B[fr.s]) <= SHELL_TOLERANCE_CM && (onLattice(A[fr.s], cellSize) || onSplit(0));
          const alongT = Math.abs(A[fr.t] - B[fr.t]) <= SHELL_TOLERANCE_CM && (onLattice(A[fr.t], cellSize) || onSplit(1));
          if (!alongS && !alongT) throw new Error(`cell ${cell.id}: side ${a}-${b} is neither on a ShellEdge, a lattice line nor a split line`);
        }
        id = netEdges.length;
        byKey.set(k, id);
        const list = byPair.get(pair);
        if (list) list.push(id); else byPair.set(pair, [id]);
        netEdges.push({id, kind: shellEdge >= 0 ? edges[shellEdge].kind : interiorSideKind(face, A, B), v: [a, b], cells: [], shellEdge});
      }
      netEdges[id].cells.push(cell.id);
      return id;
    });
  }
  return netEdges;
}

/** One Cell's corner at a vertex: the side leaving the vertex and the side arriving at it. */
export interface CornerAt { cell: number; out: number; in: number }

/**
 * Journal decision 60: each vertex's NetEdges, Cells and faces, counter-clockwise seen from outside.
 * - **NetEdges and Cells** are read from the Cells around the vertex, each wound counter-clockwise from outside:
 *   sweeping counter-clockwise, a Cell lies between the side it leaves the vertex by and the side it arrives by, and
 *   the side it arrives by is the next Cell's leaving side. A face with no Cells (Ground) leaves a gap in that chain:
 *   the lists then start at the first NetEdge after the gap and end at the last one before it. Where several gaps
 *   split the Cells into runs (a pinch), the runs follow the manifold's triangle fan: each is placed by the fan
 *   triangle its first Cell starts in, so a face meeting the vertex twice is ordered too (journal decision 96, F3).
 * - **Faces** are read from the triangle fan at a ShellEdge endpoint, and may name a face twice there; they are the
 *   edge's two faces at a point inside a ShellEdge, and the one face at a lattice corner inside a face. They are
 *   rotated to start at the first Cell's face.
 */
export function vertexRecords(src: FaceSource, asm: FaceAssembly, ea: EdgeAssembly, reg: VertexRegistry, cells: ShellCell[]): ShellVertex[] {
  const at: CornerAt[][] = reg.positions.map(() => []);
  for (const c of cells) {
    const n = c.corners.length;
    c.corners.forEach((v, i) => at[v].push({cell: c.id, out: c.sides[i], in: c.sides[(i - 1 + n) % n]}));
  }
  return reg.positions.map((p, id): ShellVertex => {
    const corners = at[id];
    const outOf = new Map<number, CornerAt>();
    const ins = new Set<number>();
    for (const k of corners) {
      if (outOf.has(k.out) || ins.has(k.in)) throw new Error(`vertex ${id}: two Cells run the same way along one NetEdge`);
      outOf.set(k.out, k);
      ins.add(k.in);
    }
    const where = `vertex ${id} at (${p.join(', ')})`;
    const {sheets} = originRecord(src, asm, ea, reg.origins[id], where);
    /** One run of Cells around the vertex, from the NetEdge after a gap to the one before the next. */
    const walk = (start: number): CellRun => {
      const run: CellRun = {edges: [], cells: []};
      let e = start;
      for (;;) {
        run.edges.push(e);
        const k = outOf.get(e);
        if (!k) break;
        run.cells.push(k.cell);
        e = k.in;
        if (e === start) break;
      }
      return run;
    };
    // Runs from each gap, then each closed cycle left, from its lowest NetEdge: at a pinch every sheet may close its
    // own fan of Cells (journal decision 110, C1).
    const starts = [...outOf.keys()].filter(e => !ins.has(e)).sort((a, b) => a - b);
    let runs = starts.map(walk);
    const walked = new Set(runs.flatMap(r => r.edges));
    for (const e of [...outOf.keys()].sort((a, b) => a - b)) {
      if (walked.has(e)) continue;
      const cycle = walk(e);
      cycle.edges.forEach(x => walked.add(x));
      runs.push(cycle);
    }
    // Journal decision 96, F3: a run at a mesh vertex sits in one triangle of a sheet's fan, found by its first Cell's
    // corner, so runs follow the fan even where one face meets the vertex twice. Journal decision 110, C1: at a pinch
    // the runs go sheet by sheet, the sheets in order of lowest face id, and each sheet's faces start at its first run.
    const placed = new Map(runs.map(r => [r, placeRun(src, asm, sheets, cells[r.cells[0]], id, reg, where)]));
    const place = (r: CellRun): RunPlace => {
      const got = placed.get(r);
      if (!got) throw new Error(`${where}: a Cell run was never placed in the fan`);
      return got;
    };
    for (const [s, sheet] of sheets.entries()) {
      const n = runs.filter(r => place(r).sheet === s).length;
      if (n > 1 && !sheet.fan) throw new Error(`${where}: ${n} gaps in its Cell fan away from a mesh vertex`);
    }
    runs = [...runs].sort((a, b) => place(a).sheet - place(b).sheet || place(a).triangle - place(b).triangle);
    const faces = sheets.flatMap((sheet, s) => {
      const first = runs.find(r => place(r).sheet === s);
      const k = !first ? 0 : sheet.fan ? sheet.fan.faceAt[place(first).triangle] : Math.max(0, sheet.faces.indexOf(cells[first.cells[0]].face));
      return [...sheet.faces.slice(k), ...sheet.faces.slice(0, k)];
    });
    const edges = runs.flatMap(r => r.edges), cellIds = runs.flatMap(r => r.cells);
    if (cellIds.length !== corners.length) throw new Error(`${where}: its Cells form a closed fan and a gap at once`);
    return {id, p, edges, cells: cellIds, faces};
  });
}

/** One run of Cells around a vertex, from the NetEdge after a gap to the one before the next, in order. */
export interface CellRun { edges: number[]; cells: number[] }

/**
 * One sheet of the surface through a vertex (journal decision 110, C1): the faces it lies on, and at a mesh vertex
 * the triangle fan they come from.
 */
export interface VertexSheet { faces: number[]; fan: FaceFan | null }

/**
 * What a vertex's origin gives its record: each sheet through it, ordered by lowest face id, and their faces in that
 * order. A vertex has one sheet, a pinch one per coincident mesh vertex or per coincident ShellEdge.
 */
export interface OriginRecord { sheets: VertexSheet[]; faces: number[] }

/** Orders sheets by their lowest face id (journal decision 110, C1). */
const byLowestFace = (a: VertexSheet, b: VertexSheet): number => Math.min(...a.faces) - Math.min(...b.faces);

/** The record of a vertex's sheets: ordered by lowest face id, their faces named sheet by sheet. */
const recordOf = (sheets: VertexSheet[]): OriginRecord => {
  const ordered = [...sheets].sort(byLowestFace);
  return {sheets: ordered, faces: ordered.flatMap(s => s.faces)};
};

/**
 * Journal decision 100, B8: a vertex's faces read from its origin, narrowed once and checked exhaustive.
 * - A mesh vertex reads its triangle fan; a pinch, each coincident mesh vertex's (journal decision 110, C1).
 * - A point inside a ShellEdge reads that edge's two faces; inside two coincident ShellEdges, each one's. ShellEdges
 *   that are not coincident never share an inner point, so that is a hard error.
 * - A lattice corner reads its one face.
 * An origin of any other shape is a hard error, so no placeholder face id can reach `ShellVertex.faces` or the export.
 */
export function originRecord(src: FaceSource, asm: FaceAssembly, ea: EdgeAssembly, o: VertexOrigin, where: string): OriginRecord {
  switch (o.at) {
    case 'mesh': {
      const fans: VertexSheet[] = o.vertices.flatMap(v => vertexFans(src, asm, v).map(fan => ({faces: fan.faces, fan})));
      // Journal decision 140, F5: a ShellEdge the vertex lies inside, whose faces no fan reaches, is a sheet of its own.
      const reached = new Set(fans.flatMap(x => x.faces));
      const across = (o.inside ?? []).map(e => ea.edges[e]).filter(e => !e.faces.every(f => reached.has(f)));
      return recordOf([...fans, ...across.map(e => ({faces: [...e.faces], fan: null}))]);
    }
    case 'edge': {
      const [first, ...rest] = o.edges.map(e => ea.edges[e]);
      for (const e of rest) if (!coincident(first, e)) throw new Error(`${where}: inside ShellEdges ${first.id} and ${e.id}, which do not coincide`);
      return recordOf([first, ...rest].map(e => ({faces: [...e.faces], fan: null})));
    }
    case 'face': return recordOf([{faces: [o.face], fan: null}]);
    default: {
      const never: never = o;
      throw new Error(`${where}: an origin of no known kind, ${JSON.stringify(never)}`);
    }
  }
}

/**
 * The direction from vertex `v` along the bisector of Cell `c`'s corner there, in the face's plane: half way round,
 * counter-clockwise about `n`, from the side the Cell leaves `v` by to the side it arrives by. It points strictly
 * inside the corner whatever the corner's angle, a straight or reflex one included.
 */
export function cornerBisector(c: ShellCell, v: number, positions: readonly Vec3[], n: Vec3): Vec3 {
  const m = c.corners.length;
  const i = c.corners.indexOf(v);
  const P = positions[v];
  const out = unit3(sub3(positions[c.corners[(i + 1) % m]], P));
  const back = unit3(sub3(positions[c.corners[(i - 1 + m) % m]], P));
  const turn = cross3(n, out);
  let angle = Math.atan2(dot3(cross3(out, back), n), dot3(out, back));
  if (angle <= 0) angle += 2 * Math.PI;
  const cs = Math.cos(angle / 2), sn = Math.sin(angle / 2);
  return add3(scale3(out, cs), scale3(turn, sn));
}

/**
 * Journal decisions 101 (F37) and 110 (C7): the index in `fan` of the first triangle of Cell `c`'s face whose wedge at
 * vertex `v` holds the bisector of the Cell's corner, its two sides included; -1 if none does. Every coordinate, the
 * Cell's corners and the fan triangles' corners alike, is read on the 1/1024 cm grid (`snapPoint`), so the Cell's
 * sides and the wedges are measured in one consistent coordinate set.
 */
export function fanTriangleOf(src: FaceSource, asm: FaceAssembly, fan: FaceFan, c: ShellCell, v: number, reg: VertexRegistry): number {
  const {tris, positions} = src.mesh;
  const V = reg.positions[v];
  const n = asm.faces[c.face].normal;
  const d = cornerBisector(c, v, reg.positions, n);
  const grid = (m: number): Vec3 => snapPoint(meshPoint(positions, m));
  for (const [k, h] of fan.halves.entries()) {
    if (asm.triFace[triOf(h)] !== c.face) continue;
    const a = sub3(grid(destOf(tris, h)), V), b = sub3(grid(originOf(tris, prevHalf(h))), V);
    if (dot3(cross3(a, d), n) >= 0 && dot3(cross3(d, b), n) >= 0) return k;
  }
  return -1;
}

/** Where a run of Cells sits around a vertex: the sheet holding its first Cell's corner, and the fan triangle in it. */
export interface RunPlace { sheet: number; triangle: number }

/**
 * A run's place: the first sheet, in order, that holds its first Cell's corner. A sheet with a fan holds it in one of
 * its triangles; a sheet with none holds it when it lies on the Cell's face.
 */
function placeRun(src: FaceSource, asm: FaceAssembly, sheets: VertexSheet[], c: ShellCell, v: number, reg: VertexRegistry, where: string): RunPlace {
  for (const [sheet, s] of sheets.entries()) {
    if (!s.fan) {
      if (s.faces.includes(c.face)) return {sheet, triangle: 0};
      continue;
    }
    const triangle = fanTriangleOf(src, asm, s.fan, c, v, reg);
    if (triangle >= 0) return {sheet, triangle};
  }
  throw new Error(`${where}: Cell ${c.id} lies in no triangle of its face's fan`);
}
