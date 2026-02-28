import { intersectRays } from '@/algorithms/straight-skeleton/intersection-edges';
import type { RayProjection } from '@/algorithms/straight-skeleton/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ray(sx: number, sy: number, bx: number, by: number): RayProjection {
    return { sourceVector: { x: sx, y: sy }, basisVector: { x: bx, y: by } };
}

const SQRT2_OVER_2 = Math.SQRT2 / 2;

// ---------------------------------------------------------------------------
// unitsToIntersection
// ---------------------------------------------------------------------------

describe('unitsToIntersection', () => {
    // ---- identical-source ----

    describe('identical-source', () => {
        it('returns identical-source when both rays share the same origin', () => {
            const r1 = ray(0, 0, 1, 0);
            const r2 = ray(0, 0, 0, 1);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('identical-source');
            expect(u1).toBe(Number.POSITIVE_INFINITY);
            expect(u2).toBe(Number.POSITIVE_INFINITY);
        });

        it('returns identical-source even when basis vectors are identical', () => {
            const r1 = ray(3, 4, 1, 0);
            const r2 = ray(3, 4, 1, 0);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('identical-source');
            expect(u1).toBe(Number.POSITIVE_INFINITY);
            expect(u2).toBe(Number.POSITIVE_INFINITY);
        });
    });

    // ---- parallel (same direction, offset) ----

    describe('parallel', () => {
        it('returns parallel for same-direction rays that are offset perpendicularly', () => {
            // Two rightward rays, one above the other
            const r1 = ray(0, 0, 1, 0);
            const r2 = ray(0, 5, 1, 0);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('parallel');
            expect(u1).toBe(Number.POSITIVE_INFINITY);
            expect(u2).toBe(Number.POSITIVE_INFINITY);
        });

        it('returns parallel for opposite-direction rays that are offset perpendicularly', () => {
            const r1 = ray(0, 0, 1, 0);
            const r2 = ray(0, 3, -1, 0);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('parallel');
            expect(u1).toBe(Number.POSITIVE_INFINITY);
            expect(u2).toBe(Number.POSITIVE_INFINITY);
        });
    });

    // ---- co-linear-from-1 ----

    describe('co-linear-from-1', () => {
        it('returns co-linear-from-1 when ray2 source lies ahead of ray1 in the same direction', () => {
            // ray1 → (1,0) from origin; ray2 at (5,0) going same way
            const r1 = ray(0, 0, 1, 0);
            const r2 = ray(5, 0, 1, 0);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('co-linear-from-1');
            expect(u1).toBeCloseTo(5);
            expect(u2).toBe(0);
        });

        it('works for diagonal co-linear rays', () => {
            const r1 = ray(0, 0, SQRT2_OVER_2, SQRT2_OVER_2);
            const r2 = ray(3, 3, SQRT2_OVER_2, SQRT2_OVER_2);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('co-linear-from-1');
            expect(u1).toBeCloseTo(Math.sqrt(18)); // distance from (0,0) to (3,3)
            expect(u2).toBe(0);
        });
    });

    // ---- co-linear-from-2 ----

    describe('co-linear-from-2', () => {
        it('returns co-linear-from-2 when ray1 source lies ahead of ray2 in the same direction', () => {
            // ray2 → (1,0) from origin; ray1 at (5,0) going same way
            const r1 = ray(5, 0, 1, 0);
            const r2 = ray(0, 0, 1, 0);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('co-linear-from-2');
            expect(u1).toBe(0);
            expect(u2).toBeCloseTo(5);
        });
    });

    // ---- head-on ----

    describe('head-on', () => {
        it('returns head-on for opposite rays on the same line approaching each other', () => {
            const r1 = ray(0, 0, 1, 0);
            const r2 = ray(10, 0, -1, 0);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('head-on');
            expect(u1).toBeCloseTo(10);
            expect(u2).toBeCloseTo(10);
        });

        it('returns head-on for vertical opposite rays', () => {
            const r1 = ray(0, 0, 0, 1);
            const r2 = ray(0, 6, 0, -1);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('head-on');
            expect(u1).toBeCloseTo(6);
            expect(u2).toBeCloseTo(6);
        });

        it('returns head-on for diagonal head on collisions', () => {
            const r1 = ray(0, 0, 0.6, 0.8);
            const r2 = ray(3, 4, -0.6, -0.8);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('head-on');
            expect(u1).toBeCloseTo(5);
            expect(u2).toBeCloseTo(5);
        });
    });

    // ---- converging ----

    describe('converging', () => {
        it('returns converging for two rays that meet ahead of both sources', () => {
            // ray1 from origin going right+up at 45°; ray2 from (10,0) going left+up at 45°
            const r1 = ray(0, 0, SQRT2_OVER_2, SQRT2_OVER_2);
            const r2 = ray(10, 0, -SQRT2_OVER_2, SQRT2_OVER_2);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('converging');
            expect(u1).toBeCloseTo(u2);
            // Intersection at (5, 5), distance from either source = sqrt(50)
            expect(u1).toBeCloseTo(Math.sqrt(50));
        });

        it('returns converging for perpendicular rays meeting in front', () => {
            // ray1 from (0,0) going right; ray2 from (5,-3) going up
            const r1 = ray(0, 0, 1, 0);
            const r2 = ray(5, -3, 0, 1);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('converging');
            expect(u1).toBeCloseTo(5);
            expect(u2).toBeCloseTo(3);
        });

        it('returns positive units for both rays', () => {
            const r1 = ray(0, 0, 1, 0);
            const r2 = ray(3, -4, 0, 1);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('converging');
            expect(u1).toBeGreaterThan(0);
            expect(u2).toBeGreaterThan(0);
        });
    });

    // ---- diverging ----

    describe('diverging', () => {
        it('returns diverging when intersection lies behind both rays', () => {
            // Two rays pointing away from each other; their lines cross behind them
            const r1 = ray(0, 0, -1, 0);
            const r2 = ray(5, -3, 0, -1);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('diverging');
            // Both units should be negative (intersection is behind)
            expect(u1).toBeLessThanOrEqual(0);
            expect(u2).toBeLessThanOrEqual(0);
        });

        it('returns diverging when intersection lies behind ray1 only', () => {
            // ray1 from (5,0) going right; ray2 from (0,-3) going up
            // Lines cross at (0,0)? No — let's pick: ray1 from (5,0) → right, ray2 from (0,3) → up
            // Intersection of x=5+t,y=0 and x=0,y=3+s is impossible unless we use non-axis-aligned
            // ray1 from (5,0) going right, ray2 from (3,2) going up
            // intersection at x=3, but that requires t=-2 (behind ray1), s irrelevant
            // Actually: ray1 at (5,0) dir (1,0); ray2 at (3,-2) dir (0,1)
            // x: 5+t = 3 → t=-2; y: 0 = -2+s → s=2
            const r1 = ray(5, 0, 1, 0);
            const r2 = ray(3, -2, 0, 1);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('diverging');
            expect(u1).toBeCloseTo(-2);
            expect(u2).toBeCloseTo(2);
        });

        it('returns diverging when intersection lies behind ray2 only', () => {
            // ray1 at (0,0) dir (1,0); ray2 at (3,5) dir (0,1)
            // intersection: x=3 → t=3; y=0 → 5+s=0 → s=-5
            const r1 = ray(0, 0, 1, 0);
            const r2 = ray(3, 5, 0, 1);
            const [u1, u2, type] = intersectRays(r1, r2);
            expect(type).toBe('diverging');
            expect(u1).toBeCloseTo(3);
            expect(u2).toBeCloseTo(-5);
        });
    });
});
