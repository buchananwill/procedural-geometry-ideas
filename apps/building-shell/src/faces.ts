// Step 4, first part: the union's output triangles grouped into ShellFaces (spec decision 18). A face is a maximal
// edge-connected set of triangles sharing one identity (decision 10) and one oriented plane.
import {FaceTag, Plane3, PlaneClusters, Vec3, identityKey, samePlane} from './tags.ts';
import type {ShellMesh} from './mesh.ts';
import {ShellUnion, triArea} from './union.ts';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {add3, cross3, dot3, lineDistance} from './vec3.ts';
import {makeUnionFind, nextHalf, triOf} from './halfedge.ts';

export interface ShellFace {
  id: number;
  tag: FaceTag;
  /** The outward unit normal of the face's plane, `dot(normal, p) = offset`. */
  normal: Vec3;
  offset: number;
  /** Outer loop first, then holes; each counter-clockwise about `normal` for the outer, clockwise for a hole. */
  loops: Vec3[][];
  /** The area the loops enclose: outer less holes. */
  area: number;
}

/** What face assembly reads from the union: the output mesh, its re-tagged triangles, and each faceID's plane. */
export type FaceSource = Pick<ShellUnion, 'mesh' | 'triTags' | 'tags'>;

/**
 * The output mesh's half-edges. Half-edge `h = 3t + j` runs from corner `j` of triangle `t` to corner `j + 1`, so
 * the triangle lies on its left seen from outside.
 */
export interface MeshTopology {
  /** Per half-edge: the reverse half-edge in the neighbouring triangle. */
  twin: Int32Array;
  /** Per vertex: one half-edge leaving it. */
  out: Int32Array;
}

// The half-edge arithmetic lives in the leaf module `halfedge.ts` (journal decision 107, N9); re-exported here for
// step 4's other parts.
export {nextHalf, prevHalf, triOf} from './halfedge.ts';

/** The origin vertex of half-edge `h`. */
export const originOf = (tris: Uint32Array, h: number): number => tris[h];
/** The destination vertex of half-edge `h`. */
export const destOf = (tris: Uint32Array, h: number): number => tris[nextHalf(h)];

export function meshTopology(tris: Uint32Array, numVert: number): MeshTopology {
  const byKey = new Map<string, number>();
  for (let h = 0; h < tris.length; h++) byKey.set(`${originOf(tris, h)},${destOf(tris, h)}`, h);
  const twin = new Int32Array(tris.length).fill(-1);
  const out = new Int32Array(numVert).fill(-1);
  for (let h = 0; h < tris.length; h++) {
    const g = byKey.get(`${destOf(tris, h)},${originOf(tris, h)}`);
    if (g === undefined) throw new Error(`meshTopology: half-edge ${h} has no twin: the mesh is not closed`);
    twin[h] = g;
    if (out[originOf(tris, h)] < 0) out[originOf(tris, h)] = h;
  }
  return {twin, out};
}

/** A mesh vertex's position, with no -0 (it reads as 0 once exported to JSON). */
export const meshPoint = (positions: Float32Array, v: number): Vec3 => [positions[3 * v] || 0, positions[3 * v + 1] || 0, positions[3 * v + 2] || 0];

/** A closed polygon's signed area about `n`: positive when it winds counter-clockwise seen from `n`'s side. */
export function loopArea(loop: Vec3[], n: Vec3): number {
  let s: Vec3 = [0, 0, 0];
  for (let i = 0; i < loop.length; i++) {
    s = add3(s, cross3(loop[i], loop[(i + 1) % loop.length]));
  }
  return dot3(s, n) / 2;
}

