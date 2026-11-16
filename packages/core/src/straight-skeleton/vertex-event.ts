import {BisectionParams, StraightSkeletonSolverContext, Vector2, WavefrontSegment} from "./types";
import {crossProduct, directionsAreSame, dotProduct, rotateCw90, scaleVector, sizeOfVector} from "./core-functions";
import {wallsAreAntiparallel} from "./wall-time";
import {CoincidentMerge} from "./coincident-events";
import {LayerLinks, linkMergeGap, linkMergeGapOnWall} from "./layer-links";
import {accept, refuse, Verdict} from "./verdict";

/*
 * ONE VERTEX EVENT'S REWRITE OF THE WAVEFRONT. A merge's arrivals, read as runs round the ring or rings they lie on; the
 * gaps between the runs and the walls each gap's bisector is born between; which gap faces a struck wall; and the
 * bearing of each gap's bisector, linked in the layer's {@link LayerLinks}. Which events are one vertex event is
 * `coincident-events.ts`'s.
 */

/** Maximal runs of `members` that are contiguous in the cyclic order of `ring`. */
export function contiguousRuns(ring: number[], members: ReadonlySet<number>): number[][] {
    const length = ring.length;
    const isMember = ring.map(edgeId => members.has(edgeId));

    if (isMember.every(Boolean)) {
        return [[...ring]];
    }

    const runs: number[][] = [];
    for (let index = 0; index < length; index++) {
        if (!isMember[index] || isMember[(index - 1 + length) % length]) {
            continue;
        }

        const run: number[] = [];
        let cursor = index;
        while (isMember[cursor]) {
            run.push(ring[cursor]);
            cursor = (cursor + 1) % length;
        }
        runs.push(run);
    }

    return runs;
}

/**
 * The two runs of a vertex event across rings (skeleton simultaneous-rings spec, decision 3): `first` on the ring that
 * comes first in the step's rings, `second` on the other, each in its ring's clockwise order.
 */
export type CrossRingRuns = readonly [first: readonly number[], second: readonly number[]];

/**
 * IS THIS MERGE ONE RUN ON EACH OF EXACTLY TWO RINGS (skeleton simultaneous-rings spec, decision 3)? Its runs, or
 * `undefined` when it is anything else: arrivals on one ring, on three rings or more, two runs on one ring, a run that is
 * its whole ring, or an arrival on no ring. Each run is a {@link contiguousRuns} run of its ring.
 *
 * ONLY THIS SHAPE HAS ONE PAIRING (decision 5): two runs have one cyclic order, so each gap's bisector is forced. Any
 * other shape would need the angular order of the arrivals round the node, which the links do not hold (decision 21).
 * `rings` are the step's rings at the layer's start.
 */
export function crossRingRuns(rings: readonly number[][], merge: Pick<CoincidentMerge, 'edgeIds'>): CrossRingRuns | undefined {
    const members = new Set(merge.edgeIds);
    const touched = rings.filter(ring => ring.some(edgeId => members.has(edgeId)));
    const placed = touched.reduce((count, ring) => count + ring.filter(edgeId => members.has(edgeId)).length, 0);
    if (touched.length !== 2 || placed !== members.size) {
        return undefined;
    }
    const runs = touched.map(ring => contiguousRuns(ring, members));
    if (runs.some(ringRuns => ringRuns.length !== 1)
        || touched.some((ring, index) => runs[index][0].length === ring.length)) {
        return undefined;
    }
    return [runs[0][0], runs[1][0]];
}

/**
 * ONE GAP OF A VERTEX EVENT (skeleton flat-ring and third-front spec, decision 33): the arc between run `k`'s last arrival
 * and the next run's first departure, and the two walls the gap's bisector would be born between.
 */
export interface MergeGap {
    lastArrival: number;
    firstDeparture: number;
    clockwiseWall: number;
    widdershinsWall: number;
}

/**
 * The gaps of a vertex event with these runs, in cyclic order: one per run `k`, from the last of run `k` to the first of
 * run `k + 1`, with `clockwiseWall = cp(lastArrival)` and `widdershinsWall = wp(firstDeparture)`. Exactly the gaps
 * {@link bearGaps} bears.
 */
export function mergeGaps(runs: readonly (readonly number[])[], context: StraightSkeletonSolverContext): MergeGap[] {
    return runs.map((run, index) => {
        const lastArrival = run[run.length - 1];
        const firstDeparture = runs[(index + 1) % runs.length][0];
        return {
            lastArrival,
            firstDeparture,
            clockwiseWall: context.getInteriorWithId(lastArrival).clockwiseExteriorEdgeIndex,
            widdershinsWall: context.getInteriorWithId(firstDeparture).widdershinsExteriorEdgeIndex,
        };
    });
}

