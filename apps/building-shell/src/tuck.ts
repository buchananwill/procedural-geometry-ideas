// Journal decisions 272 and 273, on the cause BSA.F87 found: Manifold's union can leave a tuck, where the closed surface
// turns back on itself through 180 degrees at a fold and tucks part of its area away in zero volume. A tuck is two
// layers on one plane, facing opposite ways over the same ground. Each layer is part of a real face that may continue
// past the tuck into exposed surface. The tuck is labelled, never removed: no triangle is deleted and nothing is welded.
// - **Found exactly.** On every plane the mesh covers from both sides, its two orientations joined by a fold (a mesh
//   edge with a triangle of each), a point lies in a tuck when triangles of both
//   orientations hold it. The tuck's outline is every stretch of those triangles' edges with a tuck on one side of it
//   and none on the other, read as the imprint reads its winner boundaries (`imprint.ts`).
// - **Cut.** Both layers are cut along the outline by the imprint's own cut (`cutAlongBoundaries`), so the mesh stays
//   closed.
// - **Labelled.** After the re-tag pass, every triangle of either layer whose centroid lies in the tuck takes the kind
//   `Tuck`, its storey, wall, plane and part kept. The rest of each real face keeps its own tag.
// Step 4 then lays no Cells on a Tuck face and reads each rim Edge through the tuck (`edges.ts`).
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {Boundary, IMPRINT_SIDE_CM, IMPRINT_TOLERANCE_CM, CutResult, cutAlongBoundaries} from './imprint.ts';
import type {ShellMesh} from './mesh.ts';
import {RawTri, ontoPlane, prepareRawTri, rawTriHolds} from './regions.ts';
import {FaceTag, Plane3, ShellTags, Vec3, samePlane} from './tags.ts';
import {makeUnionFind} from './halfedge.ts';
import {add3, cross3, dist3, dot3, pointAt, scale3, sub3, unit3} from './vec3.ts';

/** An oriented plane reversed: the same points, the normal flipped. */
export const flipPlane = (p: Plane3): Plane3 => ({n: [-p.n[0] || 0, -p.n[1] || 0, -p.n[2] || 0], d: -p.d || 0});

/**
 * One plane the mesh covers from both sides, where some triangles of the two orientations overlap: `plane` is the
 * orientation of `front`'s faceIDs, `back`'s the reverse.
 */
export interface TuckPlane {
  plane: Plane3;
  /** The faceIDs on `plane` and on its reverse. */
  front: Set<number>;
  back: Set<number>;
  /** The mesh triangles of each orientation, projected onto their plane, for the containment test. */
  frontTris: RawTri[];
  backTris: RawTri[];
  /** The tuck's outline on this plane: every stretch of edge with a tuck on one side only. */
  outline: Boundary[];
}

/** Every plane of the mesh that may hold a tuck. */
export interface TuckModel { planes: TuckPlane[] }

/** What the tuck pass reports: the tucks, each an edge-connected region of one layer, and what the cut did. */
export interface TuckStats {
  /** The tucks the shell has: per plane, the edge-connected regions of Tuck triangles on its front layer. */
  tucks: number;
  /** Output triangles cut along an outline, those split only at a new vertex, and the vertices added. */
  split: number;
  neighbours: number;
  added: number;
}

export const NO_TUCKS: Readonly<TuckStats> = {tucks: 0, split: 0, neighbours: 0, added: 0};

/** Whether point `x`, projected onto the plane, is held by triangles of both orientations: whether it lies in a tuck. */
export function inTuck(tp: TuckPlane, x: Vec3): boolean {
  const q = ontoPlane(x, tp.plane);
  return tp.frontTris.some(r => rawTriHolds(r, q)) && tp.backTris.some(r => rawTriHolds(r, q));
}

const triCorner = (mesh: ShellMesh, t: number, j: number): Vec3 => pointAt(mesh.positions, mesh.tris[3 * t + j]);

/**
 * The mesh's triangles per faceID, of every kind: a tuck is labelled whatever its layers' kinds, an Internal cut face's
 * included (journal decision 272 as ruled for WP-C3). Only the doubled region is relabelled, so an Internal face
 * outside a tuck stays Internal and counted (spec decision 17).
 */
function trianglesByFaceID(mesh: ShellMesh): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (let t = 0; t < mesh.tris.length / 3; t++) {
    const f = mesh.faceIDs[t];
    const l = out.get(f);
    if (l) l.push(t); else out.set(f, [t]);
  }
  return out;
}

/** A triangle projected onto `plane` and prepared for the containment test, or null when it has no area. */
const projectedTri = (mesh: ShellMesh, t: number, plane: Plane3): RawTri | null =>
  prepareRawTri(ontoPlane(triCorner(mesh, t, 0), plane), ontoPlane(triCorner(mesh, t, 1), plane), ontoPlane(triCorner(mesh, t, 2), plane), plane.n);

