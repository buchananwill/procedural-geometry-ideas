import {computeStraightSkeleton} from './algorithm';
import {runAlgorithmV5} from './algorithm-termination-cases';
import type {StraightSkeletonGraph, Vector2} from './types';
import {initBoundingPolygon} from "@/algorithms/straight-skeleton/graph-helpers";
import {
    TRIANGLE,
    SQUARE,
    RECTANGLE,
    PENTAGON_HOUSE,
    IMPOSSIBLE_OCTAGON,
} from './test-cases/test-constants';

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

describe('runAlgorithmV5 — return type and termination', () => {
    it('returns a context for a triangle without throwing', () => {
        expect(() => runAlgorithmV5(TRIANGLE)).not.toThrow();
        const ctx = runAlgorithmV5(TRIANGLE);
        expect(ctx).toBeDefined();
        expect(typeof ctx.graph.numExteriorNodes).toBe('number');
    });

    it('returns a context for a square without throwing', () => {
        expect(() => runAlgorithmV5(SQUARE)).not.toThrow();
        expect(runAlgorithmV5(SQUARE)).toBeDefined();
    });

    it('returns a context for a rectangle without throwing', () => {
        expect(() => runAlgorithmV5(RECTANGLE)).not.toThrow();
        expect(runAlgorithmV5(RECTANGLE)).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// 2. Exterior node count
// ---------------------------------------------------------------------------

describe('runAlgorithmV5 — exterior node count', () => {
    it('triangle: numExteriorNodes === 3', () => {
        expect(runAlgorithmV5(TRIANGLE).graph.numExteriorNodes).toBe(3);
    });

    it('square: numExteriorNodes === 4', () => {
        expect(runAlgorithmV5(SQUARE).graph.numExteriorNodes).toBe(4);
    });

    it('rectangle: numExteriorNodes === 4', () => {
        expect(runAlgorithmV5(RECTANGLE).graph.numExteriorNodes).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// 3. Interior node count
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
// 4. Interior edge count
// ---------------------------------------------------------------------------

describe('runAlgorithmV5 — interior edge count', () => {
    it('triangle: 3 interior edges', () => {
        expect(runAlgorithmV5(TRIANGLE).graph.interiorEdges).toHaveLength(3);
    });

    it('square: 4 interior edges', () => {
        expect(runAlgorithmV5(SQUARE).graph.interiorEdges).toHaveLength(4);
    });

    it('rectangle: 6 interior edges (4 initial + 2 ridges)', () => {
        expect(runAlgorithmV5(RECTANGLE).graph.interiorEdges).toHaveLength(6);
    });

    it('triangle: total edges = numExteriorNodes + interiorEdges.length', () => {
        const g = runAlgorithmV5(TRIANGLE).graph;
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });

    it('square: total edges = numExteriorNodes + interiorEdges.length', () => {
        const g = runAlgorithmV5(SQUARE).graph;
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });

    it('rectangle: total edges = numExteriorNodes + interiorEdges.length', () => {
        const g = runAlgorithmV5(RECTANGLE).graph;
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });
});

// ---------------------------------------------------------------------------
// 5. Interior node positions
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
// 6. All exterior nodes have at least one outgoing interior edge
// ---------------------------------------------------------------------------

describe('runAlgorithmV5 — exterior nodes have interior out-edges', () => {
    function allExteriorNodesHaveInteriorOutEdge(g: StraightSkeletonGraph): boolean {
        for (let i = 0; i < g.numExteriorNodes; i++) {
            const hasInterior = g.nodes[i].outEdges.some(eid => eid >= g.numExteriorNodes);
            if (!hasInterior) return false;
        }
        return true;
    }

    it('triangle: every exterior node has an outgoing interior edge', () => {
        expect(allExteriorNodesHaveInteriorOutEdge(runAlgorithmV5(TRIANGLE).graph)).toBe(true);
    });

    it('square: every exterior node has an outgoing interior edge', () => {
        expect(allExteriorNodesHaveInteriorOutEdge(runAlgorithmV5(SQUARE).graph)).toBe(true);
    });

    it('rectangle: every exterior node has an outgoing interior edge', () => {
        expect(allExteriorNodesHaveInteriorOutEdge(runAlgorithmV5(RECTANGLE).graph)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 7. Interior nodes lie strictly inside the polygon bounding box
// ---------------------------------------------------------------------------

describe('runAlgorithmV5 — interior nodes inside bounding box', () => {
    function allInteriorNodesInsideBBox(g: StraightSkeletonGraph, verts: Vector2[]): boolean {
        const bb = boundingBox(verts);
        return interiorNodes(g).every(n =>
            n.position.x > bb.minX && n.position.x < bb.maxX &&
            n.position.y > bb.minY && n.position.y < bb.maxY
        );
    }

    it('triangle: interior nodes inside bounding box', () => {
        expect(allInteriorNodesInsideBBox(runAlgorithmV5(TRIANGLE).graph, TRIANGLE)).toBe(true);
    });

    it('square: interior nodes inside bounding box', () => {
        expect(allInteriorNodesInsideBBox(runAlgorithmV5(SQUARE).graph, SQUARE)).toBe(true);
    });

    it('rectangle: interior nodes inside bounding box', () => {
        expect(allInteriorNodesInsideBBox(runAlgorithmV5(RECTANGLE).graph, RECTANGLE)).toBe(true);
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
        expect(() => computeStraightSkeleton([{x: 0, y: 0}])).not.toThrow();
    });

    it('two vertices: does not throw', () => {
        expect(() => computeStraightSkeleton([{x: 0, y: 0}, {x: 1, y: 0}])).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// 9. IMPOSSIBLE_OCTAGON
// ---------------------------------------------------------------------------

describe('IMPOSSIBLE_OCTAGON — V5', () => {
    it('does not throw', () => {
        expect(() => runAlgorithmV5(IMPOSSIBLE_OCTAGON)).not.toThrow();
    });

    it('all exterior edges are accepted', () => {
        const ctx = runAlgorithmV5(IMPOSSIBLE_OCTAGON);
        const allExteriorAccepted = ctx.acceptedEdges
            .slice(0, ctx.graph.numExteriorNodes)
            .every(f => f);
        expect(allExteriorAccepted).toBe(true);
    });

    it('all interior nodes lie inside the bounding box', () => {
        const ctx = runAlgorithmV5(IMPOSSIBLE_OCTAGON);
        const bb = boundingBox(IMPOSSIBLE_OCTAGON);
        for (const n of interiorNodes(ctx.graph)) {
            expect(n.position.x).toBeGreaterThan(bb.minX);
            expect(n.position.x).toBeLessThan(bb.maxX);
            expect(n.position.y).toBeGreaterThan(bb.minY);
            expect(n.position.y).toBeLessThan(bb.maxY);
        }
    });

    it('total edge count equals numExteriorNodes + interiorEdges.length', () => {
        const ctx = runAlgorithmV5(IMPOSSIBLE_OCTAGON);
        const g = ctx.graph;
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });
});

// ---------------------------------------------------------------------------
// Pentagon house
// ---------------------------------------------------------------------------

describe('Pentagon house — V5', () => {
    it('should have 5 exterior edges after init', () => {
        const g = initBoundingPolygon(PENTAGON_HOUSE);
        expect(g.edges.length).toBe(5);
    });

    it('does not throw', () => {
        expect(() => runAlgorithmV5(PENTAGON_HOUSE)).not.toThrow();
    });

    it('should have 7 nodes', () => {
        const ctx = runAlgorithmV5(PENTAGON_HOUSE);
        expect(ctx.graph.nodes.length).toBe(7);
    });
})