/** The faces, and the per-triangle and per-face records step 4's later parts read. */
export interface FaceAssembly {
  faces: ShellFace[];
  /** Per output triangle: its face id. */
  triFace: Int32Array;
  topo: MeshTopology;
  /** Per face: its plane (the generating plane of its first triangle's faceID). */
  planes: Plane3[];
  /** Per face: its loops as mesh vertex indices, outer first, every boundary vertex kept. */
  loopVerts: number[][][];
  /** Per face: its identity (`faceIdentity`), for labels. */
  identities: string[];
  /** Per face: the chains loop reduction dropped (journal decision 110, C5), empty until `reduceFaceLoops`. */
  dropped: DroppedChain[][];
}


/**
 * Journal decision 96, F2: splits a traced boundary loop at every vertex it visits twice, so a hole touching its
 * face's outer loop at a vertex comes out as two simple loops, never one self-touching loop.
 */
export function splitSimpleLoops(loop: number[]): number[][] {
  const out: number[][] = [];
  const stack: number[] = [];
  const at = new Map<number, number>();
  for (const v of loop) {
    const i = at.get(v);
    if (i !== undefined) {
      const sub = stack.splice(i);
      for (const x of sub) at.delete(x);
      out.push(sub);
    }
    at.set(v, stack.length);
    stack.push(v);
  }
  out.push(stack);
  return out;
}

/** A face's identity (spec decision 10 as amended), read on its own plane, its plane keyed by the build's clusters. */
export const faceIdentity = (f: ShellFace, clusters: PlaneClusters): string => identityKey(f.tag, {n: f.normal, d: f.offset}, clusters);

/**
 * Spec decision 18: groups the output triangles into faces. Two triangles across a manifold edge join when they share
 * an identity and an oriented plane (`samePlane` on their faceIDs' generating planes); triangles touching only at a
 * vertex never join. Faces are numbered by their lowest triangle. Each face's loops are simple (split where a loop
 * touches itself) and keep every boundary vertex until `reduceFaceLoops` keeps only the ShellEdge endpoints.
 */
export function assembleFaces(src: FaceSource): FaceAssembly {
  const {mesh, triTags, tags} = src;
  const nTri = mesh.tris.length / 3;
  const topo = meshTopology(mesh.tris, mesh.positions.length / 3);
  const planeOf = (t: number): Plane3 => tags.planes[mesh.faceIDs[t]];
  const keys = triTags.map((tag, t) => identityKey(tag, planeOf(t), tags.clusters));
  const {find, join} = makeUnionFind(nTri);
  for (let h = 0; h < mesh.tris.length; h++) {
    const g = topo.twin[h];
    if (g < h) continue;
    const t = triOf(h), u = triOf(g);
    if (keys[t] === keys[u] && samePlane(planeOf(t), planeOf(u))) join(t, u);
  }
  const faceOfRoot = new Map<number, number>();
  const triFace = new Int32Array(nTri);
  const firstTri: number[] = [];
  for (let t = 0; t < nTri; t++) {
    const r = find(t);
    let f = faceOfRoot.get(r);
    if (f === undefined) { f = firstTri.length; faceOfRoot.set(r, f); firstTri.push(t); }
    triFace[t] = f;
  }
  const planes = firstTri.map(planeOf);

  // Boundary loops: follow each boundary half-edge to the next one leaving its destination within the same face.
  const loopVerts: number[][][] = firstTri.map(() => []);
  const seen = new Uint8Array(mesh.tris.length);
  const isBoundary = (h: number): boolean => triFace[triOf(topo.twin[h])] !== triFace[triOf(h)];
  for (let h0 = 0; h0 < mesh.tris.length; h0++) {
    if (seen[h0] || !isBoundary(h0)) continue;
    const f = triFace[triOf(h0)];
    const loop: number[] = [];
    let h = h0;
    do {
      seen[h] = 1;
      loop.push(originOf(mesh.tris, h));
      let g = nextHalf(h);
      while (!isBoundary(g)) g = nextHalf(topo.twin[g]);
      h = g;
    } while (h !== h0);
    loopVerts[f].push(...splitSimpleLoops(loop));
  }
  // No -0 in a plane: it reads as 0 once exported to JSON.
  const unsigned = (n: Vec3): Vec3 => [n[0] || 0, n[1] || 0, n[2] || 0];
  const faces: ShellFace[] = firstTri.map((t, id) => ({
    id, tag: triTags[t], normal: unsigned(planes[id].n), offset: planes[id].d || 0, loops: [], area: 0,
  }));
  for (const face of faces) setLoops(face, loopVerts[face.id], mesh.positions);
  const identities = faces.map(f => faceIdentity(f, tags.clusters));
  return {faces, triFace, topo, planes, loopVerts, identities, dropped: faces.map(() => [])};
}

