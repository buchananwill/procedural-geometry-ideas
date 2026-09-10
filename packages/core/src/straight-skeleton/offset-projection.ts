import type {InteriorEdge, SkeletonSolveResult, StraightSkeletonSolverContext, Vector2} from './types';
import {addVectors, dotProduct, projectFromPerpendicular, scaleVector, vectorsAreEqual} from './core-functions';

/**
 * Projection of a solved straight skeleton back into wavefront positions.
 *
 * The skeleton is the trace of the polygon boundary moving inward, each exterior edge at its own
 * speed. This module runs that trace backwards: given a solved skeleton and a TIME `t`, it
 * reconstructs where the wavefront was at `t`.
 *
 * ## Every "offset" in this module is a TIME (W-spec W5, W40)
 *
 * A weight is a per-exterior-edge speed, so the wavefront of edge `e` stands at perpendicular
 * distance `w_e · t` from its supporting line at time `t`. The two quantities are the same number
 * only when every weight is one, which is why the names here still read "offset": at unit weights a
 * time and a distance ARE the same double, and every product and quotient with a weight below is by
 * exactly `1.0` and therefore the identity. Under weights they come apart, and the answer this
 * module owes its callers is the equi-time front — every wall advanced for the same duration at its
 * own speed — because that is the only front whose pieces still meet at the skeleton's own nodes.
 *
 * The consequence for a caller who wants a physical setback: asking for a four-metre road on edge
 * `e` is asking for time `4 / w_e`, and one time gives different setbacks on differently-weighted
 * edges by construction. That is the point of weights, not a defect in the projection.
 *
 * ## Why rings, plural
 *
 * Offsetting a non-convex polygon inward is not shape-preserving. Where the boundary pinches, the
 * wavefront separates into disconnected loops, and past that moment a single ring is simply the
 * wrong answer. {@link computeOffsetRings} therefore returns zero or more rings and never collapses
 * them into one.
 *
 * ## Lifetimes
 *
 * Every interior edge (bisector) is alive over a half-open offset interval `[birth, death)`:
 *
 * - `birth` is the offset of the bisector's source node — zero for primary bisectors, which start
 *   at original polygon vertices, and the node's own offset for secondary bisectors created by a
 *   collapse or split event.
 * - `death` is the offset of the node the bisector terminates at.
 *
 * The interval is half-open: a bisector that dies exactly at `t` is **excluded** at `t`, and a
 * bisector born exactly at `t` is **included**. That keeps the two ends of an event from both
 * contributing a vertex at the instant the event happens.
 *
 * ## Both ends of a lifetime come from one table
 *
 * `birth` and `death` are the same quantity — a node's offset — read for two different nodes, so
 * they are both read from the single map {@link computeNodeOffsets} builds and never derived a
 * second way. That is load-bearing rather than tidy. At an event, one bisector dies at the node
 * where the next is born, and the half-open interval hands the wavefront vertex from the first to
 * the second only if `death` of the one is bit-for-bit `birth` of the other. Deriving `birth`
 * independently — from `sourceOffsetDistance`, say, which the solver uses and which reaches the
 * same number by a different route — makes the two disagree in the last few bits, and wherever they
 * disagree the hand-over drops a bisector that nothing replaces. A dropped bisector breaks the
 * chain of wavefront segments and costs the whole ring.
 *
 * Because the two ends agree exactly, the comparison needs no slack and is not given any. A
 * tolerance here does not buy robustness: widening the interval makes a bisector alive at both ends
 * of an event and duplicates a vertex, and shifting it — which is what a tolerance subtracted from
 * both ends does — reintroduces exactly the dropout it was meant to guard against.
 *
 * ## Times are re-derived, not read back
 *
 * A node's time is computed from raw geometry — the perpendicular distance from the node to the
 * supporting line of one of the original polygon edges that defines it, DIVIDED BY THAT EDGE'S OWN
 * WEIGHT — rather than from anything the solver recorded about timing. Exterior nodes lie on the
 * boundary, so their time is zero.
 *
 * ## Where one instant is several numbers, and how the table is made to say so
 *
 * Everything above is about a hand-over *at one node*, and it is correct as written. There is a
 * second case it does not cover, measured on the near-regular fixtures and recorded in
 * `near-regular-ring-loss-diagnosis.test.ts`.
 *
 * A symmetric polygon produces *simultaneous mirror events*: two or more events at genuinely
 * different places in the plane that happen at the same offset. Each node's offset is re-derived
 * from the supporting line of one of its own parent edges, and mirror nodes have different parent
 * edges, so one instant comes back as several offsets 7e-15 to 3.5e-13 apart. There is no single
 * table entry to read them both from.
 *
 * Querying at the lowest of such a set left the bisectors meeting at the others alive by the
 * table while they had already met in the plane. Their span along the exterior edge they share
 * then had length zero or slightly negative, {@link segmentsAlongExteriorEdge} dropped both of its
 * endpoints, the chain lost its successor, and the ring was reported as an {@link UnclosedChain}.
 * So the claim below that two live bisectors bounding a zero-length span cannot occur holds for a
 * single node and failed across a simultaneous pair.
 *
 * ### The resolution: canonicalise the table, never the comparison
 *
 * {@link computeNodeOffsets} now collapses each simultaneous set of re-derived offsets to one
 * identical value before it returns, so mirror nodes agree bit-for-bit by construction rather than
 * by luck, and the argument above holds across a mirror set exactly as it holds at one node.
 *
 * **No slack was added to any comparison, and none is admissible.** Widening the half-open
 * lifetime makes a bisector alive at both ends of an event and duplicates a vertex; shifting it
 * reintroduces the dropout. What changed is the *table those comparisons read*. Every lifetime
 * comparison downstream is still bit-exact.
 *
 * The proximity tolerance is relative to the skeleton's own maximum offset — offsets are
 * caller-space lengths, so an absolute one would mean different things at different magnitudes —
 * and the partition is by connected components, never first match. See
 * {@link SIMULTANEITY_RELATIVE_TOLERANCE} for the measured bounds either side of it.
 *
 * ## Preconditions
 *
 * Every entry point requires `result.complete === true` and `result.context !== null`. A
 * self-intersecting input yields a merged graph with no solver context and cannot be projected;
 * callers must resolve the self-intersection first (see `decomposePolygon`) and project each
 * sub-polygon's own solve.
 */

