import {
    unitsToIntersection,
    addBisectionEdge,
    makeRayProjection,
    updateInteriorEdgeIntersections,
    initStraightSkeletonSolverContext,
    finalizeTargetNodePosition,
    acceptEdge,
    hasInteriorLoop,
} from './algorithm-helpers';
import { initStraightSkeletonGraph } from './core-functions';
import type {
    Vector2,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    HeapInteriorEdge,
    InteriorEdge,
} from './types';
import Heap from 'heap-js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestContext(graph: StraightSkeletonGraph, acceptedEdges: boolean[]): StraightSkeletonSolverContext {
    return {
        graph,
        acceptedEdges,
        heap: new Heap<HeapInteriorEdge>(),
    };
}

function magnitude(v: Vector2): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
}

function makeInteriorEdge(len: number): InteriorEdge {
    return {
        id: 5,
        clockwiseExteriorEdgeIndex: 0,
        widdershinsExteriorEdgeIndex: 1,
        intersectingEdges: [],
        length: len,
    };
}

const TRIANGLE: Vector2[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 4 }];
const SQUARE: Vector2[]   = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];

// ---------------------------------------------------------------------------
// unitsToIntersection
// ---------------------------------------------------------------------------

describe('unitsToIntersection', () => {
    // Case 1: axis-aligned perpendicular rays where x2=0, y2=1.
    // ray1 at t=5 → (5,0); ray2 at t=3 → (5,-3+3)=(5,0). Expected [5, 3].
    // The buggy formula (xRel + yRel*x2) happens to give xRel when x2=0 → correct here.
    it('handles axis-aligned perpendicular rays (x2=0, y2=1)', () => {
        const ray1 = { basisVector: { x: 1, y: 0 }, sourceVector: { x: 0, y: 0 } };
        const ray2 = { basisVector: { x: 0, y: 1 }, sourceVector: { x: 5, y: -3 } };
        const [t1, t2] = unitsToIntersection(ray1, ray2);
        expect(t1).toBeCloseTo(5);
        expect(t2).toBeCloseTo(3);
    });

    // Case 2: coincident sources — both rays start at (2,3) so t=0,0.
    it('returns [0, 0] for coincident sources', () => {
        const ray1 = { basisVector: { x: 1, y: 0 }, sourceVector: { x: 2, y: 3 } };
        const ray2 = { basisVector: { x: 0, y: 1 }, sourceVector: { x: 2, y: 3 } };
        const [t1, t2] = unitsToIntersection(ray1, ray2);
        expect(t1).toBeCloseTo(0);
        expect(t2).toBeCloseTo(0);
    });

    // Case 3 — [BUG A] wrong numerator on line 34: `xRel + yRel * x2` should be `xRel * y2 - yRel * x2`
    // ray1: source (0,0) direction (0,1); ray2: source (3,2) direction (-1,1)
    // Intersection at (0,5): t1=5 (ray1 travels 5 units up), t2=3 (ray2: (3-3, 2+3)=(0,5))
    // Buggy code: numerator = xRel + yRel*x2 = 3 + 2*(-1) = 1 → t1=1, then t2=-1
    it('[BUG A] wrong numerator formula — expected [5, 3] for oblique rays', () => {
        const ray1 = { basisVector: { x: 0, y: 1 }, sourceVector: { x: 0, y: 0 } };
        const ray2 = { basisVector: { x: -1, y: 1 }, sourceVector: { x: 3, y: 2 } };
        const [t1, t2] = unitsToIntersection(ray1, ray2);
        expect(t1).toBeCloseTo(5);   // BUG A: code gives 1
        expect(t2).toBeCloseTo(3);   // BUG A: code gives -1
    });

    // Case 4 — [BUG B] division by y2 on line 35: when ray2 is horizontal (y2=0), result is -Infinity / NaN
    // ray1: source (0,0) direction (0,1); ray2: source (5,3) direction (-1,0) — y2=0
    // Intersection at (0,3): t1=3, t2=5
    // Buggy code: ray2Units = (ray1Units*y1 - yRel) / y2 = (2*1 - 3)/0 = -Infinity
    it('[BUG B] y2=0 causes divide-by-zero — expected [3, 5] for horizontal ray2', () => {
        const ray1 = { basisVector: { x: 0, y: 1 }, sourceVector: { x: 0, y: 0 } };
        const ray2 = { basisVector: { x: -1, y: 0 }, sourceVector: { x: 5, y: 3 } };
        const [t1, t2] = unitsToIntersection(ray1, ray2);
        expect(t1).toBeCloseTo(3);   // BUG B: code gives 2
        expect(t2).toBeCloseTo(5);   // BUG B: code gives -Infinity
    });
});

