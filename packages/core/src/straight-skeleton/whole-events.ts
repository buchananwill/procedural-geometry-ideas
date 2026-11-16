import {BisectionParams, CollisionEvent, SplitEvent, StraightSkeletonSolverContext, WavefrontSegment} from "./types";
import {timeOf} from "./collision-helpers";
import {byEdgeIds} from "./event-order";
import {clusterCoincidentMerges, CoincidentMerge, mergesShareAnEdge} from "./coincident-events";
import {
    bearGaps,
    bisectionsForMerge,
    bisectionsForMergeOnWall,
    contiguousRuns,
    crossRingRuns,
    CrossRingRuns,
    MergeGap,
    mergeGaps,
    wallFacingGap,
} from "./vertex-event";
import {LayerLinks} from "./layer-links";
import {accept, PASSED, refuse, Verdict} from "./verdict";

/*
 * A LAYER RESOLVED AS WHOLE VERTEX EVENTS: whether its events can be (`asWholeEvents`), where each merge lies, its
 * third-front meeting on a step of several rings, what a step of several rings still refuses, and the bisectors each
 * merge bears. `handleInteriorNGon` (algorithm-complex-cases.ts) runs them in its phases.
 */

/**
 * WHERE A MERGE RESOLVED WHOLE LIES: on one ring, or (a merge across rings, on a step of several rings) as one run on
 * each of two rings, its {@link CrossRingRuns}.
 */
export type MergePlacement = {kind: 'ring'; ring: number[]} | {kind: 'cross'; runs: CrossRingRuns};

/**
 * One merge of a layer resolved whole: the merge, where it lies, and, on a step of several rings, its third-front
 * meeting where it has one ({@link withThirdFronts}).
 */
export interface WholeMerge {
    merge: CoincidentMerge;
    placement: MergePlacement;
    thirdFront?: ThirdFront;
}

/** A layer's events resolved as WHOLE vertex events: its merges in canonical order. */
export interface WholeEvents {
    merges: WholeMerge[];
}

/**
 * These events resolved as WHOLE vertex events, or `null` when they cannot be. `rings` are the step's rings at the
 * layer's start.
 *
 * A merge is resolvable as a whole if all its arrivals lie on one wavefront ring, or, ON A STEP OF SEVERAL RINGS,
 * if they are one run on each of two rings (simultaneous-rings spec, decisions 3 and 7): a vertex event across
 * rings, whose two bisectors `bisectionsOfWholeMerge` bears. Any other merge across rings sends the layer to
 * the narrowing and, failing that, to `pairwiseLayerRefusal` (decision 21). And no two merges may claim the same edge —
 * a bisector arrives somewhere once, so an edge in two merges means the first merge resolved would consume it and
 * strand the second. Deciding both for every merge before mutating anything keeps the answer all-or-nothing,
 * rather than leaving half a set resolved two different ways.
 *
 * On a step of one ring every merge lies on the one ring, every placement is `ring`, and the answer is today's
 * (decision 1).
 */
export function asWholeEvents(
    context: StraightSkeletonSolverContext,
    rings: number[][],
    events: CollisionEvent[],
): WholeEvents | null {
    const candidates = clusterCoincidentMerges(
        events.filter(event => event.eventType === 'interiorPair' || event.eventType === 'interiorNonAdjacent'),
        context.perceptualFloor,
    );
    const merges: WholeMerge[] = [];
    for (const merge of candidates) {
        const ring = rings.find(candidate => merge.edgeIds.every(edgeId => candidate.includes(edgeId)));
        if (ring !== undefined) {
            merges.push({merge, placement: {kind: 'ring', ring}});
            continue;
        }
        const runs = rings.length > 1 ? crossRingRuns(rings, merge) : undefined;
        if (runs === undefined) {
            return null;
        }
        merges.push({merge, placement: {kind: 'cross', runs}});
    }
    return mergesShareAnEdge(candidates) ? null : {merges};
}

/*
 * WHAT A STEP OF SEVERAL RINGS STILL REFUSES (skeleton simultaneous-rings spec, decisions 20 to 23): why this layer's
 * final event set cannot be resolved, as a refused {@link Verdict}, or `PASSED` when it can. Asked once the set is final
 * and before its first event is resolved, so a refused layer changes no link, node or acceptance, and only on a step of
 * more than one ring (decision 1). The events are the layer's own, chosen by `HELD_SIMULTANEITY_WINDOW`, the narrowing
 * to the earliest moment and the clustering at δ: no window or tolerance is added here. Two refusals, one for each way the layer is
 * resolved: {@link wholeLayerRefusal} for a layer resolved whole, {@link pairwiseLayerRefusal} for one that is not.
 * Nothing here reads a split as a join or a divide (decision 19).
 */

