import {HandleAlgorithmStepInput} from './algorithm-termination-cases';
import {makeStraightSkeletonSolverContext} from './solver-context';
import {initInteriorEdges, tryToAcceptExteriorEdge} from './algorithm-helpers';
import type {AlgorithmStepInput, StraightSkeletonSolverContext, Vector2, CollisionEvent} from './types';
import {LONG_OCTAGON, FAILING_LONG_OCTAGON, FAILING_GENTLE_REFLEX_PENTAGON} from './test-cases/long-octagon';
import {collideEdges, collideInteriorEdges, sourceOffsetDistance} from './collision-helpers';
import {areEqual} from './core-functions';
import {unitsToIntersection} from './intersection-edges';

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

function tracePolygon(label: string, vertices: Vector2[]) {
    const context = makeStraightSkeletonSolverContext(vertices);
    initInteriorEdges(context);
    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

    console.log(`=== ${label} INITIAL STATE ===`);
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

                for (let li = 0; li < collisionLists.length; li++) {
                    const list = collisionLists[li];
                    console.log(`  List[${li}] (instigator e${list[0].collidingEdges[0]}):`);
                    for (let ei = 0; ei < Math.min(8, list.length); ei++) {
                        const ev = list[ei];
                        console.log(`    [${ei}] e${ev.collidingEdges[0]} vs e${ev.collidingEdges[1]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)} ray1=${ev.intersectionData[0].toFixed(4)} ray2=${ev.intersectionData[1].toFixed(4)} pos=(${ev.position.x.toFixed(2)},${ev.position.y.toFixed(2)})`);
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
                const ids = input.interiorEdges;
                const pairings = [[0,1],[0,2],[1,2]];
                for (const [i, j] of pairings) {
                    // Raw ray intersection data
                    const edgeA = context.getInteriorWithId(ids[i]);
                    const edgeB = context.getInteriorWithId(ids[j]);
                    const ray1 = context.projectRayInterior(edgeA);
                    const ray2 = context.projectRayInterior(edgeB);
                    const rawIntersection = unitsToIntersection(ray1, ray2);
                    console.log(`  RAW e${ids[i]} vs e${ids[j]}: [${rawIntersection[0].toFixed(4)}, ${rawIntersection[1].toFixed(4)}, ${rawIntersection[2]}] ray1src=(${ray1.sourceVector.x.toFixed(2)},${ray1.sourceVector.y.toFixed(2)}) ray1dir=(${ray1.basisVector.x.toFixed(4)},${ray1.basisVector.y.toFixed(4)}) ray2src=(${ray2.sourceVector.x.toFixed(2)},${ray2.sourceVector.y.toFixed(2)}) ray2dir=(${ray2.basisVector.x.toFixed(4)},${ray2.basisVector.y.toFixed(4)})`);

                    const ev = collideEdges(ids[i], ids[j], context);
                    if (ev) {
                        console.log(`  e${ids[i]} vs e${ids[j]}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)} pos=(${ev.position.x.toFixed(2)},${ev.position.y.toFixed(2)}) [${ev.intersectionData[2]}]`);
                    } else {
                        console.log(`  e${ids[i]} vs e${ids[j]}: null (filtered by collideEdges)`);
                    }
                }
            } else if (input.interiorEdges.length === 2) {
                const [id1, id2] = input.interiorEdges;
                const ev = collideEdges(id1, id2, context);
                if (ev) {
                    console.log(`  e${id1} vs e${id2}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)} pos=(${ev.position.x.toFixed(2)},${ev.position.y.toFixed(2)}) [${ev.intersectionData[2]}]`);
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
    console.log(`\n=== ${label} FINAL GRAPH ===`);
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
    return allAccepted;
}

describe('LONG_OCTAGON — succeeding reference', () => {
    it('traces the algorithm to completion', () => {
        const result = tracePolygon('LONG_OCTAGON', LONG_OCTAGON as Vector2[]);
        expect(result).toBe(true);
    });
});

describe('FAILING_LONG_OCTAGON — trace', () => {
    it('traces the algorithm and captures failure', () => {
        const result = tracePolygon('FAILING_LONG_OCTAGON', FAILING_LONG_OCTAGON as Vector2[]);
        expect(result).toBe(true);
    });
});

describe('FAILING_GENTLE_REFLEX_PENTAGON — trace', () => {
    it('traces the algorithm and captures failure', () => {
        const result = tracePolygon('FAILING_GENTLE_REFLEX_PENTAGON', FAILING_GENTLE_REFLEX_PENTAGON as Vector2[]);
        expect(result).toBe(true);
    });
});
