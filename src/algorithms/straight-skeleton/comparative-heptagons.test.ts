import {HandleAlgorithmStepInput} from './algorithm-termination-cases';
import {makeStraightSkeletonSolverContext} from './solver-context';
import {initInteriorEdges, tryToAcceptExteriorEdge} from './algorithm-helpers';
import type {AlgorithmStepInput, StraightSkeletonSolverContext, Vector2} from './types';
import {NOT_SOLVABLE} from './comparative-heptagons';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Exterior vertices extracted from SOLVABLE graph (nodes 0-6)
const SOLVABLE_VERTICES: Vector2[] = [
    {x: 250, y: 250},
    {x: 300, y: 450},
    {x: 500, y: 450},
    {x: 493.6570191345232, y: 391.26171277751615},
    {x: 480.0478002771541, y: 333.33046132650566},
    {x: 508.7783124600281, y: 145.1746589589634},
    {x: 400, y: 100},
];

const NOT_SOLVABLE_VERTICES: Vector2[] = NOT_SOLVABLE as Vector2[];

const EPSILON_2D = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function positionsClose(a: Vector2, b: Vector2): boolean {
    return Math.abs(a.x - b.x) < EPSILON_2D && Math.abs(a.y - b.y) < EPSILON_2D;
}

interface SubStepSnapshot {
    /** Which top-level iteration this belongs to */
    round: number;
    /** Index within the round's input list */
    inputIndex: number;
    /** Number of interior edges in this input */
    inputEdgeCount: number;
    /** Interior edge IDs in this input */
    inputEdgeIds: number[];
    /** Exterior parent indices for each interior edge */
    exteriorParents: {cw: number; ws: number}[];
    /** Number of child steps produced */
    outputChildCount: number;
    /** Edge counts of each child step */
    outputEdgeCounts: number[];
    /** New node positions created during this sub-step */
    newNodePositions: Vector2[];
    /** How many exterior edges are accepted after this sub-step */
    acceptedExteriorCount: number;
    /** Error if the sub-step threw */
    error?: string;
}

function initContext(vertices: Vector2[]): {
    context: StraightSkeletonSolverContext;
    inputs: AlgorithmStepInput[];
} {
    const context = makeStraightSkeletonSolverContext(vertices);
    initInteriorEdges(context);
    const inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];
    return {context, inputs};
}

function getAcceptedExteriorCount(context: StraightSkeletonSolverContext): number {
    return context.acceptedEdges
        .slice(0, context.graph.numExteriorNodes)
        .filter(Boolean).length;
}

function runWithSubSteps(vertices: Vector2[]): SubStepSnapshot[] {
    const {context, inputs: initialInputs} = initContext(vertices);
    const snapshots: SubStepSnapshot[] = [];
    let inputs = initialInputs;

    for (let round = 0; round < 20 && inputs.length > 0; round++) {
        const nextRoundInputs: AlgorithmStepInput[] = [];

        for (let inputIndex = 0; inputIndex < inputs.length; inputIndex++) {
            const input = inputs[inputIndex];
            const nodeCountBefore = context.graph.nodes.length;

            const exteriorParents = input.interiorEdges.map(id => {
                const ie = context.getInteriorWithId(id);
                return {cw: ie.clockwiseExteriorEdgeIndex, ws: ie.widdershinsExteriorEdgeIndex};
            });

            const snap: SubStepSnapshot = {
                round,
                inputIndex,
                inputEdgeCount: input.interiorEdges.length,
                inputEdgeIds: [...input.interiorEdges],
                exteriorParents,
                outputChildCount: 0,
                outputEdgeCounts: [],
                newNodePositions: [],
                acceptedExteriorCount: 0,
            };

            try {
                const result = HandleAlgorithmStepInput(context, input);

                // Try accepting exterior edges after each sub-step
                const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
                exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));

                const childSteps = result.childSteps.filter(s => s.interiorEdges.length > 1);
                snap.outputChildCount = childSteps.length;
                snap.outputEdgeCounts = childSteps.map(s => s.interiorEdges.length);
                snap.newNodePositions = context.graph.nodes
                    .slice(nodeCountBefore)
                    .map(n => ({...n.position}));
                snap.acceptedExteriorCount = getAcceptedExteriorCount(context);

                nextRoundInputs.push(...childSteps);
            } catch (e) {
                snap.error = (e as Error).message;
                snap.acceptedExteriorCount = getAcceptedExteriorCount(context);
                snap.newNodePositions = context.graph.nodes
                    .slice(nodeCountBefore)
                    .map(n => ({...n.position}));
            }

            snapshots.push(snap);
        }

        inputs = nextRoundInputs;
    }

    return snapshots;
}

