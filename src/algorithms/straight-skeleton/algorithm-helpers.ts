import {
    HeapInteriorEdge,
    RayProjection, StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {
    initStraightSkeletonGraph,
    makeBisectedBasis, scaleVector,
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
        acceptedExteriorEdges: [],
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

// Function to make heap interior edges
export function initStraightSkeletonSolverContext(nodes: Vector2[]): StraightSkeletonSolverContext {
    const context = makeStraightSkeletonSolverContext(nodes);
    const graph = context.graph;

    const initialInteriorEdges: number[] = [];

    const exteriorEdges = [...context.graph.edges];

    // create interior edges from exterior node bisections
    for (let clockwiseExteriorEdgeIndex = 0; clockwiseExteriorEdgeIndex < exteriorEdges.length; clockwiseExteriorEdgeIndex++) {
        const widdershinsExteriorEdgeIndex = (clockwiseExteriorEdgeIndex - 1 + exteriorEdges.length) % exteriorEdges.length;
        initialInteriorEdges.push(addBisectionEdge(graph, clockwiseExteriorEdgeIndex, widdershinsExteriorEdgeIndex))
    }

    const initialHeapEdges: HeapInteriorEdge[] = initialInteriorEdges.map((i) => {
        return {sourceNode: i, length: Number.MAX_VALUE, basisVector: graph.edges[i].basisVector}
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

            firstInteriorEdge.length = Math.min(firstInteriorEdge.length, firstDistance);
            otherInteriorEdge.length = Math.min(otherInteriorEdge.length, otherDistance);
        }

        context.heap.push(firstInteriorEdge);
    }

    return context;
}