import {
    EdgeIntersectionEvaluation,
    IntersectorInfo,
    InteriorEdge,
    PolygonEdge,
    RayProjection,
    StepResult,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {
    addVectors,
    fp_compare,
    makeBisectedBasis,
    vectorsAreEqual,
    scaleVector
} from "@/algorithms/straight-skeleton/core-functions";
import {addNode} from "@/algorithms/straight-skeleton/graph-helpers";
import {intersectRays} from "@/algorithms/straight-skeleton/intersection-edges";
import {makeStraightSkeletonSolverContext} from "@/algorithms/straight-skeleton/solver-context";
import {
    createBisectionInteriorEdge,
    initInteriorEdges,
    tryToAcceptExteriorEdge
} from "@/algorithms/straight-skeleton/algorithm-helpers";

export function makeRayProjection(edge: PolygonEdge, graph: StraightSkeletonGraph): RayProjection {
    return {
        basisVector: edge.basisVector,
        sourceVector: graph.nodes[edge.source].position
    }
}

function anyUndefined(args: unknown[]){
    if (args.some(arg => arg === undefined)){
        throw new Error('Undefined argument.')
    }
}

/**
 * return value indicates whether strictly the length was modified. Adding additional intersections returns false.
 * The return value is to indicate that the edge must be pushed anew into the heap
 * */
export function updateInteriorEdgeIntersections(edge: InteriorEdge, otherEdgeIndex: number, length: number): boolean {
    if (fp_compare(length, 0) <= 0) {
        return false;
    }

    anyUndefined([edge.length, edge.intersectingEdges])

    const comparison = fp_compare(length, edge.length!);

    if (comparison < 0) {
        edge.intersectingEdges = [otherEdgeIndex]
        edge.length = length;
        return true;
    }

    if (comparison === 0) {
        if (!edge.intersectingEdges!.includes(otherEdgeIndex)) {
            edge.intersectingEdges!.push(otherEdgeIndex);
        }
    }

    return false;
}

/**
 * Evaluates intersections for any active (non-accepted) interior edge against all other
 * active interior edges. Returns an EdgeIntersectionEvaluation WITHOUT committing changes.
 */
export function evaluateEdgeIntersections(context: StraightSkeletonSolverContext, edgeIndex: number): EdgeIntersectionEvaluation {
    const {acceptedEdges, graph} = context;

    // Phase 1: compute all pairings without committing
    const candidates: { otherId: number; distanceNew: number; distanceOther: number; priorityOverride?: number }[] = [];
    for (let i = 0; i < graph.interiorEdges.length; i++) {
        const otherInteriorEdgeData = graph.interiorEdges[i];
        if (otherInteriorEdgeData.id === edgeIndex) continue;
        if (acceptedEdges[otherInteriorEdgeData.id]) continue;

        const result = intersectRays(
            makeRayProjection(graph.edges[edgeIndex], graph),
            makeRayProjection(graph.edges[otherInteriorEdgeData.id], graph)
        );
        const distanceNew = result[0];
        const distanceOther = result[1];
        const resultType = result[2];
        if (resultType === 'converging') {
            candidates.push({otherId: otherInteriorEdgeData.id, distanceNew, distanceOther});
        }

        if (resultType === 'head-on') {
            candidates.push({
                otherId: otherInteriorEdgeData.id,
                distanceNew,
                distanceOther,
                priorityOverride: distanceNew
            })
        }

    }

    // Phase 2: find smallest forward distance along self where the other edge's
    // distance is within its current recorded length
    let bestDistanceNew = Number.POSITIVE_INFINITY;
    for (const edgeCandidate of candidates) {
        if (fp_compare(edgeCandidate.distanceNew, 0) <= 0) continue;
        const otherInteriorEdgeData = graph.interiorEdges[edgeCandidate.otherId - graph.numExteriorNodes];
        if (edgeCandidate.priorityOverride !== undefined || fp_compare(edgeCandidate.distanceOther, otherInteriorEdgeData.length!) <= 0) {
            if (fp_compare(edgeCandidate.distanceNew, bestDistanceNew) < 0) {
                bestDistanceNew = edgeCandidate.distanceNew;
            }
        }
    }

    // Phase 3: collect intersectors at bestDistanceNew
    const intersectors: IntersectorInfo[] = [];
    for (const c of candidates) {
        if (fp_compare(c.distanceNew, bestDistanceNew) !== 0) continue;
        const otherInteriorEdgeData = graph.interiorEdges[c.otherId - graph.numExteriorNodes];
        if (c.priorityOverride === undefined && fp_compare(c.distanceOther, otherInteriorEdgeData.length!) > 0) continue;
        intersectors.push({
            edgeId: c.otherId,
            distanceAlongSelf: c.distanceNew,
            distanceAlongOther: c.distanceOther,
            priorityOverride: c.priorityOverride,
        });
    }

    return {
        edgeIndex,
        shortestLength: bestDistanceNew,
        intersectors,
        candidates,
    };
}

/**
 * Commits a single evaluation. Directly sets the evaluated edge's length and
 * intersectingEdges, then uses updateInteriorEdgeIntersections for each intersector.
 * Returns displaced edge IDs (edges whose intersectingEdges were overwritten).
 */
function applyEvaluation(context: StraightSkeletonSolverContext, evaluation: EdgeIntersectionEvaluation): number[] {
    const {graph, heap} = context;
    const edgeData = graph.interiorEdges[evaluation.edgeIndex - graph.numExteriorNodes];
    const displaced: number[] = [];

    // Note 2: no valid intersection — set state but don't push
    if (!isFinite(evaluation.shortestLength) || evaluation.intersectors.length === 0) {
        edgeData.length = evaluation.shortestLength;
        edgeData.intersectingEdges = [];
        return displaced;
    }

    // Set evaluated edge's state
    edgeData.length = evaluation.shortestLength;
    edgeData.intersectingEdges = evaluation.intersectors.map(info => info.edgeId);

    // Update intersectors, collect displaced
    for (const info of evaluation.intersectors) {
        const otherEdgeData = graph.interiorEdges[info.edgeId - graph.numExteriorNodes];
        const oldIntersectingEdges = [...otherEdgeData.intersectingEdges!];
        const reduced = updateInteriorEdgeIntersections(otherEdgeData, evaluation.edgeIndex, info.distanceAlongOther);
        if (reduced) {
            for (const d of oldIntersectingEdges) displaced.push(d);
        }
    }

    // Note 1: single push, eventDistance = max distance among all participants
    let eventDistance = evaluation.shortestLength;
    for (const info of evaluation.intersectors) {
        const effectiveDistance = info.priorityOverride ?? info.distanceAlongOther;
        if (effectiveDistance > eventDistance) eventDistance = effectiveDistance;
    }

    edgeData.heapGeneration!++;

    heap.push({
        ownerId: evaluation.edgeIndex,
        participatingEdges: [evaluation.edgeIndex, ...evaluation.intersectors.map(i => i.edgeId)],
        eventDistance,
        generation: edgeData.heapGeneration!,
    });

    return displaced;
}

/**
 * Re-evaluates a single edge and propagates to displaced edges via a dirty queue.
 */
export function reEvaluateEdge(context: StraightSkeletonSolverContext, edgeIndex: number) {
    const {graph} = context;
    // FIFO queue of edges that need (re-)evaluation
    const dirtyQueue: number[] = [edgeIndex];
    const processed = new Set<number>();

    while (dirtyQueue.length > 0) {
        const currentEdge = dirtyQueue.shift()!;
        const currentEdgeData = context.getInteriorWithId(currentEdge);
        if (processed.has(currentEdge)) continue;
        if (context.acceptedEdges[currentEdge]) continue;
        processed.add(currentEdge);

        const evaluation = evaluateEdgeIntersections(context, currentEdge);
        const displaced = applyEvaluation(context, evaluation);

        // Secondary propagation: edges that intersect currentEdge at a shorter
        // distance than their current length, even if they're not currentEdge's
        // closest intersectors
        for (const c of evaluation.candidates) {
            if (fp_compare(c.distanceOther, 0) <= 0) continue;
            if (fp_compare(c.distanceNew, 0) <= 0) continue;
            const otherEdgeData =  context.getInteriorWithId(c.otherId);


            if (fp_compare(c.distanceOther, otherEdgeData.length!) < 0) {
                if (!processed.has(c.otherId) && !context.acceptedEdges[c.otherId]) {
                    dirtyQueue.push(c.otherId);
                }
            }
        }

        for (const d of displaced) {
            if (!processed.has(d) && !context.acceptedEdges[d]) {
                dirtyQueue.push(d);
            }
        }
    }
}

export function pushHeapInteriorEdge(context: StraightSkeletonSolverContext, clockwiseParent: number, widdershinsParent: number, source: number, approximateDirection?: Vector2) {
    const edgeIndex = createBisectionInteriorEdge(context, clockwiseParent, widdershinsParent, source, approximateDirection);
    reEvaluateEdge(context, edgeIndex);
}

/**
 * Processes a collision node by iterating pairs of colliding interior edges
 * and walking the exterior edge ring between them to find correct parent pairings.
 */
export function processCollisionNode(context: StraightSkeletonSolverContext, collidingInteriorEdges: number[], nodeIndex: number) {
    const {graph} = context;
    const numExterior = graph.numExteriorNodes;

    if (collidingInteriorEdges.length === 0) return;

    // Get interior edge data for each colliding edge
    const edgesWithData = collidingInteriorEdges.map(edgeId => {
        const ie = graph.interiorEdges[edgeId - numExterior];
        // Compute a circular midpoint of the narrow arc (WS→CW going forward).
        // This places each edge at its "notch" in the exterior ring.
        const cw = ie.clockwiseExteriorEdgeIndex;
        const ws = ie.widdershinsExteriorEdgeIndex;
        const arcLength = (cw - ws + numExterior) % numExterior;
        const midpoint = (ws + arcLength / 2) % numExterior;
        return {
            edgeId,
            cwParent: cw,
            wsParent: ws,
            ringPosition: midpoint,
        };
    });

    // Sort by ring position to establish circular ordering
    edgesWithData.sort((a, b) => a.ringPosition - b.ringPosition);

    const N = edgesWithData.length;

    // Track created parent pairs to avoid duplicates
    const createdPairs = new Set<string>();

    // Iterate adjacent pairs (wrapping around)
    for (let i = 0; i < N; i++) {
        const edgeA = edgesWithData[i];
        const edgeB = edgesWithData[(i + 1) % N];

        // The arc goes from edgeA's CW parent to edgeB's WS parent.
        // Walk the exterior ring from edgeA.cwParent to edgeB.wsParent (inclusive).
        const arcStart = edgeA.cwParent;
        const arcEnd = edgeB.wsParent;

        let firstUnaccepted = -1;
        let lastUnaccepted = -1;

        let current = arcStart;
        // Walk the arc, trying to accept each exterior edge
        for (let step = 0; step <= numExterior; step++) {
            tryToAcceptExteriorEdge(context, current);

            if (!context.acceptedEdges[current]) {
                if (firstUnaccepted === -1) {
                    firstUnaccepted = current;
                }
                lastUnaccepted = current;
            }

            if (current === arcEnd) break;
            current = (current + 1) % numExterior;
        }

        // If no unaccepted edges in arc, region is fully closed — skip
        if (firstUnaccepted === -1) continue;

        // firstUnaccepted = new CW parent, lastUnaccepted = new WS parent
        const newCwParent = firstUnaccepted;
        const newWsParent = lastUnaccepted;

        // Deduplicate: skip if we already created this exact parent pair
        const pairKey = `${newCwParent},${newWsParent}`;
        if (createdPairs.has(pairKey)) continue;
        createdPairs.add(pairKey);

        // Compute approximate direction by bisecting the colliding pair's bases.
        // The colliding edges point toward the collision node; their bisection
        // gives the continuation direction for the new bisector.
        const approxDirection = makeBisectedBasis(
            graph.edges[edgeA.edgeId].basisVector,
            graph.edges[edgeB.edgeId].basisVector
        );

        pushHeapInteriorEdge(context, newCwParent, newWsParent, nodeIndex, approxDirection);
    }
}

// Function to make heap interior edges
export function initStraightSkeletonSolverContext(nodes: Vector2[]): StraightSkeletonSolverContext {
    const context = makeStraightSkeletonSolverContext(nodes);

    initInteriorEdges(context);

    for (const interiorEdge of context.graph.interiorEdges) {
        reEvaluateEdge(context, interiorEdge.id)
    }

    return context;
}

export function finalizeTargetNodePosition(interiorEdgeId: number, graph: StraightSkeletonGraph) {
    const edgeData = graph.edges[interiorEdgeId];
    const interiorEdgeData = graph.interiorEdges[interiorEdgeId - graph.numExteriorNodes];
    const vector = scaleVector(edgeData.basisVector, interiorEdgeData.length!)
    const start = graph.nodes[edgeData.source].position;
    return addVectors(start, vector)
}

export function acceptEdge(edge: number, context: StraightSkeletonSolverContext) {
    if (edge >= context.acceptedEdges.length) {
        throw new Error(`Cannot accept edge ${edge} for array length ${context.acceptedEdges.length}`);
    }

    context.acceptedEdges[edge] = true;
}

export function acceptEdgeAndPropagate(edge: number, context: StraightSkeletonSolverContext) {
    acceptEdge(edge, context);

    if (edge >= context.graph.numExteriorNodes) {
        const {graph} = context;
        for (const ie of graph.interiorEdges) {
            if (context.acceptedEdges[ie.id]) continue;
            if (ie.intersectingEdges!.includes(edge)) {
                reEvaluateEdge(context, ie.id);
            }
        }
    }
}

export function addTargetNodeAtInteriorEdgeIntersect(context: StraightSkeletonSolverContext, interiorEdgeData: InteriorEdge): number {
    const {graph} = context;
    const newNodePosition = finalizeTargetNodePosition(interiorEdgeData.id, graph);

    // Check for existing interior node at the same position (node reuse)
    let nodeIndex = -1;
    for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
        if (vectorsAreEqual(graph.nodes[i].position, newNodePosition)) {
            nodeIndex = i;
            break;
        }
    }

    const inEdges = [interiorEdgeData.id, ...interiorEdgeData.intersectingEdges!];

    if (nodeIndex >= 0) {
        // Reuse existing node — append new inEdges
        const existingNode = graph.nodes[nodeIndex];
        for (const edge of inEdges) {
            if (!existingNode.inEdges.includes(edge)) {
                existingNode.inEdges.push(edge);
            }
        }
    } else {
        // Create new node
        nodeIndex = addNode(newNodePosition, graph);
        graph.nodes[nodeIndex].inEdges = inEdges;
    }

    inEdges.forEach(edge => {
        graph.edges[edge].target = nodeIndex;
    });

    return nodeIndex;
}