/** Check if two node position arrays are equivalent (same positions, possibly different order) */
function positionSetsMatch(a: Vector2[], b: Vector2[]): boolean {
    if (a.length !== b.length) return false;
    const remaining = [...b];
    for (const posA of a) {
        const matchIdx = remaining.findIndex(posB => positionsClose(posA, posB));
        if (matchIdx === -1) return false;
        remaining.splice(matchIdx, 1);
    }
    return true;
}

function formatSnap(s: SubStepSnapshot): string {
    const parents = s.exteriorParents.map(p => `[${p.cw},${p.ws}]`).join(' ');
    const nodes = s.newNodePositions.map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' ');
    const err = s.error ? ` ERROR: ${s.error.slice(0, 80)}` : '';
    return `R${s.round}.${s.inputIndex}: ${s.inputEdgeCount} edges (ids:${s.inputEdgeIds}) parents:${parents} → ${s.outputEdgeCounts} children, nodes:[${nodes}] accepted:${s.acceptedExteriorCount}${err}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Comparative hexagons — sub-step tracing', () => {
    let solvableSnaps: SubStepSnapshot[];
    let notSolvableSnaps: SubStepSnapshot[];

    beforeAll(() => {
        solvableSnaps = runWithSubSteps(SOLVABLE_VERTICES);
        notSolvableSnaps = runWithSubSteps(NOT_SOLVABLE_VERTICES);
    });

    it('SOLVABLE trace (for reference)', () => {
        console.log('=== SOLVABLE ===');
        solvableSnaps.forEach(s => console.log(formatSnap(s)));
        expect(solvableSnaps.every(s => !s.error)).toBe(true);
    });

    it('NOT_SOLVABLE trace', () => {
        console.log('=== NOT_SOLVABLE ===');
        notSolvableSnaps.forEach(s => console.log(formatSnap(s)));
        // Just log — the test passes if we get here
        expect(true).toBe(true);
    });

    it('no sub-step errors in NOT_SOLVABLE', () => {
        const errored = notSolvableSnaps.filter(s => s.error);
        if (errored.length > 0) {
            console.log('Sub-steps with errors:');
            errored.forEach(s => console.log(formatSnap(s)));
        }
        expect(errored).toHaveLength(0);
    });

    it('matching sub-step structure between SOLVABLE and NOT_SOLVABLE', () => {
        // Compare only non-errored steps
        const sOk = solvableSnaps.filter(s => !s.error);
        const nsOk = notSolvableSnaps.filter(s => !s.error);
        const minLen = Math.min(sOk.length, nsOk.length);

        for (let i = 0; i < minLen; i++) {
            const s = sOk[i];
            const ns = nsOk[i];
            // Same round and input index
            if (s.round !== ns.round || s.inputIndex !== ns.inputIndex) {
                console.log(`Structure diverges at index ${i}: SOLVABLE R${s.round}.${s.inputIndex} vs NOT_SOLVABLE R${ns.round}.${ns.inputIndex}`);
                break;
            }
            // Same input edge count
            if (s.inputEdgeCount !== ns.inputEdgeCount) {
                console.log(`Edge count diverges at R${s.round}.${s.inputIndex}: SOLVABLE ${s.inputEdgeCount} vs NOT_SOLVABLE ${ns.inputEdgeCount}`);
                break;
            }
            // Same output structure
            if (JSON.stringify(s.outputEdgeCounts) !== JSON.stringify(ns.outputEdgeCounts)) {
                console.log(`Output diverges at R${s.round}.${s.inputIndex}:`);
                console.log(`  SOLVABLE: ${JSON.stringify(s.outputEdgeCounts)}`);
                console.log(`  NOT_SOLVABLE: ${JSON.stringify(ns.outputEdgeCounts)}`);
                break;
            }
            // Same new nodes (approximately)
            if (!positionSetsMatch(s.newNodePositions, ns.newNodePositions)) {
                console.log(`Node positions diverge at R${s.round}.${s.inputIndex}:`);
                console.log(`  SOLVABLE: ${s.newNodePositions.map(p => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`).join(' ')}`);
                console.log(`  NOT_SOLVABLE: ${ns.newNodePositions.map(p => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`).join(' ')}`);
            }
        }
        // This test is diagnostic — always passes
        expect(true).toBe(true);
    });
});

