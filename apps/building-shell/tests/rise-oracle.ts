// Gable rise decision 19: a rise's height function, sampled against the built shell, and the covered-storeys
// precondition a rise must keep (journal F68). Measured as the WP-G1 sweep measured them
// (experiments/gable-rises/rise.ts), on the production plans.
import type {Piece} from '../src/roof/algoB.ts';
import {Building, Pt, dot, planeAt, sub} from '../src/roof/model.ts';
import {evalFaces} from '../src/roof/surface.ts';
import {StoreyPlan, storeyPieces} from '../src/storey.ts';
import type {ShellUnion} from '../src/union.ts';

/** How far the storey's bounding box reaches from a wall's line inward (`storey.ts`'s `bboxReach`). */
function reachOf(b: Building, piece: Piece): number {
  const w = piece.wall;
  const box = w.n.y > 0.5 ? b.bbox.y1 - w.a.y : w.n.y < -0.5 ? w.a.y - b.bbox.y0 : w.n.x > 0.5 ? b.bbox.x1 - w.a.x : w.a.x - b.bbox.x0;
  return Math.min(piece.farDist, box);
}

const alongX = (piece: Piece): boolean => Math.abs(piece.wall.dir.x) > 0.5;
const atAlong = (piece: Piece, s: number, d: number): Pt => {
  const w = piece.wall;
  return alongX(piece) ? {x: s, y: w.a.y + w.n.y * d} : {x: w.a.x + w.n.x * d, y: s};
};

/** A piece's height at `p` above the plate, as `gablePiece` builds it: the lowest of its planes, over its band and reach. */
function pieceHeight(b: Building, piece: Piece, p: Pt): number | null {
  const d = dot(sub(p, piece.wall.a), piece.wall.n);
  if (d < 0 || d > reachOf(b, piece)) return null;
  const s = alongX(piece) ? p.x : p.y;
  if (s < piece.bandLo || s > piece.bandHi) return null;
  const h = Math.min(...piece.planes.map(id => planeAt(b.planes[id], p)));
  return h >= 0 ? h : null;
}

/** Decision 19: the storey's roof top at `p` above its plate, the hip surface raised by every piece, its rises' too. */
export function oracleHeight(plan: StoreyPlan, p: Pt): number | null {
  const b = plan.building;
  if (!b.inside(p)) return null;
  let best = evalFaces(plan.roof.defaults, p)?.h ?? null;
  for (const piece of storeyPieces(plan)) {
    const h = pieceHeight(b, piece, p);
    if (h !== null && (best === null || h > best)) best = h;
  }
  return best;
}

/** The top of the solid interval of the mesh holding height `z0` over `(x, y)`, or null where `z0` is outside it. */
export function intervalTop(u: ShellUnion, x: number, y: number, z0: number): number | null {
  const P = u.mesh.positions, T = u.mesh.tris;
  const zs: {z: number; up: boolean}[] = [];
  for (let t = 0; t < T.length / 3; t++) {
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
    const ax = P[3 * a], ay = P[3 * a + 1], bx = P[3 * b], by = P[3 * b + 1], cx = P[3 * c], cy = P[3 * c + 1];
    if (Math.max(ax, bx, cx) < x || Math.min(ax, bx, cx) > x || Math.max(ay, by, cy) < y || Math.min(ay, by, cy) > y) continue;
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
    const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    zs.push({z: l1 * P[3 * a + 2] + l2 * P[3 * b + 2] + l3 * P[3 * c + 2], up: d > 0});
  }
  const next = zs.sort((p, q) => p.z - q.z).find(c => c.z > z0);
  return next && next.up ? next.z : null;
}

/** The worst disagreement found, where, and over how many samples. */
export interface OracleMeasure { worst: number; at: string; samples: number }

/**
 * Decision 19's test: every rise's band, to its far reach, on a 10 cm grid offset off the lattice, the mesh's top
 * against the oracle. A point under a higher storey whose floor the oracle reaches is skipped: the solid runs on up.
 */
export function riseOracle(u: ShellUnion): OracleMeasure {
  const out: OracleMeasure = {worst: 0, at: '', samples: 0};
  for (const plan of u.plans) {
    for (const {piece} of plan.rises ?? []) {
      const reach = reachOf(plan.building, piece);
      for (let s = piece.bandLo + 0.37; s < piece.bandHi; s += 10) {
        for (let d = 0.41; d < reach; d += 10) {
          const p = atAlong(piece, s, d);
          const e = oracleHeight(plan, p);
          if (e === null || e < 1) continue;
          if (u.plans.some(q => q.storey > plan.storey && q.floor <= plan.plate + e + 0.05 && q.building.inside(p))) continue;
          const top = intervalTop(u, p.x, p.y, plan.plate + 0.5);
          const dev = top === null ? Infinity : Math.abs(top - plan.plate - e);
          out.samples++;
          if (dev > out.worst) { out.worst = dev; out.at = `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}) on storey ${plan.storey}: mesh ${top === null ? 'none' : (top - plan.plate).toFixed(3)}, oracle ${e.toFixed(3)}`; }
        }
      }
    }
  }
  return out;
}

/**
 * Journal F68: how far a rise's storey stands above the top of any higher storey whose plan holds the point, on a 2 cm
 * grid over every rise's band to its far reach. A lower roof must stay beneath the top of the storey over it.
 */
export function riseBreakthrough(u: ShellUnion): number {
  let worst = 0;
  for (const plan of u.plans) {
    const uppers = u.plans.filter(q => q.storey > plan.storey);
    for (const {piece} of plan.rises ?? []) {
      const reach = reachOf(plan.building, piece);
      for (let s = piece.bandLo + 0.13; s < piece.bandHi; s += 2) {
        for (let d = 0.17; d < reach; d += 2) {
          const p = atAlong(piece, s, d);
          const e = oracleHeight(plan, p);
          if (e === null) continue;
          for (const q of uppers) if (q.building.inside(p)) worst = Math.max(worst, plan.plate + e - (q.plate + (oracleHeight(q, p) ?? 0)));
        }
      }
    }
  }
  return worst;
}