/**
 * A bisector that is alive at the requested offset, with its wavefront position there.
 *
 * `clockwiseParentId` and `widdershinsParentId` are exterior edge ids: the bisector opens a
 * wavefront span on the first and closes one on the second, which is how {@link
 * segmentsAlongExteriorEdge} pairs endpoints into segments.
 */
export interface AliveBisector {
    id: number;
    position: Vector2;
    clockwiseParentId: number;
    widdershinsParentId: number;
}

/** One end of a wavefront segment, keyed to the bisector that produces it. */
interface SegmentEndpoint {
    bisectorId: number;
    position: Vector2;
    alongEdge: number;
    isStart: boolean;
}

/** A piece of the wavefront lying on the inward offset of a single exterior edge. */
interface WavefrontSegment {
    exteriorEdgeId: number;
    startBisectorId: number;
    endBisectorId: number;
    startPosition: Vector2;
    endPosition: Vector2;
}

/**
 * A vertex of an offset ring, with the bisector it rides on.
 *
 * The bisector id is the interior edge id of the skeleton arc that carries this wavefront vertex at
 * the requested offset. Two rings vertices with the same id are the same arc sampled twice.
 */
export interface OffsetRingVertex {
    position: Vector2;
    bisectorId: number;
}

/**
 * A straight piece of an offset ring, together with the exterior edge that produced it.
 *
 * `exteriorEdgeId` indexes `graph.edges` in the exterior range `[0, graph.numExteriorNodes)`. The
 * segment is the inward offset of that edge at the requested distance, so it is parallel to it and
 * runs in the same direction — `start` is the end nearer the exterior edge's source.
 */
export interface OffsetRingSegment {
    exteriorEdgeId: number;
    start: OffsetRingVertex;
    end: OffsetRingVertex;
}

/**
 * One closed loop of the wavefront, with the provenance of every part of it.
 *
 * `vertices` is the ring in clockwise order with no duplicated closing vertex — the same list
 * {@link computeOffsetRings} returns, only annotated. `segments` is the same loop expressed as its
 * pieces: `segments[i]` runs from `vertices[i]` to `vertices[i + 1]`, wrapping at the end, so the
 * two arrays always have the same length.
 */
export interface OffsetRing {
    vertices: OffsetRingVertex[];
    segments: OffsetRingSegment[];
}

/** Why a run of wavefront segments never closed into a ring. */
export type UnclosedChainReason =
    /** The last segment's end bisector opens no segment anywhere: the wavefront has a loose end. */
    | 'no-successor'
    /** The walk rejoined itself part way along instead of at the seed: the wavefront forked. */
    | 'rejoined-mid-chain';

/**
 * A run of wavefront segments that never closed, and is therefore missing from the projection.
 *
 * This is always a defect, never a shape. The wavefront at any offset short of the maximum is a set
 * of closed loops; a run with a loose end means the projection failed to reconstruct one of them,
 * and the area it would have enclosed is simply absent from {@link OffsetProjection.rings}. A caller
 * that cannot tell "there are no lots here" from "the projection failed" will read the loss as the
 * former, which is why this is reported rather than dropped.
 */
export interface UnclosedChain {
    reason: UnclosedChainReason;
    /** Exterior edge ids of the segments walked, in walk order. */
    exteriorEdgeIds: number[];
    /** Bisector ids along the run: each segment's start, then the final segment's end. */
    bisectorIds: number[];
    /** Where the run began. */
    start: Vector2;
    /** Where the walk stopped, having found nothing to continue to. */
    end: Vector2;
}

