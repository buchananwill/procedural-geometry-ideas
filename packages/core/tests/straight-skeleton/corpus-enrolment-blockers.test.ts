import {
    buildSkeletonTree,
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    denormalisePosition,
    makeSkeletonNormalisation,
    normalisePolygon,
    setSkeletonLogLevel,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';
import {
    NEAR_REGULAR_ELLIPSE_16,
    NEAR_REGULAR_ELLIPSE_32,
    NEAR_REGULAR_PEANUT_32,
    SHORT_EDGE_PROMONTORY,
} from '@proc-geo/test-fixtures';
import {place} from './placement-helpers';

/*
 * ============================================================================
 *  FOUR RECORDED DEFECTS, PINNED AS THEY STAND. Read this before "fixing" a failure here.
 * ============================================================================
 *
 * Four fixtures that are otherwise ready for `ALL_TEST_POLYGONS` and are held out of it by one
 * sweeping assertion each. Journal decision 53 allows an exclusion only as a visible, pinned
 * characterisation of a defect awaiting its fix, and this file is that pin: it asserts the CURRENT
 * FAILING BEHAVIOUR, exactly, and fires in both directions. When a block here starts passing,
 * promote its fixture and delete the block; when a block worsens, something regressed.
 *
 * NONE OF THESE IS THE BLOCKER ITS FIXTURE HEADER WAS WRITTEN AGAINST. Those — the
 * translation-to-1e9 envelope and the many-way-event offset projection — were re-measured dead on
 * 2026-08-27 (journal F14). These four were found by running the sweeps that measurement did not
 * cover: the scale sweeps.
 *
 * ----------------------------------------------------------------------------
 * BLOCKER 1 — THE BIT-EXACT NORMALISATION ROUND TRIP (`SHORT_EDGE_PROMONTORY`,
 * `NEAR_REGULAR_PEANUT_32`)
 * ----------------------------------------------------------------------------
 *
 * `normalisation.test.ts` measures, over `ALL_TEST_POLYGONS`, which cells of the placement envelope
 * return every coordinate bit-for-bit through `normalisePolygon` and back. It records five exact
 * scale cells of eight and pins the achieved error in the other three. Both fixtures below break
 * bit-exactness in the same four cells — scales 1e-2, 1e2, 1e6 and 1e8 — so enrolling either moves
 * four cells out of that suite's exact list.
 *
 * The error is in the CENTRING SUBTRACTION, never the scaling: `p - c` for a polygon sitting at its
 * own centroid is outside Sterbenz range, so it rounds, and decision 4 of the normalisation brief
 * declines to claim exactness there. The exactness of those four cells was a property of the
 * corpus, not of the transform. `SHORT_EDGE_PROMONTORY` additionally crosses that suite's designed
 * sub-ulp bar: its worst error relative to the coordinate reaches 3.47e-16, above
 * `Number.EPSILON`, because the offending coordinate sits near the polygon's centre and is small
 * beside the polygon's extent. `NEAR_REGULAR_PEANUT_32` stays under that bar throughout.
 *
 * WHAT A FIX LOOKS LIKE is a ruling, not a code change: either the centring is made exact in these
 * cells, or `normalisation.test.ts` re-measures its table over the grown corpus and states the
 * error bar against the polygon's EXTENT rather than against the coordinate. Neither is decided
 * here, which is exactly why these two are pinned instead of promoted.
 *
 * ----------------------------------------------------------------------------
 * BLOCKER 2 — SCALE-DEPENDENT INTERIOR NODE NUMBERING (`NEAR_REGULAR_ELLIPSE_16`,
 * `NEAR_REGULAR_ELLIPSE_32`)
 * ----------------------------------------------------------------------------
 *
 * `skeleton-tree.test.ts` asserts that scaling a polygon by 7 leaves the tree's STRUCTURE — its
 * node ids and the edges between them — untouched while every length and offset scales by 7. On
 * these two, the geometry is invariant to the last bit and the LABELLING is not: the two interior
 * nodes of a mirror pair swap ids between scale 1 and scale 7. The ellipse is exactly
 * mirror-symmetric about both axes, so the two events are simultaneous, and which member of the
 * simultaneous set is created first turns on an ulp of the scaled coordinates.
 *
 * That is the same class the scale sweep's own comment already records for the square's diameter
 * endpoints, promoted from a tie-break to a structural difference by the density of the fixture.
 * The circles do not show it — `NEAR_REGULAR_CIRCLE_16` and `NEAR_REGULAR_CIRCLE_32` were promoted
 * on 2026-08-27 — because a regular n-gon resolves to a single interior node with nothing to swap.
 *
 * A FIX IS SOLVER-SIDE: node ids assigned from a canonical ordering of a simultaneous set rather
 * than from creation order. Until then the tests below pin the labelling as scale-dependent and
 * the geometry as scale-invariant, so a regression in the second cannot hide behind the first.
 */

setSkeletonLogLevel('silent');

const ROUND_TRIP_BLOCKED_SCALES = [1e-2, 1e2, 1e6, 1e8];
const TRANSLATIONS = [1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11];
const SCALE_FACTOR = 7;
const GEOMETRIC_TOLERANCE = 1e-9;

interface RoundTripMeasurement {
    inexact: number;
    /** Largest error over the inexact coordinates, relative to the coordinate. */
    worstRelativeError: number;
    /** The same errors measured against the polygon's longest bounding-box side. */
    worstExtentError: number;
}

/**
 * Replicated from `normalisation.test.ts`, narrowed to one fixture. Copied rather than shared so
 * that a change to the enrolment suite's own bookkeeping cannot silently redefine what is pinned
 * here.
 */
function measureRoundTrip(vertices: Vector2[], scale: number): RoundTripMeasurement {
    const placed = place(vertices, scale, 0);
    const normalisation = makeSkeletonNormalisation(placed);
    const returned = normalisePolygon(placed, normalisation)
        .map(vertex => denormalisePosition(normalisation, vertex));
    const extent = Math.max(
        Math.max(...placed.map(vertex => vertex.x)) - Math.min(...placed.map(vertex => vertex.x)),
        Math.max(...placed.map(vertex => vertex.y)) - Math.min(...placed.map(vertex => vertex.y)));

    let inexact = 0;
    let worstRelativeError = 0;
    let worstExtentError = 0;
    placed.forEach((vertex, index) => {
        for (const axis of ['x', 'y'] as const) {
            if (Object.is(vertex[axis], returned[index][axis])) {
                continue;
            }
            inexact++;
            const error = Math.abs(returned[index][axis] - vertex[axis]);
            const magnitude = Math.abs(vertex[axis]);
            worstRelativeError = Math.max(worstRelativeError, magnitude === 0 ? error : error / magnitude);
            worstExtentError = Math.max(worstExtentError, error / extent);
        }
    });
    return {inexact, worstRelativeError, worstExtentError};
}

/** Replicated from `large-coordinate-failures.test.ts`, so the pins state what is NOT broken. */
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

const ROUND_TRIP_BLOCKED: readonly (readonly [string, Vector2[]])[] = [
    ['SHORT_EDGE_PROMONTORY', SHORT_EDGE_PROMONTORY],
    ['NEAR_REGULAR_PEANUT_32', NEAR_REGULAR_PEANUT_32],
];

describe('blocker 1: the bit-exact normalisation round trip', () => {
    it.each(ROUND_TRIP_BLOCKED)(
        '%s survives the whole large-coordinate envelope, which is NOT what holds it out',
        (_name, vertices) => {
            expect(survives(vertices, 1, 0)).toBe(true);
            for (const translate of TRANSLATIONS) {
                expect(survives(vertices, 1, translate)).toBe(true);
            }
            for (const scale of [1e-6, 1e-4, 1e-2, 1e2, 1e4, 1e6, 1e8]) {
                expect(survives(vertices, scale, 0)).toBe(true);
            }
        },
    );

    it.each(ROUND_TRIP_BLOCKED)('%s DOES round-trip on the bit at scale 1 and at every translation',
        (_name, vertices) => {
            expect(measureRoundTrip(vertices, 1).inexact).toBe(0);
            for (const translate of [0, ...TRANSLATIONS]) {
                const placed = place(vertices, 1, translate);
                const normalisation = makeSkeletonNormalisation(placed);
                const returned = normalisePolygon(placed, normalisation)
                    .map(vertex => denormalisePosition(normalisation, vertex));
                placed.forEach((vertex, index) => {
                    expect(Object.is(vertex.x, returned[index].x)).toBe(true);
                    expect(Object.is(vertex.y, returned[index].y)).toBe(true);
                });
            }
        });

    it.each(ROUND_TRIP_BLOCKED)('%s does NOT round-trip at scales 1e-2, 1e2, 1e6 and 1e8',
        (_name, vertices) => {
            // The four cells `normalisation.test.ts` still lists as exact over the corpus. Enrolling
            // either fixture moves all four.
            for (const scale of ROUND_TRIP_BLOCKED_SCALES) {
                expect(measureRoundTrip(vertices, scale).inexact).toBeGreaterThan(0);
            }
        });

    it.each(ROUND_TRIP_BLOCKED)('%s rounds by at most half an ulp OF THE EXTENT, everywhere',
        (_name, vertices) => {
            // The error is the centring subtraction and nothing else, so it is bounded by the
            // representation of the span rather than of the coordinate. A fix that made the round
            // trip exact keeps this passing; a fix that traded exactness for magnitude breaks it.
            for (const scale of [1e-6, 1e-4, 1e-2, 1, 1e2, 1e4, 1e6, 1e8]) {
                expect(measureRoundTrip(vertices, scale).worstExtentError).toBeLessThan(Number.EPSILON);
            }
        });

    it('SHORT_EDGE_PROMONTORY crosses the sub-ulp relative bar at scales 1e-2 and 1e2', () => {
        // This is the one measured fact that separates the two fixtures, and the reason a promotion
        // cannot be settled by re-measuring counts alone: `normalisation.test.ts` asserts
        // `worstError < Number.EPSILON` against the COORDINATE, and this fixture's offending
        // coordinates sit near its centre, small beside its extent.
        expect(measureRoundTrip(SHORT_EDGE_PROMONTORY, 1e-2).worstRelativeError)
            .toBeGreaterThan(Number.EPSILON);
        expect(measureRoundTrip(SHORT_EDGE_PROMONTORY, 1e2).worstRelativeError)
            .toBeGreaterThan(Number.EPSILON);
    });

    it('NEAR_REGULAR_PEANUT_32 stays under that bar in every cell', () => {
        for (const scale of [1e-6, 1e-4, 1e-2, 1, 1e2, 1e4, 1e6, 1e8]) {
            expect(measureRoundTrip(NEAR_REGULAR_PEANUT_32, scale).worstRelativeError)
                .toBeLessThan(Number.EPSILON);
        }
    });
});

const MIRROR_LABELLED: readonly (readonly [string, Vector2[]])[] = [
    ['NEAR_REGULAR_ELLIPSE_16', NEAR_REGULAR_ELLIPSE_16],
    ['NEAR_REGULAR_ELLIPSE_32', NEAR_REGULAR_ELLIPSE_32],
];

function edgeKeys(vertices: Vector2[], scale: number): string[] {
    return buildSkeletonTree(solveSkeleton(place(vertices, scale, 0)))
        .edges.map(edge => `${edge.a}-${edge.b}`).sort();
}

/** Every node position, scaled back to native and sorted, so labelling cannot affect the list. */
function sortedPositions(vertices: Vector2[], scale: number): string[] {
    const result = solveSkeleton(place(vertices, scale, 0));
    const tree = buildSkeletonTree(result);
    return tree.nodeIds
        .map(id => result.graph.nodes[id].position)
        .map(position => `${(position.x / scale).toFixed(9)},${(position.y / scale).toFixed(9)}`)
        .sort();
}

describe('blocker 2: scale-dependent interior node numbering', () => {
    it.each(MIRROR_LABELLED)('%s keeps its GEOMETRY bit-stable under a scale of 7', (_name, vertices) => {
        expect(sortedPositions(vertices, SCALE_FACTOR)).toEqual(sortedPositions(vertices, 1));

        const base = buildSkeletonTree(solveSkeleton(vertices));
        const scaled = buildSkeletonTree(solveSkeleton(place(vertices, SCALE_FACTOR, 0)));
        expect(scaled.nodeIds).toEqual(base.nodeIds);

        const lengths = (tree: typeof base, divisor: number) =>
            tree.edges.map(edge => (edge.length / divisor).toFixed(9)).sort();
        expect(lengths(scaled, SCALE_FACTOR)).toEqual(lengths(base, 1));
    });

    it.each(MIRROR_LABELLED)('%s does NOT keep its node LABELLING under a scale of 7', (_name, vertices) => {
        // What `skeleton-tree.test.ts` asserts over the corpus, and what these two break.
        expect(edgeKeys(vertices, SCALE_FACTOR)).not.toEqual(edgeKeys(vertices, 1));
    });

    it('swaps exactly one mirror pair of node ids on NEAR_REGULAR_ELLIPSE_16', () => {
        // Named down to the ids, so a change in HOW the labelling differs is not read as the same
        // defect. Nodes 16 and 17 are the two ridge ends on the major axis.
        const base = solveSkeleton(NEAR_REGULAR_ELLIPSE_16);
        const scaled = solveSkeleton(place(NEAR_REGULAR_ELLIPSE_16, SCALE_FACTOR, 0));
        const at = (result: typeof base, id: number, divisor: number) => ({
            x: result.graph.nodes[id].position.x / divisor,
            y: result.graph.nodes[id].position.y / divisor,
        });

        expect(at(base, 16, 1).x).toBeCloseTo(at(scaled, 17, SCALE_FACTOR).x, 9);
        expect(at(base, 17, 1).x).toBeCloseTo(at(scaled, 16, SCALE_FACTOR).x, 9);
        expect(Math.abs(at(base, 16, 1).x - at(base, 17, 1).x)).toBeGreaterThan(GEOMETRIC_TOLERANCE);
    });
});
