import {
    NEAR_REGULAR_CIRCLE_16,
    NEAR_REGULAR_CIRCLE_32,
    NEAR_REGULAR_CIRCLE_48,
    NEAR_REGULAR_ELLIPSE_16,
    NEAR_REGULAR_ELLIPSE_32,
    NEAR_REGULAR_PEANUT_32,
    NEAR_REGULAR_ROSETTE5_40,
} from '@proc-geo/test-fixtures';
import {isClockwise, setSkeletonLogLevel, solveSkeleton, Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  THIS FILE RECORDS A KNOWN DEFECT. THE FAILURES BELOW ARE NOT DESIRED
 *  BEHAVIOUR AND THESE ASSERTIONS ARE NOT A SPECIFICATION.
 * ============================================================================
 *
 * `solveSkeleton` does not resolve symmetric, near-regular, densely sampled polygons.
 * Every assertion of `complete === false` here is a characterisation of what the solver
 * does today, written down so the defect is reproducible instead of anecdotal.
 *
 * The cause is an open question. The evidence points at event ordering: exact symmetry
 * makes many collision events coincide at the same offset, and the solver does not
 * disambiguate them. See "Jitter" below — this is not a wild guess, but it is not a
 * diagnosis either, and nobody has yet traced it to a specific line.
 *
 * WHEN THE DEFECT IS FIXED, INVERT THESE ASSERTIONS — DO NOT DELETE THIS FILE.
 * Flip each `expect(result.complete).toBe(false)` to `true`, drop the diagnostic-kind
 * expectations, and keep the fixtures. They are the hardest inputs the solver has, and
 * they are the regression guard for whatever fix lands. Only once every fixture here
 * passes should they be promoted into `ALL_TEST_POLYGONS` in @proc-geo/test-fixtures —
 * that list is swept by several suites which assert completeness for every member, so
 * adding them earlier breaks those suites and destroys the value of the sweep.
 *
 * ----------------------------------------------------------------------------
 * MEASURED BOUNDARY — vertex count, centre (300, 300), swept n = 3..64
 * ----------------------------------------------------------------------------
 *
 * Regular circle, r = 150:
 *     completes: n = 3, 4, 6
 *     fails:     n = 5, and every n from 7 to 64 inclusive
 *
 * Ellipse, x = 150 cos t, y = 100 sin t:
 *     completes: n = 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 16, 18, 29, 30, 53, 61
 *     fails:     n = 10, 13, 15, 17, 19-28, 31-52, 54-60, 62-64
 *
 * So it is not a clean density threshold. The regular polygon collapses almost
 * immediately and never recovers; the ellipse — which breaks rotational symmetry but
 * keeps two mirror axes — survives sporadically well past n = 30. The surviving cases
 * are isolated, not a contiguous band, which is what a knife-edge floating-point
 * tie-break looks like rather than a geometric limit.
 *
 * The full sweep is not run here — it recomputes vertices with `Math.cos`/`Math.sin`,
 * and the outcome turns on the last bits of the mantissa, so it is not portable enough
 * to assert per-n. The density test below asserts the aggregate shape of the sweep
 * instead, which is robust.
 *
 * ----------------------------------------------------------------------------
 * MEASURED JITTER THRESHOLD — circle-32, uniform per-vertex jitter, 10 seeds each
 * ----------------------------------------------------------------------------
 *
 *     jitter (% of r=150)   absolute      runs completing
 *     1e-12 .. 1e-9         <= 1.5e-9     0 / 10
 *     1e-8                  1.5e-8        2 / 10
 *     1e-7 .. 10            >= 1.5e-7     10 / 10
 *
 * A perturbation of 1.5e-7 units on a radius of 150 — a relative displacement of about
 * 1e-9 — is enough to turn every failing run into a complete solve. That is barely above
 * `FLOATING_POINT_EPSILON` (1e-8) in `src/straight-skeleton/constants.ts`. Displacement
 * that small cannot change the shape's geometry in any meaningful sense; all it can do is
 * separate events that were previously tied. This strongly supports the simultaneous-event
 * theory and rules out any explanation based on the polygon being "too dense" or
 * "too round".
 */

setSkeletonLogLevel('silent');

interface Outcome {
    complete: boolean;
    kinds: string[];
}

function outcomeOf(vertices: Vector2[]): Outcome {
    const result = solveSkeleton(vertices);
    return {complete: result.complete, kinds: result.diagnostics.map(d => d.kind)};
}

/** mulberry32, so the jitter cases below are reproducible from their seed. */
function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

function jitter(vertices: Vector2[], amplitude: number, seed: number): Vector2[] {
    const random = seededRandom(seed);
    return vertices.map(vertex => ({
        x: vertex.x + (random() * 2 - 1) * amplitude,
        y: vertex.y + (random() * 2 - 1) * amplitude,
    }));
}

/** Regular n-gon of radius 150 about (300, 300), wound clockwise. */
function regularPolygon(n: number): Vector2[] {
    const vertices: Vector2[] = [];
    for (let i = 0; i < n; i++) {
        const theta = (2 * Math.PI * i) / n;
        vertices.push({x: 300 + 150 * Math.cos(theta), y: 300 + 150 * Math.sin(theta)});
    }
    return isClockwise(vertices) ? vertices : vertices.reverse();
}

describe('near-regular polygons (known solver defect)', () => {
    describe('fixtures are well-formed input', () => {
        it.each([
            ['circle-16', NEAR_REGULAR_CIRCLE_16, 16],
            ['circle-32', NEAR_REGULAR_CIRCLE_32, 32],
            ['circle-48', NEAR_REGULAR_CIRCLE_48, 48],
            ['ellipse-16', NEAR_REGULAR_ELLIPSE_16, 16],
            ['ellipse-32', NEAR_REGULAR_ELLIPSE_32, 32],
            ['peanut-32', NEAR_REGULAR_PEANUT_32, 32],
            ['rosette5-40', NEAR_REGULAR_ROSETTE5_40, 40],
        ] as [string, Vector2[], number][])(
            '%s is a clockwise simple polygon of the stated density',
            (_name, vertices, expectedCount) => {
                expect(vertices).toHaveLength(expectedCount);
                expect(isClockwise(vertices)).toBe(true);
                expect(outcomeOf(vertices).kinds).not.toContain('winding-normalised');
                expect(outcomeOf(vertices).kinds).not.toContain('self-intersecting');
            },
        );
    });

    describe('control case', () => {
        it('solves the 16-vertex ellipse completely', () => {
            const result = solveSkeleton(NEAR_REGULAR_ELLIPSE_16);

            expect(result.complete).toBe(true);
            expect(result.diagnostics).toEqual([]);
        });
    });

    describe('regular circles', () => {
        it('currently fails to resolve the 16-vertex regular circle (known defect)', () => {
            const outcome = outcomeOf(NEAR_REGULAR_CIRCLE_16);

            expect(outcome.complete).toBe(false);
            expect(outcome.kinds).toContain('step-failure');
            expect(outcome.kinds).toContain('unresolved-edges');
        });

        it('currently fails to resolve the 32-vertex regular circle (known defect)', () => {
            const outcome = outcomeOf(NEAR_REGULAR_CIRCLE_32);

            expect(outcome.complete).toBe(false);
            expect(outcome.kinds).toContain('step-failure');
            expect(outcome.kinds).toContain('unresolved-edges');
        });

        it('currently fails to resolve the 48-vertex regular circle (known defect)', () => {
            const outcome = outcomeOf(NEAR_REGULAR_CIRCLE_48);

            expect(outcome.complete).toBe(false);
            expect(outcome.kinds).toContain('step-failure');
            expect(outcome.kinds).toContain('unresolved-edges');
        });
    });

    describe('denser and lobed shapes', () => {
        it('currently fails to resolve the 32-vertex ellipse (known defect)', () => {
            const outcome = outcomeOf(NEAR_REGULAR_ELLIPSE_32);

            expect(outcome.complete).toBe(false);
            expect(outcome.kinds).toContain('unresolved-edges');
        });

        it('currently fails to resolve the 32-vertex two-lobed peanut (known defect)', () => {
            const outcome = outcomeOf(NEAR_REGULAR_PEANUT_32);

            expect(outcome.complete).toBe(false);
            expect(outcome.kinds).toContain('step-failure');
            expect(outcome.kinds).toContain('unresolved-edges');
        });

        it('currently fails to resolve the 40-vertex five-lobed rosette (known defect)', () => {
            const outcome = outcomeOf(NEAR_REGULAR_ROSETTE5_40);

            expect(outcome.complete).toBe(false);
            expect(outcome.kinds).toContain('step-failure');
            expect(outcome.kinds).toContain('unresolved-edges');
        });
    });

    describe('vertex-count boundary (sampled from the n = 3..64 sweep)', () => {
        it('currently solves the smallest regular polygons', () => {
            expect(solveSkeleton(regularPolygon(3)).complete).toBe(true);
            expect(solveSkeleton(regularPolygon(4)).complete).toBe(true);
        });

        it('currently fails on almost every regular polygon from n = 7 upwards (known defect)', () => {
            const counts = Array.from({length: 34}, (_unused, index) => index + 7);
            const completed = counts.filter(n => solveSkeleton(regularPolygon(n)).complete);

            // Measured: zero of n = 7..40 complete. The bound is loose because the vertices
            // are recomputed with Math.cos/Math.sin and the outcome turns on the last bits
            // of the mantissa; the point being asserted is that success is the exception.
            expect(completed.length).toBeLessThanOrEqual(3);
        });
    });

    describe('jitter — perturbing a failing polygon away from exact symmetry', () => {
        it('currently fails on the exactly symmetric 32-vertex circle (known defect)', () => {
            expect(solveSkeleton(NEAR_REGULAR_CIRCLE_32).complete).toBe(false);
        });

        it.each([1, 2, 3, 4, 5])(
            'solves the same circle once jittered by 1%% of the radius (seed %i)',
            seed => {
                expect(solveSkeleton(jitter(NEAR_REGULAR_CIRCLE_32, 1.5, seed)).complete).toBe(true);
            },
        );

        it.each([1, 2, 3, 4, 5])(
            'solves the same circle once jittered by 0.1%% of the radius (seed %i)',
            seed => {
                expect(solveSkeleton(jitter(NEAR_REGULAR_CIRCLE_32, 0.15, seed)).complete).toBe(true);
            },
        );

        it('needs only a jitter just above FLOATING_POINT_EPSILON to start solving', () => {
            // 1.5e-7 units on a radius of 150 — a relative displacement of about 1e-9.
            const seeds = [1, 2, 3, 4, 5];
            const completed = seeds.filter(seed => solveSkeleton(jitter(NEAR_REGULAR_CIRCLE_32, 1.5e-7, seed)).complete);

            expect(completed).toEqual(seeds);
        });
    });
});
