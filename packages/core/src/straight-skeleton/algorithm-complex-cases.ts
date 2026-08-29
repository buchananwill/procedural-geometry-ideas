import {
    AlgorithmStepInput,
    AlgorithmStepOutput, BisectionParams, CollisionEvent, CollisionTypePriority,
    StraightSkeletonSolverContext
} from "./types";
import {findOrComputeCollision} from "./collision-helpers";
import {areEqual, fp_compare} from "./core-functions";
import handleCollisionEvent from "./collision-handling";
import {
    bisectWithParams,
    tryToAcceptExteriorEdge
} from "./algorithm-helpers";
import {
    bisectionsForMerge,
    clusterCoincidentMerges,
    coincidentEventPositions,
    mergesShareAnEdge,
    ringsOfSubPolygon
} from "./coincident-events";

/**
 * Lexicographic over two edge-id lists, a shorter prefix first.
 *
 * The canonical tie-break for events that a floating-point offset cannot separate. `collidingEdges`
 * identifies an event by the edges taking part in it, which is a property of the polygon's own
 * topology, so two distinct events at one offset are ordered by something no placement can move.
 */
function compareEdgeIdLists(first: number[], second: number[]): number {
    for (let index = 0; index < Math.min(first.length, second.length); index++) {
        if (first[index] !== second[index]) {
            return first[index] - second[index];
        }
    }
    return first.length - second.length;
}

/**
 * Ulps of the larger offset within which two arrivals are ONE moment of the wavefront clock.
 *
 * A REPRESENTATION BAR, NOT A GEOMETRIC TOLERANCE. Its only job is to stop the arithmetic's own
 * rounding from being read as causal order: two arrivals that are equal in exact arithmetic are
 * computed through different intersections and land a few ulps apart, and the two reciprocal reports
 * of ONE arrival ({@link createCollisions} reports every pair from both directions) agree to within
 * an ulp. Anything wider would be a claim about geometry, and every such claim in this package
 * belongs to a constant with a measurement behind it.
 *
 * SIXTY-FOUR, with the corpus's two live populations on either side of it. On
 * `OFF_EDGE_JITTER_L_SEED_55433`'s collapsing 4-ring the four candidate pairings arrive 2.52e-11 to
 * 7.07e-11 apart on offsets of 2.93e-1 — between 3.9e5 and 1.1e6 ulps, four orders above this bar.
 * The rounding noise it exists to absorb sits at one to a few ulps, six orders below it. Both
 * populations are asserted as ratios in `arrival-ordering.test.ts`.
 */
const SIMULTANEOUS_ARRIVAL_ULPS = 64;

/**
 * Order one layer's events by ARRIVAL, breaking exact simultaneity with `tieBreak`.
 *
 * STRICT LINEAR CAUSALITY IS THE SOLVER'S MODEL (journal decision 102): where two arrivals are
 * separated at all, the earlier one is resolved first, and the wavefront it terminates cannot be
 * consumed by an event that had not happened yet. The fallback below used to sort a whole layer by
 * priority and edge id alone, which threw the offsets away — and because each event here CONSUMES
 * its edges, that was a PAIRING rule, not a display order: on `(seed 55433)` a collapsing 4-ring
 * whose true pairing arrives 2.52e-11 ahead of its rival was paired by edge id instead, so the arm
 * tip closed on the wrong two of its four walls and left its surviving ridge between the wrong
 * parents. What that cost downstream is the fold population — 24 region-boundary folds across three
 * fixtures before this ordering, 4 on one fixture after it, with both reflex Ls leaving it outright
 * (`region-boundary-folds.test.ts`) — and six of the plus's ten failing near-floor jitter cells.
 *
 * IT DOES NOT CURE THE DUPLICATE RIDGE, and saying so is the point. Both pairings leave TWO
 * bisectors spanning that ridge, so I5's count on this fixture is unmoved; the two collapse nodes
 * are 3.9e-6 apart in unit space and should not both exist, which is journal decision 101's
 * tolerance defect and not this one. Pairing decides which walls the ridge belongs to; it cannot
 * decide whether the ridge should have been a point.
 *
 * EXPORTED FOR ITS OWN TEST, not for other callers — see `arrival-ordering.test.ts`.
 *
 * THE TIE-BREAK KEEPS ITS PROPER SCOPE. Decision 65's lexicographic ordering exists so that events
 * a floating-point offset CANNOT separate are still resolved in an order no placement can move —
 * node identity must not turn on an ulp. That argument is about genuine simultaneity, so it applies
 * within {@link SIMULTANEOUS_ARRIVAL_ULPS} and nowhere else.
 *
 * MOMENTS BY SINGLE LINKAGE, over an already offset-ascending list, so the result is a total order
 * rather than a sort under a non-transitive "close enough" predicate. The same convention, and the
 * same accepted cost, as the coincidence clustering in `coincident-events.ts`.
 */
