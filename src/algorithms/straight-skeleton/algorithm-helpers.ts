import {
    HeapInteriorEdge, InteriorEdge, PolygonEdge, PolygonNode,
    RayProjection,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {
    addVectors, assertIsNumber,
    fp_compare,
    initStraightSkeletonGraph, interiorEdgeIndex,
    makeBisectedBasis,
    scaleVector,
    subtractVectors
} from "@/algorithms/straight-skeleton/core-functions";
import Heap from "heap-js";

export type IntersectionUnits = [number, number];

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
                const delta = point.y / ray.basisVector.y;
                return [fp_compare(relative.x, 0) === 0 && delta > 0, delta];
            }

            if (ray.basisVector.y === 0) {
                const delta = point.x / ray.basisVector.x;
                return [fp_compare(relative.y, 0) === 0 && delta > 0, delta];
            }

            const delta_x = relative.x / ray.basisVector.x;
            const delta_y = relative.y / ray.basisVector.y;
            return [fp_compare(delta_x, delta_y) === 0 && delta_x > 0, delta_x];
        }

        const [isAlongRay1, length1] = pointLiesAlongRay(ray1, ray2.sourceVector);
        const [isAlongRay2, length2] = pointLiesAlongRay(ray2, ray1.sourceVector);

        if (isAlongRay1 && isAlongRay2) {
            return [length1/2, length2/2];
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

function makeHeapInteriorEdgeComparator(graph: StraightSkeletonGraph) {
    return (e1: HeapInteriorEdge, e2: HeapInteriorEdge) => {
        return graph.interiorEdges[e1.id - graph.numExteriorNodes].length - graph.interiorEdges[e2.id - graph.numExteriorNodes].length;
    }
}


function makeStraightSkeletonSolverContext(nodes: Vector2[]): StraightSkeletonSolverContext {
    const graph = initStraightSkeletonGraph(nodes);
    return {
        graph,
        acceptedEdges: nodes.map(() => false),
        heap: new Heap<HeapInteriorEdge>(makeHeapInteriorEdgeComparator(graph)),
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
        length: Number.MAX_VALUE
    })
    graph.edges.push({
        id,
        source,
        basisVector: makeBisectedBasis(clockwiseEdge.basisVector, scaleVector(widdershinsEdge.basisVector, -1))
    })

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
    const comparison = fp_compare(length, edge.length);

    if (comparison < 0) {
        edge.intersectingEdges = [otherEdgeIndex]
        edge.length = length;
        return true;
    }

    if (comparison === 0) {
        edge.intersectingEdges.push(otherEdgeIndex);
    }

    return false;
}

// Function to make heap interior edges
export function initStraightSkeletonSolverContext(nodes: Vector2[]): StraightSkeletonSolverContext {
    const context = makeStraightSkeletonSolverContext(nodes);
    const graph = context.graph;

    const initialInteriorEdges: number[] = [];

    const exteriorEdges = [...context.graph.edges];

    // create interior edges from exterior node bisections
    for (let clockwiseExteriorEdgeIndex = 0; clockwiseExteriorEdgeIndex < exteriorEdges.length; clockwiseExteriorEdgeIndex++) {
        const widdershinsExteriorEdgeIndex = (clockwiseExteriorEdgeIndex - 1 + exteriorEdges.length) % exteriorEdges.length;
        const edgeIndex = addBisectionEdge(graph, clockwiseExteriorEdgeIndex, widdershinsExteriorEdgeIndex, clockwiseExteriorEdgeIndex);
        initialInteriorEdges.push(edgeIndex);
    }

    // calculate intersection lengths and push into heap
    for (let initialInteriorEdge1 = 0; initialInteriorEdge1 < initialInteriorEdges.length; initialInteriorEdge1++) {
        const firstInteriorEdge = graph.interiorEdges[initialInteriorEdge1];
        for (let initialInteriorEdge2 = initialInteriorEdge1 + 1; initialInteriorEdge2 < initialInteriorEdges.length; initialInteriorEdge2++) {
            const otherInteriorEdge = graph.interiorEdges[initialInteriorEdge2];
            const [firstDistance, otherDistance] = unitsToIntersection(
                makeRayProjection(graph.edges[firstInteriorEdge.id], graph),
                makeRayProjection(graph.edges[otherInteriorEdge.id], graph)
            );

            updateInteriorEdgeIntersections(firstInteriorEdge, otherInteriorEdge.id, firstDistance)
            updateInteriorEdgeIntersections(otherInteriorEdge, firstInteriorEdge.id, otherDistance)
        }

        context.heap.push({id: firstInteriorEdge.id});
    }

    return context;
}

export function finalizeTargetNodePosition(edge: HeapInteriorEdge, graph: StraightSkeletonGraph) {
    const edgeData = graph.edges[edge.id];
    const interiorEdgeData = graph.interiorEdges[edge.id - graph.numExteriorNodes];
    const vector = scaleVector(edgeData.basisVector, interiorEdgeData.length)
    const start = graph.nodes[edgeData.source].position;
    return addVectors(start, vector)
}

export function acceptEdge(edge: number, context: StraightSkeletonSolverContext) {

    while (edge >= context.acceptedEdges.length) {
        context.acceptedEdges.push(false);
    }

    context.acceptedEdges[edge] = true;
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