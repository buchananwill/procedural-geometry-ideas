// Step 4, last part: Cells laid on the final ShellFaces only (spec decisions 22 to 25), the NetEdges along their sides
// and every vertex's incidences in cyclic order (journal decisions 58 to 60).
import type {SimplePolygon, Vec2} from 'manifold-3d';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {
  EdgeAssembly, EdgeKind, FaceFan, NetEdge, ShellEdge, ShellVertex, VertexOrigin, VertexRegistry, faceFan, findVertex, snapPoint, vertexAt,
} from './edges.ts';
import {FaceAssembly, FaceSource, ShellFace, destOf, meshPoint, originOf, prevHalf, splitSimpleLoops, triOf} from './faces.ts';
import {Wasm} from './manifold.ts';
import {Vec3, tagLabel} from './tags.ts';
import {cross2, cross3, dot3, sub3} from './vec3.ts';

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

/** Per face: the lattice frame its Cells are laid in, or null for a face with no Cells. */
export type FrameTable = (FaceFrame | null)[];

/** A ShellEdge's vertices in order from `a` to `b`: its ends, every ShellEdge end inside it, every lattice crossing. */
export interface EdgePoints { ids: number[] }

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
 *   for the axes that face is laid on).
 * Points within `SHELL_TOLERANCE_CM` of an end or of each other are one point, a registered end winning.
 */
export function edgePoints(edge: ShellEdge, frames: FrameTable, reg: VertexRegistry, cellSize: number, ends: readonly number[]): EdgePoints {
  const A = reg.positions[edge.v[0]], B = reg.positions[edge.v[1]];
  const AB = sub3(B, A);
  const L = Math.hypot(...AB);
  const inside = (t: number): boolean => t * L > SHELL_TOLERANCE_CM && (1 - t) * L > SHELL_TOLERANCE_CM;
  const found: EdgeCrossing[] = [];
  for (const id of ends) {
    if (id === edge.v[0] || id === edge.v[1]) continue;
    const w = sub3(reg.positions[id], A);
    const t = dot3(w, AB) / (L * L);
    if (!inside(t)) continue;
    const off = Math.hypot(w[0] - t * AB[0], w[1] - t * AB[1], w[2] - t * AB[2]);
    if (off <= SHELL_TOLERANCE_CM) found.push({t, id});
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
      const p: Vec3 = [A[0] + t * AB[0], A[1] + t * AB[1], A[2] + t * AB[2]];
      p[ax] = value;
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
  const ids = [edge.v[0], ...kept.map(c => ('id' in c ? c.id : vertexAt(reg, c.p, {at: 'edge', edge: edge.id}))), edge.v[1]];
  return {ids};
}

/** A boundary vertex of a face in its lattice coordinates. */
export interface BoundaryPoint { id: number; at: Vec2 }

/** A boundary vertex found on a Cell side, `u` along it from its start. */
interface SidePoint { u: number; id: number }

/** A closed 2D polygon's signed area: positive when it winds counter-clockwise. */
export const shoelace = (poly: Vec2[]): number => poly.reduce((s, p, i) => s + cross2(p, poly[(i + 1) % poly.length]), 0) / 2;

/** Journal decision 100, N5: whether a coordinate lies on a lattice line of spacing `cellSize`, within tolerance. */
export const onLattice = (v: number, cellSize: number): boolean =>
  Math.abs(v / cellSize - Math.round(v / cellSize)) * cellSize <= SHELL_TOLERANCE_CM;

/** One piece of a Cell contour: its corner ids and its signed area in the face's lattice frame. */
export interface ContourLobe { ids: number[]; area: number }

/**
 * A Cell contour's corner ids split into simple lobes, each one Cell (journal decision 92). A lobe under
 * `SHELL_TOLERANCE_CM`² is dropped. A lobe of negative area, a piece wound the wrong way, is a hard error, as a
 * contour hole is (journal decision 101).
 */
export function contourLobes(ids: number[], at: (id: number) => Vec2, where: string): ContourLobe[] {
  const out: ContourLobe[] = [];
  for (const lobe of splitSimpleLoops(ids)) {
    const area = shoelace(lobe.map(at));
    if (-area >= SHELL_TOLERANCE_CM ** 2) throw new Error(`${where}: a lobe of area ${area} winds clockwise`);
    if (area < SHELL_TOLERANCE_CM ** 2) continue;
    if (lobe.length < 3) throw new Error(`${where}: a piece of area ${area} has ${lobe.length} distinct corners`);
    out.push({ids: lobe, area});
  }
  return out;
}

/**
 * Journal decision 59: inserts into each side of a Cell polygon every boundary vertex lying on that side, so a side
 * on a ShellEdge carries the points where the neighbouring face's lattice meets it.
 */
export function withBoundaryPoints(ids: number[], reg: VertexRegistry, fr: FaceFrame, boundary: BoundaryPoint[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i], b = ids[(i + 1) % ids.length];
    out.push(a);
    const A = to2(fr, reg.positions[a]), B = to2(fr, reg.positions[b]);
    const d: Vec2 = [B[0] - A[0], B[1] - A[1]];
    const L = Math.hypot(d[0], d[1]);
    if (L <= SHELL_TOLERANCE_CM) continue;
    const on: SidePoint[] = [];
    for (const c of boundary) {
      if (c.id === a || c.id === b) continue;
      const w: Vec2 = [c.at[0] - A[0], c.at[1] - A[1]];
      const u = (w[0] * d[0] + w[1] * d[1]) / L;
      if (u <= SHELL_TOLERANCE_CM || u >= L - SHELL_TOLERANCE_CM) continue;
      if (Math.abs(w[0] * d[1] - w[1] * d[0]) / L > SHELL_TOLERANCE_CM) continue;
      on.push({u, id: c.id});
    }
    on.sort((x, y) => x.u - y.u);
    for (const {id} of on) if (out[out.length - 1] !== id) out.push(id);
  }
  return out;
}

