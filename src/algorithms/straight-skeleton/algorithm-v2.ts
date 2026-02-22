import Heap from "heap-js";
import {
    CollisionEvent,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2,
} from "@/algorithms/straight-skeleton/types";
import {
    acceptEdge,
    createBisectionInteriorEdge, ensureBisectionIsInterior,
    makeRayProjection,
    makeStraightSkeletonSolverContext,
    tryToAcceptExteriorEdge,
    unitsToIntersection,
} from "@/algorithms/straight-skeleton/algorithm-helpers";
import {
    addNode,
    addVectors,
    fp_compare,
    makeBisectedBasis,
    positionsAreClose,
    scaleVector,
    subtractVectors,
} from "@/algorithms/straight-skeleton/core-functions";

// ---------------------------------------------------------------------------
// Exterior bound
// ---------------------------------------------------------------------------

/**
 * Compute the exterior edge segment length (Euclidean distance between endpoints).
 * Exterior edges have normalized basis vectors, so the distance along the ray
 * from source to target equals the Euclidean distance.
 */
function exteriorEdgeLength(edgeIndex: number, graph: StraightSkeletonGraph): number {
    const src = graph.nodes[graph.edges[edgeIndex].source].position;
    const tgt = graph.nodes[graph.edges[edgeIndex].target!].position;
    const d = subtractVectors(tgt, src);
    return Math.sqrt(d.x * d.x + d.y * d.y);
}

/**
 * For a given interior edge, compute the minimum positive distance along its ray
 * to any non-parent exterior edge segment. Returns +Infinity if no such
 * intersection exists within the polygon.
 */
export function computeExteriorBound(
    interiorEdgeId: number,
    context: StraightSkeletonSolverContext,
): number {
    const { graph } = context;
    const numExterior = graph.numExteriorNodes;
    const ie = graph.interiorEdges[interiorEdgeId - numExterior];
    const interiorRay = makeRayProjection(graph.edges[interiorEdgeId], graph);

    let minDist = Number.POSITIVE_INFINITY;

    for (let j = 0; j < numExterior; j++) {
        // Skip the two parent edges
        if (j === ie.clockwiseExteriorEdgeIndex || j === ie.widdershinsExteriorEdgeIndex) continue;

        const extRay = makeRayProjection(graph.edges[j], graph);
        const [distInterior, distExterior] = unitsToIntersection(interiorRay, extRay);

        // Must be forward along interior ray, and within the exterior segment
        const segLen = exteriorEdgeLength(j, graph);
        if (
            fp_compare(distInterior, 0) > 0 &&
            fp_compare(distExterior, 0) >= 0 &&
            fp_compare(distExterior, segLen) <= 0
        ) {
            if (distInterior < minDist) {
                minDist = distInterior;
            }
        }
    }

    return minDist;
}

// ---------------------------------------------------------------------------
// Event computation
// ---------------------------------------------------------------------------

/**
 * For a newly created interior edge, compute ALL valid intersection events
 * with other active interior edges and push each into the heap.
 *
 * Validity filters:
 *  - Both distances positive (forward along each ray)
 *  - Each distance within the respective edge's exterior bound
 *  - Parallel overlap uses fullSpan as priority (pseudo code rule 3.2)
 *  - "Open space" (one forward, one backward) discarded (rule 3.3.1)
 */
export function pushAllEventsForEdge(
    edgeId: number,
    context: StraightSkeletonSolverContext,
    exteriorBounds: Map<number, number>,
    heap: Heap<CollisionEvent>,
): void {
    const { graph, acceptedEdges } = context;

    const selfRay = makeRayProjection(graph.edges[edgeId], graph);

    for (let i = 0; i < graph.interiorEdges.length; i++) {
        const otherIe = graph.interiorEdges[i];
        if (otherIe.id === edgeId) continue;
        if (acceptedEdges[otherIe.id]) continue;

        const otherRay = makeRayProjection(graph.edges[otherIe.id], graph);
        const result = unitsToIntersection(selfRay, otherRay);

        const distanceSelf = result[0];
        const distanceOther = result[1];
        const fullSpan = result[2]; // defined only for parallel overlap (3-tuple)

        if (exteriorBounds.get(edgeId)! < distanceSelf || exteriorBounds.get(otherIe.id)! < distanceOther){
            continue;
        }

        if (fullSpan !== undefined) {
            // Parallel overlap case (rule 3.2):
            // eventDistance = fullSpan (the full distance between the two nodes)
            // The collision occurs at the midpoint (distanceSelf and distanceOther are half-distances)
            if (fp_compare(distanceSelf, 0) > 0 && fp_compare(distanceOther, 0) > 0) {
                heap.push({
                    participatingEdges: [edgeId, otherIe.id],
                    distances: [distanceSelf, distanceOther],
                    eventDistance: fullSpan,
                });
            }
            continue;
        }

        // Normal 2-tuple case

        // Discard "open space": one forward, one backward (rule 3.3.1)
        const selfForward = fp_compare(distanceSelf, 0) > 0;
        const otherForward = fp_compare(distanceOther, 0) > 0;

        if (selfForward !== otherForward) continue;

        // Both must be positive
        if (!selfForward) continue;

        const eventDistance = Math.max(distanceSelf, distanceOther);

        heap.push({
            participatingEdges: [edgeId, otherIe.id],
            distances: [distanceSelf, distanceOther],
            eventDistance,
        });
    }
}

