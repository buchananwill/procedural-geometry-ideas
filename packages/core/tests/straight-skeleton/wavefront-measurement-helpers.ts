import {computeMaxOffset, computeNodeOffsets, SkeletonSolveResult, Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE MEASUREMENTS AN OFFSET SUITE TAKES, DEFINED ONCE.
 * ============================================================================
 *
 * `offset-event-boundary-regression.test.ts` asserts that the projection survives an
 * event over `ALL_TEST_POLYGONS`, and `near-regular-ring-loss-diagnosis.test.ts` asserts
 * the same of the four held-out fixtures whose simultaneous mirror events used to defeat
 * it. Both have to ask the same questions of a solve — *where are its events*, *how much
 * area does the wavefront enclose there*, *is that area continuous through the event*, and
 * *does the unclosed-chain report still fire when a hand-over is broken by hand* — and the
 * second suite's measurements are only comparable with the first suite's guarantee if the
 * questions are the same question.
 *
 * These are formulae rather than loop shapes. `eventOffsets` decides which node offsets
 * count as an event (strictly positive, no greater than the maximum, deduplicated on the
 * bit and never within a tolerance), and `signedRingArea` subtracts the first vertex
 * before accumulating so the value does not depend on where in the plane the ring sits. A
 * copy that drifted on either point would silently re-aim one suite at a different
 * population.
 *
 * `distanceToSegment` and `distanceToSupportingLine` live here for the same reason. They are
 * the two distances every offset suite states its properties in — how far a wavefront vertex
 * is from the boundary, and how far a node is from the line of the edge that dates it — and
 * `offset-projection.test.ts` and `wavefront-causality.test.ts` had a copy each. They are
 * pure point-to-line geometry that reads nothing the solver produced, so sharing them costs
 * the causality suite none of the independence from production that it depends on: what that
 * suite must not borrow is `offset-projection.ts`'s *derivation of a node's offset*, which
 * stays re-derived there.
 *
 * This file is deliberately NOT named `*.test.ts`: `jest.config.cjs` matches
 * `tests/**\/*.test.ts`, so a helper module beside the suites is not collected as an
 * empty suite.
 */

/** Shoelace with the first vertex subtracted, so the value does not depend on where the ring sits. */
export function signedRingArea(ring: Vector2[]): number {
    const origin = ring[0];
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
    }
    return total / 2;
}

/** The area a whole projection encloses, rings counted regardless of their winding. */
export function totalRingArea(rings: Vector2[][]): number {
    return rings.reduce((sum, ring) => sum + Math.abs(signedRingArea(ring)), 0);
}

/** Euclidean distance from p to the segment ab. */
export function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const raw = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    const t = Math.max(0, Math.min(1, raw));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Perpendicular distance from p to the infinite line through a and b. */
export function distanceToSupportingLine(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
}

/**
 * Every number a node's own parent edges date it to, re-derived here from raw geometry.
 *
 * A node is defined by the exterior edges its incident bisectors run between, and the offset of the
 * instant it belongs to is its perpendicular distance to the supporting line of any one of them.
 * They are one distance in exact arithmetic and several distinct doubles in this one, which is the
 * mechanism `computeNodeOffsets` canonicalises away.
 *
 * This is the suites' OWN derivation, deliberately not the projection's. A suite asserting that the
 * canonical table still agrees with the geometry, or that the raw numbers disagree with each other
 * at all, cannot take either quantity from the module under test — reading the table back would not
 * distinguish "canonicalisation preserved the geometry" from "canonicalisation overwrote it".
 */
