// The only place the upstream straight skeleton is touched: @proc-geo/core, aliased to its source, read-only.
// Holed roof decisions 9 to 17: an island is solved as its outline and its holes, each wall at its own pitch, and a
// refused island comes back as a refusal with its cause in the user's terms, never as a roof.
import {
  solveSkeleton, computeStrips, computeMaxOffset, setSkeletonLogLevel,
  INFORMATIONAL_DIAGNOSTIC_KINDS, SkeletonInputRefusal,
} from '@proc-geo/core';
import type {SkeletonDiagnosticKind, SkeletonInputRefusalKind, SkeletonSolveResult, SolveSkeletonOptions, Strip} from '@proc-geo/core';
import {Comp, Pt, Wall, compLoops, cross, dot, loopWalls, polyArea, sub} from './model.ts';

setSkeletonLogLevel('silent');

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

/** The cause the four checks of the holed guard share: the solver distrusts its own answer. */
const SOLVER_CHECK_FAILED = "the roof solver's own check found its answer wrong";

/**
 * Holed roof decisions 13 and 16: an `'incomplete'` refusal's cause in the user's terms, by the skeleton's diagnostic
 * kind. A kind not named here is shown verbatim (decision 13), so no future kind is dropped.
 */
const DIAGNOSTIC_CAUSES:Readonly<Partial<Record<SkeletonDiagnosticKind, string>>> = {
  'simultaneous-across-rings': 'walls of the outline and the courtyards close on one point at one moment from more sides than the roof solver can pair',
  'multi-ring-step-refused': 'walls close on a sliver the roof solver cannot read as a finished ridge or place',
  'step-failure': 'a step of the roof solver failed, as it can where walls lie in line',
  'unresolved-edges': 'the roof solver left a hip or valley unfinished',
  'holed-topology-violation': SOLVER_CHECK_FAILED,
  'holed-equal-time-violation': SOLVER_CHECK_FAILED,
  'holed-time-order-violation': SOLVER_CHECK_FAILED,
  'holed-planarity-violation': SOLVER_CHECK_FAILED,
  'causality-violation': 'the roof solver found a hip or valley running backwards, as it can with mixed pitches',
};

/**
 * The cause of every other refusal, by this file's refusal kind: the solver's input doors (decision 15's loops door
 * among them), its throws and this file's own checks of its strips (an interpretation of decision 16, which names the
 * skeleton's kinds only).
 */
const REFUSAL_CAUSES:Readonly<Record<Exclude<RefusalKind, 'incomplete'>, string>> = {
  'door-loops': "two of the island's loops touch or cross, which the roof solver does not take yet",
  'door-ratio': "its walls' pitches differ by more than the roof solver takes",
  // The solver refuses a weight change at a vertex whose turn is below `minWeightTurnSine`: two walls in line, or so
  // nearly in line that no corner shows between them (the wording is BSA.D326's).
  'door-turn': 'two walls in line, or so nearly in line that no corner shows between them, differ in pitch, which the roof solver refuses: a pitch may change only at a visible corner',
  'door-other': 'the roof solver refused its input',
  'threw': 'the roof solver failed',
  'unmapped': "a roof face lies on none of the island's walls",
  'strip-missing': 'a wall has no roof face, or more than one',
};

/**
 * Holed roof decision 16's table, as its spec names it: the causes by the skeleton's diagnostic kind, and the loops
 * door's. Read by the viewer and the tests with a diagnostic kind.
 */
export const HOLED_CAUSES: Readonly<Record<string, string>> = {...DIAGNOSTIC_CAUSES, 'door-loops': REFUSAL_CAUSES['door-loops']};

/**
 * THE ONE KIND THE ROOF READS DIFFERENTLY FROM CORE. Core counts a causality violation informational; on an island
 * with a hole the roof refuses it (decision 14), so it is not among the roof's informational kinds.
 */
const REFUSED_BY_THE_ROOF: SkeletonDiagnosticKind = 'causality-violation';

/**
 * The diagnostics that never refuse an island: core's informational kinds less {@link REFUSED_BY_THE_ROOF} (decision
 * 55: the un-culled self-loop among them).
 */
const INFORMATIONAL: ReadonlySet<SkeletonDiagnosticKind> =
  new Set(INFORMATIONAL_DIAGNOSTIC_KINDS.filter(kind => kind !== REFUSED_BY_THE_ROOF));

