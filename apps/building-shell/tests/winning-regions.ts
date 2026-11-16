// Spec decision 15 as amended (journal decision 111, F41): after the imprint, every output triangle lies wholly within
// one winning region, and its tag is that region's winner. Journal decision 122, F-A: the test is exact, a polygon
// test of each triangle against the raw faces, where seven sample points per triangle missed straddles a dense check
// caught. It reads the raw faces through `regions.ts`'s `prepareRawTri` area floor and decision 14's `retagCompare`,
// and the build's plane clusters for identity, but none of `regions.ts`'s containment reads (F-B).
import {FaceTag, Vec3, identityKey, retagCompare, samePlane, tagLabel} from '../src/tags.ts';
import {ShellUnion, prepareRawTri} from '../src/union.ts';
import {ontoPlane} from '../src/regions.ts';
import {cross3, dot3, pointAt, unit3} from '../src/vec3.ts';
import type {Vec2} from 'manifold-3d';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {AREA_EPS_PER_CM2} from './test-constants.ts';

/**
 * How far inside every side of its triangle the region test reads, in cm: half the shell's tolerance, beyond the
 * re-tag slack plus the 1.6e-3 cm a cleaned vertex may have moved (journal decision 110), so the eroded triangle meets
 * only the faces on its own side of any boundary it lies along. A triangle too thin to erode is read at its centroid.
 */
export const REGION_SAMPLE_INSET_CM = SHELL_TOLERANCE_CM / 2;


/** What the region invariant reads of a union. */
export type RegionSource = Pick<ShellUnion, 'label' | 'mesh' | 'triTags' | 'tags' | 'parts'>;

/** A convex polygon in a plane's own 2D frame, counter-clockwise. */
export type Convex = Vec2[];

/** The orientation of `a` and `b` about `o`: positive when `o`, `a`, `b` turn counter-clockwise. */
const orient2 = (o: Vec2, a: Vec2, b: Vec2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const area2 = (poly: Convex): number => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - a[1] * b[0]; }
  return s / 2;
};

/** The part of a convex polygon on the left of the directed line `a` to `b` (Sutherland-Hodgman). */
function clipLeft(poly: Convex, a: Vec2, b: Vec2): Convex {
  const out: Convex = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = orient2(a, b, p), sq = orient2(a, b, q);
    if (sp >= 0) out.push(p);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out.length >= 3 ? out : [];
}

/** The area of a convex polygon's overlap with a counter-clockwise triangle. */
function overlap(poly: Convex, tri: Convex): number {
  let r = poly;
  for (let i = 0; i < 3 && r.length; i++) r = clipLeft(r, tri[i], tri[(i + 1) % 3]);
  return r.length ? area2(r) : 0;
}

/** A convex polygon less a counter-clockwise triangle, as convex pieces. */
function minus(poly: Convex, tri: Convex): Convex[] {
  const out: Convex[] = [];
  let r = poly;
  for (let i = 0; i < 3 && r.length; i++) {
    const a = tri[i], b = tri[(i + 1) % 3];
    const outside = clipLeft(r, b, a);
    if (outside.length && area2(outside) > 0) out.push(outside);
    r = clipLeft(r, a, b);
  }
  return out;
}

/** The triangle with every side moved `d` inward, or null when it is too thin for that (its inradius is at most `d`). */
function erode(tri: Convex, d: number): Convex | null {
  const A = area2(tri);
  const perimeter = [0, 1, 2].reduce((s, i) => s + Math.hypot(tri[(i + 1) % 3][0] - tri[i][0], tri[(i + 1) % 3][1] - tri[i][1]), 0);
  if (!(A > 0) || (2 * A) / perimeter <= d) return null;
  const lines = [0, 1, 2].map(i => {
    const a = tri[i], b = tri[(i + 1) % 3];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    return {p: [a[0] + d * nx, a[1] + d * ny] as Vec2, v: [b[0] - a[0], b[1] - a[1]] as Vec2};
  });
  const meet = (l: typeof lines[number], m: typeof lines[number]): Vec2 => {
    const den = l.v[0] * m.v[1] - l.v[1] * m.v[0];
    const t = ((m.p[0] - l.p[0]) * m.v[1] - (m.p[1] - l.p[1]) * m.v[0]) / den;
    return [l.p[0] + t * l.v[0], l.p[1] + t * l.v[1]];
  };
  return [meet(lines[2], lines[0]), meet(lines[0], lines[1]), meet(lines[1], lines[2])];
}

/** Whether point `q` lies in the counter-clockwise triangle, allowing `slack` outside each side. */
const holds = (tri: Convex, q: Vec2, slack: number): boolean => [0, 1, 2].every(i => {
  const a = tri[i], b = tri[(i + 1) % 3];
  return orient2(a, b, q) / Math.hypot(b[0] - a[0], b[1] - a[1]) >= -slack;
});

