// The only place the upstream straight skeleton is touched: @proc-geo/core at f7b6091, imported from source, read-only.
// Holed roof decisions 9 to 17: an island is solved as its outline and its holes, each wall at its own pitch, and a
// refused island comes back as a refusal with its cause in the user's terms, never as a roof.
import {
  solveSkeleton, computeStrips, computeMaxOffset, maxWeightRatio, setSkeletonLogLevel, SKELETON_NOISE_FLOOR,
} from '@proc-geo/core';
import type {SkeletonSolveResult, Strip} from '@proc-geo/core';
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
  tilingError: number; // |sum of face areas - footprint area| / footprint area
}
export type RefusalKind = 'door-ratio' | 'door-turn' | 'door-other' | 'door-loops' | 'incomplete' | 'threw' | 'unmapped' | 'strip-missing';
/** A refused island: the kind of refusal, the solver's own message, and the cause in the user's terms (decision 16). */
export interface SolveRefused { ok: false; kind: RefusalKind; message: string; cause: string }
export type SolveResult = SolveOk | SolveRefused;

/** Holed roof decision 16: each refusal's cause in the user's terms, by the skeleton's diagnostic kind or the refusal's. */
export const HOLED_CAUSES: Readonly<Record<string, string>> = {
  'simultaneous-across-rings': 'three wall fronts meet at one point at one moment, which the roof solver refuses',
  'multi-ring-step-refused': 'walls in line, facing the same way, leave a sliver the roof solver cannot place',
  'step-failure': 'a step of the roof solver failed, as it can where walls lie in line',
  'unresolved-edges': 'the roof solver left a hip or valley unfinished',
  'holed-topology-violation': "the roof solver's own check found its answer wrong",
  'holed-equal-time-violation': "the roof solver's own check found its answer wrong",
  'holed-time-order-violation': "the roof solver's own check found its answer wrong",
  'holed-planarity-violation': "the roof solver's own check found its answer wrong",
  'causality-violation': 'the roof solver found a hip or valley running backwards, as it can with mixed pitches',
  'door-loops': "two of the island's loops touch or cross, which the roof solver does not take yet",
};

/**
 * The causes of the refusals `HOLED_CAUSES` does not name: the solver's input doors, its throws and this file's own
 * checks of its strips (an interpretation of decision 16, which names the skeleton's kinds only).
 */
const OTHER_CAUSES: Readonly<Record<Exclude<RefusalKind, 'incomplete' | 'door-loops'>, string>> = {
  'door-ratio': "its walls' pitches differ by more than the roof solver takes",
  // The solver refuses a weight change at a vertex whose turn is below `minWeightTurnSine`: two walls in line, or so
  // nearly in line that no corner shows between them (BSA.D326 rewords what named a corner).
  'door-turn': 'two walls in line, or so nearly in line that no corner shows between them, differ in pitch, which the roof solver refuses: a pitch may change only at a visible corner',
  'door-other': 'the roof solver refused its input',
  'threw': 'the roof solver failed',
  'unmapped': "a roof face lies on none of the island's walls",
  'strip-missing': 'a wall has no roof face, or more than one',
};

/** The diagnostics that never refuse an island (decision 55: the un-culled self-loop among them). */
const INFORMATIONAL = new Set(['winding-normalised', 'vertices-canonicalised', 'self-intersecting', 'coaxial-completion', 'holed-unculled-self-loop']);

/** How much of one diagnostic's detail a cause carries. */
const CAUSE_DETAIL_CHARS = 240;

function classify(msg: string): Exclude<RefusalKind, 'incomplete'> {
  // Decision 15: contact between loops is tested first.
  if (msg.includes('Loop conflict (')) return 'door-loops';
  if (msg.includes('minWeightTurnSine') || msg.includes('visible corner')) return 'door-turn';
  if (msg.includes('ratio') || msg.includes('maxWeightRatio')) return 'door-ratio';
  if (msg.includes('eight')) return 'door-other';
  return 'threw';
}

const refused = (kind: Exclude<RefusalKind, 'incomplete'>, message: string): SolveRefused =>
  ({ok: false, kind, message, cause: kind === 'door-loops' ? HOLED_CAUSES['door-loops'] : OTHER_CAUSES[kind]});

/**
 * Decision 13: an `'incomplete'` refusal's cause lists every blocking diagnostic, each by `HOLED_CAUSES` (its kind
 * verbatim where the table does not name it, so no future kind is dropped) and then by its own kind and detail.
 */
function incompleteCause(blocking: readonly {kind: string; detail: string}[]): string {
  if (!blocking.length) return 'the roof solver gave no complete answer, and named no cause';
  return blocking.map(d => `${HOLED_CAUSES[d.kind] ?? d.kind} (${d.kind}: ${d.detail.slice(0, CAUSE_DETAIL_CHARS)})`).join('; ');
}

/** Holed roof decision 12: the footprint's area, the outer loop's less its holes'. */
export const footprintArea = (comp: Comp): number =>
  Math.abs(polyArea(comp.outer)) - comp.holes.reduce((s, h) => s + Math.abs(polyArea(h)), 0);