/** How much of one diagnostic's detail a cause carries. */
const CAUSE_DETAIL_CHARS = 240;

/**
 * Each input refusal of the solver as this file's refusal kind (decision 15: the loops door is its own). A count, a
 * non-finite vertex or a winding the roof never gives is a failure of the roof's own input to the solver.
 */
const REFUSAL_KIND_OF_INPUT: Readonly<Record<SkeletonInputRefusalKind, Exclude<RefusalKind, 'incomplete'>>> = {
  'loop-conflict': 'door-loops',
  'weight-change-without-corner': 'door-turn',
  'weight-ratio': 'door-ratio',
  'weight-count': 'door-other',
  'weight-not-finite-positive': 'door-other',
  'too-few-vertices': 'threw',
  'non-finite-vertex': 'threw',
  'mis-wound-loop': 'threw',
  'loop-table': 'threw',
  'holes-on-legacy-entry': 'threw',
};

function classify(error: unknown): Exclude<RefusalKind, 'incomplete'> {
  return error instanceof SkeletonInputRefusal ? REFUSAL_KIND_OF_INPUT[error.kind] : 'threw';
}

const refused = (kind: Exclude<RefusalKind, 'incomplete'>, message: string): SolveRefused =>
  ({ok: false, kind, message, cause: REFUSAL_CAUSES[kind]});

/**
 * Decision 13: an `'incomplete'` refusal's cause lists every blocking diagnostic, each by `DIAGNOSTIC_CAUSES` (its kind
 * verbatim where the table does not name it, so no future kind is dropped) and then by its own kind and detail.
 */
function incompleteCause(blocking: readonly {kind: SkeletonDiagnosticKind; detail: string}[]): string {
  if (!blocking.length) return 'the roof solver gave no complete answer, and named no cause';
  return blocking.map(d => `${DIAGNOSTIC_CAUSES[d.kind] ?? d.kind} (${d.kind}: ${d.detail.slice(0, CAUSE_DETAIL_CHARS)})`).join('; ');
}

/** Holed roof decision 12: the footprint's area, the outer loop's less its holes'. */
export const footprintArea = (comp: Comp): number =>
  Math.abs(polyArea(comp.outer)) - comp.holes.reduce((s, h) => s + Math.abs(polyArea(h)), 0);

/** Holed roof decision 9: `1 / tan` of each loop's walls in edge order, the outer loop first. */
export const loopWeights = (comp: Comp): number[][] => compLoops(comp).map((_, k) => loopWalls(comp, k).map(w => 1 / w.tan));

/** What core's `solveSkeleton` is called with for one island: its outer loop and its options. */
export type SkeletonInput = [outer: Pt[], options: SolveSkeletonOptions];

/**
 * Holed roof decision 9: exactly what core is called with for an island at `weights`. `weights[k]` is `1 / tan` of loop
 * `k`'s walls in edge order, loop 0 the outer loop and loop `k` hole `k - 1`. An island with no hole is called with its
 * outer loop's weights alone, no `holes` option.
 */
export function skeletonInput(comp: Comp, weights: number[][]): SkeletonInput {
  return comp.holes.length
    ? [comp.outer, {weights: weights[0], holes: comp.holes.map((h, k) => ({vertices: h, weights: weights[k + 1]}))}]
    : [comp.outer, {weights: weights[0]}];
}

/** An island's faces at its own walls' pitches (`loopWeights`), or its refusal: the roof's one call of the seam. */
export const solveIsland = (comp: Comp): SolveResult => solveFaces(comp, loopWeights(comp));

/** An island's faces at `weights` (see `skeletonInput`), or its refusal. A test may hand it perturbed weights. */
export function solveFaces(comp: Comp, weights: number[][]): SolveResult {
  let result: SkeletonSolveResult;
  try {
    result = solveSkeleton(...skeletonInput(comp, weights));
  } catch (e) {
    return refused(classify(e), (e as Error).message);
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
    const blocking = result.diagnostics.filter(d => !INFORMATIONAL.has(d.kind) && (holed || d.kind !== REFUSED_BY_THE_ROOF));
    return {ok: false, kind: 'incomplete', message: diagnostics.join(' | ').slice(0, 400), cause: incompleteCause(blocking)};
  }
  let strips: Strip[];
  try {
    strips = computeStrips(result, {depth: computeMaxOffset(result)});
  } catch (e) {
    return refused('threw', `computeStrips: ${(e as Error).message}`);
  }
  const read = facesOfStrips(comp, result, strips);
  if (!read.ok) return read;
  return {ok: true, faces: read.faces, diagnostics, causality: causalityDetail.length, causalityDetail, tilingError: read.tilingError};
}

