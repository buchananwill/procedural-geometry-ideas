import type { Vector2 } from '../shared/types';
import type { SkeletonNormalisation } from './normalisation';
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

/**
 * A wavefront arrival TIME, carried as the pair it was derived from (W-spec W7).
 *
 * `distance` is the perpendicular distance of the arrival point from the CLOCKWISE PARENT's
 * supporting line — exactly the number `makeOffsetDistance` has always computed — and `weight` is
 * that parent's speed. The time is `distance / weight`, and {@link timeOf} performs that division
 * for reporting, sorting keys and denormalisation only.
 *
 * EVERY TOLERANCE DECISION READS THE PAIR, NEVER THE QUOTIENT (W-spec W22, journal decision 105 and
 * arc decision 112(c)): `d₁ · w₂` against `d₂ · w₁`, with the epsilon multiplied by `w₁ · w₂`. A
 * divided quantity compared against another divided quantity is two roundings deciding an ordering.
 */
export interface Arrival {
    distance: number;
    weight: number;
    /**
     * The ERROR BUDGET of `distance`: a first-order bound, in the same (unit-space, before
     * denormalisation) length as `distance`, on how far the computed distance can lie from the
     * distance of the EXACT geometry the solver was given — the stored input doubles (journal-5
     * decisions 162(a) and 167, register C12: the COMPLETE first-order model). It charges every
     * rounding on the route: the bases' direction errors, the offset rate's forward error, the source
     * offset (and the source node's own carried position budget), the division, and the final
     * products and sums — see `arrivalUncertainty` and the error-model section of constants.ts. Set
     * ONCE, where the arrival is priced; `0` only for a quantity with no arithmetic in it (a boundary
     * vertex's zero, a bound). `pairSimultaneityWindow` widens a pair's simultaneity window by the two
     * budgets — landed and measured, but NOT spent: register C12's move of the seven window sites to it
     * STOPPED (see `HELD_SIMULTANEITY_WINDOW`).
     */
    uncertainty: number;
}

export interface InteriorEdge {
    id: number;
    clockwiseExteriorEdgeIndex: number;
    widdershinsExteriorEdgeIndex: number;
    length: number;
    /**
     * The latest TIME at which this bisector can still be carrying a wavefront vertex (W-spec W5,
     * W16). At unit weights a time and a distance are the same double, which is why this field kept
     * its name.
     */
    maxOffset?: number;
    /**
     * True when the solver deliberately retired this edge as a zero-length self-loop
     * (`target === source`) during a degenerate closure: the sub-polygon it belonged to closed
     * entirely at a single offset, and this bisector was surplus at the closure node. Edge ids are
     * array indices, so removal is not representable; the flag lets consumers distinguish a culled
     * edge from a self-loop that would indicate a solver defect.
     */
    culled?: boolean;
}

export interface StraightSkeletonGraph {
    nodes: PolygonNode[];
    edges: PolygonEdge[];
    numExteriorNodes: number;
    interiorEdges: InteriorEdge[];
    /**
     * The per-exterior-edge wavefront SPEED, indexed by exterior edge id, length
     * `numExteriorNodes` (W-spec W1, W4). Every entry is a finite, strictly positive double, and the
     * array is normalised so that its minimum is exactly `1`.
     *
     * PLAIN DATA, ON THE GRAPH, so it survives `structuredClone` into a worker or the dashboard
     * alongside everything else the graph carries. DIMENSIONLESS: `normalisation.ts` does not touch
     * it (W-spec W47).
     *
     * ON A MERGED GRAPH this is the sub-graphs' arrays concatenated in sub-graph order and is NOT
     * indexed by merged edge id — the merged path renumbers edges across sub-graphs and nothing
     * reads a weight after a merge. See `graph-merge.ts`.
     */
    exteriorWeights: number[];
    /**
     * THE LOOP TABLE (skeleton loops-input spec, decisions 3, 6 and 7): loop 0 is the outline and loop `k` the
     * caller's hole `k - 1`, each a run of exterior ids `start .. start + count - 1` in its solved vertex order.
     * Loops are contiguous from 0, each `count` is at least 3, the counts sum to `numExteriorNodes`, and an
     * exterior node's id equals its exterior edge's id. The outline's ids are therefore exactly what they were
     * before holes existed, and a single-loop graph carries `[{start: 0, count: numExteriorNodes}]`.
     *
     * PLAIN DATA, ON THE GRAPH, because stepped snapshots clone the graph only (BSA.F93). The next or previous
     * exterior edge is read through `adjacentExteriorEdge` (graph-helpers.ts), never by arithmetic on ids.
     *
     * ON A MERGED GRAPH this is EMPTY (decision 11): the merge renumbers exterior ids across sub-graphs, so they
     * are not `0 .. numExteriorNodes - 1` and no table can describe them, and the accessors refuse it by name.
     */
    loops: SkeletonLoop[];
}

