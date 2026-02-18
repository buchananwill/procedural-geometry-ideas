import {
    HeapInteriorEdge, PolygonNode,
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
 * */
export function unitsToIntersection(ray1: RayProjection, ray2: RayProjection): IntersectionUnits {
    // We need to form a pair of linear simultaneous equations, relating x1 === x2 && y1 === y2

    const relativeRay2Source = subtractVectors(ray2.sourceVector, ray1.sourceVector);
    const xRel = relativeRay2Source.x;
    const yRel = relativeRay2Source.y;
    const x1 = ray1.basisVector.x;
    const x2 = ray2.basisVector.x;
    const y1 = ray1.basisVector.y;
    const y2 = ray2.basisVector.y;

    const ray1Units = (xRel + yRel * x2) / (x1 * y2 - x2 * y1);
    const ray2Units = (ray1Units * y1 - yRel) / y2;

    return [ray1Units, ray2Units];
}

const heapInteriorEdgeComparator = (e1: HeapInteriorEdge, e2: HeapInteriorEdge) => {
    return e1.length - e2.length;
}

function makeStraightSkeletonSolverContext(nodes: Vector2[]): StraightSkeletonSolverContext {
    return {
        graph: initStraightSkeletonGraph(nodes),
        acceptedEdges: nodes.map(() => false),
        heap: new Heap<HeapInteriorEdge>(heapInteriorEdgeComparator)
    };
}

/**
 * returns index of just-added edge
 * */
function addBisectionEdge(graph: StraightSkeletonGraph, clockwiseExteriorEdgeIndex: number, widdershinsExteriorEdgeIndex: number): number {
    const clockwiseEdge = graph.edges[clockwiseExteriorEdgeIndex];
    const widdershinsEdge = graph.edges[widdershinsExteriorEdgeIndex];
    const id = graph.edges.length;

    graph.interiorEdges.push({clockwiseExteriorEdgeIndex, widdershinsExteriorEdgeIndex})
    graph.edges.push({
        id,
        source: clockwiseExteriorEdgeIndex,
        basisVector: makeBisectedBasis(clockwiseEdge.basisVector, scaleVector(widdershinsEdge.basisVector, -1))
    })

    return id;
}

function makeRayProjection(edge: HeapInteriorEdge, graph: StraightSkeletonGraph): RayProjection {
    return {
        basisVector: edge.basisVector,
        sourceVector: graph.nodes[edge.sourceNode].position
    }
}

export function updateInteriorEdgeIntersection(edge: HeapInteriorEdge, otherEdgeIndex: number, length: number) {
    const comparison = fp_compare(length, edge.length);

    if (comparison < 0) {
        edge.intersectingEdges = [otherEdgeIndex]
        edge.length = length;
        return;
    }

    if (comparison === 0) {
        edge.intersectingEdges.push(otherEdgeIndex);
    }
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
        const edgeIndex = addBisectionEdge(graph, clockwiseExteriorEdgeIndex, widdershinsExteriorEdgeIndex);
        initialInteriorEdges.push(edgeIndex);
        graph.nodes[clockwiseExteriorEdgeIndex].outEdges.push(edgeIndex);
    }

    const initialHeapEdges: HeapInteriorEdge[] = initialInteriorEdges.map((i) => {
        return {
            sourceNode: i,
            id: i + initialInteriorEdges.length,
            length: Number.MAX_VALUE,
            basisVector: graph.edges[i].basisVector,
            intersectingEdges: []
        }
    })

    // calculate intersection lengths and push into heap
    for (let initialInteriorEdge1 = 0; initialInteriorEdge1 < initialInteriorEdges.length; initialInteriorEdge1++) {
        const firstInteriorEdge = initialHeapEdges[initialInteriorEdge1];
        for (let initialInteriorEdge2 = initialInteriorEdge1 + 1; initialInteriorEdge2 < initialInteriorEdges.length; initialInteriorEdge2++) {
            const otherInteriorEdge = initialHeapEdges[initialInteriorEdge2];
            const [firstDistance, otherDistance] = unitsToIntersection(
                makeRayProjection(firstInteriorEdge, graph),
                makeRayProjection(otherInteriorEdge, graph)
            );

            updateInteriorEdgeIntersection(firstInteriorEdge, otherInteriorEdge.id, firstDistance)
            updateInteriorEdgeIntersection(otherInteriorEdge, firstInteriorEdge.id, otherDistance)
        }

        context.heap.push(firstInteriorEdge);
    }

    return context;
}

export function finalizeTargetNodePosition(edge: HeapInteriorEdge, graph: StraightSkeletonGraph) {
    const vector = scaleVector(edge.basisVector, edge.length)
    const start = graph.nodes[edge.sourceNode].position;
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

    const addCandidates = (edges: number[]) => {
        edges.forEach(innerEdge => {
            if (visitedEdges.has(innerEdge)) {
                return;
            }
            if (innerEdge >= acceptedEdges.length) {
                return;
            }
            if (!acceptedEdges[innerEdge]) {
                return;
            }
            candidateEdges.push(innerEdge);
        })
    }

    while (candidateEdges.length > 0) {
        const nextEdge = candidateEdges.pop()
        assertIsNumber(nextEdge)
        visitedEdges.add(nextEdge)
        if (nextEdge === edge) {
            return true;
        }

        if (nextEdge < graph.numExteriorNodes) {
            continue;
        }

        if (!acceptedEdges[nextEdge]) {
            continue;
        }

        const nextEdgeData = graph.edges[nextEdge];
        const nextTargetIndex = nextEdgeData.target;

        const nextSource = graph.nodes[nextEdgeData.source];
        addCandidates(nextSource.outEdges);
        addCandidates(nextSource.inEdges);

        if (nextTargetIndex) {
            const nextTarget = graph.nodes[nextTargetIndex];

            addCandidates(nextTarget.outEdges);
            addCandidates(nextTarget.inEdges);
        }
    }

    return false;
}