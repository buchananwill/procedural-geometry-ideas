import {
    AlgorithmStepInput,
    Arrival, BisectionParams, CollisionEvent, ResolvableEvent, SplitEvent,
    StraightSkeletonSolverContext, WavefrontSegment
} from "./types";
import {byArrival, compareArrivals, findOrComputeCollision, priceHeadOnPair, timeOf} from "./collision-helpers";
import {HELD_SIMULTANEITY_WINDOW, mergeDisplacementUncertainty} from "./constants";
import {
    byEdgeIds,
    compareEdgeIdLists,
    comparePriority,
    earliestArrivalMoment,
    inArrivalOrder,
    inPlaceOrder,
    nearerAlongSharedBisector,
} from "./event-order";
import {inwardDistanceFromWall} from "./wall-time";
import {applyDegenerateClosure, climbTerminalLadder} from "./algorithm-termination-cases";
import handleCollisionEvent from "./collision-handling";
import {bisectWithParams} from "./algorithm-helpers";
import {
    bisectionsForCrossRingMerge,
    bisectionsForMerge,
    bisectionsForMergeOnWall,
    clusterCoincidentMerges,
    CoincidentMerge,
    coincidentEventPositions,
    contiguousRuns,
    crossRingRuns,
    CrossRingRuns,
    MergeGap,
    mergeGaps,
    mergesShareAnEdge,
    wallFacingGap,
} from "./coincident-events";
import {closeFlatRings} from "./flat-rings";
import {retireBisectors, ringsAmong, ringsOfWavefront} from "./wavefront-links";
import {
    birthsClosedAtOneNode,
    droppableBirths,
    LayerLinks,
    linkBirth,
    partitionArc,
    settleLayerLinks,
} from "./layer-links";
import {componentsOfRings} from "./ring-components";
import {refuseStep} from "./step-scope";
import {accept, formatRing, PASSED, refuse, Verdict} from "./verdict";

/**
 * A NODE CARRIES WHERE IT WAS PUT (journal-5 decisions 170 and 171(c)): raise `nodeId`'s position budget to
 * the largest equi-time residual, at the node, of the bisectors it emits — {@link mergeDisplacementUncertainty}
 * for each one's two parents. ONE TERM, TWO SITES, because both sites take ONE release: the coincidence
 * clustering sites a group of meetings at its MEDOID (decision 157's release, below the floor the solver is
 * not obliged to tell them apart), and every bisector born there reads its clock from the node's distance to
 * its clockwise parent, so wherever the node is off that bisector's own locus the reading carries the residual
 * to the bisector's next meeting. The whole-event merge pays it (decision 170); so does a split re-pointed by
 * `coincidentEventPositions` (decision 171(c)).
 *
 * THE RESIDUAL, NOT THE DISTANCE MOVED. The budget answers for the disagreement between the emitted bisector's
 * two parent clocks at the node, and the residual IS that disagreement, exactly. The distance from a member's
 * own point to the medoid is not a bound on it in either direction: a displacement ALONG the bisector's locus
 * moves no clock and costs nothing, and one across it moves both parents' distances, by up to twice itself at
 * unit weights. So the distance would overcharge the first and could undercharge the second.
 */
function chargeSitingResidual(nodeId: number, bisections: BisectionParams[], context: StraightSkeletonSolverContext): void {
    const position = context.graph.nodes[nodeId].position;
    context.positionUncertainties[nodeId] = Math.max(
        context.positionUncertainties[nodeId] ?? 0,
        ...bisections.map(params => mergeDisplacementUncertainty(
            inwardDistanceFromWall(context, params.clockwiseExteriorEdgeIndex, position),
            context.weightOf(params.clockwiseExteriorEdgeIndex),
            inwardDistanceFromWall(context, params.widdershinsExteriorEdgeIndex, position),
            context.weightOf(params.widdershinsExteriorEdgeIndex))));
}

/**
 * The partition bisectors a layer will bear, in the order it bears them: sorted by arc, with nested re-reports
 * of one split removed.
 *
 * EXPORTED FOR ITS OWN TEST, not for other callers — see `wavefront-order.test.ts`.
 */
