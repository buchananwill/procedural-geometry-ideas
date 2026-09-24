import {
    addBisectionEdge,
    angularResolution,
    Arrival,
    ARRIVAL_MOMENT_ULPS,
    checkWavefrontCausality,
    coaxialityFloor,
    compareArrivals,
    CROSS_PRODUCT_ROUNDING_UNITS,
    crossProduct,
    decomposePolygon,
    degenerateAreaBar,
    denormaliseLength,
    directionsAreSame,
    flattenRecursiveTree,
    initInteriorEdges,
    intersectRays,
    lateralOffset,
    makeOffsetDistance,
    makeSkeletonNormalisation,
    makeStraightSkeletonSolverContext,
    makeWeightedBisectedBasis,
    maxWeightRatio,
    minWeightTurnSine,
    negateVector,
    normalize,
    pairSimultaneityWindow,
    RayProjection,
    rayIntersectionUncertainty,
    segmentSegmentIntersection,
    ringPerimeter,
    signedArea,
    simultaneityWindow,
    sineIsBelow,
    SKELETON_NOISE_FLOOR,
    solveSkeleton,
    StraightSkeletonGraph,
    subdivideRecursively,
    subtractVectors,
    UNIT_ROUNDOFF,
    Vector2,
} from '@proc-geo/core';
import {FULL_CORPUS, OFF_EDGE_JITTER_PLUS_SEED_7919} from '@proc-geo/test-fixtures';
import * as intersectionEdges from '@proc-geo/core/straight-skeleton/intersection-edges';
import {offsetRateIsArithmeticZero} from '@proc-geo/core/straight-skeleton/core-functions';
import {climbTerminalLadder} from '@proc-geo/core/straight-skeleton/algorithm-termination-cases';
import {
    ARITHMETIC_SAME_POINT_BOX,
    basisSumRoundingBound,
    cramerQuotientRoundingBound,
    DETERMINANT3_ROUNDING_UNITS,
    determinant3RoundingBound,
    determinant3TripleSum,
    FORWARD_CROSS_PRODUCT_ROUNDING_UNITS,
    HELD_SIMULTANEITY_WINDOW,
    OFFSET_RATE_FORWARD_ROUNDING_BOUND,
    UNIT_CROSS_PRODUCT_ROUNDING_BOUND,
    weightedRateSumRoundingBound,
} from '@proc-geo/core/straight-skeleton/constants';
import {SIMULTANEITY_RELATIVE_TOLERANCE} from '@proc-geo/core/straight-skeleton/offset-projection';
import {reachesSupportingLine} from '@proc-geo/core/straight-skeleton/generate-split-event';
import {rateViolations} from './wavefront-measurement-helpers';
import {clockwise, JITTER_DOUBLE_REFLEX_PLUS, jitteredSamples} from './jitter-helpers';

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

/*
 * ============================================================================
 *  DISPATCH 2 (2026-09-24): T12 AS AMENDED, T18, T23, T24, AND THE COHERENCE TABLE
 * ============================================================================
 *
 * Landed: the per-pair window's MACHINERY (the `Arrival` pricing budget and `pairSimultaneityWindow`),
 * unspent — its move to S22–S28 STOPPED (see `HELD_SIMULTANEITY_WINDOW`); the fourth oracle `rate`
 * (T18); the degeneracy bar in form (b) in both consumers (T23, decision 159(b)); the decomposition's
 * endpoint length and the segment test's own rounding bound (T24). Held: S19 (T17's move STOPPED),
 * S6/S10/S11/S20 (T33's precondition — the window at its derived form — is unmet).
 */

