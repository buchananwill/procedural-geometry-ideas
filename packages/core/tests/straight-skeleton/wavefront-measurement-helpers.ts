import {computeMaxOffset, computeNodeOffsets, SkeletonSolveResult, Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE TWO MEASUREMENTS AN OFFSET SUITE TAKES, DEFINED ONCE.
 * ============================================================================
 *
 * `offset-event-boundary-regression.test.ts` asserts that the projection survives an
 * event, and `near-regular-ring-loss-diagnosis.test.ts` measures the events at which it
 * does not. Both have to ask the same two questions of a solve — *where are its events*
 * and *how much area does the wavefront enclose there* — and the second suite's diagnosis
 * is only comparable with the first suite's guarantee if the two questions are the same
 * question.
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

/** The distinct offsets at which the wavefront has an event: the interior nodes' own offsets. */
export function eventOffsets(result: SkeletonSolveResult): number[] {
    const maxOffset = computeMaxOffset(result);
    const interior = [...computeNodeOffsets(result).values()].filter(offset => offset > 0 && offset <= maxOffset);
    return [...new Set(interior)].sort((a, b) => a - b);
}
