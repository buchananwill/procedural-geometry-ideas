import {
    EdgeIntersectionEvaluation,
    HeapInteriorEdge,
    IntersectorInfo,
    InteriorEdge,
    PolygonEdge,
    PolygonNode,
    RayProjection,
    StepResult,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {
    addNode,
    addVectors, assertIsNumber,
    fp_compare,
    initStraightSkeletonGraph, interiorEdgeIndex,
    makeBisectedBasis,
    positionsAreClose,
    scaleVector,
    subtractVectors
} from "@/algorithms/straight-skeleton/core-functions";
import Heap from "heap-js";

export type IntersectionUnits = [number, number] | [number, number, number];

/**
 * Returns a tuple holding the unit distance along each ray until it intersects the other.
 * If the two rays are parallel, return value is [+inf, +inf] unless both sources lie on same line
 * */
export function unitsToIntersection(ray1: RayProjection, ray2: RayProjection): IntersectionUnits {
    // We need to form a pair of linear simultaneous equations, relating x1 === x2 && y1 === y2

    const relativeRay2Source = subtractVectors(ray2.sourceVector, ray1.sourceVector);
    const xRel = relativeRay2Source.x;
    const yRel = relativeRay2Source.y;

    if (fp_compare(xRel, 0) === 0 && fp_compare(yRel, 0) === 0) {
        return [0, 0];
    }

    const x1 = ray1.basisVector.x;
    const x2 = ray2.basisVector.x;
    const y1 = ray1.basisVector.y;
    const y2 = ray2.basisVector.y;

    // Invalid input: one or both vectors is not basis
    if ((x1 === 0 && y1 === 0) || (x2 === 0 && y2 === 0)) {
        return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
    }

    const crossProduct = (x1 * y2 - x2 * y1);

    if (fp_compare(crossProduct, 0) === 0) {
        const pointLiesAlongRay = (ray: RayProjection, point: Vector2): [boolean, number] => {
            const relative = subtractVectors(point, ray.sourceVector);
            if (ray.basisVector.x === 0) {
                const delta = relative.y / ray.basisVector.y;
                return [fp_compare(relative.x, 0) === 0 && delta > 0, delta];
            }

            if (ray.basisVector.y === 0) {
                const delta = relative.x / ray.basisVector.x;
                return [fp_compare(relative.y, 0) === 0 && delta > 0, delta];
            }

            const delta_x = relative.x / ray.basisVector.x;
            const delta_y = relative.y / ray.basisVector.y;
            return [fp_compare(delta_x, delta_y) === 0 && delta_x > 0, delta_x];
        }

        const [isAlongRay1, length1] = pointLiesAlongRay(ray1, ray2.sourceVector);
        const [isAlongRay2, length2] = pointLiesAlongRay(ray2, ray1.sourceVector);

        if (isAlongRay1 && isAlongRay2) {
            return [length1 / 2, length2 / 2, Math.max(length1, length2)];
        }

        if (isAlongRay1) {
            return [length1, -length2];
        }

        if (isAlongRay2) {
            return [-length1, length2];
        }


        return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
    }

    const ray1Units = (xRel * y2 - yRel * x2) / crossProduct;

    if (y2 !== 0) {
        const ray2Units = (ray1Units * y1 - yRel) / y2;

        return [ray1Units, ray2Units];
    }

    const ray2units = (ray1Units * x1 - xRel) / x2;

    return [ray1Units, ray2units];

}

function makeHeapInteriorEdgeComparator() {
    return (e1: HeapInteriorEdge, e2: HeapInteriorEdge) => {
        return e1.eventDistance - e2.eventDistance;
    }
}


function makeStraightSkeletonSolverContext(nodes: Vector2[]): StraightSkeletonSolverContext {
    const graph = initStraightSkeletonGraph(nodes);
    return {
        graph,
        acceptedEdges: nodes.map(() => false),
        heap: new Heap<HeapInteriorEdge>(makeHeapInteriorEdgeComparator()),
    };
}

/**
 * returns index of just-added edge
 * */
export function addBisectionEdge(graph: StraightSkeletonGraph, clockwiseExteriorEdgeIndex: number, widdershinsExteriorEdgeIndex: number, source: number): number {
    const clockwiseEdge = graph.edges[clockwiseExteriorEdgeIndex];
    const widdershinsEdge = graph.edges[widdershinsExteriorEdgeIndex];
    const id = graph.edges.length;

    graph.interiorEdges.push({
        id,
        clockwiseExteriorEdgeIndex,
        widdershinsExteriorEdgeIndex,
        intersectingEdges: [],
        length: Number.MAX_VALUE,
        heapGeneration: 0
    })

    const fromNodeWiddershins = scaleVector(widdershinsEdge.basisVector, -1)
    const bisectedBasis = makeBisectedBasis(clockwiseEdge.basisVector, fromNodeWiddershins);

    // Determine correct direction for the bisector.
    // For secondary bisectors at collision nodes, use the "momentum" of the
    // colliding interior edges rather than the cross-product heuristic.
    const sourceNode = graph.nodes[source];
    const incomingInteriorEdges = sourceNode.inEdges.filter(e => e >= graph.numExteriorNodes);

    let finalBasis: Vector2;

    if (incomingInteriorEdges.length >= 2) {
        // Secondary bisector: bisect the colliding interior edges' basis vectors
        // to get the expected continuation direction.
        const momentumBasis = makeBisectedBasis(
            graph.edges[incomingInteriorEdges[0]].basisVector,
            graph.edges[incomingInteriorEdges[1]].basisVector
        );
        const dot = bisectedBasis.x * momentumBasis.x + bisectedBasis.y * momentumBasis.y;
        finalBasis = dot < 0 ? scaleVector(bisectedBasis, -1) : bisectedBasis;
    } else {
        // Initial bisector at polygon vertex: use cross product (original logic)
        const crossProduct = clockwiseEdge.basisVector.x * widdershinsEdge.basisVector.y
                           - clockwiseEdge.basisVector.y * widdershinsEdge.basisVector.x;
        finalBasis = crossProduct < 0 ? scaleVector(bisectedBasis, -1) : bisectedBasis;
    }

    graph.edges.push({ id, source, basisVector: finalBasis })

    graph.nodes[source].outEdges.push(id);

    return id;
}

export function makeRayProjection(edge: PolygonEdge, graph: StraightSkeletonGraph): RayProjection {
    return {
        basisVector: edge.basisVector,
        sourceVector: graph.nodes[edge.source].position
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

    const comparison = fp_compare(length, edge.length);

    if (comparison < 0) {
        edge.intersectingEdges = [otherEdgeIndex]
        edge.length = length;
        return true;
    }

    if (comparison === 0) {
        if (!edge.intersectingEdges.includes(otherEdgeIndex)) {
            edge.intersectingEdges.push(otherEdgeIndex);
        }
    }

    return false;
}

/**
 * Creates a new bisection interior edge and extends acceptedEdges to cover it.
 * Returns the edge index. Does NOT evaluate intersections or push to heap.
 */
export function createBisectionInteriorEdge(context: StraightSkeletonSolverContext, clockwiseParent: number, widdershinsParent: number, source: number): number {
    const {acceptedEdges, graph} = context;
    const edgeIndex = addBisectionEdge(graph, clockwiseParent, widdershinsParent, source);

    while (acceptedEdges.length <= edgeIndex) {
        acceptedEdges.push(false);
    }
    acceptedEdges[edgeIndex] = false;

    return edgeIndex;
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

        const result = unitsToIntersection(
            makeRayProjection(graph.edges[edgeIndex], graph),
            makeRayProjection(graph.edges[otherInteriorEdgeData.id], graph)
        );
        const distanceNew = result[0];
        const distanceOther = result[1];
        const priorityOverride = result[2];
        candidates.push({otherId: otherInteriorEdgeData.id, distanceNew, distanceOther, priorityOverride});
    }

    // Phase 2: find smallest forward distance along self where the other edge's
    // distance is within its current recorded length
    let bestDistanceNew = Number.POSITIVE_INFINITY;
    for (const edgeCandidate of candidates) {
        if (fp_compare(edgeCandidate.distanceNew, 0) <= 0) continue;
        const otherInteriorEdgeData = graph.interiorEdges[edgeCandidate.otherId - graph.numExteriorNodes];
        if (edgeCandidate.priorityOverride !== undefined || fp_compare(edgeCandidate.distanceOther, otherInteriorEdgeData.length) <= 0) {
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
        if (c.priorityOverride === undefined && fp_compare(c.distanceOther, otherInteriorEdgeData.length) > 0) continue;
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
        const oldIntersectingEdges = [...otherEdgeData.intersectingEdges];
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

    edgeData.heapGeneration++;

    heap.push({
        ownerId: evaluation.edgeIndex,
        participatingEdges: [evaluation.edgeIndex, ...evaluation.intersectors.map(i => i.edgeId)],
        eventDistance,
        generation: edgeData.heapGeneration,
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
            const otherEdgeData = graph.interiorEdges[c.otherId - graph.numExteriorNodes];
            if (fp_compare(c.distanceOther, otherEdgeData.length) < 0) {
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

export function pushHeapInteriorEdge(context: StraightSkeletonSolverContext, clockwiseParent: number, widdershinsParent: number, source: number) {
    const edgeIndex = createBisectionInteriorEdge(context, clockwiseParent, widdershinsParent, source);
    reEvaluateEdge(context, edgeIndex);
}


// Function to make heap interior edges
export function initStraightSkeletonSolverContext(nodes: Vector2[]): StraightSkeletonSolverContext {
    const context = makeStraightSkeletonSolverContext(nodes);

    const exteriorEdges = [...context.graph.edges];

    // create interior edges from exterior node bisections
    for (let clockwiseExteriorEdgeIndex = 0; clockwiseExteriorEdgeIndex < exteriorEdges.length; clockwiseExteriorEdgeIndex++) {
        const widdershinsExteriorEdgeIndex = (clockwiseExteriorEdgeIndex - 1 + exteriorEdges.length) % exteriorEdges.length;
        pushHeapInteriorEdge(context, clockwiseExteriorEdgeIndex, widdershinsExteriorEdgeIndex, clockwiseExteriorEdgeIndex);
    }

    return context;
}

export function finalizeTargetNodePosition(interiorEdgeId: number, graph: StraightSkeletonGraph) {
    const edgeData = graph.edges[interiorEdgeId];
    const interiorEdgeData = graph.interiorEdges[interiorEdgeId - graph.numExteriorNodes];
    const vector = scaleVector(edgeData.basisVector, interiorEdgeData.length)
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
            if (ie.intersectingEdges.includes(edge)) {
                reEvaluateEdge(context, ie.id);
            }
        }
    }
}

export function hasInteriorLoop(edge: number, {acceptedEdges, graph}: StraightSkeletonSolverContext): boolean {


    // invalid id case
    if (edge >= graph.edges.length) {
        // console.log("edge id invalid")
        return false;
    }
    const isExterior = edge < graph.numExteriorNodes;
    const edgeData = graph.edges[edge];

    // not yet in the accepted array at all
    if (edge >= acceptedEdges.length) {
        // console.log("edge id not yet valid for accepted edges.")
        return false;
    }

    // has already been accepted (loop is definition of acceptable exterior edge)
    if (isExterior && acceptedEdges[edge]) {
        // console.log("edge already accepted therefore has loop")
        return true;
    }

    // for interior edges check their parents
    if (!isExterior) {
        const interiorEdge = graph.interiorEdges[interiorEdgeIndex(edgeData, graph)];
        const clockwiseParent = interiorEdge.clockwiseExteriorEdgeIndex;
        const widdershinsParent = interiorEdge.widdershinsExteriorEdgeIndex;
        // console.log(`clockwise is accepted: ${acceptedEdges[clockwiseParent]}, widdershins is accepted: ${acceptedEdges[widdershinsParent]}`)
        return acceptedEdges[clockwiseParent] || acceptedEdges[widdershinsParent];
    }

    const targetIndex = edgeData.target;
    assertIsNumber(targetIndex);

    // hard case/base case: find interior loop from exterior edge
    const targetNode: PolygonNode = graph.nodes[targetIndex];
    const visitedEdges = new Set<number>();
    const candidateEdges: number[] = [...targetNode.outEdges];

    const testAndAddCandidates = (edges: number[]): boolean => {
        for (const candidateEdge of edges) {
            if (candidateEdge === edge) {
                // console.log("Search returned to starting edge.")
                return true;
            }
            if (visitedEdges.has(candidateEdge)) {
                // console.log(`has visited edge ${candidateEdge}`);
                continue;
            }
            if (candidateEdge >= acceptedEdges.length) {
                // console.log(`edge not valid accepted index ${candidateEdge}`);
                continue;
            }
            if (!acceptedEdges[candidateEdge]) {
                // console.log(`edge not accepted ${candidateEdge}`);
                continue;
            }
            candidateEdges.push(candidateEdge);
        }
        return false;
    }

    while (candidateEdges.length > 0) {
        const nextEdge = candidateEdges.pop()
        assertIsNumber(nextEdge)
        visitedEdges.add(nextEdge)

        if (nextEdge < graph.numExteriorNodes) {
            continue;
        }

        if (!acceptedEdges[nextEdge]) {
            continue;
        }

        const nextEdgeData = graph.edges[nextEdge];
        const nextTargetIndex = nextEdgeData.target;

        const nextSource = graph.nodes[nextEdgeData.source];
        // We need to skip this test for the source of the very first edge, otherwise we short circuit and get a false positive
        if (nextEdgeData.source !== targetIndex) {
            if (testAndAddCandidates(nextSource.outEdges)) {
                return true;
            }
            if (testAndAddCandidates(nextSource.inEdges)) {
                return true;
            }
        }
        if (nextTargetIndex !== undefined) {
            const nextTarget = graph.nodes[nextTargetIndex];

            if (testAndAddCandidates(nextTarget.outEdges)) {
                return true;
            }
            if (testAndAddCandidates(nextTarget.inEdges)) {
                return true;
            }
        }
    }

    // console.log("search terminated without returning to starting edge.")
    return false;
}

export function addTargetNodeAtInteriorEdgeIntersect(context: StraightSkeletonSolverContext, interiorEdgeData: InteriorEdge): number {
    const {graph} = context;
    const newNodePosition = finalizeTargetNodePosition(interiorEdgeData.id, graph);

    // Check for existing interior node at the same position (node reuse)
    let nodeIndex = -1;
    for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
        if (positionsAreClose(graph.nodes[i].position, newNodePosition)) {
            nodeIndex = i;
            break;
        }
    }

    const inEdges = [interiorEdgeData.id, ...interiorEdgeData.intersectingEdges];

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

export function tryToAcceptExteriorEdge(context: StraightSkeletonSolverContext, exteriorEdge: number) {
    if (hasInteriorLoop(exteriorEdge, context)) {
        context.acceptedEdges[exteriorEdge] = true;
    }

    return context.acceptedEdges[exteriorEdge];
}

export function buildExteriorParentLists(context: StraightSkeletonSolverContext, acceptedInteriorEdges: number[]): [number[], number[]] {
    const testedExteriorEdges = new Set<number>();
    const {graph} = context

    const testFirstTimeSeen = (e: number, parents: number[]) => {

        if (testedExteriorEdges.has(e)) {
            return;
        }

        testedExteriorEdges.add(e);

        if (!tryToAcceptExteriorEdge(context, e)) {
            parents.push(e);
        }
    }

    const activeClockwiseParents: number[] = [];
    const activeWiddershinsParents: number[] = []
    console.log(`accepted interior edges: ${acceptedInteriorEdges}`)

    acceptedInteriorEdges.forEach(e => {
        const interiorEdge = graph.interiorEdges[e - graph.numExteriorNodes];

        testFirstTimeSeen(interiorEdge.widdershinsExteriorEdgeIndex, activeWiddershinsParents)
        testFirstTimeSeen(interiorEdge.clockwiseExteriorEdgeIndex, activeClockwiseParents)
    })

    return [activeClockwiseParents, activeWiddershinsParents]
}

export function pushHeapInteriorEdgesFromParentPairs(context: StraightSkeletonSolverContext, activeClockwiseParents: number[], activeWiddershinsParents: number[], nodeIndex: number) {
    if (activeClockwiseParents.length !== activeWiddershinsParents.length) {
        throw new Error(`Expected both arrays to be equal length: clockwise = ${activeClockwiseParents.length}; widdershins = ${activeWiddershinsParents.length}`);
    }
    if (activeClockwiseParents.length === 1) {
        pushHeapInteriorEdge(context, activeClockwiseParents[0], activeWiddershinsParents[0], nodeIndex);
    }

    if (activeClockwiseParents.length > 1) {
        activeClockwiseParents.sort()
        activeWiddershinsParents.sort()

        let widdershinsParentIndex = 0;
        for (let clockwiseParentIndex = 0; clockwiseParentIndex < activeClockwiseParents.length; clockwiseParentIndex++) {
            const clockwiseParentEdge = activeClockwiseParents[clockwiseParentIndex];

            // need to make alternating pairs of clockwise/widdershins parents indices
            // so find the first widdershins parent that is greater than the first clockwise parent
            if (clockwiseParentIndex === 0 && activeWiddershinsParents[widdershinsParentIndex] < clockwiseParentEdge) {
                widdershinsParentIndex += 1;

                if (activeWiddershinsParents[widdershinsParentIndex] < clockwiseParentEdge) {
                    throw new Error("Two consecutive initial widdershins parents are less than the first clockwise parent");
                }
            }

            const widdershinsParentEdge = activeWiddershinsParents[widdershinsParentIndex];

            pushHeapInteriorEdge(context, clockwiseParentEdge, widdershinsParentEdge, nodeIndex)

            widdershinsParentIndex++;
            widdershinsParentIndex = widdershinsParentIndex % activeWiddershinsParents.length;
        }

    }
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
                if (positionsAreClose(graph.nodes[i].position, targetPos)) {
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
                const [cw, ws] = buildExteriorParentLists(context, allNodeEdges);
                pushHeapInteriorEdgesFromParentPairs(context, cw, ws, existingNodeIndex);
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
    const [cw, ws] = buildExteriorParentLists(context, allInteriorEdgesAtNode);
    pushHeapInteriorEdgesFromParentPairs(context, cw, ws, nodeIndex);

    const newInteriorEdgeIds = graph.interiorEdges
        .slice(prevInteriorEdgeCount)
        .map(e => e.id);

    return {poppedEdgeId: nextEdge.ownerId, acceptedInteriorEdges, newInteriorEdgeIds};
}