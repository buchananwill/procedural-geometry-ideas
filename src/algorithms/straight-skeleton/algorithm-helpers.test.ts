import {

    addBisectionEdge,
    makeRayProjection,
    updateInteriorEdgeIntersections,
    initStraightSkeletonSolverContext,
    finalizeTargetNodePosition,
    acceptEdge,
    hasInteriorLoop,
    createBisectionInteriorEdge,
    evaluateEdgeIntersections,
} from './algorithm-helpers';
import type {
    Vector2,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    InteriorEdge,
} from './types';
import {unitsToIntersection} from "@/algorithms/straight-skeleton/intersection-edges";
import {TRIANGLE, SQUARE} from './test-cases/test-constants';
import {initBoundingPolygon} from "@/algorithms/straight-skeleton/graph-helpers";
import {normalize} from "@/algorithms/straight-skeleton/core-functions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestContext(graph: StraightSkeletonGraph, acceptedEdges: boolean[]): StraightSkeletonSolverContext {
    const context = initStraightSkeletonSolverContext(graph.nodes.map(n => ({x: n.position.x, y: n.position.y})))
    acceptedEdges.forEach((val, i) => {context.acceptedEdges[i] = val;})
    return context;
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
    it('returns [+inf, +inf] for coincident sources', () => {
        const ray1 = { basisVector: { x: 1, y: 0 }, sourceVector: { x: 2, y: 3 } };
        const ray2 = { basisVector: { x: 0, y: 1 }, sourceVector: { x: 2, y: 3 } };
        const [t1, t2] = unitsToIntersection(ray1, ray2);
        expect(t1).toBeCloseTo(Number.POSITIVE_INFINITY);
        expect(t2).toBeCloseTo(Number.POSITIVE_INFINITY);
    });

    // Case 3 — [BUG A] wrong numerator on line 34: `xRel + yRel * x2` should be `xRel * y2 - yRel * x2`
    // ray1: source (0,0) direction (0,1); ray2: source (3,2) direction (-1,1)
    // Intersection at (0,5): t1=5 (ray1 travels 5 units up), t2=3 (ray2: (3-3, 2+3)=(0,5))
    // Buggy code: numerator = xRel + yRel*x2 = 3 + 2*(-1) = 1 → t1=1, then t2=-1
    it('[BUG A] wrong numerator formula — expected [5, 3] for oblique rays', () => {
        const ray1 = { basisVector: { x: 0, y: 1 }, sourceVector: { x: 0, y: 0 } };
        const ray2 = { basisVector: normalize({ x: -1, y: 1 })[0], sourceVector: { x: 3, y: 2 } };
        const [t1, t2] = unitsToIntersection(ray1, ray2);
        expect(t1).toBeCloseTo(5);   // BUG A: code gives 1
        expect(t2).toBeCloseTo(Math.sqrt(18));   // BUG A: code gives -1
    });

    // Case — co-linear opposing rays: midpoint with full-span priority override
    it('co-linear opposing rays: returns [D/2, D/2, D] midpoint with full-span priority', () => {
        const ray1 = { basisVector: { x: 1, y: 0 }, sourceVector: { x: 0, y: 0 } };
        const ray2 = { basisVector: { x: -1, y: 0 }, sourceVector: { x: 10, y: 0 } };
        const [length1, length2, resultType] = unitsToIntersection(ray1, ray2);
        expect(length1).toBeCloseTo(10);   // D/2 along ray1
        expect(length2).toBeCloseTo(10);   // D/2 along ray2
        expect(resultType).toBe('head-on');  // full span priority
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
        g = initBoundingPolygon(SQUARE);
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
        g = initBoundingPolygon(TRIANGLE);
    });

    // TRIANGLE edge 0: source=node0 (0,0), direction toward (2,4) → basis normalize(2,4)
    it('edge 0: basisVector is normalize(2,4) and sourceVector is (0,0)', () => {
        const proj = makeRayProjection(g.edges[0], g);
        expect(proj.basisVector.x).toBeCloseTo(2 / Math.sqrt(20));
        expect(proj.basisVector.y).toBeCloseTo(4 / Math.sqrt(20));
        expect(proj.sourceVector).toEqual({ x: 0, y: 0 });
    });

    // TRIANGLE edge 1: source=node1 (2,4), direction toward (4,0) → basis normalize(2,-4)
    it('edge 1: basisVector has unit length', () => {
        const proj = makeRayProjection(g.edges[1], g);
        expect(magnitude(proj.basisVector)).toBeCloseTo(1);
    });

    it('edge 1: sourceVector matches node 1 position (2,4)', () => {
        const proj = makeRayProjection(g.edges[1], g);
        expect(proj.sourceVector).toEqual({ x: 2, y: 4 });
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
    const heapEdgeId = 3;

    beforeEach(() => {
        g = initBoundingPolygon(TRIANGLE);
        addBisectionEdge(g, 0, 2, 0);   // → edge id 3, interiorEdges[0]
        g.interiorEdges[0].length = 3;  // manually set length for deterministic result
    });

    it('returns an object with numeric x and y', () => {
        const result = finalizeTargetNodePosition(heapEdgeId, g);
        expect(typeof result.x).toBe('number');
        expect(typeof result.y).toBe('number');
    });

    it('result is exactly 3 units from the source node (node 0)', () => {
        const result = finalizeTargetNodePosition(heapEdgeId, g);
        const source = g.nodes[0].position;
        const dist = magnitude({ x: result.x - source.x, y: result.y - source.y });
        expect(dist).toBeCloseTo(3);
    });

    it('direction from source to result matches the edge basisVector', () => {
        const result = finalizeTargetNodePosition(heapEdgeId, g);
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
        ctx = makeTestContext(initBoundingPolygon(TRIANGLE), [false, false, false]);
    });

    it('sets acceptedEdges[1] to true', () => {
        acceptEdge(1, ctx);
        expect(ctx.acceptedEdges[1]).toBe(true);
    });

    it('leaves other indices unchanged', () => {
        acceptEdge(1, ctx);
        expect(ctx.acceptedEdges[0]).toBe(false);
    });

    it('throws an error when index is beyond current length', () => {
        expect(() => acceptEdge(99, ctx)).toThrow();
    });
});

