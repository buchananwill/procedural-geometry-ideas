import {
    ARRIVAL_MOMENT_ULPS,
    CROSS_PRODUCT_ROUNDING_UNITS,
    DEGENERATE_AREA_EPSILON,
    makeStraightSkeletonSolverContext,
    maxWeightRatio,
    minWeightTurnSine,
    simultaneityWindow,
    SKELETON_NOISE_FLOOR,
    UNIT_ROUNDOFF,
    Vector2,
} from '@proc-geo/core';
import {
    basisSumRoundingBound,
    cramerQuotientRoundingBound,
    DETERMINANT3_ROUNDING_UNITS,
    determinant3RoundingBound,
    determinant3TripleSum,
    UNIT_CROSS_PRODUCT_ROUNDING_BOUND,
    weightedRateSumRoundingBound,
} from '@proc-geo/core/straight-skeleton/constants';
import {SIMULTANEITY_RELATIVE_TOLERANCE} from '@proc-geo/core/straight-skeleton/offset-projection';

/*
 * ============================================================================
 *  THE TOLERANCE DERIVATION (C8), PINNED AS ARITHMETIC — DISPATCH 1
 * ============================================================================
 *
 * C8 spec T36: every derivation this dispatch lands is asserted as the ARITHMETIC it is, not as a
 * literal, so a changed number is a changed derivation and cannot pass as a re-tuned constant. What
 * dispatch 1 landed and this file holds:
 *
 *   - the simultaneity window `simultaneityWindow(δ) = δ`, carried on the context at every rung of the
 *     floor ladder (T5, T12);
 *   - `minWeightTurnSine(δ, Δw) = √(√2·u·Δw / δ)` (T21) and `maxWeightRatio(δ) = δ / (64·√2·u)` (T22,
 *     journal decision 156), each round-tripped to the ulp;
 *   - the division guards' first-order rounding bounds (T19, T20), each matched to its stated formula
 *     on random operands, and the 3×3 determinant's c₃ = 5 convicted against EXACT arithmetic;
 *   - the offset projection's simultaneous-set bar as the moment bar (T26), with the measured gap
 *     either side of it asserted as ratios.
 *
 * ----------------------------------------------------------------------------
 * HISTORY: THE PRE-CHANGE MEASUREMENTS (Part A of dispatch 1, 2026-09-24, on the tip e706548)
 * ----------------------------------------------------------------------------
 *
 * Cells: `FULL_CORPUS` at δ = 1e-6 and 1e-5 (120); Circle 48 and Rosette5 40 at the 46 fine
 * translations 1e8..1e13 (92); the off-edge 1e-3 jitter grid, L and plus, 8 seeds × k = 1..10, stage on
 * (160); the along-edge 1.0 jitter grid, stage off (160); the jittered Circle 32 ladder at 1/3/10/15/
 * 30/100 × 1e-8 of its span, seeds 0..7 (48). 580 cells.
 *
 * A1 — O1's HISTOGRAM (decision 154): the non-zero distances at which `findOrAddNode` joined a position
 * to an existing node, in ulps of the larger coordinate (in brackets: in ulps of the unit extent).
 *
 *     sweep                      exact    ≤8      ≤64     ≤1024   >1024
 *     corpus @1e-6                  6      0        0       0      0
 *     corpus @1e-5                  1      0        0       0      0
 *     fine translations           309      0 [5]    0       0     39 [34]
 *     off-edge jitter 1e-3        239      0        0       0      1
 *     along-edge jitter, off     1886      0        0       0      0
 *     Circle 32 jitter ladder      25      0        0       0      8
 *
 *   The 43 joins above 64 unit ulps sit at 7e-10 to 1.16e-8 and are 6e3 to 3.6e8 TIMES the larger of
 *   their two positions' pricing conditioning (|sep|·2u/sin²θ at the pair, the Cramer bound at the
 *   terminal triangle): they do NOT correlate. RULING: decision 154's third branch — each names a path
 *   that bypassed event resolution (the whole-event merge landing on an earlier layer's node, the
 *   terminal triangle's closed form, the split path), reported and NOT absorbed; the same-point bar is
 *   held (STOP). The five near-origin joins (Circle 48 at 6e11..1e12, 6.35e-22 apart) are exact in
 *   unit-extent ulps.
 *
 * A2 — THE COMPONENT-DIAMETER CENSUS (decision 155(b)): 23 421 components. Widest on the corpus
 *   5.44e-7 at 1e-6 and 4.42e-6 at 1e-5, none wider than its floor. Off it, 15 wider than δ = 1e-6
 *   (Circle 48 at 4e10, 5e10, 6e10, 2e11; eleven off-edge jitter cells), widest 1.906e-6. RULING: the
 *   clustering is restated ANCHORED on the earliest arrival (its union-find structure has one natural
 *   anchor per group, the earliest arrival the window already anchors on), attributed.
 *
 * A3 — O3, THE DEGENERACY BAR'S FORM: the 22 decision-96 declines of the recursion census, with the
 *   root floor restated in caller units (2.56e-4). (a) δ² keeps 1; (b) δ·(perimeter/2) keeps 16 and
 *   releases 6. Neither keeps every decline: RULING — STOP; `DEGENERATE_AREA_EPSILON` is unmoved. The
 *   decomposition's sub-polygon verdicts over the self-intersecting fixtures agree under current, (a)
 *   and (b) at 1e-6 and 1e-5.
 *
 * A4 — T9's BAND: zero `intersectRays` identical-source separations and zero degenerate-closure
 *   anchor separations in (0, 1e-8), over all 580 cells. T9's premise holds.
 *
 * A5 — T15's WINDOW CENSUS: at 1e-6 exactly four fixtures carry layers the window widens — seed 15838
 *   (3 layers), seed 55433 (6), seed 55433 k=4 (3), the plus seed 7919 (5); smallest gap above 1e-8
 *   1.29e-8, on the plus. At 1e-5 only `Offset Cross Junction` (3 layers, one 2 → 28 events). The spec's
 *   prediction, exactly.
 *
 * B2 — T7's BOUNDARY: 0 of 10 499 897 laterals at the three `≤ λ` sites equal the floor exactly.
 */

