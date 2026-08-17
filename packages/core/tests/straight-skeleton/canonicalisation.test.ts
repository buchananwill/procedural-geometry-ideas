import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    CanonicalPolygon,
    canonicalisePolygon,
    FLOATING_POINT_EPSILON,
    makeSkeletonNormalisation,
    normalisePolygon,
    SKELETON_NOISE_FLOOR,
    setSkeletonLogLevel,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';

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

/** Perpendicular deviation of each ring vertex from the chord between its immediate neighbours. */
function deviations(ring: readonly Vector2[]): number[] {
    return ring.map((vertex, index) => {
        const previous = ring[(index - 1 + ring.length) % ring.length];
        const next = ring[(index + 1) % ring.length];
        const dx = next.x - previous.x;
        const dy = next.y - previous.y;
        const lengthSquared = dx * dx + dy * dy;
        const raw = lengthSquared === 0
            ? 0
            : ((vertex.x - previous.x) * dx + (vertex.y - previous.y) * dy) / lengthSquared;
        const t = Math.max(0, Math.min(1, raw));
        return Math.hypot(vertex.x - (previous.x + dx * t), vertex.y - (previous.y + dy * t));
    });
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

    /** Every `ALL_TEST_POLYGONS` fixture the ruled floor removes a vertex from. Exactly one. */
    const CANONICALISED_FIXTURES = ['Long Unbroken Side Then Extreme Acute Angle'];

    /** What the stage does to one fixture, in unit space, where the floor lives. */
    function canonicaliseFixture(vertices: Vector2[], floor: number): CanonicalPolygon {
        const normalisation = makeSkeletonNormalisation(vertices);
        return canonicalisePolygon(normalisePolygon(vertices, normalisation), floor);
    }

    it('touches exactly one of the 37 fixtures, and removes exactly one vertex from it', () => {
        const touched = ALL_TEST_POLYGONS
            .filter(fixture => canonicaliseFixture(fixture.vertices, SKELETON_NOISE_FLOOR).removedCount > 0)
            .map(fixture => fixture.name);

        expect(touched).toEqual(CANONICALISED_FIXTURES);

        const fixture = ALL_TEST_POLYGONS.find(p => p.name === CANONICALISED_FIXTURES[0])!;
        const canonical = canonicaliseFixture(fixture.vertices, SKELETON_NOISE_FLOOR);
        expect(fixture.vertices).toHaveLength(32);
        expect(canonical.vertices).toHaveLength(31);
        // An exactly-collinear vertex, at the noise floor of the arithmetic rather than of the eye.
        expect(canonical.maxDeviation).toBeLessThan(1e-16);
    });

    it('is insensitive across four decades, and the sweep says where that stops', () => {
        // The measured sweep, as an assertion rather than a note. Between 1e-12 and 1e-4 the corpus
        // does not move at all: the single vertex above is the only one anywhere below 1e-3, and it
        // goes at any non-zero floor. THE CORPUS IS NOT WHAT BINDS THE FLOOR — the recursive
        // subdivision arc is, and its per-level tiling identity fails above 3e-6. See
        // `canonicalisation.ts` for why that band is narrow rather than a plateau.
        const touchedAt = (floor: number): number => ALL_TEST_POLYGONS
            .filter(fixture => canonicaliseFixture(fixture.vertices, floor).removedCount > 0).length;

        for (const floor of [1e-12, 1e-10, 1e-8, 1e-7, SKELETON_NOISE_FLOOR, 3e-6, 1e-5, 1e-4]) {
            expect(touchedAt(floor)).toBe(1);
        }

        // And the direction decision 18 exists to catch. At 1e-2 the floor is eating real geometry
        // from over a quarter of the corpus, which is what "too high" looks like from here.
        expect(touchedAt(1e-3)).toBe(2);
        expect(touchedAt(1e-2)).toBe(10);
    });

    it('leaves every fixture solving completely, at the ruled floor and either side of it', () => {
        const problems: string[] = [];
        for (const floor of [0, SKELETON_NOISE_FLOOR, 3e-6]) {
            for (const fixture of ALL_TEST_POLYGONS) {
                if (!solveSkeleton(fixture.vertices, {noiseFloor: floor}).complete) {
                    problems.push(`${fixture.name} @ floor ${floor}`);
                }
            }
        }
        expect(problems.join('; ')).toBe('');
    });
});

describe('canonicalisation is reported, never silent', () => {
    /** A 300-unit L with an exactly collinear vertex inserted on its longest edge. */
    function withCollinearVertex(): Vector2[] {
        return [
            {x: 100, y: 100}, {x: 100, y: 250}, {x: 100, y: 400}, {x: 250, y: 400},
            {x: 250, y: 250}, {x: 400, y: 250}, {x: 400, y: 100},
        ];
    }

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
