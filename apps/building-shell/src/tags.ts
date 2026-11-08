// Face tags (spec decision 10), face identity (journal decision 41) and the coplanar re-tag order (spec decision 14).
import type {Vec3} from 'manifold-3d';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {makeUnionFind} from './halfedge.ts';
import {snapCm} from './weld.ts';

/** The app's one 3-vector: manifold-3d's, re-exported so there is a single definition. */
export type {Vec3};

export type ShellKind = 'Wall' | 'Gable' | 'Roof' | 'Underside' | 'Ground' | 'Cheek' | 'Internal';

/** Every kind that takes part in re-tagging (spec decision 14): all but Internal. */
export type RetaggableKind = Exclude<ShellKind, 'Internal'>;

export interface FaceTag {
  kind: ShellKind;
  storey: number;
  /** The storey Building's wall id; -1 for Roof, floors (Ground, Underside) and Internal. */
  wall: number;
  /** The storey Building's canonical plane id for Roof, -1 otherwise. */
  plane: number;
  /** The raw part this face came from. Provenance only: never compared. */
  part: number;
}

/** A tag before its part is known: what a generating plane carries. */
export type PartlessTag = Omit<FaceTag, 'part'>;

/** A tag before its part and storey are filled in: what a part builder writes per face. */
export type LocalTag = Omit<FaceTag, 'part' | 'storey'>;

/** `faceID` to `FaceTag`: a raw triangle's `faceID` is its index here. */
export type TagTable = FaceTag[];

/** An oriented plane: `dot(n, p) = d`, `n` the outward unit normal. */
export interface Plane3 { n: Vec3; d: number }

/** Normals agree when every component is within this (spec decision 15). */
export const PLANE_NORMAL_TOL = 1e-5;

/** Normals within `PLANE_NORMAL_TOL`, componentwise. */
export const sameNormal = (a: Vec3, b: Vec3): boolean =>
  Math.abs(a[0] - b[0]) <= PLANE_NORMAL_TOL && Math.abs(a[1] - b[1]) <= PLANE_NORMAL_TOL && Math.abs(a[2] - b[2]) <= PLANE_NORMAL_TOL;

/** Same oriented plane: normals within `PLANE_NORMAL_TOL`, offsets within `SHELL_TOLERANCE_CM` (spec decision 15). */
export const samePlane = (p: Plane3, q: Plane3): boolean => sameNormal(p.n, q.n) && Math.abs(p.d - q.d) <= SHELL_TOLERANCE_CM;

/**
 * Journal decision 110, C6: one build's oriented planes, clustered as the connected components of the `samePlane`
 * graph. `samePlane` is not transitive, so a cluster can hold two planes further apart than the tolerance, joined
 * through a third. Every plane is registered (`addPlane`; `addFace` registers its face's plane), and the components
 * and their keys are computed over all of them on the first key read after a registration. Neither depends on the order
 * planes were registered or queried in.
 */
export interface PlaneClusters {
  /** Every distinct registered plane (`rep`), in registration order, with its cluster's key (journal decision 107, N11). */
  entries: ClusterEntry[];
  /** A plane's exact text to its index in `entries`. */
  index: Map<string, number>;
  /** Whether a registration has made the keys stale; they are recomputed on the next key read. */
  stale: boolean;
}

/** One registered plane and its cluster's key, which is meaningful only while the clusters are not stale. */
export interface ClusterEntry { rep: Plane3; key: string }

export const makePlaneClusters = (): PlaneClusters => ({entries: [], index: new Map(), stale: false});

/** A plane's exact text: every component as JavaScript prints it, round-tripping, with -0 read as 0. */
const exactText = (p: Plane3): string => `${p.n[0]},${p.n[1]},${p.n[2]}|${p.d}`;

/** A plane's readable text: its normal and offset on the 1/1024 grid. */
const gridText = (p: Plane3): string => `${p.n.map(snapCm).join(',')}|${snapCm(p.d)}`;

/** Registers an oriented plane with the build's clusters and returns its index; a plane already registered keeps its. */
export function addPlane(clusters: PlaneClusters, p: Plane3): number {
  const k = exactText(p);
  let i = clusters.index.get(k);
  if (i === undefined) {
    i = clusters.entries.length;
    clusters.entries.push({rep: p, key: ''});
    clusters.index.set(k, i);
    clusters.stale = true;
  }
  return i;
}

/**
 * Every registered plane's cluster key. Clusters are the `samePlane` graph's connected components, found by union-find
 * over offset buckets `SHELL_TOLERANCE_CM` wide (two `samePlane` planes lie in one bucket or adjacent ones). A cluster's
 * key is the least grid text among its members; clusters whose keys would coincide are ordered by that text and then
 * by their least member's exact text, and all but the first take a `~k` suffix.
 */
