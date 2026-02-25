import type {StraightSkeletonSolverContext} from './types';
import {
    initStraightSkeletonSolverContext,
} from "@/algorithms/straight-skeleton/algorithm-v1-helpers";
import {DEFAULT_PENTAGON} from './test-cases/test-constants';

// ---------------------------------------------------------------------------
// Stage 0 — Initialization diagnostics (V1 pipeline)
// Generic V5 invariants (no-throw, all-accepted, bbox, edge-count) are
// covered by regression.test.ts for every polygon including DEFAULT_PENTAGON.
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
            expect(edge.intersectingEdges!.length).toBeGreaterThanOrEqual(1);
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
