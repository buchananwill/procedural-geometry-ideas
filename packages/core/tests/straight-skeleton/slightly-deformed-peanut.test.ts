import {
    NEAR_REGULAR_PEANUT_32,
    SLIGHTLY_DEFORMED_PEANUT_1,
    SLIGHTLY_DEFORMED_PEANUT_2,
} from '@proc-geo/test-fixtures';
import {
    angularResolution,
    intersectRays,
    runAlgorithmV5,
    SKELETON_NOISE_FLOOR,
    solveSkeleton,
    StraightSkeletonSolverContext,
    Vector2,
} from '@proc-geo/core';
import {reachesSupportingLine} from '../../src/straight-skeleton/generate-split-event';
import {escapedNodes} from './containment-helpers';

/*
 * ============================================================================
 *  THE SPLIT AIMED AT THE SPLIT EDGE'S OWN SOURCE VERTEX.
 * ============================================================================
 *
 * `generateSplitEventFromTheEdgeItself` pre-tested whether a reflex bisector reaches the edge it
 * would split by asking `intersectRays` for 'converging' against that edge's FORWARD ray and its
 * REVERSED ray. Both rays start at the edge's source vertex, and 'converging' requires both ray
 * parameters strictly positive, so the pair covered the whole supporting line EXCEPT that one
 * point: a bisector aimed exactly at the split edge's source read 'diverging' in both directions
 * and its split was thrown away before the direct-strike solve, the incenter fallback or
 * `validateSplitReachesEdge` ever ran. The same family as journal F12's `outOfBounds` finding — a
 * legitimate event lost at a boundary the guard did not mean to draw.
 *
 * These two fixtures put a bisector on exactly that ray. Both deform the symmetric peanut's waist
 * (see the fixture file): moving vertex 6 tilts reflex vertex 7's bisector off the vertical, so the
 * two waist spikes stop meeting head-on, and vertex 23's bisector — still running straight up the
 * line x = 300, straight through vertex 7 — becomes the one thing that can close the waist. Losing
 * its split left it nothing to meet, and BOTH SOLVES STILL REPORTED `complete: true` WITH EMPTY
 * DIAGNOSTICS: variant 1 dangled the bisector at (300, 300) as a one-edge leaf, variant 2 marched
 * it out through the top of the polygon to a node 40 units outside a 410-unit shape.
 *
 * The assertions below are therefore three, and all three must hold: the solve completes, every
 * edge is accepted, and no node leaves the polygon. The first two were true while the answer was
 * wrong.
 */

const VARIANTS: [string, Vector2[]][] = [
    ['Slightly Deformed Peanut 1', SLIGHTLY_DEFORMED_PEANUT_1],
    ['Slightly Deformed Peanut 2', SLIGHTLY_DEFORMED_PEANUT_2],
];

function expectCompleteSolve(context: StraightSkeletonSolverContext): void {
    expect(context.acceptedEdges.every(Boolean)).toBe(true);

    const unresolved = context.graph.interiorEdges
        .filter(interior => !interior.culled && context.graph.edges[interior.id].target === undefined)
        .map(interior => interior.id);
    expect(unresolved).toEqual([]);
}

describe('the deformed peanuts are the symmetric fixture with named vertices moved', () => {
    it.each([
        ['variant 1', SLIGHTLY_DEFORMED_PEANUT_1, [6]],
        ['variant 2', SLIGHTLY_DEFORMED_PEANUT_2, [6, 23]],
    ] as [string, Vector2[], number[]][])(
        '%s differs from NEAR_REGULAR_PEANUT_32 at exactly the moved indices',
        (_name, vertices, moved) => {
            // Bit-for-bit on the 31 (or 30) untouched vertices, so the fixtures cannot drift away
            // from the shape they are a deformation OF.
            expect(vertices).toHaveLength(NEAR_REGULAR_PEANUT_32.length);
            const differing = vertices
                .map((vertex, index) => ({vertex, index}))
                .filter(({vertex, index}) =>
                    vertex.x !== NEAR_REGULAR_PEANUT_32[index].x || vertex.y !== NEAR_REGULAR_PEANUT_32[index].y)
                .map(({index}) => index);
            expect(differing).toEqual(moved);
        },
    );

    it('vertex 6 carries the deformation both variants share', () => {
        expect(SLIGHTLY_DEFORMED_PEANUT_1[6]).toEqual({x: 317.34990411859854, y: 189.72050792345877});
        expect(SLIGHTLY_DEFORMED_PEANUT_2[6]).toEqual(SLIGHTLY_DEFORMED_PEANUT_1[6]);
    });

    it('vertex 23 is drawn into the waist in variant 2 alone', () => {
        expect(SLIGHTLY_DEFORMED_PEANUT_1[23]).toEqual({x: 300, y: 395});
        expect(SLIGHTLY_DEFORMED_PEANUT_2[23]).toEqual({x: 300, y: 392.03161135535333});
    });
});

