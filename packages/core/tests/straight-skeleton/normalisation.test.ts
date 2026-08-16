import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    CollisionCache,
    CollisionEvent,
    NO_COLLISION_SENTINEL,
    SMALLEST_NORMAL_DOUBLE,
    SkeletonNormalisation,
    StraightSkeletonGraph,
    Vector2,
    denormaliseArea,
    denormaliseCollisionCache,
    denormaliseGraph,
    denormaliseLength,
    denormalisePosition,
    makeSkeletonNormalisation,
    makeStraightSkeletonSolverContext,
    normaliseArea,
    normaliseLength,
    normalisePolygon,
    normalisePosition,
    setSkeletonLogLevel,
    solveSkeleton,
} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE SOLVER'S BOUNDARY TRANSFORM. THESE ASSERTIONS ARE A SPECIFICATION.
 * ============================================================================
 *
 * `FLOATING_POINT_EPSILON` is an ABSOLUTE `1e-8` compared against raw coordinates, so the
 * degeneracy test gets stricter as the polygon grows. Normalising to unit extent on the way in
 * and denormalising on the way out leaves the constant alone and makes it relative by
 * construction. See `normalisation.ts` for the full argument and for the enumeration of what
 * scales — this file guards that enumeration item by item.
 *
 * MEASURED IN THIS REPO WHEN THE TRANSFORM LANDED, over all 37 `ALL_TEST_POLYGONS` (solve +
 * offset ring at 50% of max + strips at the same depth):
 *
 *     translate      0   1e3   1e4   1e5   1e6   1e7   1e8   1e9  1e10  1e11
 *     before        37    37    37    37    37    37    35    37    29    29
 *     after         37    37    37    37    37    37    37    37    37    37
 *
 *     scale       1e-6  1e-4  1e-2     1   1e2   1e4   1e6   1e8
 *     before        37    37    37    37    37    37    27    18
 *     after         37    37    37    37    37    37    37    37
 *
 * `Broken Polygon` translated to 1e8 returned a maximum offset of 308.9784380383704 where its
 * native value is 126.63015964243034; it now returns 126.630159636494 and its offset rings
 * project all the way in.
 *
 * THE SCALE IS NOW THE NEAREST POWER OF TWO TO THE LONGEST SIDE, not the longest side itself, so
 * `toUnitScale` and `fromUnitScale` are EXACT reciprocals and the round trip is bit-exact in its
 * scaling. The normalised extent lands in `[1/sqrt(2), sqrt(2)]` rather than exactly on 1, which is
 * the bound every tolerance argument above actually rests on. The block near the end of this file
 * is the gate on that: it round-trips every fixture at every placement of the operating-envelope
 * sweep and asserts `Object.is`, pinning the achieved error in the three cells where the CENTRING
 * subtraction — not the scaling — rounds.
 */

setSkeletonLogLevel('silent');

/** The axis-aligned bounding box of a vertex list, as the transform itself derives it. */
interface VertexBounds {
    minimum: Vector2;
    maximum: Vector2;
}

function boundsOf(vertices: readonly Vector2[]): VertexBounds {
    const minimum: Vector2 = {x: vertices[0].x, y: vertices[0].y};
    const maximum: Vector2 = {x: vertices[0].x, y: vertices[0].y};
    for (const vertex of vertices) {
        minimum.x = Math.min(minimum.x, vertex.x);
        minimum.y = Math.min(minimum.y, vertex.y);
        maximum.x = Math.max(maximum.x, vertex.x);
        maximum.y = Math.max(maximum.y, vertex.y);
    }
    return {minimum, maximum};
}

/** The placement used by the operating-envelope sweep in `large-coordinate-failures.test.ts`. */
function place(vertices: readonly Vector2[], scale: number, translate: number): Vector2[] {
    return vertices.map(vertex => ({x: vertex.x * scale + translate, y: vertex.y * scale + translate}));
}