/**
 * WHAT A LAYER RESOLVED WHOLE STILL REFUSES: the first merge, in the resolution's order, whose third-front meeting cannot
 * be resolved (flat-ring and third-front spec, decision 44); its {@link ThirdFront}'s resolution is the reason.
 *
 * The decision-21 clauses of {@link pairwiseLayerRefusal} are vacuous here by construction, so they are not asked
 * (decision 45 asked them of the layer's events less the splits of its third-front meetings). `asWholeEvents` resolved
 * the layer only because every merge lies on one ring or is one run on each of two, and no two merges share a bisector,
 * and its merges are the clustering at δ of the same interior events.
 */
export function wholeLayerRefusal(resolution: WholeEvents): Verdict<void> {
    for (const {merge, thirdFront} of resolution.merges) {
        if (thirdFront !== undefined && !thirdFront.resolution.ok) {
            return refuse(`the vertex event [${merge.edgeIds.join(', ')}] meets a third front, edge `
                + `${thirdFront.splits[0].struckSegment.exteriorEdge}: ${thirdFront.resolution.reason} (flat-ring and `
                + `third-front spec, decision 44).`);
        }
    }
    return PASSED;
}

/**
 * WHAT A LAYER NOT RESOLVED WHOLE STILL REFUSES:
 *
 *  - DECISION 21: a merge across rings that is not one run on each of two rings — three runs or more, two runs on one
 *    ring with a third ring, or a run that is its whole ring. Its pairing would depend on the angular order round the
 *    node, which the links do not hold.
 *  - DECISION 21: a layer that cannot be resolved whole (`mergesShareAnEdge`: two of its merges share a bisector) and
 *    holds an interior event with participants on two rings. The pairwise fallback would resolve it one pair at a
 *    time, which strands an arrival (A′, measured).
 *  - DECISION 22: a meeting on a third front — a split whose instigator is an arrival of a merge while neither end of
 *    its struck segment is ({@link meetsThirdFront}). A split whose struck segment does end on an arrival is a
 *    re-report of the vertex event (decision 18) and is void once the merge has consumed its instigator. (Skeleton
 *    flat-ring and third-front spec, decision 31.)
 *
 * The merges are the layer's clustering at δ, the same `asWholeEvents` refused. `rings` are the step's rings at the
 * layer's start.
 */
export function pairwiseLayerRefusal(
    context: StraightSkeletonSolverContext,
    rings: number[][],
    events: CollisionEvent[],
): Verdict<void> {
    const ringOf = new Map<number, number>();
    rings.forEach((ring, index) => ring.forEach(id => ringOf.set(id, index)));
    const describe = (event: CollisionEvent) =>
        `${event.eventType} [${event.collidingEdges.join(', ')}] at time ${timeOf(event.arrival)}`;
    const interior = events.filter(event => event.eventType === 'interiorPair' || event.eventType === 'interiorNonAdjacent');

    const merges = clusterCoincidentMerges(interior, context.perceptualFloor);
    for (const merge of merges) {
        const ringCount = new Set(merge.edgeIds.map(id => ringOf.get(id))).size;
        if (ringCount > 1 && crossRingRuns(rings, merge) === undefined) {
            return refuse(`the vertex event [${merge.edgeIds.join(', ')}] gathers bisectors of ${ringCount} rings in `
                + `other than one run on each of two, so its pairing would depend on the angular order round its node `
                + `(decision 21).`);
        }
    }

    if (mergesShareAnEdge(merges)) {
        const across = interior.find(event => ringOf.get(event.collidingEdges[0]) !== ringOf.get(event.collidingEdges[1]));
        if (across !== undefined) {
            return refuse(`the layer cannot be resolved whole, because two of its vertex events share a bisector, and `
                + `${describe(across)} meets bisectors of two rings (decision 21).`);
        }
    }

    for (const split of events) {
        const merge = merges.find(candidate => candidate.edgeIds.includes(split.collidingEdges[0]));
        if (merge !== undefined && meetsThirdFront(split, merge)) {
            const segment = split.struckSegment;
            return refuse(`the split ${describe(split)} meets a third front: its instigator arrives at the vertex event `
                + `[${merge.edgeIds.join(', ')}], and neither end of its struck segment (e${segment.from}, e${segment.to}) `
                + `of edge ${segment.exteriorEdge} does (decision 22).`);
        }
    }
    return PASSED;
}

/**
 * Is `split` a strike of a third front by an arrival of `merge` (simultaneous-rings decision 22): its instigator arrives
 * at the vertex event, and neither end of its struck segment does?
 */
