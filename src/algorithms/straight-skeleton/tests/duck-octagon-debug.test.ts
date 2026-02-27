import {initContext, stepWithCapture} from '../test-cases/test-helpers';
import {setSkeletonLogLevel} from '../logger';
import {collideEdges} from '../collision-helpers';

setSkeletonLogLevel('debug');
import {DUCK_OCTAGON_FAILS, DUCK_OCTAGON_PASSES, MOORHEN_FAILS, MOORHEN_PASSES} from '../test-cases/duck-octagon';
import {checkSharedParents} from '../collision-helpers';
import handleCollisionEvent from '../collision-handling';
import {StepAlgorithm} from '../algorithm-termination-cases';
import {tryToAcceptExteriorEdge} from '../algorithm-helpers';
import type {AlgorithmStepInput, CollisionEvent} from '../types';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Duck Octagon Debug — step-through comparison', () => {

    it('both octagons initialize without error', () => {
        expect(() => initContext(DUCK_OCTAGON_FAILS)).not.toThrow();
        expect(() => initContext(DUCK_OCTAGON_PASSES)).not.toThrow();
    });

    it('initial interior edges match structurally', () => {
        const ctxFail = initContext(DUCK_OCTAGON_FAILS);
        const ctxPass = initContext(DUCK_OCTAGON_PASSES);

        expect(ctxFail.graph.interiorEdges.length).toBe(ctxPass.graph.interiorEdges.length);

        console.log('\n=== Initial Interior Edges ===');
        for (let i = 0; i < ctxFail.graph.interiorEdges.length; i++) {
            const f = ctxFail.graph.interiorEdges[i];
            const p = ctxPass.graph.interiorEdges[i];
            const fEdge = ctxFail.graph.edges[f.id];
            const pEdge = ctxPass.graph.edges[p.id];
            console.log(
                `[${i}] id=${f.id} parents(cw=${f.clockwiseExteriorEdgeIndex}, ws=${f.widdershinsExteriorEdgeIndex})` +
                ` basis FAIL=(${fEdge.basisVector.x.toFixed(4)}, ${fEdge.basisVector.y.toFixed(4)})` +
                ` PASS=(${pEdge.basisVector.x.toFixed(4)}, ${pEdge.basisVector.y.toFixed(4)})`
            );
        }
    });

    it('step-by-step comparison identifies divergence', () => {
        const fail = stepWithCapture(DUCK_OCTAGON_FAILS);
        const pass = stepWithCapture(DUCK_OCTAGON_PASSES);

        console.log('\n=== Step-by-step results ===');
        console.log(`FAILS: ${fail.snapshots.length} steps completed, error: ${fail.error ?? 'none'}`);
        console.log(`PASSES: ${pass.snapshots.length} steps completed, error: ${pass.error ?? 'none'}`);

        const maxSteps = Math.max(fail.snapshots.length, pass.snapshots.length);
        let firstDivergence = -1;

        for (let i = 0; i < maxSteps; i++) {
            const f = fail.snapshots[i];
            const p = pass.snapshots[i];

            if (!f || !p) {
                console.log(`\nStep ${i}: ${!f ? 'FAILS missing' : 'PASSES missing'}`);
                if (firstDivergence === -1) firstDivergence = i;
                continue;
            }

            const acceptedMatch = JSON.stringify(f.acceptedEdges) === JSON.stringify(p.acceptedEdges);
            const inputCountMatch = f.inputCount === p.inputCount;
            const nodeCountMatch = f.nodeCount === p.nodeCount;

            console.log(
                `\nStep ${i}:` +
                ` childSteps: F=${f.inputCount} P=${p.inputCount}${inputCountMatch ? '' : ' *** DIVERGE ***'}` +
                ` nodes: F=${f.nodeCount} P=${p.nodeCount}${nodeCountMatch ? '' : ' *** DIVERGE ***'}` +
                ` accepted: ${acceptedMatch ? 'match' : '*** DIVERGE ***'}`
            );

            if (!acceptedMatch) {
                console.log(`  FAIL accepted: [${f.acceptedEdges.map((v, j) => v ? j : '').filter(Boolean).join(',')}]`);
                console.log(`  PASS accepted: [${p.acceptedEdges.map((v, j) => v ? j : '').filter(Boolean).join(',')}]`);
            }

            // Log child step edge lists
            for (let c = 0; c < Math.max(f.inputs.length, p.inputs.length); c++) {
                const fe = f.inputs[c]?.edges ?? [];
                const pe = p.inputs[c]?.edges ?? [];
                console.log(`  child[${c}]: F=[${fe.join(',')}] P=[${pe.join(',')}]`);
            }

            if (firstDivergence === -1 && (!acceptedMatch || !inputCountMatch || !nodeCountMatch)) {
                firstDivergence = i;
            }
        }

        if (firstDivergence >= 0) {
            console.log(`\n>>> First divergence at step ${firstDivergence}`);
        } else {
            console.log('\n>>> No divergence detected in snapshots');
        }

        // We expect PASSES to succeed
        expect(pass.error).toBeNull();
    });

    it('edge 15 and ext2 details in FAILS polygon', () => {
        const context = initContext(DUCK_OCTAGON_FAILS);
        const edge15 = context.getInteriorWithId(15);
        const edge15Data = context.getEdgeWithId(15);
        const ext2Data = context.getEdgeWithId(2);
        console.log('\n=== Edge 15 (interior) ===');
        console.log(`  parents: cw=${edge15.clockwiseExteriorEdgeIndex}, ws=${edge15.widdershinsExteriorEdgeIndex}`);
        console.log(`  source node: ${edge15Data.source} at (${context.graph.nodes[edge15Data.source].position.x.toFixed(2)}, ${context.graph.nodes[edge15Data.source].position.y.toFixed(2)})`);
        console.log(`  basis: (${edge15Data.basisVector.x.toFixed(4)}, ${edge15Data.basisVector.y.toFixed(4)})`);
        console.log(`  isPrimaryNonReflex: ${context.isPrimaryNonReflex(15)}`);
        console.log(`  edgeRank: ${context.edgeRank(15)}`);
        console.log('\n=== Ext edge 2 ===');
        console.log(`  source: ${ext2Data.source} target: ${ext2Data.target}`);
        console.log(`  source pos: (${context.graph.nodes[ext2Data.source].position.x.toFixed(2)}, ${context.graph.nodes[ext2Data.source].position.y.toFixed(2)})`);
        console.log(`  target pos: (${context.graph.nodes[ext2Data.target!].position.x.toFixed(2)}, ${context.graph.nodes[ext2Data.target!].position.y.toFixed(2)})`);
        console.log(`  basis: (${ext2Data.basisVector.x.toFixed(4)}, ${ext2Data.basisVector.y.toFixed(4)})`);

        // Also show the PASSES polygon's edge 15
        const ctxP = initContext(DUCK_OCTAGON_PASSES);
        const edge15P = ctxP.getInteriorWithId(15);
        const edge15PData = ctxP.getEdgeWithId(15);
        console.log('\n=== PASSES: Edge 15 (interior) ===');
        console.log(`  parents: cw=${edge15P.clockwiseExteriorEdgeIndex}, ws=${edge15P.widdershinsExteriorEdgeIndex}`);
        console.log(`  source node: ${edge15PData.source} at (${ctxP.graph.nodes[edge15PData.source].position.x.toFixed(2)}, ${ctxP.graph.nodes[edge15PData.source].position.y.toFixed(2)})`);
        console.log(`  basis: (${edge15PData.basisVector.x.toFixed(4)}, ${edge15PData.basisVector.y.toFixed(4)})`);
        console.log(`  isPrimaryNonReflex: ${ctxP.isPrimaryNonReflex(15)}`);

        // Check the collision result for PASSES
        const collsP = collideEdges(15, 2, ctxP);
        console.log(`\n=== PASSES: 15 x ext2 collision ===`);
        if (collsP.length > 0) {
            for (const collP of collsP) {
                console.log(`  type=${collP.eventType} offset=${collP.offsetDistance.toFixed(4)} pos=(${collP.position.x.toFixed(2)}, ${collP.position.y.toFixed(2)})`);
            }
        } else {
            console.log(`  empty (no collision)`);
        }
    });

    it('step 0 collision events comparison (FAILS vs PASSES)', () => {
        for (const [label, verts] of [['FAILS', DUCK_OCTAGON_FAILS], ['PASSES', DUCK_OCTAGON_PASSES]] as const) {
            const context = initContext(verts);
            const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
            const edges = context.graph.interiorEdges.map(e => e.id);
            const exteriorParents = edges.map(id => context.getInteriorWithId(id).clockwiseExteriorEdgeIndex);

            console.log(`\n=== ${label}: Step 0 collision events (sorted by offset) ===`);
            const allEvents: { label: string; event: CollisionEvent }[] = [];

            for (let i = 0; i < edges.length; i++) {
                const e1 = edges[i];
                const checkExterior = !context.isPrimaryNonReflex(e1);
                for (let j = i + 1; j < edges.length; j++) {
                    const events = collideEdges(e1, edges[j], context);
                    for (const event of events) {
                        if (event.intersectionData[2] !== 'diverging') {
                            allEvents.push({label: `${e1} x ${edges[j]}`, event});
                        }
                    }
                }
                if (checkExterior) {
                    for (const ep of exteriorParents) {
                        const events = collideEdges(e1, ep, context);
                        for (const event of events) {
                            if (event.intersectionData[2] !== 'diverging') {
                                allEvents.push({label: `${e1} x ext${ep}`, event});
                            }
                        }
                    }
                }
            }

            allEvents.sort((a, b) => a.event.offsetDistance - b.event.offsetDistance);
            for (const {label: lbl, event: ev} of allEvents) {
                console.log(
                    `  ${lbl}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)}` +
                    ` pos=(${ev.position.x.toFixed(2)}, ${ev.position.y.toFixed(2)})`
                );
            }
        }
    });

    it('collision events at each step for FAILS polygon', () => {
        const context = initContext(DUCK_OCTAGON_FAILS);
        const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);

        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];
        let step = 0;

        console.log('\n=== FAILS polygon: collision events per step ===');

        while (inputs.length > 0) {
            console.log(`\n--- Step ${step} (${inputs.length} input groups) ---`);
            for (let g = 0; g < inputs.length; g++) {
                const group = inputs[g];
                console.log(`  Group ${g}: edges [${group.interiorEdges.join(',')}]`);

                // Log all pairwise collisions
                for (let i = 0; i < group.interiorEdges.length; i++) {
                    for (let j = i + 1; j < group.interiorEdges.length; j++) {
                        const e1 = group.interiorEdges[i];
                        const e2 = group.interiorEdges[j];
                        const collisions = collideEdges(e1, e2, context);
                        for (const collision of collisions) {
                            console.log(
                                `    ${e1} x ${e2}: type=${collision.eventType}` +
                                ` offset=${collision.offsetDistance.toFixed(4)}` +
                                ` pos=(${collision.position.x.toFixed(2)}, ${collision.position.y.toFixed(2)})` +
                                ` intersect=[${collision.intersectionData[0].toFixed(4)}, ${collision.intersectionData[1].toFixed(4)}, ${collision.intersectionData[2]}]`
                            );
                        }
                    }

                    // Also check exterior edge collisions
                    const e1 = group.interiorEdges[i];
                    const interiorEdge = context.getInteriorWithId(e1);
                    const exteriorParents = [
                        interiorEdge.clockwiseExteriorEdgeIndex,
                        interiorEdge.widdershinsExteriorEdgeIndex,
                    ];
                    for (const ep of exteriorEdges.map(e => e.id)) {
                        if (exteriorParents.includes(ep)) continue;
                        const collisions = collideEdges(e1, ep, context);
                        for (const collision of collisions) {
                            console.log(
                                `    ${e1} x ext${ep}: type=${collision.eventType}` +
                                ` offset=${collision.offsetDistance.toFixed(4)}` +
                                ` pos=(${collision.position.x.toFixed(2)}, ${collision.position.y.toFixed(2)})` +
                                ` intersect=[${collision.intersectionData[0].toFixed(4)}, ${collision.intersectionData[1].toFixed(4)}, ${collision.intersectionData[2]}]`
                            );
                        }
                    }
                }
            }

            try {
                inputs = StepAlgorithm(context, inputs).childSteps;
                exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
                step++;
            } catch (e) {
                console.log(`\n!!! ERROR at step ${step}: ${e instanceof Error ? e.message : e}`);
                break;
            }
        }
    });
});