export function selectPartitionEvents(layer: LayerLinks, partitionEvents: BisectionParams[]): BisectionParams[] {
    /* Clover Leaf Example:

    Partition Pair 1:  [[0,4], [4,0]]
    Partition Pair 2:  [[4,8], [8,4]]
    Partition Pair 3:  [[8,0], [0,8]]

    Outcome we want is: [[0,4], [4,8], [8,0]]

    Rule is: sort by the arc of bisection, then clockwise bisection.
    Arc of bisection, on one loop = (end - start + length) % length

     * */
    // THE ORDER IS THE ARC ROUND THE PENDING BISECTOR'S RING (skeleton join-and-divide spec, decisions 25 to 27):
    // `partitionArc` sums the gaps between consecutive clockwise parents round the ring, a gap within one loop
    // counted in clockwise steps and a gap between two loops as 1. It replaced `partitionSpan`, the id interval
    // `(ws − cw + n) mod n`, which has no meaning across loops; on one loop the arc telescopes to exactly that span,
    // so the births are numbered as they were. This order decides no child step — the rings do — but it is the order
    // the partition bisectors are BORN in, and it chooses which of two same-start, same-source re-reports survives.
    // Ordering by ring size instead (BSA.F96) left out the closed edges inside the arc and renumbered 16 digests.
    const arcs = new Map(partitionEvents.map(params => [params, partitionArc(layer, params)] as const));
    const arcOf = (params: BisectionParams) => arcs.get(params)!;
    // NO ACCEPTED-PARENT FILTER (skeleton edge-acceptance spec, decision 7). Acceptance changes only at step
    // boundaries, and at the last one every parent of every birth of this layer was named by a then-live bisector,
    // so no partition event here can name an accepted edge. A silently refused birth is how early acceptance broke
    // rings; `addBisectionEdge`'s throw is the one guard left, so such a birth would be a step failure.
    const sorted = partitionEvents
        .toSorted((params1, params2) => {
            const arcDelta = arcOf(params1) - arcOf(params2);
            if (arcDelta !== 0) {
                return arcDelta;
            }

            return params1.clockwiseExteriorEdgeIndex - params2.clockwiseExteriorEdgeIndex;
        });

    // Same-start events are nested re-reports of ONE split only when they share the split node:
    // each re-report widens the widdershins claim past a parent it cannot see, so the smallest
    // span is the tightest claim and wins. Same-start events from DIFFERENT split nodes are
    // distinct simultaneous splits of that exterior edge — two reflex bisectors splitting it at
    // different points in one layer — and every one of them partitions the polygon, so all
    // survive. Which child each survivor's bisector lands in is no longer a question of spans: the
    // child steps below are the rings the layer left.
    //
    // AND A RE-REPORT IS DROPPED ONLY WHERE THE LINKS AGREE IT IS ONE (BSA.F97 finding 1, BSA.D293). Two
    // splits sited at one point share their node, so their bisectors on the struck edge's far side share a
    // start and a source and look like a re-report; they are two splits, and dropping either leaves its two
    // neighbours with parents that do not meet. `droppableBirths` keeps any such candidate. Every drop the
    // rosters make goes with a whole ring of dropped births, and is kept as it was.
    const keptSourcesByStart = new Map<number, Set<number>>();
    const duplicates = new Set<BisectionParams>();
    for (const partitionEvent of sorted) {
        const start = partitionEvent.clockwiseExteriorEdgeIndex;
        let sources = keptSourcesByStart.get(start);
        if (sources === undefined) {
            sources = new Set();
            keptSourcesByStart.set(start, sources);
        }
        if (sources.has(partitionEvent.source)) {
            duplicates.add(partitionEvent);
            continue;
        }

        sources.add(partitionEvent.source);
    }
    if (duplicates.size === 0) {
        return sorted;
    }
    const droppable = droppableBirths(layer, [...duplicates]);
    return sorted.filter(partitionEvent => !duplicates.has(partitionEvent) || !droppable.has(partitionEvent));
}

/**
 * Every event the step's bisectors can resolve, instigator by instigator in `interiorEdges`' order: each bisector against
 * every other, and a primary reflex bisector against `exteriorParents` too. A phantom or out-of-bounds event is priced
 * and dropped here, so the layer sees resolvable events only.
 */
export function createCollisions(interiorEdges: number[], exteriorParents: number[], context: StraightSkeletonSolverContext): ResolvableEvent[] {
    return interiorEdges.flatMap(e1 => {
        const list: CollisionEvent[] = [];
        const edgeData = context.getInteriorWithId(e1)
        const checkExteriorCollisions = context.isReflexEdge(edgeData) && context.edgeRank(edgeData.id) === 'primary'
        list.push(...interiorEdges.flatMap(e2 => findOrComputeCollision(e1, e2, context)));

        if (checkExteriorCollisions) {
            list.push(...exteriorParents.flatMap(e2 => findOrComputeCollision(e1, e2, context)))
        }

        return list.filter((event): event is ResolvableEvent => event.eventType === 'interiorPair'
            || event.eventType === 'interiorNonAdjacent' || event.eventType === 'interiorAgainstExterior');
    });
}