/** The floor ladder `perceptual-floor-option.test.ts` sweeps. */
const LADDER = [SKELETON_NOISE_FLOOR, 3e-6, 1e-5, 3e-5, 1e-4];

const SQUARE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}, {x: 1, y: 0}];

/** The unit in the last place of `value`. */
function ulp(value: number): number {
    const magnitude = Math.abs(value);
    let exponent = Math.floor(Math.log2(magnitude));
    if (2 ** exponent > magnitude) exponent -= 1;
    if (2 ** (exponent + 1) <= magnitude) exponent += 1;
    return 2 ** (exponent - 52);
}

/** mulberry32: a seeded, reproducible stream of operands. */
function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

/*
 * EXACT ARITHMETIC ON DOUBLES. Every finite double is `m · 2^e` with integer `m`, so sums and products
 * of doubles are exact as BigInt-scaled dyadic rationals. Used to convict a rounding bound against the
 * true error rather than against another floating-point estimate.
 */
interface Dyadic {
    mantissa: bigint;
    exponent: number;
}

function exact(value: number): Dyadic {
    if (value === 0) return {mantissa: 0n, exponent: 0};
    let exponent = 0;
    let scaled = value;
    while (!Number.isInteger(scaled)) {
        scaled *= 2;
        exponent -= 1;
    }
    return {mantissa: BigInt(scaled), exponent};
}

function times(a: Dyadic, b: Dyadic): Dyadic {
    return {mantissa: a.mantissa * b.mantissa, exponent: a.exponent + b.exponent};
}

function plus(a: Dyadic, b: Dyadic): Dyadic {
    const exponent = Math.min(a.exponent, b.exponent);
    return {
        mantissa: (a.mantissa << BigInt(a.exponent - exponent)) + (b.mantissa << BigInt(b.exponent - exponent)),
        exponent,
    };
}

function negate(a: Dyadic): Dyadic {
    return {mantissa: -a.mantissa, exponent: a.exponent};
}

/** |a − b| as a double, where `b` is a double and `a` exact: accurate to far better than the bounds tested. */
function absoluteDifference(a: Dyadic, b: number): number {
    const difference = plus(a, negate(exact(b)));
    const magnitude = difference.mantissa < 0n ? -difference.mantissa : difference.mantissa;
    return Number(magnitude) * 2 ** difference.exponent;
}

type Row3 = [number, number, number];

function evaluatedDeterminant(r0: Row3, r1: Row3, r2: Row3): number {
    // The production expression, in the production operation order (algorithm-termination-cases.ts).
    return r0[0] * (r1[1] * r2[2] - r1[2] * r2[1])
        - r0[1] * (r1[0] * r2[2] - r1[2] * r2[0])
        + r0[2] * (r1[0] * r2[1] - r1[1] * r2[0]);
}