/**
 * A closed cycle that enclosed no area and was dropped.
 *
 * Unlike an {@link UnclosedChain} this is not a defect. Fewer than three segments of non-zero length
 * cannot bound a region, so the cycle contributes nothing whether it is kept or not. It is reported
 * only so that the count of cycles found and the count of rings returned can be reconciled.
 */
export interface DegenerateCycle {
    /** Bisector ids along the cycle, in walk order. */
    bisectorIds: number[];
    /** Segments in the cycle before zero-length ones were dropped. */
    segmentCount: number;
    /** Segments of non-zero length that survived: always fewer than three, or it would be a ring. */
    keptSegmentCount: number;
}

/**
 * Everything the projection found at one offset, including what it could not use.
 *
 * `rings` is the answer. The other two fields are the account of what did not make it into that
 * answer: `unclosedChains` is wavefront the projection failed on and `degenerateCycles` is wavefront
 * that was genuinely empty. A projection is sound exactly when `unclosedChains` is empty.
 */
export interface OffsetProjection {
    /** The TIME projected to, echoed back (W-spec W5). */
    offset: number;
    /** The closed rings — the same value {@link computeOffsetRingsDetailed} returns. */
    rings: OffsetRing[];
    /** Runs of wavefront that never closed. Non-empty means rings are missing from `rings`. */
    unclosedChains: UnclosedChain[];
    /** Closed cycles that bounded no area and were dropped. Harmless. */
    degenerateCycles: DegenerateCycle[];
}

/**
 * Preconditions shared by every entry point in this module: the solve must be complete and must
 * carry the solver context that produced it.
 *
 * Exported so that modules built on top of the projection — strip decomposition, and anything else
 * that walks the same graph — reject the same inputs for the same reasons instead of inventing
 * their own checks.
 *
 * @throws if the solve is incomplete or has no solver context.
 */
export function requireProjectableResult(result: SkeletonSolveResult, caller: string): StraightSkeletonSolverContext {
    if (!result.complete) {
        throw new Error(
            `${caller} requires a complete skeleton solve. The result reports complete === false; ` +
            `inspect result.diagnostics for the step failures or unresolved edges that caused it.`,
        );
    }
    if (result.context === null) {
        throw new Error(
            `${caller} requires a solver context, but result.context is null. That happens exactly when ` +
            `the input self-intersected and was decomposed and merged. Resolve the self-intersection ` +
            `before solving, then project each sub-polygon's own result.`,
        );
    }
    return result.context;
}

/** Perpendicular distance from p to the infinite line through a and b. */
function distanceToSupportingLine(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
        return Math.hypot(p.x - a.x, p.y - a.y);
    }
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
}

/**
 * How far apart two re-derived TIMES of one simultaneous event may lie, as a fraction of the
 * skeleton's own maximum time.
 *
 * UNCHANGED UNDER WEIGHTS, AND BEING RELATIVE IS WHY (W-spec W40). The quantity it partitions is
 * now a time rather than a distance, and both it and the scale it is taken against moved by the
 * same division, so the fraction means what it always did. An absolute bar here would have had to
 * be re-derived per weight.
 *
 * RELATIVE, NEVER ABSOLUTE. Node offsets are caller-space lengths, so an absolute tolerance would
 * mean a different thing on a polygon spanning 1e-3 and one spanning 1e8 — the precise defect
 * unit-extent normalisation exists to remove. The scale comes from the solved geometry rather than
 * from a world constant.
 *
 * STATED AND MEASURED, NOT CHOSEN. Over `CLEAN_TEST_POLYGONS` plus the four near-regular fixtures,
 * with offsets taken relative to each solve's maximum:
 *
 * - the widest gap *within* one instant is **1.42e-15** (Near Regular Ellipse 32: 1.42e-13 absolute
 *   against a maximum offset of 99.79), and every within-instant gap measured lies below 1e-14;
 * - the narrowest gap to a genuinely distinct event is **1.23e-4** (Duck Octagon (fails): 9.42e-3
 *   absolute against a maximum offset of 76.89).
 *
 * The two bounds are eleven orders of magnitude apart, so this value is not marginal: it sits ~700x
 * above the largest spread it must close and ~1e8x below the smallest gap it must not cross. Were
 * they within an order of magnitude of each other, that would be a finding against the whole
 * approach rather than a tolerance to tune.
 *
 * This is NOT slack in a lifetime comparison. It partitions the table; the comparisons that read
 * the table stay bit-exact. See the module header.
 */
const SIMULTANEITY_RELATIVE_TOLERANCE = 1e-12;

/**
 * One simultaneous event as the table sees it: the nodes that reach it, and the distinct offsets
 * they re-derived for it.
 *
 * `offsets` is ascending and deduplicated; `nodeIds` is every node reading one of them.
 */
interface SimultaneousOffsetSet {
    nodeIds: number[];
    offsets: number[];
}