/**
 * Every output triangle that does not lie wholly within one winning region, or whose tag is not its region's winner,
 * as text; empty when the union passes. Each identity's region on the triangle's oriented plane is the union of its raw
 * triangles; the winner is the strongest identity (decision 14) whose region meets the triangle, eroded by
 * `REGION_SAMPLE_INSET_CM`, in positive area. The triangle straddles when its eroded self is not wholly covered by the
 * winner's region and a weaker identity's region meets what is left; a part covered by no region is unheld. Internal
 * triangles take no part (decision 14).
 */
export function winningRegionViolations(u: RegionSource): string[] {
  const {table, planes, clusters} = u.tags;
  const raw: Vec3[][][] = table.map(() => []);
  for (const part of u.parts) {
    const {positions: P, tris, faceIDs} = part.soup;
    for (let t = 0; t < tris.length / 3; t++) {
      const f = faceIDs[t];
      const v = (j: number): Vec3 => [P[3 * tris[3 * t + j]], P[3 * tris[3 * t + j] + 1], P[3 * tris[3 * t + j] + 2]];
      if (prepareRawTri(v(0), v(1), v(2), planes[f].n)) raw[f].push([v(0), v(1), v(2)]);
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

  const out: string[] = [];
  const P = u.mesh.positions, T = u.mesh.tris;
  for (let t = 0; t < T.length / 3; t++) {
    const f = u.mesh.faceIDs[t];
    if (table[f].kind === 'Internal') continue;
    const {n, d} = planes[f];
    // The plane's own 2D frame, unforeshortened: every point is read in it after projection onto the plane.
    const e1 = unit3(cross3(n, Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    const e2 = cross3(n, e1);
    const to2 = (p: Vec3): Vec2 => { const q = ontoPlane(p, {n, d}); return [dot3(q, e1), dot3(q, e2)]; };
    const ccw = (poly: Convex): Convex => (area2(poly) < 0 ? [...poly].reverse() : poly);

    // Each identity on the plane with its raw triangles, strongest first.
    const byIdentity = new Map<string, {tag: FaceTag; tris: Convex[]}>();
    for (const g of peersOf(f)) {
      const k = identityKey(table[g], planes[f], clusters);
      let entry = byIdentity.get(k);
      if (!entry) { entry = {tag: table[g], tris: []}; byIdentity.set(k, entry); }
      for (const r of raw[g]) entry.tris.push(ccw(r.map(to2)));
    }
    const identities = [...byIdentity.entries()].sort((a, b) => retagCompare(a[1].tag, b[1].tag));

    const corners = [0, 1, 2].map(j => to2(pointAt(P, T[3 * t + j])));
    const tri2 = ccw(corners);
    const where = `${u.label}: triangle ${t} (${[0, 1, 2].map(j => [0, 1, 2].map(a => P[3 * T[3 * t + j] + a].toFixed(2)).join(',')).join(' / ')})`;
    const eroded = erode(tri2, REGION_SAMPLE_INSET_CM);
    let winner: string | undefined;
    if (!eroded) {
      // Too thin to erode: read at the centroid, as the re-tag pass does.
      const c: Vec2 = [(tri2[0][0] + tri2[1][0] + tri2[2][0]) / 3, (tri2[0][1] + tri2[1][1] + tri2[2][1]) / 3];
      winner = identities.find(([, e]) => e.tris.some(r => holds(r, c, 0)))?.[0];
      if (!winner) { out.push(`${where}: its centroid lies on no raw face`); continue; }
    } else {
      const eps = AREA_EPS_PER_CM2 * Math.max(1, area2(eroded));
      const meets = (pieces: Convex[], tris: Convex[]): boolean => pieces.reduce((s, p) => s + tris.reduce((x, r) => x + overlap(p, r), 0), 0) > eps;
      const w = identities.find(([, e]) => meets([eroded], e.tris));
      if (!w) { out.push(`${where}: lies on no raw face`); continue; }
      winner = w[0];
      let left: Convex[] = [eroded];
      for (const r of w[1].tris) left = left.flatMap(p => minus(p, r));
      if (left.reduce((s, p) => s + area2(p), 0) > eps) {
        const other = identities.find(([k, e]) => k !== winner && meets(left, e.tris));
        if (other) out.push(`${where} straddles regions won by ${[winner, other[0]].sort().join(' and ')}`);
        else out.push(`${where}: part of it lies on no raw face`);
        continue;
      }
    }
    // Journal decision 272: a tuck's layer is labelled Tuck after the re-tag, keeping its storey, wall and plane; it is
    // read as the kind the re-tag gave it, the winner's.
    const tag = u.triTags[t];
    const won = byIdentity.get(winner)?.tag.kind;
    const own = identityKey(tag.kind === 'Tuck' && won ? {...tag, kind: won} : tag, planes[f], clusters);
    if (own !== winner) out.push(`${where} is tagged ${tagLabel(u.triTags[t])} in a region won by ${winner}`);
  }
  return out;
}
