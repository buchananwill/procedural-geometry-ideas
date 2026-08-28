import {CLEAN_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    BoundaryRun,
    CanonicalPolygon,
    canonicalisePolygon,
    FLOATING_POINT_EPSILON,
    makeRootRegion,
    makeSkeletonNormalisation,
    normalisePolygon,
    Region,
    remapRuns,
    REMOVED_VERTEX_INDEX,
    runAlgorithmV5,
    runAlgorithmV5Stepped,
    runBoundaryVertexIndices,
    SKELETON_NOISE_FLOOR,
    setSkeletonLogLevel,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';

import {insertRegularly} from './subdivision-helpers';
import {distanceToSegment} from './wavefront-measurement-helpers';

/**
 * The input canonicalisation stage, tested as the predicate and the contract it is specified as.
 *
 * The pipeline-level invariant this stage exists to create — output unchanged under
 * silhouette-preserving vertex insertion — lives in `silhouette-invariance.test.ts`. This file is the
 * unit: what the predicate measures, that it iterates rather than sweeps, the floor it never goes
 * below, and that a correction here is never silent.
 *
 * EVERY FIXTURE HERE IS UNIT-SIZED ON PURPOSE. `SKELETON_NOISE_FLOOR` is a unit-space constant applied
 * after the solver's boundary normalisation, so a test that fed it a 300-unit polygon would be
 * comparing a unit-space floor against caller-space deviations and measuring nothing.
 */

setSkeletonLogLevel('silent');

const UNIT_SQUARE: Vector2[] = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}];

/**
 * Perpendicular deviation of each ring vertex from the chord between its immediate neighbours.
 *
 * The distance comes from the SUITES' shared `distanceToSegment` rather than from the one
 * `canonicalisation.ts` itself delegates to. That keeps this file's measurement outside the import
 * graph of the module under test — a test that read its expectation from the same function the
 * implementation calls could not tell a correct predicate from a predicate and an oracle that are
 * wrong together — without adding a third copy of the clamped point-to-segment arithmetic.
 */
function deviations(ring: readonly Vector2[]): number[] {
    return ring.map((vertex, index) => distanceToSegment(
        vertex,
        ring[(index - 1 + ring.length) % ring.length],
        ring[(index + 1) % ring.length]));
}

/**
 * Turn angle at each ring vertex, `|π − interior angle|`.
 *
 * Present only so the decision-1 fixtures can PROVE the two candidate predicates disagree on them,
 * rather than asserting the disagreement in a comment. It is not what the implementation uses, and
 * nothing outside the first describe block may reach for it.
 */
function turnAngles(ring: readonly Vector2[]): number[] {
    return ring.map((vertex, index) => {
        const previous = ring[(index - 1 + ring.length) % ring.length];
        const next = ring[(index + 1) % ring.length];
        const inX = vertex.x - previous.x;
        const inY = vertex.y - previous.y;
        const outX = next.x - vertex.x;
        const outY = next.y - vertex.y;
        return Math.abs(Math.atan2(inX * outY - inY * outX, inX * outX + inY * outY));
    });
}

/** A unit square whose bottom edge carries a needle 2e-12 wide at the base and 1e-9 tall. */
const NEEDLE_SPIKE: Vector2[] = [
    {x: 0, y: 0},
    {x: 0.5, y: 0},
    {x: 0.5 + 1e-12, y: 1e-9},
    {x: 0.5 + 2e-12, y: 0},
    {x: 1, y: 0},
    {x: 1, y: 1},
    {x: 0, y: 1},
];

/**
 * A unit square whose bottom edge is a shallow circular arc bulging 0.01 inward, sampled at 8 spans.
 *
 * A one-per-cent bulge on a unit polygon is plainly visible; the point of the fixture is that every
 * vertex expressing it turns by only 0.01 radians.
 */
const GENTLE_ARC: Vector2[] = (() => {
    const sagitta = 0.01;
    const spans = 8;
    const radius = 1 / (8 * sagitta) + sagitta / 2;
    const arc: Vector2[] = [];
    for (let index = 0; index < spans; index++) {
        const x = index / spans;
        arc.push({x, y: -(radius - sagitta) + Math.sqrt(radius * radius - (x - 0.5) * (x - 0.5))});
    }
    return [...arc, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}];
})();

/**
 * A unit square whose bottom edge carries a ripple of three vertices: down, up, down.
 *
 * Measured deviations, in units of the floor: 0.90, 1.30, 0.90. The MIDDLE ONE IS ABOVE THE FLOOR on
 * the input as given, so no single evaluation of the predicate can remove it. Once the two dips
 * either side are gone its chord becomes the bottom edge itself and its deviation falls to 0.80.
 */
const RIPPLED_EDGE: Vector2[] = [
    {x: 0, y: 0},
    {x: 0.25, y: -0.5 * SKELETON_NOISE_FLOOR},
    {x: 0.5, y: 0.8 * SKELETON_NOISE_FLOOR},
    {x: 0.75, y: -0.5 * SKELETON_NOISE_FLOOR},
    {x: 1, y: 0},
    {x: 1, y: 1},
    {x: 0, y: 1},
];

