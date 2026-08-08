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
 *  THE DEFECT THIS FILE RECORDED IS FIXED. THESE ASSERTIONS ARE NOW A
 *  SPECIFICATION AND MUST NOT BE WEAKENED TO MAKE A CHANGE PASS.
 * ============================================================================
 *
 * WHAT THIS FILE GUARDS
 *
 * That `solveSkeleton` resolves symmetric, near-regular, densely sampled polygons — the
 * inputs where many collision events land on one point at one offset. These are the hardest
 * shapes in the corpus for exactly that reason: a regular n-gon puts all n bisectors on the
 * centre simultaneously, and nothing else in the fixture set exercises a vertex event of
 * multiplicity greater than three.
 *
 * ----------------------------------------------------------------------------
 * WHAT WAS WRONG, AND WHAT FIXED IT
 * ----------------------------------------------------------------------------
 *
 * The solver already gathered each offset layer — every collision within `FLOATING_POINT_EPSILON`
 * of the nearest one — but then handed the layer's events to `handleCollisionEvent` one at a
 * time, and that function only knows how to resolve a *pair*. When k bisectors arrive at one
 * point, the O(k^2) collisions they report all describe the same physical event; processing
 * them pairwise consumed the first two, marked the rest as already-accepted, and emitted a
 * spurious bisector from the shared node for each pair it happened to form. On a regular
 * octagon that turned a single eight-way vertex event into four collapses and left two
 * exterior edges neither accepted nor bisectable.
 *
 * Fixed in `coincident-events.ts` and `handleInteriorNGon`: the layer's interior-to-interior
 * collisions are grouped by collision *point*, and each group is resolved whole. Every arrival
 * terminates on one node; the participants are then removed from the wavefront ring, and one
 * bisector is emitted per surviving arc — none when the group is the whole ring, one for a
 * collapse, one per sub-polygon for a partition. Pairwise collapse and non-adjacent split are
 * the two- and two-singleton cases of that same rule, so nothing else changed shape.
 *
 * Three smaller faults surfaced behind it and are fixed with it:
 *
 *   - `ensureBisectionIsInterior` flipped a bisector whenever `cross(cw, ws) < 0`. At a
 *     collinear vertex that cross is zero and its sign is noise, so the same straight vertex
 *     bisected inward near the origin and outward once translated. A turn indistinguishable
 *     from zero is now treated as no turn.
 *   - `tryAttachEdgeToNode` snapped an edge to the first node collinear with its ray rather
 *     than the nearest, so Pentagon House's ridge wired itself to the roof apex behind it.
 *   - `collideInteriorEdges` took `intersectRays`' head-on answer literally. That answer is the
 *     full separation along both rays — each ray reaching the other's *source* — which is twice
 *     the event and lands the collision on an existing node. They now meet where their offsets
 *     agree.
 *
 * ----------------------------------------------------------------------------
 * MEASURED AFTER THE FIX — centre (300, 300), radius 150, swept n = 3..64
 * ----------------------------------------------------------------------------
 *
 *     regular circle, r = 150                        62 / 62 complete
 *     ellipse, x = 150 cos t, y = 100 sin t          62 / 62 complete
 *
 * Before the fix the circle completed only at n = 3, 4 and 6, and the ellipse at a scattered
 * sixteen of the sixty-two. The sweep is asserted in full below; it is no longer sensitive to
 * the last bits of the mantissa, so there is nothing left to hedge about.
 *
 * ----------------------------------------------------------------------------
 * WHY THESE FIXTURES ARE STILL OUT OF `ALL_TEST_POLYGONS`
 * ----------------------------------------------------------------------------
 *
 * Solving is not the only thing that list asserts. Promoting all seven was tried and measured:
 * every one solves, but three suites fail on them for reasons downstream of the solver.
 *
 *   - `offset-event-boundary-regression.test.ts` — at the exact offset of a terminal many-way
 *     event the wavefront ring passes through the single node that event created, and
 *     `projectOffsetWavefront` cannot close it. This is pre-existing and not caused by the
 *     fix: `NEAR_REGULAR_ELLIPSE_16`, which solved before the fix as well as after, reports
 *     the identical unclosed chain at 72.361834 on both sides of the change. It is the same
 *     class as the Pentagon House exception that file already documents.
 *   - `wavefront-causality.test.ts` and `strip-decomposition.test.ts` — `NEAR_REGULAR_PEANUT_32`
 *     solves completely, but one interior edge of its skeleton still runs backwards in time,
 *     and its strips do not tile.
 *   - `large-coordinate-failures.test.ts` — these are 300-unit shapes, so they leave the
 *     translation envelope earlier than the corpus's smaller fixtures.
 *
 * Promote them once the projection closes a terminal many-way event and the peanut's skeleton
 * is causal.
 */