describe('the deformed peanuts solve without losing a bisector', () => {
    describe.each(VARIANTS)('%s', (_name, vertices) => {
        it('solves completely with every edge accepted', () => {
            expectCompleteSolve(runAlgorithmV5(vertices));
        });

        it('reports a complete solve with no diagnostics', () => {
            const result = solveSkeleton(vertices);
            expect(result.diagnostics).toEqual([]);
            expect(result.complete).toBe(true);
        });

        it('keeps every skeleton node inside the polygon', () => {
            expect(escapedNodes(vertices)).toEqual([]);
        });
    });
});

describe('the guard the waist split was lost to', () => {
    /**
     * The geometry, stated without the solver: vertex 23's bisector runs up the line x = 300 and
     * meets exterior edge 7's supporting line AT edge 7's own source, vertex 7. Both of the rays
     * the pre-test builds from that edge start there, so both report a zero parameter and neither
     * reports 'converging' — which is what discarded the split. The relaxed pre-test accepts a
     * zero parameter on the edge's ray as the strike it is.
     */
    it.each(VARIANTS)('%s: the bisector meets edge 7 exactly at its source vertex', (_name, vertices) => {
        const bisector = {sourceVector: vertices[23], basisVector: {x: 0, y: -1}};
        const edgeBasis = {x: vertices[8].x - vertices[7].x, y: vertices[8].y - vertices[7].y};
        const length = Math.hypot(edgeBasis.x, edgeBasis.y);
        const forward = {
            sourceVector: vertices[7],
            basisVector: {x: edgeBasis.x / length, y: edgeBasis.y / length},
        };
        const reversed = {
            sourceVector: vertices[7],
            basisVector: {x: -edgeBasis.x / length, y: -edgeBasis.y / length},
        };

        const [alongBisector, alongEdge, verdict] = intersectRays(bisector, forward, SKELETON_NOISE_FLOOR, angularResolution(SKELETON_NOISE_FLOOR));
        expect(verdict).toBe('diverging');
        // Exactly zero, up to its sign: the strike lands ON the ray's origin, which is what put it
        // outside the strictly-positive band 'converging' requires.
        expect(Math.abs(alongEdge)).toBe(0);
        expect(alongBisector).toBeCloseTo(vertices[23].y - vertices[7].y, 12);
        expect(intersectRays(bisector, reversed, SKELETON_NOISE_FLOOR, angularResolution(SKELETON_NOISE_FLOOR))[2]).toBe('diverging');
    });
});

describe('the strike at the vertex is a DISTANCE at the coaxiality floor (spec A15, journal decision 146)', () => {
    /*
     * "Does this strike land at the split edge's own end?" is positional — a distance along the
     * edge's unit ray to zero — so it is asked in the floor's category: within the client's floor of
     * the vertex IS at the vertex. It was `areEqual(alongEdge, 0)`, the scratch epsilon; a strike
     * 5e-7 from the vertex, inside the floor and fifty epsilons outside the old bar, is the
     * discriminating case.
     */
    it('accepts a forward strike within the floor of the vertex, on either side of it', () => {
        for (const alongEdge of [0, 5e-9, 5e-7, -5e-7, SKELETON_NOISE_FLOOR, -SKELETON_NOISE_FLOOR]) {
            expect(reachesSupportingLine([0.5, alongEdge, 'diverging'], SKELETON_NOISE_FLOOR)).toBe(true);
        }
    });

    it('refuses one outside the floor, and one that is not travelling forward', () => {
        expect(reachesSupportingLine([0.5, 2e-6, 'diverging'], SKELETON_NOISE_FLOOR)).toBe(false);
        expect(reachesSupportingLine([-0.5, 5e-7, 'diverging'], SKELETON_NOISE_FLOOR)).toBe(false);
    });

    it('moves with the client floor rather than freezing it', () => {
        expect(reachesSupportingLine([0.5, 5e-6, 'diverging'], 1e-5)).toBe(true);
        expect(reachesSupportingLine([0.5, 5e-6, 'diverging'], SKELETON_NOISE_FLOOR)).toBe(false);
    });
});
