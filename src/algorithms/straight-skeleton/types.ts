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

export type EdgeRank = 'exterior' | 'primary' | 'secondary';

export interface InteriorEdge {
    id: number;
    clockwiseExteriorEdgeIndex: number;
    widdershinsExteriorEdgeIndex: number;
    intersectingEdges?: number[];
    length: number;
    maxOffset?: number;
    heapGeneration?: number;
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

export interface GraphHelpers {
    getEdgeWithInterior(interiorEdge: InteriorEdge): PolygonEdge;

    getEdgeWithId(id: number): PolygonEdge;

    getEdges(idList: number[]): PolygonEdge[];

    getInteriorWithId(id: number): InteriorEdge;

    getInteriorEdges(idList: number[]): InteriorEdge[]

    projectRay(edge: PolygonEdge): RayProjection;

    projectRayReversed(edge: PolygonEdge): RayProjection;

    projectRayInterior(edge: InteriorEdge): RayProjection;

    clockwiseParent(edge: InteriorEdge): PolygonEdge;

    widdershinsParent(edge: InteriorEdge): PolygonEdge;

    accept(edgeId: number): void;

    acceptAll(edgeIds: number[]): void;

    isAccepted(edgeId: number): boolean;

    isAcceptedInterior(edge: InteriorEdge): boolean;

    findOrAddNode(position: Vector2): PolygonNode;

    findSource(edgeId: number): PolygonNode;

    edgeRank(edgeId: number): EdgeRank;

    isPrimaryNonReflex(edgeId: number): boolean;

    updateMinLength(edgeId: number, length: number): void;

    updateMaxOffset(edgeId: number, length: number): void;

    resetMinLength(edgeId: number): void;

    isReflexEdge(edgeA: InteriorEdge): boolean;

    clockwiseSpanExcludingAccepted(firstEdge: PolygonEdge, secondEdge: PolygonEdge): number;

    widdershinsBisector(edgeId: number): PolygonEdge;

    clockwiseBisector(edgeId: number): PolygonEdge;
}

export interface StraightSkeletonSolverContext extends GraphHelpers {
    graph: StraightSkeletonGraph;
    acceptedEdges: boolean[];
    heap: Heap<HeapInteriorEdge>;
    collisionCache: CollisionCache;
}

export type IntersectionType =
    'converging'
    | 'head-on'
    | 'parallel'
    | 'diverging'
    | 'identical-source'
    | 'co-linear-from-1'
    | 'co-linear-from-2'

export type IntersectionResult = [number, number, IntersectionType]

export type CollisionType =
    'interiorPair'
    | 'interiorNonAdjacent'
    | 'interiorAgainstExterior'
    | 'phantomDivergentOffset'

export const CollisionTypePriority: Record<CollisionType, number> = {
    interiorPair: 0,
    interiorNonAdjacent: 1,
    interiorAgainstExterior: 2,
    phantomDivergentOffset: 3
}

export interface CollisionEvent {
    offsetDistance: number;
    collidingEdges: number[]; // first two are instigator and main result, i.e. exterior edge if split, otherwise intersection. Other indices if present are bisector rays to also accept in this event.
    position: Vector2;
    intersectionData: IntersectionResult
    eventType: CollisionType
}

/** Sentinel stored in the collision cache when collideEdges returned null. */
export const NO_COLLISION_SENTINEL = Symbol('no-collision');

/** A single cache entry: either a real CollisionEvent, or the sentinel for "computed, was null". */
export type CollisionCacheEntry = CollisionEvent | typeof NO_COLLISION_SENTINEL;

/**
 * Nested map keyed by (edgeIdA, edgeIdB) in call order.
 * Outer key = edgeIdA, inner key = edgeIdB.
 */
export type CollisionCache = Map<number, Map<number, CollisionCacheEntry>>;

export interface BisectionParams {
    clockwiseExteriorEdgeIndex: number;
    widdershinsExteriorEdgeIndex: number;
    source: number;
    approximateDirection?: Vector2
}

/*
* State journey:
*   - Overall algorithm is a tree
*   - Each child state comprises the list of interior edges to form a new state
*   - Edge collapse events result in one child with fewer edges in total
*   - Edge split events result in partitioning the edges into dis-continuous regions
* */

export interface AlgorithmStepInput {
    interiorEdges: number[]
}

export interface AlgorithmStepOutput {
    childSteps: AlgorithmStepInput[]
}