/**
 * Holed roof decision 9: `weights[k]` is `1 / tan` of loop `k`'s walls in edge order, loop 0 the outer loop and loop
 * `k` hole `k - 1`. With no hole this is today's single-loop call.
 */
export function solveFaces(comp: Comp, weights: number[][]): SolveResult {
  let result: SkeletonSolveResult;
  try {
    result = comp.holes.length
      ? solveSkeleton(comp.outer, {weights: weights[0], holes: comp.holes.map((h, k) => ({vertices: h, weights: weights[k + 1]}))})
      : solveSkeleton(comp.outer, {weights: weights[0]});
  } catch (e) {
    const message = (e as Error).message;
    return refused(classify(message), message);
  }
  return facesOfSolve(comp, result);
}

/**
 * The faces of a solve, or its refusal (decisions 10 to 14): a complete result is read strip by strip; an incomplete
 * one, or on an island with a hole one carrying a causality violation, is refused. Exported so a test can hand it a
 * constructed result.
 */
export function facesOfSolve(comp: Comp, result: SkeletonSolveResult): SolveResult {
  const holed = comp.holes.length > 0;
  const diagnostics: string[] = result.diagnostics.filter(d => d.kind !== 'winding-normalised').map(d => `${d.kind}: ${d.detail}`);
  const causalityDetail = result.diagnostics.filter(d => d.kind === 'causality-violation').map(d => d.detail);
  // Decision 14: on an island with a hole a causality violation refuses; a single-loop island counts it and goes on.
  if (!result.complete || (holed && causalityDetail.length)) {
    const blocking = result.diagnostics.filter(d => !INFORMATIONAL.has(d.kind) && (holed || d.kind !== 'causality-violation'));
    return {ok: false, kind: 'incomplete', message: diagnostics.join(' | ').slice(0, 400), cause: incompleteCause(blocking)};
  }
  let strips: Strip[];
  try {
    strips = computeStrips(result, {depth: computeMaxOffset(result)});
  } catch (e) {
    return refused('threw', `computeStrips: ${(e as Error).message}`);
  }
  return facesOfStrips(comp, result, strips, causalityDetail, diagnostics);
}

/**
 * Decisions 10 to 12: one face per strip, in strip order. A strip's wall is the first wall of `comp.walls` whose own
 * loop's map carries it on the strip's supporting edge and whose span holds the frontage midpoint, the midpoint keeping
 * today's choice among the collinear walls canonicalisation merges. No strip is ever skipped (decision 11): a strip of
 * fewer than three points, an edge with no strip or two, and a strip count other than the solved edge count are each the
 * `'strip-missing'` refusal. Exported so a test can hand it constructed strips.
 */
export function facesOfStrips(comp: Comp, result: SkeletonSolveResult, strips: readonly Strip[], causalityDetail: string[] = [], diagnostics: string[] = []): SolveResult {
  const maps = result.loopMaps;
  if (!maps || maps.length !== 1 + comp.holes.length) {
    return refused('unmapped', `the solve maps ${maps ? maps.length : 'no'} loops for ${1 + comp.holes.length}`);
  }
  const solvedEdges = result.graph.numExteriorNodes;
  if (strips.length !== solvedEdges) return refused('strip-missing', `${strips.length} strips for ${solvedEdges} solved edges`);
  const seen: number[] = Array(solvedEdges).fill(0);
  for (const s of strips) for (const e of s.supportingEdgeIds) seen[e] = (seen[e] ?? 0) + 1;
  const off = seen.findIndex(n => n !== 1);
  if (off >= 0) return refused('strip-missing', `solved edge ${off} has ${seen[off]} strips`);
  const faces: RawFace[] = [];
  let area = 0;
  for (const s of strips) {
    const edge = s.supportingEdgeIds.join(', ');
    if (s.boundary.length < 3) return refused('strip-missing', `the strip of solved edge ${edge} has ${s.boundary.length} boundary points`);
    const poly: Pt[] = s.boundary.map(p => ({x: p.x, y: p.y}));
    const f = s.frontage;
    const mid = {x: (f[0].x + f[f.length - 1].x) / 2, y: (f[0].y + f[f.length - 1].y) / 2};
    const wall = comp.walls.find(w => {
      if (!s.supportingEdgeIds.includes(maps[w.loop].edgeToEdge[w.edge])) return false;
      const along = dot(sub(mid, w.a), w.dir);
      return Math.abs(cross(w.dir, sub(mid, w.a))) < 1e-3 && along >= -1e-3 && along <= w.len + 1e-3;
    });
    if (!wall) return refused('unmapped', `strip of solved edge ${edge} with frontage midpoint (${mid.x},${mid.y}) maps to no wall`);
    faces.push({wall, poly});
    area += Math.abs(polyArea(poly));
  }
  const footprint = footprintArea(comp);
  return {ok: true, faces, diagnostics, causality: causalityDetail.length, causalityDetail, tilingError: Math.abs(area - footprint) / footprint};
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