describe('the predicate is perpendicular deviation, never turn angle', () => {
    it('removes a needle whose deviation is invisible but whose turn angle is nearly π', () => {
        // The discrimination, stated as measurements rather than as a comment: the needle's three
        // vertices deviate by 1e-9 — a thousandth of the floor — while the tip turns by 3.14 radians.
        // A predicate that removed near-straight vertices would keep this needle outright.
        expect(deviations(NEEDLE_SPIKE)[2]).toBeCloseTo(1e-9, 15);
        expect(turnAngles(NEEDLE_SPIKE)[2]).toBeGreaterThan(3.1);

        const canonical = canonicalisePolygon(NEEDLE_SPIKE, SKELETON_NOISE_FLOOR);

        expect(canonical.vertices).toHaveLength(4);
        expect(canonical.removedCount).toBe(3);
        expect(canonical.vertices).toEqual(UNIT_SQUARE);
    });

    it('keeps a visibly curving run whose vertices are nearly straight', () => {
        // The reverse discrimination on the same two measures. Every arc vertex turns by 0.01
        // radians — flatter than a needle by two and a half orders — and every one of them stands
        // 6.25e-4 off its own chord, 625 times the floor. A turn-angle predicate would delete the
        // whole bulge; this one keeps all of it.
        const arcVertices = [1, 2, 3, 4, 5, 6];
        for (const index of arcVertices) {
            expect(turnAngles(GENTLE_ARC)[index]).toBeLessThan(0.02);
            expect(deviations(GENTLE_ARC)[index]).toBeGreaterThan(100 * SKELETON_NOISE_FLOOR);
        }

        const canonical = canonicalisePolygon(GENTLE_ARC, SKELETON_NOISE_FLOOR);

        expect(canonical.removedCount).toBe(0);
        expect(canonical.maxDeviation).toBe(0);
        expect(canonical.vertices).toHaveLength(GENTLE_ARC.length);
    });
});

describe('removal iterates to a fixed point rather than sweeping once', () => {
    it('removes a vertex that was above the floor until its neighbours went', () => {
        const initial = deviations(RIPPLED_EDGE);
        // The premise, asserted rather than assumed: the middle ripple vertex is above the floor on
        // the input, so it survives ANY single evaluation of the predicate.
        expect(initial[2]).toBeGreaterThan(SKELETON_NOISE_FLOOR);
        expect(initial[1]).toBeLessThan(SKELETON_NOISE_FLOOR);
        expect(initial[3]).toBeLessThan(SKELETON_NOISE_FLOOR);

        const canonical = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR);

        expect(canonical.removedCount).toBe(3);
        expect(canonical.vertices).toEqual(UNIT_SQUARE);
        // 0.90 for each dip, then 0.80 for the middle once the bottom edge became its own chord.
        expect(canonical.maxDeviation).toBeCloseTo(0.9 * SKELETON_NOISE_FLOOR, 12);
    });

    it('leaves no surviving vertex under the floor', () => {
        const canonical = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR);

        for (const deviation of deviations(canonical.vertices)) {
            expect(deviation).toBeGreaterThanOrEqual(SKELETON_NOISE_FLOOR);
        }
    });

    it('is idempotent, which is what "fixed point" means operationally', () => {
        const once = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR);
        const twice = canonicalisePolygon(once.vertices, SKELETON_NOISE_FLOOR);

        expect(twice.removedCount).toBe(0);
        expect(twice.maxDeviation).toBe(0);
        expect(twice.vertices).toEqual(once.vertices);
    });

    it('gives the same ring whichever vertex the input list starts at', () => {
        // The order-dependence decision 2 names. A single pass would answer differently depending on
        // where it began walking; a fixed point cannot, so this is a property of the result and not
        // of the traversal.
        const fromStart = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR);

        for (let rotation = 1; rotation < RIPPLED_EDGE.length; rotation++) {
            const rotated = [...RIPPLED_EDGE.slice(rotation), ...RIPPLED_EDGE.slice(0, rotation)];
            const canonical = canonicalisePolygon(rotated, SKELETON_NOISE_FLOOR);

            expect(canonical.removedCount).toBe(fromStart.removedCount);
            expect(canonical.maxDeviation).toBeCloseTo(fromStart.maxDeviation, 15);
            expect(new Set(canonical.vertices.map(v => `${v.x},${v.y}`)))
                .toEqual(new Set(fromStart.vertices.map(v => `${v.x},${v.y}`)));
        }
    });

    it('reverses with the ring, because a chord has no direction', () => {
        const forward = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR);
        const backward = canonicalisePolygon([...RIPPLED_EDGE].reverse(), SKELETON_NOISE_FLOOR);

        expect(backward.removedCount).toBe(forward.removedCount);
        expect(backward.vertices).toEqual([...forward.vertices].reverse());
    });
});