// ---------------------------------------------------------------------------
// Event validation
// ---------------------------------------------------------------------------

/**
 * An event is valid if at least 2 of its participating edges are not yet accepted.
 */
export function isEventValid(
    event: CollisionEvent,
    acceptedEdges: boolean[],
): boolean {
    event.participatingEdges = event.participatingEdges.filter(edgeId => !acceptedEdges[edgeId])
    return event.participatingEdges.length >= 2;
}

// ---------------------------------------------------------------------------
// New edge direction
// ---------------------------------------------------------------------------

/**
 * Compute the basis vector for a new interior edge produced during collision.
 *
 * 1. Basis A = bisection of (clockwiseParent basis, -widdershinsParent basis) with reflex check
 * 2. Basis B = bisection of children's bases with roles swapped
 * 3. If dot(A, B) < 0, flip A
 */
export function computeApproximateCollisionDirection(
    clockwiseChildEdgeId: number,
    widdershinsChildEdgeId: number,
    graph: StraightSkeletonGraph,
): Vector2 {
    const widdershinsChildBasis = graph.edges[widdershinsChildEdgeId];
    const clockwiseChildBases = graph.edges[clockwiseChildEdgeId];
    const childBisection = makeBisectedBasis(widdershinsChildBasis.basisVector, clockwiseChildBases.basisVector);

    ensureBisectionIsInterior(clockwiseChildBases, widdershinsChildBasis, childBisection)

    return childBisection;
}

// ---------------------------------------------------------------------------
// Collision processing — state machine
// ---------------------------------------------------------------------------

/**
 * Process a collision node. Implements pseudo code step 5.3:
 * - Sort colliding edges by ascending CW parent index
 * - State machine walk: try to accept parents, produce new edges at gaps
 * - Wrap around at the end
 *
 * Returns IDs of newly created interior edges.
 */