setSkeletonLogLevel('silent');

/** Regular n-gon of radius 150 about (300, 300), wound clockwise. */
function regularPolygon(n: number): Vector2[] {
    const vertices: Vector2[] = [];
    for (let i = 0; i < n; i++) {
        const theta = (2 * Math.PI * i) / n;
        vertices.push({x: 300 + 150 * Math.cos(theta), y: 300 + 150 * Math.sin(theta)});
    }
    return isClockwise(vertices) ? vertices : vertices.reverse();
}

/** Ellipse of the same density, wound clockwise: two mirror axes but no rotational symmetry. */
function ellipsePolygon(n: number): Vector2[] {
    const vertices: Vector2[] = [];
    for (let i = 0; i < n; i++) {
        const theta = (2 * Math.PI * i) / n;
        vertices.push({x: 300 + 150 * Math.cos(theta), y: 300 + 100 * Math.sin(theta)});
    }
    return isClockwise(vertices) ? vertices : vertices.reverse();
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

const FIXTURES: [string, Vector2[], number][] = [
    ['circle-16', NEAR_REGULAR_CIRCLE_16, 16],
    ['circle-32', NEAR_REGULAR_CIRCLE_32, 32],
    ['circle-48', NEAR_REGULAR_CIRCLE_48, 48],
    ['ellipse-16', NEAR_REGULAR_ELLIPSE_16, 16],
    ['ellipse-32', NEAR_REGULAR_ELLIPSE_32, 32],
    ['peanut-32', NEAR_REGULAR_PEANUT_32, 32],
    ['rosette5-40', NEAR_REGULAR_ROSETTE5_40, 40],
];

describe('near-regular polygons', () => {
    describe('fixtures are well-formed input', () => {
        it.each(FIXTURES)('%s is a clockwise simple polygon of the stated density', (_name, vertices, expectedCount) => {
            expect(vertices).toHaveLength(expectedCount);
            expect(isClockwise(vertices)).toBe(true);

            const kinds = solveSkeleton(vertices).diagnostics.map(diagnostic => diagnostic.kind);
            expect(kinds).not.toContain('winding-normalised');
            expect(kinds).not.toContain('self-intersecting');
        });
    });

    describe('every fixture solves completely', () => {
        it.each(FIXTURES)('%s', (_name, vertices) => {
            const result = solveSkeleton(vertices);

            expect(result.diagnostics).toEqual([]);
            expect(result.complete).toBe(true);
        });
    });

    describe('vertex-count sweep, n = 3..64', () => {
        const counts = Array.from({length: 62}, (_unused, index) => index + 3);

        it('solves the regular circle at every vertex count', () => {
            const failed = counts.filter(n => !solveSkeleton(regularPolygon(n)).complete);

            expect(failed).toEqual([]);
        });

        it('solves the ellipse at every vertex count', () => {
            const failed = counts.filter(n => !solveSkeleton(ellipsePolygon(n)).complete);

            expect(failed).toEqual([]);
        });
    });

    describe('absolute position does not decide the outcome', () => {
        // The defect was position-sensitive: circle-16 solved about (400, 300) and failed about
        // (300, 300), because the sign of a near-zero cross product moved with the coordinates.
        it.each([0, 100, 1000, 10000])('solves the regular 16-gon translated by %p', translate => {
            const moved = regularPolygon(16).map(vertex => ({x: vertex.x + translate, y: vertex.y + translate}));

            expect(solveSkeleton(moved).complete).toBe(true);
        });
    });

    describe('jitter — perturbing away from exact symmetry changes nothing', () => {
        // Before the fix these were the rescue: a displacement of 1.5e-7 on a radius of 150 was
        // enough to separate the tied events and turn every failing run into a complete solve.
        // Exact symmetry now solves too, so the whole ladder must come out the same.
        it('solves the exactly symmetric 32-vertex circle', () => {
            expect(solveSkeleton(NEAR_REGULAR_CIRCLE_32).complete).toBe(true);
        });

        it.each([1, 2, 3, 4, 5])('solves it jittered by 1%% of the radius (seed %i)', seed => {
            expect(solveSkeleton(jitter(NEAR_REGULAR_CIRCLE_32, 1.5, seed)).complete).toBe(true);
        });

        it.each([1, 2, 3, 4, 5])('solves it jittered by 0.1%% of the radius (seed %i)', seed => {
            expect(solveSkeleton(jitter(NEAR_REGULAR_CIRCLE_32, 0.15, seed)).complete).toBe(true);
        });

        it.each([1, 2, 3, 4, 5])('solves it jittered barely above FLOATING_POINT_EPSILON (seed %i)', seed => {
            expect(solveSkeleton(jitter(NEAR_REGULAR_CIRCLE_32, 1.5e-7, seed)).complete).toBe(true);
        });
    });
});