describe('a polygon is never reduced below three vertices', () => {
    /** A ring of `count` vertices packed into a disc far below the floor. Every vertex is invisible. */
    function invisibleRing(count: number, radius: number): Vector2[] {
        return Array.from({length: count}, (_unused, index) => {
            const angle = (2 * Math.PI * index) / count;
            return {x: radius * Math.cos(angle), y: radius * Math.sin(angle)};
        });
    }

    it('stops at three however far below the floor every vertex is', () => {
        const ring = invisibleRing(20, 1e-12);

        const canonical = canonicalisePolygon(ring, SKELETON_NOISE_FLOOR);

        expect(canonical.vertices).toHaveLength(3);
        expect(canonical.removedCount).toBe(17);
    });

    it('stops at three even under an absurdly large floor', () => {
        const canonical = canonicalisePolygon(GENTLE_ARC, 1e9);

        expect(canonical.vertices).toHaveLength(3);
    });

    it('leaves an already-degenerate input degenerate rather than repairing it', () => {
        // A two-vertex input is not a polygon and this stage does not pretend otherwise: it comes
        // back untouched, to fail honestly downstream.
        const twoVertices: Vector2[] = [{x: 0, y: 0}, {x: 1, y: 0}];

        const canonical = canonicalisePolygon(twoVertices, SKELETON_NOISE_FLOOR);

        expect(canonical.vertices).toHaveLength(2);
        expect(canonical.removedCount).toBe(0);
    });
});

describe('the floor', () => {
    it('clears the solver\'s degeneracy epsilon by two orders of magnitude', () => {
        // Decision 6: if the two were comparable the stage would buy nothing, because a vertex just
        // over the floor would survive and still be inside the solver's degenerate band. The gap is
        // what makes every survivor COMFORTABLY non-degenerate.
        expect(SKELETON_NOISE_FLOOR / FLOATING_POINT_EPSILON).toBeGreaterThanOrEqual(100);
        expect(SKELETON_NOISE_FLOOR).toBe(1e-6);
    });

    it('is taken as given and never recomputed from the polygon in hand', () => {
        // The same shape at two sizes, under ONE floor. A stage that derived its floor from the
        // polygon's own extent would answer identically for both; taking it as a parameter means the
        // small copy loses its ripple and the large copy keeps it.
        const large = RIPPLED_EDGE;
        const small = RIPPLED_EDGE.map(v => ({x: v.x * 1e-3, y: v.y * 1e-3}));

        expect(canonicalisePolygon(large, SKELETON_NOISE_FLOOR).removedCount).toBe(3);
        expect(canonicalisePolygon(small, SKELETON_NOISE_FLOOR).removedCount).toBe(3);

        // And the discriminating direction: a floor a thousand times finer sees the large copy's
        // ripple as real geometry.
        expect(canonicalisePolygon(large, SKELETON_NOISE_FLOOR * 1e-3).removedCount).toBe(0);
    });

    it('removes nothing at all at zero, exactly', () => {
        // The supported way to turn the stage off, and the seam the metamorphic gate is convicted
        // through. An exactly-collinear vertex has deviation zero and the comparison is strict, so
        // even that one survives.
        const collinear = [...UNIT_SQUARE];
        collinear.splice(1, 0, {x: 0.5, y: 0});

        expect(canonicalisePolygon(collinear, 0).removedCount).toBe(0);
        expect(canonicalisePolygon(collinear, 0).vertices).toEqual(collinear);
        expect(canonicalisePolygon(collinear, SKELETON_NOISE_FLOOR).removedCount).toBe(1);
    });

    it('terminates on a NaN floor rather than spinning on it, and removes nothing', () => {
        // `noiseFloor` is a public option, so a NaN can reach the loop from a caller's arithmetic.
        // The comparison is negated rather than `>=` precisely so that it breaks the loop instead of
        // running forever, and this is the assertion that holds that shape in place: every NaN
        // comparison is false, so `!(deviation < NaN)` is true and the first iteration stops.
        // A regression to `deviation >= floor` would hang the suite here rather than fail it, which
        // is itself the report.
        const collinear = [...UNIT_SQUARE];
        collinear.splice(1, 0, {x: 0.5, y: 0});

        const canonical = canonicalisePolygon(collinear, Number.NaN);

        expect(canonical.removedCount).toBe(0);
        expect(canonical.maxDeviation).toBe(0);
        expect(canonical.vertices).toEqual(collinear);
    });

    it('returns fresh vertices that do not alias the input', () => {
        const input = [...UNIT_SQUARE];

        const canonical = canonicalisePolygon(input, SKELETON_NOISE_FLOOR);
        canonical.vertices[0].x = 99;

        expect(input[0].x).toBe(0);
    });
});

