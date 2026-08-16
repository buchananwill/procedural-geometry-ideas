import type {Vector2} from './types';
import {solveSkeleton} from './algorithm-termination-cases';
import {computeMaxOffset} from './offset-projection';
import {computeStrips} from './strip-decomposition';
import type {Strip, StripOptions} from './strip-decomposition';
import {ensureClockwise} from './polygon-decomposition';
import {signedArea} from '../random-polygon/geometry-helpers';

/**
 * Recursive segment subdivision: solve a region, cut it into segments, solve each segment again.
 *
 * ## Nothing here is new geometry
 *
 * The whole driver is `solveSkeleton` → `computeStrips` at full depth → recurse on each segment's
 * boundary. At full depth (`computeMaxOffset`) the offset contour has vanished, so the segments
 * tile the region exactly and there is no interior void to account for — which is also why partial
 * depth is not offered here: the residue would have to be carried as a further region and the
 * wavefront projection at many-way events is a known open defect.
 *
 * Merging adjacent segments is done by {@link StripOptions.sameLogicalStreet}, *before* any geometry
 * is built: runs of `mergeGroupSize` consecutive exterior edges become one segment, and
 * `computeStrips` emits the merged face union itself. There is deliberately no polygon union in this
 * module — writing one would be building the thing `computeStrips` already provides.
 *
 * ## Failure is data
 *
 * A sub-polygon that will not solve is recorded on its node ({@link RecursiveNode.failure}) and its
 * siblings carry on. A demo that throws on one awkward cell shows nothing at all; a half-subdivided
 * picture that marks which cells failed is the useful artefact, and the census of which regions fail
 * as *solver output fed back as solver input* is itself the measurement this pass exists to take.
 */

/** Fewest passes `subdivideRecursively` will run: one solve, no recursion. */
export const MIN_RECURSION_LEVELS = 1;

/**
 * Most passes `subdivideRecursively` will run.
 *
 * A runaway guard, not a design position: the solver is roughly cubic and this runs it once per
 * segment per level, so a mis-typed level count is expensive rather than merely wrong.
 */
export const MAX_RECURSION_LEVELS = 3;

/**
 * Area below which a region counts as degenerate for decision 5.
 *
 * A floor rather than an exact zero, because the regions this driver recurses on are *computed*:
 * a segment boundary comes back from `computeStrips` as intersections of offset rays, so a sliver
 * that is geometrically collinear arrives with an area of `1e-13` and never with an exact `0`.
 * Testing `=== 0` would therefore only ever catch hand-authored collinear input and would hand every
 * real near-degenerate cell to the solver. The value matches the `AREA_EPSILON` that
 * `polygon-decomposition.ts` already uses for the same "is this sub-polygon degenerate" question;
 * it is an absolute area in the polygon's own units, which is the same footing that constant is on.
 */
export const DEGENERATE_AREA_EPSILON = 1e-6;

export interface RecursiveOptions {
    /** How many times to subdivide. 1 = one pass, no recursion. Clamped to [1, 3]. */
    levels: number;
    /** Adjacent segments per merged group at every level. Clamped to at least 1. */
    mergeGroupSize: number;
}

export interface RecursiveNode {
    /** Depth in the tree. The root is 0. */
    level: number;
    /** The polygon solved at this node, clockwise. */
    boundary: Vector2[];
    /** Segments this node was divided into, in boundary order. Empty when `failure` is set. */
    segments: Strip[];
    /** One child per merged group, in the same order. Empty at the leaf level. */
    children: RecursiveNode[];
    /** Why this node was not subdivided, or `undefined` when it was. */
    failure?: string;
}

/** The merge policy `computeStrips` takes, named so this module never restates its shape. */
export type SameLogicalStreetPredicate = NonNullable<StripOptions['sameLogicalStreet']>;

/**
 * Groups exterior edges into runs of `mergeGroupSize` consecutive ids.
 *
 * `computeStrips` asks the question once per adjacent pair `(i, i + 1)` around the boundary, wrap
 * included, so "same run" is simply "same group index". The wrap pair therefore answers false
 * whenever the boundary has more edges than one group holds, which is what makes the last group a
 * short one rather than one that swallows the seam. When a group is at least as large as the whole
 * boundary every pair answers true and `computeStrips` emits a single segment equal to the region —
 * a legitimate, if uninteresting, answer rather than an error.
 */
export function makeMergeGroupPredicate(mergeGroupSize: number): SameLogicalStreetPredicate {
    const size = clampMergeGroupSize(mergeGroupSize);
    return (edgeIdA: number, edgeIdB: number) =>
        Math.floor(edgeIdA / size) === Math.floor(edgeIdB / size);
}