/**
 * Wavefront TIME of every node in the solved skeleton, keyed by node id (W-spec W5, W40).
 *
 * Exterior nodes lie on the original boundary and are mapped to zero. Every other node is mapped to
 * the perpendicular distance from its position to the supporting line of one of the original polygon
 * edges that defines it — found via the `clockwiseExteriorEdgeIndex` of an incident interior edge —
 * DIVIDED BY THAT EDGE'S WEIGHT. At unit weights the divisor is exactly `1.0`, so this is the same
 * table the unweighted solver has always produced, to the bit.
 *
 * Nodes that belong to one simultaneous event receive one identical value: the re-derived distances
 * are partitioned into simultaneous sets and each set is collapsed onto one of its own members. Two
 * nodes at the same offset and different positions remain two nodes — this unifies *offsets*, and
 * touches neither the graph nor any node's position.
 *
 * A node with no incident interior edge is absent from the map rather than guessed at.
 *
 * @throws if the solve is incomplete or has no solver context.
 */
export function computeNodeOffsets(result: SkeletonSolveResult): Map<number, number> {
    requireProjectableResult(result, 'computeNodeOffsets');

    const offsets = new Map<number, number>();
    for (let nodeId = 0; nodeId < result.graph.numExteriorNodes; nodeId++) {
        offsets.set(nodeId, 0);
    }

    const interiorOffsets = rederiveInteriorNodeOffsets(result);
    for (const [nodeId, offset] of canonicaliseSimultaneousOffsets(interiorOffsets)) {
        offsets.set(nodeId, offset);
    }

    return offsets;
}

/**
 * The raw wavefront TIME re-derived for every interior node, before canonicalisation.
 *
 * THE DIVISION BY THE PARENT'S WEIGHT IS THE WHOLE OF W-SPEC W40. The wavefront of exterior edge
 * `e` stands at perpendicular distance `w_e · t` from its supporting line at time `t`, so the
 * distance this function measures is that edge's clock reading only once divided by that edge's own
 * speed. The edge divided by is the one the node is dated against — the clockwise parent of the
 * first incident bisector — so numerator and denominator name the same wall, which is what makes the
 * answer the same number from any wall the node touches (the equi-time property, W-spec W39(i)).
 *
 * AT UNIT WEIGHTS THE DIVISOR IS EXACTLY `1.0` AND THE QUOTIENT IS THE DIVIDEND, bit for bit, for
 * every finite double. So the table this returns, everything downstream reads from it, and the
 * whole 59-fixture corpus are untouched by weights they do not use.
 *
 * Exterior nodes are excluded and stay out of the partition entirely. Their time is zero by
 * construction rather than by re-derivation, so it carries none of the last-bit disagreement the
 * partition exists to reconcile, and letting a set straddle the boundary could move it off zero —
 * which would take the original polygon away from `time === 0`.
 */
function rederiveInteriorNodeOffsets(result: SkeletonSolveResult): Map<number, number> {
    const {graph} = result;
    const exteriorEdgeCount = graph.numExteriorNodes;

    const parentEdgeOf = new Map<number, number>();
    for (const interiorEdge of graph.interiorEdges) {
        parentEdgeOf.set(interiorEdge.id, interiorEdge.clockwiseExteriorEdgeIndex);
    }

    const offsets = new Map<number, number>();
    for (let nodeId = exteriorEdgeCount; nodeId < graph.nodes.length; nodeId++) {
        const node = graph.nodes[nodeId];
        const parentEdgeId = firstIncidentParentEdge(node.inEdges, node.outEdges, parentEdgeOf);
        if (parentEdgeId === undefined) {
            continue;
        }
        offsets.set(
            nodeId,
            distanceToSupportingLine(
                node.position,
                graph.nodes[parentEdgeId].position,
                graph.nodes[(parentEdgeId + 1) % exteriorEdgeCount].position,
            ) / graph.exteriorWeights[parentEdgeId],
        );
    }

    return offsets;
}

/**
 * The exterior edge that dates a node: the clockwise parent of the first bisector incident to it
 * that has one. `undefined` when the node has no incident interior edge, which is why such a node is
 * absent from the table rather than guessed at.
 */
function firstIncidentParentEdge(
    inEdges: number[],
    outEdges: number[],
    parentEdgeOf: Map<number, number>,
): number | undefined {
    for (const edgeId of new Set([...inEdges, ...outEdges])) {
        const parentEdgeId = parentEdgeOf.get(edgeId);
        if (parentEdgeId !== undefined) {
            return parentEdgeId;
        }
    }
    return undefined;
}

/**
 * The largest of `offsets`, and zero when there are none.
 *
 * A time is never negative, so the zero floor is only ever the empty case: a solve with nothing to
 * measure spans no time. Every "how long does this wavefront run" in the module reads this rather
 * than restating the loop, so the three of them cannot drift apart.
 */
function largestOffset(offsets: Iterable<number>): number {
    let largest = 0;
    for (const offset of offsets) {
        if (offset > largest) {
            largest = offset;
        }
    }
    return largest;
}