/** One loop of the exterior boundary: exterior ids `start .. start + count - 1` (skeleton loops-input spec, decision 3). */
export interface SkeletonLoop {
    start: number;
    count: number;
}

/**
 * How one loop of the caller's input maps onto the solved graph (skeleton loops-input spec, decisions 3 and 24),
 * built from canonicalisation's `indexRemap` and then the winding reversal.
 */
export interface SkeletonLoopMap {
    /** Caller vertex `i` to the exterior node it became, or `REMOVED_VERTEX_INDEX` where canonicalisation removed it. */
    vertexToNode: number[];
    /**
     * Caller edge `i` (vertex `i` to vertex `i + 1`) to the exterior edge id that carries it. Where the edge's
     * start vertex was removed, that is the merged edge leaving the nearest surviving vertex before it.
     */
    edgeToEdge: number[];
    /** True when winding normalisation reversed this loop. */
    reversed: boolean;
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
    /** The wavefront speed of an EXTERIOR edge (W-spec W1). Always finite and strictly positive. */
    weightOf(exteriorEdgeId: number): number;
    accept(edgeId: number): void;
    acceptAll(edgeIds: number[]): void;
    isAccepted(edgeId: number): boolean;
    isAcceptedInterior(edge: InteriorEdge): boolean;
    /**
     * The node at exactly `position`, created if none exists. `positionUncertainty` is the position's
     * first-order error budget (journal-5 decision 167), recorded on
     * `StraightSkeletonSolverContext.positionUncertainties`; `0` for a stored position.
     */
    findOrAddNode(position: Vector2, positionUncertainty: number): PolygonNode;
    findSource(edgeId: number): PolygonNode;
    sourcePosition(edgeId: number): Vector2;
    edgeRank(edgeId: number): EdgeRank;
    isPrimaryNonReflex(edgeId: number): boolean;
    updateMaxOffset(edgeId: number, length: number): void;
    isReflexEdge(edgeA: InteriorEdge): boolean;
    widdershinsBisector(edgeId: number): PolygonEdge;
    clockwiseBisector(edgeId: number): PolygonEdge;
    /** `localTime` is a TIME; it is multiplied by the exterior edge's own weight (W-spec W40). */
    clockwiseVertexAtOffset(edgeId: number, localTime: number): Vector2;
    /** `localTime` is a TIME; it is multiplied by the exterior edge's own weight (W-spec W40). */
    widdershinsVertexAtOffset(edgeId: number, localTime: number): Vector2;
    /** Terminate `edgeIds` at the node at `position` ({@link findOrAddNode}), carrying its error budget. */
    terminateEdgesAtPoint(edgeIds: number[], position: Vector2, positionUncertainty: number): PolygonNode;
    crossWireEdges(id1: number, id2: number): void;
    parentEdges(interiorEdgeId: number): { clockwise: PolygonEdge; widdershins: PolygonEdge };
    parentEdge(interiorEdgeId: number, direction: SkeletonDirection): PolygonEdge;
    exteriorParentsOfSubPolygon(interiorEdgeIds: number[]): number[];
    /**
     * The segment of `edgeToSplitId` the bisector's split validates on, or `null` when none does (skeleton
     * wavefront-order spec, decision 11). Where several live segments validate, the first in
     * `activeExteriorEdgeSegments`' order is taken.
     */
    validateSplitReachesEdge(bisectorId: number, edgeToSplitId: number, arrival: Arrival): WavefrontSegment | null;
}

/**
 * The wavefront's order, STORED (skeleton wavefront-order spec, decisions 1 to 7): each live bisector's
 * two neighbours around its ring. Both arrays are indexed by edge id, as `acceptedEdges` is — the
 * exterior edges' slots and every bisector that is not live hold `-1`.
 *
 * PLAIN DATA, two arrays of numbers, so a `structuredClone` of the context carries it (decision 7).
 * Written by the events that change the wavefront's shape (`wavefront.ts`), and the solver's one source of
 * wavefront order: the segments of an edge, the neighbour guard, the rings of a step and the child steps of a
 * partitioning layer are all read from it (spec decisions 19 and 20).
 */
