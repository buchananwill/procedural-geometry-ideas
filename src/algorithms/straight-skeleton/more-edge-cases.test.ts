import {HandleAlgorithmStepInput} from './algorithm-termination-cases';
import {makeStraightSkeletonSolverContext} from './solver-context';
import {initInteriorEdges, initStraightSkeletonSolverContext, performOneStep, tryToAcceptExteriorEdge} from './algorithm-helpers';
import type {AlgorithmStepInput, StraightSkeletonSolverContext, Vector2, CollisionEvent} from './types';
import {CAUSES_MISSING_SECONDARY_EDGE, WACKY_OCTAGON, WACKY_OCTAGON_WRONG_OUTCOME} from './more-edge-cases';
import {collideEdges, sourceOffsetDistance} from './collision-helpers';
import {areEqual} from './core-functions';
import {graphIsComplete} from './algorithm';

const VERTICES: Vector2[] = CAUSES_MISSING_SECONDARY_EDGE as Vector2[];

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
    const ev1Phantom = ev1.eventType === 'phantomDivergentOffset';
    const ev2Phantom = ev2.eventType === 'phantomDivergentOffset';

    if (ev1Phantom !== ev2Phantom) {
        return ev1.offsetDistance - ev2.offsetDistance;
    }

    return areEqual(length1a, length2a) ? ev1.offsetDistance - ev2.offsetDistance : length1a - length2a;
}

describe('CAUSES_MISSING_SECONDARY_EDGE — stepping trace', () => {

    it('steps through the algorithm and traces collisions', () => {
        const context = makeStraightSkeletonSolverContext(VERTICES);
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
                for (const eid of input.interiorEdges) {
                    console.log(`  ${formatEdge(eid, context)}`);
                }
                console.log(`Accepted before: ${dumpAccepted(context)}`);

                // Replicate handleInteriorEdges collision list building (only for >3 edges)
                if (input.interiorEdges.length > 3) {
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

                    // Log per-instigator sorted lists
                    for (let li = 0; li < collisionLists.length; li++) {
                        const list = collisionLists[li];
                        console.log(`  List[${li}] (instigator e${list[0].collidingEdges[0]}):`);
                        for (let ei = 0; ei < Math.min(5, list.length); ei++) {
                            const ev = list[ei];
                            console.log(`    [${ei}] e${ev.collidingEdges[0]} vs e${ev.collidingEdges[1]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)} ray1=${ev.intersectionData[0].toFixed(4)}`);
                        }
                    }

                    // Replicate slicing logic
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
                    for (let si = 0; si < collisionEventSlices.length; si++) {
                        const validEvents = collisionEventSlices[si].filter(e => e.eventType !== 'phantomDivergentOffset');
                        if (validEvents.length > 0) {
                            console.log(`  >>> SELECTED SLICE[${si}] with ${validEvents.length} events:`);
                            for (const ev of validEvents) {
                                console.log(`      e${ev.collidingEdges[0]} vs e${ev.collidingEdges[1]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)} pos=(${ev.position.x.toFixed(2)},${ev.position.y.toFixed(2)})`);
                            }
                            break;
                        }
                    }
                } else if (input.interiorEdges.length === 3) {
                    // For triangle, show all pairwise collisions
                    const ids = input.interiorEdges;
                    const pairings = [[0,1],[0,2],[1,2]];
                    for (const [i, j] of pairings) {
                        const ev = collideEdges(ids[i], ids[j], context);
                        if (ev) {
                            console.log(`  e${ids[i]} vs e${ids[j]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)} pos=(${ev.position.x.toFixed(2)},${ev.position.y.toFixed(2)}) [${ev.intersectionData[2]}]`);
                        } else {
                            console.log(`  e${ids[i]} vs e${ids[j]}: null`);
                        }
                    }
                }

                // Run the actual step
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
                    console.log(`  ERROR: ${(e as Error).message.slice(0, 300)}`);
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
            const tgt = e.target !== undefined ? e.target : '?';
            console.log(`  e${e.id}: ${e.source}->${tgt} [${accepted}] basis=(${e.basisVector.x.toFixed(4)},${e.basisVector.y.toFixed(4)})`);
        }

        const allAccepted = context.acceptedEdges.every(a => a);
        console.log(`\nAll accepted: ${allAccepted}`);

        expect(allAccepted).toBe(true);
    });
});

