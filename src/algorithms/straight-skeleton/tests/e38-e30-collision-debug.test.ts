import {initContext, stepWithCapture, collectCollisionEvents} from '@/algorithms/straight-skeleton/test-cases/test-helpers';
import {setSkeletonLogLevel} from '@/algorithms/straight-skeleton/logger';
import {collideEdges} from '@/algorithms/straight-skeleton/collision-helpers';
import {INCORRECT_ORDERING_E38_E30_COLLISION} from '@/algorithms/straight-skeleton/test-cases/collision-e38-and-e30-gets-dropped-incorrectly';
import {stepAlgorithm} from '@/algorithms/straight-skeleton/algorithm-termination-cases';
import {tryToAcceptExteriorEdge} from '@/algorithms/straight-skeleton/algorithm-helpers';
import {crossProduct, areEqual, findPositionAlongRay, makeBisectedBasis, negateVector, dotProduct, projectToPerpendicular, normalize, subtractVectors} from '@/algorithms/straight-skeleton/core-functions';
import {generateSplitEventFromTheEdgeItself, generateSplitEvent} from '@/algorithms/straight-skeleton/generate-split-event';
import {createCollisions} from '@/algorithms/straight-skeleton/algorithm-complex-cases';
import {intersectRays} from '@/algorithms/straight-skeleton/intersection-edges';
import {makeOffsetDistance, sourceOffsetDistance, collisionDistanceFromBasisUnits} from '@/algorithms/straight-skeleton/collision-helpers';
import type {AlgorithmStepInput, CollisionEvent, Vector2, RayProjection} from '@/algorithms/straight-skeleton/types';

setSkeletonLogLevel('error');

const POLYGON = INCORRECT_ORDERING_E38_E30_COLLISION;
const INSTIGATOR_ID = 38;
const TARGET_ID = 30;

const fmt = (v: Vector2) => `(${v.x.toFixed(4)}, ${v.y.toFixed(4)})`;

