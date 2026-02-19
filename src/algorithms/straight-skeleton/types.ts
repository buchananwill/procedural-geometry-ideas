import Heap from "heap-js";

export interface Vector2 {
    x: number;
    y: number;
}

export interface PolygonNode {
    id: number;
    position: Vector2;
    inEdges: number[];
    outEdges: number[];
}

export interface PolygonEdge {
    id: number;
    source: number;
    target?: number;
    basisVector: Vector2;
}

export interface InteriorEdge {
    id: number;
    clockwiseExteriorEdgeIndex: number;
    widdershinsExteriorEdgeIndex: number;
    intersectingEdges: number[];
    length: number;
}

export interface StraightSkeletonGraph {
    nodes: PolygonNode[];
    edges: PolygonEdge[];
    numExteriorNodes: number;
    interiorEdges: InteriorEdge[];
}

export interface RayProjection {
    basisVector: Vector2;
    sourceVector: Vector2;
}

export interface HeapInteriorEdge {
    id: number;
}

/*
Solving context:
1. SSGraph
2. A heap with custom comparator
3. List of bools for accepted exterior edges
* */

export interface StraightSkeletonSolverContext {
    graph: StraightSkeletonGraph;
    acceptedEdges: boolean[];
    heap: Heap<HeapInteriorEdge>;
}