describe('WACKY_OCTAGON — stepping trace', () => {

    it.failing('steps through the algorithm and traces collisions', () => {
        const context = makeStraightSkeletonSolverContext(WACKY_OCTAGON as Vector2[]);
        initInteriorEdges(context);
        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

        console.log('=== WACKY_OCTAGON INITIAL STATE ===');
        console.log(`Exterior edges: ${context.graph.numExteriorNodes}`);
        console.log(`Vertices:`);
        for (let i = 0; i < context.graph.numExteriorNodes; i++) {
            const n = context.graph.nodes[i];
            console.log(`  v${i} at (${n.position.x.toFixed(2)}, ${n.position.y.toFixed(2)})`);
        }
        console.log(`Interior edges:`);
        for (const ie of context.graph.interiorEdges) {
            console.log(`  ${formatEdge(ie.id, context)}`);
        }

        for (let round = 0; round < 20 && inputs.length > 0; round++) {
            const nextRoundInputs: AlgorithmStepInput[] = [];

            for (let inputIdx = 0; inputIdx < inputs.length; inputIdx++) {
                const input = inputs[inputIdx];
                console.log(`\n=== ROUND ${round}.${inputIdx} — edges [${input.interiorEdges}] (${input.interiorEdges.length} edges) ===`);
                for (const eid of input.interiorEdges) {
                    console.log(`  ${formatEdge(eid, context)}`);
                }
                console.log(`Accepted before: ${dumpAccepted(context)}`);

                if (input.interiorEdges.length > 3) {
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

                    // Log per-instigator sorted lists with offset distance details
                    for (let li = 0; li < collisionLists.length; li++) {
                        const list = collisionLists[li];
                        console.log(`  List[${li}] (instigator e${list[0].collidingEdges[0]}):`);
                        for (let ei = 0; ei < Math.min(8, list.length); ei++) {
                            const ev = list[ei];
                            const srcOffset = sourceOffsetDistance(context.getInteriorWithId(ev.collidingEdges[0]), context);
                            console.log(`    [${ei}] e${ev.collidingEdges[0]} vs e${ev.collidingEdges[1]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(6)} ray1=${ev.intersectionData[0].toFixed(6)} ray2=${ev.intersectionData[1].toFixed(6)} srcOffset=${srcOffset.toFixed(6)} pos=(${ev.position.x.toFixed(2)},${ev.position.y.toFixed(2)})`);
                        }
                    }

                    // Replicate slicing logic
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
                            console.log(`  Slice[${sliceNum}] offset=${bestOffset.toFixed(6)}: ${nextSlice.length} events (${nonPhantom.length} non-phantom)`);
                            for (const ev of nextSlice) {
                                console.log(`    e${ev.collidingEdges[0]} vs e${ev.collidingEdges[1]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(6)} [${ev.intersectionData[2]}]`);
                            }
                            collisionEventSlices.push(nextSlice);
                        }
                        bestOffset = Number.POSITIVE_INFINITY;
                        sliceNum++;
                        if (sliceNum > 30) break;
                    }

                    // Find the selected slice
                    for (let si = 0; si < collisionEventSlices.length; si++) {
                        const validEvents = collisionEventSlices[si].filter(e => e.eventType !== 'phantomDivergentOffset');
                        if (validEvents.length > 0) {
                            console.log(`  >>> SELECTED SLICE[${si}] with ${validEvents.length} events:`);
                            for (const ev of validEvents) {
                                console.log(`      e${ev.collidingEdges[0]} vs e${ev.collidingEdges[1]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(6)} pos=(${ev.position.x.toFixed(4)},${ev.position.y.toFixed(4)}) [${ev.intersectionData[2]}]`);
                            }
                            break;
                        }
                    }
                } else if (input.interiorEdges.length === 3) {
                    const ids = input.interiorEdges;
                    const pairings = [[0,1],[0,2],[1,2]];
                    for (const [i, j] of pairings) {
                        const ev = collideEdges(ids[i], ids[j], context);
                        if (ev) {
                            console.log(`  e${ids[i]} vs e${ids[j]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(6)} pos=(${ev.position.x.toFixed(4)},${ev.position.y.toFixed(4)}) [${ev.intersectionData[2]}]`);
                        } else {
                            console.log(`  e${ids[i]} vs e${ids[j]}: null`);
                        }
                    }
                } else if (input.interiorEdges.length === 2) {
                    const [id1, id2] = input.interiorEdges;
                    const ev = collideEdges(id1, id2, context);
                    if (ev) {
                        console.log(`  e${id1} vs e${id2}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(6)} pos=(${ev.position.x.toFixed(4)},${ev.position.y.toFixed(4)}) [${ev.intersectionData[2]}]`);
                    } else {
                        console.log(`  e${id1} vs e${id2}: null`);
                    }
                }

                // Run the actual step
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
                    console.log(`  ERROR: ${(e as Error).message.slice(0, 500)}`);
                    console.log(`  Accepted after error: ${dumpAccepted(context)}`);
                }
            }
            inputs = nextRoundInputs;
        }

        // Final summary
        console.log('\n=== WACKY_OCTAGON FINAL GRAPH ===');
        console.log(`Accepted: ${dumpAccepted(context)}`);
        for (const n of context.graph.nodes) {
            console.log(`  Node ${n.id} at (${n.position.x.toFixed(4)}, ${n.position.y.toFixed(4)}) in=[${n.inEdges}] out=[${n.outEdges}]`);
        }
        for (const e of context.graph.edges) {
            const accepted = context.acceptedEdges[e.id] ? 'ACCEPTED' : 'free';
            const tgt = e.target !== undefined ? e.target : '?';
            console.log(`  e${e.id}: ${e.source}->${tgt} [${accepted}] basis=(${e.basisVector.x.toFixed(4)},${e.basisVector.y.toFixed(4)})`);
        }

        const allAccepted = context.acceptedEdges.every(a => a);
        console.log(`\nAll accepted: ${allAccepted}`);

        // Detailed comparison with the known wrong outcome
        console.log('\n=== DETAILED COMPARISON WITH WRONG OUTCOME ===');
        const wrong = WACKY_OCTAGON_WRONG_OUTCOME;

        console.log(`Node count: ours=${context.graph.nodes.length} wrong=${wrong.nodes.length}`);
        console.log(`Edge count: ours=${context.graph.edges.length} wrong=${wrong.edges.length}`);
        console.log(`Interior edge count: ours=${context.graph.interiorEdges.length} wrong=${wrong.interiorEdges.length}`);

        // Compare nodes
        const maxNodes = Math.max(context.graph.nodes.length, wrong.nodes.length);
        for (let i = 0; i < maxNodes; i++) {
            const ours = context.graph.nodes[i];
            const theirs = wrong.nodes[i];
            if (!ours) { console.log(`  Node ${i}: MISSING in ours, wrong has (${theirs.position.x.toFixed(4)},${theirs.position.y.toFixed(4)})`); continue; }
            if (!theirs) { console.log(`  Node ${i}: ours has (${ours.position.x.toFixed(4)},${ours.position.y.toFixed(4)}), MISSING in wrong`); continue; }
            const posDiff = Math.abs(ours.position.x - theirs.position.x) + Math.abs(ours.position.y - theirs.position.y);
            const inMatch = JSON.stringify(ours.inEdges) === JSON.stringify(theirs.inEdges);
            const outMatch = JSON.stringify(ours.outEdges) === JSON.stringify(theirs.outEdges);
            if (posDiff > 0.001 || !inMatch || !outMatch) {
                console.log(`  Node ${i} DIFFERS:`);
                if (posDiff > 0.001) console.log(`    pos: ours=(${ours.position.x.toFixed(4)},${ours.position.y.toFixed(4)}) wrong=(${theirs.position.x.toFixed(4)},${theirs.position.y.toFixed(4)})`);
                if (!inMatch) console.log(`    inEdges: ours=[${ours.inEdges}] wrong=[${theirs.inEdges}]`);
                if (!outMatch) console.log(`    outEdges: ours=[${ours.outEdges}] wrong=[${theirs.outEdges}]`);
            }
        }

        // Compare edges
        const maxEdges = Math.max(context.graph.edges.length, wrong.edges.length);
        for (let i = 0; i < maxEdges; i++) {
            const ours = context.graph.edges[i];
            const theirs = wrong.edges[i];
            if (!ours) { console.log(`  Edge ${i}: MISSING in ours`); continue; }
            if (!theirs) { console.log(`  Edge ${i}: MISSING in wrong`); continue; }
            const srcMatch = ours.source === theirs.source;
            const tgtMatch = ours.target === theirs.target;
            const basisDiff = Math.abs(ours.basisVector.x - theirs.basisVector.x) + Math.abs(ours.basisVector.y - theirs.basisVector.y);
            if (!srcMatch || !tgtMatch || basisDiff > 0.0001) {
                console.log(`  Edge ${i} DIFFERS:`);
                if (!srcMatch) console.log(`    source: ours=${ours.source} wrong=${theirs.source}`);
                if (!tgtMatch) console.log(`    target: ours=${ours.target} wrong=${theirs.target}`);
                if (basisDiff > 0.0001) console.log(`    basis: ours=(${ours.basisVector.x.toFixed(6)},${ours.basisVector.y.toFixed(6)}) wrong=(${theirs.basisVector.x.toFixed(6)},${theirs.basisVector.y.toFixed(6)})`);
            }
        }

        // Compare interior edges
        const maxInterior = Math.max(context.graph.interiorEdges.length, wrong.interiorEdges.length);
        for (let i = 0; i < maxInterior; i++) {
            const ours = context.graph.interiorEdges[i];
            const theirs = wrong.interiorEdges[i];
            if (!ours) { console.log(`  Interior ${i}: MISSING in ours`); continue; }
            if (!theirs) { console.log(`  Interior ${i}: MISSING in wrong`); continue; }
            const idMatch = ours.id === theirs.id;
            const cwMatch = ours.clockwiseExteriorEdgeIndex === theirs.clockwiseExteriorEdgeIndex;
            const wsMatch = ours.widdershinsExteriorEdgeIndex === theirs.widdershinsExteriorEdgeIndex;
            if (!idMatch || !cwMatch || !wsMatch) {
                console.log(`  InteriorEdge[${i}] DIFFERS:`);
                if (!idMatch) console.log(`    id: ours=${ours.id} wrong=${theirs.id}`);
                if (!cwMatch) console.log(`    cw: ours=${ours.clockwiseExteriorEdgeIndex} wrong=${theirs.clockwiseExteriorEdgeIndex}`);
                if (!wsMatch) console.log(`    ws: ours=${ours.widdershinsExteriorEdgeIndex} wrong=${theirs.widdershinsExteriorEdgeIndex}`);
            }
        }

        // Geometric verification: each interior node should be equidistant from
        // its adjacent exterior edges (the defining property of a straight skeleton).
        console.log('\n=== GEOMETRIC VERIFICATION ===');

        function pointToLineDistance(point: Vector2, lineStart: Vector2, lineDir: Vector2): number {
            const dx = point.x - lineStart.x;
            const dy = point.y - lineStart.y;
            return Math.abs(dx * lineDir.y - dy * lineDir.x);
        }

        for (const ie of context.graph.interiorEdges) {
            const edge = context.getEdgeWithId(ie.id);
            if (edge.target === undefined) continue;

            const targetNode = context.graph.nodes[edge.target];
            const cwParent = context.getEdgeWithId(ie.clockwiseExteriorEdgeIndex);
            const wsParent = context.getEdgeWithId(ie.widdershinsExteriorEdgeIndex);

            const cwSource = context.graph.nodes[cwParent.source].position;
            const wsSource = context.graph.nodes[wsParent.source].position;

            const distToCw = pointToLineDistance(targetNode.position, cwSource, cwParent.basisVector);
            const distToWs = pointToLineDistance(targetNode.position, wsSource, wsParent.basisVector);

            const diff = Math.abs(distToCw - distToWs);
            if (diff > 0.01) {
                console.log(`  e${ie.id} (cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex}) target=node${edge.target} at (${targetNode.position.x.toFixed(4)},${targetNode.position.y.toFixed(4)}): dist_cw=${distToCw.toFixed(6)} dist_ws=${distToWs.toFixed(6)} DIFF=${diff.toFixed(6)} *** FAIL ***`);
            } else {
                console.log(`  e${ie.id} (cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex}) target=node${edge.target}: dist_cw=${distToCw.toFixed(6)} dist_ws=${distToWs.toFixed(6)} OK`);
            }
        }

        // At each interior node, ALL arriving edges should see equal offset distance
        console.log('\n=== NODE OFFSET CONSISTENCY ===');
        for (let ni = context.graph.numExteriorNodes; ni < context.graph.nodes.length; ni++) {
            const node = context.graph.nodes[ni];
            const distByExterior = new Map<number, number>();
            const details: string[] = [];

            for (const inEdgeId of node.inEdges) {
                if (inEdgeId < context.graph.numExteriorNodes) continue;
                const ie = context.getInteriorWithId(inEdgeId);
                const cwParent = context.getEdgeWithId(ie.clockwiseExteriorEdgeIndex);
                const wsParent = context.getEdgeWithId(ie.widdershinsExteriorEdgeIndex);
                const cwDist = pointToLineDistance(node.position, context.graph.nodes[cwParent.source].position, cwParent.basisVector);
                const wsDist = pointToLineDistance(node.position, context.graph.nodes[wsParent.source].position, wsParent.basisVector);
                details.push(`e${inEdgeId}(cw${ie.clockwiseExteriorEdgeIndex}=${cwDist.toFixed(4)} ws${ie.widdershinsExteriorEdgeIndex}=${wsDist.toFixed(4)})`);
                distByExterior.set(ie.clockwiseExteriorEdgeIndex, cwDist);
                distByExterior.set(ie.widdershinsExteriorEdgeIndex, wsDist);
            }

            const uniqueDists = [...distByExterior.values()];
            const minDist = Math.min(...uniqueDists);
            const maxDist = Math.max(...uniqueDists);
            if (maxDist - minDist > 0.5) {
                console.log(`  Node ${ni} at (${node.position.x.toFixed(2)},${node.position.y.toFixed(2)}): *** NOT EQUIDISTANT *** min=${minDist.toFixed(4)} max=${maxDist.toFixed(4)} ${details.join(' ')}`);
            } else {
                console.log(`  Node ${ni}: equidist=${minDist.toFixed(4)} extEdges=[${[...distByExterior.keys()]}] ${details.join(' ')}`);
            }
        }

        expect(allAccepted).toBe(true);
    });
});

