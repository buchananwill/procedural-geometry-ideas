import {runAlgorithmV5} from './algorithm-termination-cases';
import type {StraightSkeletonGraph, Vector2} from './types';
import {TRIANGLE} from './test-constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const interiorNodes = (g: StraightSkeletonGraph) => g.nodes.slice(g.numExteriorNodes);

function sideLength(p1: Vector2, p2: Vector2): number {
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

/** Incenter via side-length-weighted vertex average: I = (a*A + b*B + c*C) / (a+b+c) */
function incenter(A: Vector2, B: Vector2, C: Vector2): Vector2 {
    const a = sideLength(B, C); // side opposite A
    const b = sideLength(A, C); // side opposite B
    const c = sideLength(A, B); // side opposite C
    const P = a + b + c;
    return {
        x: (a * A.x + b * B.x + c * C.x) / P,
        y: (a * A.y + b * B.y + c * C.y) / P,
    };
}

// ---------------------------------------------------------------------------
// Triangle constants — vertices clockwise
// ---------------------------------------------------------------------------

const RIGHT_TRIANGLE_EVEN: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 4}, {x: 4, y: 0}];
const RIGHT_TRIANGLE_ACUTE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 1}, {x: 10, y: 0}];
const EQUILATERAL: Vector2[] = [{x: 0, y: 0}, {x: 1, y: Math.sqrt(3)}, {x: 2, y: 0}];
const ISOSCELES_NARROW: Vector2[] = [{x: 0, y: 0}, {x: 1, y: 10}, {x: 2, y: 0}];
const ISOSCELES_WIDE: Vector2[] = [{x: 0, y: 0}, {x: 5, y: 1}, {x: 10, y: 0}];

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const TRIANGLES: { name: string; vertices: Vector2[] }[] = [
    {name: 'RIGHT_TRIANGLE_EVEN', vertices: RIGHT_TRIANGLE_EVEN},
    {name: 'RIGHT_TRIANGLE_ACUTE', vertices: RIGHT_TRIANGLE_ACUTE},
    {name: 'EQUILATERAL', vertices: EQUILATERAL},
    {name: 'ISOSCELES_NARROW', vertices: ISOSCELES_NARROW},
    {name: 'ISOSCELES_WIDE', vertices: ISOSCELES_WIDE},
    {name: 'TRIANGLE', vertices: TRIANGLE},
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RunAlgorithmV5 — triangles', () => {
    describe.each(TRIANGLES)('$name', ({vertices}) => {
        it('does not throw', () => {
            expect(() => runAlgorithmV5(vertices)).not.toThrow();
        });

        it('produces exactly 1 interior node', () => {
            const context = runAlgorithmV5(vertices);
            expect(interiorNodes(context.graph)).toHaveLength(1);
        });

        it('interior node is at the incenter', () => {
            const context = runAlgorithmV5(vertices);
            const [node] = interiorNodes(context.graph);
            const expected = incenter(vertices[0], vertices[1], vertices[2]);
            expect(node.position.x).toBeCloseTo(expected.x, 4);
            expect(node.position.y).toBeCloseTo(expected.y, 4);
        });

        it('all exterior edges are accepted', () => {
            const context = runAlgorithmV5(vertices);
            for (let i = 0; i < context.graph.numExteriorNodes; i++) {
                expect(context.acceptedEdges[i]).toBe(true);
            }
        });
    });
});
