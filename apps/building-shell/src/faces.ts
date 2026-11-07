// Step 4, first part: the union's output triangles grouped into ShellFaces (spec decision 18). A face is a maximal
// edge-connected set of triangles sharing one identity (decision 10) and one oriented plane.
import {FaceTag, Plane3, Vec3, identityKey, samePlane} from './tags.ts';
import {ShellMesh, ShellUnion, triArea} from './union.ts';

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

export const nextHalf = (h: number): number => 3 * Math.floor(h / 3) + (h % 3 + 1) % 3;
export const prevHalf = (h: number): number => 3 * Math.floor(h / 3) + (h % 3 + 2) % 3;
export const triOf = (h: number): number => Math.floor(h / 3);

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

const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A closed polygon's signed area about `n`: positive when it winds counter-clockwise seen from `n`'s side. */
export function loopArea(loop: Vec3[], n: Vec3): number {
  let s: Vec3 = [0, 0, 0];
  for (let i = 0; i < loop.length; i++) {
    const c = cross3(loop[i], loop[(i + 1) % loop.length]);
    s = [s[0] + c[0], s[1] + c[1], s[2] + c[2]];
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
}

/** Union-find over triangles. */
function makeFind(n: number): {find: (i: number) => number; join: (i: number, j: number) => void} {
  const parent = Int32Array.from({length: n}, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  return {find, join: (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }};
}

/**
 * Spec decision 18: groups the output triangles into faces. Two triangles across a manifold edge join when they share
 * an identity and an oriented plane (`samePlane` on their faceIDs' generating planes); triangles touching only at a
 * vertex never join. Faces are numbered by their lowest triangle. Each face's loops keep every boundary vertex until
 * `reduceFaceLoops` keeps only the ShellEdge endpoints.
 */
export function assembleFaces(src: FaceSource): FaceAssembly {
  const {mesh, triTags, tags} = src;
  const nTri = mesh.tris.length / 3;
  const topo = meshTopology(mesh.tris, mesh.positions.length / 3);
  const planeOf = (t: number): Plane3 => tags.planes[mesh.faceIDs[t]];
  const keys = triTags.map(identityKey);
  const {find, join} = makeFind(nTri);
  for (let h = 0; h < mesh.tris.length; h++) {
    const g = topo.twin[h];
    if (g < h) continue;
    const t = triOf(h), u = triOf(g);
    if (keys[t] === keys[u] && samePlane(planeOf(t), planeOf(u))) join(t, u);
  }  const faceOfRoot = new Map<number, number>();
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
    loopVerts[f].push(loop);
  }
  // No -0 in a plane: it reads as 0 once exported to JSON.
  const unsigned = (n: Vec3): Vec3 => [n[0] || 0, n[1] || 0, n[2] || 0];
  const faces: ShellFace[] = firstTri.map((t, id) => ({
    id, tag: triTags[t], normal: unsigned(planes[id].n), offset: planes[id].d || 0, loops: [], area: 0,
  }));
  for (const face of faces) setLoops(face, loopVerts[face.id], mesh.positions);
  return {faces, triFace, topo, planes, loopVerts};
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
    const kept = asm.loopVerts[face.id].map(l => l.filter(isEndpoint));
    for (const [i, l] of kept.entries()) {
      if (l.length < 3) throw new Error(`face ${face.id} (${identityKey(face.tag)}): loop ${i} keeps ${l.length} ShellEdge endpoints`);
    }
    asm.loopVerts[face.id] = kept;
    setLoops(face, kept, positions);
  }
}

/** The sum of the output triangles' areas: the mesh's surface area. */
export function meshSurfaceArea(mesh: ShellMesh): number {
  let s = 0;
  for (let t = 0; t < mesh.tris.length / 3; t++) s += triArea(mesh, t);
  return s;
}
