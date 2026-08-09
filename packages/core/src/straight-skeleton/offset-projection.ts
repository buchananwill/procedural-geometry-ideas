import type {InteriorEdge, SkeletonSolveResult, StraightSkeletonSolverContext, Vector2} from './types';
import {addVectors, dotProduct, projectFromPerpendicular, scaleVector, vectorsAreEqual} from './core-functions';

/**
 * Projection of a solved straight skeleton back into wavefront positions.
 *
 * The skeleton is the trace of the polygon boundary moving inward at unit speed. This module
 * runs that trace backwards: given a solved skeleton and an offset distance `t`, it reconstructs
 * where the wavefront was at time `t`.
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
 * ## Offsets are re-derived, not read back
 *
 * A node's offset is computed from raw geometry — the perpendicular distance from the node to the
 * supporting line of one of the original polygon edges that defines it — rather than from anything
 * the solver recorded about timing. Exterior nodes lie on the boundary, so their offset is zero.
 *
 * ## Preconditions
 *
 * Every entry point requires `result.complete === true` and `result.context !== null`. A
 * self-intersecting input yields a merged graph with no solver context and cannot be projected;
 * callers must resolve the self-intersection first (see `decomposePolygon`) and project each
 * sub-polygon's own solve.
 */

/** A bisector that is alive at the requested offset, with its wavefront position there. */
interface AliveBisector {
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
    /** The offset projected to, echoed back. */
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
 * Offset distance of every node in the solved skeleton, keyed by node id.
 *
 * Exterior nodes lie on the original boundary and are mapped to zero. Every other node is mapped to
 * the perpendicular distance from its position to the supporting line of one of the original polygon
 * edges that defines it, found via the `clockwiseExteriorEdgeIndex` of an incident interior edge.
 *
 * A node with no incident interior edge is absent from the map rather than guessed at.
 *
 * @throws if the solve is incomplete or has no solver context.
 */
export function computeNodeOffsets(result: SkeletonSolveResult): Map<number, number> {
    requireProjectableResult(result, 'computeNodeOffsets');

    const {graph} = result;
    const exteriorEdgeCount = graph.numExteriorNodes;

    const parentEdgeOf = new Map<number, number>();
    for (const interiorEdge of graph.interiorEdges) {
        parentEdgeOf.set(interiorEdge.id, interiorEdge.clockwiseExteriorEdgeIndex);
    }

    const offsets = new Map<number, number>();
    for (let nodeId = 0; nodeId < exteriorEdgeCount; nodeId++) {
        offsets.set(nodeId, 0);
    }

    for (let nodeId = exteriorEdgeCount; nodeId < graph.nodes.length; nodeId++) {
        const node = graph.nodes[nodeId];
        const incident = [...new Set([...node.inEdges, ...node.outEdges])].filter(id => parentEdgeOf.has(id));
        if (incident.length === 0) {
            continue;
        }
        const parentEdgeId = parentEdgeOf.get(incident[0])!;
        offsets.set(
            nodeId,
            distanceToSupportingLine(
                node.position,
                graph.nodes[parentEdgeId].position,
                graph.nodes[(parentEdgeId + 1) % exteriorEdgeCount].position,
            ),
        );
    }

    return offsets;
}

/**
 * The largest node offset in the solved skeleton: how far the wavefront travels before it is
 * entirely consumed. Callers use it to normalise an offset into the range the skeleton spans.
 *
 * @throws if the solve is incomplete or has no solver context.
 */
export function computeMaxOffset(result: SkeletonSolveResult): number {
    requireProjectableResult(result, 'computeMaxOffset');

    let maxOffset = 0;
    for (const offset of computeNodeOffsets(result).values()) {
        if (offset > maxOffset) {
            maxOffset = offset;
        }
    }
    return maxOffset;
}

/**
 * Bisectors alive at `offset`, with the wavefront position each one occupies there.
 *
 * Both ends of the lifetime are read from `nodeOffsets`, so at an event the bisector dying there
 * and the bisector born there compare against the identical number and the hand-over is exact. See
 * the module header for why nothing else will do.
 */
function collectAliveBisectors(
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
 * Where a bisector's wavefront vertex sits `localOffset` past its own birth.
 *
 * The bisector advances away from its parent edge at a rate given by the cross product of its basis
 * with that edge's basis, so converting a perpendicular offset into a distance along the ray is the
 * inverse of the projection the solver uses when it dates a collision.
 */
function bisectorPositionAtOffset(result: SkeletonSolveResult, interiorEdge: InteriorEdge, localOffset: number): Vector2 {
    const {graph} = result;
    const polygonEdge = graph.edges[interiorEdge.id];
    const clockwiseParent = graph.edges[interiorEdge.clockwiseExteriorEdgeIndex];
    const alongRay = projectFromPerpendicular(polygonEdge.basisVector, clockwiseParent.basisVector, localOffset);
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

    let maxOffset = 0;
    for (const nodeOffset of nodeOffsets.values()) {
        if (nodeOffset > maxOffset) {
            maxOffset = nodeOffset;
        }
    }
    if (offset >= maxOffset) {
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
 * The inward-moving wavefront of a solved straight skeleton at offset distance `offset`.
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
