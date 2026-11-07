// Face tags (spec decision 10), face identity (journal decision 41) and the coplanar re-tag order (spec decision 14).

export type ShellKind = 'Wall' | 'Gable' | 'Roof' | 'Underside' | 'Ground' | 'Cheek' | 'Internal';

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

/** `faceID` to `FaceTag`: a raw triangle's `faceID` is its index here. */
export type TagTable = FaceTag[];

export type Vec3 = [number, number, number];

/** An oriented plane: `dot(n, p) = d`, `n` the outward unit normal. */
export interface Plane3 { n: Vec3; d: number }

/**
 * The tag table and, per `faceID`, the oriented plane the face was generated on. Every raw part of a building draws
 * its `faceID`s from one `ShellTags`, so a `faceID` is unique across all parts and survives the union (spec 13).
 */
export interface ShellTags { table: TagTable; planes: Plane3[] }

export const makeShellTags = (): ShellTags => ({table: [], planes: []});

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

/** Spec decision 14's total order, strongest first. Internal takes no part in re-tagging. */
export const RETAG_ORDER: readonly ShellKind[] = ['Wall', 'Gable', 'Roof', 'Underside', 'Ground', 'Cheek'];

/**
 * Negative when `a` beats `b`. Kind by `RETAG_ORDER`, then the lower storey. Two different identities of equal kind
 * and storey (only possible for collinear walls or coplanar planes of separate islands) fall to the lower wall id,
 * then the lower plane id, so the order is total.
 */
export function retagCompare(a: FaceTag, b: FaceTag): number {
  const ka = RETAG_ORDER.indexOf(a.kind), kb = RETAG_ORDER.indexOf(b.kind);
  if (ka < 0 || kb < 0) throw new Error(`retagCompare: Internal takes no part in re-tagging (${tagLabel(a)} vs ${tagLabel(b)})`);
  return ka - kb || a.storey - b.storey || a.wall - b.wall || a.plane - b.plane;
}

export function tagLabel(t: FaceTag): string {
  const where = t.kind === 'Roof' ? `plane ${t.plane}` : t.wall >= 0 ? `wall ${t.wall}` : 'no wall';
  return `${t.kind} storey ${t.storey} ${where} (part ${t.part})`;
}

export function planeLabel(p: Plane3): string {
  const f = (v: number): string => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6);
  return `n=(${f(p.n[0])}, ${f(p.n[1])}, ${f(p.n[2])}) d=${p.d.toFixed(3)}`;
}