function makeGraph(): StraightSkeletonGraph {
    return {
        numExteriorNodes: 2,
        nodes: [
            {id: 0, position: {x: 10, y: 20}, inEdges: [], outEdges: [0]},
            {id: 1, position: {x: 30, y: 20}, inEdges: [0], outEdges: []},
        ],
        edges: [
            {id: 0, source: 0, target: 1, basisVector: {x: 1, y: 0}},
            {id: 1, source: 1, basisVector: {x: 0.6, y: -0.8}},
        ],
        interiorEdges: [
            {id: 1, clockwiseExteriorEdgeIndex: 0, widdershinsExteriorEdgeIndex: 0, length: Number.MAX_VALUE, maxOffset: 4},
            {id: 2, clockwiseExteriorEdgeIndex: 0, widdershinsExteriorEdgeIndex: 0, length: Number.MAX_VALUE},
        ],
    };
}

function makeEvent(overrides: Partial<CollisionEvent> = {}): CollisionEvent {
    return {
        offsetDistance: 3,
        collidingEdges: [4, 5],
        position: {x: 7, y: 9},
        intersectionData: [2, 5, 'converging'],
        eventType: 'interiorPair',
        ...overrides,
    };
}

describe('unit-extent normalisation', () => {
    describe('deriving the transform', () => {
        it('takes the scale from the LONGEST BOUNDING-BOX SIDE, not the diagonal', () => {
            // 40 wide, 30 tall. The diagonal is 50, which rounds to a DIFFERENT power of two (64)
            // than the longest side does (32), so this still distinguishes the two rules.
            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: 40, y: 0},
                {x: 40, y: 30},
            ]);

            expect(normalisation.fromUnitScale).toBe(32);
            expect(normalisation.toUnitScale).toBe(1 / 32);
            expect(normalisation.degenerateExtent).toBe(false);
            expect(2 ** Math.round(Math.log2(50))).toBe(64);
        });

        it('centres on the bounding box, not on the vertex mean', () => {
            const normalisation = makeSkeletonNormalisation([
                {x: -10, y: 4},
                {x: -10, y: 4},
                {x: -10, y: 4},
                {x: 30, y: 24},
            ]);

            expect(normalisation.centre).toEqual({x: 10, y: 14});
        });

        it('leaves no coordinate outside [-1/sqrt(2), 1/sqrt(2)] after the transform', () => {
            // The point of taking the LONGEST side: the largest magnitude the solver will ever hold
            // is bounded whatever the aspect ratio. The bound is half of sqrt(2) rather than half of
            // 1 because the scale is the nearest POWER OF TWO to the longest side, so the normalised
            // extent lands in [1/sqrt(2), sqrt(2)] instead of exactly on 1. The one-ulp slack is the
            // subtract-then-multiply rounding, not slack in the rule.
            const bound = Math.SQRT1_2 + Number.EPSILON;
            for (const polygon of ALL_TEST_POLYGONS) {
                const normalisation = makeSkeletonNormalisation(polygon.vertices);
                for (const vertex of normalisePolygon(polygon.vertices, normalisation)) {
                    expect(Math.abs(vertex.x)).toBeLessThanOrEqual(bound);
                    expect(Math.abs(vertex.y)).toBeLessThanOrEqual(bound);
                }
            }
        });

        it('cannot overflow the centre on a box spanning most of the double range', () => {
            // Summing before halving would give Infinity here, and every normalised vertex NaN.
            const huge = Number.MAX_VALUE / 2;
            const normalisation = makeSkeletonNormalisation([
                {x: -huge, y: -huge},
                {x: huge, y: huge},
            ]);

            expect(Number.isFinite(normalisation.centre.x)).toBe(true);
            expect(Number.isFinite(normalisation.centre.y)).toBe(true);
            expect(normalisation.centre).toEqual({x: 0, y: 0});
        });
    });

    describe('degenerate extent does not divide', () => {
        it('treats an EMPTY vertex list as degenerate, centred on the origin', () => {
            const normalisation = makeSkeletonNormalisation([]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.centre).toEqual({x: 0, y: 0});
            expect(normalisation.toUnitScale).toBe(1);
            expect(normalisation.fromUnitScale).toBe(1);
        });

        it('treats ALL VERTICES COINCIDENT as degenerate, keeping the centring translation', () => {
            const normalisation = makeSkeletonNormalisation([
                {x: 5, y: -7},
                {x: 5, y: -7},
                {x: 5, y: -7},
            ]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.centre).toEqual({x: 5, y: -7});
            expect(normalisation.toUnitScale).toBe(1);
            expect(normalisePosition(normalisation, {x: 5, y: -7})).toEqual({x: 0, y: 0});
        });

        it('treats a SUBNORMAL extent as degenerate, because its reciprocal overflows', () => {
            // Number.MIN_VALUE is the smallest SUBNORMAL. 1 / Number.MIN_VALUE is Infinity, and an
            // infinite scale would turn the whole polygon into NaN.
            expect(1 / Number.MIN_VALUE).toBe(Number.POSITIVE_INFINITY);

            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: Number.MIN_VALUE, y: 0},
            ]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.toUnitScale).toBe(1);
            expect(Number.isFinite(normalisePosition(normalisation, {x: 0, y: 0}).x)).toBe(true);
        });

        it('accepts the smallest NORMAL extent, which is the boundary of the rule', () => {
            expect(SMALLEST_NORMAL_DOUBLE).toBe(2.2250738585072014e-308);
            expect(Number.isFinite(1 / SMALLEST_NORMAL_DOUBLE)).toBe(true);

            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: SMALLEST_NORMAL_DOUBLE, y: 0},
            ]);

            // It is ALREADY a power of two — 2^-1022 — so the exponent rule leaves it where it was.
            expect(normalisation.degenerateExtent).toBe(false);
            expect(normalisation.fromUnitScale).toBe(SMALLEST_NORMAL_DOUBLE);
            expect(normalisation.toUnitScale).toBe(2 ** 1022);
        });

        it('rejects an exponent whose RECIPROCAL power would be subnormal, the one new failure mode', () => {
            // 2^1023 is a perfectly good finite double, so the existing guard passes it. Its
            // reciprocal is not: 2^-1023 is SUBNORMAL, and multiplying by a subnormal drops mantissa
            // bits silently, which is exactly the exactness this transform is built to hold.
            expect(Number.isFinite(2 ** 1023)).toBe(true);
            expect(2 ** -1023).toBeLessThan(SMALLEST_NORMAL_DOUBLE);
            expect(2 ** -1023).toBeGreaterThan(0);

            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: 2 ** 1023, y: 0},
            ]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.toUnitScale).toBe(1);
            expect(normalisation.fromUnitScale).toBe(1);
        });

        it('accepts the largest exponent at which BOTH directions are still normal', () => {
            // 2^1022 and 2^-1022 are both normal, so this is the last accepted polygon on the way up.
            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: 2 ** 1022, y: 0},
            ]);

            expect(normalisation.degenerateExtent).toBe(false);
            expect(normalisation.fromUnitScale).toBe(2 ** 1022);
            expect(normalisation.toUnitScale).toBe(2 ** -1022);
            expect(normalisation.toUnitScale).toBe(SMALLEST_NORMAL_DOUBLE);
        });

        it('rejects a side that ROUNDS UP past the ceiling even though the side itself is under it', () => {
            // The rejection is on the EXPONENT, not on the side: a side of 1.5 * 2^1022 rounds to
            // 2^1023, whose reciprocal is subnormal, so it goes the same way as a side of 2^1023.
            const side = 1.5 * 2 ** 1022;
            expect(Math.round(Math.log2(side))).toBe(1023);

            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: side, y: 0},
            ]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.toUnitScale).toBe(1);
        });

        it('treats an INFINITE extent as degenerate', () => {
            const normalisation = makeSkeletonNormalisation([
                {x: -Number.MAX_VALUE, y: 0},
                {x: Number.MAX_VALUE, y: 0},
            ]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.toUnitScale).toBe(1);
        });

        it('treats a NaN extent as degenerate', () => {
            // A NaN side is how an infinite bound actually presents: two vertices both at positive
            // infinity give `Infinity - Infinity`, and `Math.max` propagates the NaN.
            const normalisation = makeSkeletonNormalisation([
                {x: Number.POSITIVE_INFINITY, y: 0},
                {x: Number.POSITIVE_INFINITY, y: 3},
            ]);

            expect(normalisation.degenerateExtent).toBe(true);
            expect(normalisation.toUnitScale).toBe(1);
        });

        it('is BLIND to a lone NaN coordinate, which the bounds scan cannot see', () => {
            // RECORDED, NOT ENDORSED. Every comparison against NaN is false, so a NaN vertex never
            // becomes a minimum or a maximum and the box closes around the finite vertices as though
            // it were not there. The transform is therefore perfectly ordinary and the NaN travels
            // into the solve intact. Rejecting non-finite input is a separate decision, owned
            // alongside `findOrAddNode`; this transform is not the place that catches it.
            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: Number.NaN, y: 3},
                {x: 8, y: 3},
            ]);

            expect(normalisation.degenerateExtent).toBe(false);
            expect(normalisation.fromUnitScale).toBe(8);
            expect(Number.isNaN(normalisePosition(normalisation, {x: Number.NaN, y: 3}).x)).toBe(true);
        });

        it('does NOT treat extent on a single axis as degenerate — the longer side wins', () => {
            const horizontal = makeSkeletonNormalisation([
                {x: 0, y: 5},
                {x: 80, y: 5},
                {x: 40, y: 5},
            ]);
            const vertical = makeSkeletonNormalisation([
                {x: 5, y: 0},
                {x: 5, y: 80},
                {x: 5, y: 40},
            ]);

            expect(horizontal.degenerateExtent).toBe(false);
            expect(horizontal.fromUnitScale).toBe(64);
            expect(vertical.degenerateExtent).toBe(false);
            expect(vertical.fromUnitScale).toBe(64);
        });
    });

    describe('the scale is a power of two, and that is what makes the round trip exact', () => {
        it('scales by the NEAREST POWER OF TWO to the longest side, not by the side', () => {
            // The worked example: a 300-unit span scales by 256, so it comes out 1.171875 across.
            const normalisation = makeSkeletonNormalisation([
                {x: 0, y: 0},
                {x: 300, y: 0},
                {x: 300, y: 90},
            ]);

            expect(normalisation.fromUnitScale).toBe(256);
            expect(normalisation.toUnitScale).toBe(1 / 256);
            expect(300 * normalisation.toUnitScale).toBe(1.171875);

            // A vertex 150 from the centre terminates in binary and returns bit-for-bit.
            expect(normaliseLength(normalisation, 150)).toBe(0.5859375);
            expect(Object.is(denormaliseLength(normalisation, 0.5859375), 150)).toBe(true);
        });

        it('makes the two scales EXACT reciprocals, in both orders', () => {
            for (const polygon of ALL_TEST_POLYGONS) {
                const normalisation = makeSkeletonNormalisation(polygon.vertices);

                expect(normalisation.toUnitScale * normalisation.fromUnitScale).toBe(1);
                expect(Object.is(normalisation.toUnitScale, 1 / normalisation.fromUnitScale)).toBe(true);
                expect(Object.is(normalisation.fromUnitScale, 1 / normalisation.toUnitScale)).toBe(true);
            }
        });

        it('emits scales that are exact powers of two in both directions', () => {
            for (const polygon of ALL_TEST_POLYGONS) {
                const normalisation = makeSkeletonNormalisation(polygon.vertices);
                const exponent = Math.log2(normalisation.fromUnitScale);

                expect(Number.isInteger(exponent)).toBe(true);
                expect(normalisation.fromUnitScale).toBe(2 ** exponent);
                expect(normalisation.toUnitScale).toBe(2 ** -exponent);
            }
        });

        it('lands the normalised extent in [1/sqrt(2), sqrt(2)], which is what preserves the tolerance argument', () => {
            // `longestSide = 2^(e+d)` with `d` in [-0.5, 0.5] by construction of Math.round, so the
            // normalised extent is `2^d`. The solver therefore still never sees a magnitude it was
            // not designed for. Asserted over the corpus and over a decade sweep of contrived spans.
            const spans = [1, 1.1, 1.9, 3, 5, 7, 10, 100, 300, 1000, 12345.678, 1e-5, 6.02e23];
            const measured: number[] = [];

            for (const polygon of ALL_TEST_POLYGONS) {
                const {minimum, maximum} = boundsOf(polygon.vertices);
                measured.push(Math.max(maximum.x - minimum.x, maximum.y - minimum.y) * makeSkeletonNormalisation(polygon.vertices).toUnitScale);
            }
            for (const span of spans) {
                const normalisation = makeSkeletonNormalisation([{x: 0, y: 0}, {x: span, y: 0}]);
                measured.push(span * normalisation.toUnitScale);
            }

            // The one-ulp allowance covers a span whose own DOUBLE is an ulp off the real half-way
            // power; the scaling itself is exact and adds nothing to it.
            for (const extent of measured) {
                expect(extent).toBeGreaterThanOrEqual(Math.SQRT1_2 * (1 - Number.EPSILON));
                expect(extent).toBeLessThanOrEqual(Math.SQRT2 * (1 + Number.EPSILON));
            }
        });

        it('does NOT work around a Math.round tie, because either neighbour satisfies the bound', () => {
            // 2^2.5 is one of the rare spans whose log2 is an exact half. Math.round takes ties
            // toward +Infinity, which is deterministic; the extent then sits exactly on the lower
            // edge of the bound, and had it gone the other way it would sit exactly on the upper.
            const side = 2 ** 2.5;
            expect(Math.log2(side)).toBe(2.5);
            expect(Math.round(2.5)).toBe(3);

            const normalisation = makeSkeletonNormalisation([{x: 0, y: 0}, {x: side, y: 0}]);

            // Compared to within an ulp, not on the bit: the DOUBLE nearest 2^2.5 is itself an ulp
            // off the real 2^2.5, and dividing it by a power of two carries that ulp through
            // unchanged. The slack is the representation of the tie, not slack in the bound.
            expect(normalisation.fromUnitScale).toBe(8);
            expect(side / 8).toBeCloseTo(Math.SQRT1_2, 15);
            expect(side / 4).toBeCloseTo(Math.SQRT2, 15);
        });
    });

    describe('positions, lengths and areas travel differently', () => {
        // 200 wide, 60 tall: the longest side is 200 and the nearest power of two to it is 256.
        const normalisation = makeSkeletonNormalisation([
            {x: 100, y: 200},
            {x: 300, y: 200},
            {x: 300, y: 260},
        ]);

        it('translates AND scales a position', () => {
            expect(normalisePosition(normalisation, {x: 300, y: 230})).toEqual({x: 100 / 256, y: 0});
            expect(denormalisePosition(normalisation, {x: 100 / 256, y: 0})).toEqual({x: 300, y: 230});
        });

        it('scales a length and never translates it', () => {
            // A distance travelled by the wavefront, not a point: the centring term must not touch it.
            expect(normaliseLength(normalisation, 200)).toBe(200 / 256);
            expect(denormaliseLength(normalisation, 200 / 256)).toBe(200);
            expect(normaliseLength(normalisation, 0)).toBe(0);
        });

        it('scales an area as the SQUARE', () => {
            expect(normaliseArea(normalisation, 200 * 200)).toBe(40000 / 65536);
            expect(denormaliseArea(normalisation, 1)).toBe(65536);
            expect(denormaliseArea(normalisation, 0.25)).toBe(16384);
        });
    });

    describe('the round trip is BIT-EXACT, which is the invariant this transform now carries', () => {
        /*
         * MEASURED OVER THE FULL SWEEP, 698 fixture coordinates per cell:
         *
         *   translate      0   1e3   1e4   1e5   1e6   1e7   1e8   1e9  1e10  1e11
         *   inexact        0     0     0     0     0     0     0     0     0     0
         *
         *   scale       1e-6  1e-4  1e-2     1   1e2   1e4   1e6   1e8
         *   inexact        4    15     0     0     0     4     0     0
         *
         * The whole translation sweep is exact on the bit. The scale sweep is exact in five cells of
         * eight, and the three that are not are inexact ONLY in the centring subtraction — decision 4
         * says so and the block below proves it, by round-tripping the already-centred value and
         * finding it exact everywhere. The worst relative error across every inexact coordinate is
         * 1.734723475976807e-16, under one ulp, and it is pinned rather than skipped.
         */
        const TRANSLATIONS = [0, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11];
        const EXACT_SCALES = [1e-2, 1, 1e2, 1e6, 1e8];
        const INEXACT_SCALES: readonly (readonly [number, number])[] = [
            // scale, the measured count of coordinates that do not return on the bit.
            [1e-6, 4],
            [1e-4, 15],
            [1e4, 4],
        ];
        const WORST_MEASURED_RELATIVE_ERROR = 1.734723475976807e-16;

        interface RoundTripMeasurement {
            /** Coordinates that did not return bit-for-bit. */
            inexact: number;
            /** The largest relative error over those coordinates; zero when there were none. */
            worstRelativeError: number;
        }

        function measureRoundTrip(scale: number, translate: number): RoundTripMeasurement {
            let inexact = 0;
            let worstRelativeError = 0;

            for (const polygon of ALL_TEST_POLYGONS) {
                const placed = place(polygon.vertices, scale, translate);
                const normalisation = makeSkeletonNormalisation(placed);
                const returned = normalisePolygon(placed, normalisation).map(vertex =>
                    denormalisePosition(normalisation, vertex),
                );

                placed.forEach((vertex, index) => {
                    for (const axis of ['x', 'y'] as const) {
                        if (Object.is(vertex[axis], returned[index][axis])) {
                            continue;
                        }
                        inexact++;
                        const error = Math.abs(returned[index][axis] - vertex[axis]);
                        worstRelativeError = Math.max(worstRelativeError, error / Math.abs(vertex[axis]));
                    }
                });
            }

            return {inexact, worstRelativeError};
        }

        it.each(TRANSLATIONS)('returns every fixture coordinate BIT-FOR-BIT at translate %p', translate => {
            // Sterbenz territory: the span is tiny beside the offset, so `p - c` is exact and the
            // power-of-two scaling cannot round. Asserted with Object.is, never a tolerance.
            for (const polygon of ALL_TEST_POLYGONS) {
                const placed = place(polygon.vertices, 1, translate);
                const normalisation = makeSkeletonNormalisation(placed);
                const returned = normalisePolygon(placed, normalisation).map(vertex =>
                    denormalisePosition(normalisation, vertex),
                );

                placed.forEach((vertex, index) => {
                    expect(Object.is(returned[index].x, vertex.x)).toBe(true);
                    expect(Object.is(returned[index].y, vertex.y)).toBe(true);
                });
            }
        });

        it.each(EXACT_SCALES)('returns every fixture coordinate BIT-FOR-BIT at scale %p', scale => {
            expect(measureRoundTrip(scale, 0)).toEqual({inexact: 0, worstRelativeError: 0});
        });

        it.each(INEXACT_SCALES)(
            'pins the achieved error at scale %p, where the CENTRING rounds and the scaling does not',
            (scale, measuredInexact) => {
                // NOT SKIPPED. These are the regimes decision 4 declines to claim: near the origin
                // the span is comparable to the coordinates, so `p - c` falls outside Sterbenz and
                // rounds. A cell that improves is a bonus; a cell that regresses fails.
                const measurement = measureRoundTrip(scale, 0);

                expect(measurement.inexact).toBeLessThanOrEqual(measuredInexact);
                expect(measurement.worstRelativeError).toBeLessThanOrEqual(WORST_MEASURED_RELATIVE_ERROR);
                expect(measurement.worstRelativeError).toBeLessThan(Number.EPSILON);
            },
        );

        it('is exact in the SCALING everywhere, at every placement in the whole sweep', () => {
            // The decisive evidence for decision 4's split claim: take the centring out of the
            // picture by round-tripping the already-centred value, and every coordinate in every
            // cell of both sweeps returns on the bit. Whatever error survives above is the
            // subtraction, never the scale.
            const placements: (readonly [number, number])[] = [
                ...TRANSLATIONS.map(translate => [1, translate] as const),
                ...EXACT_SCALES.map(scale => [scale, 0] as const),
                ...INEXACT_SCALES.map(([scale]) => [scale, 0] as const),
            ];

            for (const [scale, translate] of placements) {
                for (const polygon of ALL_TEST_POLYGONS) {
                    const placed = place(polygon.vertices, scale, translate);
                    const {toUnitScale, fromUnitScale} = makeSkeletonNormalisation(placed);

                    for (const vertex of placed) {
                        for (const centred of [vertex.x, vertex.y]) {
                            expect(Object.is(centred * toUnitScale * fromUnitScale, centred)).toBe(true);
                        }
                    }
                }
            }
        });

        it('would NOT round-trip exactly under a longest-side scale, which is why the exponent is rounded', () => {
            // A 300-unit span with an arbitrary divisor loses 25 of the 300 integer offsets within
            // it — 21 is the first — and that error is injected at every level boundary of a
            // recursive subdivision. Under the power-of-two scale every one of them returns on the
            // bit. (The specification illustrates this with 147, which as it happens DOES survive
            // 147 / 300 * 300; 21 is a genuine witness and the property being shown is the same.)
            const failures = [];
            for (let offset = 1; offset <= 300; offset++) {
                if (!Object.is((offset / 300) * 300, offset)) {
                    failures.push(offset);
                }
                expect(Object.is((offset / 256) * 256, offset)).toBe(true);
            }

            expect(failures[0]).toBe(21);
            expect(failures).toHaveLength(25);
        });
    });

    describe('denormalising a graph applies exactly the documented enumeration', () => {
        const normalisation: SkeletonNormalisation = {
            centre: {x: 1000, y: -500},
            toUnitScale: 1 / 8,
            fromUnitScale: 8,
            degenerateExtent: false,
        };

        it('translates and scales every node position', () => {
            const graph = makeGraph();
            denormaliseGraph(graph, normalisation);

            expect(graph.nodes[0].position).toEqual({x: 1080, y: -340});
            expect(graph.nodes[1].position).toEqual({x: 1240, y: -340});
        });

        it('scales maxOffset WITHOUT translating it, and leaves an absent one absent', () => {
            const graph = makeGraph();
            denormaliseGraph(graph, normalisation);

            expect(graph.interiorEdges[0].maxOffset).toBe(32);
            expect(graph.interiorEdges[1].maxOffset).toBeUndefined();
        });

        it('leaves the InteriorEdge.length sentinel untouched', () => {
            const graph = makeGraph();
            denormaliseGraph(graph, normalisation);

            expect(graph.interiorEdges[0].length).toBe(Number.MAX_VALUE);
            expect(graph.interiorEdges[1].length).toBe(Number.MAX_VALUE);
        });

        it('leaves ids, sources and targets untouched', () => {
            const graph = makeGraph();
            denormaliseGraph(graph, normalisation);

            expect(graph.edges.map(edge => [edge.id, edge.source, edge.target])).toEqual([
                [0, 0, 1],
                [1, 1, undefined],
            ]);
            expect(graph.numExteriorNodes).toBe(2);
        });

        it('leaves every basisVector BIT-FOR-BIT unchanged', () => {
            // ASSERTED WITH Object.is, NOT A TOLERANCE, DELIBERATELY. A basis vector is a unit
            // DIRECTION: a uniform positive scale does not rotate it, and scaling it would destroy
            // the unit length every ray distance and every derived offset is measured against. A
            // scaled unit vector is still very nearly unit at these magnitudes, so a tolerance
            // would pass the exact defect this guards.
            const graph = makeGraph();
            const before = graph.edges.map(edge => ({...edge.basisVector}));

            denormaliseGraph(graph, normalisation);

            graph.edges.forEach((edge, index) => {
                expect(Object.is(edge.basisVector.x, before[index].x)).toBe(true);
                expect(Object.is(edge.basisVector.y, before[index].y)).toBe(true);
            });
        });
    });

    describe('denormalising a collision cache', () => {
        const normalisation: SkeletonNormalisation = {
            centre: {x: 1000, y: -500},
            toUnitScale: 1 / 8,
            fromUnitScale: 8,
            degenerateExtent: false,
        };

        function cacheWith(...events: CollisionEvent[]): CollisionCache {
            return new Map([[4, new Map([[5, events]])]]);
        }

        it('scales the offset distance and both ray-unit distances, and moves the position', () => {
            const event = makeEvent();
            denormaliseCollisionCache(cacheWith(event), normalisation);

            expect(event.offsetDistance).toBe(24);
            expect(event.position).toEqual({x: 1056, y: -428});
            expect(event.intersectionData[0]).toBe(16);
            expect(event.intersectionData[1]).toBe(40);
        });

        it('leaves the intersection TYPE and the colliding-edge ids alone', () => {
            const event = makeEvent();
            denormaliseCollisionCache(cacheWith(event), normalisation);

            expect(event.intersectionData[2]).toBe('converging');
            expect(event.collidingEdges).toEqual([4, 5]);
            expect(event.eventType).toBe('interiorPair');
        });

        it('lets infinities survive the multiply, because the no-collision outcomes need them', () => {
            const event = makeEvent({
                intersectionData: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 'parallel'],
            });
            denormaliseCollisionCache(cacheWith(event), normalisation);

            expect(event.intersectionData[0]).toBe(Number.POSITIVE_INFINITY);
            expect(event.intersectionData[1]).toBe(Number.NEGATIVE_INFINITY);
        });

        it('steps over the no-collision sentinel', () => {
            const cache: CollisionCache = new Map([[4, new Map([[5, NO_COLLISION_SENTINEL]])]]);

            expect(() => denormaliseCollisionCache(cache, normalisation)).not.toThrow();
            expect(cache.get(4)!.get(5)).toBe(NO_COLLISION_SENTINEL);
        });
    });

    describe('the solve boundary', () => {
        const square: Vector2[] = [
            {x: 100, y: 100},
            {x: 100, y: 500},
            {x: 500, y: 500},
            {x: 500, y: 100},
        ];

        it('surfaces the transform it used on the result, already undone on the graph', () => {
            const result = solveSkeleton(square);

            // A 400-unit square scales by 512, the nearest power of two to 400.
            expect(result.normalisation.fromUnitScale).toBe(512);
            expect(result.normalisation.centre).toEqual({x: 300, y: 300});
            expect(result.normalisation.degenerateExtent).toBe(false);

            // The graph is back in the caller's coordinates, not in unit space.
            const boundary = result.graph.nodes.slice(0, result.graph.numExteriorNodes).map(node => node.position);
            expect(boundary).toEqual(square);
        });

        it('is the seam a consumer scales its own length- and area-dimensioned inputs across', () => {
            const result = solveSkeleton(square);

            // A 20-unit strip depth is 20/512 of the scaled square; a 400-unit^2 minimum parcel is
            // 400/512^2 of its area. The square is the ratio, not the factor. Both are exact in
            // binary, and both return on the bit, which the arbitrary-divisor form did not manage.
            expect(normaliseLength(result.normalisation, 20)).toBe(0.0390625);
            expect(normaliseArea(result.normalisation, 400)).toBe(0.00152587890625);
            expect(denormaliseLength(result.normalisation, 0.0390625)).toBe(20);
            expect(denormaliseArea(result.normalisation, 0.00152587890625)).toBe(400);
        });

        it("carries a solved graph's basisVectors out BIT-FOR-BIT as the solver computed them", () => {
            // The decisive form of the direction rule, end to end. Every exterior basis vector in a
            // returned graph must be the one derived from the UNIT-SPACE boundary, unchanged — not a
            // version of it multiplied by the extent on the way out. Compared with Object.is.
            const placed = ALL_TEST_POLYGONS[0].vertices.map(vertex => ({x: vertex.x * 250 + 1e6, y: vertex.y * 250 + 1e6}));
            const result = solveSkeleton(placed);

            const unit = normalisePolygon(placed, makeSkeletonNormalisation(placed));
            const reference = makeStraightSkeletonSolverContext(unit).graph;

            expect(result.graph.numExteriorNodes).toBe(reference.numExteriorNodes);
            for (let edgeId = 0; edgeId < reference.numExteriorNodes; edgeId++) {
                expect(Object.is(result.graph.edges[edgeId].basisVector.x, reference.edges[edgeId].basisVector.x)).toBe(true);
                expect(Object.is(result.graph.edges[edgeId].basisVector.y, reference.edges[edgeId].basisVector.y)).toBe(true);
            }
        });

        it('reports a degenerate transform rather than dividing, for a polygon of no extent', () => {
            const collapsed: Vector2[] = [
                {x: 42, y: 42},
                {x: 42, y: 42},
                {x: 42, y: 42},
            ];

            const result = solveSkeleton(collapsed);

            expect(result.normalisation.degenerateExtent).toBe(true);
            expect(result.normalisation.toUnitScale).toBe(1);
            for (const node of result.graph.nodes) {
                expect(Number.isFinite(node.position.x)).toBe(true);
                expect(Number.isFinite(node.position.y)).toBe(true);
            }
        });
    });
});