/**
 * THE GAP'S LINKS, FROM THE PARTICIPANTS BRACKETING IT (skeleton wavefront-order spec, decision 9): the gap's bisector,
 * sourced at the event's node, stands between the last arrival's clockwise neighbour and the first departure's widdershins
 * neighbour — the two ends of the arc the gap leaves. The merge retires its arrivals.
 */
function bearGap(gap: MergeGap, sourceNodeId: number, layer: LayerLinks): BisectionParams {
    const params: BisectionParams = {
        clockwiseExteriorEdgeIndex: gap.clockwiseWall,
        widdershinsExteriorEdgeIndex: gap.widdershinsWall,
        source: sourceNodeId,
    };
    linkMergeGap(layer, gap.lastArrival, gap.firstDeparture, params);
    return params;
}

/**
 * THE BISECTORS OF A VERTEX EVENT'S GAPS, one per gap in the gaps' order, each sourced at `sourceNodeId` and linked by
 * {@link linkMergeGap} in `layer`. A merge on one ring bears its gaps here ({@link bisectionsForMerge}); so does a
 * vertex event across two rings (skeleton simultaneous-rings spec, decisions 4 to 6), whose two runs `(R1, R2)` have
 * two gaps:
 *
 *     X = {cw: cp(last R1), ws: wp(first R2)}   linked between ws(first R2) and cw(last R1)
 *     Y = {cw: cp(last R2), ws: wp(first R1)}   linked between ws(first R1) and cw(last R2)
 *
 * borne as `[X, Y]`, both partition births. On two single arrivals this is exactly the rewrite `linkVertexToVertex`
 * makes. Whether the event joined two rings or divided one is read from the rings it leaves.
 */
export function bearGaps(gaps: readonly MergeGap[], sourceNodeId: number, layer: LayerLinks): BisectionParams[] {
    return gaps.map(gap => bearGap(gap, sourceNodeId, layer));
}

/**
 * A GAP'S DIRECTION, THE KERNEL'S (skeleton flat-ring and third-front spec, decision 35): the `v` with `v · n_cw = w_cw`
 * and `v · n_ws = w_ws`, `n` a wall's inward normal. Walls parallel and facing the same way give `n · w` at equal weights,
 * and at unequal weights no direction, the reason being the refusal; antiparallel walls give the clockwise wall's basis,
 * as `addBisectionEdge` does. Parallelism is read at the angular resolution.
 */
function gapDirection(gap: MergeGap, context: StraightSkeletonSolverContext): Verdict<Vector2> {
    const clockwise = context.getEdgeWithId(gap.clockwiseWall).basisVector;
    const widdershins = context.getEdgeWithId(gap.widdershinsWall).basisVector;
    const clockwiseWeight = context.weightOf(gap.clockwiseWall);
    const widdershinsWeight = context.weightOf(gap.widdershinsWall);
    if (wallsAreAntiparallel(context, gap.clockwiseWall, gap.widdershinsWall)) {
        return accept(clockwise);
    }
    if (directionsAreSame(clockwise, widdershins, context.angularResolution)) {
        return clockwiseWeight === widdershinsWeight
            ? accept(scaleVector(rotateCw90(clockwise), clockwiseWeight))
            : refuse(`the gap {cw: ${gap.clockwiseWall}, ws: ${gap.widdershinsWall}} lies between same-facing parallel `
                + `walls of unequal weight (${clockwiseWeight}, ${widdershinsWeight})`);
    }
    const n1 = rotateCw90(clockwise);
    const n2 = rotateCw90(widdershins);
    const determinant = crossProduct(n1, n2);
    return accept({
        x: (clockwiseWeight * n2.y - widdershinsWeight * n1.y) / determinant,
        y: (n1.x * widdershinsWeight - n2.x * clockwiseWeight) / determinant,
    });
}

/**
 * WHICH GAP FACES THE STRUCK WALL (skeleton flat-ring and third-front spec, decision 36): a gap whose direction `v̂` has
 * `v̂ · n_wall < −angularResolution` moves into the wall's front and faces it; above `+angularResolution` it is clear;
 * between, it grazes. The facing gap's index when exactly one faces and none grazes; otherwise the reason the meeting
 * stays refused (decision 44 (c) and (d)).
 */
