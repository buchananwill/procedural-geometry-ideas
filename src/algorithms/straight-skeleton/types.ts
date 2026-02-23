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
    heapGeneration: number;
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
    ownerId: number;               // evaluated edge (its intersectingEdges has full participant list)
    participatingEdges: number[];  // [ownerId, ...intersectors] — for stale-event checking
    eventDistance: number;         // frozen max distance among all participants — for heap ordering
    generation: number;            // must match InteriorEdge.heapGeneration to be valid
}

export interface IntersectorInfo {
    edgeId: number;
    distanceAlongSelf: number;
    distanceAlongOther: number;
    priorityOverride?: number;
}

export interface EdgeIntersectionEvaluation {
    edgeIndex: number;
    shortestLength: number;
    intersectors: IntersectorInfo[];
    candidates: { otherId: number; distanceNew: number; distanceOther: number; priorityOverride?: number }[];
}

export interface StepResult {
    poppedEdgeId: number;
    acceptedInteriorEdges: number[];
    newInteriorEdgeIds: number[];
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

export type IntersectionType = 'converging' | 'head-on' | 'parallel' | 'diverging' | 'identical-source' | 'co-linear-from-1' | 'co-linear-from-2'

export type IntersectionResult = [number, number, IntersectionType]