/**
 * The same table with every simultaneous set collapsed onto a single value.
 *
 * The tolerance is {@link SIMULTANEITY_RELATIVE_TOLERANCE} of the largest re-derived offset, so a
 * translated or scaled solve partitions identically to its original.
 */
function canonicaliseSimultaneousOffsets(interiorOffsets: Map<number, number>): Map<number, number> {
    const maxOffset = largestOffset(interiorOffsets.values());

    const canonical = new Map<number, number>();
    for (const set of simultaneousOffsetSets(interiorOffsets, maxOffset * SIMULTANEITY_RELATIVE_TOLERANCE)) {
        const representative = representativeOffset(set.offsets);
        for (const nodeId of set.nodeIds) {
            canonical.set(nodeId, representative);
        }
    }

    return canonical;
}

/**
 * The offsets partitioned into connected components under "within `tolerance` of each other".
 *
 * CONNECTED COMPONENTS, NOT FIRST MATCH. Proximity under a fixed tolerance is not transitive, so
 * joining each offset to the first set already within tolerance of it makes the partition depend on
 * the order the nodes are visited. `clusterCoincidentMerges` was bitten by exactly that and is the
 * direct precedent for this function; the fix is the same one. In one dimension the components are
 * the runs of the *sorted* distinct values separated by a gap wider than the tolerance, which is
 * the transitive closure computed exactly rather than approximated — and, being a function of the
 * value set alone, is independent of visitation order by construction.
 *
 * SINGLE-LINKAGE CHAINING IS AN ACCEPTED COST, as it is there: a run of offsets each within
 * tolerance of the next becomes one set however far its extremes lie apart. Measured on this corpus
 * the widest set spans 1.42e-15 relative against a tolerance of 1e-12, so no observed set is
 * anywhere near chaining into its neighbour.
 */
function simultaneousOffsetSets(interiorOffsets: Map<number, number>, tolerance: number): SimultaneousOffsetSet[] {
    const nodeIdsByOffset = new Map<number, number[]>();
    for (const [nodeId, offset] of interiorOffsets) {
        const nodeIds = nodeIdsByOffset.get(offset);
        if (nodeIds === undefined) {
            nodeIdsByOffset.set(offset, [nodeId]);
        } else {
            nodeIds.push(nodeId);
        }
    }

    const sets: SimultaneousOffsetSet[] = [];
    let current: SimultaneousOffsetSet | null = null;
    for (const [offset, nodeIds] of [...nodeIdsByOffset.entries()].sort((a, b) => a[0] - b[0])) {
        if (current === null || offset - current.offsets[current.offsets.length - 1] > tolerance) {
            current = {nodeIds: [...nodeIds], offsets: [offset]};
            sets.push(current);
            continue;
        }
        current.nodeIds.push(...nodeIds);
        current.offsets.push(offset);
    }

    return sets;
}

/**
 * The value one simultaneous set collapses onto: the member nearest the set's mean, exact ties
 * broken towards the smaller value.
 *
 * A MEMBER, NEVER A MEAN. The mean is not one of the values it summarises and nothing bounds its
 * distance from them, so under single-linkage chaining it can drift towards — and collide with — a
 * neighbouring set where no member of either would. Taking a member inherits the partition's
 * separation guarantee directly. The mean is the yardstick, never the answer; `medoidPosition` in
 * `coincident-events.ts` picks its representative the same way and for the same reason.
 *
 * `offsets` is ascending and deduplicated, so the sum, the comparison order and therefore the
 * result are a function of the set alone and do not move with the order the nodes were visited.
 */
function representativeOffset(offsets: number[]): number {
    const mean = offsets.reduce((total, offset) => total + offset, 0) / offsets.length;

    let best = offsets[0];
    let bestDistance = Math.abs(best - mean);
    for (const offset of offsets.slice(1)) {
        const distance = Math.abs(offset - mean);
        if (distance < bestDistance) {
            best = offset;
            bestDistance = distance;
        }
    }

    return best;
}

/**
 * The largest node TIME in the solved skeleton: how long the wavefront runs before it is entirely
 * consumed. Callers use it to normalise a time into the range the skeleton spans.
 *
 * A TIME, NOT A DISTANCE (W-spec W5, W40). Under weights the fastest wall has covered
 * `w_max · computeMaxOffset(result)` by then and the slowest `1 · computeMaxOffset(result)`, so a
 * caller reading this as "how far the wavefront travelled" is reading the slowest wall's distance
 * and no other's. At unit weights the two readings coincide and every existing caller is unaffected.
 *
 * @throws if the solve is incomplete or has no solver context.
 */
export function computeMaxOffset(result: SkeletonSolveResult): number {
    requireProjectableResult(result, 'computeMaxOffset');

    return largestOffset(computeNodeOffsets(result).values());
}