// ---------------------------------------------------------------------------
// Moorhen tests
// ---------------------------------------------------------------------------

describe('Moorhen Octagon Debug', () => {

    it('step-by-step comparison', () => {
        const fail = stepWithCapture(MOORHEN_FAILS);
        const pass = stepWithCapture(MOORHEN_PASSES);

        console.log('\n=== Moorhen step-by-step results ===');
        console.log(`FAILS: ${fail.snapshots.length} steps completed, error: ${fail.error ?? 'none'}`);
        console.log(`PASSES: ${pass.snapshots.length} steps completed, error: ${pass.error ?? 'none'}`);

        const maxSteps = Math.max(fail.snapshots.length, pass.snapshots.length);
        let firstDivergence = -1;

        for (let i = 0; i < maxSteps; i++) {
            const f = fail.snapshots[i];
            const p = pass.snapshots[i];

            if (!f || !p) {
                console.log(`\nStep ${i}: ${!f ? 'FAILS missing' : 'PASSES missing'}`);
                if (firstDivergence === -1) firstDivergence = i;
                continue;
            }

            const acceptedMatch = JSON.stringify(f.acceptedEdges) === JSON.stringify(p.acceptedEdges);
            const inputCountMatch = f.inputCount === p.inputCount;
            const nodeCountMatch = f.nodeCount === p.nodeCount;

            console.log(
                `\nStep ${i}:` +
                ` childSteps: F=${f.inputCount} P=${p.inputCount}${inputCountMatch ? '' : ' *** DIVERGE ***'}` +
                ` nodes: F=${f.nodeCount} P=${p.nodeCount}${nodeCountMatch ? '' : ' *** DIVERGE ***'}` +
                ` accepted: ${acceptedMatch ? 'match' : '*** DIVERGE ***'}`
            );

            if (!acceptedMatch) {
                console.log(`  FAIL accepted: [${f.acceptedEdges.map((v, j) => v ? j : '').filter(Boolean).join(',')}]`);
                console.log(`  PASS accepted: [${p.acceptedEdges.map((v, j) => v ? j : '').filter(Boolean).join(',')}]`);
            }

            for (let c = 0; c < Math.max(f.inputs.length, p.inputs.length); c++) {
                const fe = f.inputs[c]?.edges ?? [];
                const pe = p.inputs[c]?.edges ?? [];
                console.log(`  child[${c}]: F=[${fe.join(',')}] P=[${pe.join(',')}]`);
            }

            if (firstDivergence === -1 && (!acceptedMatch || !inputCountMatch || !nodeCountMatch)) {
                firstDivergence = i;
            }
        }

        if (firstDivergence >= 0) {
            console.log(`\n>>> First divergence at step ${firstDivergence}`);
        } else {
            console.log('\n>>> No divergence detected in snapshots');
        }

        expect(pass.error).toBeNull();
    });

    it('step 0 collision events comparison', () => {
        for (const [label, verts] of [['MOORHEN_FAILS', MOORHEN_FAILS], ['MOORHEN_PASSES', MOORHEN_PASSES]] as const) {
            const context = initContext(verts);
            const edges = context.graph.interiorEdges.map(e => e.id);
            const exteriorParents = edges.map(id => context.getInteriorWithId(id).clockwiseExteriorEdgeIndex);

            console.log(`\n=== ${label}: Step 0 collision events (sorted by offset) ===`);
            const allEvents: { label: string; event: CollisionEvent }[] = [];

            for (let i = 0; i < edges.length; i++) {
                const e1 = edges[i];
                const checkExterior = !context.isPrimaryNonReflex(e1);
                for (let j = i + 1; j < edges.length; j++) {
                    const events = collideEdges(e1, edges[j], context);
                    for (const event of events) {
                        if (event.intersectionData[2] !== 'diverging') {
                            allEvents.push({label: `${e1} x ${edges[j]}`, event});
                        }
                    }
                }
                if (checkExterior) {
                    for (const ep of exteriorParents) {
                        const events = collideEdges(e1, ep, context);
                        for (const event of events) {
                            if (event.intersectionData[2] !== 'diverging') {
                                allEvents.push({label: `${e1} x ext${ep}`, event});
                            }
                        }
                    }
                }
            }

            allEvents.sort((a, b) => a.event.offsetDistance - b.event.offsetDistance);
            for (const {label: lbl, event: ev} of allEvents) {
                console.log(
                    `  ${lbl}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)}` +
                    ` pos=(${ev.position.x.toFixed(2)}, ${ev.position.y.toFixed(2)})` +
                    ` rayLen=${ev.intersectionData[0].toFixed(4)}`
                );
            }
        }
    });

    it('e12 collision list for both polygons', () => {
        for (const [label, verts] of [['MOORHEN_FAILS', MOORHEN_FAILS], ['MOORHEN_PASSES', MOORHEN_PASSES]] as const) {
            const context = initContext(verts);
            const edges = context.graph.interiorEdges.map(e => e.id);
            const exteriorParents = edges.map(id => context.getInteriorWithId(id).clockwiseExteriorEdgeIndex);

            const e12Interior = context.getInteriorWithId(12);
            console.log(`\n=== ${label}: e12 details ===`);
            console.log(`  parents: cw=${e12Interior.clockwiseExteriorEdgeIndex}, ws=${e12Interior.widdershinsExteriorEdgeIndex}`);
            console.log(`  isPrimaryNonReflex: ${context.isPrimaryNonReflex(12)}`);
            const e12Data = context.getEdgeWithId(12);
            console.log(`  source: node ${e12Data.source} at (${context.graph.nodes[e12Data.source].position.x.toFixed(2)}, ${context.graph.nodes[e12Data.source].position.y.toFixed(2)})`);
            console.log(`  basis: (${e12Data.basisVector.x.toFixed(4)}, ${e12Data.basisVector.y.toFixed(4)})`);

            console.log(`\n=== ${label}: e12 collision list ===`);
            const e12Events: { label: string; event: CollisionEvent }[] = [];

            // Interior collisions
            for (const e2 of edges) {
                if (e2 === 12) continue;
                const events = collideEdges(12, e2, context);
                for (const event of events) {
                    if (event.intersectionData[2] !== 'diverging') {
                        e12Events.push({label: `12 x ${e2}`, event});
                    }
                }
            }

            // Exterior collisions (e12 is reflex, so checkExterior = true)
            for (const ep of exteriorParents) {
                const events = collideEdges(12, ep, context);
                for (const event of events) {
                    if (event.intersectionData[2] !== 'diverging') {
                        e12Events.push({label: `12 x ext${ep}`, event});
                    }
                }
            }

            e12Events.sort((a, b) => a.event.offsetDistance - b.event.offsetDistance);
            for (const {label: lbl, event: ev} of e12Events) {
                console.log(
                    `  ${lbl}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)}` +
                    ` rayLen=${ev.intersectionData[0].toFixed(4)}` +
                    ` pos=(${ev.position.x.toFixed(2)}, ${ev.position.y.toFixed(2)})`
                );
            }
        }
    });

    it('e12/e13 collision handling detail (MOORHEN_FAILS)', () => {
        const context = initContext(MOORHEN_FAILS);

        // Log initial state of e12 and e13
        const e12i = context.getInteriorWithId(12);
        const e13i = context.getInteriorWithId(13);
        const e12d = context.getEdgeWithId(12);
        const e13d = context.getEdgeWithId(13);

        console.log('\n=== e12/e13 pre-collision state ===');
        console.log(`e12: parents(cw=${e12i.clockwiseExteriorEdgeIndex}, ws=${e12i.widdershinsExteriorEdgeIndex}) basis=(${e12d.basisVector.x.toFixed(4)}, ${e12d.basisVector.y.toFixed(4)}) source=node${e12d.source}`);
        console.log(`e13: parents(cw=${e13i.clockwiseExteriorEdgeIndex}, ws=${e13i.widdershinsExteriorEdgeIndex}) basis=(${e13d.basisVector.x.toFixed(4)}, ${e13d.basisVector.y.toFixed(4)}) source=node${e13d.source}`);

        // Get the collision event
        const collisions = collideEdges(12, 13, context);
        console.log(`\n=== e12 x e13 collision event ===`);
        if (collisions.length === 0) {
            console.log('  empty (no collision)');
            return;
        }
        const collision = collisions[0];
        console.log(`  type=${collision.eventType} offset=${collision.offsetDistance.toFixed(4)}`);
        console.log(`  pos=(${collision.position.x.toFixed(2)}, ${collision.position.y.toFixed(2)})`);
        console.log(`  intersect=[${collision.intersectionData[0].toFixed(4)}, ${collision.intersectionData[1].toFixed(4)}, ${collision.intersectionData[2]}]`);

        // Check shared parents
        const shared = checkSharedParents(12, 13, context);
        console.log(`  sharedParents=[${shared.join(', ')}]`);

        // Simulate handling
        console.log('\n=== handleCollisionEvent result ===');
        const acceptedBefore = [...context.acceptedEdges];
        const bisectionParams = handleCollisionEvent(collision, context);
        const acceptedAfter = [...context.acceptedEdges];

        console.log(`  bisectionParams count: ${bisectionParams.length}`);
        for (const bp of bisectionParams) {
            console.log(`    cw=${bp.clockwiseExteriorEdgeIndex} ws=${bp.widdershinsExteriorEdgeIndex} source=node${bp.source}` +
                (bp.approximateDirection ? ` approxDir=(${bp.approximateDirection.x.toFixed(4)}, ${bp.approximateDirection.y.toFixed(4)})` : ''));
        }

        const newlyAccepted = acceptedAfter.map((v, i) => v && !acceptedBefore[i] ? i : null).filter(v => v !== null);
        console.log(`  newly accepted edges: [${newlyAccepted.join(',')}]`);

        // Show the graph state after handling
        console.log('\n=== post-collision graph state ===');
        console.log(`  nodes: ${context.graph.nodes.length}, edges: ${context.graph.edges.length}`);
        const newNode = context.graph.nodes[context.graph.nodes.length - 1];
        console.log(`  new node: id=${newNode.id} pos=(${newNode.position.x.toFixed(2)}, ${newNode.position.y.toFixed(2)}) inEdges=[${newNode.inEdges}] outEdges=[${newNode.outEdges}]`);

        // e12 and e13 targets
        console.log(`  e12 target: ${context.getEdgeWithId(12).target}`);
        console.log(`  e13 target: ${context.getEdgeWithId(13).target}`);
    });
});
