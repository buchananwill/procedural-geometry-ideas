// The weld-and-snap primitive (spec decision 11, journal decision 51). `snapCm` is the app's only rounding: every
// coordinate that must be exact (a raw part's vertex here, a ShellVertex's identity later, journal decision 58) goes
// through it, and nothing else rounds positions by hand.
import {SHELL_TOLERANCE_CM} from './constants.ts';
import type {Vec3} from './tags.ts';

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

/** One triangle's three vertex indices, in winding order. */
export type TriIndices = [a: number, b: number, c: number];

/** A triangle awaiting the edge split: its corners and its faceID. */
export type WorkTri = [a: number, b: number, c: number, faceID: number];

export interface WeldStats {
  /** Input vertices merged into another within tolerance. */
  welded: number;
  /** Triangles dropped because welding collapsed two of their corners together. */
  collapsed: number;
  /** Triangles dropped because their own third vertex lies on their opposite edge (zero-height slivers). */
  slivers: number;
  /** Triangle edges split at a vertex lying on them (T-junctions). */
  splits: number;
  /** Largest distance any vertex moved, weld and snap together, in cm. */
  maxMoveCm: number;
}

export interface WeldResult { soup: TriSoup; stats: WeldStats }

const vertexAt = (positions: number[], i: number): Vec3 => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];

/** Whether vertex `v` lies on segment `ab` within `tol`, further than `tol` from either end. */
function liesOn(positions: number[], v: number, a: number, b: number, tol: number): boolean {
  return edgeParam(positions, v, a, b, tol) !== null;
}

/** Where vertex `v` lies along segment `ab` (0 to 1), if it lies on it within `tol` and clear of both ends. */
function edgeParam(positions: number[], v: number, a: number, b: number, tol: number): number | null {
  const A = vertexAt(positions, a), B = vertexAt(positions, b), V = vertexAt(positions, v);
  const ab: Vec3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const L = Math.sqrt(L2);
  const av: Vec3 = [V[0] - A[0], V[1] - A[1], V[2] - A[2]];
  const t = (av[0] * ab[0] + av[1] * ab[1] + av[2] * ab[2]) / L2;
  if (t * L <= tol || (1 - t) * L <= tol) return null;
  const off = Math.hypot(av[0] - t * ab[0], av[1] - t * ab[1], av[2] - t * ab[2]);
  return off <= tol ? t : null;
}

/**
 * Welds a soup's vertices within `tol`, snaps every surviving vertex to the 1/1024 cm grid, drops triangles the weld
 * collapsed, and splits every triangle edge that has another vertex lying on it within `tol`. A vertex joins the
 * first earlier vertex within `tol` of it; the cluster keeps that first vertex's position, then snaps. A triangle
 * whose own third vertex lies on its opposite edge has no height: it is dropped, never split.
 */
export function weldAndSnap(soup: TriSoup, tol: number = SHELL_TOLERANCE_CM): WeldResult {
  const stats: WeldStats = {welded: 0, collapsed: 0, slivers: 0, splits: 0, maxMoveCm: 0};
  const nIn = soup.positions.length / 3;
  const reps: number[] = []; // representative positions, unsnapped
  const remap = new Array<number>(nIn);
  const grid = new Map<string, number[]>();
  const cell = (v: number): number => Math.floor(v / tol);
  for (let i = 0; i < nIn; i++) {
    const [x, y, z] = vertexAt(soup.positions, i);
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
  const work: WorkTri[] = [];
  for (let t = 0; t < soup.tris.length / 3; t++) {
    const a = remap[soup.tris[3 * t]], b = remap[soup.tris[3 * t + 1]], c = remap[soup.tris[3 * t + 2]];
    if (a === b || b === c || c === a) { stats.collapsed++; continue; }
    work.push([a, b, c, soup.faceIDs[t]]);
  }

  // Split every edge at any vertex lying on it, until no edge holds one.
  const nV = positions.length / 3;
  /** The vertex nearest `a` lying on edge `ab`, or -1. */
  const onEdge = (a: number, b: number): number => {
    let best = -1, bestT = Infinity;
    for (let v = 0; v < nV; v++) {
      if (v === a || v === b) continue;
      const t = edgeParam(positions, v, a, b, tol);
      if (t !== null && t < bestT) { best = v; bestT = t; }
    }
    return best;
  };
  const out: number[] = [];
  const faceIDs: number[] = [];
  while (work.length) {
    const tri = work.pop();
    if (!tri) break;
    const [a, b, c, f] = tri;
    const edges: TriIndices[] = [[a, b, c], [b, c, a], [c, a, b]];
    if (edges.some(([u, v, w]) => liesOn(positions, w, u, v, tol))) { stats.slivers++; continue; }
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
export function triCross(s: TriSoup, t: number): Vec3 {
  const i = 3 * s.tris[3 * t], j = 3 * s.tris[3 * t + 1], k = 3 * s.tris[3 * t + 2];
  const P = s.positions;
  const ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2];
  const vx = P[k] - P[i], vy = P[k + 1] - P[i + 1], vz = P[k + 2] - P[i + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}
