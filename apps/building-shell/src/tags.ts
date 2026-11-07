// Face tags (spec decision 10), face identity (journal decision 41) and the coplanar re-tag order (spec decision 14).
import type {Vec3} from 'manifold-3d';
import {SHELL_TOLERANCE_CM} from './constants.ts';

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
 * The tag table and, per `faceID`, the oriented plane the face was generated on. Every raw part of a building draws
 * its `faceID`s from one `ShellTags`, so a `faceID` is unique across all parts and survives the union (spec 13).
 */
export interface ShellTags { table: TagTable; planes: Plane3[] }

export function makeShellTags(): ShellTags {
  return {table: [], planes: []};
}

/** Registers one face and returns its `faceID`. */
export function addFace(tags: ShellTags, tag: FaceTag, plane: Plane3): number {
  tags.table.push(tag);
  tags.planes.push(plane);
  return tags.table.length - 1;
}

/** A face's identity: `(kind, storey, plane)` for Roof, `(kind, storey, wall)` for every other kind. */
export function identityKey(t: FaceTag): string {
  return t.kind === 'Roof' ? `Roof|${t.storey}|p${t.plane}` : `${t.kind}|${t.storey}|w${t.wall}`;
}

export const sameIdentity = (a: FaceTag, b: FaceTag): boolean => identityKey(a) === identityKey(b);

/**
 * Spec decision 14's total order as ranks, strongest lowest. A `Record` over `RetaggableKind`, so adding a kind
 * without ranking it fails to compile.
 */
export const RETAG_RANK: Readonly<Record<RetaggableKind, number>> = {Wall: 0, Gable: 1, Roof: 2, Underside: 3, Ground: 4, Cheek: 5};

export const isRetaggable = (k: ShellKind): k is RetaggableKind => k !== 'Internal';

/**
 * Negative when `a` beats `b`. Kind by `RETAG_RANK`, then the lower storey. Two different identities of equal kind
 * and storey (only possible for collinear walls or coplanar planes of separate islands) fall to the lower wall id,
 * then the lower plane id, so the order is total.
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
