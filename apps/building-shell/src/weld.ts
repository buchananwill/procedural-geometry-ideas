// The weld-and-snap primitive (spec decision 11, journal decision 51). `snapCm` is the app's only rounding: every
// coordinate that must be exact (a raw part's vertex here, a ShellVertex's identity later, journal decision 58) goes
// through it, and nothing else rounds positions by hand.
import {SHELL_TOLERANCE_CM} from './constants.ts';

/** Grid steps per centimetre. 1/1024 cm is exact in float32 for every coordinate under 16384 cm. */
export const SNAP_STEPS_PER_CM = 1024;

/** Snaps one coordinate, in centimetres, to the 1/1024 cm grid. */
export function snapCm(v: number): number {
  const s = Math.round(v * SNAP_STEPS_PER_CM) / SNAP_STEPS_PER_CM;
  return s === 0 ? 0 : s; // no -0: identical grid points compare and key identically
}

/** A triangle mesh as flat arrays: `positions` is xyz per vertex, `tris` three vertex indices per triangle. */
export interface TriSoup {
  positions: number[];
  tris: number[];
  /** One per triangle. */
  faceIDs: number[];
}

export interface WeldStats {
  /** Input vertices merged into another within tolerance. */
  welded: number;
  /** Triangles dropped because welding collapsed two of their corners together. */
  collapsed: number;
  /** Triangle edges split at a vertex lying on them (T-junctions). */
  splits: number;
  /** Largest distance any vertex moved, weld and snap together, in cm. */
  maxMoveCm: number;
}

/**
 * Welds a soup's vertices within `tol`, snaps every surviving vertex to the 1/1024 cm grid, drops triangles the weld
 * collapsed, and splits every triangle edge that has another vertex lying on it within `tol`. A vertex joins the
 * first earlier vertex within `tol` of it; the cluster keeps that first vertex's position, then snaps.
 */
export function weldAndSnap(soup: TriSoup, tol: number = SHELL_TOLERANCE_CM): {soup: TriSoup; stats: WeldStats} {
  const stats: WeldStats = {welded: 0, collapsed: 0, splits: 0, maxMoveCm: 0};
  const nIn = soup.positions.length / 3;
  const reps: number[] = []; // representative positions, unsnapped
  const remap = new Array<number>(nIn);
  const grid = new Map<string, number[]>();
  const cell = (v: number): number => Math.floor(v / tol);
  for (let i = 0; i < nIn; i++) {
    const x = soup.positions[3 * i], y = soup.positions[3 * i + 1], z = soup.positions[3 * i + 2];
    const cx = cell(x), cy = cell(y), cz = cell(z);
    let found = -1;
    for (let dx = -1; dx <= 1 && found < 0; dx++) {
      for (let dy = -1; dy <= 1 && found < 0; dy++) {
        for (let dz = -1; dz <= 1 && found < 0; dz++) {
          for (const r of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            if (Math.hypot(reps[3 * r] - x, reps[3 * r + 1] - y, reps[3 * r + 2] - z) <= tol) { found = r; break; }
          }
        }
      }
    }
    if (found < 0) {
      found = reps.length / 3;
      reps.push(x, y, z);
      const k = `${cx},${cy},${cz}`;
      const bucket = grid.get(k);
      if (bucket) bucket.push(found); else grid.set(k, [found]);
    } else {
      stats.welded++;
    }
    remap[i] = found;
  }
  const positions = reps.map(snapCm);
  for (let i = 0; i < nIn; i++) {
    const r = remap[i];
    stats.maxMoveCm = Math.max(stats.maxMoveCm, Math.hypot(
      positions[3 * r] - soup.positions[3 * i], positions[3 * r + 1] - soup.positions[3 * i + 1], positions[3 * r + 2] - soup.positions[3 * i + 2]));
  }

  // Remap, dropping collapsed triangles.
  const work: [number, number, number, number][] = [];
  for (let t = 0; t < soup.tris.length / 3; t++) {
    const a = remap[soup.tris[3 * t]], b = remap[soup.tris[3 * t + 1]], c = remap[soup.tris[3 * t + 2]];
    if (a === b || b === c || c === a) { stats.collapsed++; continue; }
    work.push([a, b, c, soup.faceIDs[t]]);
  }

  // Split every edge at any vertex lying on it, until no edge holds one.
  const nV = positions.length / 3;
  const p = (i: number): [number, number, number] => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
  const onEdge = (a: number, b: number): number => {
    const A = p(a), B = p(b);
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const L = Math.sqrt(L2);
    let best = -1, bestT = Infinity;
    for (let v = 0; v < nV; v++) {
      if (v === a || v === b) continue;
      const V = p(v);
      const av = [V[0] - A[0], V[1] - A[1], V[2] - A[2]];
      const t = (av[0] * ab[0] + av[1] * ab[1] + av[2] * ab[2]) / L2;
      if (t * L <= tol || (1 - t) * L <= tol) continue;
      const off = Math.hypot(av[0] - t * ab[0], av[1] - t * ab[1], av[2] - t * ab[2]);
      if (off <= tol && t < bestT) { best = v; bestT = t; }
    }
    return best;
  };
  const out: number[] = [];
  const faceIDs: number[] = [];
  while (work.length) {
    const [a, b, c, f] = work.pop()!;
    const edges: [number, number, number][] = [[a, b, c], [b, c, a], [c, a, b]];
    let split = false;
    for (const [u, v, w] of edges) {
      const m = onEdge(u, v);
      if (m < 0) continue;
      work.push([u, m, w, f], [m, v, w, f]);
      stats.splits++;
      split = true;
      break;
    }
    if (!split) { out.push(a, b, c); faceIDs.push(f); }
  }
  return {soup: {positions, tris: out, faceIDs}, stats};
}

/** Twice the area vector of triangle `t`, in double precision. */
export function triCross(s: TriSoup, t: number): [number, number, number] {
  const i = 3 * s.tris[3 * t], j = 3 * s.tris[3 * t + 1], k = 3 * s.tris[3 * t + 2];
  const P = s.positions;
  const ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2];
  const vx = P[k] - P[i], vy = P[k + 1] - P[i + 1], vz = P[k + 2] - P[i + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}
