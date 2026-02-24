import {HandleAlgorithmStepInput} from './algorithm-termination-cases';
import {makeStraightSkeletonSolverContext} from './solver-context';
import {initInteriorEdges, tryToAcceptExteriorEdge} from './algorithm-helpers';
import type {AlgorithmStepInput, StraightSkeletonSolverContext, Vector2} from './types';
import {NOT_SOLVABLE, WRONG_COLLISION_AT_NODE_10} from './comparative-heptagons';
import {collideEdges, sourceOffsetDistance} from './collision-helpers';
import {areEqual} from './core-functions';
import {handleCollisionEvent} from './collision-handling';
import type {CollisionEvent, BisectionParams} from './types';

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

const WRONG_VERTICES: Vector2[] = WRONG_COLLISION_AT_NODE_10 as Vector2[];

describe('WRONG_COLLISION_AT_NODE_10 — stepping trace', () => {

    function formatEdge(id: number, ctx: StraightSkeletonSolverContext) {
        const ie = ctx.getInteriorWithId(id);
        const pe = ctx.getEdgeWithId(id);
        const src = ctx.findSource(id);
        const rank = ctx.edgeRank(id);
        return `e${id}(${rank} src=${pe.source}@(${src.position.x.toFixed(1)},${src.position.y.toFixed(1)}) cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex} basis=(${pe.basisVector.x.toFixed(4)},${pe.basisVector.y.toFixed(4)}))`;
    }

    function dumpAccepted(ctx: StraightSkeletonSolverContext) {
        const extAccepted = ctx.acceptedEdges.slice(0, ctx.graph.numExteriorNodes)
            .map((v, i) => v ? i : null).filter(v => v !== null);
        const intAccepted = ctx.acceptedEdges.slice(ctx.graph.numExteriorNodes)
            .map((v, i) => v ? i + ctx.graph.numExteriorNodes : null).filter(v => v !== null);
        return `ext:[${extAccepted}] int:[${intAccepted}]`;
    }

    function sameInstigatorComparator(ev1: CollisionEvent, ev2: CollisionEvent) {
        const [length1a] = ev1.intersectionData;
        const [length2a] = ev2.intersectionData;
        return areEqual(length1a, length2a) ? ev1.offsetDistance - ev2.offsetDistance : length1a - length2a;
    }

    it('steps through the algorithm and traces collisions', () => {
        const context = makeStraightSkeletonSolverContext(WRONG_VERTICES);
        initInteriorEdges(context);
        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

        console.log('=== INITIAL STATE ===');
        console.log(`Exterior edges: ${context.graph.numExteriorNodes}`);
        for (const ie of context.graph.interiorEdges) {
            console.log(`  ${formatEdge(ie.id, context)}`);
        }

        for (let round = 0; round < 20 && inputs.length > 0; round++) {
            const nextRoundInputs: AlgorithmStepInput[] = [];

            for (let inputIdx = 0; inputIdx < inputs.length; inputIdx++) {
                const input = inputs[inputIdx];
                console.log(`\n=== ROUND ${round}.${inputIdx} — edges [${input.interiorEdges}] ===`);
                console.log(`Accepted before: ${dumpAccepted(context)}`);

                // Replicate handleInteriorEdges collision list building
                const exteriorParents = input.interiorEdges
                    .map(context.getInteriorWithId)
                    .map(iEdge => iEdge.clockwiseExteriorEdgeIndex);
                const edgesToCheck = [...input.interiorEdges, ...exteriorParents];

                const collisionLists: CollisionEvent[][] = input.interiorEdges.map(e1 => {
                    return edgesToCheck.map(e2 => collideEdges(e1, e2, context))
                        .filter(event => event !== null)
                        .filter(event => event?.intersectionData[2] !== 'diverging')
                        .toSorted(sameInstigatorComparator);
                }).filter(list => list.length > 0);

                // Log per-instigator sorted lists (first 3 each)
                for (let li = 0; li < collisionLists.length; li++) {
                    const list = collisionLists[li];
                    console.log(`  List[${li}] (instigator e${list[0].collidingEdges[0]}):`);
                    for (let ei = 0; ei < Math.min(4, list.length); ei++) {
                        const ev = list[ei];
                        console.log(`    [${ei}] e${ev.collidingEdges[0]} vs e${ev.collidingEdges[1]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)} ray1=${ev.intersectionData[0].toFixed(4)}`);
                    }
                }

                // Replicate the slicing logic
                const collisionListsCopy = collisionLists.map(l => [...l]);
                const collisionEventSlices: CollisionEvent[][] = [];
                let bestOffset = Number.POSITIVE_INFINITY;
                let slicesRemaining = true;
                let sliceNum = 0;

                while (slicesRemaining) {
                    slicesRemaining = false;
                    let sliceInputs: [number, number][] = [];
                    const nextSlice: CollisionEvent[] = [];

                    for (let i = 0; i < collisionListsCopy.length; i++) {
                        const collisionList = collisionListsCopy[i];
                        if (collisionList.length === 0) continue;
                        slicesRemaining = true;
                        if (collisionList[0].offsetDistance < bestOffset) {
                            bestOffset = collisionList[0].offsetDistance;
                            sliceInputs = [];
                        }
                        let slicePointer = 0;
                        while (slicePointer < collisionList.length && areEqual(collisionList[slicePointer].offsetDistance, bestOffset)) {
                            slicePointer++;
                        }
                        sliceInputs.push([i, slicePointer]);
                    }

                    sliceInputs.forEach(([list, count]) => {
                        const collisionList = collisionListsCopy[list];
                        nextSlice.push(...collisionList.slice(0, count));
                        collisionListsCopy[list] = collisionList.slice(count);
                    });

                    if (nextSlice.length > 0) {
                        const nonPhantom = nextSlice.filter(e => e.eventType !== 'phantomDivergentOffset');
                        console.log(`  Slice[${sliceNum}] offset=${bestOffset.toFixed(4)}: ${nextSlice.length} events (${nonPhantom.length} non-phantom)`);
                        for (const ev of nextSlice) {
                            console.log(`    e${ev.collidingEdges[0]} vs e${ev.collidingEdges[1]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)}`);
                        }
                        collisionEventSlices.push(nextSlice);
                    }
                    bestOffset = Number.POSITIVE_INFINITY;
                    sliceNum++;
                    if (sliceNum > 30) break;
                }

                // Find the selected slice
                let collisionsToHandle: CollisionEvent[] | null = null;
                for (let si = 0; si < collisionEventSlices.length; si++) {
                    const validEvents = collisionEventSlices[si].filter(e => e.eventType !== 'phantomDivergentOffset');
                    if (validEvents.length > 0) {
                        collisionsToHandle = validEvents;
                        console.log(`  >>> SELECTED SLICE[${si}] with ${validEvents.length} events:`);
                        for (const ev of validEvents) {
                            console.log(`      e${ev.collidingEdges[0]} vs e${ev.collidingEdges[1]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)} pos=(${ev.position.x.toFixed(2)},${ev.position.y.toFixed(2)})`);
                        }
                        break;
                    }
                }

                // Now actually run the step
                const nodeCountBefore = context.graph.nodes.length;
                const interiorCountBefore = context.graph.interiorEdges.length;

                try {
                    const result = HandleAlgorithmStepInput(context, input);
                    const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
                    exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));

                    const newNodes = context.graph.nodes.slice(nodeCountBefore);
                    for (const n of newNodes) {
                        console.log(`  New node ${n.id} at (${n.position.x.toFixed(4)}, ${n.position.y.toFixed(4)}) inEdges=[${n.inEdges}] outEdges=[${n.outEdges}]`);
                    }
                    const newInterior = context.graph.interiorEdges.slice(interiorCountBefore);
                    for (const ie of newInterior) {
                        console.log(`  New interior: ${formatEdge(ie.id, context)}`);
                    }
                    console.log(`  Accepted after: ${dumpAccepted(context)}`);
                    const childSteps = result.childSteps.filter(s => s.interiorEdges.length > 1);
                    for (let ci = 0; ci < childSteps.length; ci++) {
                        console.log(`  Child ${ci}: edges=[${childSteps[ci].interiorEdges}]`);
                    }
                    nextRoundInputs.push(...childSteps);
                } catch (e) {
                    console.log(`  ERROR: ${(e as Error).message.slice(0, 200)}`);
                    console.log(`  Accepted after error: ${dumpAccepted(context)}`);
                }
            }
            inputs = nextRoundInputs;
        }

        // Final summary
        console.log('\n=== FINAL GRAPH ===');
        console.log(`Accepted: ${dumpAccepted(context)}`);
        for (const n of context.graph.nodes) {
            console.log(`  Node ${n.id} at (${n.position.x.toFixed(2)}, ${n.position.y.toFixed(2)}) in=[${n.inEdges}] out=[${n.outEdges}]`);
        }
        for (const e of context.graph.edges) {
            const accepted = context.acceptedEdges[e.id] ? 'ACCEPTED' : 'free';
            console.log(`  e${e.id}: ${e.source}->${e.target ?? '?'} [${accepted}]`);
        }

        const allAccepted = context.acceptedEdges.every(a => a);
        console.log(`\nAll accepted: ${allAccepted}`);
        console.log(`e11 accepted: ${context.acceptedEdges[11]}, e12 accepted: ${context.acceptedEdges[12]}, e13 accepted: ${context.acceptedEdges[13]}`);

        expect(allAccepted).toBe(true);
    });
});