/** Drops cyclically repeated neighbours: two polygon corners that are one vertex. */
const dedupeCyclic = (ids: number[]): number[] => ids.filter((v, i) => v !== ids[(i + 1) % ids.length]);

/** The Cells, the NetEdges along their sides, and each face's lattice frame. */
export interface CellNet { cells: ShellCell[]; netEdges: NetEdge[]; frames: FrameTable }

/**
 * Spec decisions 22 to 25: each face with a lattice is intersected, square by square, with the global `cellSize`
 * lattice by `CrossSection.intersect`; each piece is one Cell (a square the face cuts into several pieces gives one
 * Cell per piece, all with that square's lattice index). A piece under `SHELL_TOLERANCE_CM`² is dropped. Each corner
 * is mapped to a ShellEdge vertex or an interior lattice corner, every boundary vertex on a side is inserted, and the
 * polygon is wound counter-clockwise seen from outside.
 */
export function layCells(wasm: Wasm, src: FaceSource, asm: FaceAssembly, ea: EdgeAssembly, reg: VertexRegistry, cellSize: number): CellNet {
  const {faces} = asm;
  const frames: FrameTable = faces.map(faceFrame);
  const ends = [...new Set(ea.edges.flatMap(e => e.v))];
  const pts = ea.edges.map(e => edgePoints(e, frames, reg, cellSize, ends));
  const faceEdges: number[][] = faces.map(() => []);
  for (const e of ea.edges) for (const f of e.faces) faceEdges[f].push(e.id);

  const cells: ShellCell[] = [];
  for (const face of faces) {
    const fr = frames[face.id];
    if (!fr) continue;
    const where = `face ${face.id} (${asm.identities[face.id]})`;
    const boundary: BoundaryPoint[] = [];
    const seen = new Set<number>();
    for (const e of faceEdges[face.id]) {
      for (const id of pts[e].ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        boundary.push({id, at: to2(fr, reg.positions[id])});
      }
    }
    const loopIds = asm.loopVerts[face.id].map(l => l.map(v => {
      const id = findVertex(reg, meshPoint(src.mesh.positions, v));
      if (id === undefined) throw new Error(`${where}: loop vertex ${v} is no ShellEdge endpoint`);
      return id;
    }));
    const region = new wasm.CrossSection(loopIds.map(l => l.map(id => to2(fr, reg.positions[id]))), 'EvenOdd');
    try {
      const {min, max} = region.bounds();
      const mapCorner = (q: Vec2): number => {
        let best = -1, bestD = SHELL_TOLERANCE_CM;
        for (const c of boundary) {
          const d = Math.hypot(c.at[0] - q[0], c.at[1] - q[1]);
          if (d <= bestD) { best = c.id; bestD = d; }
        }
        if (best >= 0) return best;
        const ks = Math.round(q[0] / cellSize), kt = Math.round(q[1] / cellSize);
        if (Math.abs(q[0] - ks * cellSize) <= SHELL_TOLERANCE_CM && Math.abs(q[1] - kt * cellSize) <= SHELL_TOLERANCE_CM) {
          return vertexAt(reg, lift(face, fr, ks * cellSize, kt * cellSize), {at: 'face', face: face.id});
        }
        throw new Error(`${where}: a Cell corner at (${q[0]}, ${q[1]}) is neither on a ShellEdge nor a lattice corner`);
      };
      for (let i = Math.floor(min[0] / cellSize); i * cellSize < max[0]; i++) {
        for (let j = Math.floor(min[1] / cellSize); j * cellSize < max[1]; j++) {
          const x0 = i * cellSize, y0 = j * cellSize, x1 = x0 + cellSize, y1 = y0 + cellSize;
          const square: SimplePolygon = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
          const piece = region.intersect(square);
          let contours: SimplePolygon[];
          try {
            contours = piece.isEmpty() ? [] : piece.toPolygons();
          } finally {
            piece.delete();
          }
          for (const c of contours) {
            const a = shoelace(c);
            if (a < 0) {
              if (-a >= SHELL_TOLERANCE_CM ** 2) throw new Error(`${where}: lattice square (${i}, ${j}) holds a hole of the face`);
              continue;
            }
            if (a < SHELL_TOLERANCE_CM ** 2) continue;
            let ids = dedupeCyclic(c.map(mapCorner));
            ids = dedupeCyclic(withBoundaryPoints(ids, reg, fr, boundary));
            // A contour touching itself at a vertex is two pieces of the square: one Cell each (journal decision 92).
            for (const {ids: lobe, area} of contourLobes(ids, id => to2(fr, reg.positions[id]), `${where}: lattice square (${i}, ${j})`)) {
              if (fr.sign < 0) lobe.reverse();
              cells.push({
                id: cells.length, face: face.id, lattice: [i, j], polygon: lobe.map(id => reg.positions[id]), corners: lobe, sides: [],
                whole: cellSize * cellSize - area <= SHELL_TOLERANCE_CM * cellSize,
              });
            }
          }
        }
      }
    } finally {
      region.delete();
    }
  }

  const netEdges = assembleNetEdges(cells, faces, frames, ea.edges, pts, faceEdges, reg, cellSize);
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
 * Journal decision 59: one NetEdge per pair of consecutive vertices along any Cell side. A side lies on a ShellEdge
 * when both its ends are among that edge's vertices; otherwise it must lie on a lattice line of its face.
 */
function assembleNetEdges(
  cells: ShellCell[], faces: ShellFace[], frames: FrameTable, edges: ShellEdge[], pts: EdgePoints[],
  faceEdges: number[][], reg: VertexRegistry, cellSize: number,
): NetEdge[] {
  const onEdge = pts.map(p => new Set(p.ids));
  const netEdges: NetEdge[] = [];
  const byKey = new Map<string, number>();
  for (const cell of cells) {
    const face = faces[cell.face];
    const fr = frames[cell.face];
    if (!fr) throw new Error(`cell ${cell.id}: its face ${cell.face} has no lattice`);
    cell.sides = cell.corners.map((a, i) => {
      const b = cell.corners[(i + 1) % cell.corners.length];
      const hits = faceEdges[cell.face].filter(e => onEdge[e].has(a) && onEdge[e].has(b));
      if (hits.length > 1) throw new Error(`cell ${cell.id}: side ${a}-${b} lies on ShellEdges ${hits.join(' and ')}`);
      const shellEdge = hits.length ? hits[0] : -1;
      const k = sideKey(a, b);
      let id = byKey.get(k);
      if (id === undefined) {
        const A = reg.positions[a], B = reg.positions[b];
        if (shellEdge < 0) {
          const alongS = Math.abs(A[fr.s] - B[fr.s]) <= SHELL_TOLERANCE_CM && onLattice(A[fr.s], cellSize);
          const alongT = Math.abs(A[fr.t] - B[fr.t]) <= SHELL_TOLERANCE_CM && onLattice(A[fr.t], cellSize);
          if (!alongS && !alongT) throw new Error(`cell ${cell.id}: side ${a}-${b} is neither on a ShellEdge nor on a lattice line`);
        }
        id = netEdges.length;
        byKey.set(k, id);
        netEdges.push({id, kind: shellEdge >= 0 ? edges[shellEdge].kind : interiorSideKind(face, A, B), v: [a, b], cells: [], shellEdge});
      } else if (netEdges[id].shellEdge !== shellEdge) {
        throw new Error(`cell ${cell.id}: side ${a}-${b} reads ShellEdge ${shellEdge}, its NetEdge ${netEdges[id].shellEdge}`);
      }
      netEdges[id].cells.push(cell.id);
      return id;
    });
  }
  return netEdges;
}

/** One Cell's corner at a vertex: the side leaving the vertex and the side arriving at it. */
interface CornerAt { cell: number; out: number; in: number }

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
    const {fan, faces: originFaces} = originRecord(src, asm, ea, reg.origins[id], where);
    let faces = originFaces;
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
    const starts = [...outOf.keys()].filter(e => !ins.has(e)).sort((a, b) => a - b);
    let runs = corners.length ? (starts.length ? starts : [Math.min(...outOf.keys())]).map(walk) : [];
    if (runs.length > 1 && !fan) throw new Error(`${where}: ${runs.length} gaps in its Cell fan away from a mesh vertex`);
    if (fan) {
      // Journal decision 96, F3: each run sits in one triangle of the fan, read just counter-clockwise of its first
      // Cell's leaving side, so runs follow the fan even where one face meets the vertex twice.
      const at = new Map(runs.map(r => [r, fanTriangleOf(src, asm, fan, cells[r.cells[0]], id, reg, where)]));
      runs = [...runs].sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0));
      if (runs.length) {
        const first = fan.faceAt[at.get(runs[0]) ?? 0];
        faces = [...faces.slice(first), ...faces.slice(0, first)];
      }
    }
    const edges = runs.flatMap(r => r.edges), cellIds = runs.flatMap(r => r.cells);
    if (cellIds.length !== corners.length) throw new Error(`${where}: its Cells form a closed fan and a gap at once`);
    if (!fan && cellIds.length) {
      const first = faces.indexOf(cells[cellIds[0]].face);
      if (first > 0) faces = [...faces.slice(first), ...faces.slice(0, first)];
    }
    return {id, p, edges, cells: cellIds, faces};
  });
}