/**
 * WHERE A MERGE RESOLVED WHOLE LIES: on one ring, or (a merge across rings, on a step of several rings) as one run on
 * each of two rings, its {@link CrossRingRuns}.
 */
type MergePlacement = {kind: 'ring'; ring: number[]} | {kind: 'cross'; runs: CrossRingRuns};

/**
 * One merge of a layer resolved whole: the merge, where it lies, and, on a step of several rings, its third-front
 * meeting where it has one ({@link withThirdFronts}).
 */
interface WholeMerge {
    merge: CoincidentMerge;
    placement: MergePlacement;
    thirdFront?: ThirdFront;
}

/** A layer's events resolved as WHOLE vertex events: its merges in canonical order. */
interface WholeEvents {
    merges: WholeMerge[];
}

/*
 * WHAT A STEP OF SEVERAL RINGS STILL REFUSES (skeleton simultaneous-rings spec, decisions 20 to 23): why this layer's
 * final event set cannot be resolved, as a refused {@link Verdict}, or `PASSED` when it can. Asked once the set is final
 * and before its first event is resolved, so a refused layer changes no link, node or acceptance, and only on a step of
 * more than one ring (decision 1). The events are the layer's own, chosen by `HELD_SIMULTANEITY_WINDOW`, the narrowing to the earliest
 * moment and the clustering at δ: no window or tolerance is added here. Two refusals, one for each way the layer is
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
function wholeLayerRefusal(resolution: WholeEvents): Verdict<void> {
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
function pairwiseLayerRefusal(
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
interface ThirdFront {
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
function withThirdFronts(
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
function bisectionsOfWholeMerge(
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
            return bisectionsForMerge(placement.ring, {position: merge.position, edgeIds: arrivals}, nodeId, context, layer);
        case 'cross':
            return bisectionsForCrossRingMerge(placement.runs, nodeId, context, layer);
    }
}

/**
 * THE ORDER OF A LAYER'S CHILD STEPS (skeleton wavefront-order spec, decision 13; join-and-divide spec, decision 17),
 * because child order numbers what later steps create. Each group of bisectors is one child, listing its members in the
 * order they were gathered (`outgoing`); children are ordered by their claim, the earliest partition event whose
 * bisector the child holds, then by the position of their first member. A group is a ring on a step of one ring and a
 * component on a step of several.
 */
function orderChildren(
    groups: readonly number[][],
    outgoing: readonly number[],
    partitionBirths: readonly number[],
): AlgorithmStepInput[] {
    const position = new Map(outgoing.map((id, index) => [id, index]));
    const partitionIndex = new Map(partitionBirths.map((id, index) => [id, index] as const));
    return groups
        .map(group => {
            const members = group.toSorted((a, b) => position.get(a)! - position.get(b)!);
            return {members, claim: Math.min(...members.map(id => partitionIndex.get(id) ?? Infinity))};
        })
        .toSorted((a, b) => a.claim !== b.claim
            ? a.claim - b.claim
            : position.get(a.members[0])! - position.get(b.members[0])!)
        .map(child => ({interiorEdges: child.members}));
}

/**
 * THE CHILD STEPS OF A STEP OF SEVERAL RINGS: ITS COMPONENTS (decisions 10 to 17). `rings` are the rings the layer left
 * over the step's outgoing bisectors (`outgoing`, in the order they were gathered), less any closed flat; they are
 * classified and grouped by {@link componentsOfRings} at `layerTime`, and each component — an outer ring and the inner
 * rings inside it — is one child, in the order {@link orderChildren} gives.
 */
function componentsAsChildren(
    context: StraightSkeletonSolverContext,
    rings: number[][],
    outgoing: number[],
    partitionBirths: number[],
    layerTime: number,
    born: ReadonlySet<number>,
): AlgorithmStepInput[] {
    const components = componentsOfRings(context, rings, layerTime, born);
    return orderChildren(components.map(component => [component.outer, ...component.inner].flat()), outgoing,
        partitionBirths);
}


