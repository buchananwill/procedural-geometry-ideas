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
    bisectionsForLayer,
    clusterCoincidentMerges,
    mergesShareAnEdge,
    ResolvedMerge,
    ringsOfSubPolygon
} from "./coincident-events";

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

    // Handle collisions. A bisection is a bisection: whether the event it came from collapsed a
    // stretch of ring or split the ring in two is not recorded here, because the sub-polygons are
    // read back off the resulting wavefront by connectivity rather than derived from the events.
    const bisections: BisectionParams[] = [];

    const recordBisections = (bisectionList: BisectionParams[]) => {
        bisections.push(...bisectionList);
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

    // `mergesShareAnEdge` was expected to become unnecessary once the layer was resolved as a
    // whole, and it did not. It is not a mask for the overlapping-arc defect — it detects an edge
    // arriving at two different points in one layer, which is a whole ridge collapsing at once,
    // and no per-ring reduction can express that: the edge terminates on one node, so the second
    // event's arrivals lose their partner. Removing it costs the reflex L k = 6..10 and
    // `stroke-derived-polygons`.
    if (rings === null || ringOfMerge === null || ringOfMerge.some(ring => ring === undefined)
        || mergesShareAnEdge(merges)) {
        collisionsToHandle
            .toSorted(byEventPriority)
            .map(event => handleCollisionEvent(event, context))
            .forEach(recordBisections)
    } else {
        // One event set per ring, not one per merge. Every merge on a ring removes edges from
        // it, so the arcs that survive the layer can only be read off the ring once every
        // arrival is known — see `bisectionsForLayer`.
        const resolvedByRing = new Map<number[], ResolvedMerge[]>();

        merges.forEach((merge, index) => {
            const arrivals = merge.edgeIds.filter(edgeId => !context.isAccepted(edgeId));
            if (arrivals.length < 2) {
                return;
            }

            const node = context.terminateEdgesAtPoint(arrivals, merge.position);
            context.acceptAll(arrivals);

            const ring = ringOfMerge[index]!;
            const resolved = resolvedByRing.get(ring);
            if (resolved === undefined) {
                resolvedByRing.set(ring, [{edgeIds: arrivals, nodeId: node.id}]);
            } else {
                resolved.push({edgeIds: arrivals, nodeId: node.id});
            }
        })

        resolvedByRing.forEach((resolved, ring) => recordBisections(bisectionsForLayer(ring, resolved, context)));

        collisionsToHandle
            .filter(event => event.eventType === 'interiorAgainstExterior')
            .toSorted(byEventPriority)
            .map(event => handleCollisionEvent(event, context))
            .forEach(recordBisections)
    }

    exteriorParents.forEach(e => tryToAcceptExteriorEdge(context, e))

    // Both bounding parents must still be live. An accepted parent has no wavefront left to
    // bisect, and `clockwiseSpanExcludingAccepted` refuses to measure a span that touches one,
    // so admitting a half-accepted bisection throws instead of producing an edge.
    const allOutgoingInteriorEdges = [
        ...input.interiorEdges.filter(e => !context.isAccepted(e)),
        ...bisections
            .filter(params => !context.isAccepted(params.widdershinsExteriorEdgeIndex)
                && !context.isAccepted(params.clockwiseExteriorEdgeIndex))
            .map(params => bisectWithParams(context, params)),
    ];

    // The sub-polygons are whatever closed wavefront rings the outgoing edges form. Deriving
    // them instead from the exterior-edge spans of the partitioning events cannot survive a
    // layer with several of them: the spans overlap, and the widest one silently swallows the
    // edges of the ones nested inside it. Connectivity is the ground truth — consecutive
    // interior edges share an exterior parent — so ask the edges themselves.
    const outgoingRings = ringsOfSubPolygon(allOutgoingInteriorEdges, context);

    result.childSteps = outgoingRings === null
        ? [{interiorEdges: allOutgoingInteriorEdges}]
        : outgoingRings.map(ring => ({interiorEdges: ring}));

    return result;
}
