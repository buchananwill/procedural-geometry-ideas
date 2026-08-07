import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    isClockwise,
    setSkeletonLogLevel,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE LAST TWO `describe` BLOCKS RECORD KNOWN DEFECTS. THOSE ASSERTIONS ARE
 *  NOT DESIRED BEHAVIOUR AND ARE NOT A SPECIFICATION.
 * ============================================================================
 *
 * How far from the origin, and at what size, the solver and its projections stop working.
 *
 * The fixture corpus is entirely screen-space: 10^2 to 10^3 units, near the origin. The
 * eventual consumer works in world-space centimetres, where a 300 m region is 30 000 units
 * across and may sit 10^5 to 10^6 from the origin. This file measures that envelope.
 *
 * ----------------------------------------------------------------------------
 * MEASURED — all 37 ALL_TEST_POLYGONS fixtures, solve + offset rings at 50% of max
 * + strips at depth 50% of max. Cell shows how many of the 37 came through all three.
 * ----------------------------------------------------------------------------
 *
 * Translation only (fixtures keep their native 10^2-10^3 span):
 *
 *     translate      0    1e3    1e4    1e5    1e6    1e7    1e8    1e9   1e10   1e11
 *     passing       37     37     37     37     37     37     33     33      0      0
 *
 * At 1e8 the four losses are Square and Rectangle (empty strips) and Broken Polygon and Long
 * Unbroken Side (no offset rings); the solver itself still reports 37 of 37 complete. By 1e10
 * every fixture has at least one empty strip, and by 1e11 25 of 37 no longer solve at all.
 *
 * Scale only (span stretched, still centred on the origin):
 *
 *     scale       1e-6   1e-4   1e-2      1    1e2    1e4    1e6    1e8
 *     passing       37     37     37     37     37     37     27     18
 *
 * Realistic world-space: scale 50 — every fixture becomes 15 000 to 40 000 units across,
 * i.e. a 150-400 m region in centimetres — then translated:
 *
 *     translate      0    1e4    1e5    1e6    1e7    1e8
 *     passing       37     37     37     37     37     37
 *
 * THE INTENDED OPERATING ENVELOPE IS CLEAN. A 300 m region at 10^6 centimetres from the
 * origin is nowhere near any of the failure onsets. That is the headline result and it is a
 * negative one.
 *
 * ----------------------------------------------------------------------------
 * WHERE THE FIRST FAILURE APPEARS, PER FIXTURE, BY TRANSLATION
 * ----------------------------------------------------------------------------
 *
 * The onset tracks the fixture's own size, not the translation alone:
 *
 *     fixture span      first failing translation
 *     2 to 9 units      1e8  to 3e8
 *     ~550 units        1e10
 *
 * That ratio is the fingerprint of the shoelace sum in `signedArea`. Both
 * `strip-decomposition.ts` and `random-polygon/geometry-helpers.ts` compute it as
 * `sum(a.x * b.y - b.x * a.y)` on absolute coordinates. Each term is of order D^2 for a
 * polygon at distance D, so the sum carries an absolute error of about `D^2 * 2^-52` while the
 * answer itself is only the true area A. The sign is lost once `D > sqrt(A) * 6.7e7`:
 *
 *     a unit-square strip tile, A ~= 0.75   ->  D ~= 5.8e7    (observed: fails at 1e8)
 *     a 550-span fixture's strip, A ~= 1e4  ->  D ~= 6.7e9    (observed: fails at 1e10)
 *
 * Subtracting the ring's own first vertex before summing makes the computation
 * translation-invariant and removes the cancellation entirely. That is a one-line change in
 * each of the two `signedArea` implementations; it has NOT been made, because this task is
 * diagnostic.
 *
 * ----------------------------------------------------------------------------
 * THE TWO DISTINCT FAILURE MODES, IN ORDER OF ONSET
 * ----------------------------------------------------------------------------
 *
 * 1. `computeStrips` returns strips with an EMPTY boundary. The clipped face's computed area
 *    rounds to exactly zero, so it satisfies neither `signedArea < 0` (outer) nor
 *    `signedArea > 0` (hole), and `outer[0] ?? []` hands back nothing. The solve is complete,
 *    the offset ring is exact, and a whole quarter of the block silently disappears.
 *
 * 2. `solveSkeleton` returns `complete: true` with `diagnostics: []` and a WRONG skeleton.
 *    Broken Polygon translated to 1e8 reports a maximum offset of 308.98 where the true value
 *    is 126.63 — impossible for a shape 680 units across — and `computeOffsetRings` then
 *    returns nothing at all past a quarter of the way in. There is no signal on the result
 *    that anything went wrong.
 *
 * Neither is the near-regular defect of `near-regular-failures.test.ts`. Every fixture here
 * solves cleanly untranslated, and the trigger is position, not symmetry.
 *
 * WHEN THESE ARE FIXED, INVERT THE ASSERTIONS IN THE LAST TWO BLOCKS — DO NOT DELETE THIS
 * FILE. The first two blocks are a genuine specification of the operating envelope and should
 * be kept and widened.
 */

setSkeletonLogLevel('silent');

function fixture(name: string): Vector2[] {
    const found = ALL_TEST_POLYGONS.find(polygon => polygon.name === name);
    if (found === undefined) {
        throw new Error(`No fixture named "${name}" in ALL_TEST_POLYGONS`);
    }
    return found.vertices;
}

function place(vertices: Vector2[], scale: number, translate: number): Vector2[] {
    return vertices.map(vertex => ({x: vertex.x * scale + translate, y: vertex.y * scale + translate}));
}

/** Shoelace exactly as `strip-decomposition.ts` and `geometry-helpers.ts` compute it. */
function signedAreaAbsolute(ring: Vector2[]): number {
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
}

