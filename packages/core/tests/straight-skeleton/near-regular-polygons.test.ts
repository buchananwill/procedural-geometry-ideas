import {
    NEAR_REGULAR_CIRCLE_16,
    NEAR_REGULAR_CIRCLE_32,
    NEAR_REGULAR_CIRCLE_48,
    NEAR_REGULAR_ELLIPSE_16,
    NEAR_REGULAR_ELLIPSE_32,
    NEAR_REGULAR_PEANUT_32,
    NEAR_REGULAR_ROSETTE5_40,
} from '@proc-geo/test-fixtures';
import {
    FLOATING_POINT_EPSILON,
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    isClockwise,
    setSkeletonLogLevel,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';

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
 * Four smaller faults surfaced behind it and are fixed with it:
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
 *   - `bisectionsForMerge` handed every newly born bisector an `approximateDirection` of
 *     `makeBisectedBasis(lastArrival, firstDeparture)`, and `addBisectionEdge` flips the
 *     parent-derived basis whenever the two disagree. At a waist pinch the two arrivals are
 *     exactly anti-parallel, so that call summed them to zero, took its degenerate branch, and
 *     returned `rotateCw90` of whichever argument came first — a perpendicular chosen by
 *     rotation convention alone. Both bisectors born at the peanut's neck were inverted by it.
 *     Anti-parallel arrivals now supply no hint at all and the parent derivation stands.
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
 * FIVE OF THE SEVEN ARE NOW IN `ALL_TEST_POLYGONS` — re-recorded 2026-08-28
 * ----------------------------------------------------------------------------
 *
 * Solving is not the only thing that list asserts, and this section used to record two sweeps that
 * between them blocked six of the seven. BOTH OF THOSE BLOCKERS ARE DEAD AS STATED, re-measured
 * 2026-08-27 (journal F14): the many-way-event offset projection no longer reproduces on any of
 * the four fixtures it named — the simultaneous-mirror-event work closed it, and
 * `near-regular-ring-loss-diagnosis.test.ts` carries the diagnosis and the guarantee — and unit-
 * extent normalisation carries all seven through the translation envelope out to 1e9, so being
 * 300-unit shapes no longer costs them anything.
 *
 * Promoted since: `NEAR_REGULAR_CIRCLE_16` and `NEAR_REGULAR_CIRCLE_32` on 2026-08-27,
 * `NEAR_REGULAR_PEANUT_32` the same day under journal decision 64, and `NEAR_REGULAR_ELLIPSE_16`
 * and `NEAR_REGULAR_ELLIPSE_32` on 2026-08-28 under decision 65 — the last two held out on node
 * LABELLING rather than geometry, until simultaneous events stopped being numbered in arrival
 * order. Each promotion moved the pinned counts in `offset-event-boundary-regression.test.ts`,
 * `skeleton-tree.test.ts` and `canonicalisation.test.ts`, attributed per fixture at each pin.
 *
 * The two still out are `NEAR_REGULAR_CIRCLE_48` (translation 1e10 only, non-monotonically) and
 * `NEAR_REGULAR_ROSETTE5_40` (1e11 only), each pinned as a failing test in
 * `large-coordinate-known-failures.test.ts` rather than asserted in prose here.
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

/** Shoelace area of a closed ring, sign discarded. */
function signedRingArea(ring: Vector2[]): number {
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
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

        /**
         * The peanut's waist, named because it is the only place in the corpus where two
         * arrivals annihilate exactly anti-parallel and the bisector born from them therefore
         * has no usable direction hint.
         *
         * The waist closes at (300, 300) at offset 94.35, when e39 (basis (0, +1)) and e55
         * (basis (0, -1)) meet, and the event emits one bisector per lobe: e64 bounded by the
         * two left-hand neck edges 7 and 22, and e65 bounded by the two right-hand ones 6 and
         * 23. Both used to come out inverted, because `bisectionsForMerge` handed each an
         * `approximateDirection` of `makeBisectedBasis(arrival1, arrival2)` — which for exactly
         * anti-parallel arrivals is `rotateCw90` of whichever argument came first, a
         * perpendicular chosen by rotation convention with no reference to which lobe the new
         * bisector belongs to. `addBisectionEdge` then flipped the correct parent-derived basis
         * on the strength of it.
         *
         * This asserts the bases directly rather than only that the solve completes, because
         * the completeness assertion above would also pass on a skeleton that got there some
         * other way. Each bisector must run into the lobe whose two neck edges bound it.
         */
        it('peanut-32: the waist bisectors run into their own lobes', () => {
            const {graph} = solveSkeleton(NEAR_REGULAR_PEANUT_32);

            const byParents = (clockwise: number, widdershins: number) => {
                const interior = graph.interiorEdges.find(edge =>
                    edge.clockwiseExteriorEdgeIndex === clockwise
                    && edge.widdershinsExteriorEdgeIndex === widdershins
                    && graph.edges[edge.id].source === 32);
                expect(interior).toBeDefined();
                return graph.edges[interior!.id];
            };

            // Parents 7 and 22 are the left-hand neck edges, so this one must run left.
            expect(byParents(7, 22).basisVector.x).toBeCloseTo(-1, 9);
            // Parents 23 and 6 are the right-hand ones, so this one must run right.
            expect(byParents(23, 6).basisVector.x).toBeCloseTo(1, 9);

            // And both terminate on the node the opposite side of their own lobe's neck.
            for (const [clockwise, widdershins] of [[7, 22], [23, 6]] as const) {
                const edge = byParents(clockwise, widdershins);
                expect(edge.target).toBeDefined();
                const travel = graph.nodes[edge.target!].position.x - graph.nodes[edge.source].position.x;
                expect(travel * edge.basisVector.x).toBeGreaterThan(0);
            }
        });

        /**
         * `strip-decomposition.test.ts` sweeps `ALL_TEST_POLYGONS` and so cannot see the peanut,
         * and while the waist was unresolved `computeStrips` refused the solve outright. The
         * peanut is the corpus's only two-lobed shape, so its tiling is worth one assertion here
         * until it is promoted: the strips plus the offset rings must account for the polygon
         * exactly, which is the same load-bearing identity that file asserts, at the same
         * tolerance. Measured worst case across these depths is 3.1e-15 of the polygon area.
         */
        it('peanut-32: strips plus offset rings tile the polygon', () => {
            const result = solveSkeleton(NEAR_REGULAR_PEANUT_32);
            const maxOffset = computeMaxOffset(result);
            const boundary = result.graph.nodes
                .slice(0, result.graph.numExteriorNodes)
                .map(node => node.position);
            const polygonArea = Math.abs(signedRingArea(boundary));

            for (const fraction of [0.1, 0.4, 0.9, 1.1]) {
                const depth = maxOffset * fraction;
                const covered = computeStrips(result, {depth})
                    .reduce((total, strip) => total + strip.holes.reduce(
                        (area, hole) => area - Math.abs(signedRingArea(hole)),
                        Math.abs(signedRingArea(strip.boundary))), 0)
                    + computeOffsetRings(result, depth)
                        .reduce((total, ring) => total + Math.abs(signedRingArea(ring)), 0);

                expect(Math.abs(covered - polygonArea) / polygonArea).toBeLessThan(1e-12);
            }
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
        // Before the fix these were the rescue: a displacement of fifteen times the solver's
        // tolerance was enough to separate the tied events and turn every failing run into a
        // complete solve. Exact symmetry now solves too, so the whole ladder must come out the same.
        //
        // THE SMALLEST RUNG IS EXPRESSED RELATIVE TO THE POLYGON, not as a bare 1.5e-7, because
        // `solveSkeleton` now normalises to unit extent before solving. `FLOATING_POINT_EPSILON`
        // is unchanged at 1e-8 but is compared against unit-space coordinates, so the caller-space
        // displacement it corresponds to is `1e-8 * span` — 3e-6 for this 300-unit circle. A bare
        // 1.5e-7 is no longer "barely above" the tolerance; it is a twentieth of it, which lands
        // inside the ambiguous band instead of clear of it and says nothing about symmetry.
        //
        // The band itself did not widen. Measured over 25 seeds at multiples of the effective
        // tolerance, the failing seeds are the same before and after: 1x fails 10 and 9 of 25
        // respectively, 3x fails {5,18} in both, 5x fails {3,4,6,11,17} in both, 15x fails {11} in
        // both, and 30x and above are clean in both. Normalisation moved the band by the span and
        // changed nothing else about it.
        const spanOf = (vertices: Vector2[]): number => Math.max(
            Math.max(...vertices.map(v => v.x)) - Math.min(...vertices.map(v => v.x)),
            Math.max(...vertices.map(v => v.y)) - Math.min(...vertices.map(v => v.y)),
        );
        const barelyAboveTolerance = 15 * FLOATING_POINT_EPSILON * spanOf(NEAR_REGULAR_CIRCLE_32);

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
            expect(solveSkeleton(jitter(NEAR_REGULAR_CIRCLE_32, barelyAboveTolerance, seed)).complete).toBe(true);
        });
    });
});
