import {initContext, stepWithCapture, collectCollisionEvents} from '../test-cases/test-helpers';
import {setSkeletonLogLevel} from '../logger';
import {collideEdges} from '../collision-helpers';
import {CRAB_TEST_CASE} from '../test-cases/crab-test-case';

import {stepAlgorithm, runAlgorithmV5} from '../algorithm-termination-cases';
import {tryToAcceptExteriorEdge} from '../algorithm-helpers';
import {
    crossProduct,
    subtractVectors,
    normalize,
    dotProduct,
    scaleVector
} from '../core-functions';
import {intersectRays} from '../intersection-edges';
import {generateSplitEventFromTheEdgeItself} from '../generate-split-event';
import type {AlgorithmStepInput, RayProjection, Vector2} from '../types';

setSkeletonLogLevel('debug');
const fmt = (v: Vector2) => `(${v.x.toFixed(4)}, ${v.y.toFixed(4)})`;
const fmtRay = (r: RayProjection) => `src=${fmt(r.sourceVector)} basis=${fmt(r.basisVector)}`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Crab Test Case Debug', () => {

    it('1. initializes without error', () => {
        expect(() => initContext(CRAB_TEST_CASE)).not.toThrow();
    });

    it('2. runAlgorithmV5 reports the failure', () => {
        let error: string | null = null;
        try {
            runAlgorithmV5(CRAB_TEST_CASE);
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }

        if (error) {
            console.log(`\n!!! runAlgorithmV5 threw: ${error}`);
        } else {
            console.log('\nrunAlgorithmV5 succeeded (no error)');
        }

        // Log whether all exterior edges were accepted
        try {
            const ctx = runAlgorithmV5(CRAB_TEST_CASE);
            const numExt = ctx.graph.numExteriorNodes;
            const unaccepted: number[] = [];
            for (let i = 0; i < numExt; i++) {
                if (!ctx.acceptedEdges[i]) unaccepted.push(i);
            }
            if (unaccepted.length > 0) {
                console.log(`Unaccepted exterior edges: [${unaccepted.join(',')}]`);
            } else {
                console.log('All exterior edges accepted');
            }
        } catch {
            // already logged above
        }
    });

    it('3. step-by-step trace with stepWithCapture', () => {
        const result = stepWithCapture(CRAB_TEST_CASE);

        console.log('\n=== Step-by-step results ===');
        console.log(`Steps completed: ${result.snapshots.length}, error: ${result.error ?? 'none'}`);

        for (const snap of result.snapshots) {
            console.log(
                `\nStep ${snap.step}:` +
                ` childSteps=${snap.inputCount}` +
                ` nodes=${snap.nodeCount}` +
                ` edges=${snap.edgeCount}` +
                ` interiorEdges=${snap.interiorEdgeCount}`
            );
            console.log(`  accepted: [${snap.acceptedEdges.map((v, j) => v ? j : '').filter(x => x !== '').join(',')}]`);
            for (let c = 0; c < snap.inputs.length; c++) {
                console.log(`  child[${c}]: edges=[${snap.inputs[c].edges.join(',')}]`);
            }
        }

        if (result.error) {
            console.log(`\n!!! ALGORITHM ERROR: ${result.error}`);
            console.log(`Last inputs had ${result.lastInputs.length} group(s):`);
            for (let g = 0; g < result.lastInputs.length; g++) {
                console.log(`  group[${g}]: edges=[${result.lastInputs[g].interiorEdges.join(',')}]`);
            }
        }
    });

    it('4. reflex vertex identification and bisector directions', () => {
        const context = initContext(CRAB_TEST_CASE);
        const numExt = context.graph.numExteriorNodes;

        console.log('\n=== Reflex vertex identification ===');
        for (let v = 0; v < numExt; v++) {
            const interiorEdge = context.graph.interiorEdges[v];
            const isReflex = context.isReflexEdge(interiorEdge);
            const edgeData = context.getEdgeWithId(interiorEdge.id);
            console.log(
                `  v${v}: reflex=${isReflex}` +
                ` bisector e${interiorEdge.id} basis=${fmt(edgeData.basisVector)}` +
                ` parents(cw=${interiorEdge.clockwiseExteriorEdgeIndex}, ws=${interiorEdge.widdershinsExteriorEdgeIndex})`
            );
        }

        console.log('\n=== Interior angles ===');
        for (let v = 0; v < numExt; v++) {
            const prev = CRAB_TEST_CASE[(v - 1 + numExt) % numExt];
            const curr = CRAB_TEST_CASE[v];
            const next = CRAB_TEST_CASE[(v + 1) % numExt];
            const inVec = subtractVectors(curr, prev);
            const outVec = subtractVectors(next, curr);
            const [inNorm] = normalize(inVec);
            const [outNorm] = normalize(outVec);
            const cross = crossProduct(outNorm, inNorm);
            const dot = dotProduct(inNorm, outNorm);
            const angleDeg = Math.atan2(cross, dot) * 180 / Math.PI;
            console.log(
                `  v${v}: angle=${angleDeg.toFixed(2)} deg` +
                ` (${cross < 0 ? 'REFLEX' : 'convex'})` +
                ` pos=${fmt(curr)}`
            );
        }
    });

    it('5. collision events at each step', () => {
        const context = initContext(CRAB_TEST_CASE);
        const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);

        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];
        let step = 0;

        console.log('\n=== Collision events per step ===');

        while (inputs.length > 0) {
            console.log(`\n--- Step ${step} (${inputs.length} input groups) ---`);
            for (let g = 0; g < inputs.length; g++) {
                const group = inputs[g];
                console.log(`  Group ${g}: edges [${group.interiorEdges.join(',')}]`);

                for (let i = 0; i < group.interiorEdges.length; i++) {
                    for (let j = i + 1; j < group.interiorEdges.length; j++) {
                        const e1 = group.interiorEdges[i];
                        const e2 = group.interiorEdges[j];
                        const collisions = collideEdges(e1, e2, context);
                        for (const collision of collisions) {
                            console.log(
                                `    ${e1} x ${e2}: type=${collision.eventType}` +
                                ` offset=${collision.offsetDistance.toFixed(4)}` +
                                ` pos=${fmt(collision.position)}` +
                                ` intersect=[${collision.intersectionData[0].toFixed(4)}, ${collision.intersectionData[1].toFixed(4)}, ${collision.intersectionData[2]}]`
                            );
                        }
                    }

                    const e1 = group.interiorEdges[i];
                    if (!context.isPrimaryNonReflex(e1)) {
                        for (let ext = 0; ext < context.graph.numExteriorNodes; ext++) {
                            if (context.acceptedEdges[ext]) continue;
                            const collisions = collideEdges(e1, ext, context);
                            for (const collision of collisions) {
                                console.log(
                                    `    ${e1} x ext${ext}: type=${collision.eventType}` +
                                    ` offset=${collision.offsetDistance.toFixed(4)}` +
                                    ` pos=${fmt(collision.position)}` +
                                    ` intersect=[${collision.intersectionData[0].toFixed(4)}, ${collision.intersectionData[1].toFixed(4)}, ${collision.intersectionData[2]}]`
                                );
                            }
                        }
                    }
                }
            }

            try {
                inputs = stepAlgorithm(context, inputs).childSteps;
                exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
                step++;
            } catch (e) {
                console.log(`\n!!! ERROR at step ${step}: ${e instanceof Error ? e.message : e}`);
                break;
            }
        }
    });

    it('6. post-failure state analysis', () => {
        const result = stepWithCapture(CRAB_TEST_CASE);
        if (!result.error) {
            console.log('Algorithm succeeded — no failure to analyze');
            return;
        }

        const context = result.context;
        const numExt = context.graph.numExteriorNodes;

        console.log('\n=== Post-failure state ===');
        console.log(`Error: ${result.error}`);
        console.log(`Steps completed: ${result.snapshots.length}`);

        const acceptedExtIds: number[] = [];
        const unacceptedExtIds: number[] = [];
        for (let i = 0; i < numExt; i++) {
            (context.acceptedEdges[i] ? acceptedExtIds : unacceptedExtIds).push(i);
        }
        console.log(`Accepted exterior edges: [${acceptedExtIds.join(',')}]`);
        console.log(`Unaccepted exterior edges: [${unacceptedExtIds.join(',')}]`);

        // Show ALL accepted edges (interior too)
        const acceptedInteriorIds: number[] = [];
        for (let i = numExt; i < context.acceptedEdges.length; i++) {
            if (context.acceptedEdges[i]) acceptedInteriorIds.push(i);
        }
        console.log(`Accepted interior edges: [${acceptedInteriorIds.join(',')}]`);

        const activeInterior = context.graph.interiorEdges
            .filter(ie => !context.isAcceptedInterior(ie));
        console.log(`\nActive interior edges: ${activeInterior.length}`);
        for (const ie of activeInterior) {
            const edgeData = context.getEdgeWithId(ie.id);
            const sourcePos = context.graph.nodes[edgeData.source].position;
            const cwParent = context.clockwiseParent(ie);
            const wsParent = context.widdershinsParent(ie);
            const cwAccepted = context.isAccepted(cwParent.id);
            const wsAccepted = context.isAccepted(wsParent.id);
            console.log(
                `  e${ie.id}: parents(cw=${ie.clockwiseExteriorEdgeIndex}${cwAccepted ? ' ACCEPTED' : ''}, ws=${ie.widdershinsExteriorEdgeIndex}${wsAccepted ? ' ACCEPTED' : ''})` +
                ` reflex=${context.isReflexEdge(ie)} rank=${context.edgeRank(ie.id)}` +
                `\n    basis=${fmt(edgeData.basisVector)} source=node${edgeData.source} ${fmt(sourcePos)}`
            );
        }

        // Identify interior edges whose parents are accepted — these are the ones
        // that will crash generateSplitEvent via spanExcludingAccepted
        console.log('\n=== Edges with accepted parents (root cause of crash) ===');
        for (const ie of activeInterior) {
            const cwParent = context.clockwiseParent(ie);
            const wsParent = context.widdershinsParent(ie);
            if (context.isAccepted(cwParent.id) || context.isAccepted(wsParent.id)) {
                console.log(
                    `  e${ie.id}: cwParent ext${cwParent.id} accepted=${context.isAccepted(cwParent.id)}` +
                    ` wsParent ext${wsParent.id} accepted=${context.isAccepted(wsParent.id)}` +
                    ` reflex=${context.isReflexEdge(ie)}`
                );
            }
        }

        // Use try/catch for pairwise collisions since collideEdges can also
        // trigger the same span error internally via generateSplitEvent
        console.log('\n=== Pairwise ray intersections among active edges (safe) ===');
        const activeIds = activeInterior.map(ie => ie.id);
        for (let i = 0; i < activeIds.length; i++) {
            for (let j = i + 1; j < activeIds.length; j++) {
                const eA = context.getInteriorWithId(activeIds[i]);
                const eB = context.getInteriorWithId(activeIds[j]);
                const rayA = context.projectRayInterior(eA);
                const rayB = context.projectRayInterior(eB);
                const intersection = intersectRays(rayA, rayB);
                let collisionStr: string;
                try {
                    const collisions = collideEdges(activeIds[i], activeIds[j], context);
                    collisionStr = collisions.length > 0 ? collisions.map(c => `${c.eventType} offset=${c.offsetDistance.toFixed(4)}`).join('; ') : 'NO COLLISION';
                } catch (e) {
                    collisionStr = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
                }
                console.log(
                    `  ${activeIds[i]} x ${activeIds[j]}: ray=[${intersection[0].toFixed(4)}, ${intersection[1].toFixed(4)}, ${intersection[2]}] → ${collisionStr}`
                );
            }
        }

        console.log('\n=== Reflex vs unaccepted exterior edges ===');
        for (const ie of activeInterior) {
            if (!context.isReflexEdge(ie)) continue;
            for (const ext of unacceptedExtIds) {
                const instigatorRay = context.projectRayInterior(ie);
                const extEdge = context.getEdgeWithId(ext);
                const extRay = context.projectRay(extEdge);
                const initial = intersectRays(instigatorRay, extRay);
                let collisionStr: string;
                try {
                    const collisions = collideEdges(ie.id, ext, context);
                    collisionStr = collisions.length > 0 ? collisions.map(c => `${c.eventType} offset=${c.offsetDistance.toFixed(4)}`).join('; ') : 'NO COLLISION';
                } catch (e) {
                    collisionStr = `CRASH: ${e instanceof Error ? e.message : String(e)}`;
                }
                console.log(
                    `  e${ie.id} x ext${ext}: initialRay=[${initial[0].toFixed(4)}, ${initial[1].toFixed(4)}, ${initial[2]}] → ${collisionStr}`
                );
            }
        }
    });

    it('7. initial collision event ranking (sorted by offset)', () => {
        const context = initContext(CRAB_TEST_CASE);

        console.log('\n=== Step 0 collision events (sorted by offset) ===');
        const allEvents = collectCollisionEvents(context);

        for (const {label, event} of allEvents) {
            console.log(
                `  ${label}: type=${event.eventType} offset=${event.offsetDistance.toFixed(4)}` +
                ` pos=${fmt(event.position)}` +
                ` rayLen=${event.intersectionData[0].toFixed(4)}`
            );
        }

        console.log(`  Total events: ${allEvents.length}`);
    });

    it('8. DEEP TRACE: reflex vertices vs all exterior edges via generateSplitEventFromTheEdgeItself', () => {
        const result = stepWithCapture(CRAB_TEST_CASE);
        const context = result.error ? result.context : initContext(CRAB_TEST_CASE);
        const numExt = context.graph.numExteriorNodes;

        console.log('\n=== Reflex edge split event analysis ===');
        console.log(`(Using ${result.error ? 'post-failure' : 'initial'} context)\n`);

        const reflexEdges = context.graph.interiorEdges
            .filter(ie => context.isReflexEdge(ie) && !context.isAcceptedInterior(ie));

        for (const ie of reflexEdges) {
            const instigatorRay = context.projectRayInterior(ie);
            console.log(`\n--- e${ie.id} (parents cw=${ie.clockwiseExteriorEdgeIndex}, ws=${ie.widdershinsExteriorEdgeIndex}) ---`);
            console.log(`  ray: ${fmtRay(instigatorRay)}`);

            for (let ext = 0; ext < numExt; ext++) {
                if (context.acceptedEdges[ext]) continue;
                // Skip own parents
                if (ext === ie.clockwiseExteriorEdgeIndex || ext === ie.widdershinsExteriorEdgeIndex) {
                    continue;
                }

                const extEdge = context.getEdgeWithId(ext);
                const extRay = context.projectRay(extEdge);
                const initialTest = intersectRays(instigatorRay, extRay);

                const splitResult = generateSplitEventFromTheEdgeItself(ie.id, ext, context);
                const cwParent = context.clockwiseParent(ie);
                const instigatorOwnParentCross = crossProduct(instigatorRay.basisVector, cwParent.basisVector);
                const instigatorTargetCross = crossProduct(scaleVector(instigatorRay.basisVector, -1), extEdge.basisVector);
                const divisor = instigatorOwnParentCross + instigatorTargetCross;

                console.log(
                    `  e${ie.id} x ext${ext}: initial=[${initialTest[0].toFixed(4)}, ${initialTest[1].toFixed(4)}, ${initialTest[2]}]` +
                    ` divisor=${divisor.toFixed(4)}` +
                    ` → ${splitResult === null ? 'null' : `offset=${splitResult.offsetDistance.toFixed(4)} pos=${fmt(splitResult.position)}`}`
                );
            }
        }
    });

    it('9. graph topology at failure: nodes, edges, and connectivity', () => {
        const result = stepWithCapture(CRAB_TEST_CASE);
        if (!result.error) {
            console.log('Algorithm succeeded — no failure to analyze');
            return;
        }

        const context = result.context;
        const {graph} = context;

        console.log('\n=== Graph topology at failure ===');
        console.log(`Nodes: ${graph.nodes.length} (${graph.numExteriorNodes} exterior)`);
        console.log(`Edges: ${graph.edges.length} (${graph.numExteriorNodes} exterior, ${graph.interiorEdges.length} interior)`);

        console.log('\n--- Interior nodes ---');
        for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
            const node = graph.nodes[i];
            console.log(
                `  node${i}: pos=${fmt(node.position)}` +
                ` inEdges=[${node.inEdges.join(',')}]` +
                ` outEdges=[${node.outEdges.join(',')}]`
            );
        }

        console.log('\n--- All interior edges ---');
        for (const ie of graph.interiorEdges) {
            const ed = graph.edges[ie.id];
            const accepted = context.isAcceptedInterior(ie);
            console.log(
                `  e${ie.id}: src=node${ed.source} tgt=${ed.target ?? 'none'}` +
                ` parents(cw=${ie.clockwiseExteriorEdgeIndex}, ws=${ie.widdershinsExteriorEdgeIndex})` +
                ` rank=${context.edgeRank(ie.id)} accepted=${accepted}` +
                ` basis=${fmt(ed.basisVector)}`
            );
        }

        // Look for edges that are part of the last failing inputs
        console.log('\n--- Last failing input groups ---');
        for (let g = 0; g < result.lastInputs.length; g++) {
            const group = result.lastInputs[g];
            console.log(`  group[${g}]: [${group.interiorEdges.join(',')}]`);
            for (const eid of group.interiorEdges) {
                const ie = context.getInteriorWithId(eid);
                const ed = context.getEdgeWithId(eid);
                const src = graph.nodes[ed.source];
                console.log(
                    `    e${eid}: parents(cw=${ie.clockwiseExteriorEdgeIndex}, ws=${ie.widdershinsExteriorEdgeIndex})` +
                    ` reflex=${context.isReflexEdge(ie)} rank=${context.edgeRank(eid)}` +
                    ` src=node${ed.source} ${fmt(src.position)} basis=${fmt(ed.basisVector)}`
                );
            }
        }
    });
});