/** The same quantity with the ring's own first vertex subtracted first: translation-invariant. */
function signedAreaRelative(ring: Vector2[]): number {
    const origin = ring[0];
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
    }
    return total / 2;
}

/** Does this fixture survive solve, offset projection and strip decomposition at this placement? */
function survives(vertices: Vector2[], scale: number, translate: number): boolean {
    const result = solveSkeleton(place(vertices, scale, translate));
    if (!result.complete || result.context === null) {
        return false;
    }
    const maxOffset = computeMaxOffset(result);
    const rings = computeOffsetRings(result, maxOffset * 0.5);
    if (rings.length === 0 || rings.some(ring => ring.length < 3)) {
        return false;
    }
    const strips = computeStrips(result, {depth: maxOffset * 0.5});
    return strips.length === result.graph.numExteriorNodes && strips.every(strip => strip.boundary.length >= 3);
}

function survivorCount(scale: number, translate: number): number {
    return ALL_TEST_POLYGONS.filter(polygon => survives(polygon.vertices, scale, translate)).length;
}

describe('large coordinates', () => {
    describe('the world-space operating envelope is sound', () => {
        it.each([0, 1e4, 1e5, 1e6, 1e7, 1e8])(
            'solves, offsets and strips every fixture as a 15-40 km-of-centimetres region at distance %p',
            translate => {
                expect(survivorCount(50, translate)).toBe(ALL_TEST_POLYGONS.length);
            },
        );
    });

    describe('translation alone is safe well past the intended range', () => {
        it.each([1e5, 1e6, 1e7])('every fixture survives translation to %p at its native span', translate => {
            expect(survivorCount(1, translate)).toBe(ALL_TEST_POLYGONS.length);
        });

        it('every fixture survives being scaled up by 10 000 about the origin', () => {
            expect(survivorCount(1e4, 0)).toBe(ALL_TEST_POLYGONS.length);
        });
    });

    describe('strips lose whole faces far from the origin (known defect)', () => {
        it('currently empties two of a square\'s four strips at 1e8, while everything else is exact', () => {
            const result = solveSkeleton(place(fixture('Square'), 1, 1e8));

            // The solve itself is perfect: five nodes, apex dead centre, max offset exactly 1.
            expect(result.complete).toBe(true);
            expect(result.diagnostics).toEqual([]);
            expect(computeMaxOffset(result)).toBe(1);

            // So is the offset ring.
            const rings = computeOffsetRings(result, 0.5);
            expect(rings).toHaveLength(1);
            expect(rings[0]).toHaveLength(4);

            // The strips are not. Two of the four come back with no boundary at all — and with
            // no holes either, so they were not merely misclassified as holes: their computed
            // area rounded to exactly zero and they matched neither filter.
            const strips = computeStrips(result, {depth: 0.5});
            expect(strips).toHaveLength(4);
            expect(strips.filter(strip => strip.boundary.length === 0)).toHaveLength(2);
            expect(strips.every(strip => strip.holes.length === 0)).toBe(true);
        });

        it('is the absolute shoelace cancelling, not anything geometric', () => {
            // The trapezoid that strip 0 of that square should be, at the origin and at 1e8.
            const tile: Vector2[] = [
                {x: 0, y: 0},
                {x: 0, y: 2},
                {x: 0.5, y: 1.5},
                {x: 0.5, y: 0.5},
            ];
            const shifted = tile.map(vertex => ({x: vertex.x + 1e8, y: vertex.y + 1e8}));

            expect(signedAreaAbsolute(tile)).toBeCloseTo(-0.75, 12);
            expect(signedAreaRelative(shifted)).toBeCloseTo(-0.75, 6);

            // The form the source uses gives neither the right value nor even the right sign.
            expect(signedAreaAbsolute(shifted)).not.toBeLessThan(-0.7);
        });

        it('loses a square\'s winding entirely by 1e9 — the same sum, in the solver\'s pre-pass', () => {
            const atOrigin = fixture('Square');
            expect(isClockwise(atOrigin)).toBe(true);

            const far = place(atOrigin, 1, 1e9);
            // Same polygon, same winding, 2 units across. The shoelace sum returns exactly zero.
            expect(signedAreaRelative(far)).toBeCloseTo(-4, 6);
            expect(signedAreaAbsolute(far)).toBe(0);
            expect(isClockwise(far)).toBe(false);
        });
    });

    describe('the solver reports success on a wrong skeleton (known defect)', () => {
        it('currently returns complete: true and no diagnostics for a corrupt solve at 1e8', () => {
            const atOrigin = solveSkeleton(fixture('Broken Polygon'));
            const far = solveSkeleton(place(fixture('Broken Polygon'), 1, 1e8));

            expect(atOrigin.complete).toBe(true);
            expect(computeMaxOffset(atOrigin)).toBeCloseTo(126.630159, 5);

            // Translating a rigid shape cannot change how far its wavefront travels. It does.
            expect(far.complete).toBe(true);
            expect(far.diagnostics).toEqual([]);
            expect(computeMaxOffset(far)).toBeGreaterThan(300);
        });

        it('currently offsets that corrupt skeleton into nothing, silently, past a quarter in', () => {
            const far = solveSkeleton(place(fixture('Broken Polygon'), 1, 1e8));
            const maxOffset = computeMaxOffset(far);

            expect(computeOffsetRings(far, maxOffset * 0.25)).toHaveLength(1);
            expect(computeOffsetRings(far, maxOffset * 0.5)).toEqual([]);
            expect(computeOffsetRings(far, maxOffset * 0.75)).toEqual([]);
        });
    });
});