/** Levels, forced into `[1, 3]`. Anything non-finite is treated as the minimum. */
export function clampLevels(levels: number): number {
    if (!Number.isFinite(levels)) {
        return MIN_RECURSION_LEVELS;
    }
    return Math.min(MAX_RECURSION_LEVELS, Math.max(MIN_RECURSION_LEVELS, Math.floor(levels)));
}

/** Merge group size, forced to a whole number of at least one. */
export function clampMergeGroupSize(mergeGroupSize: number): number {
    if (!Number.isFinite(mergeGroupSize)) {
        return 1;
    }
    return Math.max(1, Math.floor(mergeGroupSize));
}

/**
 * Subdivides `boundary` into segments, then subdivides each of those, `levels` times over.
 *
 * Every node of the returned tree either carries the segments it was divided into or a `failure`
 * saying why it was not — including the root, which is returned as a failed node rather than
 * throwing, so a caller always has something to draw.
 */
export function subdivideRecursively(boundary: Vector2[], options: RecursiveOptions): RecursiveNode {
    const levels = clampLevels(options.levels);
    const sameLogicalStreet = makeMergeGroupPredicate(options.mergeGroupSize);
    return subdivideNode(boundary, 0, levels, sameLogicalStreet);
}

/**
 * Every node of a subdivision tree, the node itself first, then each subtree in child order.
 *
 * Lives here rather than in whichever caller wants it because counting, censusing and drawing a tree
 * all start by walking it, and three copies of one recursive line are three places for the traversal
 * order to drift apart.
 */
export function flattenRecursiveTree(node: RecursiveNode): RecursiveNode[] {
    return [node, ...node.children.flatMap(flattenRecursiveTree)];
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Segments of one region, or the reason it has none. Never both. */
export type SegmentOutcome =
    | {segments: Strip[]; failure?: undefined}
    | {segments?: undefined; failure: string};

/**
 * Decision 5's degeneracy test: why this region has no skeleton, or `undefined` when it has one.
 *
 * `solveSkeleton` throws below three vertices and a zero-area polygon has no skeleton to speak of;
 * both are reported the same way as a solve that merely failed, because to the caller they are the
 * same event — this cell was not subdivided.
 */
function degenerateRegionFailure(boundary: Vector2[]): string | undefined {
    if (boundary.length < 3) {
        return `Degenerate region: ${boundary.length} boundary vertices, fewer than the three a polygon needs.`;
    }
    const area = Math.abs(signedArea(boundary));
    if (area < DEGENERATE_AREA_EPSILON) {
        return `Degenerate region: ${boundary.length} boundary vertices enclosing an area of `
            + `${area}, under the ${DEGENERATE_AREA_EPSILON} degeneracy floor.`;
    }
    return undefined;
}

/**
 * Divides one non-degenerate region into segments at full depth.
 *
 * The caller has already screened for degeneracy, so everything reported here is a solve that was
 * attempted and did not finish.
 */
function divideIntoSegments(boundary: Vector2[], sameLogicalStreet: SameLogicalStreetPredicate): SegmentOutcome {
    try {
        const result = solveSkeleton(boundary);
        if (!result.complete) {
            const detail = result.diagnostics.map(diagnostic => `${diagnostic.kind}: ${diagnostic.detail}`).join('; ');
            return {failure: `Incomplete solve: ${detail === '' ? 'no diagnostics reported.' : detail}`};
        }
        return {segments: computeStrips(result, {depth: computeMaxOffset(result), sameLogicalStreet})};
    } catch (error) {
        return {failure: `Subdivision threw: ${describe(error)}`};
    }
}

function subdivideNode(
    boundary: Vector2[],
    level: number,
    levels: number,
    sameLogicalStreet: SameLogicalStreetPredicate,
): RecursiveNode {
    // Screened before the winding is touched: a region with no area has no winding to normalise, so
    // it is recorded exactly as it was handed in rather than arbitrarily reversed on the way out.
    const degeneracy = degenerateRegionFailure(boundary);
    if (degeneracy !== undefined) {
        return {level, boundary, segments: [], children: [], failure: degeneracy};
    }

    // `ensureClockwise` from `./polygon-decomposition` is this package's one winding-normalisation
    // formula, rather than a third copy of it. A `Strip.boundary` already arrives clockwise, so this
    // only does real work on the root's raw input.
    const clockwise = ensureClockwise(boundary);
    const outcome = divideIntoSegments(clockwise, sameLogicalStreet);
    if (outcome.segments === undefined) {
        return {level, boundary: clockwise, segments: [], children: [], failure: outcome.failure};
    }

    const isLeafLevel = level + 1 >= levels;
    return {
        level,
        boundary: clockwise,
        segments: outcome.segments,
        // One child per merged group, in the same order — a degenerate or unsolvable segment
        // becomes a child carrying its failure, never a gap in the sequence.
        children: isLeafLevel
            ? []
            : outcome.segments.map(segment =>
                subdivideNode(segment.boundary, level + 1, levels, sameLogicalStreet)),
    };
}