/** Sets a face's loops from mesh vertex lists: outer (largest signed area) first, and its area, outer less holes. */
function setLoops(face: ShellFace, loops: number[][], positions: Float32Array): void {
  const pts = loops.map(l => l.map(v => meshPoint(positions, v)));
  const areas = pts.map(l => loopArea(l, face.normal));
  const order = pts.map((_, i) => i).sort((a, b) => areas[b] - areas[a]);
  loops.splice(0, loops.length, ...order.map(i => loops[i]));
  face.loops = order.map(i => pts[i]);
  face.area = areas.reduce((s, a) => s + a, 0);
}

/**
 * Keeps only the loop vertices that end a ShellEdge, dropping collinear mesh vertices inside a run, and recomputes
 * each face's loops and area from what is kept. `isEndpoint` reads a mesh vertex index.
 */
export function reduceFaceLoops(asm: FaceAssembly, positions: Float32Array, isEndpoint: (v: number) => boolean): void {
  for (const face of asm.faces) {
    const where = `face ${face.id} (${asm.identities[face.id]})`;
    const full = asm.loopVerts[face.id];
    const kept = full.map(l => l.filter(isEndpoint));
    for (const [i, l] of kept.entries()) {
      if (l.length < 3) throw new Error(`${where}: loop ${i} keeps ${l.length} ShellEdge endpoints`);
    }
    const dropped = full.flatMap(l => droppedChains(l, isEndpoint));
    for (const d of dropped) {
      const a = meshPoint(positions, d.from), b = meshPoint(positions, d.to);
      for (const v of d.dropped) {
        const off = lineDistance(meshPoint(positions, v), a, b);
        if (off > SHELL_TOLERANCE_CM) throw new Error(`${where}: loop reduction drops vertex ${v}, ${off} cm off its chord`);
      }
    }
    asm.dropped[face.id] = dropped;
    asm.loopVerts[face.id] = kept;
    setLoops(face, kept, positions);
  }
}

/**
 * Journal decision 110, C5: what loop reduction drops along one loop. Each chain runs between two kept vertices, its
 * dropped vertices in loop order; `from` and `to` are the kept ends, so the chain's polygon is `from`, the dropped
 * vertices, `to`.
 */
export interface DroppedChain { from: number; dropped: number[]; to: number }

/** The chains of non-endpoint vertices along a closed loop, each between the kept vertices either side of it. */
export function droppedChains(loop: number[], isEndpoint: (v: number) => boolean): DroppedChain[] {
  const first = loop.findIndex(isEndpoint);
  if (first < 0) return [];
  const n = loop.length;
  const out: DroppedChain[] = [];
  let from = loop[first];
  let run: number[] = [];
  for (let k = 1; k <= n; k++) {
    const v = loop[(first + k) % n];
    if (!isEndpoint(v)) { run.push(v); continue; }
    if (run.length) out.push({from, dropped: run, to: v});
    from = v;
    run = [];
  }
  return out;
}

/** The sum of the output triangles' areas: the mesh's surface area. */
export function meshSurfaceArea(mesh: ShellMesh): number {
  let s = 0;
  for (let t = 0; t < mesh.tris.length / 3; t++) s += triArea(mesh, t);
  return s;
}
