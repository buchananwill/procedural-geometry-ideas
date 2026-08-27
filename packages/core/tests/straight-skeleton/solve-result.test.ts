import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {isClockwise, runAlgorithmV5, runAlgorithmV5Stepped, solveSkeleton, Vector2} from '@proc-geo/core';

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

    /*
     * A non-finite coordinate is invisible to the bounding-box scan that opens normalisation —
     * every comparison against NaN is false — so before this validation existed it travelled the
     * whole pipeline and surfaced as `findOrAddNode`'s "non-finite position", naming a UNIT-SPACE
     * point and no vertex. These pin the rejection AT THE DOOR and pin the CALLER'S index in the
     * message, which is the whole content of the fix: an error that says which vertex.
     */
    describe('non-finite input', () => {
        const NON_FINITE_COORDINATES: readonly (readonly [string, number])[] = [
            ['NaN', NaN],
            ['Infinity', Infinity],
            ['-Infinity', -Infinity],
        ];

        const squareWith = (index: number, coordinate: 'x' | 'y', value: number): Vector2[] => {
            const vertices = CLOCKWISE_SQUARE.map(vertex => ({...vertex}));
            vertices[index][coordinate] = value;
            return vertices;
        };

        it.each(NON_FINITE_COORDINATES)('solveSkeleton rejects %s in x, naming the vertex', (_label, value) => {
            expect(() => solveSkeleton(squareWith(2, 'x', value)))
                .toThrow(`Vertex 2 is not finite: (${value}, 100).`);
        });

        it.each(NON_FINITE_COORDINATES)('solveSkeleton rejects %s in y, naming the vertex', (_label, value) => {
            expect(() => solveSkeleton(squareWith(1, 'y', value)))
                .toThrow(`Vertex 1 is not finite: (0, ${value}).`);
        });

        it('names the FIRST offending vertex when several are non-finite', () => {
            const vertices = CLOCKWISE_SQUARE.map(vertex => ({...vertex}));
            vertices[1].y = NaN;
            vertices[3].x = Infinity;

            expect(() => solveSkeleton(vertices)).toThrow('Vertex 1 is not finite');
        });

        it.each(NON_FINITE_COORDINATES)('runAlgorithmV5 rejects %s, naming the vertex', (_label, value) => {
            expect(() => runAlgorithmV5(squareWith(0, 'x', value)))
                .toThrow(`Vertex 0 is not finite: (${value}, 0).`);
        });

        it.each(NON_FINITE_COORDINATES)('runAlgorithmV5Stepped reports %s on error, naming the vertex', (_label, value) => {
            const result = runAlgorithmV5Stepped(squareWith(3, 'y', value));

            expect(result.snapshots).toEqual([]);
            expect(result.error).toContain(`Vertex 3 is not finite: (100, ${value}).`);
        });

        it('leaves a finite polygon untouched at all three entry points', () => {
            const result = solveSkeleton(CLOCKWISE_SQUARE);
            expect(result.complete).toBe(true);
            expect(result.diagnostics).toEqual([]);

            expect(runAlgorithmV5(CLOCKWISE_SQUARE).graph.nodes.length).toBeGreaterThan(4);
            expect(runAlgorithmV5Stepped(CLOCKWISE_SQUARE).error).toBeNull();
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