/**
 * Bisectors alive at TIME `offset`, with the wavefront position each one occupies there.
 *
 * Both ends of the lifetime are read from `nodeOffsets`, so at an event the bisector dying there
 * and the bisector born there compare against the identical number and the hand-over is exact. See
 * the module header for why nothing else will do.
 *
 * Exported for the same reason as {@link requireProjectableResult}: this is the module's single
 * derivation of *which bisectors carry the wavefront at an offset, and where*, and anything that
 * relates the offset contour back to the skeleton must read it from here rather than reconstruct
 * it. The half-open lifetime rule and the perpendicular-to-along-ray conversion are each a formula
 * whose last few bits are load-bearing, and a second copy of either is precisely the two-routes-to-
 * one-quantity fault the module header records as having cost whole rings.
 *
 * `nodeOffsets` must be the map {@link computeNodeOffsets} returns for this same `result`.
 */
export function collectAliveBisectors(
    result: SkeletonSolveResult,
    nodeOffsets: Map<number, number>,
    offset: number,
): AliveBisector[] {
    const {graph} = result;
    const alive: AliveBisector[] = [];

    for (const interiorEdge of graph.interiorEdges) {
        const polygonEdge = graph.edges[interiorEdge.id];
        if (polygonEdge === undefined || polygonEdge.target === undefined) {
            continue;
        }

        const death = nodeOffsets.get(polygonEdge.target);
        const birth = nodeOffsets.get(polygonEdge.source);
        if (death === undefined || birth === undefined) {
            continue;
        }

        if (offset < birth || offset >= death) {
            continue;
        }

        alive.push({
            id: interiorEdge.id,
            position: bisectorPositionAtOffset(result, interiorEdge, offset - birth),
            clockwiseParentId: interiorEdge.clockwiseExteriorEdgeIndex,
            widdershinsParentId: interiorEdge.widdershinsExteriorEdgeIndex,
        });
    }

    return alive;
}

/**
 * Where a bisector's wavefront vertex sits `localTime` past its own birth.
 *
 * TWO CONVERSIONS, IN THIS ORDER (W-spec W40). A local TIME becomes the perpendicular distance the
 * clockwise parent's wavefront has covered in it, `localTime · w_cw` — that is what a weight IS —
 * and that perpendicular distance becomes travel along the bisector's own ray by the cross product
 * of the two bases, which is the inverse of the projection the solver uses when it dates a
 * collision. Multiplying by exactly `1.0` at unit weights leaves the operand and therefore every
 * ring vertex of the corpus untouched.
 *
 * THE RING THIS PLACES IS THE EQUI-TIME FRONT, NOT AN EQUIDISTANT ONE. Each vertex is priced
 * against its own clockwise parent, so at time `t` the wavefront of edge `e` sits at `w_e · t` from
 * `e` and at `w_f · t` from every other edge `f` it meets — a front whose walls have each moved for
 * the same duration at their own speed, which is the only reading under which the pieces still join
 * up.
 */
function bisectorPositionAtOffset(result: SkeletonSolveResult, interiorEdge: InteriorEdge, localTime: number): Vector2 {
    const {graph} = result;
    const polygonEdge = graph.edges[interiorEdge.id];
    const clockwiseParent = graph.edges[interiorEdge.clockwiseExteriorEdgeIndex];
    const perpendicular = localTime * graph.exteriorWeights[interiorEdge.clockwiseExteriorEdgeIndex];
    const alongRay = projectFromPerpendicular(polygonEdge.basisVector, clockwiseParent.basisVector, perpendicular);
    return addVectors(graph.nodes[polygonEdge.source].position, scaleVector(polygonEdge.basisVector, alongRay));
}

/**
 * Wavefront segments lying on the inward offset of one exterior edge.
 *
 * A bisector naming this edge as its clockwise parent opens a segment; one naming it as its
 * widdershins parent closes a segment. Sorting the endpoints along the edge's basis direction and
 * pairing them in order recovers the live spans. An edge can yield more than one pair, which is
 * exactly the case where the wavefront has pinched and the boundary has split in two.
 *
 * ## Where two endpoints land on the same point
 *
 * At the exact offset of a split event, the bisector the split kills and the bisector it creates
 * both sit on the split point, so a closing endpoint and an opening endpoint have the identical
 * position along the edge. The tie is broken **close before open**, and that ordering is the whole
 * of the matter: the span arriving from lower down the edge has to be shut before the new one is
 * opened. Opening first instead makes the second opener arrive while a start is still pending, and
 * `pendingStart ??=` then drops it — the new bisector never opens a span, the chain that should
 * have run through it has nothing to continue to, and the ring it belonged to is lost. Two live
 * bisectors bounding a genuinely zero-length span cannot occur and so is not a case to preserve:
 * a span of zero length means its two bisectors have met, and bisectors that have met are dead.
 *
 * That last sentence was true of one node and false across a simultaneous mirror pair, where the
 * two bisectors had met while the table still dated their death a few femtometres later. It is now
 * true of a mirror set too, because {@link computeNodeOffsets} gives every node of one instant the
 * same offset and the two bisectors are dead together. See the module header's section on one
 * instant being several numbers.
 */
