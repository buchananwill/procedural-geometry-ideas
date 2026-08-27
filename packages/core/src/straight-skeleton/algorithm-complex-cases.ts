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
import {bisectionsForMerge, clusterCoincidentMerges, mergesShareAnEdge, ringsOfSubPolygon} from "./coincident-events";

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

    // Priority first, then the colliding edge ids, so a layer is processed in an order that is a
    // function of the events themselves. `toSorted` is stable, so priority alone left equal-priority
    // events in the order the offset sort delivered them — and offsets that are equal in exact
    // arithmetic differ by an ulp once the input is placed elsewhere in the plane. Each event
    // handled here CREATES A NODE, so that made node identity turn on an ulp: `Golf Cart`'s two
    // simultaneous splits of its top edge (journal F12) swapped ids under a translation of 1e3,
    // the same defect decision 65 records for the ellipses' mirror pair. Edge ids are integers
    // taken from the polygon's own vertex order and carry no arithmetic at all.
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
    const merges = rings === null ? [] : clusterCoincidentMerges(
        collisionsToHandle.filter(event => event.eventType === 'interiorPair' || event.eventType === 'interiorNonAdjacent'),
    );

    // A merge is only resolvable as a whole if all its arrivals lie on one wavefront ring.
    // Deciding that for every merge before mutating anything keeps the fallback all-or-nothing,
    // rather than leaving half a layer resolved two different ways.
    const ringOfMerge = rings === null ? null : merges.map(merge =>
        rings.find(ring => merge.edgeIds.every(edgeId => ring.includes(edgeId))));

    if (rings === null || ringOfMerge === null || ringOfMerge.some(ring => ring === undefined)
        || mergesShareAnEdge(merges)) {
        collisionsToHandle
            .toSorted(byEventPriority)
            .map(event => handleCollisionEvent(event, context))
            .forEach(recordBisections)
    } else {
        merges.forEach((merge, index) => {
            const arrivals = merge.edgeIds.filter(edgeId => !context.isAccepted(edgeId));
            if (arrivals.length < 2) {
                return;
            }

            const node = context.terminateEdgesAtPoint(arrivals, merge.position);
            context.acceptAll(arrivals);
            recordBisections(bisectionsForMerge(ringOfMerge[index]!, {position: merge.position, edgeIds: arrivals}, node.id, context))
        })

        collisionsToHandle
            .filter(event => event.eventType === 'interiorAgainstExterior')
            .toSorted(byEventPriority)
            .map(event => handleCollisionEvent(event, context))
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