export function rawOffsetsOfNode(result: SkeletonSolveResult, nodeId: number): number[] {
    const {graph} = result;
    const node = graph.nodes[nodeId];
    const incident = new Set([...node.inEdges, ...node.outEdges]);

    const parentEdgeIds = new Set<number>();
    for (const interiorEdge of graph.interiorEdges) {
        if (incident.has(interiorEdge.id)) {
            parentEdgeIds.add(interiorEdge.clockwiseExteriorEdgeIndex);
            parentEdgeIds.add(interiorEdge.widdershinsExteriorEdgeIndex);
        }
    }

    const distances: number[] = [];
    for (const parentEdgeId of parentEdgeIds) {
        distances.push(distanceToSupportingLine(
            node.position,
            graph.nodes[parentEdgeId].position,
            graph.nodes[(parentEdgeId + 1) % graph.numExteriorNodes].position,
        ));
    }
    return distances;
}

/** The distinct offsets at which the wavefront has an event: the interior nodes' own offsets. */
export function eventOffsets(result: SkeletonSolveResult): number[] {
    const maxOffset = computeMaxOffset(result);
    const interior = [...computeNodeOffsets(result).values()].filter(offset => offset > 0 && offset <= maxOffset);
    return [...new Set(interior)].sort((a, b) => a - b);
}

/**
 * Is the ring area at an event ordered between the areas a micrometre either side of it?
 *
 * The wavefront only ever shrinks, so the three readings must come out in that order. An event
 * that loses ring area comes out below both neighbours and fails; one that gains comes out above
 * both. The slack covers the genuine micrometre of shrinkage between the samples, nothing more.
 */
export function isContinuous(before: number, at: number, after: number): boolean {
    const slack = Math.max(1e-9, before * 1e-6);
    return at <= before + slack && at >= after - slack;
}

/**
 * How far a mutated node's own event is pushed away from where the rest of the solve puts it.
 *
 * A micrometre is not a tolerance and nothing compares against it: it is a displacement chosen to
 * be enormous next to the femtometres the hand-over actually turns on, so that a report which
 * fails to fire has failed for a reason other than the perturbation being too small to see. It is
 * also six orders of magnitude clear of the relative band `computeNodeOffsets` canonicalises
 * within, so the mutated node leaves its own simultaneous set rather than being absorbed back into
 * it.
 */
export const MUTATION_DISPLACEMENT = 1e-6;

/** A copy of `result` with one node displaced, and nothing else about the solve touched. */
function withNodeMoved(result: SkeletonSolveResult, nodeId: number, displacement: Vector2): SkeletonSolveResult {
    const nodes = result.graph.nodes.map((node, index) => index === nodeId
        ? {...node, position: {x: node.position.x + displacement.x, y: node.position.y + displacement.y}}
        : node);
    return {...result, graph: {...result.graph, nodes}};
}

/**
 * A copy of `result` in which one node's re-derived offset is later than the solve put it, so the
 * hand-over there no longer happens at the offset every other node dates it to.
 *
 * The bisectors dying at that node stay alive past the instant they meet, and the bisector born
 * there is not yet alive when they do — which is precisely the broken hand-over the unclosed-chain
 * report exists to catch, and precisely what `collectAliveBisectors` reading one table for both
 * ends otherwise makes impossible.
 *
 * The displacement direction is chosen by measurement rather than by re-deriving which parent edge
 * `computeNodeOffsets` reads this node against: the four axis displacements are tried and the one
 * that dates the node latest is kept. Restating that parent-edge choice here would be a second
 * route to a quantity the projection module owns, which is the fault the suites this serves exist
 * to record.
 */
export function withNodeOffsetDelayed(result: SkeletonSolveResult, nodeId: number, by: number): SkeletonSolveResult {
    const step = by * 2;
    const displacements: Vector2[] = [{x: step, y: 0}, {x: -step, y: 0}, {x: 0, y: step}, {x: 0, y: -step}];

    let latest = result;
    let latestOffset = -Infinity;
    for (const displacement of displacements) {
        const moved = withNodeMoved(result, nodeId, displacement);
        const offset = computeNodeOffsets(moved).get(nodeId);
        if (offset !== undefined && offset > latestOffset) {
            latestOffset = offset;
            latest = moved;
        }
    }
    return latest;
}
