import {HandleAlgorithmStepInput} from './algorithm-termination-cases';
import {makeStraightSkeletonSolverContext} from './solver-context';
import {
    addBisectionEdge,
    ensureBisectionIsInterior,
    ensureDirectionNotReversed,
    initInteriorEdges,
    tryToAcceptExteriorEdge
} from './algorithm-helpers';
import type {AlgorithmStepInput, BisectionParams, CollisionEvent, StraightSkeletonSolverContext, Vector2} from './types';
import {checkSharedParents, collideEdges, sourceOffsetDistance} from './collision-helpers';
import {areEqual, crossProduct, dotProduct, makeBisectedBasis, scaleVector} from './core-functions';
import handleCollisionEvent from './collision-handling';
import {CollisionTypePriority} from './types';
import {SUCCESS_OUTER, FAILURE_START_CASE, FAILURE_END_CASE, SUCCESS_INNER} from './mid-case-failure';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEdge(id: number, ctx: StraightSkeletonSolverContext) {
    const ie = ctx.getInteriorWithId(id);
    const pe = ctx.getEdgeWithId(id);
    const src = ctx.findSource(id);
    const rank = ctx.edgeRank(id);
    return `e${id}(${rank} src=${pe.source}@(${src.position.x.toFixed(1)},${src.position.y.toFixed(1)}) cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex} basis=(${pe.basisVector.x.toFixed(6)},${pe.basisVector.y.toFixed(6)}))`;
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
    const ev1Phantom = ev1.eventType === 'phantomDivergentOffset';
    const ev2Phantom = ev2.eventType === 'phantomDivergentOffset';

    if (ev1Phantom !== ev2Phantom) {
        return ev1.offsetDistance - ev2.offsetDistance;
    }

    return areEqual(length1a, length2a) ? ev1.offsetDistance - ev2.offsetDistance : length1a - length2a;
}

interface RoundSnapshot {
    round: number;
    inputIndex: number;
    inputEdgeCount: number;
    inputEdgeIds: number[];
    exteriorParents: { cw: number; ws: number }[];
    collisionSlices: {
        offset: number;
        events: {
            instigator: number;
            target: number;
            type: string;
            offset: number;
            ray1Units: number;
            ray2Units: number;
            position: Vector2;
        }[];
        nonPhantomCount: number;
        selected: boolean;
    }[];
    selectedEvents: {
        instigator: number;
        target: number;
        type: string;
        offset: number;
        position: Vector2;
    }[];
    newNodes: { id: number; position: Vector2; inEdges: number[]; outEdges: number[] }[];
    newInteriorEdges: { id: number; cw: number; ws: number; source: number; basis: Vector2 }[];
    acceptedExteriorCount: number;
    acceptedExteriorIds: number[];
    childSteps: { edgeIds: number[]; count: number }[];
    error?: string;
}

/**
 * Run the V5 algorithm step-by-step, capturing detailed collision diagnostics at each round.
 */
function traceAlgorithm(vertices: Vector2[]): RoundSnapshot[] {
    const context = makeStraightSkeletonSolverContext(vertices);
    initInteriorEdges(context);
    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];
    const snapshots: RoundSnapshot[] = [];

    for (let round = 0; round < 30 && inputs.length > 0; round++) {
        const nextRoundInputs: AlgorithmStepInput[] = [];

        for (let inputIdx = 0; inputIdx < inputs.length; inputIdx++) {
            const input = inputs[inputIdx];
            const nodeCountBefore = context.graph.nodes.length;
            const interiorCountBefore = context.graph.interiorEdges.length;

            const exteriorParents = input.interiorEdges.map(id => {
                const ie = context.getInteriorWithId(id);
                return {cw: ie.clockwiseExteriorEdgeIndex, ws: ie.widdershinsExteriorEdgeIndex};
            });

            const snap: RoundSnapshot = {
                round,
                inputIndex: inputIdx,
                inputEdgeCount: input.interiorEdges.length,
                inputEdgeIds: [...input.interiorEdges],
                exteriorParents,
                collisionSlices: [],
                selectedEvents: [],
                newNodes: [],
                newInteriorEdges: [],
                acceptedExteriorCount: 0,
                acceptedExteriorIds: [],
                childSteps: [],
            };

            // --- Replicate collision detection from handleInteriorEdges ---
            const exteriorParentIds = input.interiorEdges
                .map(context.getInteriorWithId)
                .map(iEdge => iEdge.clockwiseExteriorEdgeIndex);

            const collisionLists: CollisionEvent[][] = input.interiorEdges.map(e1 => {
                const list: (CollisionEvent | null)[] = [];
                const checkExteriorCollisions = !context.isPrimaryNonReflex(e1);
                list.push(...input.interiorEdges.map(e2 => collideEdges(e1, e2, context)));
                if (checkExteriorCollisions) {
                    list.push(...exteriorParentIds.map(e2 => collideEdges(e1, e2, context)));
                }
                return list.filter(event => event !== null)
                    .filter(event => event?.intersectionData[2] !== 'diverging')
                    .toSorted(sameInstigatorComparator);
            }).filter(list => list.length > 0);

            // --- Slicing logic ---
            const collisionListsCopy = collisionLists.map(l => [...l]);
            const collisionEventSlices: CollisionEvent[][] = [];
            let bestOffset = Number.POSITIVE_INFINITY;
            let slicesRemaining = true;

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
                    collisionEventSlices.push(nextSlice);
                }
                bestOffset = Number.POSITIVE_INFINITY;
                if (collisionEventSlices.length > 50) break;
            }

            // Record slices and find selected
            let selectedSliceIdx = -1;
            for (let si = 0; si < collisionEventSlices.length; si++) {
                const slice = collisionEventSlices[si];
                const nonPhantom = slice.filter(e => e.eventType !== 'phantomDivergentOffset');
                const isSelected = selectedSliceIdx === -1 && nonPhantom.length > 0;
                if (isSelected) selectedSliceIdx = si;

                snap.collisionSlices.push({
                    offset: slice[0]?.offsetDistance ?? 0,
                    events: slice.map(ev => ({
                        instigator: ev.collidingEdges[0],
                        target: ev.collidingEdges[1],
                        type: ev.eventType,
                        offset: ev.offsetDistance,
                        ray1Units: ev.intersectionData[0],
                        ray2Units: ev.intersectionData[1],
                        position: ev.position,
                    })),
                    nonPhantomCount: nonPhantom.length,
                    selected: isSelected,
                });

                if (isSelected) {
                    snap.selectedEvents = nonPhantom.map(ev => ({
                        instigator: ev.collidingEdges[0],
                        target: ev.collidingEdges[1],
                        type: ev.eventType,
                        offset: ev.offsetDistance,
                        position: ev.position,
                    }));
                }
            }

            // --- Actually run the step ---
            try {
                const result = HandleAlgorithmStepInput(context, input);
                const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
                exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));

                snap.newNodes = context.graph.nodes.slice(nodeCountBefore).map(n => ({
                    id: n.id,
                    position: {...n.position},
                    inEdges: [...n.inEdges],
                    outEdges: [...n.outEdges],
                }));
                snap.newInteriorEdges = context.graph.interiorEdges.slice(interiorCountBefore).map(ie => ({
                    id: ie.id,
                    cw: ie.clockwiseExteriorEdgeIndex,
                    ws: ie.widdershinsExteriorEdgeIndex,
                    source: context.getEdgeWithId(ie.id).source,
                    basis: {...context.getEdgeWithId(ie.id).basisVector},
                }));

                const childSteps = result.childSteps.filter(s => s.interiorEdges.length > 1);
                snap.childSteps = childSteps.map(s => ({edgeIds: [...s.interiorEdges], count: s.interiorEdges.length}));
                nextRoundInputs.push(...childSteps);
            } catch (e) {
                snap.error = (e as Error).message;
            }

            snap.acceptedExteriorCount = context.acceptedEdges
                .slice(0, context.graph.numExteriorNodes)
                .filter(Boolean).length;
            snap.acceptedExteriorIds = context.acceptedEdges
                .slice(0, context.graph.numExteriorNodes)
                .map((v, i) => v ? i : -1).filter(v => v !== -1);

            snapshots.push(snap);
        }
        inputs = nextRoundInputs;
    }

    return snapshots;
}

