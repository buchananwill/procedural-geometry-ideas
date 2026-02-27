import {
    areEqual,
    assertIsNumber,
    fp_compare,
    addVectors,
    subtractVectors,
    scaleVector,
    normalize,
    makeBasis,
    makeBisectedBasis,
} from '../core-functions';
import type { Vector2, StraightSkeletonGraph, PolygonEdge } from '../types';
import {addNode, initBoundingPolygon, interiorEdgeIndex} from "@/algorithms/straight-skeleton/graph-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyGraph(): StraightSkeletonGraph {
    return { nodes: [], edges: [], numExteriorNodes: 0, interiorEdges: [] };
}

function magnitude(v: Vector2): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
}

// ---------------------------------------------------------------------------
// areEqual
// ---------------------------------------------------------------------------

describe('areEqual', () => {
    it('returns true for identical values', () => {
        expect(areEqual(1, 1)).toBe(true);
    });

    it('returns true when difference is within epsilon', () => {
        // 5e-9 < FLOATING_POINT_EPSILON (1e-8)
        expect(areEqual(0, 0.000000005)).toBe(true);
    });

    it('returns false when difference is outside epsilon', () => {
        expect(areEqual(0, 0.0001)).toBe(false);
    });

    it('returns true for identical negative values', () => {
        expect(areEqual(-1, -1)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// assertIsNumber
// ---------------------------------------------------------------------------

describe('assertIsNumber', () => {
    it('does not throw for a valid number', () => {
        expect(() => assertIsNumber(42)).not.toThrow();
    });

    it('throws for a string', () => {
        expect(() => assertIsNumber('42')).toThrow();
    });

    it('throws for null', () => {
        expect(() => assertIsNumber(null)).toThrow();
    });

    it('does not throw for NaN (typeof NaN === "number")', () => {
        // Intentional: assertIsNumber only checks typeof, not isFinite/isNaN
        expect(() => assertIsNumber(NaN)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// fp_compare
// ---------------------------------------------------------------------------

describe('fp_compare', () => {
    it('returns -1 when a < b', () => {
        expect(fp_compare(1, 2)).toBe(-1);
    });

    it('returns 1 when a > b', () => {
        expect(fp_compare(2, 1)).toBe(1);
    });

    it('returns 0 when a === b', () => {
        expect(fp_compare(5, 5)).toBe(0);
    });

    it('returns 0 when difference is within default epsilon', () => {
        // 5e-9 < FLOATING_POINT_EPSILON (1e-8)
        expect(fp_compare(0, 5e-9)).toBe(0);
    });

    it('returns -1 when difference is outside default epsilon', () => {
        expect(fp_compare(0, 0.0001)).toBe(-1);
    });

    it('returns 0 with a custom epsilon that covers the difference', () => {
        expect(fp_compare(0, 0.05, 0.1)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// addVectors
// ---------------------------------------------------------------------------

describe('addVectors', () => {
    it('adds two vectors component-wise', () => {
        expect(addVectors({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    });

    it('adding the zero vector leaves the original unchanged', () => {
        expect(addVectors({ x: 5, y: -3 }, { x: 0, y: 0 })).toEqual({ x: 5, y: -3 });
    });

    it('handles negative components', () => {
        expect(addVectors({ x: -1, y: -1 }, { x: -2, y: 3 })).toEqual({ x: -3, y: 2 });
    });
});

// ---------------------------------------------------------------------------
// subtractVectors
// ---------------------------------------------------------------------------

describe('subtractVectors', () => {
    it('subtracts b from a component-wise', () => {
        expect(subtractVectors({ x: 5, y: 3 }, { x: 2, y: 1 })).toEqual({ x: 3, y: 2 });
    });

    it('returns zero vector when subtracting from itself', () => {
        expect(subtractVectors({ x: 4, y: 7 }, { x: 4, y: 7 })).toEqual({ x: 0, y: 0 });
    });

    it('a - b is not equal to b - a for non-equal inputs', () => {
        const a = { x: 3, y: 1 };
        const b = { x: 1, y: 4 };
        const ab = subtractVectors(a, b);
        const ba = subtractVectors(b, a);
        expect(ab).not.toEqual(ba);
    });
});

// ---------------------------------------------------------------------------
// scaleVector
// ---------------------------------------------------------------------------

describe('scaleVector', () => {
    it('scales a vector up', () => {
        expect(scaleVector({ x: 1, y: 2 }, 3)).toEqual({ x: 3, y: 6 });
    });

    it('scaling by 0 produces the zero vector', () => {
        expect(scaleVector({ x: 5, y: 5 }, 0)).toEqual({ x: 0, y: 0 });
    });

    it('scaling by -1 negates the vector', () => {
        expect(scaleVector({ x: 3, y: -4 }, -1)).toEqual({ x: -3, y: 4 });
    });
});

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------

describe('normalize', () => {
    it('leaves a unit vector unchanged', () => {
        const [vec, size] = normalize({ x: 1, y: 0 });
        expect(vec.x).toBeCloseTo(1);
        expect(vec.y).toBeCloseTo(0);
        expect(size).toBeCloseTo(1);
    });

    it('normalizes an axis-aligned non-unit vector', () => {
        const [vec, size] = normalize({ x: 0, y: 5 });
        expect(vec.x).toBeCloseTo(0);
        expect(vec.y).toBeCloseTo(1);
        expect(size).toBeCloseTo(5);
    });

    it('normalizes a diagonal vector (3-4-5 triangle)', () => {
        const [vec, size] = normalize({ x: 3, y: 4 });
        expect(vec.x).toBeCloseTo(0.6);
        expect(vec.y).toBeCloseTo(0.8);
        expect(size).toBeCloseTo(5);
    });

    it('returns {x:0, y:0} and size 0 for the zero vector', () => {
        const [vec, size] = normalize({ x: 0, y: 0 });
        expect(vec).toEqual({ x: 0, y: 0 });
        expect(size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// makeBasis
// ---------------------------------------------------------------------------

describe('makeBasis', () => {
    it('produces a rightward unit vector', () => {
        const result = makeBasis({ x: 0, y: 0 }, { x: 5, y: 0 });
        expect(result.x).toBeCloseTo(1);
        expect(result.y).toBeCloseTo(0);
    });

    it('produces an upward unit vector', () => {
        const result = makeBasis({ x: 0, y: 0 }, { x: 0, y: 3 });
        expect(result.x).toBeCloseTo(0);
        expect(result.y).toBeCloseTo(1);
    });

    it('produces a diagonal unit vector (3-4-5)', () => {
        // diff = {3, 4}, magnitude = 5
        const result = makeBasis({ x: 1, y: 1 }, { x: 4, y: 5 });
        expect(result.x).toBeCloseTo(0.6);
        expect(result.y).toBeCloseTo(0.8);
    });

    it('result always has unit length', () => {
        const result = makeBasis({ x: 2, y: 3 }, { x: 7, y: 11 });
        expect(magnitude(result)).toBeCloseTo(1);
    });
});

// ---------------------------------------------------------------------------
// makeBisectedBasis
// ---------------------------------------------------------------------------

describe('makeBisectedBasis', () => {
    it('bisecting the same vector returns that vector', () => {
        const result = makeBisectedBasis({ x: 1, y: 0 }, { x: 1, y: 0 });
        expect(result.x).toBeCloseTo(1);
        expect(result.y).toBeCloseTo(0);
    });

    it('bisects a right angle at 45 degrees', () => {
        const result = makeBisectedBasis({ x: 1, y: 0 }, { x: 0, y: 1 });
        expect(result.x).toBeCloseTo(Math.SQRT1_2);
        expect(result.y).toBeCloseTo(Math.SQRT1_2);
    });

    it('returns rotated iBasis for opposite vectors (zero sum)', () => {
        // addVectors gives {0,0}, normalize falls back to {1,0}
        const result = makeBisectedBasis({ x: 1, y: 0 }, { x: -1, y: 0 });
        expect(result).toEqual({ x: 0, y: -1 });
    });

    it('result always has unit length', () => {
        const result = makeBisectedBasis({ x: 0.6, y: 0.8 }, { x: -0.8, y: 0.6 });
        expect(magnitude(result)).toBeCloseTo(1);
    });
});

// ---------------------------------------------------------------------------
// addNode
// ---------------------------------------------------------------------------

describe('addNode', () => {
    it('returns index 0 for an empty graph', () => {
        const g = emptyGraph();
        expect(addNode({ x: 0, y: 0 }, g)).toBe(0);
    });

    it('returns the next sequential index for subsequent calls', () => {
        const g = emptyGraph();
        addNode({ x: 0, y: 0 }, g);
        expect(addNode({ x: 1, y: 1 }, g)).toBe(1);
    });

    it('stores the node at the returned index with the given position', () => {
        const g = emptyGraph();
        const pos: Vector2 = { x: 3, y: 7 };
        const idx = addNode(pos, g);
        expect(g.nodes[idx].position).toEqual(pos);
    });

    it('initializes the node with empty edge lists', () => {
        const g = emptyGraph();
        const idx = addNode({ x: 0, y: 0 }, g);
        expect(g.nodes[idx].inEdges).toEqual([]);
        expect(g.nodes[idx].outEdges).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// interiorEdgeIndex
// ---------------------------------------------------------------------------

describe('interiorEdgeIndex', () => {
    function makeEdge(id: number): PolygonEdge {
        return { id, source: 0, basisVector: { x: 1, y: 0 } };
    }

    function graphWith4ExteriorNodes(): StraightSkeletonGraph {
        return { nodes: [], edges: [], numExteriorNodes: 4, interiorEdges: [] };
    }

    it('returns a negative value for an exterior edge (id 0)', () => {
        expect(interiorEdgeIndex(makeEdge(0), graphWith4ExteriorNodes())).toBe(-4);
    });

    it('returns -1 for the last exterior edge (id = numExteriorNodes - 1)', () => {
        expect(interiorEdgeIndex(makeEdge(3), graphWith4ExteriorNodes())).toBe(-1);
    });

    it('returns 0 for the first interior edge (id = numExteriorNodes)', () => {
        expect(interiorEdgeIndex(makeEdge(4), graphWith4ExteriorNodes())).toBe(0);
    });

    it('returns 2 for interior edge with id = numExteriorNodes + 2', () => {
        expect(interiorEdgeIndex(makeEdge(6), graphWith4ExteriorNodes())).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// initStraightSkeletonGraph
// ---------------------------------------------------------------------------

describe('initStraightSkeletonGraph', () => {
    const triangle: Vector2[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0.5, y: 1 },
    ];

    let g: StraightSkeletonGraph;

    beforeEach(() => {
        g = initBoundingPolygon(triangle);
    });

    it('creates the correct number of nodes', () => {
        expect(g.nodes.length).toBe(3);
    });

    it('creates the correct number of edges', () => {
        expect(g.edges.length).toBe(3);
    });

    it('sets numExteriorNodes to the input length', () => {
        expect(g.numExteriorNodes).toBe(3);
    });

    it('edge 0 goes from node 0 to node 1', () => {
        expect(g.edges[0].source).toBe(0);
        expect(g.edges[0].target).toBe(1);
    });

    it('last edge wraps from node 2 back to node 0', () => {
        expect(g.edges[2].source).toBe(2);
        expect(g.edges[2].target).toBe(0);
    });

    it('every edge has a unit-length basisVector', () => {
        for (const edge of g.edges) {
            expect(magnitude(edge.basisVector)).toBeCloseTo(1);
        }
    });

    it('each node has exactly one inEdge and one outEdge', () => {
        for (const node of g.nodes) {
            expect(node.inEdges.length).toBe(1);
            expect(node.outEdges.length).toBe(1);
        }
    });

    it('node outEdge points to the edge that starts at that node', () => {
        // node i's outEdge should be edge i
        for (let i = 0; i < g.nodes.length; i++) {
            expect(g.nodes[i].outEdges).toContain(i);
        }
    });

    it('node inEdge points to the edge that ends at that node', () => {
        // edge i targets node (i+1) % n, so node (i+1) % n has edge i as inEdge
        const n = triangle.length;
        for (let i = 0; i < n; i++) {
            const targetNodeIndex = (i + 1) % n;
            expect(g.nodes[targetNodeIndex].inEdges).toContain(i);
        }
    });
});
