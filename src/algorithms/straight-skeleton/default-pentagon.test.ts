import {computeStraightSkeleton} from './algorithm';
import type {StraightSkeletonSolverContext, Vector2} from './types';
import {
    initStraightSkeletonSolverContext,
    performOneStep,
} from "@/algorithms/straight-skeleton/algorithm-helpers";

// ---------------------------------------------------------------------------
// The default pentagon shown on page load (from usePolygonStore.ts)
// ---------------------------------------------------------------------------

const DEFAULT_PENTAGON: Vector2[] = [
    {x: 250, y: 250},
    {x: 300, y: 450},
    {x: 500, y: 450},
    {x: 550, y: 250},
    {x: 400, y: 100},
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DiagnosticStepResult {
    stepIndex: number;
    poppedEdgeId?: number;
    acceptedInteriorEdges?: number[];
    newInteriorEdgeIds?: number[];
    acceptedExteriorEdges?: number[];
    newNodePosition?: Vector2;
    graphIsComplete?: boolean;
    error?: string;
}

function getAcceptedExteriorEdges(context: StraightSkeletonSolverContext): number[] {
    const result: number[] = [];
    for (let i = 0; i < context.graph.numExteriorNodes; i++) {
        if (context.acceptedEdges[i]) result.push(i);
    }
    return result;
}

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
// Step-by-step diagnostic loop
// ---------------------------------------------------------------------------

describe('Default pentagon — step-by-step diagnostic loop', () => {
    it('traces all steps until completion or failure', () => {
        const context = initStraightSkeletonSolverContext(DEFAULT_PENTAGON);
        const steps: DiagnosticStepResult[] = [];

        for (let i = 0; i < 10; i++) {
            if (context.acceptedEdges.every(f => f)) break;
            try {
                const step = performOneStep(context);

                // Find the position of the most recently created interior node
                const interiorNodes = context.graph.nodes.slice(context.graph.numExteriorNodes);
                const lastNode = interiorNodes[interiorNodes.length - 1];

                steps.push({
                    stepIndex: i,
                    poppedEdgeId: step.poppedEdgeId,
                    acceptedInteriorEdges: step.acceptedInteriorEdges,
                    newInteriorEdgeIds: step.newInteriorEdgeIds,
                    acceptedExteriorEdges: getAcceptedExteriorEdges(context),
                    newNodePosition: lastNode?.position,
                    graphIsComplete: context.acceptedEdges.every(f => f),
                });
            } catch (e) {
                steps.push({stepIndex: i, error: (e as Error).message});
                break;
            }
        }

        // Log all steps for diagnosis
        console.log('=== DEFAULT PENTAGON STEP TRACE ===');
        console.log(JSON.stringify(steps, null, 2));

        // This is the goal — all exterior edges accepted
        const allAccepted = context.acceptedEdges
            .slice(0, context.graph.numExteriorNodes)
            .every(f => f);
        expect(allAccepted).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// End-to-end smoke test
// ---------------------------------------------------------------------------

describe('Default pentagon — end-to-end', () => {
    it('computeStraightSkeleton completes without throwing', () => {
        expect(() => computeStraightSkeleton(DEFAULT_PENTAGON)).not.toThrow();
    });
});
