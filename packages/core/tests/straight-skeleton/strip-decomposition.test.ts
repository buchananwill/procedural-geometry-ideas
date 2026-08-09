import {ALL_TEST_POLYGONS, SHORT_EDGE_PROMONTORY} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeOffsetRings,
    computeOffsetRingsDetailed,
    computeStrips,
    CornerContext,
    SkeletonSolveResult,
    solveSkeleton,
    Strip,
    Vector2,
} from '@proc-geo/core';

/**
 * Properties of the strip decomposition, rather than golden coordinates.
 *
 * The load-bearing assertion is the tiling one: the strips plus the offset rings must account for
 * the polygon exactly, no more and no less. A gap and an overlap are both failures of that single
 * equation, so it catches the two error modes that matter without naming a single expected
 * coordinate. Everything else here is a statement of the same kind — a strip's frontage is part of
 * the input boundary, no exterior edge is claimed twice, the identity corner policy is genuinely the
 * identity — so all of it would keep holding if the decomposition were rewritten.
 */

/**
 * Relative area tolerance for the tiling identity.
 *
 * The identity is exact in principle, not approximate: strips are clipped skeleton faces, the faces
 * tile the polygon, and the corner correction moves a region between two strips using literally the
 * same vertices on both sides. Nothing here trades area for a numerical fit, so the only slack
 * needed is double-precision summation noise. Across every fixture, every depth and both corner
 * policies the worst observed error is 1.6e-15 of the polygon's area, so 1e-12 leaves three orders
 * of headroom while staying far too tight for any real gap or overlap to hide in.
 */
const AREA_TOLERANCE_FRACTION = 1e-12;

/** Absolute tolerance for "this point is on that line". */
const TOLERANCE = 1e-6;

/** The polygon the solver actually worked on, after any winding normalisation. */
function boundaryOf(result: SkeletonSolveResult): Vector2[] {
    return result.graph.nodes.slice(0, result.graph.numExteriorNodes).map(node => node.position);
}

function polylineLength(polyline: Vector2[]): number {
    let total = 0;
    for (let i = 1; i < polyline.length; i++) {
        total += Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].y - polyline[i - 1].y);
    }
    return total;
}

/** What the corner classifier saw, as reported through the public `classifyCorner` hook. */
type SeenCorner = Pick<CornerContext, 'vertex' | 'interiorAngle' | 'previousEdgeLength' | 'nextEdgeLength'>;

function signedRingArea(ring: Vector2[]): number {
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
}

function stripArea(strip: Strip): number {
    return strip.holes.reduce(
        (area, hole) => area - Math.abs(signedRingArea(hole)),
        Math.abs(signedRingArea(strip.boundary)));
}

function totalStripArea(strips: Strip[]): number {
    return strips.reduce((total, strip) => total + stripArea(strip), 0);
}

function totalRingArea(rings: Vector2[][]): number {
    return rings.reduce((total, ring) => total + Math.abs(signedRingArea(ring)), 0);
}

/** Euclidean distance from p to the segment ab. */
function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const raw = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    const t = Math.max(0, Math.min(1, raw));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToBoundary(p: Vector2, boundary: Vector2[]): number {
    let nearest = Infinity;
    for (let i = 0; i < boundary.length; i++) {
        nearest = Math.min(nearest, distanceToSegment(p, boundary[i], boundary[(i + 1) % boundary.length]));
    }
    return nearest;
}