function segmentsAlongExteriorEdge(
    result: SkeletonSolveResult,
    exteriorEdgeId: number,
    alive: AliveBisector[],
): WavefrontSegment[] {
    const {graph} = result;
    const exteriorEdge = graph.edges[exteriorEdgeId];
    const edgeSource = graph.nodes[exteriorEdge.source].position;

    const endpoints: SegmentEndpoint[] = [];
    for (const bisector of alive) {
        if (bisector.clockwiseParentId === exteriorEdgeId) {
            endpoints.push(makeEndpoint(bisector, edgeSource, exteriorEdge.basisVector, true));
        }
        if (bisector.widdershinsParentId === exteriorEdgeId) {
            endpoints.push(makeEndpoint(bisector, edgeSource, exteriorEdge.basisVector, false));
        }
    }

    endpoints.sort((a, b) => (a.alongEdge - b.alongEdge) || (Number(a.isStart) - Number(b.isStart)));

    const segments: WavefrontSegment[] = [];
    let pendingStart: SegmentEndpoint | null = null;
    for (const endpoint of endpoints) {
        if (endpoint.isStart) {
            pendingStart ??= endpoint;
            continue;
        }
        if (pendingStart !== null) {
            segments.push({
                exteriorEdgeId,
                startBisectorId: pendingStart.bisectorId,
                endBisectorId: endpoint.bisectorId,
                startPosition: pendingStart.position,
                endPosition: endpoint.position,
            });
            pendingStart = null;
        }
    }

    return segments;
}

function makeEndpoint(bisector: AliveBisector, edgeSource: Vector2, edgeBasis: Vector2, isStart: boolean): SegmentEndpoint {
    const relative: Vector2 = {x: bisector.position.x - edgeSource.x, y: bisector.position.y - edgeSource.y};
    return {
        bisectorId: bisector.id,
        position: bisector.position,
        alongEdge: dotProduct(relative, edgeBasis),
        isStart,
    };
}

/**
 * Turn one closed run of wavefront segments into a ring.
 *
 * Zero-length segments are dropped: a segment whose two ends coincide contributes no geometry, and
 * keeping it would put a repeated vertex in the ring. Dropping it leaves the remaining segments
 * still chained, because a zero-length segment's two ends are the same point.
 */
function makeRing(cycle: WavefrontSegment[]): OffsetRing | null {
    const kept = cycle.filter(segment => !vectorsAreEqual(segment.startPosition, segment.endPosition));
    if (kept.length < 3) {
        return null;
    }

    const vertices: OffsetRingVertex[] = kept.map(segment => ({
        position: segment.startPosition,
        bisectorId: segment.startBisectorId,
    }));
    const segments: OffsetRingSegment[] = kept.map((segment, index) => ({
        exteriorEdgeId: segment.exteriorEdgeId,
        start: vertices[index],
        end: vertices[(index + 1) % vertices.length],
    }));

    return {vertices, segments};
}

/** Bisector ids along a run of segments: each segment's start, then the last segment's end. */
function chainBisectorIds(chain: WavefrontSegment[]): number[] {
    return [...chain.map(segment => segment.startBisectorId), chain[chain.length - 1].endBisectorId];
}

/**
 * Walk the segment graph into closed cycles.
 *
 * A run that does not close cannot become a ring, but it is not thrown away either: it is described
 * in {@link OffsetProjection.unclosedChains} so that a caller can tell a projection that found
 * nothing from one that lost something. See {@link UnclosedChain}.
 */
function assembleRings(segments: WavefrontSegment[], offset: number): OffsetProjection {
    const indexByStartBisector = new Map<number, number>();
    segments.forEach((segment, index) => {
        if (!indexByStartBisector.has(segment.startBisectorId)) {
            indexByStartBisector.set(segment.startBisectorId, index);
        }
    });

    const rings: OffsetRing[] = [];
    const unclosedChains: UnclosedChain[] = [];
    const degenerateCycles: DegenerateCycle[] = [];
    const visited = new Set<number>();

    for (let seed = 0; seed < segments.length; seed++) {
        if (visited.has(seed)) {
            continue;
        }

        const cycle: WavefrontSegment[] = [];
        let cursor = seed;
        let closed = false;
        let reason: UnclosedChainReason = 'no-successor';
        for (;;) {
            visited.add(cursor);
            cycle.push(segments[cursor]);
            const next = indexByStartBisector.get(segments[cursor].endBisectorId);
            if (next === seed) {
                closed = true;
                break;
            }
            if (next === undefined) {
                reason = 'no-successor';
                break;
            }
            if (visited.has(next)) {
                reason = 'rejoined-mid-chain';
                break;
            }
            cursor = next;
        }

        if (!closed) {
            unclosedChains.push({
                reason,
                exteriorEdgeIds: cycle.map(segment => segment.exteriorEdgeId),
                bisectorIds: chainBisectorIds(cycle),
                start: cycle[0].startPosition,
                end: cycle[cycle.length - 1].endPosition,
            });
            continue;
        }

        const ring = makeRing(cycle);
        if (ring === null) {
            degenerateCycles.push({
                bisectorIds: chainBisectorIds(cycle),
                segmentCount: cycle.length,
                keptSegmentCount: cycle.filter(
                    segment => !vectorsAreEqual(segment.startPosition, segment.endPosition)).length,
            });
            continue;
        }
        rings.push(ring);
    }

    return {offset, rings, unclosedChains, degenerateCycles};
}