describe('what the ruled floor actually does to the fixture corpus', () => {
    /*
     * Decision 18: report which fixtures are canonicalised at all, and by how much. A hand-authored
     * fixture rarely carries invisible vertices, so MOST OF THE CORPUS MUST BE UNTOUCHED — a floor
     * that removes vertices from most of it is too high, and this block is how that is caught rather
     * than discovered later.
     *
     * Pinned as a named set with a set-equality assertion, the same shape as the subdivision failure
     * lists in `reflex-subdivision.test.ts`, so drift in either direction is loud.
     */

    /**
     * Every `CLEAN_TEST_POLYGONS` fixture the ruled floor removes a vertex from. Two of 50.
     *
     * THE SECOND ARRIVED DELIBERATELY, WHICH THE FIRST DID NOT. `Long Unbroken Side Then Extreme
     * Acute Angle` is a hand-authored fixture that happens to carry an exactly-collinear vertex;
     * `Invisible Vertex Rectangle` was built around one, under journal decision 75, because a
     * removed vertex renumbers the graph and that renumbering is what a dashboard inspection read
     * as a corrupted solve. The set is in roster order.
     */
    const CANONICALISED_FIXTURES = [
        'Long Unbroken Side Then Extreme Acute Angle',
        'Invisible Vertex Rectangle',
    ];

    /** What the stage does to one fixture, in unit space, where the floor lives. */
    function canonicaliseFixture(vertices: Vector2[], floor: number): CanonicalPolygon {
        const normalisation = makeSkeletonNormalisation(vertices);
        return canonicalisePolygon(normalisePolygon(vertices, normalisation), floor);
    }

    it('touches exactly two of the 50 fixtures, and removes exactly one vertex from each', () => {
        const touched = CLEAN_TEST_POLYGONS
            .filter(fixture => canonicaliseFixture(fixture.vertices, SKELETON_NOISE_FLOOR).removedCount > 0)
            .map(fixture => fixture.name);

        expect(touched).toEqual(CANONICALISED_FIXTURES);

        // Both lose exactly one vertex, and both lose it at the noise floor of the arithmetic rather
        // than of the eye.
        const sizes: Record<string, readonly [number, number]> = {
            'Long Unbroken Side Then Extreme Acute Angle': [32, 31],
            'Invisible Vertex Rectangle': [16, 15],
        };
        for (const name of CANONICALISED_FIXTURES) {
            const fixture = CLEAN_TEST_POLYGONS.find(p => p.name === name)!;
            const canonical = canonicaliseFixture(fixture.vertices, SKELETON_NOISE_FLOOR);
            expect([fixture.vertices.length, canonical.vertices.length]).toEqual([...sizes[name]]);
            expect(canonical.maxDeviation).toBeLessThan(1e-16);
        }
    });

    it('is insensitive across four decades, and the sweep says where that stops', () => {
        // The measured sweep, as an assertion rather than a note. Between 1e-12 and 1e-4 the corpus
        // does not move at all: the two vertices above are the only ones anywhere below 1e-3, and
        // both go at any non-zero floor. THE CORPUS IS NOT WHAT BINDS THE FLOOR — the recursive
        // subdivision arc is, and its per-level tiling identity fails above 3e-6. See
        // `canonicalisation.ts` for why that band is narrow rather than a plateau.
        const touchedAt = (floor: number): number => CLEAN_TEST_POLYGONS
            .filter(fixture => canonicaliseFixture(fixture.vertices, floor).removedCount > 0).length;

        // 1 BECAME 2 ON 2026-08-28, when `INVISIBLE_VERTEX_RECTANGLE` joined the corpus under
        // journal decision 75 carrying a deliberately exactly-collinear vertex. The insensitivity
        // this asserts is unchanged: the count is flat across all eight floors, which is the claim,
        // and it is 2 at every one of them because both fixtures' vertices are exactly collinear and
        // go at any non-zero floor.
        for (const floor of [1e-12, 1e-10, 1e-8, 1e-7, SKELETON_NOISE_FLOOR, 3e-6, 1e-5, 1e-4]) {
            expect(touchedAt(floor)).toBe(2);
        }

        // And the direction decision 18 exists to catch. At 1e-2 the floor is eating real geometry
        // from over a quarter of the corpus, which is what "too high" looks like from here.
        //
        // 10 BECAME 12 ON 2026-08-27, when `SHORT_EDGE_PROMONTORY` and `NEAR_REGULAR_PEANUT_32`
        // were promoted into `CLEAN_TEST_POLYGONS` under journal decision 64. Attributed per
        // fixture before repinning: both new fixtures are touched at 1e-2 and neither is touched
        // at any smaller floor in this sweep, and the other 42 are unmoved at every floor — so
        // this is the corpus growing, not the floor's sensitivity changing. The ruled floor still
        // touches exactly one fixture, which is the assertion above and the one that binds.
        //
        // 12 BECAME 13 ON 2026-08-28, when `NEAR_REGULAR_ELLIPSE_16` and `NEAR_REGULAR_ELLIPSE_32`
        // were promoted under journal decision 65. Attributed per fixture before repinning: only
        // the 32-gon is touched at 1e-2 — it samples the ellipse's near-flat major-axis flanks
        // densely enough that consecutive vertices deviate by less than a hundredth of the extent —
        // and the 16-gon is touched at no floor in this sweep. The other 44 are unmoved at every
        // floor, and `touchedAt(1e-3)` does not move at all.
        //
        // 13 BECAME 15, AND `touchedAt(1e-3)` 2 BECAME 3, LATER ON 2026-08-28, when
        // `SLIGHTLY_DEFORMED_PEANUT_1` and `SLIGHTLY_DEFORMED_PEANUT_2` were promoted under journal
        // decision 69. Attributed per fixture before repinning: both are touched at 1e-2 and only
        // variant 2 at 1e-3 — the vertex it draws into the waist sits closer to the chord between
        // its neighbours than variant 1's does — and neither is touched at any smaller floor in
        // this sweep. The other 46 are unmoved at every floor, so the ruled floor still touches
        // exactly one fixture.
        //
        // NEITHER MOVED ON 2026-08-28 when `SYMMETRICAL_OCTAGON` was promoted under journal
        // decision 73, and the zero is attributed rather than assumed: the octagon is touched at NO
        // floor in this sweep, including 1e-2. Its eight sides are all a third of its extent, so
        // there is no vertex anywhere near the chord between its neighbours — a corpus growing by a
        // fixture the stage cannot reach, which is the ordinary case these counts exist to
        // distinguish from a floor becoming more aggressive.
        //
        // 15 BECAME 16, AND `touchedAt(1e-3)` 3 BECAME 4, ON 2026-08-28, when
        // `INVISIBLE_VERTEX_RECTANGLE` joined the corpus under journal decision 75. Attributed:
        // the new fixture is touched at both, and the other 49 are unmoved at every floor. It is
        // touched at 1e-3 because its non-corner vertices stand only 1 to 4 units clear of their
        // chords on a 410-unit extent — deliberately far enough from the ruled floor to be real
        // geometry, and not far enough to survive a floor three decades above it.
        //
        // NEITHER MOVED AGAIN ON 2026-08-28, when journal decision 90 promoted `COLLINEAR_DUMBBELL`
        // and enrolled `ASYMMETRIC_DUMBBELL` and `THREE_GLOBE_CHAIN`, and the zero is attributed:
        // NONE of the three is touched at any floor in this sweep, including 1e-2. Every turn in
        // all three is a right angle on a shape whose smallest feature is a two-unit bar across a
        // thirty-unit extent, so no vertex is anywhere near the chord between its neighbours.
        expect(touchedAt(1e-3)).toBe(4);
        expect(touchedAt(1e-2)).toBe(16);
    });

    it('leaves every fixture solving completely, at the ruled floor and either side of it', () => {
        const problems: string[] = [];
        for (const floor of [0, SKELETON_NOISE_FLOOR, 3e-6]) {
            for (const fixture of CLEAN_TEST_POLYGONS) {
                if (!solveSkeleton(fixture.vertices, {noiseFloor: floor}).complete) {
                    problems.push(`${fixture.name} @ floor ${floor}`);
                }
            }
        }
        expect(problems.join('; ')).toBe('');
    });
});

