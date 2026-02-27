import {
    PolygonEdge,
    PolygonNode,
    StraightSkeletonSolverContext,
    Vector2, BisectionParams, StraightSkeletonGraph
} from "@/algorithms/straight-skeleton/types";
import {complexLog, solverLog} from "@/algorithms/straight-skeleton/logger";
import {
    assertIsNumber,
    crossProduct,
    makeBisectedBasis,
    makeRay,
    negateVector
} from "@/algorithms/straight-skeleton/core-functions";
import {interiorEdgeIndex} from "@/algorithms/straight-skeleton/graph-helpers";
import {intersectRays} from "@/algorithms/straight-skeleton/intersection-edges";
import {makeOffsetDistance} from "@/algorithms/straight-skeleton/collision-helpers";


export function ensureBisectionIsInterior(clockwiseEdge: PolygonEdge, widdershinsEdge: PolygonEdge, bisectedBasis: Vector2
) {
    const cross = crossProduct(clockwiseEdge.basisVector, widdershinsEdge.basisVector);
    return cross < 0 ? negateVector(bisectedBasis) : bisectedBasis;
}

export function ensureDirectionNotReversed(basis: Vector2, approximateDirection: Vector2) {
    const dot = basis.x * approximateDirection.x + basis.y * approximateDirection.y;
    return dot < 0 ? negateVector(basis) : basis;
}

/**
 * returns index of just-added edge
 * */
export function addBisectionEdge(graph: StraightSkeletonGraph, clockwiseExteriorEdgeIndex: number, widdershinsExteriorEdgeIndex: number, source: number, approximateDirection?: Vector2): number {


    const spanSize = (clockwiseExteriorEdgeIndex - widdershinsExteriorEdgeIndex + graph.numExteriorNodes) % graph.numExteriorNodes;
    const parentsInverted = spanSize > graph.numExteriorNodes / 2;
    if (parentsInverted) {
        solverLog.debug(`Inverted parent ordering: ${clockwiseExteriorEdgeIndex}, ${widdershinsExteriorEdgeIndex}`);
    }
    const clockwiseEdge = graph.edges[clockwiseExteriorEdgeIndex];
    const widdershinsEdge = graph.edges[widdershinsExteriorEdgeIndex];
    const id = graph.edges.length;

    graph.interiorEdges.push({
        id,
        clockwiseExteriorEdgeIndex,
        widdershinsExteriorEdgeIndex,
        length: Number.MAX_VALUE,
    })

    const fromNodeWiddershins = negateVector(widdershinsEdge.basisVector)
    const bisectedBasis = makeBisectedBasis(clockwiseEdge.basisVector, fromNodeWiddershins);

    let finalBasis: Vector2;

    if (approximateDirection
        && parentsInverted
    ) {
        finalBasis = ensureDirectionNotReversed(bisectedBasis, approximateDirection);
    } else {
        finalBasis = ensureBisectionIsInterior(clockwiseEdge, widdershinsEdge, bisectedBasis)
    }

    graph.edges.push({id, source, basisVector: finalBasis})

    graph.nodes[source].outEdges.push(id);

    return id;
}

/**
 * Creates a new bisection interior edge and extends acceptedEdges to cover it.
 * Returns the edge index. Does NOT evaluate intersections or push to heap.
 */
export function createBisectionInteriorEdge(context: StraightSkeletonSolverContext, clockwiseParent: number, widdershinsParent: number, source: number, approximateDirection?: Vector2): number {
    const {acceptedEdges, graph} = context;
    const edgeIndex = addBisectionEdge(graph, clockwiseParent, widdershinsParent, source, approximateDirection);

    while (acceptedEdges.length <= edgeIndex) {
        acceptedEdges.push(false);
    }
    acceptedEdges[edgeIndex] = false;


    const interiorEdge = context.getInteriorWithId(edgeIndex);
    const newRay = context.projectRayInterior(interiorEdge)
    for (let i = 0; i < context.graph.numExteriorNodes; i++) {
        if (interiorEdge.clockwiseExteriorEdgeIndex === i || interiorEdge.widdershinsExteriorEdgeIndex === i) {
            continue;
        }
        const polygonEdge = context.getEdgeWithId(i);
        const exteriorEdgeRay = context.projectRay(polygonEdge)
        const [ray1Length, ray2Length] = intersectRays(newRay, exteriorEdgeRay);
        if (ray1Length > 0 && ray2Length > 0) {
            const exteriorTargetNode = context.graph.nodes[polygonEdge.target!]
            const rayFromTargetEnd = makeRay(exteriorTargetNode.position, negateVector(polygonEdge.basisVector));
            const [ray1LengthTarget, ray2LengthTarget] = intersectRays(newRay, rayFromTargetEnd);
            if (ray1LengthTarget > 0 && ray2LengthTarget > 0) {
                const offset = makeOffsetDistance(interiorEdge, context, newRay, ray1Length)
                context.updateMaxOffset(edgeIndex, offset)
                complexLog.info(`EdgeId: ${edgeIndex}, collided edge: ${i}, offset: ${offset}`)

            }
        }
    }

    return edgeIndex;
}

export function bisectWithParams(context: StraightSkeletonSolverContext, params: BisectionParams) {
    return createBisectionInteriorEdge(context, params.clockwiseExteriorEdgeIndex, params.widdershinsExteriorEdgeIndex, params.source, params.approximateDirection ?? undefined);
}

export function initInteriorEdges(context: StraightSkeletonSolverContext) {
    const exteriorEdges = [...context.graph.edges];

    // create interior edges from exterior node bisections
    for (let clockwiseExteriorEdgeIndex = 0; clockwiseExteriorEdgeIndex < exteriorEdges.length; clockwiseExteriorEdgeIndex++) {
        const widdershinsExteriorEdgeIndex = (clockwiseExteriorEdgeIndex - 1 + exteriorEdges.length) % exteriorEdges.length;
        createBisectionInteriorEdge(context, clockwiseExteriorEdgeIndex, widdershinsExteriorEdgeIndex, clockwiseExteriorEdgeIndex)
    }

}

export function hasInteriorLoop(edge: number, {acceptedEdges, graph}: StraightSkeletonSolverContext): boolean {


    // invalid id case
    if (edge >= graph.edges.length) {
        return false;
    }
    const isExterior = edge < graph.numExteriorNodes;
    const edgeData = graph.edges[edge];

    // not yet in the accepted array at all
    if (edge >= acceptedEdges.length) {
        return false;
    }

    // has already been accepted (loop is definition of acceptable exterior edge)
    if (isExterior && acceptedEdges[edge]) {
        return true;
    }

    // for interior edges check their parents
    if (!isExterior) {
        const interiorEdge = graph.interiorEdges[interiorEdgeIndex(edgeData, graph)];
        const clockwiseParent = interiorEdge.clockwiseExteriorEdgeIndex;
        const widdershinsParent = interiorEdge.widdershinsExteriorEdgeIndex;
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
                return true;
            }
            if (candidateEdge < graph.numExteriorNodes) {
                continue;
            }
            if (visitedEdges.has(candidateEdge)) {
                continue;
            }
            if (candidateEdge >= acceptedEdges.length) {
                continue;
            }
            if (!acceptedEdges[candidateEdge]) {
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

    return false;
}

export function tryToAcceptExteriorEdge(context: StraightSkeletonSolverContext, exteriorEdge: number) {
    if (hasInteriorLoop(exteriorEdge, context)) {
        context.acceptedEdges[exteriorEdge] = true;
    }

    return context.acceptedEdges[exteriorEdge];
}
