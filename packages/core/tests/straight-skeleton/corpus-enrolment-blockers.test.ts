import {
    buildSkeletonTree,
    setSkeletonLogLevel,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';
import {
    NEAR_REGULAR_ELLIPSE_16,
    NEAR_REGULAR_ELLIPSE_32,
} from '@proc-geo/test-fixtures';
import {place} from './placement-helpers';

/*
 * ============================================================================
 *  ONE RECORDED DEFECT, PINNED AS IT STANDS. Read this before "fixing" a failure here.
 * ============================================================================
 *
 * Two fixtures that are otherwise ready for `ALL_TEST_POLYGONS` and are held out of it by one
 * sweeping assertion each. Journal decision 53 allows an exclusion only as a visible, pinned
 * characterisation of a defect awaiting its fix, and this file is that pin: it asserts the CURRENT
 * FAILING BEHAVIOUR, exactly, and fires in both directions. When a block here starts passing,
 * promote its fixture and delete the block; when a block worsens, something regressed.
 *
 * THIS IS NOT THE BLOCKER ITS FIXTURE HEADER WAS WRITTEN AGAINST. Those — the translation-to-1e9
 * envelope and the many-way-event offset projection — were re-measured dead on 2026-08-27
 * (journal F14). This one was found by running the sweep that measurement did not cover: the
 * scale sweep.
 *
 * A SECOND BLOCKER STOOD HERE AND IS GONE, 2026-08-27. It held `SHORT_EDGE_PROMONTORY` and
 * `NEAR_REGULAR_PEANUT_32` out on the bit-exact normalisation round trip, and journal decision 64
 * resolved it as a ruling rather than a code change: the exact-cell table in
 * `normalisation.test.ts` is a MEASURED RECORD of which placements this corpus happens to
 * round-trip bit-exactly in the CENTRING subtraction, not a designed invariant, and the designed
 * invariant — exactness in the SCALING everywhere — was never in question. That table was
 * re-measured over the grown corpus with the moved cells attributed per fixture, its sub-ulp bar
 * restated against the polygon's EXTENT rather than against the coordinate, and both fixtures were
 * promoted. Their drift was sub-ulp of extent throughout: worst 3.01e-17 relative to extent for
 * the promontory, and the peanut under `Number.EPSILON` on both measures in every cell.
 *
 * ----------------------------------------------------------------------------
 * SCALE-DEPENDENT INTERIOR NODE NUMBERING (`NEAR_REGULAR_ELLIPSE_16`, `NEAR_REGULAR_ELLIPSE_32`)
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

const SCALE_FACTOR = 7;
const GEOMETRIC_TOLERANCE = 1e-9;

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

describe('scale-dependent interior node numbering', () => {
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
