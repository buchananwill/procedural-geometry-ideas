import {computeStraightSkeleton} from './algorithm';
import type {StraightSkeletonSolverContext, Vector2} from './types';
import {
    initStraightSkeletonSolverContext,
    performOneStep,
} from "@/algorithms/straight-skeleton/algorithm-helpers";

// ---------------------------------------------------------------------------
// The awkward hexagon
// ---------------------------------------------------------------------------

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
// Initialization diagnostics
// ---------------------------------------------------------------------------

describe('Awkward hexagon -- initialization diagnostics', () => {
    let context: StraightSkeletonSolverContext;

    beforeEach(() => {
        context = initStraightSkeletonSolverContext(AWKWARD_HEXAGON);
    });

    it('creates exactly 6 interior edges (ids 6-11)', () => {
        expect(context.graph.interiorEdges.map(e => e.id)).toEqual([6, 7, 8, 9, 10, 11]);
    });

    it.each([
        [6, 0, 5],
        [7, 1, 0],
        [8, 2, 1],
        [9, 3, 2],
        [10, 4, 3],
        [11, 5, 4],
    ])('interior edge %i bisects CW=%i and WS=%i', (id, cw, ws) => {
        const e = context.graph.interiorEdges[id - 6];
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

    it('no exterior edges are accepted yet', () => {
        for (let i = 0; i < context.graph.numExteriorNodes; i++) {
            expect(context.acceptedEdges[i]).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// Step-by-step diagnostic loop
// ---------------------------------------------------------------------------

describe('Awkward hexagon -- step-by-step diagnostic loop', () => {
    it('traces all steps until completion or failure', () => {
        const context = initStraightSkeletonSolverContext(AWKWARD_HEXAGON);
        const steps: DiagnosticStepResult[] = [];

        for (let i = 0; i < 15; i++) {
            if (context.acceptedEdges.every(f => f)) break;
            try {
                const step = performOneStep(context);
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

        console.log('=== AWKWARD HEXAGON STEP TRACE ===');
        console.log(JSON.stringify(steps, null, 2));

        const allAccepted = context.acceptedEdges
            .slice(0, context.graph.numExteriorNodes)
            .every(f => f);
        expect(allAccepted).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// End-to-end smoke test
// ---------------------------------------------------------------------------

describe('Awkward hexagon -- end-to-end', () => {
    it('computeStraightSkeleton completes without throwing', () => {
        expect(() => computeStraightSkeleton(AWKWARD_HEXAGON)).not.toThrow();
    });
});
