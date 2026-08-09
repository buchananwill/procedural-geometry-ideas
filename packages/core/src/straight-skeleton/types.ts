import type { Vector2 } from '../shared/types';
export type { Vector2 } from '../shared/types';

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

export interface PrimaryInteriorEdge {
    source: Vector2;
    target: Vector2;
    vertexIndex: number;
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
    clockwiseSpanIncludingAccepted(firstEdge: PolygonEdge, secondEdge: PolygonEdge): number;
    widdershinsBisector(edgeId: number): PolygonEdge;
    clockwiseBisector(edgeId: number): PolygonEdge;
    clockwiseVertexAtOffset(edgeId: number, offset: number): Vector2;
    widdershinsVertexAtOffset(edgeId: number, offset: number): Vector2;
    terminateEdgesAtPoint(edgeIds: number[], position: Vector2): PolygonNode;
    crossWireEdges(id1: number, id2: number): void;
    parentEdges(interiorEdgeId: number): { clockwise: PolygonEdge; widdershins: PolygonEdge };
    parentEdge(interiorEdgeId: number, direction: SkeletonDirection): PolygonEdge;
    exteriorParentsOfSubPolygon(interiorEdgeIds: number[]): number[];
    validateSplitReachesEdge(bisectorId: number, edgeToSplitId: number, offset: number): boolean;
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

export interface SplitOffsetResult {
    offsetDistance: number;
    position: Vector2;
    intersectionData: IntersectionResult;
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
    /**
     * Messages for sub-polygons that threw while being handled. Populated by `stepAlgorithm`,
     * which catches per-sub-polygon exceptions so that sibling sub-polygons still resolve.
     * Absent (or empty) means every input was handled without error.
     */
    errors?: string[]
}

/**
 * Classes of non-fatal problem reported by `solveSkeleton`.
 *
 * - `winding-normalised` — the input was counter-clockwise and was reversed before solving.
 * - `self-intersecting`  — the input crossed itself and was decomposed, solved per sub-polygon, and merged.
 * - `step-failure`       — a sub-polygon threw during a solver step and was skipped.
 * - `unresolved-edges`   — one or more interior edges finished the solve without a target node.
 */
export type SkeletonDiagnosticKind =
    'winding-normalised'
    | 'self-intersecting'
    | 'step-failure'
    | 'unresolved-edges';

export interface SkeletonDiagnostic {
    kind: SkeletonDiagnosticKind;
    detail: string;
}

export interface SkeletonSolveResult {
    graph: StraightSkeletonGraph;
    /**
     * The solver context used to produce `graph`, or `null` exactly when the input was
     * self-intersecting and the decompose-and-merge path was taken. A merged graph is
     * assembled from several independent solves, so no single solver context describes it —
     * `null` states that at the type level rather than handing back a context whose helpers
     * (`getInteriorWithId`, `projectRayInterior`, `clockwiseParent`, `edgeRank`, …) throw.
     * Callers that need those helpers must check for `null` first.
     */
    context: StraightSkeletonSolverContext | null;
    /**
     * True when the skeleton is fully resolved: no `step-failure` and no `unresolved-edges`
     * diagnostics, and the graph has at least one interior edge. A `winding-normalised` or
     * `self-intersecting` diagnostic on its own does not make a result incomplete.
     */
    complete: boolean;
    diagnostics: SkeletonDiagnostic[];
}