export function processCollisionV2(
    collidingInteriorEdges: number[],
    nodeIndex: number,
    context: StraightSkeletonSolverContext,
    exteriorBounds: Map<number, number>,
    heap: Heap<CollisionEvent>,
): number[] {
    const { graph, acceptedEdges } = context;
    const numExterior = graph.numExteriorNodes;

    if (collidingInteriorEdges.length === 0) return [];

    // Sort by ascending clockwise exterior parent index
    const sorted = [...collidingInteriorEdges].sort((a, b) => {
        const ieA = graph.interiorEdges[a - numExterior];
        const ieB = graph.interiorEdges[b - numExterior];
        return ieA.clockwiseExteriorEdgeIndex - ieB.clockwiseExteriorEdgeIndex;
    });

    let pendingWiddershinsParent: number | null = null;
    let pendingWiddersinsChild: number | null = null;
    let firstUnmatchedClockwiseParent: number | null = null;
    let firstUnmatchedClockiseChild: number | null = null;

    const newEdgeIds: number[] = [];

    for (const edgeId of sorted) {
        const currentInteriorEdge = graph.interiorEdges[edgeId - numExterior];

        // Step A: Try to accept WS parent
        tryToAcceptExteriorEdge(context, currentInteriorEdge.widdershinsExteriorEdgeIndex);

        if (!acceptedEdges[currentInteriorEdge.widdershinsExteriorEdgeIndex]) {
            // WS parent is still active
            if (pendingWiddershinsParent !== null) {
                // Pair: pending CW parent + this WS parent → new interior edge
                const direction = computeApproximateCollisionDirection(
                    edgeId,
                    pendingWiddersinsChild!,
                    graph,
                );
                const newId = createBisectionInteriorEdge(
                    context,
                    currentInteriorEdge.widdershinsExteriorEdgeIndex,
                    pendingWiddershinsParent,
                    nodeIndex,
                    direction,
                );
                pushAllEventsForEdge(newId, context, exteriorBounds, heap);
                newEdgeIds.push(newId);
                pendingWiddershinsParent = null;
                pendingWiddersinsChild = null;
            } else {
                // Record for wrap-around
                if (firstUnmatchedClockwiseParent === null) {
                    firstUnmatchedClockwiseParent = currentInteriorEdge.widdershinsExteriorEdgeIndex;
                    firstUnmatchedClockiseChild = edgeId;
                }
            }
        }

        // Step B: Try to accept CW parent
        tryToAcceptExteriorEdge(context, currentInteriorEdge.clockwiseExteriorEdgeIndex);

        if (!acceptedEdges[currentInteriorEdge.clockwiseExteriorEdgeIndex]) {
            // CW parent is still active → store as pending
            pendingWiddershinsParent = currentInteriorEdge.clockwiseExteriorEdgeIndex;
            pendingWiddersinsChild = edgeId;
        }
    }

    // Wrap-around: pair last pending CW with first unmatched WS
    if (pendingWiddershinsParent !== null && firstUnmatchedClockwiseParent !== null) {
        const direction = computeApproximateCollisionDirection(
            firstUnmatchedClockiseChild!,
            pendingWiddersinsChild!,
            graph,
        );
        const newId = createBisectionInteriorEdge(
            context,
            firstUnmatchedClockwiseParent,
            pendingWiddershinsParent,
            nodeIndex,
            direction,
        );
        pushAllEventsForEdge(newId, context, exteriorBounds, heap);
        newEdgeIds.push(newId);
    }

    return newEdgeIds;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export interface SolverContextV2 {
    context: StraightSkeletonSolverContext;
    exteriorBounds: Map<number, number>;
    heap: Heap<CollisionEvent>;
}

/**
 * Initialize the V2 solver:
 * 1. Build graph from polygon vertices
 * 2. Create primary interior edges (one per vertex)
 * 3. Push ALL intersection events for each primary edge
 */
export function initContextV2(nodes: Vector2[]): SolverContextV2 {
    const context = makeStraightSkeletonSolverContext(nodes);
    const { graph } = context;
    const n = nodes.length;

    const heap = new Heap<CollisionEvent>((a, b) => a.eventDistance - b.eventDistance);
    const exteriorBounds = new Map<number, number>();

    // Create primary interior edges (one per exterior vertex)
    const primaryEdgeIds: number[] = [];
    for (let i = 0; i < n; i++) {
        const cwParent = i;
        const wsParent = (i - 1 + n) % n;
        const edgeId = createBisectionInteriorEdge(context, cwParent, wsParent, i);
        primaryEdgeIds.push(edgeId);
    }

    // Push all events for each primary edge
    for (const edgeId of primaryEdgeIds) {
        pushAllEventsForEdge(edgeId, context, exteriorBounds, heap);
    }

    return { context, exteriorBounds, heap };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

function graphIsComplete(context: StraightSkeletonSolverContext): boolean {
    return context.acceptedEdges
        .slice(0, context.graph.numExteriorNodes)
        .every(flag => flag);
}

/**
 * Public entry point. Computes the straight skeleton using the V2 algorithm.
 */
export function computeStraightSkeletonV2(nodes: Vector2[]): StraightSkeletonGraph {
    if (nodes.length < 3) {
        return { nodes: [], edges: [], numExteriorNodes: 0, interiorEdges: [] };
    }

    const { context, exteriorBounds, heap } = initContextV2(nodes);
    const { graph, acceptedEdges } = context;
    const numExterior = graph.numExteriorNodes;

    while (!graphIsComplete(context)) {
        const event = heap.pop();

        if (event === undefined) {
            throw new Error("Heap exhausted before graph complete");
        }

        // Validity check: at least 2 active participants
        if (!isEventValid(event, acceptedEdges)) continue;

        // Find active (non-accepted) participants
        const activeParticipants: { edgeId: number; distance: number }[] = [];
        for (let i = 0; i < event.participatingEdges.length; i++) {
            const edgeId = event.participatingEdges[i];
            if (!acceptedEdges[edgeId]) {
                activeParticipants.push({ edgeId, distance: event.distances[i] });
            }
        }

        // Compute collision position from the first active participant
        const firstActive = activeParticipants[0];
        const firstEdge = graph.edges[firstActive.edgeId];
        const firstSource = graph.nodes[firstEdge.source].position;
        const collisionPos = addVectors(
            firstSource,
            scaleVector(firstEdge.basisVector, firstActive.distance),
        );

        // Create or reuse node at collision position
        let nodeIndex = -1;
        for (let i = numExterior; i < graph.nodes.length; i++) {
            if (positionsAreClose(graph.nodes[i].position, collisionPos)) {
                nodeIndex = i;
                break;
            }
        }
        if (nodeIndex < 0) {
            nodeIndex = addNode(collisionPos, graph);
        }

        // Wire active edges to target this node
        for (const { edgeId, distance } of activeParticipants) {
            graph.edges[edgeId].target = nodeIndex;

            // Set the InteriorEdge length for potential visualization use
            const ieData = graph.interiorEdges[edgeId - numExterior];
            ieData.length = distance;

            if (!graph.nodes[nodeIndex].inEdges.includes(edgeId)) {
                graph.nodes[nodeIndex].inEdges.push(edgeId);
            }
        }

        // Accept all active edges
        for (const { edgeId } of activeParticipants) {
            acceptEdge(edgeId, context);
        }

        // Gather ALL interior edges at this node (may include previously accepted edges
        // from earlier events at the same position)
        const allInteriorEdgesAtNode = graph.nodes[nodeIndex].inEdges.filter(
            e => e >= numExterior,
        );

        // State machine produces new interior edges
        processCollisionV2(allInteriorEdgesAtNode, nodeIndex, context, exteriorBounds, heap);
    }

    return graph;
}