/** Whether two prepared triangles' boxes meet, so they may overlap. */
const boxesMeet = (a: RawTri, b: RawTri): boolean =>
  a.lo[0] <= b.hi[0] && b.lo[0] <= a.hi[0] && a.lo[1] <= b.hi[1] && b.lo[1] <= a.hi[1] && a.lo[2] <= b.hi[2] && b.lo[2] <= a.hi[2];

/**
 * The tuck's outline on one plane: every stretch of a front or back triangle's edge whose two sides, read
 * `IMPRINT_SIDE_CM` off it, differ in whether they lie in a tuck. A stretch ends wherever another such edge crosses or
 * touches it, so the answer is constant along each side of it (as `imprint.ts` reads its winner boundaries).
 */
function outlineOf(tp: TuckPlane, edges: [Vec3, Vec3][]): Boundary[] {
  const n = tp.plane.n;
  const tol = IMPRINT_TOLERANCE_CM;
  const out: Boundary[] = [];
  for (const [p, q] of edges) {
    const L = dist3(p, q);
    if (L <= tol) continue;
    const dir = scale3(sub3(q, p), 1 / L);
    const side = unit3(cross3(n, dir));
    const ts = [0, 1];
    for (const [r, s] of edges) {
      const dr = dot3(side, sub3(r, p)), ds = dot3(side, sub3(s, p));
      const tr = dot3(dir, sub3(r, p)) / L, tsv = dot3(dir, sub3(s, p)) / L;
      if (Math.abs(dr) <= tol) ts.push(tr);
      if (Math.abs(ds) <= tol) ts.push(tsv);
      if ((dr > tol && ds < -tol) || (dr < -tol && ds > tol)) ts.push(tr + (dr / (dr - ds)) * (tsv - tr));
    }
    const cuts = [...new Set(ts.filter(t => t >= 0 && t <= 1))].sort((x, y) => x - y);
    let open: number | null = null;
    let close = 0;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const t0 = cuts[i], t1 = cuts[i + 1];
      if ((t1 - t0) * L <= tol) continue;
      const m = add3(p, scale3(dir, ((t0 + t1) / 2) * L));
      const differs = inTuck(tp, add3(m, scale3(side, IMPRINT_SIDE_CM))) !== inTuck(tp, add3(m, scale3(side, -IMPRINT_SIDE_CM)));
      if (differs && open === null) open = t0;
      if (differs) close = t1;
      if (!differs && open !== null) {
        out.push({p: add3(p, scale3(dir, open * L)), q: add3(p, scale3(dir, close * L))});
        open = null;
      }
    }
    if (open !== null) out.push({p: add3(p, scale3(dir, open * L)), q: add3(p, scale3(dir, close * L))});
  }
  return out;
}

/** Whether some mesh edge has a triangle of `front` on one side and one of `back` on the other: a fold. */
function foldsBetween(mesh: ShellMesh, front: number[], back: number[]): boolean {
  const backEdges = new Set<string>();
  for (const t of back) for (let j = 0; j < 3; j++) backEdges.add(`${mesh.tris[3 * t + j]},${mesh.tris[3 * t + (j + 1) % 3]}`);
  return front.some(t => [0, 1, 2].some(j => backEdges.has(`${mesh.tris[3 * t + (j + 1) % 3]},${mesh.tris[3 * t + j]}`)));
}

/**
 * Finds every plane the mesh covers from both sides with overlapping triangles joined by a fold, and each one's tuck
 * outline. A mesh with no such plane yields none, and the pass leaves it as it is.
 */
export function findTucks(mesh: ShellMesh, tags: ShellTags): TuckModel {
  const {planes} = tags;
  const byFaceID = trianglesByFaceID(mesh);
  const present = [...byFaceID.keys()].sort((a, b) => a - b);
  const done = new Set<number>();
  const out: TuckPlane[] = [];
  for (const f of present) {
    if (done.has(f)) continue;
    const plane = planes[f];
    const front = present.filter(g => samePlane(planes[g], plane));
    const back = present.filter(g => samePlane(planes[g], flipPlane(plane)));
    front.forEach(g => done.add(g));
    back.forEach(g => done.add(g));
    if (!back.length) continue;
    const prepared = (ids: number[], p: Plane3): RawTri[] =>
      ids.flatMap(g => (byFaceID.get(g) ?? []).flatMap(t => { const r = projectedTri(mesh, t, p); return r ? [r] : []; }));
    // A tuck is the surface turned back on itself: its layers meet at a fold, a mesh edge with a triangle of each
    // orientation. Coplanar opposite faces with no fold between them are separate sheets (two islands near touching,
    // journal decision 150, F6), not a tuck.
    if (!foldsBetween(mesh, front.flatMap(g => byFaceID.get(g) ?? []), back.flatMap(g => byFaceID.get(g) ?? []))) continue;
    const frontTris = prepared(front, plane), backTris = prepared(back, flipPlane(plane));
    if (!frontTris.some(a => backTris.some(b => boxesMeet(a, b)))) continue;
    const tp: TuckPlane = {plane, front: new Set(front), back: new Set(back), frontTris, backTris, outline: []};
    const seen = new Set<string>();
    const edges: [Vec3, Vec3][] = [];
    for (const r of [...frontTris, ...backTris]) {
      for (let i = 0; i < 3; i++) {
        const a = r.edges[i].o, b = r.edges[(i + 1) % 3].o;
        const ka = a.join(','), kb = b.join(',');
        const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push([a, b]);
      }
    }
    tp.outline = outlineOf(tp, edges);
    out.push(tp);
  }
  return {planes: out};
}