function meetsThirdFront(split: CollisionEvent, merge: CoincidentMerge): split is SplitEvent {
    return split.eventType === 'interiorAgainstExterior'
        && merge.edgeIds.includes(split.collidingEdges[0])
        && !merge.edgeIds.includes(split.struckSegment.from) && !merge.edgeIds.includes(split.struckSegment.to);
}

/**
 * A THIRD-FRONT MEETING OF A MERGE RESOLVED WHOLE (skeleton flat-ring and third-front spec, decision 30): the merge's
 * splits `S(M)`, by edge ids (`byEdgeIds`). Its resolution is the gaps of its runs, the one that faces the struck wall,
 * and the struck segment, of the first split (decisions 32 to 36); or, where it cannot be resolved, the reason
 * (decision 44).
 */
export interface ThirdFront {
    splits: SplitEvent[];
    resolution: Verdict<{gaps: MergeGap[]; facing: number; segment: WavefrontSegment}>;
}

/**
 * The merge's runs over `members`, in its ring's or rings' clockwise order: its {@link CrossRingRuns} across two rings,
 * which hold every member; {@link contiguousRuns} of `members` on its ring.
 */
function runsOf(placement: MergePlacement, members: readonly number[]): readonly (readonly number[])[] {
    return placement.kind === 'cross' ? placement.runs : contiguousRuns(placement.ring, new Set(members));
}

/**
 * The resolution with each merge's third-front meeting attached, where it has one (decisions 30 to 36 and 44), read
 * before any event is resolved and from runs, walls and weights only (decision 43). A merge's runs are read at the
 * layer's start, over all its members.
 */
export function withThirdFronts(
    context: StraightSkeletonSolverContext,
    resolution: WholeEvents,
    events: CollisionEvent[],
): WholeEvents {
    return {
        merges: resolution.merges.map(whole => {
            const thirdFront = thirdFrontOf(context, whole, events);
            return thirdFront === undefined ? whole : {...whole, thirdFront};
        }),
    };
}

/** The third-front meeting of one merge resolved whole, or `undefined` when no split of the layer is one of its. */
function thirdFrontOf(
    context: StraightSkeletonSolverContext,
    {merge, placement}: WholeMerge,
    events: CollisionEvent[],
): ThirdFront | undefined {
    const splits = events.filter((event): event is SplitEvent => meetsThirdFront(event, merge)).toSorted(byEdgeIds);
    if (splits.length === 0) {
        return undefined;
    }
    const third = (resolution: ThirdFront['resolution']): ThirdFront => ({splits, resolution});
    const segment = splits[0].struckSegment;
    const walls = new Set(splits.map(split => split.struckSegment.exteriorEdge));
    if (walls.size > 1) {
        return third(refuse(`its splits strike ${walls.size} walls (${[...walls].join(', ')})`));
    }
    // A merge across rings is two runs, so only a merge on one ring can be one run that is its whole ring.
    const runs = runsOf(placement, merge.edgeIds);
    if (placement.kind === 'ring' && runs.length === 1 && runs[0].length === placement.ring.length) {
        return third(refuse('a run of it is its whole ring'));
    }
    const gaps = mergeGaps(runs, context);
    const facing = wallFacingGap(gaps, segment.exteriorEdge, context);
    return third(facing.ok ? accept({gaps, facing: facing.value, segment}) : facing);
}

/**
 * THE BISECTORS A MERGE RESOLVED WHOLE BEARS at `nodeId`, linked in `layer`, its `arrivals` already terminated there.
 *
 * A VERTEX EVENT ACROSS TWO RINGS (simultaneous-rings spec, decisions 3 to 8) bears the two bisectors of its two runs'
 * cycle; every other merge lies on one ring and bears one bisector per gap between its runs of arrivals, as always
 * ({@link bisectionsForMerge}). A MERGE WHOSE NODE LIES ON A THIRD FRONT (flat-ring and third-front spec, decisions 37 to
 * 42) bears its clear gaps and, in place of the gap facing the struck wall, the wall's cut at the node. A third front
 * whose resolution was refused never reaches here: the layer was refused before anything was resolved.
 */
export function bisectionsOfWholeMerge(
    {merge, placement, thirdFront}: WholeMerge,
    arrivals: number[],
    nodeId: number,
    context: StraightSkeletonSolverContext,
    layer: LayerLinks,
): BisectionParams[] {
    const onWall = thirdFront?.resolution;
    if (onWall?.ok === true) {
        const {gaps, facing, segment} = onWall.value;
        return bisectionsForMergeOnWall(gaps, facing, segment.exteriorEdge, segment, merge.position, nodeId, layer);
    }
    switch (placement.kind) {
        case 'ring':
            return bisectionsForMerge(placement.ring, arrivals, nodeId, context, layer);
        case 'cross':
            return bearGaps(mergeGaps(placement.runs, context), nodeId, layer);
    }
}