/** One run of Cells around a vertex, from the NetEdge after a gap to the one before the next, in order. */
export interface CellRun { edges: number[]; cells: number[] }

/** What a vertex's origin gives its record: the triangle fan at a mesh vertex, and the faces it lies on. */
export interface OriginRecord { fan: FaceFan | null; faces: number[] }

/**
 * Journal decision 100, B8: a vertex's faces read from its origin, narrowed once and checked exhaustive. A mesh vertex
 * reads its triangle fan, a point inside a ShellEdge that edge's two faces, a lattice corner its one face. An origin
 * of any other shape is a hard error, so no placeholder face id can reach `ShellVertex.faces` or the export.
 */
export function originRecord(src: FaceSource, asm: FaceAssembly, ea: EdgeAssembly, o: VertexOrigin, where: string): OriginRecord {
  switch (o.at) {
    case 'mesh': {
      const fan = faceFan(src, asm, o.vertex);
      return {fan, faces: fan.faces};
    }
    case 'edge': return {fan: null, faces: [...ea.edges[o.edge].faces]};
    case 'face': return {fan: null, faces: [o.face]};
    default: {
      const never: never = o;
      throw new Error(`${where}: an origin of no known kind, ${JSON.stringify(never)}`);
    }
  }
}

const unit = (u: Vec3): Vec3 => {
  const L = Math.hypot(...u);
  return [u[0] / L, u[1] / L, u[2] / L];
};

