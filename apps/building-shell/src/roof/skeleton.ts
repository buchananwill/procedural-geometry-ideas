// The only place the upstream straight skeleton is touched: @proc-geo/core at f7b6091, imported from source, read-only.
import {
  solveSkeleton, computeStrips, computeMaxOffset, maxWeightRatio, setSkeletonLogLevel, SKELETON_NOISE_FLOOR,
} from '@proc-geo/core';
import {Comp, Pt, Wall, cross, dist, dot, polyArea, sub} from './model.ts';

setSkeletonLogLevel('silent');

export const UPSTREAM_MAX_RATIO: number = maxWeightRatio(SKELETON_NOISE_FLOOR);

export interface RawFace { wall: Wall; poly: Pt[] }
export interface SolveOk {
  ok: true;
  faces: RawFace[];
  diagnostics: string[];
  causality: number;
  causalityDetail: string[];
  tilingError: number; // |sum of face areas - ring area| / ring area
}
export interface SolveRefused { ok: false; kind: 'door-ratio' | 'door-turn' | 'door-other' | 'incomplete' | 'threw' | 'unmapped'; message: string }
export type SolveResult = SolveOk | SolveRefused;

function classify(msg: string): SolveRefused['kind'] {
  if (msg.includes('minWeightTurnSine') || msg.includes('visible corner')) return 'door-turn';
  if (msg.includes('ratio') || msg.includes('maxWeightRatio')) return 'door-ratio';
  if (msg.includes('eight')) return 'door-other';
  return 'threw';
}

export function solveFaces(comp: Comp, weights: number[]): SolveResult {
  let result;
  try {
    result = solveSkeleton(comp.ring, {weights});
  } catch (e) {
    const message = (e as Error).message;
    return {ok: false, kind: classify(message), message};
  }
  const diagnostics: string[] = result.diagnostics.filter((d: {kind: string}) => d.kind !== 'winding-normalised').map((d: {kind: string; detail: string}) => `${d.kind}: ${d.detail}`);
  const causalityDetail = result.diagnostics.filter((d: {kind: string}) => d.kind === 'causality-violation').map((d: {detail: string}) => d.detail);
  if (!result.complete) return {ok: false, kind: 'incomplete', message: diagnostics.join(' | ').slice(0, 400)};
  let strips;
  try {
    strips = computeStrips(result, {depth: computeMaxOffset(result)});
  } catch (e) {
    return {ok: false, kind: 'threw', message: `computeStrips: ${(e as Error).message}`};
  }
  const faces: RawFace[] = [];
  let area = 0;
  for (const s of strips) {
    if (s.boundary.length < 3) continue;
    const poly: Pt[] = s.boundary.map((p: Pt) => ({x: p.x, y: p.y}));
    const f = s.frontage;
    const mid = {x: (f[0].x + f[f.length - 1].x) / 2, y: (f[0].y + f[f.length - 1].y) / 2};
    const centroid = poly.reduce((acc, p) => ({x: acc.x + p.x / poly.length, y: acc.y + p.y / poly.length}), {x: 0, y: 0});
    const wall = comp.walls.find(w => {
      const along = dot(sub(mid, w.a), w.dir);
      const off = Math.abs(cross(w.dir, sub(mid, w.a)));
      return off < 1e-3 && along >= -1e-3 && along <= w.len + 1e-3 && dot(sub(centroid, w.a), w.n) > -1e-9;
    });
    if (!wall) return {ok: false, kind: 'unmapped', message: `strip with frontage midpoint (${mid.x},${mid.y}) maps to no wall`};
    faces.push({wall, poly});
    area += Math.abs(polyArea(poly));
  }
  const ringArea = Math.abs(polyArea(comp.ring));
  return {ok: true, faces, diagnostics, causality: causalityDetail.length, causalityDetail, tilingError: Math.abs(area - ringArea) / ringArea};
}

/** Nodes clustered by position, so faces can name a shared node. */
export interface NodeSet { pos: Pt[]; find(p: Pt): number }
export function makeNodeSet(seed: Pt[], tol: number): NodeSet {
  const pos: Pt[] = [...seed];
  return {
    pos,
    find(p: Pt): number {
      for (let i = 0; i < pos.length; i++) if (dist(pos[i], p) <= tol) return i;
      pos.push(p);
      return pos.length - 1;
    },
  };
}