export interface Wavefront {
    clockwiseNeighbour: number[];
    widdershinsNeighbour: number[];
}

/**
 * One live segment of an exterior edge, as a linked pair (spec decision 5): `from` is the bisector whose
 * clockwise parent is `exteriorEdge`, and `to` is `from`'s clockwise neighbour.
 */
export interface WavefrontSegment {
    exteriorEdge: number;
    from: number;
    to: number;
}

export interface StraightSkeletonSolverContext extends GraphHelpers {
    graph: StraightSkeletonGraph;
    acceptedEdges: boolean[];
    /** The wavefront's neighbour links (spec decision 1), the solver's source of wavefront order. */
    wavefront: Wavefront;
    collisionCache: CollisionCache;
    /**
     * The client's perceptual floor for this solve, in the unit space the graph is being solved in.
     *
     * ON THE CONTEXT BECAUSE THE EVENT LAYER NEEDS IT AND NOTHING BETWEEN THEM DOES. The only
     * production consumer is `coincident-events.ts`'s "are these two arrivals one vertex event?" bar,
     * which sits four call hops below the entry point that was handed the option; carrying it as a
     * parameter through `stepAlgorithm` and the per-arity handlers would put a floor in the signature
     * of three functions that have no opinion about one. See `PerceptualFloorOptions`.
     */
    perceptualFloor: number;
    /**
     * The lane width, in unit-space distance, within which two sources count as lying on ONE LINE
     * (spec A9/A10, journal decision 136). Derived once from {@link perceptualFloor} by
     * `coaxialityFloor` at context construction and carried here so that every coaxiality site
     * spends the same number.
     *
     * ON THE CONTEXT FOR THE SAME REASON THE FLOOR IS: `intersectRays` takes it as an explicit
     * parameter and must be handed it by whoever calls it, and the callers four hops below the entry
     * point have a context and nothing else.
     */
    coaxialityFloor: number;
    /**
     * THE angular resolution for this solve, as a sine (spec A1–A8, journal decision 146): the one bar
     * below which two directions are identical and above which an intersection of them is priced.
     * Derived once from {@link perceptualFloor} by `angularResolution` at context construction and
     * carried here, beside {@link coaxialityFloor}, so every angular site spends the same double and
     * no site recomputes the square root (spec A8).
     */
    angularResolution: number;
    /**
     * THE CAP of the simultaneity window for this solve, as a length (C8 spec T5, T12–T14; journal
     * decisions 155, 158, 160 and 167): two arrivals are one moment of the wavefront clock when
     * `|d₁·w₂ − d₂·w₁|` is inside their PAIR's window — the moment bar widened by their two error
     * budgets — and never wider than `simultaneityWindow · min(w₁, w₂)`; anchored on the earliest
     * arrival, never transitive (`compareArrivalsAtPairWindow`). Derived once from
     * {@link perceptualFloor} by `simultaneityWindow` at context construction and carried here beside
     * {@link coaxialityFloor} and {@link angularResolution}, so every window site — the layer, the
     * phantom test, the snap's equal-time check, the closure's simultaneity and the three
     * birth-causality tests — can spend one double. NOT YET SPENT: the sites hold
     * `HELD_SIMULTANEITY_WINDOW` (1e-8) under the T37 STOPs of C8 dispatches 1 and 2 and of register
     * C12; see constants.ts.
     */
    simultaneityWindow: number;
    /**
     * Each node's POSITION ERROR BUDGET, indexed by node id (journal-5 decision 167, part (iii) of the
     * complete first-order model): how far the node's stored position can lie from the exact point of
     * the geometry the solver was given. `0` for a boundary vertex (a stored input double); for an
     * interior node, the budget of the event position that created it — the largest, where several
     * events land on one node. Read wherever a bisector sourced at the node is priced, so a priced
     * position's error is CARRIED into every arrival downstream of it. A length in the graph's space:
     * unit space during the solve, carried to caller space with the graph. Not carried across a merge.
     */
    positionUncertainties: number[];
    /**
     * Informational reports the SOLVE itself made, as opposed to the boundary stage.
     *
     * The only producer today is A19's coaxial completion, which is entered deep inside the per-arity
     * handlers and has no other way to be heard: `stepAlgorithm` carries THROWN messages out on
     * `errors`, and a completion is by definition the case that did not throw. `solveSkeleton` drains
     * this onto its own `diagnostics`, so a completion is signalled, never silent.
     */
    diagnostics: SkeletonDiagnostic[];
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
    /** A TIME — `timeOf(arrival)` (W-spec W5). */
    offsetDistance: number;
    /** The pair every predicate reads (W-spec W7). */
    arrival: Arrival;
    position: Vector2;
    /** `position`'s first-order error budget (journal-5 decision 167). */
    positionUncertainty: number;
    intersectionData: IntersectionResult;
}