function clusterKeys(planes: Plane3[]): string[] {
  const uf = makeUnionFind(planes.length);
  const buckets = new Map<number, number[]>();
  planes.forEach((p, i) => {
    const b = Math.floor(p.d / SHELL_TOLERANCE_CM);
    for (let c = b - 1; c <= b + 1; c++) {
      for (const j of buckets.get(c) ?? []) if (samePlane(planes[j], p)) uf.join(i, j);
    }
    const list = buckets.get(b);
    if (list) list.push(i); else buckets.set(b, [i]);
  });
  const members = new Map<number, number[]>();
  planes.forEach((_, i) => {
    const r = uf.find(i);
    const l = members.get(r);
    if (l) l.push(i); else members.set(r, [i]);
  });
  const least = (xs: string[]): string => xs.reduce((m, x) => (x < m ? x : m));
  const comps = [...members.values()].map(ms => ({
    ms, grid: least(ms.map(i => gridText(planes[i]))), exact: least(ms.map(i => exactText(planes[i]))),
  }));
  comps.sort((a, b) => (a.grid < b.grid ? -1 : a.grid > b.grid ? 1 : a.exact < b.exact ? -1 : a.exact > b.exact ? 1 : 0));
  const keys = new Array<string>(planes.length);
  let k = 0;
  comps.forEach((c, i) => {
    k = i > 0 && comps[i - 1].grid === c.grid ? k + 1 : 0;
    const key = k ? `${c.grid}~${k}` : c.grid;
    for (const m of c.ms) keys[m] = key;
  });
  return keys;
}

/**
 * The tag table and, per `faceID`, the oriented plane the face was generated on. Every raw part of a building draws
 * its `faceID`s from one `ShellTags`, so a `faceID` is unique across all parts and survives the union (spec 13).
 * `clusters` keys the build's planes for face identity.
 */
export interface ShellTags { table: TagTable; planes: Plane3[]; clusters: PlaneClusters }

export function makeShellTags(): ShellTags {
  return {table: [], planes: [], clusters: makePlaneClusters()};
}

/** Registers one face and returns its `faceID`. */
export function addFace(tags: ShellTags, tag: FaceTag, plane: Plane3): number {
  tags.table.push(tag);
  tags.planes.push(plane);
  addPlane(tags.clusters, plane);
  return tags.table.length - 1;
}

/**
 * An oriented plane's key, by `samePlane` clustering (journal decisions 101 and 110), never by rounding alone: two
 * planes within tolerance key alike even where rounding would part them, as at a 1/1024 cm boundary, and so do two
 * planes joined through a third. The key is readable, and alike across builds for one exact plane. Named for what it
 * does first (journal decision 107, N11): a plane not yet registered is registered, which can change keys read before.
 * Every face's plane is registered as the face is added, so a build's keys are fixed before anything reads them.
 */
export function clusterKeyOf(p: Plane3, clusters: PlaneClusters): string {
  const i = addPlane(clusters, p);
  if (clusters.stale) {
    const keys = clusterKeys(clusters.entries.map(e => e.rep));
    clusters.entries.forEach((e, k) => { e.key = keys[k]; });
    clusters.stale = false;
  }
  return clusters.entries[i].key;
}

/**
 * Spec decision 10 as amended (journal decisions 41 and 96), for a face with tag `t` on oriented plane `plane`:
 * - `(kind, storey, plane)` for Roof, `plane` the storey Building's canonical plane id;
 * - `(kind, storey, oriented vertical plane)` for Wall, Gable and Cheek, so collinear walls are one face; the plane
 *   is keyed by the build's `clusters`;
 * - `(kind, storey)` for Underside, Ground and Internal.
 * `part` and `wall` are provenance only, and never enter it.
 */
export function identityKey(t: FaceTag, plane: Plane3, clusters: PlaneClusters): string {
  switch (t.kind) {
    case 'Roof': return `Roof|${t.storey}|p${t.plane}`;
    case 'Wall': case 'Gable': case 'Cheek': return `${t.kind}|${t.storey}|${clusterKeyOf(plane, clusters)}`;
    case 'Underside': case 'Ground': case 'Internal': return `${t.kind}|${t.storey}`;
  }
}

/**
 * Spec decision 14's total order as ranks, strongest lowest. A `Record` over `RetaggableKind`, so adding a kind
 * without ranking it fails to compile.
 */
export const RETAG_RANK: Readonly<Record<RetaggableKind, number>> = {Wall: 0, Gable: 1, Roof: 2, Underside: 3, Ground: 4, Cheek: 5};

export const isRetaggable = (k: ShellKind): k is RetaggableKind => k !== 'Internal';

/**
 * Negative when `a` beats `b`. Kind by `RETAG_RANK`, then the lower storey. Two different identities of equal kind
 * and storey on one plane (only possible for coplanar Roof planes of separate islands, since journal decision 96 keys
 * vertical faces by plane) fall to the lower wall id, then the lower plane id, so the order is total.
 */
export function retagCompare(a: FaceTag, b: FaceTag): number {
  const ka = a.kind, kb = b.kind;
  if (!isRetaggable(ka) || !isRetaggable(kb)) throw new Error(`retagCompare: Internal takes no part in re-tagging (${tagLabel(a)} vs ${tagLabel(b)})`);
  return RETAG_RANK[ka] - RETAG_RANK[kb] || a.storey - b.storey || a.wall - b.wall || a.plane - b.plane;
}

export function tagLabel(t: FaceTag): string {
  const where = t.kind === 'Roof' ? `plane ${t.plane}` : t.wall >= 0 ? `wall ${t.wall}` : 'no wall';
  return `${t.kind} storey ${t.storey} ${where} (part ${t.part})`;
}

export function planeLabel(p: Plane3): string {
  const f = (v: number): string => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6);
  return `n=(${f(p.n[0])}, ${f(p.n[1])}, ${f(p.n[2])}) d=${p.d.toFixed(3)}`;
}
