import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {isClockwise, solveSkeleton, Vector2} from '@proc-geo/core';

/** Clockwise convex quad — the happy path. */
const CLOCKWISE_SQUARE: Vector2[] = [
    {x: 0, y: 0},
    {x: 0, y: 100},
    {x: 100, y: 100},
    {x: 100, y: 0},
];

const COUNTER_CLOCKWISE_SQUARE: Vector2[] = [...CLOCKWISE_SQUARE].reverse();

/**
 * Clockwise-wound pentagon whose final two edges both cross the top edge, so it exercises
 * the decompose-and-merge path without also tripping winding normalisation.
 */
const SELF_INTERSECTING_PENTAGON: Vector2[] = [
    {x: 0, y: 0},
    {x: 0, y: 100},
    {x: 100, y: 100},
    {x: 100, y: 0},
    {x: 60, y: 120},
];

describe('solveSkeleton', () => {
    describe('winding', () => {
        it('reports a clockwise convex polygon as complete with no diagnostics', () => {
            const result = solveSkeleton(CLOCKWISE_SQUARE);

            expect(result.complete).toBe(true);
            expect(result.diagnostics).toEqual([]);
            expect(result.context).not.toBeNull();
        });

        it('normalises counter-clockwise input and reports exactly one diagnostic', () => {
            expect(isClockwise(COUNTER_CLOCKWISE_SQUARE)).toBe(false);

            const result = solveSkeleton(COUNTER_CLOCKWISE_SQUARE);

            expect(result.complete).toBe(true);
            expect(result.diagnostics).toHaveLength(1);
            expect(result.diagnostics[0].kind).toBe('winding-normalised');
            expect(result.context).not.toBeNull();
        });

        it('produces an equivalent graph for reversed input', () => {
            const clockwise = solveSkeleton(CLOCKWISE_SQUARE);
            const reversed = solveSkeleton(COUNTER_CLOCKWISE_SQUARE);

            expect(reversed.graph.nodes.length).toBe(clockwise.graph.nodes.length);
            expect(reversed.graph.interiorEdges.length).toBe(clockwise.graph.interiorEdges.length);
            expect(reversed.graph.numExteriorNodes).toBe(clockwise.graph.numExteriorNodes);
        });

        it('reports counter-clockwise input as incomplete when normalisation is disabled', () => {
            const result = solveSkeleton(COUNTER_CLOCKWISE_SQUARE, {normaliseWinding: false});

            expect(result.complete).toBe(false);
            expect(result.diagnostics.map(d => d.kind)).not.toContain('winding-normalised');
            expect(result.diagnostics.some(d => d.kind === 'unresolved-edges')).toBe(true);
        });
    });

    describe('self-intersecting input', () => {
        it('returns a null context and a self-intersecting diagnostic', () => {
            const result = solveSkeleton(SELF_INTERSECTING_PENTAGON);

            expect(result.context).toBeNull();
            expect(result.diagnostics.some(d => d.kind === 'self-intersecting')).toBe(true);
            expect(result.graph.nodes.length).toBeGreaterThan(0);
        });
    });

    describe('invalid input', () => {
        it('throws for fewer than three vertices', () => {
            expect(() => solveSkeleton([{x: 0, y: 0}, {x: 100, y: 0}])).toThrow();
            expect(() => solveSkeleton([])).toThrow();
        });
    });

    describe('fixture sweep', () => {
        it.each(ALL_TEST_POLYGONS)('$name solves completely', ({vertices}) => {
            const result = solveSkeleton(vertices);

            expect(result.diagnostics.filter(d => d.kind === 'step-failure')).toEqual([]);
            expect(result.diagnostics.filter(d => d.kind === 'unresolved-edges')).toEqual([]);
            expect(result.complete).toBe(true);
        });
    });
});