// ---------------------------------------------------------------------------
// addBisectionEdge
// ---------------------------------------------------------------------------

describe('addBisectionEdge', () => {
    // addBisectionEdge(g, 1, 0, 1): bisector at corner node 1 (position (2,0) in SQUARE)
    // clockwise edge 1 direction (0,1); widdershins edge 0 direction (1,0) negated → (-1,0)
    // bisector = normalize( (0,1) + (-1,0) ) = normalize(-1,1) = (-1/√2, 1/√2)

    let g: StraightSkeletonGraph;
    let id: number;

    beforeEach(() => {
        g = initStraightSkeletonGraph(SQUARE);
        id = addBisectionEdge(g, 1, 0, 1);
    });

    it('returns the next edge id (4 for a 4-edge polygon)', () => {
        expect(id).toBe(4);
    });

    it('g.edges.length is now 5', () => {
        expect(g.edges.length).toBe(5);
    });

    it('g.interiorEdges.length is now 1', () => {
        expect(g.interiorEdges.length).toBe(1);
    });

    it('new edge has source === 1', () => {
        expect(g.edges[id].source).toBe(1);
    });

    it('new edge basisVector has unit length', () => {
        expect(magnitude(g.edges[id].basisVector)).toBeCloseTo(1);
    });

    it('interiorEdges[0].clockwiseExteriorEdgeIndex === 1', () => {
        expect(g.interiorEdges[0].clockwiseExteriorEdgeIndex).toBe(1);
    });

    it('interiorEdges[0].widdershinsExteriorEdgeIndex === 0', () => {
        expect(g.interiorEdges[0].widdershinsExteriorEdgeIndex).toBe(0);
    });

    it('interiorEdges[0].length === Number.MAX_VALUE', () => {
        expect(g.interiorEdges[0].length).toBe(Number.MAX_VALUE);
    });

    it("node 1's outEdges contains the new edge id", () => {
        expect(g.nodes[1].outEdges).toContain(id);
    });

    // addBisectionEdge itself pushes to outEdges exactly once (line 77).
    // Bug D lives in initStraightSkeletonSolverContext which pushes a second time — not here.
    it('new edge id appears exactly once in node 1 outEdges', () => {
        const count = g.nodes[1].outEdges.filter(e => e === id).length;
        expect(count).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// makeRayProjection
// ---------------------------------------------------------------------------

describe('makeRayProjection', () => {
    let g: StraightSkeletonGraph;

    beforeEach(() => {
        g = initStraightSkeletonGraph(TRIANGLE);
    });

    // TRIANGLE edge 0: source=node0 (0,0), direction toward (4,0) → basis (1,0)
    it('edge 0: basisVector is (1,0) and sourceVector is (0,0)', () => {
        const proj = makeRayProjection(g.edges[0], g);
        expect(proj.basisVector.x).toBeCloseTo(1);
        expect(proj.basisVector.y).toBeCloseTo(0);
        expect(proj.sourceVector).toEqual({ x: 0, y: 0 });
    });

    // TRIANGLE edge 1: source=node1 (4,0), direction toward (2,4) → basis normalize(-2,4)
    it('edge 1: basisVector has unit length', () => {
        const proj = makeRayProjection(g.edges[1], g);
        expect(magnitude(proj.basisVector)).toBeCloseTo(1);
    });

    it('edge 1: sourceVector matches node 1 position (4,0)', () => {
        const proj = makeRayProjection(g.edges[1], g);
        expect(proj.sourceVector).toEqual({ x: 4, y: 0 });
    });
});

// ---------------------------------------------------------------------------
// updateInteriorEdgeIntersection
// ---------------------------------------------------------------------------

describe('updateInteriorEdgeIntersection', () => {
    it('returns true and replaces when new length is shorter', () => {
        const edge = makeInteriorEdge(Number.MAX_VALUE);
        const result = updateInteriorEdgeIntersections(edge, 0, 5);
        expect(result).toBe(true);
        expect(edge.length).toBe(5);
        expect(edge.intersectingEdges).toEqual([0]);
    });

    it('returns false and leaves state unchanged when new length is longer', () => {
        const edge = makeInteriorEdge(5);
        const result = updateInteriorEdgeIntersections(edge, 1, 10);
        expect(result).toBe(false);
        expect(edge.length).toBe(5);
        expect(edge.intersectingEdges).toEqual([]);
    });

    it('side effect: appends to intersectingEdges when lengths are equal (fp_compare === 0)', () => {
        const edge = makeInteriorEdge(5);
        edge.intersectingEdges = [0];
        updateInteriorEdgeIntersections(edge, 1, 5);
        expect(edge.intersectingEdges).toContain(1);
    });

    it('returns false when edge length was not modified by equal-length update', () => {
        const edge = makeInteriorEdge(5);
        edge.intersectingEdges = [0];
        const result = updateInteriorEdgeIntersections(edge, 1, 5);
        expect(result).toBe(false);
    });

    it('within-epsilon lengths are treated as equal: intersectingEdges grows', () => {
        const edge = makeInteriorEdge(5);
        edge.intersectingEdges = [0];
        // 5e-9 < FLOATING_POINT_EPSILON (1e-8) → fp_compare returns 0
        updateInteriorEdgeIntersections(edge, 1, 5 + 5e-9);
        expect(edge.intersectingEdges.length).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// initStraightSkeletonSolverContext
// ---------------------------------------------------------------------------

describe('initStraightSkeletonSolverContext', () => {

    // Now fixed
    it('[BUG C] should not throw for a triangle (heap comparator uses wrong interiorEdges index)', () => {
        expect(() => initStraightSkeletonSolverContext(TRIANGLE)).not.toThrow();
    });

    // Now fixed
    it('[BUG D, blocked by Bug C] each bisector edge id appears exactly once in its node outEdges', () => {
        let ctx: StraightSkeletonSolverContext;
        try {
            ctx = initStraightSkeletonSolverContext(TRIANGLE);
        } catch {
            // previous Bug now fixed.
            expect('Bug C prevented reaching Bug D assertion').toBe('Bug D assertion reached');
            return;
        }
        const { graph } = ctx;
        for (let i = graph.numExteriorNodes; i < graph.edges.length; i++) {
            const srcId = graph.edges[i].source;
            const count = graph.nodes[srcId].outEdges.filter(eid => eid === i).length;
            expect(count).toBe(1);  // BUG D: count is 2 once Bug C is fixed
        }
    });
});

// ---------------------------------------------------------------------------
// finalizeTargetNodePosition
// ---------------------------------------------------------------------------

describe('finalizeTargetNodePosition', () => {
    // addBisectionEdge(g, 0, 2, 0): bisector at node 0 of TRIANGLE
    // clockwise edge 0 basis (1,0); widdershins edge 2 basis normalize(-2,-4) negated → normalize(2,4)
    // bisector = normalize( (1,0) + normalize(2,4) ) — a unit vector pointing upper-right from (0,0)
    let g: StraightSkeletonGraph;
    const heapEdge: HeapInteriorEdge = { id: 3 };

    beforeEach(() => {
        g = initStraightSkeletonGraph(TRIANGLE);
        addBisectionEdge(g, 0, 2, 0);   // → edge id 3, interiorEdges[0]
        g.interiorEdges[0].length = 3;  // manually set length for deterministic result
    });

    it('returns an object with numeric x and y', () => {
        const result = finalizeTargetNodePosition(heapEdge, g);
        expect(typeof result.x).toBe('number');
        expect(typeof result.y).toBe('number');
    });

    it('result is exactly 3 units from the source node (node 0)', () => {
        const result = finalizeTargetNodePosition(heapEdge, g);
        const source = g.nodes[0].position;
        const dist = magnitude({ x: result.x - source.x, y: result.y - source.y });
        expect(dist).toBeCloseTo(3);
    });

    it('direction from source to result matches the edge basisVector', () => {
        const result = finalizeTargetNodePosition(heapEdge, g);
        const source = g.nodes[0].position;
        const diff   = { x: result.x - source.x, y: result.y - source.y };
        const dirMag = magnitude(diff);
        const basis  = g.edges[3].basisVector;
        expect(diff.x / dirMag).toBeCloseTo(basis.x);
        expect(diff.y / dirMag).toBeCloseTo(basis.y);
    });
});

// ---------------------------------------------------------------------------
// acceptEdge
// ---------------------------------------------------------------------------

describe('acceptEdge', () => {
    let ctx: StraightSkeletonSolverContext;

    beforeEach(() => {
        ctx = makeTestContext(initStraightSkeletonGraph(TRIANGLE), [false, false, false]);
    });

    it('sets acceptedEdges[1] to true', () => {
        acceptEdge(1, ctx);
        expect(ctx.acceptedEdges[1]).toBe(true);
    });

    it('leaves other indices unchanged', () => {
        acceptEdge(1, ctx);
        expect(ctx.acceptedEdges[0]).toBe(false);
    });

    it('extends the array and sets to true when index is beyond current length', () => {
        acceptEdge(5, ctx);
        expect(ctx.acceptedEdges[5]).toBe(true);
    });

    it('acceptedEdges has length 6 after accepting index 5', () => {
        acceptEdge(5, ctx);
        expect(ctx.acceptedEdges.length).toBe(6);
    });
});

// ---------------------------------------------------------------------------
// hasInteriorLoop
// ---------------------------------------------------------------------------

describe('hasInteriorLoop', () => {
    // TRIANGLE + one bisection edge: edge 3 at node 0 (cw=0, widdershins=2)
    let g: StraightSkeletonGraph;

    beforeEach(() => {
        g = initStraightSkeletonGraph(TRIANGLE);
        addBisectionEdge(g, 0, 2, 0);  // → interior edge id=3, cw=0, widdershins=2
    });

    it('returns false for an edge id beyond graph.edges.length (invalid id guard)', () => {
        const ctx = makeTestContext(g, [false, false, false, false]);
        expect(hasInteriorLoop(99, ctx)).toBe(false);
    });

    it('returns false when interior edge id is out of bounds of acceptedEdges', () => {
        // acceptedEdges length 3; edge 3 is out of bounds
        const ctx = makeTestContext(g, [false, false, false]);
        expect(hasInteriorLoop(3, ctx)).toBe(false);
    });

    it('returns false for interior edge when neither parent is accepted', () => {
        const ctx = makeTestContext(g, [false, false, false, false]);
        expect(hasInteriorLoop(3, ctx)).toBe(false);
    });

    it('returns true when clockwise parent (edge 0) is accepted', () => {
        const ctx = makeTestContext(g, [true, false, false, false]);
        expect(hasInteriorLoop(3, ctx)).toBe(true);
    });

    it('returns true when widdershins parent (edge 2) is accepted', () => {
        const ctx = makeTestContext(g, [false, false, true, false]);
        expect(hasInteriorLoop(3, ctx)).toBe(true);
    });

    it('returns true for an already-accepted exterior edge (isExterior && accepted early return)', () => {
        const ctx = makeTestContext(g, [true, false, false]);
        expect(hasInteriorLoop(0, ctx)).toBe(true);
    });

    it('returns false for an unaccepted exterior edge with no accepted neighbours in BFS', () => {
        // edge 0 is exterior (source=0, target=1); BFS from node1.outEdges=[edge1].
        // edge1 is exterior → continue; no more candidates → false.
        const ctx = makeTestContext(g, [false, false, false]);
        expect(hasInteriorLoop(0, ctx)).toBe(false);
    });

    // topology is not a normal valid graph: we create a loop 0-1-3-0, to directly test the loop-finding
    it('if(nextTargetIndex) skips node 0 as BFS target — expected true, code now fixed', () => {
        // Edge 3 — manually wire it as a back to node 0 from node 1
        g.edges[3].source = 1
        g.edges[3].target = 0;
        g.nodes[1].outEdges.push(3)
        g.nodes[0].inEdges.push(3)
        // Accept edge 3 so the BFS actually processes it
        const acceptedEdges = [false, false, false, true];

        const ctx = makeTestContext(g, acceptedEdges);
        console.log(ctx);

        const result = hasInteriorLoop(0, ctx);
        expect(result).toBe(true);
    });
});