/**
 * A 300-unit L with an exactly collinear vertex inserted on its longest edge: seven vertices
 * spelling the six-cornered silhouette the solver has always handled.
 *
 * A factory rather than a shared constant, so no test can reach another's input through it.
 */
function withCollinearVertex(): Vector2[] {
    return [
        {x: 100, y: 100}, {x: 100, y: 250}, {x: 100, y: 400}, {x: 250, y: 400},
        {x: 250, y: 250}, {x: 400, y: 250}, {x: 400, y: 100},
    ];
}

describe('canonicalisation is reported, never silent', () => {
    it('carries the removed count and the discarded deviation on a diagnostic', () => {
        const result = solveSkeleton(withCollinearVertex());

        const canonicalised = result.diagnostics.filter(d => d.kind === 'vertices-canonicalised');
        expect(canonicalised).toHaveLength(1);
        expect(canonicalised[0].detail).toMatch(/1 vertex/);
        expect(canonicalised[0].detail).toMatch(/deviation/);
    });

    it('does not make the result incomplete', () => {
        // Decision 9: it joins `winding-normalised` and `self-intersecting` as informational.
        const result = solveSkeleton(withCollinearVertex());

        expect(result.diagnostics.map(d => d.kind)).toEqual(['vertices-canonicalised']);
        expect(result.complete).toBe(true);
    });

    it('says nothing when the input was already canonical', () => {
        const result = solveSkeleton([
            {x: 100, y: 100}, {x: 100, y: 400}, {x: 250, y: 400},
            {x: 250, y: 250}, {x: 400, y: 250}, {x: 400, y: 100},
        ]);

        expect(result.diagnostics).toEqual([]);
        expect(result.complete).toBe(true);
    });

    it('actually solves the canonicalised polygon, not the input one', () => {
        // The removed vertex must be gone from the graph the caller gets back, or the stage has
        // reported a correction it did not make.
        const result = solveSkeleton(withCollinearVertex());

        expect(result.graph.numExteriorNodes).toBe(6);
    });

    it('honours a caller\'s noise floor override, and reports against it', () => {
        const result = solveSkeleton(withCollinearVertex(), {noiseFloor: 0});

        expect(result.diagnostics.filter(d => d.kind === 'vertices-canonicalised')).toHaveLength(0);
        expect(result.graph.numExteriorNodes).toBe(7);
    });
});

describe('the index remap says where every input vertex went', () => {
    /*
     * Decision 6. Removing a vertex renumbers every index after it, so anything recorded against the
     * input ring — a boundary run above all — refers to the wrong geometry afterwards. The remap is
     * how such a record is CARRIED rather than recomputed from the surviving geometry, which would
     * be a proximity test standing in for a topological fact.
     */

    it('is the identity when nothing was removed', () => {
        const canonical = canonicalisePolygon(UNIT_SQUARE, SKELETON_NOISE_FLOOR);

        expect(canonical.indexRemap).toEqual([0, 1, 2, 3]);
    });

    it('marks removed vertices and renumbers the survivors after them', () => {
        const canonical = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR);

        expect(canonical.indexRemap).toEqual([
            0, REMOVED_VERTEX_INDEX, REMOVED_VERTEX_INDEX, REMOVED_VERTEX_INDEX, 1, 2, 3,
        ]);
    });

    it('is as long as the input, and points every survivor at its own vertex', () => {
        const canonical = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR);

        expect(canonical.indexRemap).toHaveLength(RIPPLED_EDGE.length);
        expect(canonical.indexRemap.filter(index => index !== REMOVED_VERTEX_INDEX))
            .toHaveLength(canonical.vertices.length);

        canonical.indexRemap.forEach((survivingIndex, inputIndex) => {
            if (survivingIndex === REMOVED_VERTEX_INDEX) {
                return;
            }
            expect(canonical.vertices[survivingIndex]).toEqual(RIPPLED_EDGE[inputIndex]);
        });
    });
});