describe('T12 as amended (decision 160): the per-pair window, pinned as arithmetic', () => {
    const random = seededRandom(160);
    const arrival = (distance: number, weight: number, uncertainty: number): Arrival => ({distance, weight, uncertainty});

    it('is min(cap·min(w₁, w₂), max(64·ε·max(|d₁w₂|, |d₂w₁|), e₁·w₂ + e₂·w₁)) on random operands', () => {
        for (let draw = 0; draw < 2000; draw++) {
            const a = arrival(random(), 1 + 99 * random(), random() < 0.5 ? 0 : 1e-12 * random());
            const b = arrival(random(), 1 + 99 * random(), random() < 0.5 ? 0 : 1e-6 * random());
            const cap = random() < 0.2 ? 0 : 1e-6 * (1 + random());
            const left = a.distance * b.weight;
            const right = b.distance * a.weight;
            const expected = Math.min(cap * Math.min(a.weight, b.weight),
                Math.max(ARRIVAL_MOMENT_ULPS * Number.EPSILON * Math.max(Math.abs(left), Math.abs(right)),
                    a.uncertainty * b.weight + b.uncertainty * a.weight));
            expect(pairSimultaneityWindow(a, b, cap)).toBe(expected);
        }
    });

    it('reads the moment bar at the LATER time for stored arrivals, the budgets when they are wider, δ at most', () => {
        const floor = SKELETON_NOISE_FLOOR;
        // Stored positions carry no budget: the window is the moment bar at the later time.
        expect(pairSimultaneityWindow(arrival(0.25, 1, 0), arrival(0.5, 1, 0), floor))
            .toBe(ARRIVAL_MOMENT_ULPS * Number.EPSILON * 0.5);
        // A budget wider than the moment bar widens it…
        expect(pairSimultaneityWindow(arrival(0.5, 1, 3e-12), arrival(0.5, 1, 4e-12), floor)).toBe(7e-12);
        // …and never past the floor, stated on the faster participant.
        expect(pairSimultaneityWindow(arrival(0.5, 1, 1e-3), arrival(0.5, 4, 1e-3), floor)).toBe(floor * 1);
        // A literal cap of 0 is exact.
        expect(pairSimultaneityWindow(arrival(0.5, 1, 1e-3), arrival(0.5, 1, 1e-3), 0)).toBe(0);
    });

    it('prices a ray intersection at k·u·|sep| / sin²θ', () => {
        for (let draw = 0; draw < 1000; draw++) {
            const theta = 2 * Math.PI * random();
            const phi = theta + 0.01 + 3 * random();
            const ray1 = {sourceVector: {x: random(), y: random()}, basisVector: {x: Math.cos(theta), y: Math.sin(theta)}};
            const ray2 = {sourceVector: {x: random(), y: random()}, basisVector: {x: Math.cos(phi), y: Math.sin(phi)}};
            const sine = crossProduct(ray1.basisVector, ray2.basisVector);
            const separation = Math.hypot(ray2.sourceVector.x - ray1.sourceVector.x, ray2.sourceVector.y - ray1.sourceVector.y);
            expect(rayIntersectionUncertainty(ray1, ray2))
                .toBeCloseTo(CROSS_PRODUCT_ROUNDING_UNITS * UNIT_ROUNDOFF * separation / (sine * sine), 25);
        }
    });

    it('is NOT spent: the seven sites hold the historical 1e-8 under a measured STOP (T16, T37)', () => {
        // S22–S28 all compare at `HELD_SIMULTANEITY_WINDOW` through `compareArrivals`' flat per-pair
        // form: 1e-7 apart at unit weights is two moments, 5e-9 apart is one — whatever the budgets say.
        expect(HELD_SIMULTANEITY_WINDOW).toBe(1e-8);
        expect(compareArrivals(arrival(0.5, 1, 0), arrival(0.5 + 5e-9, 1, 0), HELD_SIMULTANEITY_WINDOW)).toBe(0);
        expect(compareArrivals(arrival(0.5, 1, 0), arrival(0.5 + 1e-7, 1, 0), HELD_SIMULTANEITY_WINDOW)).toBe(-1);
    });
});

describe('T17 / T18: the fourth oracle is the exact complement of the zero-rate predicate', () => {
    /** A four-wall ring whose bisector e4 has clockwise parent e0 and widdershins parent e2. */
    function graphWith(clockwise: Vector2, widdershins: Vector2, bisector: Vector2): StraightSkeletonGraph {
        return {
            nodes: [
                {id: 0, position: {x: 0, y: 0}, inEdges: [3], outEdges: [0, 4]},
                {id: 1, position: {x: 4, y: 0}, inEdges: [0], outEdges: [1]},
                {id: 2, position: {x: 4, y: -1}, inEdges: [1], outEdges: [2]},
                {id: 3, position: {x: 0, y: -1}, inEdges: [2], outEdges: [3]},
            ],
            edges: [
                {id: 0, source: 0, target: 1, basisVector: clockwise},
                {id: 1, source: 1, target: 2, basisVector: {x: 0, y: -1}},
                {id: 2, source: 2, target: 3, basisVector: widdershins},
                {id: 3, source: 3, target: 0, basisVector: {x: 0, y: 1}},
                {id: 4, source: 0, basisVector: bisector},
            ],
            numExteriorNodes: 4,
            interiorEdges: [{id: 4, clockwiseExteriorEdgeIndex: 0, widdershinsExteriorEdgeIndex: 2, length: Number.MAX_VALUE}],
            exteriorWeights: [1, 1, 1, 1],
        };
    }

    it.each([SKELETON_NOISE_FLOOR, 1e-5])('T17 true ⇔ T18 violation false, on random parents with a negative rate, at δ = %p', floor => {
        const random = seededRandom(17);
        const resolution = angularResolution(floor);
        let antiParallelSeen = 0;
        let violationsSeen = 0;
        for (let draw = 0; draw < 4000; draw++) {
            const theta = 2 * Math.PI * random();
            const clockwise = {x: Math.cos(theta), y: Math.sin(theta)};
            // Widdershins parent near anti-parallel: a deviation spread across the resolution.
            const deviation = (random() * 2 - 1) * 3 * resolution;
            const flip = random() < 0.1 ? 0 : Math.PI;
            const widdershins = {x: Math.cos(theta + flip + deviation), y: Math.sin(theta + flip + deviation)};
            // A bisector with a NEGATIVE rate against the clockwise parent: rotated slightly widdershins of it.
            const lean = 1e-7 + 1e-4 * random();
            const bisector = {x: Math.cos(theta + lean), y: Math.sin(theta + lean)};
            expect(crossProduct(bisector, clockwise)).toBeLessThan(0);

            const zeroRate = directionsAreSame(clockwise, negateVector(widdershins), resolution);
            const graph = graphWith(clockwise, widdershins, bisector);
            const solverViolates = checkWavefrontCausality(graph, floor, 1).some(found => found.oracle === 'rate');
            const oracleViolates = rateViolations(graph, floor).includes(4);
            expect(solverViolates).toBe(!zeroRate);
            expect(oracleViolates).toBe(!zeroRate);
            antiParallelSeen += zeroRate ? 1 : 0;
            violationsSeen += solverViolates ? 1 : 0;
        }
        // Both halves of the partition are exercised.
        expect(antiParallelSeen).toBeGreaterThan(500);
        expect(violationsSeen).toBeGreaterThan(500);
    });

    it('a non-negative rate is never a violation, whatever the parents', () => {
        const random = seededRandom(18);
        for (let draw = 0; draw < 1000; draw++) {
            const theta = 2 * Math.PI * random();
            const clockwise = {x: Math.cos(theta), y: Math.sin(theta)};
            const widdershins = {x: Math.cos(theta + 6 * random()), y: Math.sin(theta + 6 * random())};
            const bisector = {x: Math.cos(theta + 0.5 * random()), y: Math.sin(theta + 0.5 * random())};
            if (crossProduct(bisector, clockwise) < 0) continue;
            expect(checkWavefrontCausality(graphWith(clockwise, widdershins, bisector), SKELETON_NOISE_FLOOR, 1)
                .filter(found => found.oracle === 'rate')).toEqual([]);
        }
    });
});

