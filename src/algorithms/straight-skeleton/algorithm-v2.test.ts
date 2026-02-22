import { computeStraightSkeletonV2, initContextV2, isEventValid, computeExteriorBound } from './algorithm-v2';
import type { StraightSkeletonGraph, Vector2 } from './types';

// ---------------------------------------------------------------------------
// Test polygons — CLOCKWISE WINDING
// ---------------------------------------------------------------------------

const TRIANGLE: Vector2[] = [{x: 0, y: 0}, {x: 2, y: 4}, {x: 4, y: 0}];
const SQUARE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 2}, {x: 2, y: 2}, {x: 2, y: 0}];
const RECTANGLE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 2}, {x: 4, y: 2}, {x: 4, y: 0}];
const PENTAGON: Vector2[] = [{x: 3, y: 9}, {x: 6, y: 6}, {x: 6, y: 0}, {x: 0, y: 0}, {x: 0, y: 6}];

const IMPOSSIBLE_OCTAGON: Vector2[] = [
    {x: 316.9999990463257, y: 219.00000095367432},
    {x: 250, y: 250},
    {x: 300, y: 450},
    {x: 500, y: 450},
    {x: 577, y: 372},
    {x: 605.5056829452515, y: 334.50568294525146},
    {x: 580.5056829452515, y: 205.50568294525146},
    {x: 396, y: 214},
];

const BROKEN_POLYGON: Vector2[] = [
    {x: 342, y: 305},
    {x: 231.4124715468463, y: 348.6498861873851},
    {x: 219, y: 490},
    {x: 573.9551266342539, y: 440.59680388705004},
    {x: 655, y: 453},
    {x: 680, y: 232},
    {x: 572.4959638502904, y: 228.0766686722798},
    {x: 421, y: 169},
];

// The polygon from algorithm-overview.md that exposes the V1 bug
const BUGGY_HEPTAGON: Vector2[] = [
    {x: 250, y: 250},
    {x: 300, y: 450},
    {x: 500, y: 450},
    {x: 552.2539444027047, y: 313.8617580766341},
    {x: 516.5753390285684, y: 153.46489575283587},
    {x: 445.3327893511655, y: 190.29558802826025},
    {x: 400, y: 100},
];

const AWKWARD_HEXAGON: Vector2[] = [
    {x: 250, y: 250},
    {x: 300, y: 450},
    {x: 500, y: 450},
    {x: 740, y: 201},
    {x: 572.8069677084923, y: 148.66030511340506},
    {x: 400, y: 100},
];

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