export function handleInteriorNGon(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepInput[] {
    if (input.interiorEdges.length < 3) {
        throw new Error("Greater than 3 edges required for generic step handling.")
    }

    // THE LAYER'S LINK STATE (skeleton wavefront-order spec), owned by this call and dying with it: the events below
    // link the bisectors they bear as pending births in it, which are replaced by their ids as they are created at the
    // foot of this function, and the layer is settled there.
    const layer = new LayerLinks(context);

    // THE STEP'S RINGS ARE THE LINKS' RINGS, ALWAYS (skeleton join-and-divide spec, decision 1), read at the layer's
    // start. A step of one ring is every step of a single-loop solve and is handled exactly as before; a step of
    // several rings — an outline and the holes inside it — resolves a vertex event across two rings whole
    // (simultaneous-rings spec, decisions 3 to 8), refuses by name what it does not settle (decisions 20 to 22), and
    // leaves its components as children (join-and-divide spec, decisions 10 to 17; simultaneous-rings decision 12).
    const rings = ringsOfWavefront(context, input.interiorEdges);
    const multiRing = rings.length > 1;

    // DECISION 7: the step's exterior parents as today, duplicates included. An edge bounding two segments of one
    // step is listed twice, and its two reports of one split are one event: the first resolved retires the
    // instigator.
    const exteriorParents = context.exteriorParentsOfSubPolygon(input.interiorEdges);


    // Generate all currently valid collision events
    const collisions = createCollisions(input.interiorEdges, exteriorParents, context)

    // W-spec W24: the layer window, on arrivals. `bestArrival` is the earliest by the same
    // comparator, and the window is compared against it, ANCHORED on the earliest arrival (journal
    // decision 155) and stated per pair (C8 spec T13). Census S22: the window is HELD at 1e-8
    // (`HELD_SIMULTANEITY_WINDOW`) — its move to the solve's `simultaneityWindow` (δ, T12) hit T37's
    // STOPs, measured by toggle; see the constant. At unit weights every product is by `1.0` and this
    // is `fp_compare(offset, bestOffset, 1e-8) <= 0` on an offset-ascending list.
    //
    // REGISTER C12 MEASURED THE PER-PAIR FORM HERE WITH THE COMPLETE ERROR MODEL (journal-5 decision 167)
    // AND IT STOPPED — see "THE WINDOW AND THE BOX" in constants.ts. Two readings of "every arrival within
    // the per-pair window of the earliest" were measured. FILTERING the whole list admits a later arrival
    // with a wide budget while refusing an earlier one of the SAME EDGE with a narrow budget: on `Off-edge
    // Jitter Plus (seed 7919)` the ring [22, 25, 26, 43, 45] took 26 × 43 (4.07e-11 after the earliest,
    // budget 2.79e-11) into the layer with 25 × 45 (budget 1.52e-11) and left 22 × 43 (2.29e-11 after it,
    // budget 2.2e-15) out, and a direction violation appeared. The PREFIX form — this loop's own shape,
    // cut at the first refusal — removes that, but still resolves a wide-budget arrival with the earliest
    // while a narrow-budget arrival of the same edges, unorderable against it, is left out: `Off-edge Jitter
    // Plus`, k = 9, seed 23757 took 164 × 229 (8.6e-11 after a split, budget 9.5e-10) with the split and
    // left 164 × 237 (2.8e-12 later still, budget 1.1e-11), and its strips came out 1.1% short.
    const collisionsToHandle: ResolvableEvent[] = [];
    let bestArrival: Arrival | undefined;
    const flattenedCollisions = collisions.toSorted(byArrival);

    for (const flattenedCollision of flattenedCollisions) {
        if (bestArrival === undefined || compareArrivals(flattenedCollision.arrival, bestArrival, 0) < 0) {
            bestArrival = flattenedCollision.arrival;
        }
        if (compareArrivals(flattenedCollision.arrival, bestArrival, HELD_SIMULTANEITY_WINDOW) <= 0){
            collisionsToHandle.push(flattenedCollision)
        }
        else
        {
            break;
        }

    }

    if (collisions.length === 0 && multiRing) {
        // DECISION 23: a step of several rings with no event never climbs the terminal ladder. Its closures and its
        // coaxial completion are statements about one live set, and would pair bisectors of different rings.
        refuseStep(context, 'multi-ring-step-refused', `a step of ${rings.length} rings `
            + `(${rings.map(ring => formatRing(ring)).join(', ')}) produced no event.`);
    }

    if (collisions.length === 0) {
        // THE TERMINAL LADDER (journal decision 145), the same one the pair and the triangle climb:
        // an n-gon whose live edges produce no event is a generalisation of the triangle that does,
        // and it was refused the same handling only because the terminal cases were first
        // characterised too simply. The throw below stands ONLY where no rung applies and no
        // candidate pair exists.
        const rung = climbTerminalLadder(context, input.interiorEdges);
        if (rung === undefined) {
            throw new Error("Unable to generate any collisions from graph context. Skeleton remains incomplete.");
        }
        if (rung.rung === 'closure') {
            // No acceptance here: exterior edges are accepted at the step boundary only (skeleton edge-acceptance
            // spec, decision 6).
            applyDegenerateClosure(context, input.interiorEdges, rung.position);
            settleLayerLinks(layer);
            return [];
        }
        // THE COMPLETION, IN THE N-GON'S OWN TERMS: the named pair's head-on event is priced as
        // `collideInteriorEdges` prices a head-on verdict and becomes the layer, so it is resolved by
        // exactly the machinery below — whole-event merge or pairwise fallback, bisections emitted
        // for the surviving arcs, children partitioned — as any found event would be.
        collisionsToHandle.push(priceHeadOnPair(
            context.getInteriorWithId(rung.completion.firstId),
            context.getInteriorWithId(rung.completion.secondId),
            context));
    }

    // Handle collisions
    const collapseEvents: BisectionParams[] = [];
    const partitionEvents: BisectionParams[] = [];

    const recordBisections = (bisectionList: BisectionParams[]) => {
        if (bisectionList.length > 1) {
            partitionEvents.push(...bisectionList)
        } else {
            collapseEvents.push(...bisectionList)
        }
    };

    // Every interior-to-interior collision at this offset that shares a collision point is one
    // vertex event, not several. Resolve each such event whole — terminate all its arrivals on
    // one node, then emit one bisector per surviving arc — before touching the next. Handling
    // the reported pairs individually is what leaves the ring inconsistent on symmetric input,
    // where a single point can absorb every edge at once.
    //
    // THE RINGS ARE THE WAVEFRONT'S, READ FROM ITS LINKS (skeleton wavefront-order spec, decision 20; skeleton
    // join-and-divide spec, decision 1), `rings` above. `ringsOfSubPolygon`, whose `null` once sent a layer to the
    // pairwise fallback, is deleted: it keyed a ring on a unique widdershins parent, which every joined ring breaks
    // (BSA.F91), and part A found it `null` on no layer of any roster (BSA.F95).

    /**
     * These events resolved as WHOLE vertex events, or `null` when they cannot be.
     *
     * A merge is resolvable as a whole if all its arrivals lie on one wavefront ring, or, ON A STEP OF SEVERAL RINGS,
     * if they are one run on each of two rings (simultaneous-rings spec, decisions 3 and 7): a vertex event across
     * rings, whose two bisectors `bisectionsForCrossRingMerge` bears. Any other merge across rings sends the layer to
     * the narrowing and, failing that, to `pairwiseLayerRefusal` (decision 21). And no two merges may claim the same edge —
     * a bisector arrives somewhere once, so an edge in two merges means the first merge resolved would consume it and
     * strand the second. Deciding both for every merge before mutating anything keeps the answer all-or-nothing,
     * rather than leaving half a set resolved two different ways.
     *
     * On a step of one ring every merge lies on the one ring, every placement is `ring`, and the answer is today's
     * (decision 1).
     */
    const asWholeEvents = (events: CollisionEvent[]): WholeEvents | null => {
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
            const runs = multiRing ? crossRingRuns(rings, merge) : undefined;
            if (runs === undefined) {
                return null;
            }
            merges.push({merge, placement: {kind: 'cross', runs}});
        }
        return mergesShareAnEdge(candidates) ? null : {merges};
    };

    // WHEN THE WHOLE-EVENT RESOLUTION REFUSES THE LAYER, THE ANSWER IS A NARROWER LAYER — NOT A
    // PAIRWISE ONE. Journal decision 102: strict linear causality, the earliest arrival wins. That
    // ruling was applied to the ORDER events are read in and not to how many of them one step
    // CONSUMES, and the gap between those two is this defect. `collisionsToHandle` above is an
    // `fp_compare` window — an absolute 1e-8 on offsets of order 1e-1, some 1e8 ulps wide — and the
    // pairwise fallback used to resolve all of it, so arrivals a million ulps apart in the wavefront
    // clock were consumed as though they were simultaneous.
    //
    // WHAT THAT COST, MEASURED. Every refusal on this corpus is an edge claimed by two merges at
    // once, and every one of those is one wavefront closing at two points a few render floors apart
    // at offsets a few hundredths of an ulp-moment apart — a near-degenerate ring, not a
    // simultaneous event. Resolved whole, BOTH closures fire in one step and each emits its own
    // bisector into the corridor between them, where a ridge admits one; on `(seed 55433, k=4)` a
    // three-way arrival is paired two at a time and the leftover wires backwards (that fixture's
    // pinned direction violation, `wavefront-causality.test.ts`, and this narrowing's own
    // conviction). Narrowed to the earliest moment, the earlier closure resolves alone and the later
    // one is RECOMPUTED next step against the wavefront the first one left, so the third arrival of
    // a three-way event terminates on the node the first two built.
    //
    // ONLY WHERE THE WHOLE-EVENT RESOLUTION HAS ALREADY REFUSED, and that restraint is load-bearing:
    // narrowing unconditionally breaks the k-way hubs this file's clustering exists for — the
    // reciprocal reports of one 48-way convergence are not within the ulp bar of each other — and
    // was measured at over thirty failures across ten suites, F27's finding restated.
    //
    // The two nodes still exist and are still a few floors apart. That separation is real structure
    // (journal decision 92 / F26a) and contracting it is downstream's business, not the solver's.
    let eventsToResolve = collisionsToHandle;
    let resolution = asWholeEvents(eventsToResolve);
    if (resolution === null) {
        eventsToResolve = earliestArrivalMoment(collisionsToHandle);
        resolution = asWholeEvents(eventsToResolve);
    }

    // WHAT STAYS REFUSED, ONCE THE LAYER'S EVENT SET IS FINAL AND BEFORE ITS FIRST EVENT IS RESOLVED (simultaneous-
    // rings spec, decisions 20 to 22), so a refused layer changes no link, node or acceptance. Asked only on a step of
    // several rings (decision 1): on one ring every merge lies on the ring and nothing here can fire. A layer resolved
    // whole reads its third-front meetings here, so a meeting that stays refused is refused before anything changes
    // (flat-ring and third-front spec, decisions 30 and 43).
    if (multiRing && resolution !== null) {
        resolution = withThirdFronts(context, resolution, eventsToResolve);
    }
    if (multiRing) {
        const verdict = resolution !== null
            ? wholeLayerRefusal(resolution)
            : pairwiseLayerRefusal(context, rings, eventsToResolve);
        if (!verdict.ok) {
            refuseStep(context, 'simultaneous-across-rings', `rings `
                + `${rings.map(ring => formatRing(ring)).join(', ')}: ${verdict.reason} Events of different rings `
                + `coincide in this layer in a form the simultaneous-rings spec refuses by name.`);
        }
    }

    // THE PAIRWISE FALLBACK IS A PAIRING RULE. Each event here consumes its two edges, so whichever
    // reported pair is handled first is the pair the ring collapses on and every rival report of
    // those edges returns empty. That makes arrival order load-bearing, not cosmetic. It now only
    // ever sees ONE arrival moment, so the pairing it decides is between arrivals no offset separates.
    // Within it, a meeting nearer along a bisector both events lie on goes first (BSA.D335), and the
    // tie-break decides only what that leaves unordered: priority, then place (`inPlaceOrder`, BSA.D335
    // stage 2), and the edge ids only between events that meet at one point.
    if (resolution === null) {
        const byPlace = inPlaceOrder(eventsToResolve, context.perceptualFloor);
        const byPriorityThenPlace = (e1: CollisionEvent, e2: CollisionEvent) => {
            const priority = comparePriority(e1, e2);
            if (priority !== 0) {
                return priority;
            }
            return byPlace(e1, e2) || compareEdgeIdLists(e1.collidingEdges, e2.collidingEdges);
        };
        inArrivalOrder(eventsToResolve, byPriorityThenPlace, nearerAlongSharedBisector(eventsToResolve, context))
            .map(event => handleCollisionEvent(event, context, layer))
            .forEach(recordBisections)
    } else {
        // NO CONCURRENCY GATE HERE, AND THE MEASUREMENT IS WHY. The tolerance audit's placed-node
        // spec would resolve an arrival set to one node only where its PARENT set is concurrent —
        // full rank and residual under a bar — and refuse loudly otherwise, because a least-squares
        // node over a non-concurrent parent set is on none of the pairwise bisector loci (F32/F39).
        // Swept over the 346 merges this branch actually resolves across the corpus: 253 carry three
        // distinct oriented normals, 88 carry four, four are the high-degree hubs (10/16/32/48), and
        // the worst concurrency residual anywhere is 5.56e-12 — three orders inside `EQUIDISTANCE_BAR`,
        // with 344 of the 346 at machine zero. Exactly ONE set is rank-deficient: a two-arrival
        // head-on corridor closure on `(seed 7919)` whose position comes from the collision itself
        // and whose residual is 2.8e-17, which is the case a rank test would have refused wrongly.
        //
        // The pairs the audit measured as rank-2 — the 29/30 class — never reach this branch as one
        // set at all: the narrowing above separates them into two arrival moments, so they resolve
        // as two nodes joined by one ridge, which is what the rank-2 ruling prescribes, reached by
        // causality instead of by a rank predicate. The gate is therefore unbuilt because the corpus
        // offers nothing to convict it on, in the manner of journal decision 107(b).
        resolution.merges.forEach(whole => {
            const {merge, thirdFront} = whole;
            const arrivals = merge.edgeIds.filter(edgeId => !context.isAccepted(edgeId));
            if (arrivals.length < 2) {
                return;
            }

            // The merge's node carries the largest position budget among the events it gathers (journal-5
            // decision 167): its position is one of theirs (the medoid), and it answers for all of them.
            const positionUncertainty = Math.max(0, ...eventsToResolve
                .filter(event => merge.edgeIds.includes(event.collidingEdges[0])
                    && merge.edgeIds.includes(event.collidingEdges[1]))
                .map(event => event.positionUncertainty));
            const node = context.terminateEdgesAtPoint(arrivals, merge.position, positionUncertainty);
            context.acceptAll(arrivals);
            // A VERTEX EVENT ACROSS TWO RINGS bears the two bisectors of its two runs' cycle, and a merge on a third front
            // the wall's cut in place of its facing gap ({@link bisectionsOfWholeMerge}). A merge across rings had its
            // runs read at the layer's start, and merges are resolved first and share no edge, so every arrival is
            // still unaccepted here (simultaneous-rings decision 16). A third front's splits are void below, their
            // instigators consumed here.
            const bisections = bisectionsOfWholeMerge(whole, arrivals, node.id, context, layer);
            if (thirdFront?.resolution.ok === true) {
                context.probe?.thirdFrontResolved?.(context, merge.edgeIds, thirdFront.resolution.value.segment.exteriorEdge);
            }
            // The arrivals leave the wavefront, once each gap has been linked from them.
            retireBisectors(context, arrivals);
            // AND IT CARRIES WHERE IT WAS PUT (journal-5 decision 170): the medoid siting is decision 157's
            // release, and its cost downstream is each emitted bisector's equi-time residual at the node.
            // The node's budget is the larger of the members' pricing budget above and the largest residual
            // over the bisectors it emits — {@link chargeSitingResidual}.
            chargeSitingResidual(node.id, bisections, context);
            recordBisections(bisections)
        })

        // Splits of one layer landing on one point are ONE vertex event, and this is where they are
        // told so. `handleCollisionEvent` places a node at whatever position it is handed, so two
        // simultaneous splits a fraction of the render floor apart used to build two nodes joined by
        // a degenerate pair of bisectors. Only the POSITION is resolved here; each split still emits
        // its own bisections, and `findOrAddNode` does the joining.
        //
        // THE SPLITS ARE SITED IN EDGE-ID ORDER, so events an offset cannot separate are still resolved in an order
        // that is a function of the events themselves. Each one CREATES A NODE, so an order the offsets decide makes
        // node identity turn on an ulp: `Golf Cart`'s two simultaneous splits of its top edge (journal F12) swapped ids
        // under a translation of 1e3, the defect decision 65 records for the ellipses' mirror pair. Edge ids are
        // integers from the polygon's own vertex order and carry no arithmetic. Every event here is a split, of one
        // priority, so priority decides nothing among them.
        const splitEvents = eventsToResolve
            .filter(event => event.eventType === 'interiorAgainstExterior')
            .toSorted(byEdgeIds);
        const splitPositions = coincidentEventPositions(splitEvents, context.perceptualFloor);

        // A RE-POINTED SPLIT PAYS FOR THE MOVE, AS A MERGE DOES (journal-5 decision 171(c)). Its node is
        // sited at the group's medoid, not at its own meeting, so the bisectors it emits inherit that
        // node's residual on their parents' clocks — {@link chargeSitingResidual}, the merge's term. Only
        // an event actually moved is charged: at its own point a split's residual is its own pricing's
        // rounding, which its position budget already answers for, and the medoid member is not moved.
        splitEvents.forEach((event, index) => {
            const sited = splitPositions[index];
            const bisections = handleCollisionEvent({...event, position: sited}, context, layer);
            if (bisections.length > 0 && (sited.x !== event.position.x || sited.y !== event.position.y)) {
                chargeSitingResidual(bisections[0].source, bisections, context);
            }
            recordBisections(bisections);
        });
    }

    // NO ACCEPTANCE HERE (skeleton edge-acceptance spec, decision 5): exterior edges are accepted at the step
    // boundary only, where nothing is pending. Under that rule no reader in this step can observe an acceptance
    // made here: every parent of every birth below was named by a then-live bisector at the last boundary, and every
    // other in-step reader asks only of edges its own live bisectors name. The edge is accepted at the next boundary.

    // A RING MADE ONLY OF THIS LAYER'S BIRTHS, ALL AT ONE NODE, CLOSES THERE AND NONE OF IT IS BORN (decision 32):
    // it has no extent. It is the residue of a vertex event resolved pairwise, two births with each other's parents
    // at the node where their shared face has just closed. Read from the links and the source node alone.
    const closedAtOneNode = birthsClosedAtOneNode(layer);
    const unborn = (params: BisectionParams) => !closedAtOneNode.has(params);

    // Collapse/partition into child
    const finalPartitionEvents = selectPartitionEvents(layer, partitionEvents.filter(unborn));

    const allOutgoingInteriorEdges = [...input.interiorEdges.filter(e => !context.isAccepted(e))]

    // Each bisector is linked where its event left its pending birth, the moment it has an id.
    const bear = (params: BisectionParams): number => {
        const id = bisectWithParams(context, params);
        linkBirth(layer, params, id);
        return id;
    };

    // NO ACCEPTED-PARENT FILTER ON EITHER KIND OF BIRTH (decision 7). None can fire under the boundary rule, and a
    // silently refused birth is how early acceptance broke rings: `addBisectionEdge`'s throw is the one guard left,
    // so a birth with a finished parent becomes a step failure.
    // Indexed as `finalPartitionEvents`: the bisector each partition event bore.
    const partitionBirths = finalPartitionEvents.map(bear);
    allOutgoingInteriorEdges.push(...partitionBirths)

    allOutgoingInteriorEdges.push(...collapseEvents.filter(unborn).map(bear))

    // Every pending birth that was never born — a re-report the dedupe dropped, or a ring closed at one node — is
    // spliced out of its ring (skeleton wavefront-order spec).
    settleLayerLinks(layer);

    if (multiRing) {
        // A STEP OF SEVERAL RINGS LEAVES ITS COMPONENTS (join-and-divide spec, decisions 10 to 17), whatever its
        // layer did: a join leaves one ring where there were two, a divide two outer rings, and a layer of both
        // whatever its rings make, by the one rule. The rings are classified at the time of the layer's earliest
        // arrival, a bisector born in it standing at its source node.
        const layerTime = timeOf(eventsToResolve.reduce((earliest, event) =>
            compareArrivals(event.arrival, earliest.arrival, 0) < 0 ? event : earliest).arrival);
        const stepMembers = new Set(input.interiorEdges);
        const born = new Set(allOutgoingInteriorEdges.filter(id => !stepMembers.has(id)));
        // A FLAT RING IS A FINISHED PIECE OF SKELETON, closed here and never classified (flat-ring and third-front spec,
        // decisions 7 to 10 and 27); every other ring the layer left goes to its component unchanged. The rings are read
        // once: closing a flat ring writes no link outside it, and each ring it closes is one of these, whole.
        const left = ringsAmong(context, allOutgoingInteriorEdges);
        const closed = closeFlatRings(context, left, layerTime, born);
        return componentsAsChildren(context, left.filter(ring => !closed.has(ring[0])),
            allOutgoingInteriorEdges.filter(id => !closed.has(id)), partitionBirths, layerTime, born);
    }

    if (finalPartitionEvents.length === 0) {
        return [{interiorEdges: allOutgoingInteriorEdges}];
    }

    // THE CHILD STEPS ARE THE RINGS THE LAYER LEFT (skeleton wavefront-order spec, decision 19). This replaced
    // an assignment of each bisector to the first id interval holding both its parents, which presumed every
    // ring is an interval of ids: on the stage-off along-edge cells it shattered a true ring into one-edge
    // children (BSA.F95), and a ring joined from two loops is no interval at all (BSA.F91).
    //
    // IN TODAY'S ORDER (decision 13), {@link orderChildren}'s. Part A measured that every child of every partitioning
    // layer of the corpus, the sweep and the census that completed was exactly one ring.
    return orderChildren(ringsAmong(context, allOutgoingInteriorEdges), allOutgoingInteriorEdges, partitionBirths);
}