describe('T23 (O3 form (b), decision 159(b)): the degeneracy bar is "no visible width", one bar in two spaces', () => {
    it('is floor · perimeter / 2', () => {
        const random = seededRandom(23);
        for (let draw = 0; draw < 1000; draw++) {
            const [floor, perimeter] = [1e-7 + 1e-4 * random(), 10 * random()];
            expect(degenerateAreaBar(floor, perimeter)).toBe(floor * perimeter / 2);
        }
    });

    it('the recursion reads it with the ROOT floor restated in caller units (S43)', () => {
        const rootFloor = denormaliseLength(makeSkeletonNormalisation(OFF_EDGE_JITTER_PLUS_SEED_7919), SKELETON_NOISE_FLOOR);
        const declines = flattenRecursiveTree(subdivideRecursively(OFF_EDGE_JITTER_PLUS_SEED_7919, {
            levels: [1, 1, 1].map(() => ({depthFraction: 1, mergeGroupSize: 1, segments: 'recurse' as const, residue: 'recurse' as const})),
        })).flatMap(node => node.outcome.kind === 'declined-degenerate' ? [{node, outcome: node.outcome}] : []);
        expect(declines.length).toBeGreaterThan(0);
        for (const {node, outcome} of declines) {
            expect(outcome.bar).toBe(degenerateAreaBar(rootFloor, ringPerimeter(node.boundary)));
            expect(outcome.area).toBeLessThan(outcome.bar);
        }
    });

    it('the decomposition reads it in the space it is handed, with the floor it is handed (S44)', () => {
        // The bowtie's clockwise lobe is a triangle of area 25 and perimeter 10 + 10√2 ≈ 24.1: kept at
        // any floor under 25 / 12.07 ≈ 2.07 (its mean width), discarded above it.
        const bowtie: Vector2[] = [{x: 0, y: 0}, {x: 10, y: -10}, {x: 10, y: 0}, {x: 0, y: -10}];
        const kept = decomposePolygon(bowtie, 2);
        const discarded = decomposePolygon(bowtie, 2.2);
        expect(kept.wasSelfIntersecting).toBe(true);
        expect(kept.subPolygons.length).toBeGreaterThan(0);
        for (const sub of kept.subPolygons) {
            expect(Math.abs(signedArea(sub))).toBeGreaterThanOrEqual(degenerateAreaBar(2, ringPerimeter(sub)));
        }
        expect(discarded.subPolygons.length).toBeLessThan(kept.subPolygons.length);
    });
});

describe('T24: the decomposition\'s endpoint test is a length at the floor; the segment test its own bound', () => {
    it('reads a crossing within δ of a shared vertex as a touch, and one beyond it as a crossing', () => {
        // Edge 0 runs (0,0)→(1,0); the poking edge crosses it at x = 1 − d, d from the vertex (1, 0).
        const floor = SKELETON_NOISE_FLOOR;
        const pokeAt = (d: number): Vector2[] => [
            {x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: -1}, {x: 1 - d, y: 0.5}, {x: 1 - d, y: -0.5}, {x: 0, y: -1},
        ];
        expect(decomposePolygon(pokeAt(10 * floor), floor).wasSelfIntersecting).toBe(true);
        expect(decomposePolygon(pokeAt(floor / 10), floor).wasSelfIntersecting).toBe(false);
    });

    it('S46: two tiny segments crossing at 45° are priced — the parallel bar is k·u·|a|·|b|, not an area', () => {
        // |dA|·|dB|·sin θ = 1e-12 · √2/2 ≈ 7e-13: under the retired absolute 1e-10, which called them
        // parallel, and twelve orders above their own rounding bound.
        const s = 1e-6;
        const hit = segmentSegmentIntersection({x: 0, y: 0}, {x: s, y: 0}, {x: s / 2, y: -s / 2}, {x: s, y: s / 2});
        expect(hit).not.toBeNull();
        expect(hit!.tA).toBeCloseTo(0.75, 12);
        // Exactly parallel segments are still refused.
        expect(segmentSegmentIntersection({x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: 1, y: 1})).toBeNull();
    });

    it('S46: containment is exact — a crossing just past a segment\'s end is not on it', () => {
        // The second segment stops 1e-12 short of the first (tA ≈ −1e-12): the retired 1e-10 slack
        // admitted it.
        const hit = segmentSegmentIntersection({x: 0, y: 0}, {x: 1, y: 0}, {x: -1e-12, y: -1}, {x: -1e-12, y: 1});
        expect(hit).toBeNull();
        expect(segmentSegmentIntersection({x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1})).not.toBeNull();
    });
});

