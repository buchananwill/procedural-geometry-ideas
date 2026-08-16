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

/** The distinct offsets at which the wavefront has an event: the interior nodes' own offsets. */
export function eventOffsets(result: SkeletonSolveResult): number[] {
    const maxOffset = computeMaxOffset(result);
    const interior = [...computeNodeOffsets(result).values()].filter(offset => offset > 0 && offset <= maxOffset);
    return [...new Set(interior)].sort((a, b) => a - b);
}