export function wallFacingGap(gaps: readonly MergeGap[], wall: number, context: StraightSkeletonSolverContext): Verdict<number> {
    const normal = rotateCw90(context.getEdgeWithId(wall).basisVector);
    const facing: number[] = [];
    for (const [index, gap] of gaps.entries()) {
        const direction = gapDirection(gap, context);
        if (!direction.ok) {
            return direction;
        }
        const cosine = dotProduct(direction.value, normal) / (sizeOfVector(direction.value) * sizeOfVector(normal));
        if (cosine < -context.angularResolution) {
            facing.push(index);
        } else if (cosine <= context.angularResolution) {
            return refuse(`the gap {cw: ${gap.clockwiseWall}, ws: ${gap.widdershinsWall}} grazes wall ${wall}`);
        }
    }
    return facing.length === 1
        ? accept(facing[0])
        : refuse(`${facing.length} of its ${gaps.length} gaps face wall ${wall}, not one`);
}

/**
 * THE VERTEX EVENT ON A THIRD FRONT, RESOLVED WHOLE (skeleton flat-ring and third-front spec, decisions 37 to 41): the
 * clear gaps are borne and linked as every merge's are, first; the facing gap is not born, and `segment` of `wall` is cut
 * at `position` by two bisectors, `towardsClockwise = {cw: gap's clockwise wall, ws: wall}` and `towardsWiddershins =
 * {cw: wall, ws: gap's widdershins wall}` ({@link linkMergeGapOnWall}). Returned as the clear gaps' params, then
 * `towardsClockwise`, then `towardsWiddershins`.
 */
export function bisectionsForMergeOnWall(
    gaps: readonly MergeGap[],
    facing: number,
    wall: number,
    segment: WavefrontSegment,
    position: Vector2,
    sourceNodeId: number,
    layer: LayerLinks,
): BisectionParams[] {
    const clear = bearGaps(gaps.filter((_gap, index) => index !== facing), sourceNodeId, layer);
    const {lastArrival, firstDeparture, clockwiseWall, widdershinsWall} = gaps[facing];
    const towardsClockwise: BisectionParams = {
        clockwiseExteriorEdgeIndex: clockwiseWall, widdershinsExteriorEdgeIndex: wall, source: sourceNodeId,
    };
    const towardsWiddershins: BisectionParams = {
        clockwiseExteriorEdgeIndex: wall, widdershinsExteriorEdgeIndex: widdershinsWall, source: sourceNodeId,
    };
    linkMergeGapOnWall(layer, lastArrival, firstDeparture, segment, position, towardsClockwise, towardsWiddershins);
    return [...clear, towardsClockwise, towardsWiddershins];
}

/**
 * The bisectors born from one vertex event on `ring`, whose `arrivals` end at `sourceNodeId`.
 *
 * The event removes its participating edges from the ring. What remains is one arc per gap
 * between consecutive runs of participants, and each arc gets exactly one new bisector,
 * sourced at the event point and bounded by the exterior parents on either side of the gap.
 *
 * - one run, covering the whole ring — the sub-polygon closes here and nothing is born;
 * - one run, a proper subset — a collapse, one new bisector (the two-edge case of which is
 *   the classic edge-collapse event);
 * - two or more runs — a partition, one new bisector per resulting sub-polygon.
 *
 * PARENTS AND SOURCE ONLY: THE DIRECTION IS NOT THIS FUNCTION'S TO GUESS. Each gap used to be
 * handed an `approximateDirection` — the bisection of the two arrivals bracketing it — for
 * `addBisectionEdge` to flip its parent-derived basis with. That construction is SYMMETRIC in the
 * two arrivals, so a two-run event gave both of its gaps the same hint while the gaps face opposite
 * ways: it was wrong for one of them by construction. It only ever reached the basis where the
 * offset rate is zero, which is the anti-parallel-parent case, and there the ordered parent pair
 * already says which way the corridor runs. Three fixtures were being drawn wrong on the strength
 * of it — see `addBisectionEdge`.
 */
export function bisectionsForMerge(
    ring: number[],
    arrivals: readonly number[],
    sourceNodeId: number,
    context: StraightSkeletonSolverContext,
    layer: LayerLinks,
): BisectionParams[] {
    const runs = contiguousRuns(ring, new Set(arrivals));

    if (runs.length === 0 || (runs.length === 1 && runs[0].length === ring.length)) {
        return [];
    }

    return bearGaps(mergeGaps(runs, context), sourceNodeId, layer);
}
