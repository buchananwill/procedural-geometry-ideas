import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeOffsetRings,
    computeOffsetRingsDetailed,
    computeStrips,
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