export function inArrivalOrder(
    events: CollisionEvent[],
    tieBreak: (first: CollisionEvent, second: CollisionEvent) => number,
): CollisionEvent[] {
    const byOffset = events.toSorted((e1, e2) => e1.offsetDistance - e2.offsetDistance);

    const moments: number[] = [];
    let moment = 0;
    for (let index = 0; index < byOffset.length; index++) {
        if (index > 0 && !areSimultaneousArrivals(byOffset[index - 1].offsetDistance, byOffset[index].offsetDistance)) {
            moment++;
        }
        moments.push(moment);
    }

    return byOffset
        .map((event, index) => ({event, moment: moments[index]}))
        .toSorted((a, b) => a.moment !== b.moment ? a.moment - b.moment : tieBreak(a.event, b.event))
        .map(entry => entry.event);
}

function areSimultaneousArrivals(first: number, second: number): boolean {
    const magnitude = Math.max(Math.abs(first), Math.abs(second));
    return Math.abs(first - second) <= SIMULTANEOUS_ARRIVAL_ULPS * Number.EPSILON * magnitude;
}

/**
 * The events of the EARLIEST arrival moment in `events` — the first single-linkage run of
 * {@link SIMULTANEOUS_ARRIVAL_ULPS} over the offset-ascending list, and nothing after it.
 *
 * THE MOMENT, NOT THE LAYER. `collisionsToHandle` is an `fp_compare` window on the best offset: an
 * ABSOLUTE 1e-8 on offsets of order 1e-1, so roughly 1e8 ulps wide. Everything inside it is resolved
 * in one step, and each interior event CONSUMES its edges — so a window that wide is a claim that
 * arrivals up to eight orders apart in the wavefront clock happened together. Journal decision 102
 * says the opposite: the pairing winner is the lower offset, always, and an event cannot consume a
 * wavefront that had not arrived yet. This narrows the window to the moment the ulp bar can actually
 * defend, and only where the whole-event resolution has already refused the layer.
 *
 * It is the same bar, the same single linkage and the same accepted chaining cost as
 * {@link inArrivalOrder}'s moment partition — this is that partition's first class, taken alone.
 */
function earliestArrivalMoment(events: CollisionEvent[]): CollisionEvent[] {
    const byOffset = events.toSorted((e1, e2) => e1.offsetDistance - e2.offsetDistance);

    for (let index = 1; index < byOffset.length; index++) {
        if (!areSimultaneousArrivals(byOffset[index - 1].offsetDistance, byOffset[index].offsetDistance)) {
            return byOffset.slice(0, index);
        }
    }
    return byOffset;
}

function sameInstigatorComparator(ev1: CollisionEvent, ev2: CollisionEvent) {
    if (ev1.collidingEdges[0] !== ev2.collidingEdges[0]) {
        throw new Error("Different instigators! Invalid comparison.")
    }
    return ev1.offsetDistance - ev2.offsetDistance;

}

