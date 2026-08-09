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
 * WHY THESE FIXTURES ARE STILL OUT OF `ALL_TEST_POLYGONS`
 * ----------------------------------------------------------------------------
 *
 * Solving is not the only thing that list asserts. All seven now solve completely, so promotion
 * was re-measured with all seven temporarily added to the list. Every sweep passes except two,
 * and between them they still block six of the seven:
 *
 *   - `offset-event-boundary-regression.test.ts` — at the exact offset of a many-way event the
 *     wavefront ring passes through the single node that event created, and
 *     `projectOffsetWavefront` cannot close it. Blocks `NEAR_REGULAR_ELLIPSE_16` (72.361834),
 *     `NEAR_REGULAR_ELLIPSE_32` (68.277064), `NEAR_REGULAR_ROSETTE5_40` (37.456461, 55.672712)
 *     and `NEAR_REGULAR_PEANUT_32` (106.597832). This is pre-existing and not caused by any
 *     solver fix: `NEAR_REGULAR_ELLIPSE_16` reports the identical unclosed chain on both sides
 *     of every change made here. It is the same class as the Pentagon House exception that file
 *     already documents. The peanut's instance is the two-ring form of it: the lobes' events sit
 *     one ULP apart, so at either offset one lobe's ring closes and the other does not, and the
 *     projected area reads 8.534 -> 4.267 -> 8.534 rather than dropping to zero.
 *   - `large-coordinate-failures.test.ts` — these are 300-unit shapes, so they leave the
 *     translation envelope earlier than the corpus's smaller fixtures. Blocks
 *     `NEAR_REGULAR_CIRCLE_32`, `NEAR_REGULAR_CIRCLE_48` and `NEAR_REGULAR_ROSETTE5_40`.
 *
 * `NEAR_REGULAR_CIRCLE_16` is now blocked by neither and is promotable on its own; doing so also
 * means updating the hard-coded event-offset count in `offset-event-boundary-regression.test.ts`,
 * which is 271 for the present list. The rest need the projection to close a many-way event, the
 * envelope to reach 300-unit shapes, or both.
 *
 * The peanut in particular is no longer a solver problem. It solves complete with no
 * diagnostics, both causality invariants hold on it non-vacuously, and its strip tiling is
 * 3.1e-15 of the polygon area at worst across every depth and corner policy.
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