/**
 * Performs a single step of the straight skeleton algorithm.
 * Pops the next valid event from the heap, processes it, and returns
 * diagnostic info about what happened.
 *
 * Returns `poppedEdgeId: -1` when the graph completes during stale-event
 * handling without producing a fresh collision event.
 *
 * Throws if the heap is exhausted before the graph is complete.
 */
export function performOneStep(context: StraightSkeletonSolverContext): StepResult {
    const {graph, acceptedEdges, heap} = context;

    let nextEdge = heap.pop();
    while (nextEdge !== undefined) {
        const ownerInteriorData = graph.interiorEdges[nextEdge.ownerId - graph.numExteriorNodes];
        if (nextEdge.generation !== ownerInteriorData.heapGeneration) {
            nextEdge = heap.pop();
            continue;
        }

        const ownerAccepted = nextEdge.ownerId < acceptedEdges.length && acceptedEdges[nextEdge.ownerId];

        if (ownerAccepted) {
            nextEdge = heap.pop();
            continue;
        }

        const hasStaleParticipants = nextEdge.participatingEdges.some(
            eid => eid !== nextEdge!.ownerId && eid < acceptedEdges.length && acceptedEdges[eid]
        );

        if (hasStaleParticipants) {
            const interiorEdgeData = graph.interiorEdges[nextEdge.ownerId - graph.numExteriorNodes];
            const targetPos = finalizeTargetNodePosition(interiorEdgeData.id, graph);

            let existingNodeIndex = -1;
            for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
                if (vectorsAreEqual(graph.nodes[i].position, targetPos)) {
                    existingNodeIndex = i;
                    break;
                }
            }

            if (existingNodeIndex >= 0) {
                const ownerEdgeId = nextEdge.ownerId;
                if (!graph.nodes[existingNodeIndex].inEdges.includes(ownerEdgeId)) {
                    graph.nodes[existingNodeIndex].inEdges.push(ownerEdgeId);
                }
                graph.edges[ownerEdgeId].target = existingNodeIndex;
                acceptEdgeAndPropagate(ownerEdgeId, context);

                const allNodeEdges = graph.nodes[existingNodeIndex].inEdges.filter(
                    e => e >= graph.numExteriorNodes
                );
                processCollisionNode(context, allNodeEdges, existingNodeIndex);
            } else {
                reEvaluateEdge(context, nextEdge.ownerId);
            }
            nextEdge = heap.pop();
            if (context.acceptedEdges.every(f => f)) {
                return {poppedEdgeId: -1, acceptedInteriorEdges: [], newInteriorEdgeIds: []};
            }
            continue;
        }

        break;
    }
    if (nextEdge === undefined) {
        if (context.acceptedEdges.every(f => f)) {
            return {poppedEdgeId: -1, acceptedInteriorEdges: [], newInteriorEdgeIds: []};
        }
        throw new Error('Heap exhausted');
    }

    const interiorEdgeData = graph.interiorEdges[nextEdge.ownerId - graph.numExteriorNodes];
    const prevInteriorEdgeCount = graph.interiorEdges.length;

    const nodeIndex = addTargetNodeAtInteriorEdgeIntersect(context, interiorEdgeData);

    const acceptedInteriorEdges = graph.nodes[nodeIndex].inEdges.filter(
        e => !acceptedEdges[e]
    );
    acceptedInteriorEdges.forEach(e => acceptEdgeAndPropagate(e, context));

    const allInteriorEdgesAtNode = graph.nodes[nodeIndex].inEdges.filter(
        e => e >= graph.numExteriorNodes
    );
    processCollisionNode(context, allInteriorEdgesAtNode, nodeIndex);

    const newInteriorEdgeIds = graph.interiorEdges
        .slice(prevInteriorEdgeCount)
        .map(e => e.id);

    return {poppedEdgeId: nextEdge.ownerId, acceptedInteriorEdges, newInteriorEdgeIds};
}