/** A solve's strips read as faces (decisions 10 to 12), before `facesOfSolve` adds the solve's diagnostics. */
export interface StripFaces {
  ok: true;
  faces: RawFace[];
  tilingError: number; // |sum of face areas - footprint area| / footprint area
}

/** Each loop's map from its edges to the solved edges, as the solve gives it. */
type LoopMaps = NonNullable<SkeletonSolveResult['loopMaps']>;

/**
 * Decision 11: every solved edge has exactly one strip. A strip count other than the solved edge count, and an edge
 * with no strip or two, are each the `'strip-missing'` refusal.
 */
function checkStripCoverage(strips: readonly Strip[], solvedEdges: number): SolveRefused | undefined {
  if (strips.length !== solvedEdges) return refused('strip-missing', `${strips.length} strips for ${solvedEdges} solved edges`);
  const seen: number[] = Array(solvedEdges).fill(0);
  for (const s of strips) for (const e of s.supportingEdgeIds) seen[e] = (seen[e] ?? 0) + 1;
  const off = seen.findIndex(n => n !== 1);
  if (off >= 0) return refused('strip-missing', `solved edge ${off} has ${seen[off]} strips`);
  return undefined;
}

/** The midpoint of a strip's frontage, its first point to its last. */
const frontageMidpoint = (s: Strip): Pt => {
  const f = s.frontage;
  return {x: (f[0].x + f[f.length - 1].x) / 2, y: (f[0].y + f[f.length - 1].y) / 2};
};

/**
 * Decision 10: a strip's wall is the first wall of `comp.walls` whose own loop's map carries it on the strip's
 * supporting edge and whose span holds the frontage midpoint `mid`, the midpoint choosing among the collinear walls
 * canonicalisation merges.
 */
function wallOfStrip(comp: Comp, maps: LoopMaps, s: Strip, mid: Pt): Wall | undefined {
  return comp.walls.find(w => {
    if (!s.supportingEdgeIds.includes(maps[w.loop].edgeToEdge[w.edge])) return false;
    const along = dot(sub(mid, w.a), w.dir);
    return Math.abs(cross(w.dir, sub(mid, w.a))) < 1e-3 && along >= -1e-3 && along <= w.len + 1e-3;
  });
}

/**
 * Decisions 10 to 12: one face per strip, in strip order, each on its strip's wall (`wallOfStrip`), and the tiling
 * error against the footprint. No strip is ever skipped (decision 11): coverage (`checkStripCoverage`) and a strip of
 * fewer than three points are each the `'strip-missing'` refusal. Exported so a test can hand it constructed strips.
 */
export function facesOfStrips(comp: Comp, result: SkeletonSolveResult, strips: readonly Strip[]): StripFaces | SolveRefused {
  const maps = result.loopMaps;
  if (!maps || maps.length !== 1 + comp.holes.length) {
    return refused('unmapped', `the solve maps ${maps ? maps.length : 'no'} loops for ${1 + comp.holes.length}`);
  }
  const uncovered = checkStripCoverage(strips, result.graph.numExteriorNodes);
  if (uncovered) return uncovered;
  const faces: RawFace[] = [];
  let area = 0;
  for (const s of strips) {
    const edge = s.supportingEdgeIds.join(', ');
    if (s.boundary.length < 3) return refused('strip-missing', `the strip of solved edge ${edge} has ${s.boundary.length} boundary points`);
    const poly: Pt[] = s.boundary.map(p => ({x: p.x, y: p.y}));
    const mid = frontageMidpoint(s);
    const wall = wallOfStrip(comp, maps, s, mid);
    if (!wall) return refused('unmapped', `strip of solved edge ${edge} with frontage midpoint (${mid.x},${mid.y}) maps to no wall`);
    faces.push({wall, poly});
    area += Math.abs(polyArea(poly));
  }
  const footprint = footprintArea(comp);
  return {ok: true, faces, tilingError: Math.abs(area - footprint) / footprint};
}

