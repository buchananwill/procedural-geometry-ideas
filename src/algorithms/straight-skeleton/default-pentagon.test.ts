import type {StraightSkeletonSolverContext} from './types';
import {
    initStraightSkeletonSolverContext,
} from "@/algorithms/straight-skeleton/algorithm-v1-helpers";
import {DEFAULT_PENTAGON} from './test-cases/test-constants';
import {runAlgorithmV5} from './algorithm-termination-cases';

// ---------------------------------------------------------------------------
// Stage 0 — Initialization diagnostics
// ---------------------------------------------------------------------------

describe('Default pentagon — initialization diagnostics', () => {
    let context: StraightSkeletonSolverContext;

    beforeEach(() => {
        context = initStraightSkeletonSolverContext(DEFAULT_PENTAGON);
    });

    it('creates exactly 5 interior edges (ids 5-9)', () => {
        expect(context.graph.interiorEdges.map(e => e.id)).toEqual([5, 6, 7, 8, 9]);
    });

    it.each([
        [5, 0, 4],
        [6, 1, 0],
        [7, 2, 1],
        [8, 3, 2],
        [9, 4, 3],
    ])('interior edge %i bisects CW=%i and WS=%i', (id, cw, ws) => {
        const e = context.graph.interiorEdges[id - 5];
        expect(e.id).toBe(id);
        expect(e.clockwiseExteriorEdgeIndex).toBe(cw);
        expect(e.widdershinsExteriorEdgeIndex).toBe(ws);
    });

    it('each interior edge has a finite positive length after init', () => {
        for (const edge of context.graph.interiorEdges) {
            expect(edge.length).toBeGreaterThan(0);
            expect(edge.length).toBeLessThan(Number.MAX_VALUE);
        }
    });

    it('each interior edge intersects at least one other edge', () => {
        for (const edge of context.graph.interiorEdges) {
            expect(edge.intersectingEdges.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('heap has at least 4 entries', () => {
        // May be fewer than 5 if reEvaluateEdge overwrites some during init
        expect(context.heap.size()).toBeGreaterThanOrEqual(4);
    });

    it('no exterior edges are accepted yet', () => {
        for (let i = 0; i < context.graph.numExteriorNodes; i++) {
            expect(context.acceptedEdges[i]).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// End-to-end V5 algorithm test
// ---------------------------------------------------------------------------

describe('Default pentagon — V5 algorithm', () => {
    it('completes without throwing', () => {
        expect(() => runAlgorithmV5(DEFAULT_PENTAGON)).not.toThrow();
    });

    it('all exterior edges are accepted', () => {
        const ctx = runAlgorithmV5(DEFAULT_PENTAGON);
        for (let i = 0; i < ctx.graph.numExteriorNodes; i++) {
            expect(ctx.acceptedEdges[i]).toBe(true);
        }
    });

    it('interior nodes lie inside bounding box', () => {
        const ctx = runAlgorithmV5(DEFAULT_PENTAGON);
        const xs = DEFAULT_PENTAGON.map(p => p.x);
        const ys = DEFAULT_PENTAGON.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);

        for (const node of ctx.graph.nodes.slice(ctx.graph.numExteriorNodes)) {
            expect(node.position.x).toBeGreaterThan(minX);
            expect(node.position.x).toBeLessThan(maxX);
            expect(node.position.y).toBeGreaterThan(minY);
            expect(node.position.y).toBeLessThan(maxY);
        }
    });

    it('total edges = numExteriorNodes + interiorEdges.length', () => {
        const ctx = runAlgorithmV5(DEFAULT_PENTAGON);
        const g = ctx.graph;
        expect(g.edges.length).toBe(g.numExteriorNodes + g.interiorEdges.length);
    });
});
