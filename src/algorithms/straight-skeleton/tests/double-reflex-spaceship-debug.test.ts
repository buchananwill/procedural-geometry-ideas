import {initContext, stepWithCapture, collectCollisionEvents} from '../test-cases/test-helpers';
import {setSkeletonLogLevel} from '../logger';
import {collideEdges} from '../collision-helpers';

setSkeletonLogLevel('debug');
import {
    PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP,
    SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP,
} from '../test-cases/double-reflex-spaceship';
import {StepAlgorithm} from '../algorithm-termination-cases';
import {tryToAcceptExteriorEdge} from '../algorithm-helpers';
import {crossProduct, subtractVectors, normalize, dotProduct} from '../core-functions';
import type {AlgorithmStepInput} from '../types';

const CASES = [
    {name: 'FAILURE', verts: PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP},
    {name: 'SUCCESS', verts: SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP},
] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Double Reflex Spaceship Debug', () => {

    it('both polygons initialize without error', () => {
        expect(() => initContext(PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP)).not.toThrow();
        expect(() => initContext(SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP)).not.toThrow();
    });

    it('initial interior edges match structurally', () => {
        const ctxFail = initContext(PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP);
        const ctxPass = initContext(SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP);

        expect(ctxFail.graph.interiorEdges.length).toBe(ctxPass.graph.interiorEdges.length);

        console.log('\n=== Initial Interior Edges ===');
        for (let i = 0; i < ctxFail.graph.interiorEdges.length; i++) {
            const f = ctxFail.graph.interiorEdges[i];
            const p = ctxPass.graph.interiorEdges[i];
            const fEdge = ctxFail.graph.edges[f.id];
            const pEdge = ctxPass.graph.edges[p.id];
            const basisMatch =
                fEdge.basisVector.x.toFixed(4) === pEdge.basisVector.x.toFixed(4) &&
                fEdge.basisVector.y.toFixed(4) === pEdge.basisVector.y.toFixed(4);
            console.log(
                `[${i}] id=${f.id} parents(cw=${f.clockwiseExteriorEdgeIndex}, ws=${f.widdershinsExteriorEdgeIndex})` +
                ` basis FAIL=(${fEdge.basisVector.x.toFixed(4)}, ${fEdge.basisVector.y.toFixed(4)})` +
                ` PASS=(${pEdge.basisVector.x.toFixed(4)}, ${pEdge.basisVector.y.toFixed(4)})` +
                (basisMatch ? '' : ' *** DIFFERS ***')
            );
        }
    });

    it('step-by-step comparison identifies divergence', () => {
        const fail = stepWithCapture(PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP);
        const pass = stepWithCapture(SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP);

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

        // We expect SUCCESS to succeed
        expect(pass.error).toBeNull();
    });

    it('step 0 collision events comparison (FAILS vs PASSES)', () => {
        for (const {name, verts} of CASES) {
            const context = initContext(verts);

            console.log(`\n=== ${name}: Step 0 collision events (sorted by offset) ===`);
            const allEvents = collectCollisionEvents(context);

            for (const {label, event} of allEvents) {
                console.log(
                    `  ${label}: type=${event.eventType} offset=${event.offsetDistance.toFixed(4)}` +
                    ` pos=(${event.position.x.toFixed(2)}, ${event.position.y.toFixed(2)})` +
                    ` rayLen=${event.intersectionData[0].toFixed(4)}`
                );
            }

            console.log(`  Total events: ${allEvents.length}`);
        }
    });

    it('collision events at each step for FAILURE polygon', () => {
        const context = initContext(PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP);
        const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);

        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];
        let step = 0;

        console.log('\n=== FAILURE polygon: collision events per step ===');

        while (inputs.length > 0) {
            console.log(`\n--- Step ${step} (${inputs.length} input groups) ---`);
            for (let g = 0; g < inputs.length; g++) {
                const group = inputs[g];
                console.log(`  Group ${g}: edges [${group.interiorEdges.join(',')}]`);

                for (let i = 0; i < group.interiorEdges.length; i++) {
                    // Interior-interior collisions
                    for (let j = i + 1; j < group.interiorEdges.length; j++) {
                        const e1 = group.interiorEdges[i];
                        const e2 = group.interiorEdges[j];
                        const collision = collideEdges(e1, e2, context);
                        if (collision) {
                            console.log(
                                `    ${e1} x ${e2}: type=${collision.eventType}` +
                                ` offset=${collision.offsetDistance.toFixed(4)}` +
                                ` pos=(${collision.position.x.toFixed(2)}, ${collision.position.y.toFixed(2)})` +
                                ` intersect=[${collision.intersectionData[0].toFixed(4)}, ${collision.intersectionData[1].toFixed(4)}, ${collision.intersectionData[2]}]`
                            );
                        }
                    }

                    // Interior-exterior collisions for reflex edges
                    const e1 = group.interiorEdges[i];
                    if (!context.isPrimaryNonReflex(e1)) {
                        for (let ext = 0; ext < context.graph.numExteriorNodes; ext++) {
                            if (context.acceptedEdges[ext]) continue;
                            const collision = collideEdges(e1, ext, context);
                            if (collision) {
                                console.log(
                                    `    ${e1} x ext${ext}: type=${collision.eventType}` +
                                    ` offset=${collision.offsetDistance.toFixed(4)}` +
                                    ` pos=(${collision.position.x.toFixed(2)}, ${collision.position.y.toFixed(2)})` +
                                    ` intersect=[${collision.intersectionData[0].toFixed(4)}, ${collision.intersectionData[1].toFixed(4)}, ${collision.intersectionData[2]}]`
                                );
                            }
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

    it('vertex 4 analysis: angle, bisector, and first collision', () => {
        for (const {name, verts} of CASES) {
            const context = initContext(verts);
            const numExt = context.graph.numExteriorNodes;

            // Identify reflex vertices
            console.log(`\n=== ${name}: Reflex vertex identification ===`);
            for (let v = 0; v < numExt; v++) {
                const interiorEdge = context.graph.interiorEdges[v];
                const isReflex = context.isReflexEdge(interiorEdge);
                const edgeData = context.getEdgeWithId(interiorEdge.id);
                console.log(
                    `  v${v}: reflex=${isReflex}` +
                    ` bisector e${interiorEdge.id} basis=(${edgeData.basisVector.x.toFixed(4)}, ${edgeData.basisVector.y.toFixed(4)})` +
                    ` parents(cw=${interiorEdge.clockwiseExteriorEdgeIndex}, ws=${interiorEdge.widdershinsExteriorEdgeIndex})`
                );
            }

            // Deep dive into vertex 4
            const v4Edge = context.graph.interiorEdges[4];
            const v4Data = context.getEdgeWithId(v4Edge.id);
            const v4Pos = context.graph.nodes[4].position;

            console.log(`\n=== ${name}: Vertex 4 deep dive ===`);
            console.log(`  position: (${v4Pos.x.toFixed(4)}, ${v4Pos.y.toFixed(4)})`);
            console.log(`  interior edge id: ${v4Edge.id}, parents cw=${v4Edge.clockwiseExteriorEdgeIndex} ws=${v4Edge.widdershinsExteriorEdgeIndex}`);
            console.log(`  bisector basis: (${v4Data.basisVector.x.toFixed(6)}, ${v4Data.basisVector.y.toFixed(6)})`);
            console.log(`  isPrimaryNonReflex: ${context.isPrimaryNonReflex(v4Edge.id)}`);
            console.log(`  isReflexEdge: ${context.isReflexEdge(v4Edge)}`);

            // Compute interior angle at vertex 4
            const v3 = verts[3];
            const v4 = verts[4];
            const v5 = verts[5];
            const inVec = subtractVectors(v4, v3);
            const outVec = subtractVectors(v5, v4);
            const [inNorm] = normalize(inVec);
            const [outNorm] = normalize(outVec);
            const cross = crossProduct(inNorm, outNorm);
            const dot = dotProduct(inNorm, outNorm);
            const angleDeg = Math.atan2(cross, dot) * 180 / Math.PI;
            console.log(`  edge3 dir: (${inNorm.x.toFixed(6)}, ${inNorm.y.toFixed(6)})`);
            console.log(`  edge4 dir: (${outNorm.x.toFixed(6)}, ${outNorm.y.toFixed(6)})`);
            console.log(`  cross(in,out)=${cross.toFixed(6)}, dot(in,out)=${dot.toFixed(6)}`);
            console.log(`  interior angle: ${angleDeg.toFixed(2)} deg (negative = reflex)`);

            // What does the bisector at vertex 4 collide with first?
            console.log(`\n=== ${name}: v4 bisector collision list ===`);
            const edges = context.graph.interiorEdges.map(e => e.id);
            const v4Events: {label: string; offset: number; detail: string}[] = [];

            for (const otherId of edges) {
                if (otherId === v4Edge.id) continue;
                const event = collideEdges(v4Edge.id, otherId, context);
                if (event && event.intersectionData[2] !== 'diverging') {
                    v4Events.push({
                        label: `e${v4Edge.id} x e${otherId}`,
                        offset: event.offsetDistance,
                        detail: `type=${event.eventType} offset=${event.offsetDistance.toFixed(4)}` +
                            ` pos=(${event.position.x.toFixed(2)}, ${event.position.y.toFixed(2)})`,
                    });
                }
            }

            // Exterior collisions (if reflex)
            if (context.isReflexEdge(v4Edge)) {
                for (let ext = 0; ext < numExt; ext++) {
                    const event = collideEdges(v4Edge.id, ext, context);
                    if (event && event.intersectionData[2] !== 'diverging') {
                        v4Events.push({
                            label: `e${v4Edge.id} x ext${ext}`,
                            offset: event.offsetDistance,
                            detail: `type=${event.eventType} offset=${event.offsetDistance.toFixed(4)}` +
                                ` pos=(${event.position.x.toFixed(2)}, ${event.position.y.toFixed(2)})`,
                        });
                    }
                }
            }

            v4Events.sort((a, b) => a.offset - b.offset);
            for (const {label, detail} of v4Events) {
                console.log(`  ${label}: ${detail}`);
            }
        }

        // Direct comparison of vertex 4 positions
        console.log('\n=== Direct vertex 4 comparison ===');
        console.log(`  FAILURE v4: (${PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP[4].x.toFixed(4)}, ${PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP[4].y.toFixed(4)})`);
        console.log(`  SUCCESS v4: (${SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP[4].x.toFixed(4)}, ${SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP[4].y.toFixed(4)})`);
        console.log(`  delta x: ${(SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP[4].x - PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP[4].x).toFixed(4)}`);
        console.log(`  delta y: ${(SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP[4].y - PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP[4].y).toFixed(4)}`);
    });
});
