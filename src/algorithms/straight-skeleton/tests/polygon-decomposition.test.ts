import {Vector2} from '@/algorithms/straight-skeleton/types';
import {
    findFirstCrossing,
    splitAtCrossing,
    decomposePolygon,
    ensureClockwise,
    CrossingPoint,
} from '@/algorithms/straight-skeleton/polygon-decomposition';
import {signedArea, isClockwise} from '@/algorithms/random-polygon/geometry-helpers';

// Helpers
const V = (x: number, y: number): Vector2 => ({x, y});

describe('polygon-decomposition', () => {

    describe('findFirstCrossing', () => {
        it('returns null for a simple triangle', () => {
            const tri = [V(0, 0), V(10, 0), V(5, -10)]; // clockwise
            expect(findFirstCrossing(tri)).toBeNull();
        });

        it('returns null for a simple square', () => {
            const sq = [V(0, 0), V(10, 0), V(10, -10), V(0, -10)]; // clockwise
            expect(findFirstCrossing(sq)).toBeNull();
        });

        it('finds a crossing in a figure-8 (bowtie) quad', () => {
            // Edges 0→1 and 2→3 cross
            const bowtie = [V(0, 0), V(10, -10), V(10, 0), V(0, -10)];
            const crossing = findFirstCrossing(bowtie);
            expect(crossing).not.toBeNull();
            expect(crossing!.edgeI).toBe(0);
            expect(crossing!.edgeJ).toBe(2);
            expect(crossing!.point.x).toBeCloseTo(5);
            expect(crossing!.point.y).toBeCloseTo(-5);
        });

        it('finds a crossing when a vertex pokes through an opposing edge', () => {
            // Pentagon where vertex 2 pokes through edge 4→0
            // Normal pentagon (CW): (0,0), (10,0), (5,-8), (10,-15), (0,-15)
            // Move vertex 2 past edge 4→0 so it crosses
            const poke = [V(0, 0), V(10, 0), V(-5, -5), V(10, -15), V(0, -15)];
            const crossing = findFirstCrossing(poke);
            expect(crossing).not.toBeNull();
        });

        it('skips endpoint-only touches (shared vertices)', () => {
            // A simple polygon where edges share vertices but don't cross
            const poly = [V(0, 0), V(5, 0), V(10, 0), V(10, -10), V(0, -10)];
            // Edge 0→1 and 1→2 are collinear but share vertex 1 — not a crossing
            expect(findFirstCrossing(poly)).toBeNull();
        });
    });

    describe('splitAtCrossing', () => {
        it('splits a bowtie into sub-polygons', () => {
            const bowtie = [V(0, 0), V(10, -10), V(10, 0), V(0, -10)];
            const crossing: CrossingPoint = {
                point: V(5, -5),
                edgeI: 0,
                edgeJ: 2,
                tI: 0.5,
                tJ: 0.5,
            };
            const subs = splitAtCrossing(bowtie, crossing);
            // One or both triangles should be valid (CW, non-degenerate)
            expect(subs.length).toBeGreaterThanOrEqual(1);
            for (const sub of subs) {
                expect(sub.length).toBeGreaterThanOrEqual(3);
                expect(isClockwise(sub)).toBe(true);
            }
        });

        it('discards counter-clockwise exterior islands', () => {
            const bowtie = [V(0, 0), V(10, -10), V(10, 0), V(0, -10)];
            const crossing: CrossingPoint = {
                point: V(5, -5),
                edgeI: 0,
                edgeJ: 2,
                tI: 0.5,
                tJ: 0.5,
            };
            const subs = splitAtCrossing(bowtie, crossing);
            // All returned sub-polygons must be clockwise
            for (const sub of subs) {
                expect(signedArea(sub)).toBeLessThan(0);
            }
        });
    });

    describe('decomposePolygon', () => {
        it('returns a simple polygon unchanged', () => {
            const sq = [V(0, 0), V(10, 0), V(10, -10), V(0, -10)];
            const result = decomposePolygon(sq);
            expect(result.wasSelfIntersecting).toBe(false);
            expect(result.subPolygons.length).toBe(1);
            expect(result.crossingPoints.length).toBe(0);
        });

        it('decomposes a figure-8 into sub-polygons', () => {
            const bowtie = [V(0, 0), V(10, -10), V(10, 0), V(0, -10)];
            const result = decomposePolygon(bowtie);
            expect(result.wasSelfIntersecting).toBe(true);
            expect(result.subPolygons.length).toBeGreaterThanOrEqual(1);
            expect(result.crossingPoints.length).toBeGreaterThanOrEqual(1);
            // All sub-polygons are clockwise
            for (const sub of result.subPolygons) {
                expect(isClockwise(sub)).toBe(true);
            }
        });

        it('handles a vertex poke-through creating two crossings and three regions', () => {
            // Hexagon where vertex 3 is pulled through edge 0→1
            // Original hex (CW): roughly a convex shape
            // Move vertex 3 past edge 0→1 to create a poke-through
            const hex = [
                V(0, 0),   // 0
                V(20, 0),  // 1
                V(25, -10),// 2
                V(10, 5),  // 3  — poked above edge 0→1 (y=0 line)
                V(-5, -10),// 4
                V(-5, -5), // 5
            ];
            const result = decomposePolygon(hex);
            expect(result.wasSelfIntersecting).toBe(true);
            // Should produce at least 2 valid sub-polygons (up to 3 depending on exterior island filtering)
            expect(result.subPolygons.length).toBeGreaterThanOrEqual(2);
            expect(result.crossingPoints.length).toBeGreaterThanOrEqual(2);
            // All sub-polygons are clockwise and simple
            for (const sub of result.subPolygons) {
                expect(isClockwise(sub)).toBe(true);
                expect(sub.length).toBeGreaterThanOrEqual(3);
                expect(findFirstCrossing(sub)).toBeNull();
            }
        });

        it('all returned sub-polygons are simple (no self-intersections)', () => {
            // A complex self-intersecting polygon
            const complex = [
                V(0, 0), V(20, -20), V(20, 0), V(0, -20), // two crossings creating a butterfly
            ];
            const result = decomposePolygon(complex);
            for (const sub of result.subPolygons) {
                expect(findFirstCrossing(sub)).toBeNull();
            }
        });
    });

    describe('ensureClockwise', () => {
        it('returns clockwise polygon unchanged', () => {
            const cw = [V(0, 0), V(10, 0), V(10, -10), V(0, -10)];
            const result = ensureClockwise(cw);
            expect(isClockwise(result)).toBe(true);
            expect(result).toEqual(cw);
        });

        it('reverses a counter-clockwise polygon', () => {
            const ccw = [V(0, 0), V(0, -10), V(10, -10), V(10, 0)];
            expect(isClockwise(ccw)).toBe(false);
            const result = ensureClockwise(ccw);
            expect(isClockwise(result)).toBe(true);
        });
    });
});
