import type {InteriorEdge, SkeletonSolveResult, StraightSkeletonSolverContext, Vector2} from './types';
import {addVectors, dotProduct, projectFromPerpendicular, scaleVector, vectorsAreEqual} from './core-functions';
import {sourceOffsetDistance} from './collision-helpers';

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
 * - `birth` is the offset at which the bisector's source node came into existence — zero for
 *   primary bisectors, which start at original polygon vertices, and the source node's own offset
 *   for secondary bisectors created by a collapse or split event.
 * - `death` is the offset of the node the bisector terminates at.
 *
 * The interval is half-open: a bisector that dies exactly at `t` is **excluded** at `t`, and a
 * bisector born exactly at `t` is **included**. That keeps the two ends of an event from both
 * contributing a vertex at the instant the event happens.
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

/** Slack used when testing an offset against a lifetime boundary. */
const LIFETIME_TOLERANCE = 1e-9;

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

/** Bisectors alive at `offset`, with the wavefront position each one occupies there. */
function collectAliveBisectors(
    result: SkeletonSolveResult,
    context: StraightSkeletonSolverContext,
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
        if (death === undefined) {
            continue;
        }

        const birth = sourceOffsetDistance(interiorEdge, context);
        if (offset < birth - LIFETIME_TOLERANCE || offset >= death - LIFETIME_TOLERANCE) {
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

    endpoints.sort((a, b) => (a.alongEdge - b.alongEdge) || (Number(b.isStart) - Number(a.isStart)));

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

/** Walk the segment graph into closed cycles, discarding any chain that does not close. */
function assembleRings(segments: WavefrontSegment[]): OffsetRing[] {
    const indexByStartBisector = new Map<number, number>();
    segments.forEach((segment, index) => {
        if (!indexByStartBisector.has(segment.startBisectorId)) {
            indexByStartBisector.set(segment.startBisectorId, index);
        }
    });

    const rings: OffsetRing[] = [];
    const visited = new Set<number>();

    for (let seed = 0; seed < segments.length; seed++) {
        if (visited.has(seed)) {
            continue;
        }

        const cycle: WavefrontSegment[] = [];
        let cursor = seed;
        let closed = false;
        for (;;) {
            visited.add(cursor);
            cycle.push(segments[cursor]);
            const next = indexByStartBisector.get(segments[cursor].endBisectorId);
            if (next === undefined || visited.has(next)) {
                closed = next === seed;
                break;
            }
            cursor = next;
        }

        if (!closed) {
            continue;
        }

        const ring = makeRing(cycle);
        if (ring !== null) {
            rings.push(ring);
        }
    }

    return rings;
}

/** The single implementation behind both public ring entry points. */
function projectWavefront(result: SkeletonSolveResult, offset: number, caller: string): OffsetRing[] {
    const context = requireProjectableResult(result, caller);

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
        return [];
    }

    const alive = collectAliveBisectors(result, context, nodeOffsets, offset);
    if (alive.length === 0) {
        return [];
    }

    const segments: WavefrontSegment[] = [];
    for (let exteriorEdgeId = 0; exteriorEdgeId < result.graph.numExteriorNodes; exteriorEdgeId++) {
        segments.push(...segmentsAlongExteriorEdge(result, exteriorEdgeId, alive));
    }

    return assembleRings(segments);
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
    return projectWavefront(result, offset, 'computeOffsetRingsDetailed');
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
 * @throws if `offset` is negative, or the solve is incomplete or has no solver context.
 */
export function computeOffsetRings(result: SkeletonSolveResult, offset: number): Vector2[][] {
    return projectWavefront(result, offset, 'computeOffsetRings')
        .map(ring => ring.vertices.map(vertex => vertex.position));
}