/** Crossing-number point-in-polygon. Points exactly on an edge are undefined, and never sampled. */
function isInsideRing(p: Vector2, ring: Vector2[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

function isInsideStrip(p: Vector2, strip: Strip): boolean {
    return strip.boundary.length >= 3
        && isInsideRing(p, strip.boundary)
        && !strip.holes.some(hole => isInsideRing(p, hole));
}

function boundingBox(polygon: Vector2[]): {minX: number; minY: number; maxX: number; maxY: number} {
    return polygon.reduce(
        (box, p) => ({
            minX: Math.min(box.minX, p.x),
            minY: Math.min(box.minY, p.y),
            maxX: Math.max(box.maxX, p.x),
            maxY: Math.max(box.maxY, p.y),
        }),
        {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity});
}

/** Deterministic sampler, so an overlap either always reproduces or never appears. */
function makeRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function solvedFixture(name: string): SkeletonSolveResult {
    const fixture = ALL_TEST_POLYGONS.find(polygon => polygon.name === name);
    if (fixture === undefined) {
        throw new Error(`No fixture named "${name}" in ALL_TEST_POLYGONS`);
    }
    return solveSkeleton(fixture.vertices);
}

/** Strips plus offset rings must account for the polygon exactly. */
function tilingError(result: SkeletonSolveResult, strips: Strip[], depth: number): number {
    const polygonArea = Math.abs(signedRingArea(boundaryOf(result)));
    const covered = totalStripArea(strips) + totalRingArea(computeOffsetRings(result, depth));
    return Math.abs(covered - polygonArea) / polygonArea;
}

/**
 * Monte-Carlo estimate of how much strip overlaps strip.
 *
 * Overlap is an area, so it is measured as one: sample the bounding box and count the points that
 * land inside more than one strip. The sampler is deterministic, so an overlap either reproduces
 * every run or is not there. Points landing exactly on a shared boundary would be ambiguous, but
 * that is a measure-zero set and the sampler never hits it.
 */
function countDoubleCoveredSamples(boundary: Vector2[], strips: Strip[]): number {
    const box = boundingBox(boundary);
    const random = makeRandom(20120402);
    const samples = 40000;

    let doubleCovered = 0;
    for (let i = 0; i < samples; i++) {
        const point: Vector2 = {
            x: box.minX + random() * (box.maxX - box.minX),
            y: box.minY + random() * (box.maxY - box.minY),
        };
        if (strips.filter(strip => isInsideStrip(point, strip)).length > 1) {
            doubleCovered++;
        }
    }
    return doubleCovered;
}

const OVERLAP_FIXTURES = [
    'Square',
    'Awkward Heptagon',
    'Duck Octagon (passes)',
    'Long Unbroken Side Then Extreme Acute Angle',
];

describe('strip decomposition', () => {
    describe('preconditions', () => {
        it('rejects a negative depth', () => {
            const result = solvedFixture('Square');
            expect(() => computeStrips(result, {depth: -1})).toThrow(/non-negative/);
        });

        it('rejects an incomplete solve', () => {
            const incomplete: SkeletonSolveResult = {...solvedFixture('Square'), complete: false};
            expect(() => computeStrips(incomplete, {depth: 1})).toThrow(/complete/);
        });

        it('rejects a merged result with no solver context', () => {
            const merged: SkeletonSolveResult = {...solvedFixture('Square'), context: null};
            expect(() => computeStrips(merged, {depth: 1})).toThrow(/self-intersect/);
        });
    });

    describe('tiling: strips plus offset rings account for the polygon', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const result = solvedFixture(name);
            const maxOffset = computeMaxOffset(result);

            const failures: string[] = [];
            for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
                const depth = maxOffset * fraction;
                const error = tilingError(result, computeStrips(result, {depth}), depth);
                if (error > AREA_TOLERANCE_FRACTION) {
                    failures.push(`at ${(fraction * 100).toFixed(0)}% of max offset the area is out by ${error}`);
                }
            }
            expect(failures.join('; ')).toBe('');
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: and neither side of it is empty', name => {
            // Guards the equation above against passing vacuously: at half the maximum offset the
            // strips must be a real part of the polygon and the offset contour must still exist.
            const result = solvedFixture(name);
            const depth = computeMaxOffset(result) * 0.5;
            const polygonArea = Math.abs(signedRingArea(boundaryOf(result)));
            const strips = computeStrips(result, {depth});

            expect(totalStripArea(strips)).toBeGreaterThan(polygonArea * 0.05);
            expect(totalStripArea(strips)).toBeLessThan(polygonArea * 0.999);
            expect(totalRingArea(computeOffsetRings(result, depth))).toBeGreaterThan(0);
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: every strip is wound clockwise', name => {
            const result = solvedFixture(name);
            const strips = computeStrips(result, {depth: computeMaxOffset(result) * 0.4});
            const wrongWinding = strips
                .filter(strip => strip.boundary.length >= 3 && signedRingArea(strip.boundary) >= 0)
                .map(strip => strip.supportingEdgeIds.join());
            expect(wrongWinding).toEqual([]);
        });
    });

    describe('a depth past the maximum offset leaves the strips tiling the polygon alone', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const result = solvedFixture(name);
            const depth = computeMaxOffset(result) * 1.5;
            const strips = computeStrips(result, {depth});

            expect(computeOffsetRings(result, depth)).toEqual([]);
            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
        });
    });

    describe('strips do not overlap one another', () => {
        it.each(OVERLAP_FIXTURES)('%s', name => {
            const result = solvedFixture(name);
            const boundary = boundaryOf(result);
            const polygonArea = Math.abs(signedRingArea(boundary));
            const strips = computeStrips(result, {depth: computeMaxOffset(result) * 0.4});

            const box = boundingBox(boundary);
            const boxArea = (box.maxX - box.minX) * (box.maxY - box.minY);
            const doubleCovered = countDoubleCoveredSamples(boundary, strips);

            expect((doubleCovered / 40000) * boxArea).toBeLessThan(polygonArea * 1e-3);
            expect(doubleCovered).toBe(0);
        });
    });

    describe('frontage', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const result = solvedFixture(name);
            const boundary = boundaryOf(result);
            const maxOffset = computeMaxOffset(result);
            const problems: string[] = [];

            for (const fraction of [0.25, 0.5]) {
                const strips = computeStrips(result, {depth: maxOffset * fraction});
                const where = `at ${(fraction * 100).toFixed(0)}% of max offset`;

                const claimed = strips.flatMap(strip => strip.supportingEdgeIds);
                const expected = [...Array(boundary.length).keys()];
                if ([...claimed].sort((a, b) => a - b).join() !== expected.join()) {
                    problems.push(
                        `${where} exterior edges claimed [${claimed.join()}], ` +
                        `expected each of [${expected.join()}] once`);
                }

                for (const [index, strip] of strips.entries()) {
                    if (strip.frontage.length !== strip.supportingEdgeIds.length + 1) {
                        problems.push(
                            `${where} strip ${index} has ${strip.frontage.length} frontage vertices for ` +
                            `${strip.supportingEdgeIds.length} supporting edges`);
                    }
                    for (const [vertexIndex, vertex] of strip.frontage.entries()) {
                        const distance = distanceToBoundary(vertex, boundary);
                        if (distance > TOLERANCE) {
                            problems.push(
                                `${where} strip ${index} frontage vertex ${vertexIndex} is ` +
                                `${distance} off the boundary`);
                        }
                    }
                    for (const [step, edgeId] of strip.supportingEdgeIds.entries()) {
                        const expectedStart = boundary[edgeId];
                        const actualStart = strip.frontage[step];
                        if (Math.hypot(actualStart.x - expectedStart.x, actualStart.y - expectedStart.y) > TOLERANCE) {
                            problems.push(
                                `${where} strip ${index} frontage does not start edge ${edgeId} ` +
                                `at that edge's source`);
                        }
                    }
                }
            }

            expect(problems.join('; ')).toBe('');
        });
    });

    describe('the default corner policy is a genuine no-op', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const result = solvedFixture(name);
            const depth = computeMaxOffset(result) * 0.4;
            expect(computeStrips(result, {depth, classifyCorner: () => 'none'}))
                .toEqual(computeStrips(result, {depth}));
        });
    });

    describe('logical street grouping', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: merging nothing gives one strip per edge', name => {
            const result = solvedFixture(name);
            const strips = computeStrips(result, {
                depth: computeMaxOffset(result) * 0.4,
                sameLogicalStreet: () => false,
            });

            expect(strips).toHaveLength(result.graph.numExteriorNodes);
            expect(strips.map(strip => strip.supportingEdgeIds))
                .toEqual([...Array(result.graph.numExteriorNodes).keys()].map(edgeId => [edgeId]));
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: merging everything gives one strip', name => {
            const result = solvedFixture(name);
            const boundary = boundaryOf(result);
            const strips = computeStrips(result, {
                depth: computeMaxOffset(result) * 0.4,
                sameLogicalStreet: () => true,
            });

            expect(strips).toHaveLength(1);
            expect(strips[0].supportingEdgeIds).toEqual([...Array(boundary.length).keys()]);

            // One street all the way round: the frontage is the whole boundary, closed.
            expect(strips[0].frontage).toHaveLength(boundary.length + 1);
            expect(strips[0].frontage.slice(0, boundary.length)).toEqual(boundary);
            expect(strips[0].frontage[boundary.length]).toEqual(boundary[0]);
        });

        it('merges a run of consecutive edges into one strip', () => {
            const result = solvedFixture('Awkward Heptagon');
            const edgeCount = result.graph.numExteriorNodes;
            const strips = computeStrips(result, {
                depth: computeMaxOffset(result) * 0.4,
                sameLogicalStreet: (a, b) => a === 0 && b === 1,
            });

            expect(strips).toHaveLength(edgeCount - 1);
            expect(strips.map(strip => strip.supportingEdgeIds)).toContainEqual([0, 1]);
            expect(strips.flatMap(strip => strip.supportingEdgeIds).sort((a, b) => a - b))
                .toEqual([...Array(edgeCount).keys()]);
        });
    });

    describe('beta-strip corner correction', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: still tiles when every corner goes to the previous strip', name => {
            const result = solvedFixture(name);
            const depth = computeMaxOffset(result) * 0.4;
            const strips = computeStrips(result, {depth, classifyCorner: () => 'previous'});
            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: still tiles when every corner goes to the next strip', name => {
            const result = solvedFixture(name);
            const depth = computeMaxOffset(result) * 0.4;
            const strips = computeStrips(result, {depth, classifyCorner: () => 'next'});
            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: reshapes real corners, not none of them', name => {
            // The two tiling assertions above would also pass if the correction silently declined
            // every corner, so the sweep has to show that it does not.
            const result = solvedFixture(name);
            const depth = computeMaxOffset(result) * 0.4;
            const untouched = computeStrips(result, {depth});
            const corrected = computeStrips(result, {depth, classifyCorner: () => 'previous'});

            const reshaped = corrected.filter(
                (strip, index) => JSON.stringify(strip.boundary) !== JSON.stringify(untouched[index].boundary));
            expect(reshaped.length).toBeGreaterThan(0);
        });

        it.each(OVERLAP_FIXTURES)('%s: corrected strips still do not overlap', name => {
            const result = solvedFixture(name);
            const boundary = boundaryOf(result);
            const strips = computeStrips(result, {
                depth: computeMaxOffset(result) * 0.4,
                classifyCorner: () => 'previous',
            });
            expect(countDoubleCoveredSamples(boundary, strips)).toBe(0);
        });

        it('actually moves area, rather than quietly declining to', () => {
            const result = solvedFixture('Square');
            const depth = computeMaxOffset(result) * 0.4;
            const untouched = computeStrips(result, {depth});
            const toPrevious = computeStrips(result, {depth, classifyCorner: () => 'previous'});

            expect(toPrevious.map(strip => strip.boundary)).not.toEqual(untouched.map(strip => strip.boundary));

            // A square's four strips are congruent, so an even-handed policy leaves them so.
            const areas = toPrevious.map(strip => stripArea(strip));
            for (const area of areas) {
                expect(area).toBeCloseTo(areas[0], 6);
            }
        });

        it('replaces the diagonal seam with a cut perpendicular to the donating street', () => {
            const result = solvedFixture('Square');
            const depth = computeMaxOffset(result) * 0.4;
            const strips = computeStrips(result, {depth, classifyCorner: () => 'previous'});
            const boundary = boundaryOf(result);

            // Each strip's frontage now starts short of its edge's source: the previous strip took
            // that corner, so this one begins at the cut instead.
            for (const strip of strips) {
                const edgeId = strip.supportingEdgeIds[0];
                const source = boundary[edgeId];
                const start = strip.frontage[0];
                expect(Math.hypot(start.x - source.x, start.y - source.y)).toBeGreaterThan(TOLERANCE);
                expect(distanceToBoundary(start, boundary)).toBeLessThan(TOLERANCE);
            }
        });

        it('leaves the strips alone when the classifier declines every corner', () => {
            const result = solvedFixture('Crazy Polygon');
            const depth = computeMaxOffset(result) * 0.4;
            expect(computeStrips(result, {depth, classifyCorner: () => 'none'}))
                .toEqual(computeStrips(result, {depth}));
        });

        it('reports the two streets and their frontage lengths to the classifier', () => {
            const result = solvedFixture('Awkward Heptagon');
            const boundary = boundaryOf(result);
            const seen: {previous: number[]; next: number[]; previousLength: number; nextLength: number}[] = [];

            computeStrips(result, {
                depth: computeMaxOffset(result) * 0.4,
                classifyCorner: context => {
                    seen.push({
                        previous: [...context.previousEdgeIds],
                        next: [...context.nextEdgeIds],
                        previousLength: context.previousFrontageLength,
                        nextLength: context.nextFrontageLength,
                    });
                    return 'none';
                },
            });

            expect(seen).toHaveLength(boundary.length);
            for (const corner of seen) {
                expect(corner.next[0]).toBe((corner.previous[corner.previous.length - 1] + 1) % boundary.length);
                const edgeId = corner.previous[corner.previous.length - 1];
                const edgeLength = Math.hypot(
                    boundary[(edgeId + 1) % boundary.length].x - boundary[edgeId].x,
                    boundary[(edgeId + 1) % boundary.length].y - boundary[edgeId].y);
                expect(corner.previousLength).toBeCloseTo(edgeLength, 9);
                expect(corner.nextLength).toBeGreaterThan(0);
            }
        });
    });

    describe('short-edge run merging', () => {
        function perimeterOf(result: SkeletonSolveResult): number {
            const boundary = boundaryOf(result);
            return polylineLength([...boundary, boundary[0]]);
        }

        /**
         * A rectangle with one corner chamfered by a short edge (edge 2), wound clockwise like the
         * square fixture. The chamfer's junction with edge 1 bends ~11°, near straight; its
         * junction with edge 3 bends ~73°, a genuine corner.
         */
        const CHAMFERED: Vector2[] = [
            {x: 0, y: 0}, {x: 0, y: 10}, {x: 18, y: 10}, {x: 19, y: 9.8}, {x: 20, y: 0},
        ];

        /** As above, but the chamfer is two consecutive short edges (edges 2 and 3). */
        const DOUBLE_CHAMFERED: Vector2[] = [
            {x: 0, y: 0}, {x: 0, y: 10}, {x: 16, y: 10}, {x: 17, y: 9.9}, {x: 18, y: 9.7}, {x: 20, y: 0},
        ];

        it('rejects a negative or non-finite minEdgeLength', () => {
            const result = solvedFixture('Square');
            expect(() => computeStrips(result, {depth: 1, minEdgeLength: -1})).toThrow(/minEdgeLength/);
            expect(() => computeStrips(result, {depth: 1, minEdgeLength: Number.NaN})).toThrow(/minEdgeLength/);
            expect(() => computeStrips(result, {depth: 1, minEdgeLength: Infinity})).toThrow(/minEdgeLength/);
        });

        it('zero and undefined both leave the decomposition untouched', () => {
            const result = solvedFixture('Awkward Heptagon');
            const depth = computeMaxOffset(result) * 0.4;
            const untouched = computeStrips(result, {depth});
            expect(computeStrips(result, {depth, minEdgeLength: 0})).toEqual(untouched);
            expect(computeStrips(result, {depth, minEdgeLength: undefined})).toEqual(untouched);
        });

        it('a bound below every edge length changes nothing', () => {
            const result = solvedFixture('Awkward Heptagon');
            const depth = computeMaxOffset(result) * 0.4;
            expect(computeStrips(result, {depth, minEdgeLength: 1e-9}))
                .toEqual(computeStrips(result, {depth}));
        });

        it('a short edge merges across its straighter junction, not its sharper one', () => {
            const result = solveSkeleton(CHAMFERED);
            const strips = computeStrips(result, {
                depth: computeMaxOffset(result) * 0.4,
                minEdgeLength: 2,
            });

            expect(strips.map(strip => strip.supportingEdgeIds)).toContainEqual([1, 2]);
            expect(strips).toHaveLength(4);
            expect(strips.flatMap(strip => strip.supportingEdgeIds).sort((a, b) => a - b))
                .toEqual([0, 1, 2, 3, 4]);
        });

        it('a chain of short edges merges transitively into one strip that meets the bound', () => {
            const result = solveSkeleton(DOUBLE_CHAMFERED);
            // Each chamfer edge is ~1.0 long and the pair sums to ~2.0, so at 2.5 the two must
            // first coalesce and then continue into edge 1: the bound holds for the strip, not
            // merely for each edge.
            const strips = computeStrips(result, {
                depth: computeMaxOffset(result) * 0.4,
                minEdgeLength: 2.5,
            });

            expect(strips.map(strip => strip.supportingEdgeIds)).toContainEqual([1, 2, 3]);
            for (const strip of strips) {
                expect(polylineLength(strip.frontage)).toBeGreaterThanOrEqual(2.5);
            }
        });

        it('stops merging at two runs even when every run is short: the square stays in two sliceable halves', () => {
            const result = solvedFixture('Square');
            const depth = computeMaxOffset(result) * 0.5;
            // Every edge of the square is far below this bound; unchecked merging would collapse
            // all four into the one annular strip that sliceStrip refuses. The two-run floor is
            // necessary for sliceability, not sufficient — see the pennant test below for the
            // residual holes case the floor does not prevent (decision 13).
            const strips = computeStrips(result, {depth, minEdgeLength: 1000});

            expect(strips).toHaveLength(2);
            for (const strip of strips) {
                expect(strip.holes).toEqual([]);
            }
            expect(strips.flatMap(strip => strip.supportingEdgeIds).sort((a, b) => a - b))
                .toEqual([0, 1, 2, 3]);
            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
        });

        it('decision 13 envelope edge: a two-run decomposition can still close a loop, and degrades gracefully', () => {
            // A rounded lobe flying a pennant tip. The tip is truncated by a tiny edge whose two
            // junctions are by far the sharpest corners, so with every run short the greedy merge
            // leaves runs [[tip], [everything else]] — and "everything else" wraps far enough
            // around the offset contour to enclose it. The two-run floor cannot prevent this; the
            // contract is graceful degradation, not prevention.
            const PENNANT: Vector2[] = [
                {x: 0, y: 10},
                {x: 20, y: 0.1},
                {x: 20, y: -0.1},
                {x: 0, y: -10},
                {x: -7.07, y: -7.07},
                {x: -10, y: 0},
                {x: -7.07, y: 7.07},
            ];
            const result = solveSkeleton(PENNANT);
            const depth = computeMaxOffset(result) * 0.5;
            const strips = computeStrips(result, {depth, minEdgeLength: 1000});

            expect(strips).toHaveLength(2);
            const looped = strips.find(strip => strip.holes.length > 0);
            expect(looped).toBeDefined();
            expect(looped!.supportingEdgeIds.length).toBeGreaterThan(1);

            // Tiling still balances — the hole's area is subtracted, the rings cover it.
            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
        });

        it('composes with sameLogicalStreet, merging whole runs rather than single edges', () => {
            const result = solvedFixture('Awkward Heptagon');
            const depth = computeMaxOffset(result) * 0.4;
            const edgeCount = result.graph.numExteriorNodes;
            const strips = computeStrips(result, {
                depth,
                sameLogicalStreet: (a, b) => a === 0 && b === 1,
                minEdgeLength: perimeterOf(result) / 26,
            });

            expect(strips.flatMap(strip => strip.supportingEdgeIds).sort((a, b) => a - b))
                .toEqual([...Array(edgeCount).keys()]);
            const containingZero = strips.find(strip => strip.supportingEdgeIds.includes(0));
            expect(containingZero!.supportingEdgeIds).toContain(1);
            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: tiling holds with merging active at every depth', name => {
            const result = solvedFixture(name);
            const maxOffset = computeMaxOffset(result);
            const minEdgeLength = perimeterOf(result) / 26;

            const failures: string[] = [];
            for (const fraction of [0.25, 0.5, 0.75, 1]) {
                const depth = maxOffset * fraction;
                const strips = computeStrips(result, {depth, minEdgeLength});
                const error = tilingError(result, strips, depth);
                if (error > AREA_TOLERANCE_FRACTION) {
                    failures.push(`at ${(fraction * 100).toFixed(0)}% of max offset the area is out by ${error}`);
                }
            }
            expect(failures.join('; ')).toBe('');
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: every exterior edge appears in exactly one strip', name => {
            const result = solvedFixture(name);
            const edgeCount = result.graph.numExteriorNodes;
            const strips = computeStrips(result, {
                depth: computeMaxOffset(result) * 0.5,
                minEdgeLength: perimeterOf(result) / 26,
            });

            expect(strips.flatMap(strip => strip.supportingEdgeIds).sort((a, b) => a - b))
                .toEqual([...Array(edgeCount).keys()]);
            for (const strip of strips) {
                expect(strip.frontage).toHaveLength(strip.supportingEdgeIds.length + 1);
            }
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: every strip frontage reaches minEdgeLength, two-strip floor aside', name => {
            const result = solvedFixture(name);
            const minEdgeLength = perimeterOf(result) / 26;
            const strips = computeStrips(result, {
                depth: computeMaxOffset(result) * 0.5,
                minEdgeLength,
            });

            if (strips.length <= 2) {
                // The two-strip floor is the only licence to stay short — see StripOptions.
                return;
            }
            for (const strip of strips) {
                expect(polylineLength(strip.frontage)).toBeGreaterThanOrEqual(minEdgeLength * (1 - 1e-9));
                expect(strip.supportingEdgeIds.length).toBeGreaterThan(0);
            }
        });
    });

    describe('mitre tolerance', () => {
        const TOLERANCE_30 = (30 * Math.PI) / 180;

        it('rejects a negative, non-finite, or beyond-pi tolerance', () => {
            const result = solvedFixture('Square');
            expect(() => computeStrips(result, {depth: 0.4, mitreTolerance: -1})).toThrow(/mitreTolerance/);
            expect(() => computeStrips(result, {depth: 0.4, mitreTolerance: Number.NaN})).toThrow(/mitreTolerance/);
            // The canonical mistake: 30 degrees passed where radians belong.
            expect(() => computeStrips(result, {depth: 0.4, mitreTolerance: 30})).toThrow(/degrees/);
        });

        it('pi and undefined both leave the strips alone: no deviation can exceed pi', () => {
            const result = solvedFixture('Awkward Heptagon');
            const depth = computeMaxOffset(result) * 0.4;
            const untouched = computeStrips(result, {depth});
            expect(computeStrips(result, {depth, mitreTolerance: Math.PI})).toEqual(untouched);
            expect(computeStrips(result, {depth, mitreTolerance: undefined})).toEqual(untouched);
        });

        it('a tolerance above every junction deviation changes nothing', () => {
            const result = solvedFixture('Square');
            const depth = computeMaxOffset(result) * 0.4;
            // The square's corners all deviate 90 degrees from straight; a 100-degree tolerance
            // forgives every one of them.
            expect(computeStrips(result, {depth, mitreTolerance: (100 * Math.PI) / 180}))
                .toEqual(computeStrips(result, {depth}));
        });

        it('at a 30-degree tolerance the square\'s right-angled corners are all reshaped, evenly', () => {
            const result = solvedFixture('Square');
            const depth = computeMaxOffset(result) * 0.4;
            const untouched = computeStrips(result, {depth});
            const corrected = computeStrips(result, {depth, mitreTolerance: TOLERANCE_30});

            expect(corrected.map(strip => strip.boundary)).not.toEqual(untouched.map(strip => strip.boundary));
            expect(tilingError(result, corrected, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);

            // Four congruent strips and a tie-breaking rule applied four times over: the strips
            // must come out congruent again.
            const areas = corrected.map(strip => stripArea(strip));
            for (const area of areas) {
                expect(area).toBeCloseTo(areas[0], 6);
            }
        });

        it('awards each corner to the longer street: the rectangle\'s short strips give way', () => {
            const result = solvedFixture('Rectangle');
            const boundary = boundaryOf(result);
            const depth = computeMaxOffset(result) * 0.4;
            const strips = computeStrips(result, {depth, mitreTolerance: TOLERANCE_30});

            const edgeLength = (edgeId: number): number => Math.hypot(
                boundary[(edgeId + 1) % boundary.length].x - boundary[edgeId].x,
                boundary[(edgeId + 1) % boundary.length].y - boundary[edgeId].y);

            const lengths = [...Array(boundary.length).keys()].map(edgeLength);
            const longest = Math.max(...lengths);
            for (const strip of strips) {
                const edgeId = strip.supportingEdgeIds[0];
                if (lengths[edgeId] === longest) {
                    // The long streets take both their corners and keep their whole frontage.
                    expect(strip.frontage[0]).toEqual(boundary[edgeId]);
                    expect(strip.frontage[strip.frontage.length - 1])
                        .toEqual(boundary[(edgeId + 1) % boundary.length]);
                } else {
                    // The short streets donate both corners: their frontage is cut back inside
                    // the original edge at each end.
                    expect(polylineLength(strip.frontage)).toBeLessThan(lengths[edgeId] - TOLERANCE);
                }
            }
            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
        });

        it('an explicit classifyCorner wins over the threshold', () => {
            const result = solvedFixture('Square');
            const depth = computeMaxOffset(result) * 0.4;
            const declined = computeStrips(result, {
                depth,
                mitreTolerance: TOLERANCE_30,
                classifyCorner: () => 'none',
            });
            expect(declined).toEqual(computeStrips(result, {depth}));
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: tiling holds with the 120-degree correction at every depth', name => {
            const result = solvedFixture(name);
            const maxOffset = computeMaxOffset(result);

            const failures: string[] = [];
            for (const fraction of [0.25, 0.5, 0.75, 1]) {
                const depth = maxOffset * fraction;
                const strips = computeStrips(result, {depth, mitreTolerance: TOLERANCE_30});
                const error = tilingError(result, strips, depth);
                if (error > AREA_TOLERANCE_FRACTION) {
                    failures.push(`at ${(fraction * 100).toFixed(0)}% of max offset the area is out by ${error}`);
                }
            }
            expect(failures.join('; ')).toBe('');
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: tiling holds with merging and correction both active', name => {
            const result = solvedFixture(name);
            const boundary = boundaryOf(result);
            let perimeter = 0;
            for (let i = 0; i < boundary.length; i++) {
                const next = boundary[(i + 1) % boundary.length];
                perimeter += Math.hypot(next.x - boundary[i].x, next.y - boundary[i].y);
            }
            const maxOffset = computeMaxOffset(result);
            const edgeCount = result.graph.numExteriorNodes;

            const failures: string[] = [];
            for (const fraction of [0.25, 0.5, 0.75, 1]) {
                const depth = maxOffset * fraction;
                const minEdgeLength = perimeter / 26;
                const strips = computeStrips(result, {
                    depth,
                    minEdgeLength,
                    mitreTolerance: TOLERANCE_30,
                });
                const error = tilingError(result, strips, depth);
                if (error > AREA_TOLERANCE_FRACTION) {
                    failures.push(`at ${(fraction * 100).toFixed(0)}% of max offset the area is out by ${error}`);
                }
                const claimed = strips.flatMap(strip => strip.supportingEdgeIds).sort((a, b) => a - b).join();
                if (claimed !== [...Array(edgeCount).keys()].join()) {
                    failures.push(`at ${(fraction * 100).toFixed(0)}% of max offset edges claimed [${claimed}]`);
                }
                // Decision 9 as a POST-correction guarantee (decision 12): no transfer may have
                // taken a strip's frontage below the bound the merge pass established.
                if (strips.length > 2) {
                    for (const [index, strip] of strips.entries()) {
                        const frontage = polylineLength(strip.frontage);
                        if (frontage < minEdgeLength * (1 - 1e-9)) {
                            failures.push(
                                `at ${(fraction * 100).toFixed(0)}% of max offset strip ${index} ` +
                                `keeps only ${frontage} of frontage against a bound of ${minEdgeLength}`);
                        }
                    }
                }
            }
            expect(failures.join('; ')).toBe('');
        });

        it('decision 12: double donation cannot consume the needle to a zero-area husk', () => {
            // Both tip corners of the needle are ~116.6 degrees, so both donate under a 120-degree
            // threshold, and their perpendicular feet converge on the same point of the tiny tip
            // edge. Before the fix the second cut was validated against the ORIGINAL edge rather
            // than the already-shortened frontage, and the strip collapsed to a two-point boundary
            // with zero frontage.
            const NEEDLE: Vector2[] = [
                {x: 0, y: 0}, {x: 4.9, y: 9.8}, {x: 5.1, y: 9.8}, {x: 10.2, y: 0},
            ];
            const result = solveSkeleton(NEEDLE);
            const maxOffset = computeMaxOffset(result);

            for (const fraction of [0.3, 0.5, 0.75, 1]) {
                const depth = maxOffset * fraction;
                const strips = computeStrips(result, {depth, mitreTolerance: TOLERANCE_30});
                expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
                for (const strip of strips) {
                    expect(strip.boundary.length).toBeGreaterThanOrEqual(3);
                    expect(polylineLength(strip.frontage)).toBeGreaterThan(0);
                }
            }
        });

        it('decision 12: a transfer that would take its donor below minEdgeLength is refused', () => {
            // A 10 x 4 rectangle cut deep: each short side would donate 1.8 of frontage at each
            // end, keeping only 0.4 — far below the strip-level minimum the merge pass had just
            // guaranteed. With the floor unified into the corner pass, the first donation (leaving
            // 2.2) is allowed and the second (leaving 0.4) is refused.
            const rectangle: Vector2[] = [
                {x: 0, y: 0}, {x: 0, y: 4}, {x: 10, y: 4}, {x: 10, y: 0},
            ];
            const result = solveSkeleton(rectangle);
            const depth = computeMaxOffset(result) * 0.9;
            const minEdgeLength = 28 / 26;
            const strips = computeStrips(result, {depth, minEdgeLength, mitreTolerance: TOLERANCE_30});

            expect(strips.length).toBeGreaterThan(2);
            for (const strip of strips) {
                expect(polylineLength(strip.frontage)).toBeGreaterThanOrEqual(minEdgeLength * (1 - 1e-9));
            }
            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
        });

        it('corrects several junctions per polygon, not just one — the single-vertex regression', () => {
            // Render inspection found the correction typically reshaping a single vertex while
            // every other qualifying junction stayed mitred. Root causes, both fixed in
            // transferCorner: the cut search stopped at the donor's FIRST frontage segment (on a
            // merged street the nearest point often lies beyond it), and a bent seam invalidated
            // the deepest apex with no retreat to a shallower one. This pins the fix on the
            // production configuration of the repro polygon: several junctions must correct, at a
            // shallow depth and at full depth, with the tiling identity intact throughout.
            const result = solveSkeleton(SHORT_EDGE_PROMONTORY);
            const boundary = boundaryOf(result);
            const perimeter = polylineLength([...boundary, boundary[0]]);
            const maxOffset = computeMaxOffset(result);
            const edgeCount = result.graph.numExteriorNodes;

            const correctedJunctions = (strips: Strip[]): number => {
                let corrected = 0;
                for (let k = 0; k < strips.length; k++) {
                    const nextStrip = strips[(k + 1) % strips.length];
                    const lastEdge = strips[k].supportingEdgeIds[strips[k].supportingEdgeIds.length - 1];
                    const vertex = result.graph.nodes[(lastEdge + 1) % edgeCount].position;
                    const previousEnd = strips[k].frontage[strips[k].frontage.length - 1];
                    const nextStart = nextStrip.frontage[0];
                    const moved = (point: Vector2): boolean => point.x !== vertex.x || point.y !== vertex.y;
                    if (moved(previousEnd) || moved(nextStart)) {
                        corrected += 1;
                    }
                }
                return corrected;
            };

            for (const fraction of [0.35, 1]) {
                const depth = maxOffset * fraction;
                const strips = computeStrips(result, {
                    depth,
                    minEdgeLength: perimeter / 26,
                    mitreTolerance: TOLERANCE_30,
                });
                expect(correctedJunctions(strips)).toBeGreaterThanOrEqual(3);
                expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
            }
        });

        it('rounding residue cannot refuse a cut: the heptagon v0 mitre regression', () => {
            // The corner-cut chord ends ON a frontage segment by construction, a few ulps off its
            // line on a side chosen by rounding residue alone. The exact-zero crossing test in
            // cutStaysInside treated that residue as a proper crossing, so identical geometry was
            // refused or accepted at random per corner — the Awkward Heptagon's 86.3° corner at
            // (250, 250) kept its mitre at every tolerance and depth while every guard was
            // genuinely satisfied (foot at fraction 0.215 of a 206-unit frontage, surviving 162
            // against a floor of 49.3, chord midpoint interior). segmentsProperlyCross now carries
            // a tolerance scaled to the product of segment lengths; this pins the corner, and its
            // sibling refusal at (500, 450), corrected under the production configuration.
            const result = solvedFixture('Awkward Heptagon');
            const boundary = boundaryOf(result);
            const perimeter = polylineLength([...boundary, boundary[0]]);
            const depth = computeMaxOffset(result) * 0.35;
            const strips = computeStrips(result, {
                depth,
                minEdgeLength: perimeter / 26,
                mitreTolerance: TOLERANCE_30,
            });

            // The junction at boundary[0] sits between the last strip and the first: corrected
            // means the shared vertex is no longer where the two frontages meet.
            const v0 = boundary[0];
            const first = strips[0];
            const last = strips[strips.length - 1];
            const moved = (point: Vector2): boolean => point.x !== v0.x || point.y !== v0.y;
            expect(moved(first.frontage[0]) || moved(last.frontage[last.frontage.length - 1])).toBe(true);

            // Four of the five qualifying convex junctions correct; the fifth is the 22.3° tip,
            // whose wedge foot lands 210 units along a 138-unit street — a genuine refusal.
            const edgeCount = result.graph.numExteriorNodes;
            let corrected = 0;
            for (let k = 0; k < strips.length; k++) {
                const nextStrip = strips[(k + 1) % strips.length];
                const lastEdge = strips[k].supportingEdgeIds[strips[k].supportingEdgeIds.length - 1];
                const vertex = result.graph.nodes[(lastEdge + 1) % edgeCount].position;
                const away = (point: Vector2): boolean => point.x !== vertex.x || point.y !== vertex.y;
                if (away(strips[k].frontage[strips[k].frontage.length - 1]) || away(nextStrip.frontage[0])) {
                    corrected += 1;
                }
            }
            expect(corrected).toBeGreaterThanOrEqual(4);
            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
        });

        it('corrects the corners that survive run-merging on the chamfered polygons', () => {
            const chamfered: Vector2[] = [
                {x: 0, y: 0}, {x: 0, y: 10}, {x: 18, y: 10}, {x: 19, y: 9.8}, {x: 20, y: 0},
            ];
            const result = solveSkeleton(chamfered);
            const depth = computeMaxOffset(result) * 0.4;
            const mergedOnly = computeStrips(result, {depth, minEdgeLength: 2});
            const both = computeStrips(result, {depth, minEdgeLength: 2, mitreTolerance: TOLERANCE_30});

            // Same runs either way — the threshold only moves corner regions between them …
            expect(both.map(strip => strip.supportingEdgeIds)).toEqual(mergedOnly.map(strip => strip.supportingEdgeIds));
            // … and the right-angled junctions that survived the merge are genuinely reshaped.
            expect(both.map(strip => strip.boundary)).not.toEqual(mergedOnly.map(strip => strip.boundary));
            expect(tilingError(result, both, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
        });
    });

    describe('reflex-arm characterisation (decision 16)', () => {
        /**
         * A dart: a rectangle with a notch bitten into its right side. The junction at (6, 5) is
         * reflex — interior angle ~257° — and under the deviation predicate (|θ − π| > tolerance)
         * it qualifies for correction, which the convex-only gate used to exclude. These tests
         * exercise `transferCorner` at exactly that junction, forced through the injectable
         * classifier, before the production predicate is allowed to reach it.
         */
        const DART: Vector2[] = [
            {x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 6, y: 5}, {x: 10, y: 0},
        ];

        function reflexOnly(assignment: 'previous' | 'next') {
            return (context: CornerContext): 'previous' | 'next' | 'none' =>
                (context.interiorAngle > Math.PI ? assignment : 'none');
        }

        it('the dart exposes exactly one reflex junction to the classifier', () => {
            const result = solveSkeleton(DART);
            const seen: number[] = [];
            computeStrips(result, {
                depth: computeMaxOffset(result) * 0.4,
                classifyCorner: context => {
                    seen.push(context.interiorAngle);
                    return 'none';
                },
            });
            expect(seen.filter(angle => angle > Math.PI)).toHaveLength(1);
        });

        it.each(['previous', 'next'] as const)('a forced transfer at the reflex junction (%s) conserves tiling, overlap-freedom and the floor', assignment => {
            const result = solveSkeleton(DART);
            const boundary = boundaryOf(result);
            const depth = computeMaxOffset(result) * 0.4;
            const strips = computeStrips(result, {depth, classifyCorner: reflexOnly(assignment)});

            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
            expect(countDoubleCoveredSamples(boundary, strips)).toBe(0);
            for (const strip of strips) {
                expect(strip.boundary.length).toBeGreaterThanOrEqual(3);
                expect(polylineLength(strip.frontage)).toBeGreaterThan(0);
            }
        });

        it('PARKED (decision 16): a reflex transfer is geometrically impossible and is always refused', () => {
            // The finding that parked the reflex arm. The seam between two strips bisects their
            // corner wedge, so it leaves the shared vertex at θ/2 from each edge; at a reflex
            // junction θ/2 > 90°, so the seam apex projects BEHIND the vertex on either frontage
            // and `cutPointOnEdge` necessarily computes a negative fraction. Universal refusal is
            // therefore not guard tuning but construction geometry: correcting reflex junctions
            // needs a different cut construction, not a relaxed gate. This pins the vacuousness so
            // that building such a construction flips a test deliberately.
            const result = solveSkeleton(DART);
            const maxOffset = computeMaxOffset(result);
            const outcomes: string[] = [];
            for (const fraction of [0.25, 0.4, 0.6, 0.8]) {
                const depth = maxOffset * fraction;
                const untouched = computeStrips(result, {depth});
                const forced = computeStrips(result, {depth, classifyCorner: reflexOnly('previous')});
                const changed = JSON.stringify(forced.map(strip => strip.boundary))
                    !== JSON.stringify(untouched.map(strip => strip.boundary));
                outcomes.push(`${(fraction * 100).toFixed(0)}%:${changed ? 'reshaped' : 'refused'}`);
            }
            expect(outcomes).toEqual(['25%:refused', '40%:refused', '60%:refused', '80%:refused']);
        });

        it('with minEdgeLength set, a reflex transfer still honours the frontage floor', () => {
            const result = solveSkeleton(DART);
            const depth = computeMaxOffset(result) * 0.4;
            const minEdgeLength = 2;
            const strips = computeStrips(result, {
                depth,
                minEdgeLength,
                classifyCorner: reflexOnly('previous'),
            });

            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
            if (strips.length > 2) {
                for (const strip of strips) {
                    expect(polylineLength(strip.frontage)).toBeGreaterThanOrEqual(minEdgeLength * (1 - 1e-9));
                }
            }
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: forcing transfers at every reflex junction refuses them all and keeps the tiling exact', name => {
            const result = solvedFixture(name);
            const depth = computeMaxOffset(result) * 0.4;
            const untouched = computeStrips(result, {depth});
            const strips = computeStrips(result, {depth, classifyCorner: reflexOnly('previous')});
            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);

            // Corpus-wide confirmation of the vacuousness pinned on the dart above.
            expect(strips.map(strip => strip.boundary)).toEqual(untouched.map(strip => strip.boundary));
        });
    });

    describe('corner machinery characterisation', () => {
        /**
         * The corner-correction machine (`classifyCorner` / `transferCorner`) predates any
         * production consumer. These tests pin down what it reports and what it does, so that
         * wiring a threshold policy onto it rests on characterised rather than assumed behaviour.
         */

        function observeCorners(result: SkeletonSolveResult, depth: number): SeenCorner[] {
            const seen: SeenCorner[] = [];
            computeStrips(result, {
                depth,
                classifyCorner: context => {
                    seen.push({
                        vertex: context.vertex,
                        interiorAngle: context.interiorAngle,
                        previousEdgeLength: context.previousEdgeLength,
                        nextEdgeLength: context.nextEdgeLength,
                    });
                    return 'none';
                },
            });
            return seen;
        }

        /**
         * Regression guard for the orientation of `CornerContext.interiorAngle`. Until 2026-08-09
         * `interiorAngleAt` subtracted the two directions the wrong way round and reported the
         * conjugate `2π − θ` — the square's right angles came back as 3π/2, and every fixture's
         * angles summed to `(n + 2)π`. The sum identity below is what caught it: interior angles
         * of a simple n-gon must sum to `(n − 2)π`, and no winding convention can excuse the
         * conjugate. A threshold policy `interiorAngle < t` wired onto the conjugate would fire on
         * reflex corners instead of sharp convex ones, so these assertions are what make the
         * production corner-angle wiring trustworthy.
         */
        it('reports a right angle and the true edge lengths at every corner of the square', () => {
            const result = solvedFixture('Square');
            const boundary = boundaryOf(result);
            const corners = observeCorners(result, computeMaxOffset(result) * 0.4);

            expect(corners).toHaveLength(4);
            for (const corner of corners) {
                expect(corner.interiorAngle).toBeCloseTo(Math.PI / 2, 9);
            }

            const edgeLength = (edgeId: number): number => Math.hypot(
                boundary[(edgeId + 1) % boundary.length].x - boundary[edgeId].x,
                boundary[(edgeId + 1) % boundary.length].y - boundary[edgeId].y);
            for (const [index, corner] of corners.entries()) {
                // Corner index k sits between strip k (edge k) and strip k + 1.
                expect(corner.previousEdgeLength).toBeCloseTo(edgeLength(index), 9);
                expect(corner.nextEdgeLength).toBeCloseTo(edgeLength((index + 1) % boundary.length), 9);
            }
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: interior angles are in (0, 2pi) and sum to (n - 2) pi', name => {
            const result = solvedFixture(name);
            const corners = observeCorners(result, computeMaxOffset(result) * 0.4);
            const n = result.graph.numExteriorNodes;

            expect(corners).toHaveLength(n);
            let total = 0;
            for (const corner of corners) {
                expect(corner.interiorAngle).toBeGreaterThan(0);
                expect(corner.interiorAngle).toBeLessThan(2 * Math.PI);
                total += corner.interiorAngle;
            }
            expect(total).toBeCloseTo((n - 2) * Math.PI, 6);
        });

        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s: the correction conserves total strip area', name => {
            const result = solvedFixture(name);
            const depth = computeMaxOffset(result) * 0.4;
            const untouched = totalStripArea(computeStrips(result, {depth}));

            for (const assignment of ['previous', 'next'] as const) {
                const corrected = totalStripArea(computeStrips(result, {depth, classifyCorner: () => assignment}));
                expect(Math.abs(corrected - untouched)).toBeLessThanOrEqual(untouched * AREA_TOLERANCE_FRACTION);
            }
        });

        it('a threshold-style classifier corrects only below its threshold and leaves the rest alone', () => {
            const result = solvedFixture('Awkward Heptagon');
            const depth = computeMaxOffset(result) * 0.4;
            const angles = observeCorners(result, depth).map(corner => corner.interiorAngle);
            const sorted = [...angles].sort((a, b) => a - b);
            const threshold = (sorted[0] + sorted[sorted.length - 1]) / 2;
            expect(sorted[0]).toBeLessThan(threshold);
            expect(sorted[sorted.length - 1]).toBeGreaterThan(threshold);

            const strips = computeStrips(result, {
                depth,
                classifyCorner: context => (context.interiorAngle < threshold ? 'previous' : 'none'),
            });
            const untouched = computeStrips(result, {depth});

            expect(tilingError(result, strips, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
            expect(strips.map(strip => strip.boundary)).not.toEqual(untouched.map(strip => strip.boundary));

            // A corner at or above the threshold is untouched: its shared vertex still belongs to
            // both adjacent strips, exactly where the skeleton put it.
            const boundary = boundaryOf(result);
            for (const [index, angle] of angles.entries()) {
                if (angle < threshold) {
                    continue;
                }
                const vertex = boundary[(index + 1) % boundary.length];
                const onStrip = (strip: Strip): boolean =>
                    strip.boundary.some(point => point.x === vertex.x && point.y === vertex.y);
                expect(onStrip(strips[index])).toBe(true);
                expect(onStrip(strips[(index + 1) % strips.length])).toBe(true);
            }
        });

        it('corrects corners between merged strips as readily as between single-edge ones', () => {
            const result = solvedFixture('Awkward Heptagon');
            const depth = computeMaxOffset(result) * 0.4;
            const options = {depth, sameLogicalStreet: (a: number, b: number) => a === 0 && b === 1};
            const untouched = computeStrips(result, options);
            const corrected = computeStrips(result, {...options, classifyCorner: () => 'previous'});

            expect(corrected.map(strip => strip.supportingEdgeIds)).toEqual(untouched.map(strip => strip.supportingEdgeIds));
            expect(tilingError(result, corrected, depth)).toBeLessThan(AREA_TOLERANCE_FRACTION);
            expect(corrected.map(strip => strip.boundary)).not.toEqual(untouched.map(strip => strip.boundary));
        });
    });

    describe('offset ring provenance', () => {
        it('names an exterior edge for every ring segment and keeps the vertices in step', () => {
            const result = solvedFixture('Awkward Heptagon');
            const depth = computeMaxOffset(result) * 0.4;
            const detailed = computeOffsetRingsDetailed(result, depth);
            const plain = computeOffsetRings(result, depth);

            expect(detailed.map(ring => ring.vertices.map(vertex => vertex.position))).toEqual(plain);
            for (const ring of detailed) {
                expect(ring.segments).toHaveLength(ring.vertices.length);
                for (const [index, segment] of ring.segments.entries()) {
                    expect(segment.exteriorEdgeId).toBeGreaterThanOrEqual(0);
                    expect(segment.exteriorEdgeId).toBeLessThan(result.graph.numExteriorNodes);
                    expect(segment.start).toBe(ring.vertices[index]);
                    expect(segment.end).toBe(ring.vertices[(index + 1) % ring.vertices.length]);
                }
            }
        });
    });
});