/*
 * ============================================================================
 *  DISPATCH 3 (2026-09-24): THREE F64 SITES LAND; S19 AND S10 STAY HELD (journal decisions 161(e), 164)
 * ============================================================================
 *
 * The held window IS the tree the F64 sites are measured on (decision 161(e): T33's precondition is
 * dissolved, the window being held indefinitely under register C12), so dispatch 2's census is the
 * evidence and dispatch 3 lands what it cleared:
 *
 *   - S6, `intersectRays`' identical-source exit: EXACT, `separation === 0` (T9, T29);
 *   - S20, `makeOffsetDistance`'s zero gradient: the offset rate's FORWARD rounding bound, 8u (T30;
 *     decision 164) — `offsetRateIsArithmeticZero`. `k·u` was landed first and refused: it priced `Golf
 *     Cart`'s 3.3u rates and moved its digest pin;
 *   - S11, `solveDegenerateClosure`'s point-on-ray: the coaxial form, forward by the exact sign and the
 *     one-sided lateral within λ (T32, I8);
 *   - S19, `addBisectionEdge`'s zero rate: measured at `k·u` and at the forward 8u, both refused on `Golf
 *     Cart` (at the root, then in its level-1 regions), HELD at its sine 1e-8;
 *   - S10, `tryAttachEdgeToNode`'s snap: HELD at its sine 1e-8 (decision 161(e)).
 *
 * Measured over dispatch 2's 580 cells (the corpus at 1e-6 and 1e-5, Circle 48 and Rosette5 40 at the
 * 46 fine translations, the off-edge 1e-3 grid, the along-edge 1.0 grid with the stage off, the jittered
 * Circle 32 ladder): S6, S20 and S11 landed against their held literals move 0 cells — geometry, verdict,
 * node count, every oracle — and no digest pin. See each `describe` below and the site comments.
 */

/** A solver context over {@link SQUARE} with one bisector per vertex; bisector i leaves vertex i. */
function squareContext() {
    const context = makeStraightSkeletonSolverContext(SQUARE, SKELETON_NOISE_FLOOR);
    initInteriorEdges(context);
    return {context, interiorEdgeIds: context.graph.interiorEdges.map(edge => edge.id)};
}

/** `basis` turned by `angle` radians widdershins. */
function turned(basis: Vector2, angle: number): Vector2 {
    return {
        x: basis.x * Math.cos(angle) - basis.y * Math.sin(angle),
        y: basis.x * Math.sin(angle) + basis.y * Math.cos(angle),
    };
}

describe('T9 / T29: the identical-source exit (S6) is exact', () => {
    const lane = SKELETON_NOISE_FLOOR;
    const resolution = angularResolution(SKELETON_NOISE_FLOOR);

    it('answers identical-source at a separation of exactly 0, and at no separation above it', () => {
        const ray = {sourceVector: {x: 0.3, y: 0.7}, basisVector: {x: 1, y: 0}};
        const up = (dx: number) => ({sourceVector: {x: 0.3 + dx, y: 0.7}, basisVector: {x: 0, y: 1}});
        expect(intersectRays(ray, up(0), lane, resolution)[2]).toBe('identical-source');
        // One ulp of the coordinate, then across the band the retired 1e-8 bar swallowed.
        for (const gap of [ulp(0.3), 1e-12, 5e-9, 9.9e-9]) {
            expect(0.3 + gap - 0.3).toBeGreaterThan(0);
            expect(intersectRays(ray, up(gap), lane, resolution)[2]).not.toBe('identical-source');
        }
    });

    it('the band (0, 1e-8) is empty on the corpus, and a corpus pair nudged into it is two sources', () => {
        // Every `intersectRays` call the solver makes over `FULL_CORPUS` at the library floor, read at
        // the call. T9's premise: every production source is a STORED node position, so two sources are
        // bit-identical or further apart than any rounding — the band is empty, and exact moves nothing.
        const original = intersectionEdges.intersectRays;
        let inBand = 0;
        let identical: [RayProjection, RayProjection] | undefined;
        const spy = jest.spyOn(intersectionEdges, 'intersectRays').mockImplementation((ray1, ray2, floor, angle) => {
            const separation = Math.hypot(ray2.sourceVector.x - ray1.sourceVector.x, ray2.sourceVector.y - ray1.sourceVector.y);
            if (separation > 0 && separation < 1e-8) inBand += 1;
            if (separation === 0 && identical === undefined) identical = [ray1, ray2];
            return original(ray1, ray2, floor, angle);
        });
        try {
            for (const fixture of FULL_CORPUS) {
                solveSkeleton(fixture.vertices);
            }
        } finally {
            spy.mockRestore();
        }
        expect(inBand).toBe(0);
        // Non-vacuous: the corpus does ask the question of bit-identical sources…
        expect(identical).toBeDefined();
        const [ray1, ray2] = identical!;
        expect(original(ray1, ray2, lane, resolution)[2]).toBe('identical-source');
        // …and the same two rays with one source moved 5e-9 — inside the retired band — are two sources.
        const nudged = {...ray2, sourceVector: {x: ray2.sourceVector.x + 5e-9, y: ray2.sourceVector.y}};
        expect(original(ray1, nudged, lane, resolution)[2]).not.toBe('identical-source');
    });
});

/*
 * THE OFFSET RATE'S FORWARD ROUNDING BOUND (journal-5 decision 164). `k·u` bounds the error of EVALUATING
 * a cross product of the stored doubles — the backward question `intersectRays` asks. Whether an offset
 * rate is zero is asked of the EXACT geometry, so its bound also charges the normalised bases' own
 * direction errors: 8u, argued at `FORWARD_CROSS_PRODUCT_ROUNDING_UNITS`.
 */

/**
 * The offset rate the solver evaluates for the bisector between the wall `p1 → q1` (clockwise parent) and
 * the wall `p2 → q2` (widdershins), with the production operations in the production order, beside its
 * EXACT value: `cross(d₁, d₂) / (|d₁|·|d₂|·|ĉ − ŵ|)` with the cross product in exact dyadic arithmetic.
 * Only the cross product must be exact — the norms scale a near-zero quantity, so their few-ulp errors are
 * second order where the bar decides.
 */
