import {computeStraightSkeleton} from '../algorithm';
import {runAlgorithmV5} from '../algorithm-termination-cases';
import {initBoundingPolygon} from "@/algorithms/straight-skeleton/graph-helpers";
import {interiorNodes} from '../test-cases/test-helpers';
import {
    TRIANGLE,
    SQUARE,
    RECTANGLE,
    PENTAGON_HOUSE,
} from '../test-cases/test-constants';

// ---------------------------------------------------------------------------
// Shape-specific interior node counts
// (regression.test.ts checks generic invariants; these pin exact counts)
// ---------------------------------------------------------------------------

describe('runAlgorithmV5 — interior node count', () => {
    it('triangle: 1 interior node', () => {
        expect(interiorNodes(runAlgorithmV5(TRIANGLE).graph)).toHaveLength(1);
    });

    it('square: 1 interior node', () => {
        expect(interiorNodes(runAlgorithmV5(SQUARE).graph)).toHaveLength(1);
    });

    it('rectangle: 2 interior nodes', () => {
        expect(interiorNodes(runAlgorithmV5(RECTANGLE).graph)).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// Shape-specific interior node positions
// ---------------------------------------------------------------------------

describe('runAlgorithmV5 — interior node positions', () => {
    it('triangle: single interior node at incenter (2, √5−1)', () => {
        const g = runAlgorithmV5(TRIANGLE).graph;
        const [node] = interiorNodes(g);
        expect(node.position.x).toBeCloseTo(2, 4);
        expect(node.position.y).toBeCloseTo(Math.sqrt(5) - 1, 4);
    });

    it('square: single interior node at center (1, 1)', () => {
        const g = runAlgorithmV5(SQUARE).graph;
        const [node] = interiorNodes(g);
        expect(node.position.x).toBeCloseTo(1, 4);
        expect(node.position.y).toBeCloseTo(1, 4);
    });

    it('rectangle: two interior nodes at (1, 1) and (3, 1) sorted by x', () => {
        const g = runAlgorithmV5(RECTANGLE).graph;
        const nodes = interiorNodes(g).sort((a, b) => a.position.x - b.position.x);
        expect(nodes[0].position.x).toBeCloseTo(1, 4);
        expect(nodes[0].position.y).toBeCloseTo(1, 4);
        expect(nodes[1].position.x).toBeCloseTo(3, 4);
        expect(nodes[1].position.y).toBeCloseTo(1, 4);
    });
});

// ---------------------------------------------------------------------------
// Degenerate inputs — must not throw (uses V1 computeStraightSkeleton)
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — degenerate inputs', () => {
    it('empty array: does not throw', () => {
        expect(() => computeStraightSkeleton([])).not.toThrow();
    });

    it('single vertex: does not throw', () => {
        expect(() => computeStraightSkeleton([{x: 0, y: 0}])).not.toThrow();
    });

    it('two vertices: does not throw', () => {
        expect(() => computeStraightSkeleton([{x: 0, y: 0}, {x: 1, y: 0}])).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// Pentagon house — shape-specific checks
// ---------------------------------------------------------------------------

describe('Pentagon house — V5', () => {
    it('should have 5 exterior edges after init', () => {
        const g = initBoundingPolygon(PENTAGON_HOUSE);
        expect(g.edges.length).toBe(5);
    });

    it('should have 7 nodes', () => {
        const ctx = runAlgorithmV5(PENTAGON_HOUSE);
        expect(ctx.graph.nodes.length).toBe(7);
    });
});