function exactDeterminant(r0: Row3, r1: Row3, r2: Row3): Dyadic {
    const [a, b, c] = [r0.map(exact), r1.map(exact), r2.map(exact)];
    const minor = (p: Dyadic, q: Dyadic, s: Dyadic, t: Dyadic) => plus(times(p, q), negate(times(s, t)));
    return plus(plus(
        times(a[0], minor(b[1], c[2], b[2], c[1])),
        negate(times(a[1], minor(b[0], c[2], b[2], c[0])))),
        times(a[2], minor(b[0], c[1], b[1], c[0])));
}

describe('T5, T12: the simultaneity window is the floor, carried on the context', () => {
    it.each(LADDER)('reads δ exactly at the rung δ = %p', floor => {
        const context = makeStraightSkeletonSolverContext(SQUARE, floor);
        expect(simultaneityWindow(floor)).toBe(floor);
        expect(context.simultaneityWindow).toBe(floor);
        expect(context.simultaneityWindow).toBe(context.perceptualFloor);
    });
});

describe('T21: minWeightTurnSine(δ, Δw) = √(√2·u·Δw / δ)', () => {
    it('squares back to √2·u·Δw to within the rounding of its five operations', () => {
        // `√2·u` is exact (u a power of two); `· Δw`, `/ δ`, the square root, and the test's own square
        // and product each round once, so the round trip is off by at most a few ulps. Measured: at most
        // 3 over 200 000 random (δ, Δw) pairs; asserted here on the ladder and the spec's own Δw values.
        for (const floor of LADDER) {
            for (const weightDifference of [0.5, 1, 3, 15, 99, 1e3, 1e6]) {
                const sine = minWeightTurnSine(floor, weightDifference);
                const target = Math.SQRT2 * UNIT_ROUNDOFF * weightDifference;
                expect(Math.abs(sine * sine * floor - target)).toBeLessThanOrEqual(3 * ulp(target));
            }
        }
    });

    it('is k·u·t_max·Δw/δ with k = 2 and t_max = √2/2, and conditioningBound(δ)·√(Δw/2)', () => {
        const floor = SKELETON_NOISE_FLOOR;
        const tMax = Math.SQRT2 / 2;
        const viaDerivation = Math.sqrt(CROSS_PRODUCT_ROUNDING_UNITS * UNIT_ROUNDOFF * tMax * 15 / floor);
        expect(minWeightTurnSine(floor, 15) / viaDerivation).toBeCloseTo(1, 14);
        expect(minWeightTurnSine(floor, 15)).toBeCloseTo(4.853e-5, 8);
        expect(minWeightTurnSine(floor, 99)).toBeCloseTo(1.2468e-4, 8);
    });
});

describe('T22: maxWeightRatio(δ) = δ / (64·√2·u)', () => {
    it.each(LADDER)('multiplies back to δ exactly at the rung δ = %p', floor => {
        expect(maxWeightRatio(floor) * ARRIVAL_MOMENT_ULPS * Math.SQRT2 * UNIT_ROUNDOFF).toBe(floor);
    });

    it('multiplies back to δ within one ulp for any floor', () => {
        const random = seededRandom(22);
        for (let draw = 0; draw < 10_000; draw++) {
            const floor = 10 ** (-7 + 4 * random());
            const back = maxWeightRatio(floor) * ARRIVAL_MOMENT_ULPS * Math.SQRT2 * UNIT_ROUNDOFF;
            expect(Math.abs(back - floor)).toBeLessThanOrEqual(ulp(floor));
        }
    });

    it('is the coherence bound: the narrowest window at t_max equals the moment bar there', () => {
        // δ / R (the narrowest window, in time) against 64·ε·t_max (the moment bar at the largest time).
        const floor = SKELETON_NOISE_FLOOR;
        const narrowestWindow = floor / maxWeightRatio(floor);
        const momentBar = ARRIVAL_MOMENT_ULPS * Number.EPSILON * (Math.SQRT2 / 2);
        expect(narrowestWindow / momentBar).toBeCloseTo(1, 12);
        expect(maxWeightRatio(floor)).toBeCloseTo(9.95e7, -6);
    });
});