function offsetRateForwardError(p1: Vector2, q1: Vector2, p2: Vector2, q2: Vector2): [number, number] {
    const [c] = normalize(subtractVectors(q1, p1));
    const [w] = normalize(subtractVectors(q2, p2));
    const computed = crossProduct(makeWeightedBisectedBasis(c, negateVector(w), 1, 1), c);
    const d1 = [plus(exact(q1.x), negate(exact(p1.x))), plus(exact(q1.y), negate(exact(p1.y)))];
    const d2 = [plus(exact(q2.x), negate(exact(p2.x))), plus(exact(q2.y), negate(exact(p2.y)))];
    const crossExact = plus(times(d1[0], d2[1]), negate(times(d2[0], d1[1])));
    const toNumber = (a: Dyadic) => Number(a.mantissa) * 2 ** a.exponent;
    const [d1x, d1y, d2x, d2y] = [toNumber(d1[0]), toNumber(d1[1]), toNumber(d2[0]), toNumber(d2[1])];
    const [n1, n2] = [Math.hypot(d1x, d1y), Math.hypot(d2x, d2y)];
    const spread = Math.hypot(d1x / n1 - d2x / n2, d1y / n1 - d2y / n2);
    return [computed, toNumber(crossExact) / (n1 * n2 * spread)];
}

describe('decision 164: the offset rate\'s forward rounding bound, 8u', () => {
    it('is FORWARD_CROSS_PRODUCT_ROUNDING_UNITS · u, with the constant 8', () => {
        expect(FORWARD_CROSS_PRODUCT_ROUNDING_UNITS).toBe(8);
        expect(OFFSET_RATE_FORWARD_ROUNDING_BOUND).toBe(8 * UNIT_ROUNDOFF);
        // It sits above the backward bound, and eight orders below the smallest non-zero rate the 580
        // sweep cells carry (4.36e-8).
        expect(OFFSET_RATE_FORWARD_ROUNDING_BOUND).toBeGreaterThan(UNIT_CROSS_PRODUCT_ROUNDING_BOUND);
        expect(4.36e-8 / OFFSET_RATE_FORWARD_ROUNDING_BOUND).toBeGreaterThan(1e7);
    });

    it('bounds the forward error of the evaluated offset rate, measured against exact arithmetic', () => {
        // Near-anti-parallel walls — the only place the rate is near zero — from random stored coordinates,
        // a third of them EXACTLY anti-parallel in direction before the coordinates round.
        const random = seededRandom(164);
        let worstInU = 0;
        for (let draw = 0; draw < 20_000; draw++) {
            const theta = 2 * Math.PI * random();
            const tilt = random() < 0.3 ? 0 : (random() < 0.5 ? 1 : -1) * 10 ** (-16 + 4 * random());
            const [p1, p2] = [{x: random(), y: random()}, {x: random(), y: random()}];
            const [length1, length2] = [0.01 + random(), 0.01 + random()];
            const q1 = {x: p1.x + length1 * Math.cos(theta), y: p1.y + length1 * Math.sin(theta)};
            const q2 = {x: p2.x + length2 * Math.cos(theta + Math.PI + tilt), y: p2.y + length2 * Math.sin(theta + Math.PI + tilt)};
            const [computed, trueRate] = offsetRateForwardError(p1, q1, p2, q2);
            worstInU = Math.max(worstInU, Math.abs(computed - trueRate) / UNIT_ROUNDOFF);
        }
        // A bound, not a fit: measured worst 1.75u over 200 000 draws (dispatch 3). The error is live.
        expect(worstInU).toBeLessThanOrEqual(FORWARD_CROSS_PRODUCT_ROUNDING_UNITS);
        expect(worstInU).toBeGreaterThan(0);
    });
});

describe('T30: `makeOffsetDistance` substitutes 0 only for an arithmetic-zero rate (S20)', () => {
    const {context, interiorEdgeIds} = squareContext();
    const edge = context.getInteriorWithId(interiorEdgeIds[0]);
    const parentBasis = context.clockwiseParent(edge).basisVector;
    const source = context.sourcePosition(edge.id);

    it('prices every rate in (8u, 1e-8) — the band the retired sine bar zeroed', () => {
        // Measured over the 580 cells: of the 37 evaluations the retired bar zeroed, those above 8u are the
        // Circle 32 cell's e70 at 6.22e-9; `Golf Cart`'s 3.3u stay zeroed.
        for (const target of [16 * UNIT_ROUNDOFF, 1e-12, 1e-9, 6.2e-9, 9.9e-9]) {
            const basis = turned(parentBasis, -target);
            const rate = crossProduct(basis, parentBasis);
            expect(Math.abs(rate)).toBeGreaterThan(OFFSET_RATE_FORWARD_ROUNDING_BOUND);
            expect(Math.abs(rate)).toBeLessThan(1e-8);
            const priced = makeOffsetDistance(edge, context, {sourceVector: source, basisVector: basis}, 0.75);
            expect(priced).not.toBe(0);
            expect(priced).toBe(0.75 * rate);
        }
    });

    it('substitutes 0 at or inside 8u — above k·u included — where the rate has no sign the arithmetic can vouch for', () => {
        for (const target of [1e-17, 4 * UNIT_ROUNDOFF, 7 * UNIT_ROUNDOFF]) {
            const basis = turned(parentBasis, -target);
            expect(Math.abs(crossProduct(basis, parentBasis))).toBeLessThanOrEqual(OFFSET_RATE_FORWARD_ROUNDING_BOUND);
            expect(makeOffsetDistance(edge, context, {sourceVector: source, basisVector: basis}, 0.75)).toBe(0);
        }
    });

    it('the bar is the offset rate\'s forward rounding bound, compared with ≤', () => {
        expect(offsetRateIsArithmeticZero(OFFSET_RATE_FORWARD_ROUNDING_BOUND)).toBe(true);
        expect(offsetRateIsArithmeticZero(-OFFSET_RATE_FORWARD_ROUNDING_BOUND)).toBe(true);
        expect(offsetRateIsArithmeticZero(3 * UNIT_ROUNDOFF)).toBe(true);
        expect(offsetRateIsArithmeticZero(2 * OFFSET_RATE_FORWARD_ROUNDING_BOUND)).toBe(false);
        expect(offsetRateIsArithmeticZero(-1e-9)).toBe(false);
    });
});

