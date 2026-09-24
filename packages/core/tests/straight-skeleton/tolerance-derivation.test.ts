import {
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
    intersectRays,
    makeSkeletonNormalisation,
    makeStraightSkeletonSolverContext,
    maxWeightRatio,
    minWeightTurnSine,
    negateVector,
    pairSimultaneityWindow,
    rayIntersectionUncertainty,
    segmentSegmentIntersection,
    ringPerimeter,
    signedArea,
    simultaneityWindow,
    SKELETON_NOISE_FLOOR,
    StraightSkeletonGraph,
    subdivideRecursively,
    UNIT_ROUNDOFF,
    Vector2,
} from '@proc-geo/core';
import {OFF_EDGE_JITTER_PLUS_SEED_7919} from '@proc-geo/test-fixtures';
import {
    ARITHMETIC_SAME_POINT_BOX,
    basisSumRoundingBound,
    cramerQuotientRoundingBound,
    DETERMINANT3_ROUNDING_UNITS,
    determinant3RoundingBound,
    determinant3TripleSum,
    HELD_SIMULTANEITY_WINDOW,
    UNIT_CROSS_PRODUCT_ROUNDING_BOUND,
    weightedRateSumRoundingBound,
} from '@proc-geo/core/straight-skeleton/constants';
import {SIMULTANEITY_RELATIVE_TOLERANCE} from '@proc-geo/core/straight-skeleton/offset-projection';
import {reachesSupportingLine} from '@proc-geo/core/straight-skeleton/generate-split-event';
import {rateViolations} from './wavefront-measurement-helpers';

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

    it('S19 zero rate / S21 fourth oracle — the oracle is T17\'s complement; S19 itself is HELD (STOP)', () => {
        // The complement relation is pinned on random parents above. S19's own move to T17 stopped
        // (a jittered Circle 32 cell stops solving, a plus cell gains an offset violation), so the
        // solver still asks the rate's zero at the rate's own 1e-8; the pair reads two bars until it
        // moves, which this row records.
        expect(angularResolution(SKELETON_NOISE_FLOOR)).toBeGreaterThan(1e-8);
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
