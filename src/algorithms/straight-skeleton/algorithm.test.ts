import { computeStraightSkeleton } from './algorithm';
import type { StraightSkeletonGraph, Vector2 } from './types';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TRIANGLE: Vector2[]  = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 4 }];
const SQUARE: Vector2[]    = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
const RECTANGLE: Vector2[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const interiorNodes = (g: StraightSkeletonGraph) => g.nodes.slice(g.numExteriorNodes);

function boundingBox(verts: Vector2[]) {
    const xs = verts.map(v => v.x);
    const ys = verts.map(v => v.y);
    return {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
    };
}

// ---------------------------------------------------------------------------
// 1. Return type and termination
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — return type and termination', () => {
    it('returns a graph for a triangle without throwing', () => {
        expect(() => computeStraightSkeleton(TRIANGLE)).not.toThrow();
        const g = computeStraightSkeleton(TRIANGLE);
        expect(g).toBeDefined();
        expect(typeof g.numExteriorNodes).toBe('number');
    });

    it('returns a graph for a square without throwing', () => {
        expect(() => computeStraightSkeleton(SQUARE)).not.toThrow();
        expect(computeStraightSkeleton(SQUARE)).toBeDefined();
    });

    it('returns a graph for a rectangle without throwing', () => {
        expect(() => computeStraightSkeleton(RECTANGLE)).not.toThrow();
        expect(computeStraightSkeleton(RECTANGLE)).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// 2. Exterior node count
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — exterior node count', () => {
    it('triangle: numExteriorNodes === 3', () => {
        expect(computeStraightSkeleton(TRIANGLE).numExteriorNodes).toBe(3);
    });

    it('square: numExteriorNodes === 4', () => {
        expect(computeStraightSkeleton(SQUARE).numExteriorNodes).toBe(4);
    });

    it('rectangle: numExteriorNodes === 4', () => {
        expect(computeStraightSkeleton(RECTANGLE).numExteriorNodes).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// 3. Interior node count
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — interior node count', () => {
    it('triangle: 1 interior node', () => {
        expect(interiorNodes(computeStraightSkeleton(TRIANGLE))).toHaveLength(1);
    });

    it('square: 1 interior node', () => {
        expect(interiorNodes(computeStraightSkeleton(SQUARE))).toHaveLength(1);
    });

    it('rectangle: 2 interior nodes', () => {
        expect(interiorNodes(computeStraightSkeleton(RECTANGLE))).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// 4. Interior edge count
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — interior edge count', () => {
    it('triangle: 3 interior edges', () => {
        expect(computeStraightSkeleton(TRIANGLE).interiorEdges).toHaveLength(3);
    });

    it('square: 4 interior edges', () => {
        expect(computeStraightSkeleton(SQUARE).interiorEdges).toHaveLength(4);
    });

    it('rectangle: 5 interior edges (4 initial + 1 ridge)', () => {
        expect(computeStraightSkeleton(RECTANGLE).interiorEdges).toHaveLength(5);
    });

    it('triangle: total edges = numExteriorNodes + interiorEdges.length', () => {
        const g = computeStraightSkeleton(TRIANGLE);
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });

    it('square: total edges = numExteriorNodes + interiorEdges.length', () => {
        const g = computeStraightSkeleton(SQUARE);
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });

    it('rectangle: total edges = numExteriorNodes + interiorEdges.length', () => {
        const g = computeStraightSkeleton(RECTANGLE);
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });
});

// ---------------------------------------------------------------------------
// 5. Interior node positions
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — interior node positions', () => {
    it('triangle: single interior node at incenter (2, √5−1)', () => {
        const g = computeStraightSkeleton(TRIANGLE);
        const [node] = interiorNodes(g);
        expect(node.position.x).toBeCloseTo(2, 4);
        expect(node.position.y).toBeCloseTo(Math.sqrt(5) - 1, 4);
    });

    it('square: single interior node at center (1, 1)', () => {
        const g = computeStraightSkeleton(SQUARE);
        const [node] = interiorNodes(g);
        expect(node.position.x).toBeCloseTo(1, 4);
        expect(node.position.y).toBeCloseTo(1, 4);
    });

    it('rectangle: two interior nodes at (1, 1) and (3, 1) sorted by x', () => {
        const g = computeStraightSkeleton(RECTANGLE);
        const nodes = interiorNodes(g).sort((a, b) => a.position.x - b.position.x);
        expect(nodes[0].position.x).toBeCloseTo(1, 4);
        expect(nodes[0].position.y).toBeCloseTo(1, 4);
        expect(nodes[1].position.x).toBeCloseTo(3, 4);
        expect(nodes[1].position.y).toBeCloseTo(1, 4);
    });
});

// ---------------------------------------------------------------------------
// 6. All exterior nodes have at least one outgoing interior edge
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — exterior nodes have interior out-edges', () => {
    function allExteriorNodesHaveInteriorOutEdge(g: StraightSkeletonGraph): boolean {
        for (let i = 0; i < g.numExteriorNodes; i++) {
            const hasInterior = g.nodes[i].outEdges.some(eid => eid >= g.numExteriorNodes);
            if (!hasInterior) return false;
        }
        return true;
    }

    it('triangle: every exterior node has an outgoing interior edge', () => {
        expect(allExteriorNodesHaveInteriorOutEdge(computeStraightSkeleton(TRIANGLE))).toBe(true);
    });

    it('square: every exterior node has an outgoing interior edge', () => {
        expect(allExteriorNodesHaveInteriorOutEdge(computeStraightSkeleton(SQUARE))).toBe(true);
    });

    it('rectangle: every exterior node has an outgoing interior edge', () => {
        expect(allExteriorNodesHaveInteriorOutEdge(computeStraightSkeleton(RECTANGLE))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 7. Interior nodes lie strictly inside the polygon bounding box
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — interior nodes inside bounding box', () => {
    function allInteriorNodesInsideBBox(g: StraightSkeletonGraph, verts: Vector2[]): boolean {
        const bb = boundingBox(verts);
        return interiorNodes(g).every(n =>
            n.position.x > bb.minX && n.position.x < bb.maxX &&
            n.position.y > bb.minY && n.position.y < bb.maxY
        );
    }

    it('triangle: interior nodes inside bounding box', () => {
        expect(allInteriorNodesInsideBBox(computeStraightSkeleton(TRIANGLE), TRIANGLE)).toBe(true);
    });

    it('square: interior nodes inside bounding box', () => {
        expect(allInteriorNodesInsideBBox(computeStraightSkeleton(SQUARE), SQUARE)).toBe(true);
    });

    it('rectangle: interior nodes inside bounding box', () => {
        expect(allInteriorNodesInsideBBox(computeStraightSkeleton(RECTANGLE), RECTANGLE)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 8. Degenerate inputs — must not throw
// ---------------------------------------------------------------------------

describe('computeStraightSkeleton — degenerate inputs', () => {
    it('empty array: does not throw', () => {
        expect(() => computeStraightSkeleton([])).not.toThrow();
    });

    it('single vertex: does not throw', () => {
        expect(() => computeStraightSkeleton([{ x: 0, y: 0 }])).not.toThrow();
    });

    it('two vertices: does not throw', () => {
        expect(() => computeStraightSkeleton([{ x: 0, y: 0 }, { x: 1, y: 0 }])).not.toThrow();
    });
});