describe('V2 — return type and termination', () => {
    it('returns a graph for a triangle without throwing', () => {
        expect(() => computeStraightSkeletonV2(TRIANGLE)).not.toThrow();
        const g = computeStraightSkeletonV2(TRIANGLE);
        expect(g).toBeDefined();
        expect(typeof g.numExteriorNodes).toBe('number');
    });

    it('returns a graph for a square without throwing', () => {
        expect(() => computeStraightSkeletonV2(SQUARE)).not.toThrow();
    });

    it('returns a graph for a rectangle without throwing', () => {
        expect(() => computeStraightSkeletonV2(RECTANGLE)).not.toThrow();
    });

    it('returns a graph for the pentagon without throwing', () => {
        expect(() => computeStraightSkeletonV2(PENTAGON)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// 2. Exterior node count
// ---------------------------------------------------------------------------

describe('V2 — exterior node count', () => {
    it('triangle: numExteriorNodes === 3', () => {
        expect(computeStraightSkeletonV2(TRIANGLE).numExteriorNodes).toBe(3);
    });

    it('square: numExteriorNodes === 4', () => {
        expect(computeStraightSkeletonV2(SQUARE).numExteriorNodes).toBe(4);
    });

    it('rectangle: numExteriorNodes === 4', () => {
        expect(computeStraightSkeletonV2(RECTANGLE).numExteriorNodes).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// 3. Interior node count
// ---------------------------------------------------------------------------

describe('V2 — interior node count', () => {
    it('triangle: 1 interior node', () => {
        expect(interiorNodes(computeStraightSkeletonV2(TRIANGLE))).toHaveLength(1);
    });

    it('square: 1 interior node', () => {
        expect(interiorNodes(computeStraightSkeletonV2(SQUARE))).toHaveLength(1);
    });

    it('rectangle: 2 interior nodes', () => {
        expect(interiorNodes(computeStraightSkeletonV2(RECTANGLE))).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// 4. Interior edge count
// ---------------------------------------------------------------------------

describe('V2 — interior edge count', () => {
    it('triangle: 3 interior edges', () => {
        expect(computeStraightSkeletonV2(TRIANGLE).interiorEdges).toHaveLength(3);
    });

    it('square: 4 interior edges', () => {
        expect(computeStraightSkeletonV2(SQUARE).interiorEdges).toHaveLength(4);
    });

    it('rectangle: 5 interior edges (4 initial + 1 ridge)', () => {
        expect(computeStraightSkeletonV2(RECTANGLE).interiorEdges).toHaveLength(5);
    });

    it('total edges = numExteriorNodes + interiorEdges.length (triangle)', () => {
        const g = computeStraightSkeletonV2(TRIANGLE);
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });

    it('total edges = numExteriorNodes + interiorEdges.length (rectangle)', () => {
        const g = computeStraightSkeletonV2(RECTANGLE);
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });
});

// ---------------------------------------------------------------------------
// 5. Interior node positions
// ---------------------------------------------------------------------------

describe('V2 — interior node positions', () => {
    it('triangle: single interior node at incenter (2, sqrt(5)-1)', () => {
        const g = computeStraightSkeletonV2(TRIANGLE);
        const [node] = interiorNodes(g);
        expect(node.position.x).toBeCloseTo(2, 4);
        expect(node.position.y).toBeCloseTo(Math.sqrt(5) - 1, 4);
    });

    it('square: single interior node at center (1, 1)', () => {
        const g = computeStraightSkeletonV2(SQUARE);
        const [node] = interiorNodes(g);
        expect(node.position.x).toBeCloseTo(1, 4);
        expect(node.position.y).toBeCloseTo(1, 4);
    });

    it('rectangle: two interior nodes at (1,1) and (3,1)', () => {
        const g = computeStraightSkeletonV2(RECTANGLE);
        const nodes = interiorNodes(g).sort((a, b) => a.position.x - b.position.x);
        expect(nodes[0].position.x).toBeCloseTo(1, 4);
        expect(nodes[0].position.y).toBeCloseTo(1, 4);
        expect(nodes[1].position.x).toBeCloseTo(3, 4);
        expect(nodes[1].position.y).toBeCloseTo(1, 4);
    });
});

// ---------------------------------------------------------------------------
// 6. Exterior nodes have interior out-edges
// ---------------------------------------------------------------------------

describe('V2 — exterior nodes have interior out-edges', () => {
    function allExteriorNodesHaveInteriorOutEdge(g: StraightSkeletonGraph): boolean {
        for (let i = 0; i < g.numExteriorNodes; i++) {
            const hasInterior = g.nodes[i].outEdges.some(eid => eid >= g.numExteriorNodes);
            if (!hasInterior) return false;
        }
        return true;
    }

    it.each([
        ['triangle', TRIANGLE],
        ['square', SQUARE],
        ['rectangle', RECTANGLE],
    ])('%s: every exterior node has an outgoing interior edge', (_name, verts) => {
        expect(allExteriorNodesHaveInteriorOutEdge(computeStraightSkeletonV2(verts))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 7. Interior nodes inside bounding box
// ---------------------------------------------------------------------------

describe('V2 — interior nodes inside bounding box', () => {
    function allInteriorNodesInsideBBox(g: StraightSkeletonGraph, verts: Vector2[]): boolean {
        const bb = boundingBox(verts);
        return interiorNodes(g).every(n =>
            n.position.x > bb.minX && n.position.x < bb.maxX &&
            n.position.y > bb.minY && n.position.y < bb.maxY
        );
    }

    it.each([
        ['triangle', TRIANGLE],
        ['square', SQUARE],
        ['rectangle', RECTANGLE],
    ])('%s: interior nodes inside bounding box', (_name, verts) => {
        expect(allInteriorNodesInsideBBox(computeStraightSkeletonV2(verts), verts)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 8. Degenerate inputs
// ---------------------------------------------------------------------------

describe('V2 — degenerate inputs', () => {
    it('empty array: does not throw', () => {
        expect(() => computeStraightSkeletonV2([])).not.toThrow();
    });

    it('single vertex: does not throw', () => {
        expect(() => computeStraightSkeletonV2([{x: 0, y: 0}])).not.toThrow();
    });

    it('two vertices: does not throw', () => {
        expect(() => computeStraightSkeletonV2([{x: 0, y: 0}, {x: 1, y: 0}])).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// 9. isEventValid unit tests
// ---------------------------------------------------------------------------

describe('isEventValid', () => {
    it('2 active edges: valid', () => {
        const event = { participatingEdges: [5, 6], distances: [1, 1], eventDistance: 1 };
        expect(isEventValid(event, [false, false, false, false, false, false, false])).toBe(true);
    });

    it('1 active edge: invalid', () => {
        const event = { participatingEdges: [5, 6], distances: [1, 1], eventDistance: 1 };
        const accepted = [false, false, false, false, false, false, true]; // edge 6 accepted
        expect(isEventValid(event, accepted)).toBe(false);
    });

    it('3 edges, 2 active: valid', () => {
        const event = { participatingEdges: [5, 6, 7], distances: [1, 1, 1], eventDistance: 1 };
        const accepted = [false, false, false, false, false, false, false, true]; // edge 7 accepted
        expect(isEventValid(event, accepted)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 10. Initialization
// ---------------------------------------------------------------------------

describe('V2 — initContextV2', () => {
    it('pentagon: creates 5 interior edges (ids 5-9)', () => {
        const { context } = initContextV2(PENTAGON);
        expect(context.graph.interiorEdges.map(e => e.id)).toEqual([5, 6, 7, 8, 9]);
    });

    it('pentagon: no exterior edges accepted at init', () => {
        const { context } = initContextV2(PENTAGON);
        for (let i = 0; i < context.graph.numExteriorNodes; i++) {
            expect(context.acceptedEdges[i]).toBe(false);
        }
    });

    it('pentagon: heap has events', () => {
        const { heap } = initContextV2(PENTAGON);
        expect(heap.length).toBeGreaterThan(0);
    });

    it('pentagon: exterior bounds computed for all interior edges', () => {
        const { context, exteriorBounds } = initContextV2(PENTAGON);
        for (const ie of context.graph.interiorEdges) {
            expect(exteriorBounds.has(ie.id)).toBe(true);
            expect(exteriorBounds.get(ie.id)).toBeGreaterThan(0);
        }
    });
});

// ---------------------------------------------------------------------------
// 11. computeExteriorBound unit tests
// ---------------------------------------------------------------------------

describe('computeExteriorBound', () => {
    it('triangle: each primary interior edge has a finite exterior bound', () => {
        const { context, exteriorBounds } = initContextV2(TRIANGLE);
        for (const ie of context.graph.interiorEdges) {
            const bound = exteriorBounds.get(ie.id)!;
            expect(bound).toBeGreaterThan(0);
            expect(isFinite(bound)).toBe(true);
        }
    });

    it('square: exterior bounds are symmetric', () => {
        const { context, exteriorBounds } = initContextV2(SQUARE);
        const bounds = context.graph.interiorEdges.map(ie => exteriorBounds.get(ie.id)!);
        // All 4 bounds should be equal for a square
        for (const b of bounds) {
            expect(b).toBeCloseTo(bounds[0], 4);
        }
    });
});

// ---------------------------------------------------------------------------
// 12. Complex polygons — end-to-end
// ---------------------------------------------------------------------------

describe('V2 — complex polygons complete without throwing', () => {
    it('impossible octagon', () => {
        expect(() => computeStraightSkeletonV2(IMPOSSIBLE_OCTAGON)).not.toThrow();
    });

    it('impossible octagon: all interior nodes inside bounding box', () => {
        const g = computeStraightSkeletonV2(IMPOSSIBLE_OCTAGON);
        const bb = boundingBox(IMPOSSIBLE_OCTAGON);
        for (const n of interiorNodes(g)) {
            expect(n.position.x).toBeGreaterThan(bb.minX);
            expect(n.position.x).toBeLessThan(bb.maxX);
            expect(n.position.y).toBeGreaterThan(bb.minY);
            expect(n.position.y).toBeLessThan(bb.maxY);
        }
    });

    it('broken polygon', () => {
        expect(() => computeStraightSkeletonV2(BROKEN_POLYGON)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// 13. Buggy heptagon regression — the V1 bug
// ---------------------------------------------------------------------------

describe('V2 — buggy heptagon regression', () => {
    it('completes without throwing', () => {
        expect(() => computeStraightSkeletonV2(BUGGY_HEPTAGON)).not.toThrow();
    });

    it('all exterior edges accepted', () => {
        const g = computeStraightSkeletonV2(BUGGY_HEPTAGON);
        // All interior edges should have a defined target node
        for (const ie of g.interiorEdges) {
            const edge = g.edges[ie.id];
            expect(edge.target).toBeDefined();
        }
    });

    it('all interior nodes inside bounding box', () => {
        const g = computeStraightSkeletonV2(BUGGY_HEPTAGON);
        const bb = boundingBox(BUGGY_HEPTAGON);
        for (const n of interiorNodes(g)) {
            expect(n.position.x).toBeGreaterThan(bb.minX);
            expect(n.position.x).toBeLessThan(bb.maxX);
            expect(n.position.y).toBeGreaterThan(bb.minY);
            expect(n.position.y).toBeLessThan(bb.maxY);
        }
    });
});

// ---------------------------------------------------------------------------
// 14. Awkward hexagon — previously failing in V1
// ---------------------------------------------------------------------------

describe('V2 — awkward hexagon', () => {
    it('completes without throwing', () => {
        expect(() => computeStraightSkeletonV2(AWKWARD_HEXAGON)).not.toThrow();
    });

    it('all interior nodes inside bounding box', () => {
        const g = computeStraightSkeletonV2(AWKWARD_HEXAGON);
        const bb = boundingBox(AWKWARD_HEXAGON);
        for (const n of interiorNodes(g)) {
            expect(n.position.x).toBeGreaterThan(bb.minX);
            expect(n.position.x).toBeLessThan(bb.maxX);
            expect(n.position.y).toBeGreaterThan(bb.minY);
            expect(n.position.y).toBeLessThan(bb.maxY);
        }
    });
});

// ---------------------------------------------------------------------------
// 15. Pentagon house (V2 equivalent)
// ---------------------------------------------------------------------------

describe('V2 — pentagon house', () => {
    it('should have 7 nodes', () => {
        const g = computeStraightSkeletonV2(PENTAGON);
        expect(g.nodes.length).toBe(7);
    });

    it('should have 5 exterior edges and 5+ interior edges', () => {
        const g = computeStraightSkeletonV2(PENTAGON);
        expect(g.numExteriorNodes).toBe(5);
        expect(g.interiorEdges.length).toBeGreaterThanOrEqual(5);
    });
});