/** Cuts both layers of every tuck along its outline. Returns the mesh itself, untouched, when no outline crosses it. */
export function cutTucks(mesh: ShellMesh, model: TuckModel, tags: ShellTags): CutResult {
  const onPlane = new Map<number, TuckPlane>();
  for (const tp of model.planes) {
    if (!tp.outline.length) continue;
    for (const f of [...tp.front, ...tp.back]) onPlane.set(f, tp);
  }
  if (!onPlane.size) return {mesh, split: 0, neighbours: 0, added: 0};
  return cutAlongBoundaries(mesh, {
    boundariesOf: t => onPlane.get(mesh.faceIDs[t])?.outline ?? [],
    normalOf: t => tags.planes[mesh.faceIDs[t]].n,
  });
}

/** A triangle's centroid. */
const centroid = (mesh: ShellMesh, t: number): Vec3 => scale3(add3(add3(triCorner(mesh, t, 0), triCorner(mesh, t, 1)), triCorner(mesh, t, 2)), 1 / 3);

const triArea = (mesh: ShellMesh, t: number): number => {
  const a = triCorner(mesh, t, 0);
  return Math.hypot(...cross3(sub3(triCorner(mesh, t, 1), a), sub3(triCorner(mesh, t, 2), a))) / 2;
};

/**
 * Labels both layers of every tuck on the cut mesh: a triangle of either orientation whose centroid lies in the tuck
 * takes the kind `Tuck`, its storey, wall, plane and part kept. Returns the tags and the number of tucks: per plane,
 * the edge-connected regions of Tuck triangles on its front layer.
 *
 * A tuck is two layers over the same ground, so on every plane the Tuck area of the two orientations must agree, within
 * `SHELL_TOLERANCE_CM` times the outline's length; anything else (a third layer, say) is a hard error naming the plane.
 */
export function labelTucks(label: string, mesh: ShellMesh, triTags: FaceTag[], model: TuckModel): {triTags: FaceTag[]; tucks: number} {
  const planeOf = new Map<number, TuckPlane>();
  for (const tp of model.planes) for (const f of [...tp.front, ...tp.back]) planeOf.set(f, tp);
  if (!planeOf.size) return {triTags, tucks: 0};
  const out = [...triTags];
  const front = new Map<TuckPlane, number[]>(), area = new Map<TuckPlane, [number, number]>();
  for (let t = 0; t < mesh.tris.length / 3; t++) {
    const tp = planeOf.get(mesh.faceIDs[t]);
    if (!tp || !inTuck(tp, centroid(mesh, t))) continue;
    out[t] = {...triTags[t], kind: 'Tuck'};
    const isFront = tp.front.has(mesh.faceIDs[t]);
    if (isFront) { const l = front.get(tp); if (l) l.push(t); else front.set(tp, [t]); }
    const a = area.get(tp) ?? [0, 0];
    a[isFront ? 0 : 1] += triArea(mesh, t);
    area.set(tp, a);
  }
  for (const [tp, [af, ab]] of area) {
    const length = tp.outline.reduce((s, b) => s + dist3(b.p, b.q), 0);
    if (Math.abs(af - ab) > SHELL_TOLERANCE_CM * Math.max(length, 1)) {
      const n = tp.plane.n.map(x => x.toFixed(6)).join(', ');
      throw new Error(`${label}: a tuck on the plane n=(${n}) d=${tp.plane.d.toFixed(3)} is no pair of layers: ${af.toFixed(3)} cm² face one way, ${ab.toFixed(3)} cm² the other`);
    }
  }
  return {triTags: out, tucks: [...front.values()].reduce((s, ts) => s + components(mesh, ts), 0)};
}

/** The number of edge-connected regions among triangles `ts`. */
function components(mesh: ShellMesh, ts: number[]): number {
  const uf = makeUnionFind(ts.length);
  const byEdge = new Map<string, number>();
  ts.forEach((t, i) => {
    for (let j = 0; j < 3; j++) {
      const a = mesh.tris[3 * t + j], b = mesh.tris[3 * t + (j + 1) % 3];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      const o = byEdge.get(k);
      if (o === undefined) byEdge.set(k, i); else uf.join(i, o);
    }
  });
  return new Set(ts.map((_, i) => uf.find(i))).size;
}
