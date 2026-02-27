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

export enum SkeletonDirection {
    Clockwise = 'clockwise',
    Widdershins = 'widdershins',
}

export interface InteriorEdge {
    id: number;
    clockwiseExteriorEdgeIndex: number;
    widdershinsExteriorEdgeIndex: number;
    intersectingEdges?: number[];
    length: number;
    maxOffset?: number;
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
    sourcePosition(edgeId: number): Vector2;
    edgeRank(edgeId: number): EdgeRank;
    isPrimaryNonReflex(edgeId: number): boolean;
    updateMaxOffset(edgeId: number, length: number): void;
    isReflexEdge(edgeA: InteriorEdge): boolean;
    clockwiseSpanExcludingAccepted(firstEdge: PolygonEdge, secondEdge: PolygonEdge): number;
    widdershinsBisector(edgeId: number): PolygonEdge;
    clockwiseBisector(edgeId: number): PolygonEdge;
    clockwiseVertexAtOffset(edgeId: number, offset: number): Vector2;
    widdershinsVertexAtOffset(edgeId: number, offset: number): Vector2;
    terminateEdgesAtPoint(edgeIds: number[], position: Vector2): PolygonNode;
    crossWireEdges(id1: number, id2: number): void;
    parentEdges(interiorEdgeId: number): { clockwise: PolygonEdge; widdershins: PolygonEdge };
    parentEdge(interiorEdgeId: number, direction: SkeletonDirection): PolygonEdge;
    exteriorParentsOfSubPolygon(interiorEdgeIds: number[]): number[];
}

export interface StraightSkeletonSolverContext extends GraphHelpers {
    graph: StraightSkeletonGraph;
    acceptedEdges: boolean[];
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
    | 'outOfBounds';

export const CollisionTypePriority: Record<CollisionType, number> = {
    interiorPair: 0,
    interiorNonAdjacent: 1,
    interiorAgainstExterior: 2,
    phantomDivergentOffset: 3,
    outOfBounds: 4,
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
export type CollisionCacheEntry = CollisionEvent[] | typeof NO_COLLISION_SENTINEL;

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