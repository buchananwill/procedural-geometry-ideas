import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeNodeOffsets,
    computeOffsetRings,
    SkeletonSolveResult,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';

/**
 * Properties of the offset projection, rather than golden coordinates.
 *
 * `computeOffsetRings` reconstructs where the inward-moving wavefront was at a given offset. The
 * assertions below are statements about what a wavefront *is* — it starts on the boundary, it only
 * ever shrinks, it never outruns its own clearance from the boundary, and it stays inside every
 * earlier version of itself. None of them name an expected coordinate, so they hold for any polygon
 * and would keep holding if the projection were reimplemented.
 *
 * The one place a fixture is named is the splitting test, which needs a shape that genuinely pinches
 * apart. That the wavefront can become several disconnected loops is the whole reason this API
 * returns a list of rings, so it is asserted directly rather than left to the sweep.
 */

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

function totalRingArea(rings: Vector2[][]): number {
    return rings.reduce((sum, ring) => sum + Math.abs(signedRingArea(ring)), 0);
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

/** Perpendicular distance from p to the infinite line through a and b. */
function distanceToSupportingLine(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
}

function clearanceFromBoundary(p: Vector2, boundary: Vector2[]): number {
    let clearance = Infinity;
    for (let i = 0; i < boundary.length; i++) {
        clearance = Math.min(clearance, distanceToSegment(p, boundary[i], boundary[(i + 1) % boundary.length]));
    }
    return clearance;
}

/**
 * Which exterior edges have their supporting line exactly `offset` away from the point.
 *
 * A wavefront vertex is where the offset lines of a bisector's *two* parent edges meet, so a
 * genuine vertex matches at least two distinct edges. Matching only one would mean the point merely
 * lies somewhere on an offset line rather than at an intersection of two.
 *
 * The test is existential, not nearest-line: an unrelated edge elsewhere in the polygon may well
 * have a supporting line passing closer than `offset`, and that says nothing about this vertex.
 */
function supportingLinesAtOffset(p: Vector2, boundary: Vector2[], offset: number, tolerance: number): number[] {
    const matches: number[] = [];
    for (let i = 0; i < boundary.length; i++) {
        const distance = distanceToSupportingLine(p, boundary[i], boundary[(i + 1) % boundary.length]);
        if (Math.abs(distance - offset) <= tolerance) {
            matches.push(i);
        }
    }
    return matches;
}

/** Crossing-number point-in-polygon, with points on the boundary counted as inside. */
function isInsideRing(p: Vector2, ring: Vector2[], tolerance: number): boolean {
    for (let i = 0; i < ring.length; i++) {
        if (distanceToSegment(p, ring[i], ring[(i + 1) % ring.length]) <= tolerance) {
            return true;
        }
    }
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

function isInsideRingSet(p: Vector2, rings: Vector2[][], tolerance: number): boolean {
    return rings.some(ring => isInsideRing(p, ring, tolerance));
}

function segmentsProperlyIntersect(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean {
    const cross = (o: Vector2, p: Vector2, q: Vector2) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
    const d1 = cross(b1, b2, a1);
    const d2 = cross(b1, b2, a2);
    const d3 = cross(a1, a2, b1);
    const d4 = cross(a1, a2, b2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Non-adjacent edge pairs of a ring that cross one another. */
function selfIntersections(ring: Vector2[]): string[] {
    const found: string[] = [];
    for (let i = 0; i < ring.length; i++) {
        for (let j = i + 1; j < ring.length; j++) {
            if (j === i || (j + 1) % ring.length === i || (i + 1) % ring.length === j) {
                continue;
            }
            const a1 = ring[i];
            const a2 = ring[(i + 1) % ring.length];
            const b1 = ring[j];
            const b2 = ring[(j + 1) % ring.length];
            if (segmentsProperlyIntersect(a1, a2, b1, b2)) {
                found.push(`edge ${i} crosses edge ${j}`);
            }
        }
    }
    return found;
}

function solvedFixture(name: string): SkeletonSolveResult {
    const fixture = ALL_TEST_POLYGONS.find(polygon => polygon.name === name);
    if (fixture === undefined) {
        throw new Error(`No fixture named "${name}" in ALL_TEST_POLYGONS`);
    }
    return solveSkeleton(fixture.vertices);
}

describe('offset projection', () => {
    describe('preconditions', () => {
        it('rejects a negative offset', () => {
            const result = solvedFixture('Square');
            expect(() => computeOffsetRings(result, -1)).toThrow(/non-negative/);
        });

        it('rejects an incomplete solve', () => {
            const incomplete: SkeletonSolveResult = {
                ...solvedFixture('Square'),
                complete: false,
            };
            expect(() => computeOffsetRings(incomplete, 0)).toThrow(/complete/);
            expect(() => computeMaxOffset(incomplete)).toThrow(/complete/);
            expect(() => computeNodeOffsets(incomplete)).toThrow(/complete/);
        });

        it('rejects a merged result with no solver context', () => {
            const merged: SkeletonSolveResult = {
                ...solvedFixture('Square'),
                context: null,
            };
            expect(() => computeOffsetRings(merged, 0)).toThrow(/self-intersect/);
        });
    });

    describe('node offsets', () => {
        it('places every exterior node at offset zero', () => {
            const result = solvedFixture('Awkward Heptagon');
            const offsets = computeNodeOffsets(result);
            for (let nodeId = 0; nodeId < result.graph.numExteriorNodes; nodeId++) {
                expect(offsets.get(nodeId)).toBe(0);
            }
        });

        it('reports the largest node offset as the maximum', () => {
            const result = solvedFixture('Awkward Heptagon');
            const offsets = [...computeNodeOffsets(result).values()];
            expect(computeMaxOffset(result)).toBeCloseTo(Math.max(...offsets), 9);
        });
    });

    describe('offset zero reproduces the input', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const result = solvedFixture(name);
            const boundary = boundaryOf(result);
            const rings = computeOffsetRings(result, 0);

            expect(rings).toHaveLength(1);
            expect(rings[0]).toHaveLength(boundary.length);

            // Same vertices, in the same order — but the walk may start anywhere on the ring.
            const start = rings[0].findIndex(vertex =>
                Math.hypot(vertex.x - boundary[0].x, vertex.y - boundary[0].y) < TOLERANCE);
            expect(start).toBeGreaterThanOrEqual(0);
            for (let i = 0; i < boundary.length; i++) {
                const projected = rings[0][(start + i) % boundary.length];
                expect(projected.x).toBeCloseTo(boundary[i].x, 9);
                expect(projected.y).toBeCloseTo(boundary[i].y, 9);
            }
        });
    });

    describe('emptiness past the maximum offset', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const result = solvedFixture(name);
            const maxOffset = computeMaxOffset(result);
            expect(computeOffsetRings(result, maxOffset)).toEqual([]);
            expect(computeOffsetRings(result, maxOffset * 1.5)).toEqual([]);
        });
    });

    describe('total area decreases monotonically', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const result = solvedFixture(name);
            const maxOffset = computeMaxOffset(result);
            const samples = 24;

            let previousArea = Infinity;
            const regressions: string[] = [];
            for (let i = 0; i <= samples; i++) {
                const offset = (maxOffset * i) / (samples + 1);
                const area = totalRingArea(computeOffsetRings(result, offset));
                if (area >= previousArea) {
                    regressions.push(
                        `offset ${offset.toFixed(4)} has area ${area.toFixed(4)}, not less than the ` +
                        `previous ${previousArea.toFixed(4)}`);
                }
                previousArea = area;
            }
            expect(regressions.join('; ')).toBe('');
        });
    });

    describe('clearance from the boundary', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const result = solvedFixture(name);
            const boundary = boundaryOf(result);
            const maxOffset = computeMaxOffset(result);

            const violations: string[] = [];
            for (const fraction of [0.05, 0.25, 0.5, 0.75]) {
                const offset = maxOffset * fraction;
                for (const [ringIndex, ring] of computeOffsetRings(result, offset).entries()) {
                    for (const [vertexIndex, vertex] of ring.entries()) {
                        const where =
                            `at offset ${offset.toFixed(4)} (${(fraction * 100).toFixed(0)}% of max), ` +
                            `ring ${ringIndex} vertex ${vertexIndex} (${vertex.x.toFixed(6)}, ${vertex.y.toFixed(6)})`;

                        const clearance = clearanceFromBoundary(vertex, boundary);
                        if (clearance < offset - TOLERANCE) {
                            violations.push(`${where} is only ${clearance.toFixed(6)} from the boundary`);
                        }

                        // A wavefront vertex is the meeting point of two offset lines, so at least
                        // two distinct exterior edges must sit exactly `offset` away from it.
                        const matches = supportingLinesAtOffset(vertex, boundary, offset, TOLERANCE);
                        if (matches.length < 2) {
                            violations.push(
                                `${where} matches ${matches.length} exterior edge supporting line(s) ` +
                                `[${matches.join(', ')}] at that offset, expected at least 2`);
                        }
                    }
                }
            }
            expect(violations.join('; ')).toBe('');
        });
    });

    describe('later wavefronts lie inside earlier ones', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const result = solvedFixture(name);
            const maxOffset = computeMaxOffset(result);
            const fractions = [0.05, 0.25, 0.5, 0.75, 0.9];

            const escapes: string[] = [];
            for (let i = 0; i < fractions.length - 1; i++) {
                const earlier = computeOffsetRings(result, maxOffset * fractions[i]);
                const later = computeOffsetRings(result, maxOffset * fractions[i + 1]);
                for (const ring of later) {
                    for (const vertex of ring) {
                        if (!isInsideRingSet(vertex, earlier, TOLERANCE)) {
                            escapes.push(
                                `a vertex at ${fractions[i + 1]} of the maximum offset lies outside the ` +
                                `wavefront at ${fractions[i]}`);
                        }
                    }
                }
            }
            expect(escapes.join('; ')).toBe('');
        });
    });

    describe('ring shape across the fixture sweep', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const result = solvedFixture(name);
            const maxOffset = computeMaxOffset(result);

            const problems: string[] = [];
            for (const fraction of [0.05, 0.25, 0.5, 0.75]) {
                const offset = maxOffset * fraction;
                for (const [index, ring] of computeOffsetRings(result, offset).entries()) {
                    if (ring.length < 3) {
                        problems.push(`ring ${index} at offset ${offset.toFixed(4)} has only ${ring.length} vertices`);
                        continue;
                    }
                    const first = ring[0];
                    const last = ring[ring.length - 1];
                    if (Math.hypot(first.x - last.x, first.y - last.y) < TOLERANCE) {
                        problems.push(`ring ${index} at offset ${offset.toFixed(4)} repeats its closing vertex`);
                    }
                    const crossings = selfIntersections(ring);
                    if (crossings.length > 0) {
                        problems.push(
                            `ring ${index} at offset ${offset.toFixed(4)} self-intersects: ${crossings.join(', ')}`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });
    });

    describe('the wavefront splits into several rings', () => {
        it('pinches a long acute fixture into two rings a quarter of the way in', () => {
            const result = solvedFixture('Long Unbroken Side Then Extreme Acute Angle');
            const rings = computeOffsetRings(result, computeMaxOffset(result) * 0.25);
            expect(rings).toHaveLength(2);
            for (const ring of rings) {
                expect(ring.length).toBeGreaterThanOrEqual(3);
                expect(Math.abs(signedRingArea(ring))).toBeGreaterThan(0);
            }
        });

        it('pinches the duck octagon into two rings halfway in', () => {
            const result = solvedFixture('Duck Octagon (passes)');
            expect(computeOffsetRings(result, computeMaxOffset(result) * 0.5)).toHaveLength(2);
        });

        it('produces three rings for a fixture with two separate pinches', () => {
            const result = solvedFixture('Incorrect Ordering e38-e30 Collision');
            expect(computeOffsetRings(result, computeMaxOffset(result) * 0.25)).toHaveLength(3);
        });

        it('is not a quirk of three hand-picked fixtures', () => {
            const splitting = ALL_TEST_POLYGONS.filter(({vertices}) => {
                const result = solveSkeleton(vertices);
                if (!result.complete || result.context === null) {
                    return false;
                }
                const maxOffset = computeMaxOffset(result);
                for (let i = 1; i < 20; i++) {
                    if (computeOffsetRings(result, (maxOffset * i) / 20).length > 1) {
                        return true;
                    }
                }
                return false;
            });
            expect(splitting.length).toBeGreaterThanOrEqual(5);
        });
    });
});