/**
 * The direction from vertex `v` along the bisector of Cell `c`'s corner there, in the face's plane: half way round,
 * counter-clockwise about `n`, from the side the Cell leaves `v` by to the side it arrives by. It points strictly
 * inside the corner whatever the corner's angle, a straight or reflex one included.
 */
export function cornerBisector(c: ShellCell, v: number, positions: readonly Vec3[], n: Vec3): Vec3 {
  const m = c.corners.length;
  const i = c.corners.indexOf(v);
  const P = positions[v];
  const out = unit(sub3(positions[c.corners[(i + 1) % m]], P));
  const back = unit(sub3(positions[c.corners[(i - 1 + m) % m]], P));
  const turn = cross3(n, out);
  let angle = Math.atan2(dot3(cross3(out, back), n), dot3(out, back));
  if (angle <= 0) angle += 2 * Math.PI;
  const cs = Math.cos(angle / 2), sn = Math.sin(angle / 2);
  return [cs * out[0] + sn * turn[0], cs * out[1] + sn * turn[1], cs * out[2] + sn * turn[2]];
}

/**
 * Journal decision 101, F37: the index in `fan` of the triangle holding Cell `c`'s corner at vertex `v`, found by the
 * bisector of that corner, strictly inside each of the Cell's face's fan triangles' wedges or none. Every coordinate,
 * the Cell's corners and the fan triangles' corners alike, is read on the 1/1024 cm grid (`snapPoint`), so the Cell's
 * sides and the wedges are measured in one consistent coordinate set.
 */
function fanTriangleOf(src: FaceSource, asm: FaceAssembly, fan: FaceFan, c: ShellCell, v: number, reg: VertexRegistry, where: string): number {
  const {tris, positions} = src.mesh;
  const V = reg.positions[v];
  const n = asm.faces[c.face].normal;
  const d = cornerBisector(c, v, reg.positions, n);
  const grid = (m: number): Vec3 => snapPoint(meshPoint(positions, m));
  for (const [k, h] of fan.halves.entries()) {
    if (asm.triFace[triOf(h)] !== c.face) continue;
    const a = sub3(grid(destOf(tris, h)), V), b = sub3(grid(originOf(tris, prevHalf(h))), V);
    if (dot3(cross3(a, d), n) > 0 && dot3(cross3(d, b), n) > 0) return k;
  }
  throw new Error(`${where}: Cell ${c.id} lies in no triangle of its face's fan`);
}