describe('a pinned vertex is never removed', () => {
    /*
     * Decision 7. A run boundary is where access changes to non-access — semantically significant
     * however small its deviation happens to be. Pinning a handful of vertices costs nothing and
     * removes the whole class of failure where a canonicalisation silently fuses a road run into the
     * fence beside it.
     */

    it('keeps a vertex the floor would otherwise have taken', () => {
        const unpinned = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR);
        const pinned = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR, [1]);

        // The mutation that convicts the rule: the same input, the same floor, one pin.
        expect(unpinned.removedCount).toBe(3);
        expect(unpinned.indexRemap[1]).toBe(REMOVED_VERTEX_INDEX);
        expect(pinned.indexRemap[1]).not.toBe(REMOVED_VERTEX_INDEX);
        expect(pinned.vertices).toContainEqual(RIPPLED_EDGE[1]);
    });

    it('protects a vertex rather than the stage, and the rest is measured against what remains', () => {
        const pinned = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR, [1]);

        // Vertex 3 still goes: the pin is a pin and not a switch. Vertex 2 then STAYS, because the
        // dip at vertex 1 that held it above the floor is still there — the fixed point is measured
        // against the ring that remains, so a pin changes what its neighbours are measured against.
        expect(pinned.removedCount).toBe(1);
        expect(pinned.indexRemap[3]).toBe(REMOVED_VERTEX_INDEX);
        expect(pinned.indexRemap[2]).not.toBe(REMOVED_VERTEX_INDEX);
    });

    it('removes nothing at all when every vertex is pinned', () => {
        const everything = RIPPLED_EDGE.map((_unused, index) => index);

        const canonical = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR, everything);

        expect(canonical.removedCount).toBe(0);
        expect(canonical.maxDeviation).toBe(0);
        expect(canonical.vertices).toEqual(RIPPLED_EDGE);
    });

    it('leaves an unpinned call behaving exactly as it did before pins existed', () => {
        const withoutArgument = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR);
        const withEmptyPins = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR, []);

        expect(withEmptyPins).toEqual(withoutArgument);
        expect(withoutArgument.pinnedCount).toBe(0);
        expect(withoutArgument.pinnedUnderFloorCount).toBe(0);
    });

    it('still never reduces a ring below three vertices', () => {
        const ring = Array.from({length: 20}, (_unused, index) => {
            const angle = (2 * Math.PI * index) / 20;
            return {x: 1e-12 * Math.cos(angle), y: 1e-12 * Math.sin(angle)};
        });

        const canonical = canonicalisePolygon(ring, SKELETON_NOISE_FLOOR, [0, 5]);

        expect(canonical.vertices).toHaveLength(3);
        expect(canonical.indexRemap[0]).not.toBe(REMOVED_VERTEX_INDEX);
        expect(canonical.indexRemap[5]).not.toBe(REMOVED_VERTEX_INDEX);
    });

    it('rejects a pin that is not a vertex of the polygon it was handed', () => {
        // A pin silently dropped is precisely the failure pinning exists to prevent, so an index the
        // ring does not have is a disagreement about which polygon this is, not a no-op.
        expect(() => canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR, [7])).toThrow(/pin/i);
        expect(() => canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR, [-1])).toThrow(/pin/i);
        expect(() => canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR, [1.5])).toThrow(/pin/i);
    });
});

describe('pinning is reported, and distinguished from removal', () => {
    /*
     * Decision 8. A polygon whose vertices are mostly pinned is a signal that its runs are
     * fragmented, and that is worth seeing here rather than inferring later from a strange-looking
     * slice. `pinnedUnderFloorCount` is the sharper half: a ring that came back carrying geometry
     * the floor calls invisible, BY DECISION rather than because the stage failed to fire.
     */

    it('counts the pins it honoured, deduplicated', () => {
        const canonical = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR, [1, 1, 4]);

        expect(canonical.pinnedCount).toBe(2);
    });

    it('counts separately the pins that are what kept their vertex', () => {
        const canonical = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR, [1, 4]);

        // Vertex 1 is under the floor in the ring that came back; vertex 4 is a corner of the square
        // and stands well clear of it. Both are pinned; only one was kept by its pin.
        expect(canonical.pinnedCount).toBe(2);
        expect(canonical.pinnedUnderFloorCount).toBe(1);
        expect(canonical.removedCount).toBe(1);
    });

    it('says nothing was kept by a pin when no pin was load-bearing', () => {
        const canonical = canonicalisePolygon(RIPPLED_EDGE, SKELETON_NOISE_FLOOR, [0, 4, 5]);

        expect(canonical.pinnedCount).toBe(3);
        expect(canonical.pinnedUnderFloorCount).toBe(0);
        expect(canonical.removedCount).toBe(3);
    });
});