export function createCollisions(interiorEdges: number[], exteriorParents: number[], context: StraightSkeletonSolverContext): CollisionEvent[][] {
    return interiorEdges.map(e1 => {
        const list: (CollisionEvent | null)[] = [];
        const edgeData = context.getInteriorWithId(e1)
        const checkExteriorCollisions = context.isReflexEdge(edgeData) && context.edgeRank(edgeData.id) === 'primary'
        list.push(...interiorEdges.flatMap(e2 => findOrComputeCollision(e1, e2, context)));

        if (checkExteriorCollisions) {
            list.push(...exteriorParents.flatMap(e2 => findOrComputeCollision(e1, e2, context)))
        }

        return list.filter((event): event is CollisionEvent => {
            return !!event && CollisionTypePriority[event.eventType] < 3;
        })
    })
        .filter(list => list.length > 0);
}

export function handleInteriorNGon(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length < 3) {
        throw new Error("Greater than 3 edges required for generic step handling.")
    }

    const result: AlgorithmStepOutput = {
        childSteps: []
    };


    const exteriorParents = context.exteriorParentsOfSubPolygon(input.interiorEdges);


    // Generate all currently valid collision events
    const collisionLists: CollisionEvent[][] = createCollisions(input.interiorEdges, exteriorParents, context)

    const collisionsToHandle: CollisionEvent[] = [];
    let bestOffset = Number.POSITIVE_INFINITY;
    const flattenedCollisions = collisionLists.flat()
        .toSorted((e1, e2) => {
            return e1.offsetDistance - e2.offsetDistance
        })

    for (const flattenedCollision of flattenedCollisions) {
        bestOffset = Math.min(bestOffset, flattenedCollision.offsetDistance)
        if (fp_compare(flattenedCollision.offsetDistance, bestOffset) <= 0){
            collisionsToHandle.push(flattenedCollision)
        }
        else
        {
            break;
        }

    }

    if (collisionLists.length === 0) {
        throw new Error("Unable to generate any collisions from graph context. Skeleton remains incomplete.");
    }

    // Handle collisions
    const collapseEvents: BisectionParams[] = [];
    let partitionEvents: BisectionParams[] = [];

    const recordBisections = (bisectionList: BisectionParams[]) => {
        if (bisectionList.length > 1) {
            partitionEvents.push(...bisectionList)
        } else {
            collapseEvents.push(...bisectionList)
        }
    };

    // THE TIE-BREAK FOR SIMULTANEOUS ARRIVALS, and only for those: priority, then the colliding edge
    // ids, so events an offset cannot separate are still resolved in an order that is a function of
    // the events themselves. `toSorted` is stable, so priority alone left equal-priority events in
    // the order the offset sort delivered them — and offsets that are equal in exact arithmetic
    // differ by an ulp once the input is placed elsewhere in the plane. Each event handled here
    // CREATES A NODE, so that made node identity turn on an ulp: `Golf Cart`'s two simultaneous
    // splits of its top edge (journal F12) swapped ids under a translation of 1e3, the same defect
    // decision 65 records for the ellipses' mirror pair. Edge ids are integers taken from the
    // polygon's own vertex order and carry no arithmetic at all.
    //
    // It is NOT a layer ordering. Passed to `inArrivalOrder`, it decides only within one moment of
    // the wavefront clock; separated arrivals are ordered by their offsets (decision 102).
    const byEventPriority = (e1: CollisionEvent, e2: CollisionEvent) => {
        const priority = CollisionTypePriority[e1.eventType] - CollisionTypePriority[e2.eventType];
        if (priority !== 0) {
            return priority;
        }
        return compareEdgeIdLists(e1.collidingEdges, e2.collidingEdges);
    };

    // Every interior-to-interior collision at this offset that shares a collision point is one
    // vertex event, not several. Resolve each such event whole — terminate all its arrivals on
    // one node, then emit one bisector per surviving arc — before touching the next. Handling
    // the reported pairs individually is what leaves the ring inconsistent on symmetric input,
    // where a single point can absorb every edge at once.
    const rings = ringsOfSubPolygon(input.interiorEdges, context);

    /**
     * These events resolved as WHOLE vertex events, or `null` when they cannot be.
     *
     * A merge is only resolvable as a whole if all its arrivals lie on one wavefront ring, and no
     * two merges may claim the same edge — a bisector arrives somewhere once, so an edge in two
     * merges means the first merge resolved would consume it and strand the second. Deciding both
     * for every merge before mutating anything keeps the answer all-or-nothing, rather than leaving
     * half a set resolved two different ways.
     */
    const asWholeEvents = (events: CollisionEvent[]) => {
        if (rings === null) {
            return null;
        }
        const candidates = clusterCoincidentMerges(
            events.filter(event => event.eventType === 'interiorPair' || event.eventType === 'interiorNonAdjacent'),
            context.perceptualFloor,
        );
        const ringOfMerge = candidates.map(merge =>
            rings.find(ring => merge.edgeIds.every(edgeId => ring.includes(edgeId))));

        if (ringOfMerge.some(ring => ring === undefined) || mergesShareAnEdge(candidates)) {
            return null;
        }
        return {merges: candidates, ringOfMerge: ringOfMerge as number[][]};
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

    // THE PAIRWISE FALLBACK IS A PAIRING RULE. Each event here consumes its two edges, so whichever
    // reported pair is handled first is the pair the ring collapses on and every rival report of
    // those edges returns empty. That makes arrival order load-bearing, not cosmetic. It now only
    // ever sees ONE arrival moment, so the pairing it decides is between arrivals no offset separates.
    if (resolution === null) {
        inArrivalOrder(eventsToResolve, byEventPriority)
            .map(event => handleCollisionEvent(event, context))
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
        resolution.merges.forEach((merge, index) => {
            const arrivals = merge.edgeIds.filter(edgeId => !context.isAccepted(edgeId));
            if (arrivals.length < 2) {
                return;
            }

            const node = context.terminateEdgesAtPoint(arrivals, merge.position);
            context.acceptAll(arrivals);
            recordBisections(bisectionsForMerge(resolution.ringOfMerge[index], {position: merge.position, edgeIds: arrivals}, node.id, context))
        })

        // Splits of one layer landing on one point are ONE vertex event, and this is where they are
        // told so. `handleCollisionEvent` places a node at whatever position it is handed, so two
        // simultaneous splits a fraction of the render floor apart used to build two nodes joined by
        // a degenerate pair of bisectors. Only the POSITION is resolved here; each split still emits
        // its own bisections, and `findOrAddNode` does the joining.
        const splitEvents = eventsToResolve
            .filter(event => event.eventType === 'interiorAgainstExterior')
            .toSorted(byEventPriority);
        const splitPositions = coincidentEventPositions(splitEvents, context.perceptualFloor);

        splitEvents
            .map((event, index) => handleCollisionEvent({...event, position: splitPositions[index]}, context))
            .forEach(recordBisections)
    }

    exteriorParents.forEach(e => tryToAcceptExteriorEdge(context, e))

    // Collapse/partition into child
    /* Clover Leaf Example:

    Partition Pair 1:  [[0,4], [4,0]]
    Partition Pair 2:  [[4,8], [8,4]]
    Partition Pair 3:  [[8,0], [0,8]]

    Outcome we want is: [[0,4], [4,8], [8,0]]

    Rule is: sort by span of bisection, then clockwise bisection.
    Span of bisection = (end - start + length) % length

     * */
    const partitionSpan = (params: BisectionParams) => {
        return (params.widdershinsExteriorEdgeIndex - params.clockwiseExteriorEdgeIndex + context.graph.numExteriorNodes) % context.graph.numExteriorNodes
    }
    partitionEvents = partitionEvents.filter(params => !context.isAccepted(params.widdershinsExteriorEdgeIndex) && !context.isAccepted(params.clockwiseExteriorEdgeIndex))
        .toSorted((params1, params2) => {
            const spanDelta = partitionSpan(params1) - partitionSpan(params2);
            if (spanDelta !== 0) {
                return spanDelta;
            }

            return params1.clockwiseExteriorEdgeIndex - params2.clockwiseExteriorEdgeIndex;
        });

    // Same-start events are nested re-reports of ONE split only when they share the split node:
    // each re-report widens the widdershins claim past a parent it cannot see, so the smallest
    // span is the tightest claim and wins. Same-start events from DIFFERENT split nodes are
    // distinct simultaneous splits of that exterior edge — two reflex bisectors splitting it at
    // different points in one layer — and every one of them partitions the polygon, so all
    // survive. A survivor's span may then nest inside a sibling's (the middle child of a double
    // split has no exact circular range, only a tightest one that covers an outer child whole),
    // which the span-ascending order above resolves: the assignment below gives an edge to the
    // FIRST child span containing both its parents, so the narrowest claim always wins.
    const keptSourcesByStart = new Map<number, Set<number>>();
    const finalPartitionEvents: BisectionParams[] = [];
    for (const partitionEvent of partitionEvents) {
        const start = partitionEvent.clockwiseExteriorEdgeIndex;
        let sources = keptSourcesByStart.get(start);
        if (sources === undefined) {
            sources = new Set();
            keptSourcesByStart.set(start, sources);
        }
        if (sources.has(partitionEvent.source)) {
            continue;
        }

        sources.add(partitionEvent.source);
        finalPartitionEvents.push(partitionEvent)
    }

    const allOutgoingInteriorEdges = [...input.interiorEdges.filter(e => !context.isAccepted(e))]

    allOutgoingInteriorEdges.push(...finalPartitionEvents
        .filter(params => !context.isAccepted(params.widdershinsExteriorEdgeIndex)
            && !context.isAccepted(params.clockwiseExteriorEdgeIndex))
        .map(params => {
            return bisectWithParams(context, params)
        }))

    // Both bounding parents must still be live. An accepted parent has no wavefront left to
    // bisect, and `clockwiseSpanExcludingAccepted` refuses to measure a span that touches one,
    // so admitting a half-accepted collapse throws instead of producing an edge.
    allOutgoingInteriorEdges.push(
        ...collapseEvents.filter(params => !context.isAccepted(params.widdershinsExteriorEdgeIndex)
            && !context.isAccepted(params.clockwiseExteriorEdgeIndex))
            .map(params => bisectWithParams(context, params))
    )

    if (finalPartitionEvents.length === 0) {
        result.childSteps.push({interiorEdges: allOutgoingInteriorEdges})

        return result;
    }

    result.childSteps = finalPartitionEvents.map(() => ({interiorEdges: []}))

    const N = context.graph.numExteriorNodes;
    for (const interiorEdge of allOutgoingInteriorEdges) {
        const { clockwise: cwParent, widdershins: wsParent } = context.parentEdges(interiorEdge);

        let success = false;

        for (let i = 0; i < finalPartitionEvents.length; i++) {
            const event = finalPartitionEvents[i];
            const cwInSpan = (cwParent.id - event.clockwiseExteriorEdgeIndex + N) % N;
            const wsInSpan = (wsParent.id - event.clockwiseExteriorEdgeIndex + N) % N;
            const spanSize = (event.widdershinsExteriorEdgeIndex - event.clockwiseExteriorEdgeIndex + N) % N;
            if (cwInSpan <= spanSize && wsInSpan <= spanSize) {
                const partitionSet = result.childSteps[i];
                partitionSet.interiorEdges.push(interiorEdge);
                success = true;
                break;
            }
        }

        if (!success) {
            throw new Error(`Unable to play interior edge ${interiorEdge} in any span: ${finalPartitionEvents.flatMap(e => [e.clockwiseExteriorEdgeIndex, e.widdershinsExteriorEdgeIndex])}`)
        }
    }

    return result;
}
