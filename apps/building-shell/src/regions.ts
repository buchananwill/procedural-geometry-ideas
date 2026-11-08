// Spec decision 15's winning regions, read off the raw faces. On one oriented plane, a point's holders are the
// identities (decision 10) whose raw triangles hold it; its winner is the strongest of them by decision 14's order.
// The re-tag pass (`union.ts`) reads the winner at each output triangle's centroid, and the imprint (`imprint.ts`) cuts
// the output mesh along every line where the winner changes, so that one centroid speaks for the whole triangle.
import {SHELL_TOLERANCE_CM} from './constants.ts';
import type {RawPart} from './storey.ts';
import {FaceTag, Plane3, ShellTags, Vec3, identityKey, retagCompare, samePlane} from './tags.ts';
import {cross3, dot3, scale3, sub3, unit3} from './vec3.ts';

/**
 * The re-tag pass's containment slack, in cm: how far outside a raw triangle's edge a point may lie and still count as
 * held. Above float32 noise (about 1e-4 cm), and well below `SHELL_TOLERANCE_CM` so it cannot relabel a genuine thin
 * face (spec decision 16 as amended, journal decision 73).
 */
export const RETAG_SLACK_CM = 1e-3;

/** One edge of a raw triangle: its start point and the unit normal pointing into the triangle, in its plane. */
export interface RawTriEdge { o: Vec3; m: Vec3 }

/** A raw triangle prepared for the containment test on its face's plane. Its corners are its edges' `o`, in order. */
export interface RawTri { edges: RawTriEdge[]; lo: Vec3; hi: Vec3 }

/** Prepares a raw triangle on a face with outward normal `n`; null below `SHELL_TOLERANCE_CM`² of area. */
export function prepareRawTri(a: Vec3, b: Vec3, c: Vec3, n: Vec3): RawTri | null {
  const area = Math.hypot(...cross3(sub3(b, a), sub3(c, a))) / 2;
  if (area < SHELL_TOLERANCE_CM ** 2) return null;
  const edges = [[a, b], [b, c], [c, a]].map(([o, e]): RawTriEdge => ({o, m: unit3(cross3(n, sub3(e, o)))}));
  const lo: Vec3 = [Math.min(a[0], b[0], c[0]) - RETAG_SLACK_CM, Math.min(a[1], b[1], c[1]) - RETAG_SLACK_CM, Math.min(a[2], b[2], c[2]) - RETAG_SLACK_CM];
  const hi: Vec3 = [Math.max(a[0], b[0], c[0]) + RETAG_SLACK_CM, Math.max(a[1], b[1], c[1]) + RETAG_SLACK_CM, Math.max(a[2], b[2], c[2]) + RETAG_SLACK_CM];
  return {edges, lo, hi};
}

/** Whether the raw triangle holds point `q`, allowing `RETAG_SLACK_CM` outside each edge. */
export const rawTriHolds = (t: RawTri, q: Vec3): boolean =>
  q[0] >= t.lo[0] && q[0] <= t.hi[0] && q[1] >= t.lo[1] && q[1] <= t.hi[1] && q[2] >= t.lo[2] && q[2] <= t.hi[2]
  && t.edges.every(e => dot3(e.m, sub3(q, e.o)) >= -RETAG_SLACK_CM);

/**
 * Point `q` projected onto plane `p`. An output vertex can lie up to the cleaning's move off its plane (1.6e-3 cm
 * measured, journal decision 110), beyond `RETAG_SLACK_CM`, so a point is projected before any containment test:
 * the slack bounds the in-plane test only.
 */
export function ontoPlane(q: Vec3, p: Plane3): Vec3 {
  return sub3(q, scale3(p.n, dot3(p.n, q) - p.d));
}

/** One build's raw faces, prepared for reading winning regions on any face's plane. */
export interface RegionModel {
  tags: ShellTags;
  /** Per faceID: its raw triangles, on its face's exact generating plane. */
  raw: RawTri[][];
  /** Per faceID: every non-Internal faceID on its oriented plane (`samePlane`), itself included, ascending. */
  peersOf(f: number): number[];
  /** Per faceID: how many distinct identities its peers carry, read on its own plane. */
  identitiesOn(f: number): number;
  /**
   * The identities holding point `q`, projected onto faceID `f`'s plane, one `FaceTag` each, strongest first by decision
   * 14's order. `f`'s own tag stands for its identity when `f`'s raw triangles hold `q`; otherwise the lowest holding
   * peer does.
   */
  holdersAt(f: number, q: Vec3): FaceTag[];
}

/** Prepares every raw part's triangles, per faceID, for the region reads. */
export function makeRegionModel(parts: RawPart[], tags: ShellTags): RegionModel {
  const {table, planes, clusters} = tags;
  const raw: RawTri[][] = table.map(() => []);
  for (const part of parts) {
    const {positions: P, tris, faceIDs} = part.soup;
    for (let t = 0; t < tris.length / 3; t++) {
      const f = faceIDs[t];
      const v = (j: number): Vec3 => [P[3 * tris[3 * t + j]], P[3 * tris[3 * t + j] + 1], P[3 * tris[3 * t + j] + 2]];
      const r = prepareRawTri(v(0), v(1), v(2), planes[f].n);
      if (r) raw[f].push(r);
    }
  }
  const peers = new Map<number, number[]>();
  const peersOf = (f: number): number[] => {
    let got = peers.get(f);
    if (!got) {
      got = table.map((_, g) => g).filter(g => table[g].kind !== 'Internal' && samePlane(planes[f], planes[g]));
      peers.set(f, got);
    }
    return got;
  };
  const counts = new Map<number, number>();
  const identitiesOn = (f: number): number => {
    let n = counts.get(f);
    if (n === undefined) {
      n = new Set(peersOf(f).map(g => identityKey(table[g], planes[f], clusters))).size;
      counts.set(f, n);
    }
    return n;
  };
  const holdersAt = (f: number, at: Vec3): FaceTag[] => {
    const q = ontoPlane(at, planes[f]);
    // Every peer lies on f's oriented plane, so f's plane is every candidate's identity plane.
    const found = new Map<string, FaceTag>();
    for (const g of [f, ...peersOf(f).filter(g => g !== f)]) {
      if (table[g].kind === 'Internal') continue;
      const k = identityKey(table[g], planes[f], clusters);
      if (found.has(k)) continue;
      if (raw[g].some(r => rawTriHolds(r, q))) found.set(k, table[g]);
    }
    return [...found.values()].sort(retagCompare);
  };
  return {tags, raw, peersOf, identitiesOn, holdersAt};
}