/** The polyline a run covers: its edges' vertices, in boundary order, `endIndex + 1` inclusive. */
function runPolyline(boundary: readonly Vector2[], run: BoundaryRun): Vector2[] {
    const polyline: Vector2[] = [];
    for (let step = 0; ; step++) {
        const index = (run.startIndex + step) % boundary.length;
        polyline.push(boundary[index]);
        if (index === run.endIndex) {
            polyline.push(boundary[(index + 1) % boundary.length]);
            return polyline;
        }
    }
}

/** How far `point` lies from the polyline `chain`, measured segment by segment. */
function distanceToPolyline(point: Vector2, chain: readonly Vector2[]): number {
    let distance = Infinity;
    for (let index = 0; index + 1 < chain.length; index++) {
        distance = Math.min(distance, distanceToSegment(point, chain[index], chain[index + 1]));
    }
    return distance;
}

describe('a run survives a canonicalisation that actually removes vertices', () => {
    /*
     * Decision 12. The remap is tested against a stage that MOVES, not against a hand-authored
     * fixture it happens to be a no-op on: a unit square with every edge cut into four, so twelve
     * exactly-collinear vertices go, three of them from inside the tagged run. What is compared is
     * POSITIONS, since the indices are exactly what changed.
     */

    /** The unit square, each edge cut into four. Sixteen vertices; the four corners are the first of each. */
    const SUBDIVIDED_SQUARE: Vector2[] = insertRegularly(UNIT_SQUARE, 4);

    /** Edges 0–3 are the bottom of the square: one access run, spanning the subdivided stretch. */
    const SUBDIVIDED_RUNS: BoundaryRun[] = [
        {startIndex: 0, endIndex: 3, provenance: 'perimeter-access'},
        {startIndex: 4, endIndex: 15, provenance: 'perimeter-plain'},
    ];

    it('removes vertices from inside the run, which is what makes this a test', () => {
        const canonical = canonicalisePolygon(
            SUBDIVIDED_SQUARE, SKELETON_NOISE_FLOOR, runBoundaryVertexIndices(SUBDIVIDED_RUNS));

        expect(SUBDIVIDED_SQUARE).toHaveLength(16);
        expect(canonical.removedCount).toBe(12);
        expect(canonical.vertices).toEqual(UNIT_SQUARE);
        for (const inside of [1, 2, 3]) {
            expect(canonical.indexRemap[inside]).toBe(REMOVED_VERTEX_INDEX);
        }
    });

    it('carries the run onto the same stretch of boundary, compared as geometry', () => {
        const canonical = canonicalisePolygon(
            SUBDIVIDED_SQUARE, SKELETON_NOISE_FLOOR, runBoundaryVertexIndices(SUBDIVIDED_RUNS));

        const carried = remapRuns(SUBDIVIDED_RUNS, canonical.indexRemap, canonical.vertices.length);

        expect(carried).toHaveLength(2);
        expect(carried.map(run => run.provenance)).toEqual(['perimeter-access', 'perimeter-plain']);

        const before = runPolyline(SUBDIVIDED_SQUARE, SUBDIVIDED_RUNS[0]);
        const after = runPolyline(canonical.vertices, carried[0]);

        // Same endpoints, to the bit.
        expect(after[0]).toEqual(before[0]);
        expect(after[after.length - 1]).toEqual(before[before.length - 1]);
        // And everything the run used to pass through still lies on it.
        for (const vertex of before) {
            expect(distanceToPolyline(vertex, after)).toBeLessThan(SKELETON_NOISE_FLOOR);
        }
    });

    it('carries the OTHER run just as exactly, so nothing was double-counted', () => {
        const canonical = canonicalisePolygon(
            SUBDIVIDED_SQUARE, SKELETON_NOISE_FLOOR, runBoundaryVertexIndices(SUBDIVIDED_RUNS));

        const carried = remapRuns(SUBDIVIDED_RUNS, canonical.indexRemap, canonical.vertices.length);

        const before = runPolyline(SUBDIVIDED_SQUARE, SUBDIVIDED_RUNS[1]);
        const after = runPolyline(canonical.vertices, carried[1]);

        expect(after[0]).toEqual(before[0]);
        expect(after[after.length - 1]).toEqual(before[before.length - 1]);
        for (const vertex of before) {
            expect(distanceToPolyline(vertex, after)).toBeLessThan(SKELETON_NOISE_FLOOR);
        }
    });
});

/** A default root region and the canonicalisation of its own boundary, kept together. */
interface CanonicalisedRoot {
    region: Region;
    canonical: CanonicalPolygon;
}