export interface CollisionEvent {
    /** A TIME — `timeOf(arrival)` (W-spec W5). At unit weights this is today's distance. */
    offsetDistance: number;
    /** The pair every predicate reads (W-spec W7, W22). */
    arrival: Arrival;
    /**
     * The first-order error budget of `position` against the exact geometry (journal-5 decision 167):
     * carried onto the node the event creates (`StraightSkeletonSolverContext.positionUncertainties`).
     */
    positionUncertainty: number;
    collidingEdges: number[]; // first two are instigator and main result, i.e. exterior edge if split, otherwise intersection. Other indices if present are bisector rays to also accept in this event.
    position: Vector2;
    intersectionData: IntersectionResult
    eventType: CollisionType
    /**
     * The segment of the struck exterior edge this split validated on (spec decision 11). Set on every
     * `interiorAgainstExterior` event; the split rewrites the wavefront's links around it (decision 12).
     */
    struckSegment?: WavefrontSegment
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

/**
 * A bisector to be born: which two exterior parents bound it, and which node it leaves from.
 *
 * NO DIRECTION HINT, AND THAT IS DELIBERATE. This carried an `approximateDirection` that
 * `addBisectionEdge` used to flip the parent-derived basis with. The basis is never in doubt — the
 * offset rate decides it, and where the rate is zero the parents are anti-parallel and their
 * ORDERING decides it — so the hint could only ever overrule a correct answer, and measurably did:
 * see `addBisectionEdge`.
 */
export interface BisectionParams {
    clockwiseExteriorEdgeIndex: number;
    widdershinsExteriorEdgeIndex: number;
    source: number;
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
 * - `winding-normalised`     — the input was counter-clockwise and was reversed before solving.
 * - `vertices-canonicalised` — vertices too small to see were removed from the boundary before solving.
 * - `self-intersecting`      — the input crossed itself and was decomposed, solved per sub-polygon, and merged.
 * - `step-failure`           — a sub-polygon threw during a solver step and was skipped.
 * - `unresolved-edges`       — one or more interior edges finished the solve without a target node.
 * - `coaxial-completion`     — a sub-polygon with live interior edges produced no event and no
 *   closure, and the solver COMPLETED it rather than throwing: it priced the anti-parallel,
 *   pointing-together pair with the smallest symmetric lateral offset as head-on (spec A19, journal
 *   decision 136 as amended). INFORMATIONAL — it does not make a result incomplete — but it is
 *   never expected: a bounded wavefront with live vertices must have a next event, so reaching this
 *   at all means a predicate refused an event that exists, and the detail names both edge ids and
 *   the offset so the specimen can be found.
 * - `causality-violation`    — the solved graph breaks wavefront causality by one of the four
 *   post-solve oracles (journal-5 decision 148, C8 spec T18): one diagnostic per violation, carried as a
 *   {@link CausalityViolationDiagnostic}. INFORMATIONAL with respect to `complete` — `complete` keeps
 *   its meaning (every exterior edge accepted, no step failure, no unresolved edge) — but it is what
 *   makes a wrong answer SIGNALLED: a solve can never report `complete: true` with empty diagnostics
 *   while violating wavefront causality. See `causality-check.ts`.
 * - `holes-not-solved`       — the input carried holes, and the solve STOPPED after initialisation, returning
 *   its initialised graph with one wavefront ring per loop and no skeleton (skeleton loops-input spec, decisions
 *   33 to 35). BLOCKING: it makes `complete` false by itself. It stands until the join event of the holed-skeleton
 *   roadmap's node 4, which replaces it.
 */
export type SkeletonDiagnosticKind =
    'winding-normalised'
    | 'vertices-canonicalised'
    | 'self-intersecting'
    | 'step-failure'
    | 'unresolved-edges'
    | 'coaxial-completion'
    | 'causality-violation'
    | 'holes-not-solved';

/** Every diagnostic kind except `causality-violation`, which carries structured fields of its own. */
export type GeneralSkeletonDiagnosticKind = Exclude<SkeletonDiagnosticKind, 'causality-violation'>;

/** A diagnostic whose whole content is its kind and a human detail line. */
export interface GeneralSkeletonDiagnostic {
    kind: GeneralSkeletonDiagnosticKind;
    detail: string;
}

/**
 * Which of the four post-solve causality oracles a violation was found by (journal-5 decisions 148,
 * 149(b); C8 spec T18).
 *
 * - `offset`    — an interior edge whose target is dated earlier than its source.
 * - `clearance` — an interior node dated later than its own distance to the solver's boundary.
 * - `direction` — an interior edge whose target lies behind its source along its own basis vector.
 * - `rate`      — an interior edge whose offset rate against its clockwise parent is NEGATIVE while
 *   its two parents are NOT anti-parallel at the angular resolution: it runs backwards through the
 *   wavefront (T18, the exact complement of `addBisectionEdge`'s zero-rate predicate, T17).
 */
export type CausalityOracle = 'offset' | 'clearance' | 'direction' | 'rate';

/**
 * One wavefront-causality violation found on a solved graph by `checkWavefrontCausality`.
 *
 * `elementId` is an INTERIOR EDGE id for the `offset`, `direction` and `rate` oracles and a NODE id for
 * the `clearance` oracle. `magnitude` is in UNIT SPACE — the solve's own normalised coordinates — so it
 * reads against the perceptual floor the check was run at: the backwards step in time (`offset`), the
 * overshoot past clearance (`clearance`), or the distance the target lies behind the source along the
 * basis (`direction`). For `rate` it is the magnitude of the negative rate, a dimensionless sine.
 */
export interface CausalityViolationDiagnostic {
    kind: 'causality-violation';
    detail: string;
    oracle: CausalityOracle;
    elementId: number;
    magnitude: number;
}

export type SkeletonDiagnostic = GeneralSkeletonDiagnostic | CausalityViolationDiagnostic;

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
     * True when the skeleton is fully resolved: no `step-failure`, `unresolved-edges` or
     * `holes-not-solved` diagnostics, and the graph has at least one interior edge. A `winding-normalised`,
     * `vertices-canonicalised` or `self-intersecting` diagnostic on its own does not make a result
     * incomplete — all three are informational reports of what the boundary stage did to the input.
     */
    complete: boolean;
    diagnostics: SkeletonDiagnostic[];
    /**
     * The unit-extent transform this solve used, ALREADY UNDONE on `graph` and on `context` — it is
     * carried so that downstream consumers can scale their own LENGTH-DIMENSIONED INPUTS across the
     * same seam.
     *
     * The solver's `1e-8` epsilon is absolute, so the polygon is normalised to unit extent before
     * solving and denormalised afterwards; anything a caller feeds back in that is measured in the
     * caller's units has to make the same trip. Strip depth and `minWidth`/`maxWidth` go through
     * `normaliseLength`; `minArea`/`maxArea` go through `normaliseArea`, which squares. Dimensionless
     * quantities — fractions of the maximum offset, aspect-ratio bounds — cross the seam untouched.
     */
    normalisation: SkeletonNormalisation;
    /**
     * The per-exterior-edge weights the solve actually ran on: normalised to minimum `1` (W-spec W4)
     * and remapped through every boundary-stage index change — canonicalisation's removals and the
     * winding reversal (W-spec W45). Length matches `graph.numExteriorNodes` on the simple path.
     *
     * All ones when the caller passed no weights. A holed solve carries every loop's weights, concatenated in
     * exterior id order (skeleton loops-input spec, decision 34).
     */
    weights: number[];
    /**
     * Each loop of the caller's input mapped onto the solved graph (skeleton loops-input spec, decisions 3, 24 and
     * 25): index 0 the outline, then the holes in the order given. `null` EXACTLY WHEN `context` is `null`, on the
     * self-intersecting single-loop path, because the decomposition renumbers; every other solve carries a map per
     * loop, its reversal included.
     */
    loopMaps: SkeletonLoopMap[] | null;
}