describe('e38-e30 Collision Debug', () => {

    // -----------------------------------------------------------------------
    // Test 1: Initial collision ranking
    // -----------------------------------------------------------------------
    it('1. initial collision ranking — e38 vs e30 exists', () => {
        const context = initContext(POLYGON);

        console.log('\n=== Initial Collision Ranking ===');
        const allEvents = collectCollisionEvents(context);

        // Find e38 vs e30 events
        const targetEvents = allEvents.filter(({event}) =>
            event.collidingEdges.includes(INSTIGATOR_ID) && event.collidingEdges.includes(TARGET_ID)
        );

        console.log(`Total events: ${allEvents.length}`);
        console.log(`Events involving e${INSTIGATOR_ID} vs e${TARGET_ID}: ${targetEvents.length}`);

        for (const {label, event} of targetEvents) {
            console.log(`  ${label}: type=${event.eventType} offset=${event.offsetDistance.toFixed(6)} pos=${fmt(event.position)}`);
        }

        // Show the top 15 events by offset for context
        console.log('\nTop 15 events by offset:');
        for (let i = 0; i < Math.min(15, allEvents.length); i++) {
            const {label, event} = allEvents[i];
            const marker = (event.collidingEdges.includes(INSTIGATOR_ID) && event.collidingEdges.includes(TARGET_ID)) ? ' <<<' : '';
            console.log(`  #${i}: ${label}: type=${event.eventType} offset=${event.offsetDistance.toFixed(6)}${marker}`);
        }

        // Show where e38-vs-e30 sits in the ranking
        if (targetEvents.length > 0) {
            const bestGlobalOffset = allEvents[0].event.offsetDistance;
            const e38e30Offset = targetEvents[0].event.offsetDistance;
            const rank = allEvents.findIndex(({event}) =>
                event.collidingEdges.includes(INSTIGATOR_ID) && event.collidingEdges.includes(TARGET_ID)
            );
            console.log(`\ne38-vs-e30 rank: #${rank} of ${allEvents.length}`);
            console.log(`Best offset: ${bestGlobalOffset.toFixed(6)}, e38-vs-e30 offset: ${e38e30Offset.toFixed(6)}, ratio: ${(e38e30Offset / bestGlobalOffset).toFixed(2)}x`);
        }

        // Also show all events that e38 is involved in
        const e38Events = allEvents.filter(({event}) => event.collidingEdges[0] === INSTIGATOR_ID);
        console.log(`\nAll events with e${INSTIGATOR_ID} as instigator:`);
        for (const {label, event} of e38Events) {
            console.log(`  ${label}: type=${event.eventType} offset=${event.offsetDistance.toFixed(6)}`);
        }

        expect(targetEvents.length).toBeGreaterThan(0);
        expect(targetEvents[0].event.eventType).toBe('interiorAgainstExterior');
    });

    // -----------------------------------------------------------------------
    // Test 2: Reflex edge identification
    // -----------------------------------------------------------------------
    it('2. reflex edge identification — e38 is reflex and primary', () => {
        const context = initContext(POLYGON);
        const numExt = context.graph.numExteriorNodes;

        console.log('\n=== Reflex Edge Identification ===');
        console.log(`Polygon has ${numExt} vertices/edges`);

        // e38's interior data
        const e38_interior = context.getInteriorWithId(INSTIGATOR_ID);
        const e38_edge = context.getEdgeWithId(INSTIGATOR_ID);
        const isReflex = context.isReflexEdge(e38_interior);
        const rank = context.edgeRank(INSTIGATOR_ID);

        console.log(`\ne${INSTIGATOR_ID}:`);
        console.log(`  reflex: ${isReflex}`);
        console.log(`  rank: ${rank}`);
        console.log(`  clockwiseParent: ext${e38_interior.clockwiseExteriorEdgeIndex}`);
        console.log(`  widdershinsParent: ext${e38_interior.widdershinsExteriorEdgeIndex}`);
        console.log(`  basis: ${fmt(e38_edge.basisVector)}`);
        console.log(`  source: node${e38_edge.source} ${fmt(context.graph.nodes[e38_edge.source].position)}`);

        // Check "behind edge" cross product against e30
        const e30_edge = context.getEdgeWithId(TARGET_ID);
        const parentEdge = context.getEdgeWithInterior(e38_interior);
        const behindCross = crossProduct(parentEdge.basisVector, e30_edge.basisVector);
        console.log(`\nBehind-edge check (crossProduct of e${INSTIGATOR_ID}'s parent basis vs e${TARGET_ID} basis): ${behindCross.toFixed(6)}`);
        console.log(`  Would be rejected: ${behindCross > 0}`);

        // e30's info
        console.log(`\ne${TARGET_ID} (exterior):`);
        console.log(`  basis: ${fmt(e30_edge.basisVector)}`);
        console.log(`  source: node${e30_edge.source} ${fmt(context.graph.nodes[e30_edge.source].position)}`);
        console.log(`  target: node${e30_edge.target} ${fmt(context.graph.nodes[e30_edge.target!].position)}`);

        // Show all reflex vertices
        console.log('\nAll reflex vertices:');
        for (let v = 0; v < numExt; v++) {
            const ie = context.graph.interiorEdges[v];
            if (context.isReflexEdge(ie)) {
                console.log(`  v${v}: e${ie.id} parents(cw=${ie.clockwiseExteriorEdgeIndex}, ws=${ie.widdershinsExteriorEdgeIndex})`);
            }
        }

        expect(isReflex).toBe(true);
        expect(rank).toBe('primary');
    });

    // -----------------------------------------------------------------------
    // Test 3: Step-by-step trace tracking e38-vs-e30
    // -----------------------------------------------------------------------
    it('3. step-by-step trace — when does e38-vs-e30 get dropped', () => {
        const context = initContext(POLYGON);
        const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

        const e38_interior = context.getInteriorWithId(INSTIGATOR_ID);
        const numExt = context.graph.numExteriorNodes;
        let step = 0;
        let lastStepWithEvent = -1;
        let firstStepWithout = -1;

        console.log('\n=== Step-by-Step Trace ===');

        while (inputs.length > 0 && step < 20) {
            console.log(`\n--- Step ${step} (${inputs.length} input group(s)) ---`);

            // Accepted exterior edges before
            const accBefore: number[] = [];
            for (let i = 0; i < numExt; i++) if (context.acceptedEdges[i]) accBefore.push(i);
            console.log(`Accepted ext before: [${accBefore.join(',')}]`);

            // Log input groups
            for (let g = 0; g < inputs.length; g++) {
                console.log(`  Group ${g}: [${inputs[g].interiorEdges.join(',')}]`);
            }

            // Check if e38 and e30 are both still active
            const e38Active = !context.isAccepted(INSTIGATOR_ID);
            const e30Active = !context.isAccepted(TARGET_ID);
            console.log(`  e${INSTIGATOR_ID} active: ${e38Active}, e${TARGET_ID} active: ${e30Active}`);

            // Check if e38 is in any input group
            const e38InGroup = inputs.some(inp => inp.interiorEdges.includes(INSTIGATOR_ID));
            console.log(`  e${INSTIGATOR_ID} in input group: ${e38InGroup}`);

            if (e38Active && e30Active) {
                // Try to generate the collision directly
                const collisions = collideEdges(INSTIGATOR_ID, TARGET_ID, context);
                const splitEvents = collisions.filter(c => c.eventType === 'interiorAgainstExterior');

                if (splitEvents.length > 0) {
                    lastStepWithEvent = step;
                    console.log(`  e${INSTIGATOR_ID} vs e${TARGET_ID}: VALID split event(s):`);
                    for (const ev of splitEvents) {
                        console.log(`    type=${ev.eventType} offset=${ev.offsetDistance.toFixed(6)} pos=${fmt(ev.position)}`);
                    }
                } else {
                    if (firstStepWithout === -1) firstStepWithout = step;
                    console.log(`  e${INSTIGATOR_ID} vs e${TARGET_ID}: NO split event generated`);

                    // Diagnose why
                    console.log('  --- Diagnosis ---');
                    const ie = context.getInteriorWithId(INSTIGATOR_ID);
                    console.log(`  isReflex: ${context.isReflexEdge(ie)}`);
                    console.log(`  rank: ${context.edgeRank(INSTIGATOR_ID)}`);

                    // Span checks
                    const cwParent = context.clockwiseParent(ie);
                    const wsParent = context.widdershinsParent(ie);
                    const e30Edge = context.getEdgeWithId(TARGET_ID);

                    try {
                        const cwSpan = context.clockwiseSpanExcludingAccepted(cwParent, e30Edge);
                        const wsSpan = context.clockwiseSpanExcludingAccepted(e30Edge, wsParent);
                        console.log(`  spanExcludingAccepted(cwParent ext${cwParent.id} -> e${TARGET_ID}): ${cwSpan}`);
                        console.log(`  spanExcludingAccepted(e${TARGET_ID} -> wsParent ext${wsParent.id}): ${wsSpan}`);
                        console.log(`  min span: ${Math.min(cwSpan, wsSpan)} (need >= 2)`);
                    } catch (e) {
                        console.log(`  spanExcludingAccepted threw: ${e instanceof Error ? e.message : e}`);
                    }

                    try {
                        const cwSpanInc = context.clockwiseSpanIncludingAccepted(cwParent, e30Edge);
                        const wsSpanInc = context.clockwiseSpanIncludingAccepted(e30Edge, wsParent);
                        console.log(`  spanIncludingAccepted(cwParent ext${cwParent.id} -> e${TARGET_ID}): ${cwSpanInc}`);
                        console.log(`  spanIncludingAccepted(e${TARGET_ID} -> wsParent ext${wsParent.id}): ${wsSpanInc}`);
                    } catch (e) {
                        console.log(`  spanIncludingAccepted threw: ${e instanceof Error ? e.message : e}`);
                    }

                    // Behind-edge check
                    const parentEdge = context.getEdgeWithInterior(ie);
                    const behindCross = crossProduct(parentEdge.basisVector, e30Edge.basisVector);
                    console.log(`  behindEdge cross: ${behindCross.toFixed(6)} (rejected if > 0)`);
                }
            } else if (!e38Active) {
                console.log(`  e${INSTIGATOR_ID} has been ACCEPTED — tracking ends`);
            } else if (!e30Active) {
                console.log(`  e${TARGET_ID} has been ACCEPTED — tracking ends`);
            }

            // Also show what events fire at this step (via createCollisions on the first group that contains e38)
            const groupWithE38 = inputs.find(inp => inp.interiorEdges.includes(INSTIGATOR_ID));
            if (groupWithE38 && e38Active) {
                const extParents = context.exteriorParentsOfSubPolygon(groupWithE38.interiorEdges);
                const collisionLists = createCollisions(groupWithE38.interiorEdges, extParents, context);
                const flat = collisionLists.flat().sort((a, b) => a.offsetDistance - b.offsetDistance);
                if (flat.length > 0) {
                    const bestOffset = flat[0].offsetDistance;
                    console.log(`  Best offset in group: ${bestOffset.toFixed(6)}`);
                    // Show events that will fire
                    const firing = flat.filter(e => Math.abs(e.offsetDistance - bestOffset) < 1e-6);
                    console.log(`  Firing events (${firing.length}):`);
                    for (const ev of firing) {
                        const marker = (ev.collidingEdges.includes(INSTIGATOR_ID) && ev.collidingEdges.includes(TARGET_ID)) ? ' <<<' : '';
                        console.log(`    [${ev.collidingEdges.join(',')}] type=${ev.eventType} offset=${ev.offsetDistance.toFixed(6)}${marker}`);
                    }

                    // Show e38-related events that are NOT firing
                    const e38NotFiring = flat.filter(e =>
                        e.collidingEdges.includes(INSTIGATOR_ID) && Math.abs(e.offsetDistance - bestOffset) >= 1e-6
                    );
                    if (e38NotFiring.length > 0) {
                        console.log(`  e${INSTIGATOR_ID} events NOT firing (${e38NotFiring.length}):`);
                        for (const ev of e38NotFiring.slice(0, 5)) {
                            console.log(`    [${ev.collidingEdges.join(',')}] type=${ev.eventType} offset=${ev.offsetDistance.toFixed(6)}`);
                        }
                    }
                }
            }

            // Execute the step
            try {
                inputs = stepAlgorithm(context, inputs).childSteps;
                exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
            } catch (e) {
                console.log(`\n!!! ERROR at step ${step}: ${e instanceof Error ? e.message : e}`);
                break;
            }

            // Accepted exterior edges after
            const accAfter: number[] = [];
            for (let i = 0; i < numExt; i++) if (context.acceptedEdges[i]) accAfter.push(i);
            const newlyAccepted = accAfter.filter(x => !accBefore.includes(x));
            if (newlyAccepted.length > 0) {
                console.log(`  Newly accepted ext: [${newlyAccepted.join(',')}]`);
            }

            // Newly accepted interior edges
            const accInterior: number[] = [];
            for (let i = numExt; i < context.acceptedEdges.length; i++) {
                if (context.acceptedEdges[i]) accInterior.push(i);
            }
            console.log(`  Accepted int so far: [${accInterior.join(',')}]`);

            step++;
        }

        console.log(`\n=== Summary ===`);
        console.log(`Last step with valid e${INSTIGATOR_ID}-vs-e${TARGET_ID} event: ${lastStepWithEvent}`);
        console.log(`First step WITHOUT event: ${firstStepWithout}`);
    });

    // -----------------------------------------------------------------------
    // Test 4: Span analysis at each step where e38 is active
    // -----------------------------------------------------------------------
    it('4. span analysis — clockwise walk between e38 parents and e30', () => {
        const context = initContext(POLYGON);
        const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];
        const numExt = context.graph.numExteriorNodes;
        let step = 0;

        const ie = context.getInteriorWithId(INSTIGATOR_ID);
        const cwParentId = ie.clockwiseExteriorEdgeIndex;
        const wsParentId = ie.widdershinsExteriorEdgeIndex;

        console.log(`\n=== Span Analysis ===`);
        console.log(`e${INSTIGATOR_ID}: cwParent=ext${cwParentId}, wsParent=ext${wsParentId}, target=ext${TARGET_ID}`);
        console.log(`Walk 1: ext${cwParentId} -> ext${TARGET_ID} (clockwise)`);
        console.log(`Walk 2: ext${TARGET_ID} -> ext${wsParentId} (clockwise)`);

        while (inputs.length > 0 && step < 20) {
            if (context.isAccepted(INSTIGATOR_ID)) break;

            console.log(`\n--- Step ${step} ---`);

            // Walk clockwise from cwParent to e30
            let walk1 = '';
            let span1 = 0;
            let span1_exc = 0;
            for (let i = 0; i < numExt; i++) {
                const edgeIdx = (cwParentId + i) % numExt;
                if (edgeIdx === TARGET_ID) break;
                const acc = context.acceptedEdges[edgeIdx];
                walk1 += `ext${edgeIdx}${acc ? '(A)' : ''} -> `;
                span1++;
                if (!acc) span1_exc++;
            }
            walk1 += `ext${TARGET_ID}`;
            console.log(`  CW walk: ${walk1}`);
            console.log(`  Span including accepted: ${span1}, excluding accepted: ${span1_exc}`);

            // Walk clockwise from e30 to wsParent
            let walk2 = '';
            let span2 = 0;
            let span2_exc = 0;
            for (let i = 0; i < numExt; i++) {
                const edgeIdx = (TARGET_ID + i) % numExt;
                if (edgeIdx === wsParentId) break;
                const acc = context.acceptedEdges[edgeIdx];
                walk2 += `ext${edgeIdx}${acc ? '(A)' : ''} -> `;
                span2++;
                if (!acc) span2_exc++;
            }
            walk2 += `ext${wsParentId}`;
            console.log(`  WS walk: ${walk2}`);
            console.log(`  Span including accepted: ${span2}, excluding accepted: ${span2_exc}`);

            console.log(`  Min span (excluding accepted): ${Math.min(span1_exc, span2_exc)} — ${Math.min(span1_exc, span2_exc) < 2 ? 'WOULD REJECT' : 'ok'}`);

            try {
                inputs = stepAlgorithm(context, inputs).childSteps;
                exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
            } catch (e) {
                console.log(`\n!!! ERROR at step ${step}: ${e instanceof Error ? e.message : e}`);
                break;
            }
            step++;
        }
    });

    // -----------------------------------------------------------------------
    // Test 5: Direct split event generation trace
    // -----------------------------------------------------------------------
    it('5. direct split event generation — point-by-point rejection trace', () => {
        const context = initContext(POLYGON);
        const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];
        const numExt = context.graph.numExteriorNodes;
        let step = 0;

        console.log('\n=== Direct Split Event Generation Trace ===');

        // Run until e38 vs e30 stops producing a result, then diagnose
        while (inputs.length > 0 && step < 20) {
            if (context.isAccepted(INSTIGATOR_ID) || context.isAccepted(TARGET_ID)) {
                console.log(`Step ${step}: edge accepted, stopping trace`);
                break;
            }

            // Try the two generation paths
            const fromEdge = generateSplitEventFromTheEdgeItself(INSTIGATOR_ID, TARGET_ID, context);

            const ie = context.getInteriorWithId(INSTIGATOR_ID);
            const e30Edge = context.getEdgeWithId(TARGET_ID);
            const fromIncenter = generateSplitEvent(ie, e30Edge, context);

            console.log(`\nStep ${step}:`);
            console.log(`  generateSplitEventFromTheEdgeItself: ${fromEdge ? `offset=${fromEdge.offsetDistance.toFixed(6)} type=${fromEdge.eventType}` : 'null'}`);
            console.log(`  generateSplitEvent (incenter): ${fromIncenter ? `offset=${fromIncenter.offsetDistance.toFixed(6)} type=${fromIncenter.eventType}` : 'null'}`);

            if (!fromEdge && !fromIncenter) {
                console.log('\n  === DETAILED REJECTION ANALYSIS ===');

                // Check 1: Ray intersection
                const instigatorRay = context.projectRayInterior(ie);
                const edgeSplitRay = context.projectRay(e30Edge);
                const backwardsRay = context.projectRayReversed(e30Edge);
                const {intersectRays} = require('@/algorithms/straight-skeleton/intersection-edges');
                const fwdTest = intersectRays(instigatorRay, edgeSplitRay);
                const bwdTest = intersectRays(instigatorRay, backwardsRay);
                console.log(`  Ray test fwd: [${fwdTest[0].toFixed(4)}, ${fwdTest[1].toFixed(4)}, ${fwdTest[2]}]`);
                console.log(`  Ray test bwd: [${bwdTest[0].toFixed(4)}, ${bwdTest[1].toFixed(4)}, ${bwdTest[2]}]`);
                const converges = fwdTest[2] === 'converging' || bwdTest[2] === 'converging';
                console.log(`  Converges: ${converges} ${!converges ? '<<< REJECTION POINT: ray does not converge' : ''}`);

                // Check 2: Behind edge
                const parentEdge = context.getEdgeWithInterior(ie);
                const behindCross = crossProduct(parentEdge.basisVector, e30Edge.basisVector);
                console.log(`  Behind-edge cross: ${behindCross.toFixed(6)} ${behindCross > 0 ? '<<< REJECTION POINT: behind edge' : ''}`);

                // Check 3: Reflex + rank
                console.log(`  isReflex: ${context.isReflexEdge(ie)}`);
                console.log(`  rank: ${context.edgeRank(INSTIGATOR_ID)} ${context.edgeRank(INSTIGATOR_ID) === 'secondary' ? '<<< REJECTION POINT: secondary rank' : ''}`);

                // Check 4: Span (excluding accepted)
                const cwParent = context.clockwiseParent(ie);
                const wsParent = context.widdershinsParent(ie);
                try {
                    const cwSpanExc = context.clockwiseSpanExcludingAccepted(cwParent, e30Edge);
                    const wsSpanExc = context.clockwiseSpanExcludingAccepted(e30Edge, wsParent);
                    console.log(`  Span excl accepted (cw ${cwParent.id}->${TARGET_ID}): ${cwSpanExc}`);
                    console.log(`  Span excl accepted (${TARGET_ID}->ws ${wsParent.id}): ${wsSpanExc}`);
                    console.log(`  Min: ${Math.min(cwSpanExc, wsSpanExc)} ${Math.min(cwSpanExc, wsSpanExc) < 2 ? '<<< REJECTION POINT: span < 2 (generateSplitEvent path)' : ''}`);
                } catch (e) {
                    console.log(`  Span excl accepted threw: ${e instanceof Error ? e.message : e} <<< REJECTION POINT`);
                }

                // Check 5: Span (including accepted) — used by generateSplitEventFromTheEdgeItself
                try {
                    const cwSpanInc = context.clockwiseSpanIncludingAccepted(cwParent, e30Edge);
                    const wsSpanInc = context.clockwiseSpanIncludingAccepted(e30Edge, wsParent);
                    console.log(`  Span incl accepted (cw ${cwParent.id}->${TARGET_ID}): ${cwSpanInc}`);
                    console.log(`  Span incl accepted (${TARGET_ID}->ws ${wsParent.id}): ${wsSpanInc}`);
                    console.log(`  Min: ${Math.min(cwSpanInc, wsSpanInc)} ${Math.min(cwSpanInc, wsSpanInc) < 2 ? '<<< REJECTION POINT: span < 2 (fromTheEdgeItself path)' : ''}`);
                } catch (e) {
                    console.log(`  Span incl accepted threw: ${e instanceof Error ? e.message : e} <<< REJECTION POINT`);
                }

                // Check 6: Which exterior edges are accepted in the span?
                console.log('\n  Accepted edges between cwParent and e30:');
                for (let i = 1; i < numExt; i++) {
                    const edgeIdx = (cwParent.id + i) % numExt;
                    if (edgeIdx === TARGET_ID) break;
                    if (context.acceptedEdges[edgeIdx]) {
                        console.log(`    ext${edgeIdx}: ACCEPTED`);
                    }
                }
                console.log('  Accepted edges between e30 and wsParent:');
                for (let i = 1; i < numExt; i++) {
                    const edgeIdx = (TARGET_ID + i) % numExt;
                    if (edgeIdx === wsParent.id) break;
                    if (context.acceptedEdges[edgeIdx]) {
                        console.log(`    ext${edgeIdx}: ACCEPTED`);
                    }
                }

                // Check 7: Is e30 in the exterior parents of the sub-polygon containing e38?
                const groupWithE38 = inputs.find(inp => inp.interiorEdges.includes(INSTIGATOR_ID));
                if (groupWithE38) {
                    const extParents = context.exteriorParentsOfSubPolygon(groupWithE38.interiorEdges);
                    const e30InParents = extParents.includes(TARGET_ID);
                    console.log(`\n  e${TARGET_ID} in exteriorParentsOfSubPolygon: ${e30InParents} ${!e30InParents ? '<<< REJECTION POINT: e30 not in sub-polygon exterior parents' : ''}`);
                    console.log(`  Exterior parents: [${extParents.join(',')}]`);
                } else {
                    console.log(`\n  e${INSTIGATOR_ID} not found in any input group`);
                }

                // Stop after first rejection analysis
                break;
            }

            try {
                inputs = stepAlgorithm(context, inputs).childSteps;
                exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
            } catch (e) {
                console.log(`\n!!! ERROR at step ${step}: ${e instanceof Error ? e.message : e}`);
                break;
            }
            step++;
        }
    });

    // -----------------------------------------------------------------------
    // Test 7: Deep probe into generateSplitEventFromTheEdgeItself internals
    // -----------------------------------------------------------------------
    it('7. deep probe — replicate generateSplitEventFromTheEdgeItself logic at critical step', () => {
        const context = initContext(POLYGON);
        const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

        // Run to step 10 (first step where event is null, from Test 3 output)
        for (let step = 0; step < 10; step++) {
            inputs = stepAlgorithm(context, inputs).childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
        }

        console.log('\n=== Deep Probe at Step 10 (first step where e38 vs e30 returns null) ===');

        const ie = context.getInteriorWithId(INSTIGATOR_ID);
        const e30Edge = context.getEdgeWithId(TARGET_ID);

        // --- Replicate generateSplitEventFromTheEdgeItself logic ---
        const edgeSplitRay = context.projectRay(e30Edge);
        const backwardsEdgeSplitRay = context.projectRayReversed(e30Edge);
        const instigatorRay = context.projectRayInterior(ie);

        const fwdTest = intersectRays(instigatorRay, edgeSplitRay);
        const bwdTest = intersectRays(instigatorRay, backwardsEdgeSplitRay);
        console.log(`Ray vs edge fwd: [${fwdTest[0].toFixed(4)}, ${fwdTest[1].toFixed(4)}, ${fwdTest[2]}]`);
        console.log(`Ray vs edge bwd: [${bwdTest[0].toFixed(4)}, ${bwdTest[1].toFixed(4)}, ${bwdTest[2]}]`);

        if (fwdTest[2] !== 'converging' && bwdTest[2] !== 'converging') {
            console.log('<<< REJECTION at ray convergence test (line 212)');
            return;
        }

        // Behind-edge check
        const parentEdge = context.getEdgeWithInterior(ie);
        const behindCross = crossProduct(parentEdge.basisVector, e30Edge.basisVector);
        console.log(`Behind-edge cross: ${behindCross.toFixed(6)} (rejected if > 0)`);

        // --- Path 1: Direct-strike offset ---
        console.log('\n--- Path 1: findOffsetByDirectStrike ---');
        const cwParent = context.clockwiseParent(ie);
        const crossCwParent = crossProduct(instigatorRay.basisVector, cwParent.basisVector);
        const negInstigatorCrossTarget = crossProduct(negateVector(instigatorRay.basisVector), e30Edge.basisVector);
        const crossSumDivisor = crossCwParent + negInstigatorCrossTarget;

        console.log(`crossCwParent: ${crossCwParent.toFixed(6)}`);
        console.log(`negInstigatorCrossTarget: ${negInstigatorCrossTarget.toFixed(6)}`);
        console.log(`crossSumDivisor: ${crossSumDivisor.toFixed(6)}`);
        console.log(`areEqual(divisor, 0): ${areEqual(crossSumDivisor, 0)}`);

        if (!areEqual(crossSumDivisor, 0)) {
            const distAlongInstigator = fwdTest[0] * negInstigatorCrossTarget / crossSumDivisor;
            const directOffset = distAlongInstigator * crossCwParent;
            const directPosition = findPositionAlongRay(instigatorRay, distAlongInstigator);
            console.log(`distAlongInstigator: ${distAlongInstigator.toFixed(6)}`);
            console.log(`directOffset: ${directOffset.toFixed(6)}`);
            console.log(`directPosition: ${fmt(directPosition)}`);

            if (directOffset >= 0) {
                // validateSplitReachesEdge
                const validates = context.validateSplitReachesEdge(INSTIGATOR_ID, TARGET_ID, directOffset);
                console.log(`validateSplitReachesEdge(offset=${directOffset.toFixed(6)}): ${validates}`);
                if (!validates) {
                    console.log('<<< REJECTION at validateSplitReachesEdge for direct-strike (line 226-227)');

                    // Deep probe activeExteriorEdgeSegments
                    console.log('\n--- activeExteriorEdgeSegments probe ---');
                    const allInterior = context.graph.interiorEdges.filter(ie2 =>
                        !context.isAccepted(ie2.id) && (ie2.widdershinsExteriorEdgeIndex === TARGET_ID || ie2.clockwiseExteriorEdgeIndex === TARGET_ID)
                    );
                    console.log(`Active interior edges bordering e${TARGET_ID}: ${allInterior.length}`);
                    for (const ae of allInterior) {
                        console.log(`  e${ae.id}: cw=${ae.clockwiseExteriorEdgeIndex} ws=${ae.widdershinsExteriorEdgeIndex} accepted=${context.isAccepted(ae.id)}`);
                    }
                    if (allInterior.length < 2) {
                        console.log('<<< activeExteriorEdgeSegments returns empty (fewer than 2 children)');
                    }
                }
            } else {
                console.log(`Direct offset is negative (${directOffset.toFixed(6)}), falling through`);
            }
        } else {
            console.log('divisor is zero, direct-strike returns null');
        }

        // --- Path 2: Incenter fallback ---
        console.log('\n--- Path 2: findOffsetViaIncenter fallback ---');
        const edgeRank = context.edgeRank(INSTIGATOR_ID);
        console.log(`edgeRank: ${edgeRank}`);
        if (edgeRank === 'secondary') {
            console.log('<<< REJECTION: secondary rank (line 250)');
            return;
        }

        const wsParent = context.widdershinsParent(ie);
        const cwSpanInc = context.clockwiseSpanIncludingAccepted(cwParent, e30Edge);
        const wsSpanInc = context.clockwiseSpanIncludingAccepted(e30Edge, wsParent);
        console.log(`spanIncludingAccepted(cw ${cwParent.id}->${TARGET_ID}): ${cwSpanInc}`);
        console.log(`spanIncludingAccepted(${TARGET_ID}->ws ${wsParent.id}): ${wsSpanInc}`);
        console.log(`min: ${Math.min(cwSpanInc, wsSpanInc)}`);

        if (Math.min(cwSpanInc, wsSpanInc) < 2) {
            console.log('<<< REJECTION: span < 2 in incenter fallback (line 257)');
            return;
        }

        // Replicate findOffsetViaIncenter
        console.log('\n--- Replicating findOffsetViaIncenter ---');
        const {clockwise: incCwParent, widdershins: incWsParent} = context.parentEdges(ie.id);
        const cwDot = dotProduct(incCwParent.basisVector, e30Edge.basisVector);
        const wsDot = dotProduct(incWsParent.basisVector, e30Edge.basisVector);
        const usingCwParentForIncenter = Math.abs(cwDot) < Math.abs(wsDot);
        console.log(`cwDot: ${cwDot.toFixed(6)}, wsDot: ${wsDot.toFixed(6)}`);
        console.log(`Using ${usingCwParentForIncenter ? 'CW' : 'WS'} parent for incenter`);

        let bisectorParentRay: RayProjection;
        if (usingCwParentForIncenter) {
            bisectorParentRay = context.projectRayReversed(incCwParent);
        } else {
            bisectorParentRay = context.projectRay(incWsParent);
        }

        const edgeToSplitRayCw = context.projectRay(e30Edge);
        const edgeToSplitRayWs: RayProjection = {
            sourceVector: context.graph.nodes[e30Edge.target!].position,
            basisVector: negateVector(e30Edge.basisVector)
        };

        const collisionCw = intersectRays(bisectorParentRay, edgeToSplitRayCw);
        const collisionWs = intersectRays(bisectorParentRay, edgeToSplitRayWs);
        console.log(`parentRay vs edgeCw: [${collisionCw[0].toFixed(4)}, ${collisionCw[1].toFixed(4)}, ${collisionCw[2]}]`);
        console.log(`parentRay vs edgeWs: [${collisionWs[0].toFixed(4)}, ${collisionWs[1].toFixed(4)}, ${collisionWs[2]}]`);

        const cwConverges = collisionCw[2] === 'converging';
        const wsConverges = collisionWs[2] === 'converging';

        if (!cwConverges && !wsConverges) {
            console.log('<<< REJECTION: neither incenter ray converges (line 76)');
            return;
        }

        // Determine best result
        let bestIntersection = collisionCw;
        let usingCwIntersection = true;
        if (cwConverges && !wsConverges) {
            bestIntersection = collisionCw;
        } else if (!cwConverges && wsConverges) {
            bestIntersection = collisionWs;
            usingCwIntersection = false;
        } else {
            const cwDiff = Math.abs(collisionCw[0] - collisionCw[1]);
            const wsDiff = Math.abs(collisionWs[0] - collisionWs[1]);
            usingCwIntersection = cwDiff < wsDiff;
            bestIntersection = usingCwIntersection ? collisionCw : collisionWs;
        }

        const tempNodePos = findPositionAlongRay(bisectorParentRay, bestIntersection[0]);
        console.log(`Temp node position: ${fmt(tempNodePos)}`);

        const incenterRay1 = context.projectRayInterior(ie);
        const rayUsed = usingCwIntersection ? edgeToSplitRayCw : edgeToSplitRayWs;
        const tempBasisPart2 = dotProduct(rayUsed.basisVector, incenterRay1.basisVector) < 0
            ? negateVector(rayUsed.basisVector)
            : rayUsed.basisVector;
        const tempBasis = makeBisectedBasis(negateVector(bisectorParentRay.basisVector), tempBasisPart2);
        const incenterRay2: RayProjection = {sourceVector: tempNodePos, basisVector: tempBasis};
        const incenterIntersection = intersectRays(incenterRay1, incenterRay2);
        console.log(`incenterRay1 vs incenterRay2: [${incenterIntersection[0].toFixed(4)}, ${incenterIntersection[1].toFixed(4)}, ${incenterIntersection[2]}]`);

        const incenterOffset = makeOffsetDistance(ie, context, incenterRay1, incenterIntersection[0]);
        console.log(`Incenter offset: ${incenterOffset.toFixed(6)}`);

        if (incenterOffset < 0) {
            console.log('<<< REJECTION: negative offset from incenter (line 101)');
            return;
        }

        // validateSplitReachesEdge for incenter
        const incenterValidates = context.validateSplitReachesEdge(INSTIGATOR_ID, TARGET_ID, incenterOffset);
        console.log(`validateSplitReachesEdge(offset=${incenterOffset.toFixed(6)}): ${incenterValidates}`);
        if (!incenterValidates) {
            console.log('<<< REJECTION at validateSplitReachesEdge for incenter fallback (line 266)');
        }
    });

    // -----------------------------------------------------------------------
    // Test 8: Deep probe into validateSplitReachesEdge
    // -----------------------------------------------------------------------
    it('8. deep probe — replicate validateSplitReachesEdge at critical step', () => {
        const context = initContext(POLYGON);
        const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

        // Run to step 10
        for (let step = 0; step < 10; step++) {
            inputs = stepAlgorithm(context, inputs).childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
        }

        const offset = 68.565126;
        const ie = context.getInteriorWithId(INSTIGATOR_ID);
        const e30Edge = context.getEdgeWithId(TARGET_ID);
        const edgeBasis = e30Edge.basisVector;
        const bisectorRay = context.projectRayInterior(ie);

        console.log('\n=== validateSplitReachesEdge Deep Probe at Step 10 ===');
        console.log(`Offset: ${offset.toFixed(6)}`);
        console.log(`Bisector ray: src=${fmt(bisectorRay.sourceVector)} basis=${fmt(bisectorRay.basisVector)}`);
        console.log(`Edge basis: ${fmt(edgeBasis)}`);

        // Find active segments
        const allBordering = context.graph.interiorEdges.filter(ie2 =>
            !context.isAccepted(ie2.id) && (ie2.widdershinsExteriorEdgeIndex === TARGET_ID || ie2.clockwiseExteriorEdgeIndex === TARGET_ID)
        );
        console.log(`\nActive interior edges bordering e${TARGET_ID}: ${allBordering.length}`);
        for (const ae of allBordering) {
            const ed = context.getEdgeWithId(ae.id);
            const src = context.graph.nodes[ed.source];
            console.log(`  e${ae.id}: cw=${ae.clockwiseExteriorEdgeIndex} ws=${ae.widdershinsExteriorEdgeIndex} rank=${context.edgeRank(ae.id)} src=n${ed.source}${fmt(src.position)} basis=${fmt(ed.basisVector)}`);
        }

        // Pair them up as segments (same as activeExteriorEdgeSegments)
        if (allBordering.length < 2) {
            console.log('<<< Fewer than 2 children — validateSplitReachesEdge returns false');
            return;
        }

        // For each pair, replicate the validation
        for (let i = 0; i < allBordering.length; i += 2) {
            const wsBisector = allBordering[i];
            const cwBisector = allBordering[i + 1];
            if (!cwBisector) break;

            console.log(`\n--- Segment ${i/2}: ws=e${wsBisector.id}, cw=e${cwBisector.id} ---`);

            const wsEdge = context.getEdgeWithId(wsBisector.id);
            const cwEdge = context.getEdgeWithId(cwBisector.id);

            const wsSourceOffset = sourceOffsetDistance(wsBisector, context);
            const cwSourceOffset = sourceOffsetDistance(cwBisector, context);
            console.log(`  wsSourceOffset(e${wsBisector.id}): ${wsSourceOffset.toFixed(6)}`);
            console.log(`  cwSourceOffset(e${cwBisector.id}): ${cwSourceOffset.toFixed(6)}`);

            const cwOffsetForProjection = offset - cwSourceOffset;
            const wsOffsetForProjection = offset - wsSourceOffset;
            console.log(`  cwOffsetForProjection: ${cwOffsetForProjection.toFixed(6)}`);
            console.log(`  wsOffsetForProjection: ${wsOffsetForProjection.toFixed(6)}`);

            // Compute the vertex positions at offset
            const {addVectors, scaleVector, projectFromPerpendicular} = require('@/algorithms/straight-skeleton/core-functions');
            const cwSrcPos = context.graph.nodes[cwEdge.source].position;
            const wsSrcPos = context.graph.nodes[wsEdge.source].position;

            const cwT = projectFromPerpendicular(cwEdge.basisVector, edgeBasis, cwOffsetForProjection);
            const wsT = projectFromPerpendicular(wsEdge.basisVector, edgeBasis, wsOffsetForProjection);
            const cwVertexAtOffset = addVectors(cwSrcPos, scaleVector(cwEdge.basisVector, cwT));
            const wsVertexAtOffset = addVectors(wsSrcPos, scaleVector(wsEdge.basisVector, wsT));
            console.log(`  cwVertex at offset: ${fmt(cwVertexAtOffset)} (t=${cwT.toFixed(4)})`);
            console.log(`  wsVertex at offset: ${fmt(wsVertexAtOffset)} (t=${wsT.toFixed(4)})`);

            // Create the test rays
            const cwRay = {sourceVector: cwVertexAtOffset, basisVector: negateVector(edgeBasis)};
            const wsRay = {sourceVector: wsVertexAtOffset, basisVector: edgeBasis};

            console.log(`  cwRay: src=${fmt(cwRay.sourceVector)} basis=${fmt(cwRay.basisVector)}`);
            console.log(`  wsRay: src=${fmt(wsRay.sourceVector)} basis=${fmt(wsRay.basisVector)}`);

            // Intersect bisector with each
            const cwResult = intersectRays(bisectorRay, cwRay);
            const wsResult = intersectRays(bisectorRay, wsRay);
            console.log(`  bisector vs cwRay: [${cwResult[0].toFixed(4)}, ${cwResult[1].toFixed(4)}, ${cwResult[2]}]`);
            console.log(`  bisector vs wsRay: [${wsResult[0].toFixed(4)}, ${wsResult[1].toFixed(4)}, ${wsResult[2]}]`);

            const passes = cwResult[2] === 'converging' && wsResult[2] === 'converging';
            console.log(`  Segment passes: ${passes} ${!passes ? '<<< FAILS' : ''}`);

            if (!passes) {
                console.log(`  cwResult type: ${cwResult[2]} ${cwResult[2] !== 'converging' ? '<<< THIS ONE FAILS' : ''}`);
                console.log(`  wsResult type: ${wsResult[2]} ${wsResult[2] !== 'converging' ? '<<< THIS ONE FAILS' : ''}`);
            }
        }

        // Also check: does it pass at step 9?
        console.log('\n\n=== Comparison: validateSplitReachesEdge at Step 9 ===');
        const context2 = initContext(POLYGON);
        const exteriorEdges2 = context2.graph.edges.slice(0, context2.graph.numExteriorNodes);
        let inputs2: AlgorithmStepInput[] = [{interiorEdges: context2.graph.interiorEdges.map(e => e.id)}];
        for (let step = 0; step < 9; step++) {
            inputs2 = stepAlgorithm(context2, inputs2).childSteps;
            exteriorEdges2.forEach(e => tryToAcceptExteriorEdge(context2, e.id));
        }

        const validates9 = context2.validateSplitReachesEdge(INSTIGATOR_ID, TARGET_ID, offset);
        console.log(`Step 9 validateSplitReachesEdge: ${validates9}`);

        // Show bordering edges at step 9
        const bordering9 = context2.graph.interiorEdges.filter(ie2 =>
            !context2.isAccepted(ie2.id) && (ie2.widdershinsExteriorEdgeIndex === TARGET_ID || ie2.clockwiseExteriorEdgeIndex === TARGET_ID)
        );
        console.log(`Active interior edges bordering e${TARGET_ID} at step 9: ${bordering9.length}`);
        for (const ae of bordering9) {
            const ed = context2.getEdgeWithId(ae.id);
            const src = context2.graph.nodes[ed.source];
            console.log(`  e${ae.id}: cw=${ae.clockwiseExteriorEdgeIndex} ws=${ae.widdershinsExteriorEdgeIndex} rank=${context2.edgeRank(ae.id)} src=n${ed.source}${fmt(src.position)}`);
        }

        // Show accepted edges diff between step 9 and 10
        const acc9: number[] = [];
        const acc10: number[] = [];
        for (let i = 0; i < context.graph.numExteriorNodes; i++) {
            if (context2.acceptedEdges[i]) acc9.push(i);
            if (context.acceptedEdges[i]) acc10.push(i);
        }
        const newlyAcceptedInStep10 = acc10.filter(x => !acc9.includes(x));
        console.log(`\nAccepted ext at step 9: [${acc9.join(',')}]`);
        console.log(`Accepted ext at step 10: [${acc10.join(',')}]`);
        console.log(`Newly accepted at step 10: [${newlyAcceptedInStep10.join(',')}]`);

        // Accepted interior diff
        const accInt9: number[] = [];
        const accInt10: number[] = [];
        for (let i = context.graph.numExteriorNodes; i < context.acceptedEdges.length; i++) {
            if (context2.acceptedEdges[i]) accInt9.push(i);
        }
        for (let i = context.graph.numExteriorNodes; i < context.acceptedEdges.length; i++) {
            if (context.acceptedEdges[i]) accInt10.push(i);
        }
        const newlyAcceptedInt = accInt10.filter(x => !accInt9.includes(x));
        console.log(`Newly accepted int at step 10: [${newlyAcceptedInt.join(',')}]`);
    });

    // -----------------------------------------------------------------------
    // Test 6: Post-failure state analysis
    // -----------------------------------------------------------------------
    it('6. post-failure state analysis', () => {
        const result = stepWithCapture(POLYGON);

        console.log('\n=== Post-Algorithm State ===');
        console.log(`Steps completed: ${result.snapshots.length}`);
        console.log(`Error: ${result.error ?? 'none'}`);

        const context = result.context;
        const numExt = context.graph.numExteriorNodes;

        const unaccepted: number[] = [];
        for (let i = 0; i < numExt; i++) {
            if (!context.acceptedEdges[i]) unaccepted.push(i);
        }
        console.log(`Unaccepted exterior edges: [${unaccepted.join(',')}]`);

        // Show active interior edges
        const active = context.graph.interiorEdges.filter(ie => !context.isAcceptedInterior(ie));
        console.log(`\nActive interior edges (${active.length}):`);
        for (const ie of active) {
            const ed = context.getEdgeWithId(ie.id);
            const src = context.graph.nodes[ed.source];
            console.log(`  e${ie.id}: parents(cw=${ie.clockwiseExteriorEdgeIndex}, ws=${ie.widdershinsExteriorEdgeIndex}) reflex=${context.isReflexEdge(ie)} rank=${context.edgeRank(ie.id)} src=n${ed.source}${fmt(src.position)}`);
        }

        if (result.error) {
            console.log(`\nLast input groups (${result.lastInputs.length}):`);
            for (let g = 0; g < result.lastInputs.length; g++) {
                console.log(`  group[${g}]: [${result.lastInputs[g].interiorEdges.join(',')}]`);
            }
        }
    });
});