/** A projection that found no wavefront at all, and lost nothing finding it. */
function emptyProjection(offset: number): OffsetProjection {
    return {offset, rings: [], unclosedChains: [], degenerateCycles: []};
}

/** The single implementation behind every public ring entry point. */
function projectWavefront(result: SkeletonSolveResult, offset: number, caller: string): OffsetProjection {
    requireProjectableResult(result, caller);

    if (!(offset >= 0)) {
        throw new Error(`${caller} requires a non-negative offset, received ${offset}.`);
    }

    const nodeOffsets = computeNodeOffsets(result);

    if (offset >= largestOffset(nodeOffsets.values())) {
        return emptyProjection(offset);
    }

    const alive = collectAliveBisectors(result, nodeOffsets, offset);
    if (alive.length === 0) {
        return emptyProjection(offset);
    }

    const segments: WavefrontSegment[] = [];
    for (let exteriorEdgeId = 0; exteriorEdgeId < result.graph.numExteriorNodes; exteriorEdgeId++) {
        segments.push(...segmentsAlongExteriorEdge(result, exteriorEdgeId, alive));
    }

    return assembleRings(segments, offset);
}

/**
 * The inward-moving wavefront of a solved straight skeleton at offset distance `offset`, with the
 * provenance of every piece of it.
 *
 * Identical geometry to {@link computeOffsetRings}, which is a projection of this function. The
 * addition is provenance the projection already computes internally and would otherwise throw away:
 * which exterior edge each straight piece of the ring is the offset of, and which skeleton arc each
 * ring vertex is riding at this offset. Anything that has to relate the offset contour back to the
 * boundary that generated it — strip decomposition, parcel subdivision, street attribution — needs
 * those two facts and cannot recover them from bare coordinates.
 *
 * @throws if `offset` is negative, or the solve is incomplete or has no solver context.
 */
export function computeOffsetRingsDetailed(result: SkeletonSolveResult, offset: number): OffsetRing[] {
    return projectWavefront(result, offset, 'computeOffsetRingsDetailed').rings;
}

/**
 * The wavefront at `offset` together with an account of anything the projection could not use.
 *
 * The widest of the three ring entry points, and the one to reach for when an empty or short result
 * has to be acted on rather than merely displayed. {@link computeOffsetRings} and
 * {@link computeOffsetRingsDetailed} are this function with `.rings` taken, and no ring differs
 * between them; the difference is only that they discard the account and this one does not.
 *
 * A projection is sound exactly when {@link OffsetProjection.unclosedChains} is empty, which for a
 * correctly solved skeleton it always is. A non-empty value means whole rings are missing from
 * `rings` — the wavefront was there and the projection failed to close it — and is the one signal
 * that distinguishes "the offset contour here is empty" from "the offset contour here was lost".
 * Callers that treat an empty ring list as a real answer, such as a parcel generator deciding a
 * block yields no lots, should check it before believing the answer.
 *
 * @throws if `offset` is negative, or the solve is incomplete or has no solver context.
 */
export function projectOffsetWavefront(result: SkeletonSolveResult, offset: number): OffsetProjection {
    return projectWavefront(result, offset, 'projectOffsetWavefront');
}

/**
 * The inward-moving wavefront of a solved straight skeleton at TIME `offset` (W-spec W5, W40).
 *
 * The ring is the equi-time front: the offset of exterior edge `e` on it lies at perpendicular
 * distance `w_e · offset` from `e`, so differently-weighted edges are set back by different amounts
 * at one call. At unit weights every setback is `offset` and this is the contour it always was.
 *
 * Returns zero or more closed rings. Each ring is an ordered vertex list in the same winding as the
 * graph's boundary — clockwise — with no duplicated closing vertex. More than one ring means the
 * wavefront has pinched off into disconnected loops, which is the normal outcome for a non-convex
 * polygon offset far enough inward.
 *
 * Boundary behaviour:
 * - `offset === 0` returns exactly one ring: the original polygon.
 * - `offset >= computeMaxOffset(result)` returns `[]` — the wavefront has been fully consumed.
 * - A bisector whose lifetime ends exactly at `offset` does not contribute; lifetimes are half-open.
 *
 * An empty result is reported the same way whether the wavefront was genuinely empty or the
 * projection lost it. Use {@link projectOffsetWavefront} where the difference matters.
 *
 * @throws if `offset` is negative, or the solve is incomplete or has no solver context.
 */
export function computeOffsetRings(result: SkeletonSolveResult, offset: number): Vector2[][] {
    return projectWavefront(result, offset, 'computeOffsetRings')
        .rings.map(ring => ring.vertices.map(vertex => vertex.position));
}