describe('T19, T20: every division guard takes its own first-order rounding bound', () => {
    const random = seededRandom(19);
    const u = UNIT_ROUNDOFF;
    const k = CROSS_PRODUCT_ROUNDING_UNITS;

    it('S32–S34: the weighted rate sum, k·u·(wA + wB) + 2u·(|termA| + |termB|)', () => {
        for (let draw = 0; draw < 1000; draw++) {
            const [termA, termB] = [random() * 2 - 1, random() * 2 - 1];
            const [weightA, weightB] = [1 + 99 * random(), 1 + 99 * random()];
            expect(weightedRateSumRoundingBound(termA, termB, weightA, weightB))
                .toBe(k * u * (weightA + weightB) + 2 * u * (Math.abs(termA) + Math.abs(termB)));
        }
        // At unit weights and unit rates, 8u — seven orders inside the retired 1e-8.
        expect(weightedRateSumRoundingBound(1, 1, 1, 1)).toBe(8 * u);
    });

    it('S35: c₃ = 5 bounds the 3×3 determinant\'s true error, measured against exact arithmetic', () => {
        expect(DETERMINANT3_ROUNDING_UNITS).toBe(5);
        let worstRatio = 0;
        for (let draw = 0; draw < 2000; draw++) {
            const row = (): Row3 => [random() * 2 - 1, random() * 2 - 1, -(1 + 9 * random())];
            const [r0, r1, r2] = [row(), row(), row()];
            const sum = determinant3TripleSum(r0, r1, r2);
            expect(determinant3RoundingBound(sum)).toBe(5 * u * sum);
            const error = absoluteDifference(exactDeterminant(r0, r1, r2), evaluatedDeterminant(r0, r1, r2));
            expect(error).toBeLessThanOrEqual(determinant3RoundingBound(sum));
            worstRatio = Math.max(worstRatio, error / (u * sum));
        }
        // The bound is a bound, not a fit: the worst measured error is inside it, and the exact
        // comparison is live — rounding error was seen, not an identically-zero difference.
        expect(worstRatio).toBeLessThan(DETERMINANT3_ROUNDING_UNITS);
        expect(worstRatio).toBeGreaterThan(0);
    });

    it('S35: the triple sum is Σ over the six cofactor-expansion products', () => {
        const r0: Row3 = [2, -3, 5];
        const r1: Row3 = [-7, 11, -13];
        const r2: Row3 = [17, -19, 23];
        const expected = 2 * (11 * 23 + 13 * 19) + 3 * (7 * 23 + 13 * 17) + 5 * (7 * 19 + 11 * 17);
        expect(determinant3TripleSum(r0, r1, r2)).toBe(expected);
    });

    it('S36: Cramer\'s t carries (c₃·u·Σ_t + |t|·c₃·u·Σ)/|det| + u·|t|', () => {
        for (let draw = 0; draw < 1000; draw++) {
            const [numeratorSum, denominatorSum] = [10 * random(), 10 * random()];
            const [quotient, determinant] = [random() * 4 - 2, 0.1 + random()];
            expect(cramerQuotientRoundingBound(numeratorSum, denominatorSum, quotient, determinant))
                .toBe((5 * u * numeratorSum + Math.abs(quotient) * (5 * u * denominatorSum)) / determinant
                    + u * Math.abs(quotient));
        }
    });

    it('S37: the basis sum, k·u·(wA + wB) — 2k·u at unit weights', () => {
        expect(basisSumRoundingBound(1, 1)).toBe(2 * k * u);
        for (let draw = 0; draw < 1000; draw++) {
            const [weightA, weightB] = [1 + 99 * random(), 1 + 99 * random()];
            expect(basisSumRoundingBound(weightA, weightB)).toBe(k * u * (weightA + weightB));
        }
    });

    it('S38: a unit cross product, k·u', () => {
        expect(UNIT_CROSS_PRODUCT_ROUNDING_BOUND).toBe(k * u);
    });
});

describe('T26: the offset projection\'s simultaneous sets read the moment bar', () => {
    it('sits inside the measured eleven-order gap, with an order to spare below and eight above', () => {
        // Measured over `CLEAN_TEST_POLYGONS` plus the near-regular fixtures (offset-projection.ts):
        // widest within-instant spread 1.42e-15 of the maximum offset; narrowest real gap 1.23e-4.
        const withinInstantSpread = 1.42e-15;
        const nearestRealGap = 1.23e-4;
        const momentBar = ARRIVAL_MOMENT_ULPS * Number.EPSILON;
        expect(SIMULTANEITY_RELATIVE_TOLERANCE).toBe(momentBar);
        expect(momentBar).toBeCloseTo(1.42e-14, 16);
        expect(momentBar / withinInstantSpread).toBeGreaterThan(9);
        expect(nearestRealGap / momentBar).toBeGreaterThan(1e9);
    });
});

describe('T23 is held: the degeneracy floor is unmoved while O3 is STOPPED', () => {
    it('is still the absolute area it was', () => {
        // Neither of O3's forms kept every decision-96 decline (header, A3), so nothing moved.
        expect(DEGENERATE_AREA_EPSILON).toBe(1e-6);
    });
});
