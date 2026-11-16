import {initContext} from '@proc-geo/test-fixtures';
import {setSkeletonLogLevel} from '@proc-geo/core';
import {CRAZY_POLYGON} from '@proc-geo/test-fixtures';

setSkeletonLogLevel('debug');
import {stepAlgorithm} from '@proc-geo/core';
import {tryToAcceptExteriorEdge} from '@proc-geo/core';
import {collideEdges, collideInteriorEdges, checkSharedParents, makeOffsetDistance, sourceOffsetDistance} from '@proc-geo/core';
import {createCollisions, handleInteriorNGon} from '@proc-geo/core';
import {handleCollisionEvent, LayerLinks} from '@proc-geo/core';
import {addVectors, scaleVector, crossProduct, areEqual} from '@proc-geo/core';
import {intersectRays} from '@proc-geo/core';
import type {AlgorithmStepInput, ResolvableEvent} from '@proc-geo/core';

const fmt = (v: {x:number,y:number}) => `(${v.x.toFixed(4)}, ${v.y.toFixed(4)})`;

describe('Step 3 Detailed Trace', () => {

    function runToStep(stepCount: number) {
        const context = initContext(CRAZY_POLYGON);
        const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

        for (let step = 0; step < stepCount; step++) {
            inputs = stepAlgorithm(context, inputs).childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
        }
        return {context, inputs, exteriorEdges};
    }

    it('Step 0 detailed: what collision fires and what does it produce', () => {
        const context = initContext(CRAZY_POLYGON);
        const input: AlgorithmStepInput = {interiorEdges: context.graph.interiorEdges.map(e => e.id)};

        console.log('\n=== Step 0: input edges ===');
        console.log('Edges:', input.interiorEdges);

        // Get exterior parents
        const exteriorParents = input.interiorEdges
            .map(id => context.getInteriorWithId(id))
            .map(iEdge => iEdge.clockwiseExteriorEdgeIndex);
        exteriorParents.push(context.widdershinsParent(context.getInteriorWithId(input.interiorEdges[0])).id);
        console.log('Exterior parents:', exteriorParents);

        // `createCollisions` returns one flat list of resolvable events, instigator by instigator.
        const collisions = createCollisions(input.interiorEdges, exteriorParents, context);
        console.log('\nCollisions:');
        for (const ev of collisions) {
            console.log(`  [${ev.collidingEdges.join(',')}] type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)} pos=${fmt(ev.position)}`);
        }

        // Find the actual minimum-offset slice
        let bestOffset = Infinity;
        for (const ev of collisions) {
            if (ev.offsetDistance < bestOffset) {
                bestOffset = ev.offsetDistance;
            }
        }
        console.log('\nBest offset:', bestOffset.toFixed(4));

        // Which events fire?
        const firingEvents: ResolvableEvent[] = [];
        for (const ev of collisions) {
            // The layer window the solver's sites hold (1e-8, C8 dispatch 1's T37 STOP), stated.
            if (areEqual(ev.offsetDistance, bestOffset, 1e-8)) {
                firingEvents.push(ev);
            }
        }
        console.log('Firing events:');
        for (const ev of firingEvents) {
            console.log(`  [${ev.collidingEdges.join(',')}] type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)} pos=${fmt(ev.position)}`);
        }

        // Now simulate handleCollisionEvent for each, as one layer that is never settled
        console.log('\nHandling each event:');
        const layer = new LayerLinks(context);
        for (const ev of firingEvents) {
            const params = handleCollisionEvent(ev, context, layer);
            console.log(`  Event [${ev.collidingEdges.join(',')}] → ${params.length} bisection params`);
            for (const p of params) {
                console.log(`    cw=${p.clockwiseExteriorEdgeIndex} ws=${p.widdershinsExteriorEdgeIndex} source=node${p.source} approxDir=${p.approximateDirection ? fmt(p.approximateDirection) : 'none'}`);
            }
        }
    });

    it('Step 3 detailed: what collision fires and what does it produce', () => {
        const {context, inputs} = runToStep(3);
        const input = inputs[0];

        console.log('\n=== Step 3: input edges ===');
        for (const eid of input.interiorEdges) {
            const ie = context.getInteriorWithId(eid);
            const ed = context.getEdgeWithId(eid);
            const src = context.graph.nodes[ed.source];
            console.log(`  e${eid}: cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex} basis=${fmt(ed.basisVector)} source=node${ed.source} ${fmt(src.position)} reflex=${context.isReflexEdge(ie)} rank=${context.edgeRank(eid)}`);
        }

        console.log('\nAccepted exterior edges:');
        for (let i = 0; i < context.graph.numExteriorNodes; i++) {
            console.log(`  ext${i}: accepted=${context.acceptedEdges[i]}`);
        }

        const exteriorParents = input.interiorEdges
            .map(id => context.getInteriorWithId(id))
            .map(iEdge => iEdge.clockwiseExteriorEdgeIndex);
        exteriorParents.push(context.widdershinsParent(context.getInteriorWithId(input.interiorEdges[0])).id);
        console.log('\nExterior parents for createCollisions:', exteriorParents);
        console.log('Which of these are accepted?', exteriorParents.map(p => `ext${p}:${context.acceptedEdges[p]}`));

        const collisions = createCollisions(input.interiorEdges, exteriorParents, context);
        console.log('\nCollisions from createCollisions:', collisions.length, 'events');
        for (const ev of collisions) {
            console.log(`  [${ev.collidingEdges.join(',')}] type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)} pos=${fmt(ev.position)} intersect=[${ev.intersectionData[0].toFixed(4)},${ev.intersectionData[1].toFixed(4)},${ev.intersectionData[2]}]`);
        }

        // Also check: for each reflex edge, what exterior edges should be checked?
        console.log('\nReflex edge exterior collision check:');
        for (const eid of input.interiorEdges) {
            const ie = context.getInteriorWithId(eid);
            if (!context.isReflexEdge(ie)) continue;
            console.log(`  e${eid} (reflex, cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex}):`);
            for (let ext = 0; ext < context.graph.numExteriorNodes; ext++) {
                if (context.acceptedEdges[ext]) continue;
                const cs = collideEdges(eid, ext, context);
                console.log(`    vs ext${ext}: ${cs.length > 0 ? cs.map(c => `type=${c.eventType} offset=${c.offsetDistance.toFixed(4)}`).join('; ') : 'empty'}`);
            }
        }
    });

    it('Step 3 event resolution: WHY are 8 and 9 colliding correctly?', () => {
        const {context, inputs} = runToStep(3);
        const input = inputs[0]; // [8, 9, 10, 15, 18]

        // The collision that fires at step 3 should be 8 x 9 (lowest offset at 76.6779)
        const e8_ie = context.getInteriorWithId(8);
        const e9_ie = context.getInteriorWithId(9);
        const c89_events = collideInteriorEdges(e8_ie, e9_ie, context);
        console.log('\n=== 8 x 9 collision ===');
        console.log('Events:', c89_events.length > 0 ? c89_events.map(c => `type=${c.eventType} offset=${c.offsetDistance.toFixed(4)} pos=${fmt(c.position)}`).join('; ') : 'empty');

        if (c89_events.length > 0) {
            const c89 = c89_events[0];
            const parents = checkSharedParents(8, 9, context);
            console.log('Shared parents:', parents);
            console.log('  e8: cw=', e8_ie.clockwiseExteriorEdgeIndex, 'ws=', e8_ie.widdershinsExteriorEdgeIndex);
            console.log('  e9: cw=', e9_ie.clockwiseExteriorEdgeIndex, 'ws=', e9_ie.widdershinsExteriorEdgeIndex);

            // This is interiorPair: shared parents
            // Widdershins collider: parentSharing[0] ? instigator : other
            // Clockwise collider: parentSharing[1] ? instigator : other
            const widdershinsCollider = parents[0] ? e8_ie : e9_ie;
            const clockwiseCollider = parents[1] ? e8_ie : e9_ie;
            console.log('widdershinsCollider=e' + widdershinsCollider.id, 'clockwiseCollider=e' + clockwiseCollider.id);
            console.log('collapsedEdge = clockwiseCollider.widdershins =', clockwiseCollider.widdershinsExteriorEdgeIndex);
            console.log('Child edge: cw=', clockwiseCollider.clockwiseExteriorEdgeIndex, 'ws=', widdershinsCollider.widdershinsExteriorEdgeIndex);
        }
    });

    it('Trace each step: which event fires and what bisection params result', () => {
        const context = initContext(CRAZY_POLYGON);
        const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

        for (let step = 0; step < 5; step++) {
            console.log(`\n========== STEP ${step} ==========`);
            console.log('Input groups:', inputs.length);
            for (let g = 0; g < inputs.length; g++) {
                console.log(`  Group ${g}: [${inputs[g].interiorEdges.join(',')}]`);
                for (const eid of inputs[g].interiorEdges) {
                    const ie = context.getInteriorWithId(eid);
                    const ed = context.getEdgeWithId(eid);
                    const src = context.graph.nodes[ed.source];
                    console.log(`    e${eid}: cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex} basis=${fmt(ed.basisVector)} src=n${ed.source}${fmt(src.position)} reflex=${context.isReflexEdge(ie)}`);
                }
            }

            // Accepted before
            const accBefore = [];
            for (let i = 0; i < context.graph.numExteriorNodes; i++) if (context.acceptedEdges[i]) accBefore.push(i);
            console.log('Accepted ext before:', accBefore);

            try {
                inputs = stepAlgorithm(context, inputs).childSteps;
                exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
            } catch (e) {
                console.log('ERROR:', e instanceof Error ? e.message : e);
                break;
            }

            const accAfter = [];
            for (let i = 0; i < context.graph.numExteriorNodes; i++) if (context.acceptedEdges[i]) accAfter.push(i);
            console.log('Accepted ext after:', accAfter);
            console.log('Child edges:', inputs.map(i => i.interiorEdges));

            // Show newly accepted interior edges
            const newlyAccepted = [];
            for (let i = context.graph.numExteriorNodes; i < context.acceptedEdges.length; i++) {
                if (context.acceptedEdges[i]) newlyAccepted.push(i);
            }
            console.log('All accepted interior:', newlyAccepted);
        }
    });
});