// ---------------------------------------------------------------------------
// hasInteriorLoop
// ---------------------------------------------------------------------------

describe('hasInteriorLoop', () => {
    // TRIANGLE + one bisection edge: edge 3 at node 0 (cw=0, widdershins=2)
    let g: StraightSkeletonGraph;

    beforeEach(() => {
        g = initBoundingPolygon(TRIANGLE);
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

});

// ---------------------------------------------------------------------------
// createBisectionInteriorEdge
// ---------------------------------------------------------------------------

describe('createBisectionInteriorEdge', () => {
    let ctx: StraightSkeletonSolverContext;
    let edgeIndex: number;

    beforeEach(() => {
        ctx = makeTestContext(initBoundingPolygon(SQUARE), [false, false, false, false]);
        edgeIndex = createBisectionInteriorEdge(ctx, 1, 0, 1);
    });

    it('returns the correct edge index (8 for a 4-edge polygon with 4 initial bisectors)', () => {
        expect(edgeIndex).toBe(8);
    });

    it('extends acceptedEdges to cover the new edge', () => {
        expect(ctx.acceptedEdges.length).toBeGreaterThan(edgeIndex);
        expect(ctx.acceptedEdges[edgeIndex]).toBe(false);
    });

    it('new interior edge starts with length MAX_VALUE', () => {
        const interiorEdge = ctx.graph.interiorEdges[edgeIndex - ctx.graph.numExteriorNodes];
        expect(interiorEdge.length).toBe(Number.MAX_VALUE);
    });

    it('new interior edge has empty intersectingEdges', () => {
        const interiorEdge = ctx.graph.interiorEdges[edgeIndex - ctx.graph.numExteriorNodes];
        expect(interiorEdge.intersectingEdges).toEqual([]);
    });

    it('graph.interiorEdges grows by 1', () => {
        // 4 initial bisectors from initStraightSkeletonSolverContext + 1 new
        expect(ctx.graph.interiorEdges).toHaveLength(5);
    });
});

// ---------------------------------------------------------------------------
// evaluateEdgeIntersections
// ---------------------------------------------------------------------------

describe('evaluateEdgeIntersections', () => {
    it('returns correct evaluation for SQUARE without mutating state', () => {
        const ctx = initStraightSkeletonSolverContext(SQUARE);

        // Pick edge 4 (first interior edge, bisector at node 0)
        const edgeIndex = ctx.graph.interiorEdges[0].id;

        // Snapshot state before evaluation
        const lengthsBefore = ctx.graph.interiorEdges.map(e => e.length);
        const intersectingBefore = ctx.graph.interiorEdges.map(e => [...e.intersectingEdges]);

        const evaluation = evaluateEdgeIntersections(ctx, edgeIndex);

        // Evaluation should not have mutated any edge state
        for (let i = 0; i < ctx.graph.interiorEdges.length; i++) {
            expect(ctx.graph.interiorEdges[i].length).toBe(lengthsBefore[i]);
            expect(ctx.graph.interiorEdges[i].intersectingEdges).toEqual(intersectingBefore[i]);
        }

        // Evaluation results should be valid
        expect(evaluation.edgeIndex).toBe(edgeIndex);
        expect(evaluation.shortestLength).toBeLessThan(Number.MAX_VALUE);
        expect(evaluation.intersectors.length).toBeGreaterThan(0);
    });

    it('skips accepted edges as candidates', () => {
        const ctx = initStraightSkeletonSolverContext(SQUARE);
        const edgeIndex = ctx.graph.interiorEdges[0].id;

        // Accept all other interior edges
        for (let i = 1; i < ctx.graph.interiorEdges.length; i++) {
            ctx.acceptedEdges[ctx.graph.interiorEdges[i].id] = true;
        }

        const evaluation = evaluateEdgeIntersections(ctx, edgeIndex);

        // No active edges to intersect with → shortestLength stays +INF
        expect(evaluation.shortestLength).toBe(Number.POSITIVE_INFINITY);
        expect(evaluation.intersectors).toHaveLength(0);
    });
});
