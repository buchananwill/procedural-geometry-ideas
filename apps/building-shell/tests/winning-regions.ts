// Spec decision 15 as amended (journal decision 111, F41): after the imprint, every output triangle lies wholly within
// one winning region, and its tag is that region's winner. Checked against the raw faces directly, independently of
// `regions.ts`, at each triangle's corners, edge midpoints and centroid, so it can be wired into any sweep.
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {FaceTag, Vec3, identityKey, retagCompare, samePlane, tagLabel} from '../src/tags.ts';
import {RawTri, ShellUnion, prepareRawTri, rawTriHolds} from '../src/union.ts';
import {cross3, dot3, sub3, unit3} from '../src/vec3.ts';

/**
 * How far inside every side of its triangle each sample point is read, in cm. A corner or edge midpoint lies on the
 * triangle's boundary, which may be a region boundary, so it is moved towards the centroid until it lies this far
 * inside all three sides (or reaches the centroid, in a triangle too thin for it). Half the shell's tolerance: beyond
 * the re-tag slack plus the 1.6e-3 cm a cleaned vertex may have moved (journal decision 110), so the point is held
 * only by the faces on the triangle's side.
 */
export const REGION_SAMPLE_INSET_CM = SHELL_TOLERANCE_CM / 2;

/** What the region invariant reads of a union. */
export type RegionSource = Pick<ShellUnion, 'label' | 'mesh' | 'triTags' | 'tags' | 'parts'>;

/**
 * Every output triangle that does not lie wholly within one winning region, or whose tag is not its region's winner,
 * as text; empty when the union passes. A sample point is won by the strongest identity (decision 14) among the raw
 * triangles on the triangle's oriented plane that hold it; one no raw face holds is itself a violation. Internal
 * triangles take no part (decision 14).
 */
export function winningRegionViolations(u: RegionSource): string[] {
  const {table, planes, clusters} = u.tags;
  const raw: RawTri[][] = table.map(() => []);
  for (const part of u.parts) {
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
  const winnerAt = (f: number, q: Vec3): FaceTag | null => {
    const held = peersOf(f).filter(g => raw[g].some(r => rawTriHolds(r, q))).map(g => table[g]);
    return held.sort(retagCompare)[0] ?? null;
  };

  const out: string[] = [];
  const P = u.mesh.positions, T = u.mesh.tris;
  for (let t = 0; t < T.length / 3; t++) {
    const f = u.mesh.faceIDs[t];
    if (table[f].kind === 'Internal') continue;
    const {n, d} = planes[f];
    // The corners, projected onto the triangle's plane: an output vertex can lie 1.6e-3 cm off it (journal decision
    // 110), beyond the containment slack, which bounds the in-plane test only.
    const vs = [0, 1, 2].map((j): Vec3 => {
      const p: Vec3 = [P[3 * T[3 * t + j]], P[3 * T[3 * t + j] + 1], P[3 * T[3 * t + j] + 2]];
      const off = dot3(n, p) - d;
      return [p[0] - off * n[0], p[1] - off * n[1], p[2] - off * n[2]];
    });
    const c: Vec3 = [(vs[0][0] + vs[1][0] + vs[2][0]) / 3, (vs[0][1] + vs[1][1] + vs[2][1]) / 3, (vs[0][2] + vs[1][2] + vs[2][2]) / 3];
    const mid = (p: Vec3, q: Vec3): Vec3 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    // Per side: its inward unit normal in the plane, and a point on it.
    const sides = [0, 1, 2].map(k => ({o: vs[k], w: unit3(cross3(n, sub3(vs[(k + 1) % 3], vs[k])))}));
    const inset = (x: Vec3): number[] => sides.map(s => dot3(s.w, sub3(x, s.o)));
    const ic = inset(c);
    /** `p` moved towards the centroid until it lies `REGION_SAMPLE_INSET_CM` inside every side, or to the centroid. */
    const pull = (p: Vec3): Vec3 => {
      const ip = inset(p);
      let s = 0;
      for (let k = 0; k < 3; k++) {
        if (ip[k] >= REGION_SAMPLE_INSET_CM) continue;
        s = ic[k] > ip[k] ? Math.max(s, (REGION_SAMPLE_INSET_CM - ip[k]) / (ic[k] - ip[k])) : 1;
      }
      s = Math.min(1, s);
      return [p[0] + s * (c[0] - p[0]), p[1] + s * (c[1] - p[1]), p[2] + s * (c[2] - p[2])];
    };
    const samples = [...vs, mid(vs[0], vs[1]), mid(vs[1], vs[2]), mid(vs[2], vs[0])].map(pull);
    samples.push(c);
    const keys = new Set<string>();
    let unheld = 0;
    for (const q of samples) {
      const w = winnerAt(f, q);
      if (w) keys.add(identityKey(w, planes[f], clusters)); else unheld++;
    }
    const where = `${u.label}: triangle ${t} (${vs.map(p => p.map(x => x.toFixed(2)).join(',')).join(' / ')})`;
    if (unheld) out.push(`${where}: ${unheld} of its sample points lie on no raw face`);
    if (keys.size > 1) out.push(`${where} straddles regions won by ${[...keys].sort().join(' and ')}`);
    const own = identityKey(u.triTags[t], planes[f], clusters);
    if (keys.size === 1 && !keys.has(own)) out.push(`${where} is tagged ${tagLabel(u.triTags[t])} in a region won by ${[...keys][0]}`);
  }
  return out;
}