function formatSnap(s: RoundSnapshot): string {
    const parents = s.exteriorParents.map(p => `[cw${p.cw},ws${p.ws}]`).join(' ');
    const nodes = s.newNodes.map(n => `n${n.id}@(${n.position.x.toFixed(2)},${n.position.y.toFixed(2)})`).join(' ');
    const newEdges = s.newInteriorEdges.map(e => `e${e.id}[cw${e.cw},ws${e.ws}]`).join(' ');
    const selected = s.selectedEvents.map(e => `e${e.instigator}v${e.target}(${e.type},off=${e.offset.toFixed(4)})`).join(' ');
    const children = s.childSteps.map(c => `[${c.edgeIds}]`).join(' ');
    const err = s.error ? `\n    ERROR: ${s.error.slice(0, 200)}` : '';
    return [
        `R${s.round}.${s.inputIndex}: ${s.inputEdgeCount} edges ids=[${s.inputEdgeIds}] parents: ${parents}`,
        `  Selected collisions: ${selected}`,
        `  Slices: ${s.collisionSlices.length} total`,
        ...s.collisionSlices.slice(0, 5).map((sl, i) =>
            `    Slice[${i}] off=${sl.offset.toFixed(4)} ${sl.selected ? '>>>SELECTED<<<' : ''} ${sl.nonPhantomCount}/${sl.events.length} non-phantom: ${sl.events.map(e => `e${e.instigator}v${e.target}(${e.type})`).join(' ')}`
        ),
        `  New nodes: ${nodes || '(none)'}`,
        `  New interior edges: ${newEdges || '(none)'}`,
        `  Accepted exterior: [${s.acceptedExteriorIds}] (${s.acceptedExteriorCount}/${5})`,
        `  Child steps: ${children || '(none)'}`,
        err,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Test suites — one per vertex list
// ---------------------------------------------------------------------------

const CASES: { name: string; vertices: Vector2[]; expectSuccess: boolean }[] = [
    {name: 'SUCCESS_OUTER', vertices: SUCCESS_OUTER, expectSuccess: true},
    {name: 'FAILURE_START_CASE', vertices: FAILURE_START_CASE, expectSuccess: false},
    {name: 'FAILURE_END_CASE', vertices: FAILURE_END_CASE, expectSuccess: false},
    {name: 'SUCCESS_INNER', vertices: SUCCESS_INNER, expectSuccess: true},
];

describe.each(CASES)('Mid-case tracing: $name', ({name, vertices, expectSuccess}) => {
    let snapshots: RoundSnapshot[];
    let threw: boolean;

    beforeAll(() => {
        threw = false;
        try {
            snapshots = traceAlgorithm(vertices);
        } catch (e) {
            threw = true;
            snapshots = [];
        }
    });

    it(`traces ${name} step-by-step`, () => {
        console.log(`\n========== ${name} ==========`);
        console.log(`Vertices: ${JSON.stringify(vertices.map(v => `(${v.x},${v.y})`))}`);
        snapshots.forEach(s => console.log(formatSnap(s)));

        const hasError = snapshots.some(s => s.error);
        if (hasError) {
            console.log(`\n--- FIRST ERROR in ${name} ---`);
            const errSnap = snapshots.find(s => s.error)!;
            console.log(formatSnap(errSnap));
        }
        // Always passes — diagnostic only
        expect(true).toBe(true);
    });

    if (expectSuccess) {
        it(`${name} completes without error`, () => {
            expect(threw).toBe(false);
            expect(snapshots.every(s => !s.error)).toBe(true);
        });

        it(`${name} accepts all exterior edges`, () => {
            const lastSnap = snapshots[snapshots.length - 1];
            expect(lastSnap.acceptedExteriorCount).toBe(5);
        });
    } else {
        it.failing(`${name} completes without error (currently failing)`, () => {
            expect(threw).toBe(false);
            const errors = snapshots.filter(s => s.error);
            expect(errors).toHaveLength(0);
        });
    }
});

// ---------------------------------------------------------------------------
// Comparative analysis — find where successes and failures diverge
// ---------------------------------------------------------------------------

describe('Comparative analysis across all four cases', () => {
    const allTraces = new Map<string, RoundSnapshot[]>();

    beforeAll(() => {
        for (const {name, vertices} of CASES) {
            try {
                allTraces.set(name, traceAlgorithm(vertices));
            } catch {
                allTraces.set(name, []);
            }
        }
    });

    it('compares collision event ordering at each round', () => {
        const maxRounds = Math.max(...[...allTraces.values()].map(t => t.length));

        for (let r = 0; r < maxRounds; r++) {
            console.log(`\n--- Round step index ${r} ---`);
            for (const [name, snaps] of allTraces) {
                const snap = snaps[r];
                if (!snap) {
                    console.log(`  ${name}: (no step at index ${r})`);
                    continue;
                }
                const selectedStr = snap.selectedEvents
                    .map(e => `e${e.instigator}v${e.target}(${e.type} off=${e.offset.toFixed(4)} pos=(${e.position.x.toFixed(2)},${e.position.y.toFixed(2)}))`)
                    .join(', ');
                const sliceCount = snap.collisionSlices.length;
                const firstSliceOff = snap.collisionSlices[0]?.offset.toFixed(4) ?? 'N/A';

                console.log(`  ${name.padEnd(20)} R${snap.round}.${snap.inputIndex} edges=${snap.inputEdgeCount} ids=[${snap.inputEdgeIds}]`);
                console.log(`    ${''.padEnd(20)} slices=${sliceCount} firstOff=${firstSliceOff} selected: ${selectedStr || '(none)'}`);
                console.log(`    ${''.padEnd(20)} newNodes=[${snap.newNodes.map(n => `n${n.id}@(${n.position.x.toFixed(2)},${n.position.y.toFixed(2)})`).join(', ')}] accepted=[${snap.acceptedExteriorIds}]`);
                if (snap.error) {
                    console.log(`    ${''.padEnd(20)} ERROR: ${snap.error.slice(0, 150)}`);
                }
            }
        }

        // Always passes — diagnostic comparison
        expect(true).toBe(true);
    });

    it('identifies the divergence point between success and failure cases', () => {
        const successOuter = allTraces.get('SUCCESS_OUTER')!;
        const failureStart = allTraces.get('FAILURE_START_CASE')!;
        const failureEnd = allTraces.get('FAILURE_END_CASE')!;
        const successInner = allTraces.get('SUCCESS_INNER')!;

        const pairs: [string, RoundSnapshot[], string, RoundSnapshot[]][] = [
            ['SUCCESS_OUTER', successOuter, 'FAILURE_START_CASE', failureStart],
            ['SUCCESS_INNER', successInner, 'FAILURE_END_CASE', failureEnd],
            ['SUCCESS_OUTER', successOuter, 'SUCCESS_INNER', successInner],
            ['FAILURE_START_CASE', failureStart, 'FAILURE_END_CASE', failureEnd],
        ];

        for (const [nameA, snapsA, nameB, snapsB] of pairs) {
            console.log(`\n=== Comparing ${nameA} vs ${nameB} ===`);
            const maxLen = Math.max(snapsA.length, snapsB.length);

            for (let i = 0; i < maxLen; i++) {
                const a = snapsA[i];
                const b = snapsB[i];

                if (!a || !b) {
                    console.log(`  Step ${i}: ${!a ? nameA + ' ended' : nameB + ' ended'}`);
                    break;
                }

                // Compare selected collision event types
                const aSelected = a.selectedEvents.map(e => `${e.type}@${e.offset.toFixed(4)}`).join(',');
                const bSelected = b.selectedEvents.map(e => `${e.type}@${e.offset.toFixed(4)}`).join(',');

                if (aSelected !== bSelected) {
                    console.log(`  DIVERGE at step ${i} (R${a.round}.${a.inputIndex}):`);
                    console.log(`    ${nameA}: selected=[${aSelected}]`);
                    console.log(`    ${nameB}: selected=[${bSelected}]`);

                    // Dump full slice details for both
                    console.log(`    ${nameA} slices:`);
                    for (const sl of a.collisionSlices.slice(0, 6)) {
                        const evts = sl.events.map(e => `e${e.instigator}v${e.target}(${e.type},off=${e.offset.toFixed(4)},r1=${e.ray1Units.toFixed(4)},r2=${e.ray2Units.toFixed(4)})`).join(' ');
                        console.log(`      off=${sl.offset.toFixed(4)} ${sl.selected ? '>>>' : '   '} ${sl.nonPhantomCount}np: ${evts}`);
                    }
                    console.log(`    ${nameB} slices:`);
                    for (const sl of b.collisionSlices.slice(0, 6)) {
                        const evts = sl.events.map(e => `e${e.instigator}v${e.target}(${e.type},off=${e.offset.toFixed(4)},r1=${e.ray1Units.toFixed(4)},r2=${e.ray2Units.toFixed(4)})`).join(' ');
                        console.log(`      off=${sl.offset.toFixed(4)} ${sl.selected ? '>>>' : '   '} ${sl.nonPhantomCount}np: ${evts}`);
                    }
                    break;
                }

                // Compare accepted exterior edges
                if (JSON.stringify(a.acceptedExteriorIds) !== JSON.stringify(b.acceptedExteriorIds)) {
                    console.log(`  ACCEPTED DIVERGE at step ${i}: ${nameA}=[${a.acceptedExteriorIds}] vs ${nameB}=[${b.acceptedExteriorIds}]`);
                }

                // Compare child step counts
                if (a.childSteps.length !== b.childSteps.length) {
                    console.log(`  CHILD DIVERGE at step ${i}: ${nameA} has ${a.childSteps.length} children vs ${nameB} has ${b.childSteps.length}`);
                    break;
                }

                // If errored
                if (a.error || b.error) {
                    if (a.error && !b.error) console.log(`  ${nameA} ERRORS at step ${i}: ${a.error.slice(0, 120)}`);
                    if (!a.error && b.error) console.log(`  ${nameB} ERRORS at step ${i}: ${b.error.slice(0, 120)}`);
                    if (a.error && b.error) console.log(`  BOTH ERROR at step ${i}`);
                    break;
                }
            }
        }

        expect(true).toBe(true);
    });

    it('dumps per-edge collision details at the failure round for failure cases', () => {
        for (const failName of ['FAILURE_START_CASE', 'FAILURE_END_CASE']) {
            const snaps = allTraces.get(failName)!;
            const failSnap = snaps.find(s => s.error);
            if (!failSnap) {
                console.log(`${failName}: no error found in trace`);
                continue;
            }

            console.log(`\n=== ${failName} — Failure detail at R${failSnap.round}.${failSnap.inputIndex} ===`);
            console.log(`  Input edges: [${failSnap.inputEdgeIds}]`);
            console.log(`  Parents: ${failSnap.exteriorParents.map(p => `[cw${p.cw},ws${p.ws}]`).join(' ')}`);
            console.log(`  Error: ${failSnap.error}`);

            console.log(`\n  All collision slices:`);
            for (let si = 0; si < failSnap.collisionSlices.length; si++) {
                const sl = failSnap.collisionSlices[si];
                console.log(`    Slice[${si}] offset=${sl.offset.toFixed(6)} ${sl.selected ? '>>>SELECTED<<<' : ''} (${sl.nonPhantomCount}/${sl.events.length} non-phantom)`);
                for (const ev of sl.events) {
                    console.log(`      e${ev.instigator} vs e${ev.target}: type=${ev.type} offset=${ev.offset.toFixed(6)} ray1=${ev.ray1Units.toFixed(6)} ray2=${ev.ray2Units.toFixed(6)} pos=(${ev.position.x.toFixed(4)},${ev.position.y.toFixed(4)})`);
                }
            }

            // Find the matching success case's step at same round
            const successName = failName === 'FAILURE_START_CASE' ? 'SUCCESS_OUTER' : 'SUCCESS_INNER';
            const successSnaps = allTraces.get(successName)!;
            const matchSnap = successSnaps.find(s => s.round === failSnap.round && s.inputIndex === failSnap.inputIndex);
            if (matchSnap) {
                console.log(`\n  Matching ${successName} step at R${matchSnap.round}.${matchSnap.inputIndex}:`);
                console.log(`    Input edges: [${matchSnap.inputEdgeIds}]`);
                console.log(`    Parents: ${matchSnap.exteriorParents.map(p => `[cw${p.cw},ws${p.ws}]`).join(' ')}`);
                for (let si = 0; si < matchSnap.collisionSlices.length; si++) {
                    const sl = matchSnap.collisionSlices[si];
                    console.log(`    Slice[${si}] offset=${sl.offset.toFixed(6)} ${sl.selected ? '>>>SELECTED<<<' : ''} (${sl.nonPhantomCount}/${sl.events.length} non-phantom)`);
                    for (const ev of sl.events) {
                        console.log(`      e${ev.instigator} vs e${ev.target}: type=${ev.type} offset=${ev.offset.toFixed(6)} ray1=${ev.ray1Units.toFixed(6)} ray2=${ev.ray2Units.toFixed(6)} pos=(${ev.position.x.toFixed(4)},${ev.position.y.toFixed(4)})`);
                    }
                }
            }
        }

        expect(true).toBe(true);
    });

    it('compares source offset distances for initial interior edges', () => {
        console.log('\n=== Initial interior edge source offset distances ===');
        for (const {name, vertices} of CASES) {
            const context = makeStraightSkeletonSolverContext(vertices);
            initInteriorEdges(context);

            console.log(`\n${name}:`);
            for (const ie of context.graph.interiorEdges) {
                const offset = sourceOffsetDistance(ie, context);
                const pe = context.getEdgeWithId(ie.id);
                const src = context.findSource(ie.id);
                console.log(`  e${ie.id}: cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex} src=(${src.position.x.toFixed(2)},${src.position.y.toFixed(2)}) basis=(${pe.basisVector.x.toFixed(6)},${pe.basisVector.y.toFixed(6)}) srcOffset=${offset.toFixed(6)} isPrimaryNonReflex=${context.isPrimaryNonReflex(ie.id)}`);
            }
        }

        expect(true).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Focused bisector direction investigation
// ---------------------------------------------------------------------------

describe('Bisector direction investigation — Round 1 replay', () => {

    /**
     * Manually replay Round 0 to get to the Round 1 state, then dissect
     * the collision handling at Round 1 without running HandleAlgorithmStepInput.
     * This lets us trace exactly:
     *   1. Which collision events are generated
     *   2. Which is selected (first non-phantom slice)
     *   3. What handleCollisionEvent returns (parentSharing, collapsed edge, approx direction)
     *   4. What addBisectionEdge computes (raw bisected basis, final basis after direction check)
     *   5. The resulting e11 parents and direction
     */
    function replayToRound1(vertices: Vector2[]) {
        const context = makeStraightSkeletonSolverContext(vertices);
        initInteriorEdges(context);

        // --- Run Round 0 via the real code ---
        const r0Input: AlgorithmStepInput = {interiorEdges: context.graph.interiorEdges.map(e => e.id)};
        const r0Result = HandleAlgorithmStepInput(context, r0Input);
        context.graph.edges.slice(0, context.graph.numExteriorNodes).forEach(e => tryToAcceptExteriorEdge(context, e.id));
        const r1Inputs = r0Result.childSteps.filter(s => s.interiorEdges.length > 1);

        return {context, r1Inputs};
    }

    for (const {name, vertices} of CASES) {
        it(`dissects Round 1 collision handling for ${name}`, () => {
            const {context, r1Inputs} = replayToRound1(vertices);

            if (r1Inputs.length === 0) {
                console.log(`${name}: No Round 1 inputs (algorithm completed at Round 0)`);
                return;
            }

            const input = r1Inputs[0];
            const N = context.graph.numExteriorNodes;

            console.log(`\n========== ${name} — Round 1 Bisector Investigation ==========`);
            console.log(`Input edges: [${input.interiorEdges}]`);
            for (const id of input.interiorEdges) {
                const ie = context.getInteriorWithId(id);
                const pe = context.getEdgeWithId(id);
                const src = context.findSource(id);
                console.log(`  e${id}: cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex} src=n${pe.source}@(${src.position.x.toFixed(4)},${src.position.y.toFixed(4)}) basis=(${pe.basisVector.x.toFixed(6)},${pe.basisVector.y.toFixed(6)}) rank=${context.edgeRank(id)}`);
            }
            console.log(`Accepted before R1: ${dumpAccepted(context)}`);

            // --- Replicate collision detection ---
            const exteriorParentIds = input.interiorEdges
                .map(context.getInteriorWithId)
                .map(iEdge => iEdge.clockwiseExteriorEdgeIndex);

            const collisionLists: CollisionEvent[][] = input.interiorEdges.map(e1 => {
                const list: (CollisionEvent | null)[] = [];
                const checkExteriorCollisions = !context.isPrimaryNonReflex(e1);
                list.push(...input.interiorEdges.map(e2 => collideEdges(e1, e2, context)));
                if (checkExteriorCollisions) {
                    list.push(...exteriorParentIds.map(e2 => collideEdges(e1, e2, context)));
                }
                return list.filter(event => event !== null)
                    .filter(event => event?.intersectionData[2] !== 'diverging')
                    .toSorted(sameInstigatorComparator);
            }).filter(list => list.length > 0);

            // --- Slicing ---
            const collisionListsCopy = collisionLists.map(l => [...l]);
            const collisionEventSlices: CollisionEvent[][] = [];
            let bestOffset = Number.POSITIVE_INFINITY;
            let slicesRemaining = true;

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

                if (nextSlice.length > 0) collisionEventSlices.push(nextSlice);
                bestOffset = Number.POSITIVE_INFINITY;
                if (collisionEventSlices.length > 50) break;
            }

            // --- Find the selected events ---
            let collisionsToHandle: CollisionEvent[] | null = null;
            for (const slice of collisionEventSlices) {
                const valid = slice.filter(e => e.eventType !== 'phantomDivergentOffset');
                if (valid.length > 0) {
                    collisionsToHandle = valid;
                    break;
                }
            }

            if (!collisionsToHandle) {
                console.log(`  No collisions to handle!`);
                return;
            }

            console.log(`\nSelected collisions (${collisionsToHandle.length}):`);
            for (const ev of collisionsToHandle) {
                console.log(`  e${ev.collidingEdges[0]} vs e${ev.collidingEdges[1]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(6)} pos=(${ev.position.x.toFixed(4)},${ev.position.y.toFixed(4)})`);
            }

            // --- Now manually trace handleCollisionEvent for EACH selected event ---
            console.log(`\n--- Detailed collision handling ---`);

            const sortedEvents = collisionsToHandle.toSorted((e1, e2) => {
                return CollisionTypePriority[e1.eventType] - CollisionTypePriority[e2.eventType];
            });

            for (const event of sortedEvents) {
                const [instigatorId, targetId] = event.collidingEdges;
                const instigatorInterior = context.getInteriorWithId(instigatorId);
                const instigatorEdge = context.getEdgeWithId(instigatorId);

                console.log(`\n  Event: e${instigatorId} vs e${targetId} (${event.eventType})`);
                console.log(`    instigator: cw=${instigatorInterior.clockwiseExteriorEdgeIndex} ws=${instigatorInterior.widdershinsExteriorEdgeIndex} basis=(${instigatorEdge.basisVector.x.toFixed(6)},${instigatorEdge.basisVector.y.toFixed(6)})`);

                if (context.acceptedEdges[instigatorId] || context.acceptedEdges[targetId]) {
                    console.log(`    SKIPPED: already accepted (instigator=${context.acceptedEdges[instigatorId]}, target=${context.acceptedEdges[targetId]})`);
                    continue;
                }

                if (event.eventType === 'interiorPair') {
                    const otherInterior = context.getInteriorWithId(targetId);
                    const targetEdge = context.getEdgeWithId(targetId);
                    console.log(`    target:     cw=${otherInterior.clockwiseExteriorEdgeIndex} ws=${otherInterior.widdershinsExteriorEdgeIndex} basis=(${targetEdge.basisVector.x.toFixed(6)},${targetEdge.basisVector.y.toFixed(6)})`);

                    const parentSharing = checkSharedParents(instigatorId, targetId, context);
                    console.log(`    parentSharing: [${parentSharing}]`);
                    console.log(`      [0] instigator.cw(${instigatorInterior.clockwiseExteriorEdgeIndex}) === target.ws(${otherInterior.widdershinsExteriorEdgeIndex}): ${parentSharing[0]}`);
                    console.log(`      [1] instigator.ws(${instigatorInterior.widdershinsExteriorEdgeIndex}) === target.cw(${otherInterior.clockwiseExteriorEdgeIndex}): ${parentSharing[1]}`);

                    const widdershinsCollider = parentSharing[0] ? instigatorInterior : otherInterior;
                    const clockwiseCollider = parentSharing[1] ? instigatorInterior : otherInterior;

                    const collapsedEdge = clockwiseCollider.widdershinsExteriorEdgeIndex;
                    console.log(`    widdershinsCollider: e${widdershinsCollider.id} (cw=${widdershinsCollider.clockwiseExteriorEdgeIndex}, ws=${widdershinsCollider.widdershinsExteriorEdgeIndex})`);
                    console.log(`    clockwiseCollider:   e${clockwiseCollider.id} (cw=${clockwiseCollider.clockwiseExteriorEdgeIndex}, ws=${clockwiseCollider.widdershinsExteriorEdgeIndex})`);
                    console.log(`    collapsedEdge (cw-collider.ws): exterior edge ${collapsedEdge}`);

                    const approxDir = makeBisectedBasis(instigatorEdge.basisVector, targetEdge.basisVector);
                    console.log(`    approximateDirection = bisect(instigator.basis, target.basis) = (${approxDir.x.toFixed(6)},${approxDir.y.toFixed(6)})`);

                    const resultParams: BisectionParams = {
                        clockwiseExteriorEdgeIndex: clockwiseCollider.clockwiseExteriorEdgeIndex,
                        source: -1, // placeholder
                        widdershinsExteriorEdgeIndex: widdershinsCollider.widdershinsExteriorEdgeIndex,
                        approximateDirection: approxDir,
                    };
                    console.log(`    BisectionParams: cw=${resultParams.clockwiseExteriorEdgeIndex} ws=${resultParams.widdershinsExteriorEdgeIndex}`);

                    // Now trace what addBisectionEdge would compute
                    const cwParentEdge = context.getEdgeWithId(resultParams.clockwiseExteriorEdgeIndex);
                    const wsParentEdge = context.getEdgeWithId(resultParams.widdershinsExteriorEdgeIndex);
                    console.log(`\n    --- addBisectionEdge trace ---`);
                    console.log(`    cwParentEdge (ext ${resultParams.clockwiseExteriorEdgeIndex}): basis=(${cwParentEdge.basisVector.x.toFixed(6)},${cwParentEdge.basisVector.y.toFixed(6)})`);
                    console.log(`    wsParentEdge (ext ${resultParams.widdershinsExteriorEdgeIndex}): basis=(${wsParentEdge.basisVector.x.toFixed(6)},${wsParentEdge.basisVector.y.toFixed(6)})`);

                    const fromNodeWiddershins = scaleVector(wsParentEdge.basisVector, -1);
                    console.log(`    fromNodeWiddershins = -wsParent.basis = (${fromNodeWiddershins.x.toFixed(6)},${fromNodeWiddershins.y.toFixed(6)})`);

                    const rawBisectedBasis = makeBisectedBasis(cwParentEdge.basisVector, fromNodeWiddershins);
                    console.log(`    rawBisectedBasis = bisect(cwParent.basis, fromNodeWiddershins) = (${rawBisectedBasis.x.toFixed(6)},${rawBisectedBasis.y.toFixed(6)})`);

                    // Since approxDir is provided, it uses ensureDirectionNotReversed
                    const dotWithApprox = dotProduct(rawBisectedBasis, approxDir);
                    const finalBasis = ensureDirectionNotReversed(rawBisectedBasis, approxDir);
                    console.log(`    dot(rawBasis, approxDir) = ${dotWithApprox.toFixed(6)} → ${dotWithApprox < 0 ? 'FLIPPED' : 'kept'}`);
                    console.log(`    finalBasis = (${finalBasis.x.toFixed(6)},${finalBasis.y.toFixed(6)})`);

                    // What would ensureBisectionIsInterior produce (the alternative path)?
                    const crossCwWs = crossProduct(cwParentEdge.basisVector, wsParentEdge.basisVector);
                    const altBasis = ensureBisectionIsInterior(cwParentEdge, wsParentEdge, rawBisectedBasis);
                    console.log(`\n    [ALT] cross(cwParent, wsParent) = ${crossCwWs.toFixed(6)} → ${crossCwWs < 0 ? 'would flip' : 'would keep'}`);
                    console.log(`    [ALT] ensureBisectionIsInterior = (${altBasis.x.toFixed(6)},${altBasis.y.toFixed(6)})`);
                    console.log(`    [CMP] approxDir path vs interior path: ${Math.abs(finalBasis.x - altBasis.x) < 0.0001 && Math.abs(finalBasis.y - altBasis.y) < 0.0001 ? 'SAME' : 'DIFFERENT <<<'}`);

                    if (Math.abs(finalBasis.x - altBasis.x) > 0.0001 || Math.abs(finalBasis.y - altBasis.y) > 0.0001) {
                        console.log(`    *** DIRECTION MISMATCH: approxDir path gives (${finalBasis.x.toFixed(6)},${finalBasis.y.toFixed(6)}) but interior-cross path gives (${altBasis.x.toFixed(6)},${altBasis.y.toFixed(6)}) ***`);
                    }
                }

                if (event.eventType === 'interiorNonAdjacent') {
                    const otherInterior = context.getInteriorWithId(targetId);
                    const targetEdge = context.getEdgeWithId(targetId);
                    console.log(`    target:     cw=${otherInterior.clockwiseExteriorEdgeIndex} ws=${otherInterior.widdershinsExteriorEdgeIndex} basis=(${targetEdge.basisVector.x.toFixed(6)},${targetEdge.basisVector.y.toFixed(6)})`);

                    const approxDir1 = makeBisectedBasis(instigatorEdge.basisVector, targetEdge.basisVector);
                    const approxDir2 = scaleVector(approxDir1, -1);
                    console.log(`    approxDir1 = (${approxDir1.x.toFixed(6)},${approxDir1.y.toFixed(6)})`);
                    console.log(`    approxDir2 = (${approxDir2.x.toFixed(6)},${approxDir2.y.toFixed(6)})`);

                    // Trace both bisection edges
                    for (const [label, params] of [
                        ['partition1', {cw: instigatorInterior.clockwiseExteriorEdgeIndex, ws: otherInterior.widdershinsExteriorEdgeIndex, dir: approxDir1}],
                        ['partition2', {cw: otherInterior.clockwiseExteriorEdgeIndex, ws: instigatorInterior.widdershinsExteriorEdgeIndex, dir: approxDir2}],
                    ] as const) {
                        const cwEdge = context.getEdgeWithId(params.cw);
                        const wsEdge = context.getEdgeWithId(params.ws);
                        const fromWs = scaleVector(wsEdge.basisVector, -1);
                        const rawBasis = makeBisectedBasis(cwEdge.basisVector, fromWs);
                        const final = ensureDirectionNotReversed(rawBasis, params.dir);
                        const alt = ensureBisectionIsInterior(cwEdge, wsEdge, rawBasis);
                        const dotVal = dotProduct(rawBasis, params.dir);
                        console.log(`    ${label}: cw=${params.cw} ws=${params.ws}`);
                        console.log(`      rawBasis=(${rawBasis.x.toFixed(6)},${rawBasis.y.toFixed(6)}) dot=${dotVal.toFixed(6)} → final=(${final.x.toFixed(6)},${final.y.toFixed(6)})`);
                        console.log(`      [ALT] interior=(${alt.x.toFixed(6)},${alt.y.toFixed(6)}) ${Math.abs(final.x - alt.x) < 0.0001 && Math.abs(final.y - alt.y) < 0.0001 ? 'SAME' : 'DIFFERENT <<<'}`);
                    }
                }

                if (event.eventType === 'interiorAgainstExterior') {
                    const targetEdge = context.getEdgeWithId(targetId);
                    console.log(`    target (exterior ${targetId}): basis=(${targetEdge.basisVector.x.toFixed(6)},${targetEdge.basisVector.y.toFixed(6)})`);
                    const dir1 = scaleVector(targetEdge.basisVector, -1);
                    const dir2 = targetEdge.basisVector;
                    console.log(`    approxDir1 (cw=${instigatorInterior.clockwiseExteriorEdgeIndex},ws=${targetId}) = (${dir1.x.toFixed(6)},${dir1.y.toFixed(6)})`);
                    console.log(`    approxDir2 (cw=${targetId},ws=${instigatorInterior.widdershinsExteriorEdgeIndex}) = (${dir2.x.toFixed(6)},${dir2.y.toFixed(6)})`);

                    for (const [label, params] of [
                        ['split1', {cw: instigatorInterior.clockwiseExteriorEdgeIndex, ws: targetId, dir: dir1}],
                        ['split2', {cw: targetId, ws: instigatorInterior.widdershinsExteriorEdgeIndex, dir: dir2}],
                    ] as const) {
                        const cwEdge = context.getEdgeWithId(params.cw);
                        const wsEdge = context.getEdgeWithId(params.ws);
                        const fromWs = scaleVector(wsEdge.basisVector, -1);
                        const rawBasis = makeBisectedBasis(cwEdge.basisVector, fromWs);
                        const final = ensureDirectionNotReversed(rawBasis, params.dir);
                        const alt = ensureBisectionIsInterior(cwEdge, wsEdge, rawBasis);
                        const dotVal = dotProduct(rawBasis, params.dir);
                        console.log(`    ${label}: cw=${params.cw} ws=${params.ws}`);
                        console.log(`      rawBasis=(${rawBasis.x.toFixed(6)},${rawBasis.y.toFixed(6)}) dot=${dotVal.toFixed(6)} → final=(${final.x.toFixed(6)},${final.y.toFixed(6)})`);
                        console.log(`      [ALT] interior=(${alt.x.toFixed(6)},${alt.y.toFixed(6)}) ${Math.abs(final.x - alt.x) < 0.0001 && Math.abs(final.y - alt.y) < 0.0001 ? 'SAME' : 'DIFFERENT <<<'}`);
                    }
                }
            }

            // --- Now actually run the real handler and compare ---
            console.log(`\n--- Actual HandleAlgorithmStepInput result ---`);
            const nodeCountBefore = context.graph.nodes.length;
            const interiorCountBefore = context.graph.interiorEdges.length;
            try {
                const result = HandleAlgorithmStepInput(context, input);
                context.graph.edges.slice(0, N).forEach(e => tryToAcceptExteriorEdge(context, e.id));

                for (const n of context.graph.nodes.slice(nodeCountBefore)) {
                    console.log(`  New node n${n.id} at (${n.position.x.toFixed(4)},${n.position.y.toFixed(4)}) in=[${n.inEdges}] out=[${n.outEdges}]`);
                }
                for (const ie of context.graph.interiorEdges.slice(interiorCountBefore)) {
                    const pe = context.getEdgeWithId(ie.id);
                    console.log(`  New e${ie.id}: cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex} src=n${pe.source} basis=(${pe.basisVector.x.toFixed(6)},${pe.basisVector.y.toFixed(6)})`);
                }
                console.log(`  Accepted after: ${dumpAccepted(context)}`);
                const children = result.childSteps.filter(s => s.interiorEdges.length > 1);
                for (const c of children) {
                    console.log(`  Child: [${c.interiorEdges}]`);
                    for (const eId of c.interiorEdges) {
                        const ie = context.getInteriorWithId(eId);
                        const pe = context.getEdgeWithId(eId);
                        const src = context.findSource(eId);
                        console.log(`    e${eId}: cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex} src=n${pe.source}@(${src.position.x.toFixed(4)},${src.position.y.toFixed(4)}) basis=(${pe.basisVector.x.toFixed(6)},${pe.basisVector.y.toFixed(6)})`);
                    }
                }
            } catch (e) {
                console.log(`  ERROR: ${(e as Error).message.slice(0, 300)}`);
            }

            expect(true).toBe(true);
        });
    }
});

// ---------------------------------------------------------------------------
// Trace cross-product vs approxDir for EVERY secondary edge in the algorithm
// ---------------------------------------------------------------------------

describe('Direction method reliability — every secondary edge', () => {

    function traceAllSecondaryEdges(name: string, vertices: Vector2[]) {
        const context = makeStraightSkeletonSolverContext(vertices);
        initInteriorEdges(context);
        const N = context.graph.numExteriorNodes;
        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

        const edgesBefore = context.graph.interiorEdges.length;

        console.log(`\n========== ${name}: secondary edge direction audit ==========`);

        for (let round = 0; round < 20 && inputs.length > 0; round++) {
            const nextRoundInputs: AlgorithmStepInput[] = [];
            for (let inputIdx = 0; inputIdx < inputs.length; inputIdx++) {
                const input = inputs[inputIdx];
                const interiorCountBefore = context.graph.interiorEdges.length;

                try {
                    const result = HandleAlgorithmStepInput(context, input);
                    context.graph.edges.slice(0, N).forEach(e => tryToAcceptExteriorEdge(context, e.id));

                    // Inspect every new secondary edge created during this step
                    for (const ie of context.graph.interiorEdges.slice(interiorCountBefore)) {
                        const pe = context.getEdgeWithId(ie.id);
                        const cwEdge = context.getEdgeWithId(ie.clockwiseExteriorEdgeIndex);
                        const wsEdge = context.getEdgeWithId(ie.widdershinsExteriorEdgeIndex);

                        const span = (ie.widdershinsExteriorEdgeIndex - ie.clockwiseExteriorEdgeIndex + N) % N;

                        // Recompute what addBisectionEdge would have done with each method
                        const fromWs = scaleVector(wsEdge.basisVector, -1);
                        const rawBasis = makeBisectedBasis(cwEdge.basisVector, fromWs);

                        // Cross-product method
                        const cx = crossProduct(cwEdge.basisVector, wsEdge.basisVector);
                        const crossBasis = cx < 0 ? scaleVector(rawBasis, -1) : rawBasis;

                        // Approximate direction method — use the actual basis to infer what approxDir was
                        const actualBasis = pe.basisVector;
                        const dotActualRaw = dotProduct(actualBasis, rawBasis);
                        const approxKept = dotActualRaw > 0; // actual == raw means approxDir kept it

                        // Check agreement
                        const crossKept = cx >= 0;
                        const agree = (approxKept === crossKept);

                        // Check correctness: which method gives the actual (presumably correct) direction?
                        const actualMatchesCross = Math.abs(actualBasis.x - crossBasis.x) < 0.001 && Math.abs(actualBasis.y - crossBasis.y) < 0.001;

                        console.log(`  R${round}.${inputIdx} e${ie.id}[cw${ie.clockwiseExteriorEdgeIndex},ws${ie.widdershinsExteriorEdgeIndex}] span=${span} N/2=${N/2}`);
                        console.log(`    raw=(${rawBasis.x.toFixed(6)},${rawBasis.y.toFixed(6)}) cross=${cx.toFixed(6)} crossWouldKeep=${crossKept}`);
                        console.log(`    actual=(${actualBasis.x.toFixed(6)},${actualBasis.y.toFixed(6)}) approxKept=${approxKept}`);
                        console.log(`    agree=${agree} actualMatchesCross=${actualMatchesCross}`);
                        if (!agree) {
                            console.log(`    *** DISAGREEMENT: span=${span} vs N/2=${N/2} — span ${span * 2 < N ? '< N/2 → CROSS PRODUCT should win' : '>= N/2 → APPROX DIR should win'} ***`);
                        }
                    }

                    const children = result.childSteps.filter(s => s.interiorEdges.length > 1);
                    nextRoundInputs.push(...children);
                } catch (e) {
                    console.log(`  R${round}.${inputIdx} ERROR: ${(e as Error).message.slice(0, 200)}`);
                }
            }
            inputs = nextRoundInputs;
        }
    }

    for (const {name, vertices} of CASES) {
        it(`audits all secondary edges for ${name}`, () => {
            traceAllSecondaryEdges(name, vertices);
            expect(true).toBe(true);
        });
    }
});