describe('a whole-perimeter run survives losing the vertex it was spelled from', () => {
    /*
     * The default `makeRootRegion(boundary)` region, which is one run over the entire ring. It pins
     * nothing — a seamless ring gives way to nothing — so canonicalisation is free to remove the
     * vertex the run happens to start at, and here it does exactly that: the subdivided square is
     * rotated by one so that index 0 is a collinear mid-edge vertex rather than a corner.
     */

    const ROTATED_SUBDIVIDED_SQUARE: Vector2[] = (() => {
        const subdivided = insertRegularly(UNIT_SQUARE, 4);
        return [...subdivided.slice(1), subdivided[0]];
    })();

    function canonicaliseRoot(): CanonicalisedRoot {
        const region = makeRootRegion(ROTATED_SUBDIVIDED_SQUARE);
        return {
            region,
            canonical: canonicalisePolygon(
                region.boundary, SKELETON_NOISE_FLOOR, runBoundaryVertexIndices(region.runs)),
        };
    }

    it('removes vertex 0 itself, which is what makes this a test', () => {
        const {region, canonical} = canonicaliseRoot();

        expect(region.runs).toEqual([{startIndex: 0, endIndex: 15, provenance: 'perimeter-access'}]);
        expect(runBoundaryVertexIndices(region.runs)).toEqual([]);
        expect(canonical.indexRemap[0]).toBe(REMOVED_VERTEX_INDEX);
        expect(canonical.vertices).toHaveLength(4);
    });

    it('carries the run onto the whole shortened ring rather than throwing', () => {
        const {region, canonical} = canonicaliseRoot();

        const carried = remapRuns(region.runs, canonical.indexRemap, canonical.vertices.length);

        expect(carried).toEqual([{startIndex: 0, endIndex: 3, provenance: 'perimeter-access'}]);
    });

    it('leaves the carried run covering the same boundary, compared as geometry', () => {
        const {region, canonical} = canonicaliseRoot();

        const carried = remapRuns(region.runs, canonical.indexRemap, canonical.vertices.length);
        const after = runPolyline(canonical.vertices, carried[0]);

        for (const vertex of region.boundary) {
            expect(distanceToPolyline(vertex, after)).toBeLessThan(SKELETON_NOISE_FLOOR);
        }
    });
});

describe('the pinning rule at its hard case: a lane mouth meeting a frontage tangentially', () => {
    /*
     * Decision 13, and without this test decision 7 is a comment. The vertex where a lane gives way
     * to the frontage beside it deviates by three tenths of the floor — genuinely invisible, and
     * genuinely the place where a road stops being a road.
     */

    /** A unit square whose bottom edge carries a lane mouth 0.3 of the floor off the chord. */
    const LANE_MOUTH: Vector2[] = [
        {x: 0, y: 0},
        {x: 0.5, y: -0.3 * SKELETON_NOISE_FLOOR},
        {x: 1, y: 0},
        {x: 1, y: 1},
        {x: 0, y: 1},
    ];

    /** Edge 0 is the lane; edges 1–4 are the frontage it opens onto. Vertex 1 is the seam. */
    const LANE_RUNS: BoundaryRun[] = [
        {startIndex: 0, endIndex: 0, provenance: 'lane'},
        {startIndex: 1, endIndex: 4, provenance: 'perimeter-access'},
    ];

    it('is genuinely under the floor, which is the premise', () => {
        expect(deviations(LANE_MOUTH)[1]).toBeLessThan(SKELETON_NOISE_FLOOR);
        expect(deviations(LANE_MOUTH)[1]).toBeGreaterThan(0);
        expect(runBoundaryVertexIndices(LANE_RUNS)).toEqual([0, 1]);
    });

    it('loses the seam entirely without the pin, and the run cannot be carried across', () => {
        // The mutation. Unpinned, the stage does exactly what it is for — and takes the boundary
        // between the lane and the frontage with it, which is the failure decision 7 names.
        const unpinned = canonicalisePolygon(LANE_MOUTH, SKELETON_NOISE_FLOOR);

        expect(unpinned.removedCount).toBe(1);
        expect(unpinned.indexRemap[1]).toBe(REMOVED_VERTEX_INDEX);
        expect(() => remapRuns(LANE_RUNS, unpinned.indexRemap, unpinned.vertices.length))
            .toThrow(/removed|pin/i);
    });

    it('keeps the seam when the run boundaries are pinned, and the runs stay distinct', () => {
        const canonical = canonicalisePolygon(
            LANE_MOUTH, SKELETON_NOISE_FLOOR, runBoundaryVertexIndices(LANE_RUNS));

        expect(canonical.removedCount).toBe(0);
        expect(canonical.vertices).toEqual(LANE_MOUTH);
        expect(canonical.pinnedCount).toBe(2);
        expect(canonical.pinnedUnderFloorCount).toBe(1);

        const carried = remapRuns(LANE_RUNS, canonical.indexRemap, canonical.vertices.length);

        expect(carried).toEqual(LANE_RUNS);
        expect(runPolyline(canonical.vertices, carried[0])).toEqual([LANE_MOUTH[0], LANE_MOUTH[1]]);
    });
});

describe('the legacy entry points canonicalise too, silently', () => {
    /*
     * Both legacy entry points gained the stage, and neither has a diagnostics channel to say so —
     * which is exactly why the removal has to be asserted here rather than inferred from the rest
     * of the suite continuing to pass. `solveSkeleton`'s equivalent checks say nothing about these
     * two: a stage wired into one entry point and not the others would leave the stepped visualiser
     * walking a different polygon from the one the solver solved.
     */

    it('runAlgorithmV5 hands back a graph with the invisible vertex gone', () => {
        const context = runAlgorithmV5(withCollinearVertex());

        expect(context.graph.numExteriorNodes).toBe(6);
    });

    it('runAlgorithmV5Stepped walks the canonicalised polygon from its very first snapshot', () => {
        const stepped = runAlgorithmV5Stepped(withCollinearVertex());

        expect(stepped.error).toBeNull();
        expect(stepped.snapshots.length).toBeGreaterThan(0);
        for (const snapshot of stepped.snapshots) {
            expect(snapshot.numExteriorNodes).toBe(6);
        }
    });
});