describe('S19, `addBisectionEdge`\'s zero rate: HELD at its sine 1e-8 — k·u and the forward 8u measured and refused', () => {
    /*
     * Decision 164 wired S19 to the forward bound. At the ROOT it held: `Golf Cart` unmoved, one sweep cell
     * moved (the Circle 32 cell's e70, a true −6.22e-9 priced by sign, clean). In the RECURSION it did not:
     * `Golf Cart`'s level-1 regions carry its one-ulp corridor tilt at 5.2u–24u, above 8u, and priced by
     * sign a region's strips come out 3.2% short (`recursive-subdivision.test.ts`, 2 tests). Held per
     * decision 164's instruction; the measurements are at the site. This block pins the held form.
     */
    /** A bisector born between the top wall `(0,1) → (1,1 − fall)` and the bottom wall `(1,0) → (0,0)`. */
    function bornBetween(fall: number) {
        const quad: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 1 - fall}, {x: 1, y: 0}];
        const context = makeStraightSkeletonSolverContext(quad, SKELETON_NOISE_FLOOR);
        const clockwise = context.graph.edges[1].basisVector;
        const widdershins = context.graph.edges[3].basisVector;
        expect(directionsAreSame(clockwise, negateVector(widdershins), context.angularResolution)).toBe(true);
        const born = makeWeightedBisectedBasis(clockwise, negateVector(widdershins), 1, 1);
        const id = addBisectionEdge(context, 1, 3, 0);
        return {born, bornRate: crossProduct(born, clockwise), final: context.graph.edges[id].basisVector};
    }

    it('a TRUE negative rate in (8u, 1e-8) is still a zero rate: the parent ordering decides', () => {
        // The top wall falls 4e-9 across the unit width: anti-parallel to 4e-9, far inside ρ, and the
        // bisector is born at about −2e-9 — the class of the Circle 32 cell's e70 (−6.22e-9). The held 1e-8
        // bar calls it zero and `ensureBisectionIsInterior` keeps the born basis; at 8u or k·u its sign
        // would flip it.
        const {born, bornRate, final} = bornBetween(4e-9);
        expect(bornRate).toBeLessThan(-OFFSET_RATE_FORWARD_ROUNDING_BOUND);
        expect(bornRate).toBeGreaterThan(-1e-8);
        expect(final).toEqual(born);
    });

    it('a computed rate of a few u, above k·u, is a zero rate: the parent ordering decides', () => {
        // The top wall falls 1.46e-15 across the unit width — `Golf Cart`'s own configuration (its vertex 3
        // sits one ulp below 400, tilting wall e2 by 1.456e-15), so the rate is about −7.3e-16 = 3.3u: above
        // k·u, inside 8u. A TRUE rate — the geometry's, to far below an ulp.
        const {born, bornRate, final} = bornBetween(1.46e-15);
        expect(bornRate).toBeLessThan(-UNIT_CROSS_PRODUCT_ROUNDING_BOUND);
        expect(bornRate).toBeGreaterThanOrEqual(-OFFSET_RATE_FORWARD_ROUNDING_BOUND);
        expect(final).toEqual(born);
    });

    it('`Golf Cart` e16, born at −7.28e-16, keeps the parent ordering\'s basis', () => {
        // The mover of the k·u measurement, read at the edge: inside the forward bound, outside k·u.
        const golfCart = FULL_CORPUS.find(fixture => fixture.name === 'Golf Cart')!;
        const {graph} = solveSkeleton(golfCart.vertices);
        const e16 = graph.interiorEdges.find(edge => edge.id === 16)!;
        const rate = crossProduct(graph.edges[16].basisVector, graph.edges[e16.clockwiseExteriorEdgeIndex].basisVector);
        expect(Math.abs(rate)).toBeGreaterThan(UNIT_CROSS_PRODUCT_ROUNDING_BOUND);
        expect(Math.abs(rate)).toBeLessThanOrEqual(OFFSET_RATE_FORWARD_ROUNDING_BOUND);
        expect(rate).toBeLessThan(0);
    });
});

/*
 * THE CLOSURE'S CONSTRUCTED ANCHOR (S11). Bisectors 0 and 2 of the unit square, clockwise parents the left
 * wall (offset = x) and the right wall (offset = 1 − x). Bisector 2 is sourced at the ANCHOR (0.5, 0.5),
 * born at offset 0.5; bisector 0 is sourced at (0.25, 0.5 + lateral), running +x, so it reaches the anchor
 * after 0.25 of travel at offset 0.5 — the same moment — passing the anchor at `lateral`. A degenerate
 * closure there is the right answer for any lateral the client cannot see.
 */
