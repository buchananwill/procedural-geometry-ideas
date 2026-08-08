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

    const byEventPriority = (e1: CollisionEvent, e2: CollisionEvent) =>
        CollisionTypePriority[e1.eventType] - CollisionTypePriority[e2.eventType];

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

    const partitionSpan = (params: BisectionParams) => {
        return (params.clockwiseExteriorEdgeIndex - params.widdershinsExteriorEdgeIndex + context.graph.numExteriorNodes) % context.graph.numExteriorNodes
    }
    // Collapse/partition into child
    // How do we resolve precedence/priority of conflicting partition splits? Take the smallest?
    /* Clover Leaf Example:

    Partition Pair 1:  [[0,4], [4,0]]
    Partition Pair 2:  [[4,8], [8,4]]
    Partition Pair 3:  [[8,0], [0,8]]

    Outcome we want is: [[0,4], [4,8], [8,0]]

    Rule is: sort by clockwise bisection first, then span of bisection.
    Span of bisection = (end - start + length) % length

     * */
    partitionEvents = partitionEvents.filter(params => !context.isAccepted(params.widdershinsExteriorEdgeIndex) && !context.isAccepted(params.clockwiseExteriorEdgeIndex))
        .toSorted((params1, params2) => {
            if (params1.clockwiseExteriorEdgeIndex !== params2.clockwiseExteriorEdgeIndex) {
                return params1.clockwiseExteriorEdgeIndex - params2.clockwiseExteriorEdgeIndex;
            }

            return partitionSpan(params1) - partitionSpan(params2);
        });

    let currentPartitionStart = -1;
    let currentPartitionEnd = -1;
    const finalPartitionEvents: BisectionParams[] = [];
    for (const partitionEvent of partitionEvents) {
        if (currentPartitionStart === partitionEvent.clockwiseExteriorEdgeIndex) {
            if (partitionEvent.widdershinsExteriorEdgeIndex < currentPartitionEnd) {
                throw new Error(`Partition sorting failure: start: ${currentPartitionStart}, end: ${currentPartitionEnd}, event end: ${partitionEvent.widdershinsExteriorEdgeIndex}`)
            }
            continue;
        }

        currentPartitionStart = partitionEvent.clockwiseExteriorEdgeIndex;
        currentPartitionEnd = partitionEvent.widdershinsExteriorEdgeIndex;

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
