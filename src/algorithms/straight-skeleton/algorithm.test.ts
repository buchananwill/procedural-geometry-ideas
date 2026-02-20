import {computeStraightSkeleton} from './algorithm';
import type {StraightSkeletonGraph, StraightSkeletonSolverContext, Vector2} from './types';
import {initStraightSkeletonGraph} from "@/algorithms/straight-skeleton/core-functions";
import {
    acceptEdge,
    addTargetNodeAtInteriorEdgeIntersect,
    buildExteriorParentLists,
    initStraightSkeletonSolverContext,
    pushHeapInteriorEdgesFromParentPairs,
} from "@/algorithms/straight-skeleton/algorithm-helpers";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TRIANGLE: Vector2[] = [{x: 0, y: 0}, {x: 4, y: 0}, {x: 2, y: 4}];
const SQUARE: Vector2[] = [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 2}, {x: 0, y: 2}];
const RECTANGLE: Vector2[] = [{x: 0, y: 0}, {x: 4, y: 0}, {x: 4, y: 2}, {x: 0, y: 2}];
const PENTAGON: Vector2[] = [{x: 3, y: 9}, {x: 6, y: 6}, {x: 6, y: 0}, {x: 0, y: 0}, {x: 0, y: 6}];

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
        expect(() => computeStraightSkeleton([{x: 0, y: 0}])).not.toThrow();
    });

    it('two vertices: does not throw', () => {
        expect(() => computeStraightSkeleton([{x: 0, y: 0}, {x: 1, y: 0}])).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// 9. Pentagon — step-by-step algorithm tracing
// ---------------------------------------------------------------------------

/**
 * Performs exactly one main-loop iteration of the straight skeleton solver.
 * Mirrors the body of the while-loop in computeStraightSkeleton, skipping
 * duplicate (already-accepted) heap entries exactly as the real loop does.
 *
 * Returns:
 *   poppedEdgeId         — the id of the edge actually processed (not skipped)
 *   acceptedInteriorEdges — interior edge ids accepted in this iteration
 *   newInteriorEdgeIds   — ids of any interior edges pushed during this iteration
 */
function performOneStep(context: StraightSkeletonSolverContext): {
    poppedEdgeId: number;
    acceptedInteriorEdges: number[];
    newInteriorEdgeIds: number[];
} {
    const {graph, acceptedEdges, heap} = context;

    // Pop, discarding stale duplicate entries (already accepted)
    let nextEdge = heap.pop();
    while (nextEdge !== undefined && acceptedEdges[nextEdge.id]) {
        nextEdge = heap.pop();
    }
    if (nextEdge === undefined) throw new Error('Heap exhausted');

    const interiorEdgeData = graph.interiorEdges[nextEdge.id - graph.numExteriorNodes];
    const prevInteriorEdgeCount = graph.interiorEdges.length;

    const nodeIndex = addTargetNodeAtInteriorEdgeIntersect(context, interiorEdgeData);
    const acceptedInteriorEdges = [...graph.nodes[nodeIndex].inEdges];
    acceptedInteriorEdges.forEach(e => acceptEdge(e, context));

    const [cw, ws] = buildExteriorParentLists(context, acceptedInteriorEdges);
    pushHeapInteriorEdgesFromParentPairs(context, cw, ws, nodeIndex);

    const newInteriorEdgeIds = graph.interiorEdges
        .slice(prevInteriorEdgeCount)
        .map(e => e.id);

    return {poppedEdgeId: nextEdge.id, acceptedInteriorEdges, newInteriorEdgeIds};
}

describe('Pentagon — step-by-step algorithm tracing', () => {

    // -----------------------------------------------------------------------
    // Stage 0: Initialization
    // -----------------------------------------------------------------------

    describe('stage 0 — after initStraightSkeletonSolverContext', () => {
        let context: StraightSkeletonSolverContext;

        beforeEach(() => {
            context = initStraightSkeletonSolverContext(PENTAGON);
        });

        it('creates exactly 5 interior edges (ids 5-9)', () => {
            expect(context.graph.interiorEdges.map(e => e.id)).toEqual([5, 6, 7, 8, 9]);
        });

        it('interior edge 5 bisects CW=0 and WS=4', () => {
            const e = context.graph.interiorEdges[0];
            expect(e.id).toBe(5);
            expect(e.clockwiseExteriorEdgeIndex).toBe(0);
            expect(e.widdershinsExteriorEdgeIndex).toBe(4);
        });

        it('interior edge 6 bisects CW=1 and WS=0', () => {
            const e = context.graph.interiorEdges[1];
            expect(e.id).toBe(6);
            expect(e.clockwiseExteriorEdgeIndex).toBe(1);
            expect(e.widdershinsExteriorEdgeIndex).toBe(0);
        });

        it('interior edge 7 bisects CW=2 and WS=1', () => {
            const e = context.graph.interiorEdges[2];
            expect(e.id).toBe(7);
            expect(e.clockwiseExteriorEdgeIndex).toBe(2);
            expect(e.widdershinsExteriorEdgeIndex).toBe(1);
        });

        it('interior edge 8 bisects CW=3 and WS=2', () => {
            const e = context.graph.interiorEdges[3];
            expect(e.id).toBe(8);
            expect(e.clockwiseExteriorEdgeIndex).toBe(3);
            expect(e.widdershinsExteriorEdgeIndex).toBe(2);
        });

        it('interior edge 9 bisects CW=4 and WS=3', () => {
            const e = context.graph.interiorEdges[4];
            expect(e.id).toBe(9);
            expect(e.clockwiseExteriorEdgeIndex).toBe(4);
            expect(e.widdershinsExteriorEdgeIndex).toBe(3);
        });

        it('no exterior edges are accepted yet', () => {
            for (let i = 0; i < context.graph.numExteriorNodes; i++) {
                expect(context.acceptedEdges[i]).toBe(false);
            }
        });
    });

    // -----------------------------------------------------------------------
    // Stage 1: First heap.pop()
    // -----------------------------------------------------------------------

    describe('stage 1 — after first heap.pop()', () => {
        let context: StraightSkeletonSolverContext;
        let step1: ReturnType<typeof performOneStep>;

        beforeEach(() => {
            context = initStraightSkeletonSolverContext(PENTAGON);
            step1 = performOneStep(context);
        });

        // Result 1: interior edges 5, 6, 9 accepted
        it('accepts interior edges 5, 6, and 9', () => {
            expect([...step1.acceptedInteriorEdges].sort((a, b) => a - b)).toEqual([5, 6, 9]);
        });

        it('marks interior edge 5 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[5]).toBe(true);
        });

        it('marks interior edge 6 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[6]).toBe(true);
        });

        it('marks interior edge 9 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[9]).toBe(true);
        });

        // Result 2: exterior edges 0 and 4 accepted
        it('accepts exterior edge 0', () => {
            expect(context.acceptedEdges[0]).toBe(true);
        });

        it('accepts exterior edge 4', () => {
            expect(context.acceptedEdges[4]).toBe(true);
        });

        it('does not yet accept exterior edges 1, 2, or 3', () => {
            expect(context.acceptedEdges[1]).toBe(false);
            expect(context.acceptedEdges[2]).toBe(false);
            expect(context.acceptedEdges[3]).toBe(false);
        });

        // Result 3: edge 10 is pushed
        it('pushes exactly one new interior edge with id 10', () => {
            expect(step1.newInteriorEdgeIds).toEqual([10]);
        });

        it('graph now has 6 interior edges total', () => {
            expect(context.graph.interiorEdges).toHaveLength(6);
        });

        it('interior edges 7 and 8 are not yet accepted', () => {
            expect(context.acceptedEdges[7]).toBe(false);
            expect(context.acceptedEdges[8]).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Stage 2: Second heap.pop()
    // -----------------------------------------------------------------------

    describe('stage 2 — after second heap.pop()', () => {
        let context: StraightSkeletonSolverContext;
        let step2: ReturnType<typeof performOneStep>;

        beforeEach(() => {
            context = initStraightSkeletonSolverContext(PENTAGON);
            performOneStep(context); // stage 1
            step2 = performOneStep(context); // stage 2
        });

        // Result 4: interior edges 7, 10, 8 accepted
        it('accepts interior edges 7, 8, and 10', () => {
            expect([...step2.acceptedInteriorEdges].sort((a, b) => a - b)).toEqual([7, 8, 10]);
        });

        it('marks interior edge 7 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[7]).toBe(true);
        });

        it('marks interior edge 8 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[8]).toBe(true);
        });

        it('marks interior edge 10 as accepted in acceptedEdges', () => {
            expect(context.acceptedEdges[10]).toBe(true);
        });

        // Result 5: exterior edges 1, 2, 3 accepted
        it('accepts exterior edge 1', () => {
            expect(context.acceptedEdges[1]).toBe(true);
        });

        it('accepts exterior edge 2', () => {
            expect(context.acceptedEdges[2]).toBe(true);
        });

        it('accepts exterior edge 3', () => {
            expect(context.acceptedEdges[3]).toBe(true);
        });

        // Result 6: no new interior edges pushed
        it('pushes no new interior edges', () => {
            expect(step2.newInteriorEdgeIds).toHaveLength(0);
        });

        it('graph still has 6 interior edges total', () => {
            expect(context.graph.interiorEdges).toHaveLength(6);
        });

        // Result 7: all exterior edges accepted
        it('all 5 exterior edges are now accepted', () => {
            for (let i = 0; i < context.graph.numExteriorNodes; i++) {
                expect(context.acceptedEdges[i]).toBe(true);
            }
        });

        it('all entries in acceptedEdges are true (graphIsComplete equivalent)', () => {
            expect(context.acceptedEdges.every(flag => flag)).toBe(true);
        });
    });
});

// Pentagon house

describe('Pentagon house', () => {
    let g: StraightSkeletonGraph;

    it('should have 5 exterior edges after init', () => {
        g = initStraightSkeletonGraph(PENTAGON);
        expect(g.edges.length).toBe(5);
    });

    it('should have 5 interior edges after context init', () => {
       const context = initStraightSkeletonSolverContext(PENTAGON);
       g = context.graph;
       expect(g.interiorEdges.length).toBe(5);
    });

    it('should have 7 nodes', () => {
            g = computeStraightSkeleton(PENTAGON);
        expect(g.nodes.length).toBe(7);
    });
})