function closureLadderAt(lateral: number) {
    const {context, interiorEdgeIds} = squareContext();
    const [toward, , anchored] = interiorEdgeIds;
    expect(context.clockwiseParent(context.getInteriorWithId(toward)).basisVector).toEqual({x: 0, y: 1});
    expect(context.clockwiseParent(context.getInteriorWithId(anchored)).basisVector).toEqual({x: 0, y: -1});
    const anchor = context.findOrAddNode({x: 0.5, y: 0.5});
    const towardEdge = context.getEdgeWithId(toward);
    towardEdge.source = context.findOrAddNode({x: 0.25, y: 0.5 + lateral}).id;
    towardEdge.basisVector = {x: 1, y: 0};
    const anchoredEdge = context.getEdgeWithId(anchored);
    anchoredEdge.source = anchor.id;
    anchoredEdge.basisVector = {x: -1, y: 0};
    return {rung: climbTerminalLadder(context, [toward, anchored]), anchor: anchor.position};
}

describe('T32: the closure\'s point-on-ray (S11) is the coaxial form, lateral < λ', () => {
    const ladderAt = closureLadderAt;

    it('closes at an anchor the ray passes at a lateral between 1e-8·|sep| and λ', () => {
        const lateral = 1e-7;
        const separation = {x: 0.25, y: -lateral};
        // The retired sine form refuses this anchor (sine 4e-7); the lane admits it (1e-7 < 1e-6).
        expect(directionsAreSame(separation, {x: 1, y: 0}, 1e-8)).toBe(false);
        expect(lateralOffset(separation, {x: 1, y: 0})).toBeLessThan(coaxialityFloor(SKELETON_NOISE_FLOOR));
        const {rung, anchor} = ladderAt(lateral);
        expect(rung).toEqual({rung: 'closure', position: anchor});
    });

    it('does not close at an anchor the ray misses by λ or more', () => {
        const {rung, anchor} = ladderAt(2 * coaxialityFloor(SKELETON_NOISE_FLOOR));
        expect(rung).not.toEqual({rung: 'closure', position: anchor});
    });
});

/*
 * ============================================================================
 *  THE COHERENCE TABLE (spec §Coherence): each pair asked one question — one bar, read from the source
 * ============================================================================
 *
 * Each row is asserted by reading the constants and context fields the sites spend, not by re-deriving
 * them. Rows whose single bar is HELD by a measured STOP are asserted as the held state, so a move is
 * loud either way.
 */
describe('the coherence table', () => {
    const context = makeStraightSkeletonSolverContext(SQUARE, SKELETON_NOISE_FLOOR);

    it('S22 layer / S3 event clustering — HELD (STOP): the cap is δ on the context, the sites spend 1e-8', () => {
        expect(context.simultaneityWindow).toBe(context.perceptualFloor);
        expect(HELD_SIMULTANEITY_WINDOW).toBe(1e-8);
    });

    it('S22 / S23–S28 — one bar: every window site spends the same held window through compareArrivals', () => {
        const a: Arrival = {distance: 0.5, weight: 1, uncertainty: 0};
        const b: Arrival = {distance: 0.5 + 0.9 * HELD_SIMULTANEITY_WINDOW, weight: 1, uncertainty: 0};
        expect(compareArrivals(a, b, HELD_SIMULTANEITY_WINDOW)).toBe(0);
    });

    it('S29 / S30 — one instant: the offset projection reads the moment bar', () => {
        expect(SIMULTANEITY_RELATIVE_TOLERANCE).toBe(ARRIVAL_MOMENT_ULPS * Number.EPSILON);
    });

    it('S7–S9 `<` / S3, S13 `<` — one inequality: a lateral of exactly λ is outside the lane', () => {
        const lane = context.coaxialityFloor;
        expect(lane).toBe(coaxialityFloor(SKELETON_NOISE_FLOOR));
        // S9: a strike exactly λ along the edge is NOT at its end; strictly inside it is.
        expect(reachesSupportingLine([1, lane, 'diverging'], lane)).toBe(false);
        expect(reachesSupportingLine([1, lane / 2, 'diverging'], lane)).toBe(true);
        // S8: two same-way rays exactly λ apart laterally are not one line; λ/2 apart they are.
        const ray = {sourceVector: {x: 0, y: 0}, basisVector: {x: 1, y: 0}};
        expect(intersectRays(ray, {sourceVector: {x: 1, y: lane}, basisVector: {x: 1, y: 0}}, lane, context.angularResolution)[2])
            .toBe('parallel');
        expect(intersectRays(ray, {sourceVector: {x: 1, y: lane / 2}, basisVector: {x: 1, y: 0}}, lane, context.angularResolution)[2])
            .toBe('co-linear-from-1');
    });

    it('S14 / S15–S18 / S21 — one angular resolution: the context field is angularResolution(δ)', () => {
        expect(context.angularResolution).toBe(angularResolution(SKELETON_NOISE_FLOOR));
    });

    it('S19 zero rate / S20 zero gradient — one operand, TWO bars: S19 HELD at 1e-8, S20 at the forward 8u (D14 open)', () => {
        // Both substitute for the computed offset rate `cross(basis, clockwiseParent.basis)`. Decision 164
        // put both on `offsetRateIsArithmeticZero`; S20 landed there, S19 was refused (its level-1 `Golf Cart`
        // regions price 5u–24u corridor rates by sign and tile 3.2% short). So a rate in (8u, 1e-8) is priced
        // at S20 and zero at S19 — this row records the split until S19 moves, and D14 stays open.
        const {context: square, interiorEdgeIds} = squareContext();
        const edge = square.getInteriorWithId(interiorEdgeIds[0]);
        const parentBasis = square.clockwiseParent(edge).basisVector;
        const basis = turned(parentBasis, -1e-9);
        const rate = crossProduct(basis, parentBasis);
        expect(makeOffsetDistance(edge, square, {sourceVector: square.sourcePosition(edge.id), basisVector: basis}, 1)).toBe(rate);
        expect(offsetRateIsArithmeticZero(rate)).toBe(false);
        expect(sineIsBelow(basis, parentBasis, 1e-8)).toBe(true);
    });

    it('S19 zero rate / S21 fourth oracle — the oracle is T17\'s complement; S19 itself is HELD (STOP)', () => {
        // The complement relation is pinned on random parents above. S19's moves to T17's ρ (dispatch 2),
        // to k·u and to the forward 8u (dispatch 3) were each refused, so the solver still asks the rate's
        // zero at the rate's own 1e-8; the pair reads two bars until it moves.
        expect(angularResolution(SKELETON_NOISE_FLOOR)).toBeGreaterThan(1e-8);
    });

    it('S6 identical-source / S8 co-linear exits — different questions under T2: exact / λ (T28)', () => {
        // Two same-way rays on one line: bit-identical sources are ONE POINT (the pair terminates there);
        // sources 5e-9 apart — inside the retired identical-source band — are two points on one line,
        // closed at the leading source with both nodes kept.
        const lane = context.coaxialityFloor;
        const ray = {sourceVector: {x: 0.2, y: 0.4}, basisVector: {x: 1, y: 0}};
        const sameSource = {sourceVector: {x: 0.2, y: 0.4}, basisVector: {x: 1, y: 0}};
        const ahead = {sourceVector: {x: 0.2 + 5e-9, y: 0.4}, basisVector: {x: 1, y: 0}};
        expect(intersectRays(ray, sameSource, lane, context.angularResolution)[2]).toBe('identical-source');
        expect(intersectRays(ray, ahead, lane, context.angularResolution)[2]).toBe('co-linear-from-1');
    });

    it('S11 closure point-on-ray / S7 lane — one bar: a lateral inside λ is on the line for both (T32)', () => {
        // The same geometry asked twice: the constructed anchor 1e-7 off bisector 0's ray closes there (S11),
        // and the same two rays, read as a pair, are coaxial and head-on (S7) — one lane, one answer. At 2λ
        // neither: no closure at the anchor, and the pair is parallel.
        const lane = context.coaxialityFloor;
        const pairAt = (lateral: number) => intersectRays(
            {sourceVector: {x: 0.25, y: 0.5 + lateral}, basisVector: {x: 1, y: 0}},
            {sourceVector: {x: 0.5, y: 0.5}, basisVector: {x: -1, y: 0}},
            lane, context.angularResolution)[2];
        const inside = closureLadderAt(1e-7);
        expect(inside.rung).toEqual({rung: 'closure', position: inside.anchor});
        expect(pairAt(1e-7)).toBe('head-on');
        const outside = closureLadderAt(2 * lane);
        expect(outside.rung).not.toEqual({rung: 'closure', position: outside.anchor});
        expect(pairAt(2 * lane)).toBe('parallel');
    });

    it('S10 snap point-on-ray / S7 lane — HELD (STOP 3): the snap still reads its sine 1e-8', () => {
        // Decision 161(e): at the lane the snap gives this cell — `Off-edge Jitter Plus`, k = 3, seed
        // 47514, off-edge 1e-3 — an offset violation, diagnosed as a `causality-violation` where there was
        // none (T37 STOP 3). Pinned clean, so the snap's move is loud on the cell that stopped it.
        const plus = jitteredSamples(clockwise(JITTER_DOUBLE_REFLEX_PLUS), 3, 47514, 1e-3, true);
        const result = solveSkeleton(plus);
        expect(result.complete).toBe(true);
        expect(result.diagnostics.filter(d => d.kind === 'causality-violation')).toEqual([]);
    });

    it('S20 zero gradient / S14 gate — different questions: the forward 8u / ρ (T30, decision 164)', () => {
        // One pair of directions, 1e-9 apart: far below ρ, so `intersectRays` will not price their
        // intersection (S14) — and far above 8u, so the rate between them is priced as it is (S20).
        const {context: square, interiorEdgeIds} = squareContext();
        const edge = square.getInteriorWithId(interiorEdgeIds[0]);
        const parentBasis = square.clockwiseParent(edge).basisVector;
        const basis = turned(parentBasis, -1e-9);
        expect(sineIsBelow(basis, parentBasis, square.angularResolution)).toBe(true);
        expect(offsetRateIsArithmeticZero(crossProduct(basis, parentBasis))).toBe(false);
        expect(makeOffsetDistance(edge, square, {sourceVector: square.sourcePosition(edge.id), basisVector: basis}, 1))
            .toBe(crossProduct(basis, parentBasis));
    });

    it('S1 / S2 / S4 / S5 — one arithmetic same-point bar, HELD at the shared box (register C11)', () => {
        expect(ARITHMETIC_SAME_POINT_BOX).toBe(1e-8);
    });

    it('S43 / S44 — one δ-derived degeneracy bar, each consumer in its own space', () => {
        // Both consumers read `degenerateAreaBar`; the T23 block above exercises each consumer.
        expect(degenerateAreaBar(SKELETON_NOISE_FLOOR, 4)).toBe(2 * SKELETON_NOISE_FLOOR);
    });

    it('S37 / S39 — one division-safety class: the basis sum takes 2k·u, `normalize` exact zero', () => {
        expect(basisSumRoundingBound(1, 1)).toBe(2 * CROSS_PRODUCT_ROUNDING_UNITS * UNIT_ROUNDOFF);
    });
});
