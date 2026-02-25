import {initContext, stepWithCapture} from './test-cases/test-helpers';
import {tryToAcceptExteriorEdge} from './algorithm-helpers';
import {StepAlgorithm} from './algorithm-termination-cases';
import {collideEdges, collideInteriorEdges} from './collision-helpers';
import {unitsToIntersection} from './intersection-edges';
import {
    CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS,
    DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_4,
    DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_7,
} from './test-cases/isthmus-failure';
import type {AlgorithmStepInput, Vector2} from './types';
import {crossProduct, dotProduct, makeBisectedBasis, scaleVector, addVectors, subtractVectors, normalize} from './core-functions';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const CASES = [
    {name: 'SUCCEEDS', verts: CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS},
    {name: 'FAILS_NODE_7', verts: DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_7},
    {name: 'FAILS_NODE_4', verts: DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_4},
] as const;

describe('Isthmus Debug', () => {

    it('e3 and e6 convergence/divergence comparison', () => {
        for (const {name, verts} of CASES) {
            const context = initContext(verts);

            // e3 = edge 11 (interior edge at vertex 3, parents cw=3 ws=2)
            // e6 = edge 14 (interior edge at vertex 6, parents cw=6 ws=5)
            // Let's verify by printing all interior edges
            console.log(`\n=== ${name}: Interior edges ===`);
            for (const ie of context.graph.interiorEdges) {
                const ed = context.getEdgeWithId(ie.id);
                const src = context.graph.nodes[ed.source].position;
                console.log(
                    `  e${ie.id}: parents(cw=${ie.clockwiseExteriorEdgeIndex}, ws=${ie.widdershinsExteriorEdgeIndex})` +
                    ` src=n${ed.source}(${src.x.toFixed(1)}, ${src.y.toFixed(1)})` +
                    ` basis=(${ed.basisVector.x.toFixed(4)}, ${ed.basisVector.y.toFixed(4)})` +
                    ` rank=${context.edgeRank(ie.id)} reflex=${!context.isPrimaryNonReflex(ie.id)}`
                );
            }

            // Specifically check e3/e6 — map by parent cw index to find them
            const e3Interior = context.graph.interiorEdges.find(ie => ie.clockwiseExteriorEdgeIndex === 3);
            const e6Interior = context.graph.interiorEdges.find(ie => ie.clockwiseExteriorEdgeIndex === 6);
            if (e3Interior && e6Interior) {
                const e3Data = context.getEdgeWithId(e3Interior.id);
                const e6Data = context.getEdgeWithId(e6Interior.id);
                console.log(`\n=== ${name}: e3 (id=${e3Interior.id}) vs e6 (id=${e6Interior.id}) ===`);

                // Check if they converge or diverge
                const collision = collideEdges(e3Interior.id, e6Interior.id, context);
                if (collision) {
                    console.log(
                        `  collision: type=${collision.eventType} offset=${collision.offsetDistance.toFixed(4)}` +
                        ` pos=(${collision.position.x.toFixed(2)}, ${collision.position.y.toFixed(2)})` +
                        ` intersect=[${collision.intersectionData[0].toFixed(4)}, ${collision.intersectionData[1].toFixed(4)}, ${collision.intersectionData[2]}]`
                    );
                } else {
                    console.log(`  collision: null (no collision / diverging / filtered)`);
                }

                // Also test with collideInteriorEdges directly for more detail
                const rawCollision = collideInteriorEdges(e3Interior, e6Interior, context);
                if (rawCollision) {
                    console.log(
                        `  raw collision: type=${rawCollision.eventType} offset=${rawCollision.offsetDistance.toFixed(4)}` +
                        ` intersect=[${rawCollision.intersectionData[0].toFixed(4)}, ${rawCollision.intersectionData[1].toFixed(4)}, ${rawCollision.intersectionData[2]}]`
                    );
                } else {
                    console.log(`  raw collision: null`);
                }

                // Check the actual intersection type (converging vs diverging)
                // by importing the ray intersection directly
                const ray3 = context.projectRayInterior(e3Interior);
                const ray6 = context.projectRayInterior(e6Interior);

                // Compute dot product of basis vectors to check if they face each other
                const dot = e3Data.basisVector.x * e6Data.basisVector.x + e3Data.basisVector.y * e6Data.basisVector.y;
                console.log(`  dot(e3.basis, e6.basis) = ${dot.toFixed(6)} (negative = facing each other)`);
            }
        }
    });

    it('step-by-step comparison across all three cases', () => {
        for (const {name, verts} of CASES) {
            const result = stepWithCapture(verts);

            console.log(`\n=== ${name}: ${result.snapshots.length} steps, error: ${result.error ?? 'none'} ===`);
            for (const snap of result.snapshots) {
                console.log(
                    `  Step ${snap.step}: ${snap.inputCount} children, ${snap.nodeCount} nodes` +
                    ` accepted=[${snap.acceptedEdges.map((v, j) => v ? j : '').filter(Boolean).join(',')}]`
                );
                for (let c = 0; c < snap.inputs.length; c++) {
                    console.log(`    child[${c}]: [${snap.inputs[c].edges.join(',')}]`);
                }
            }
        }
    });

    it('step 0 collision events for all three cases', () => {
        for (const {name, verts} of CASES) {
            const context = initContext(verts);
            const edges = context.graph.interiorEdges.map(e => e.id);
            const exteriorParents = edges.map(id => context.getInteriorWithId(id).clockwiseExteriorEdgeIndex);

            console.log(`\n=== ${name}: Step 0 collisions (sorted by offset) ===`);
            const allEvents: { label: string; event: NonNullable<ReturnType<typeof collideEdges>> }[] = [];

            for (let i = 0; i < edges.length; i++) {
                const e1 = edges[i];
                const checkExterior = !context.isPrimaryNonReflex(e1);
                for (let j = i + 1; j < edges.length; j++) {
                    const event = collideEdges(e1, edges[j], context);
                    if (event && event.intersectionData[2] !== 'diverging') {
                        allEvents.push({label: `${e1} x ${edges[j]}`, event});
                    }
                }
                if (checkExterior) {
                    for (const ep of exteriorParents) {
                        const event = collideEdges(e1, ep, context);
                        if (event && event.intersectionData[2] !== 'diverging') {
                            allEvents.push({label: `${e1} x ext${ep}`, event});
                        }
                    }
                }
            }

            allEvents.sort((a, b) => a.event.offsetDistance - b.event.offsetDistance);
            for (const {label: lbl, event: ev} of allEvents) {
                console.log(
                    `  ${lbl}: type=${ev.eventType} offset=${ev.offsetDistance.toFixed(4)}` +
                    ` rayLen=${ev.intersectionData[0].toFixed(4)}` +
                    ` pos=(${ev.position.x.toFixed(2)}, ${ev.position.y.toFixed(2)})`
                );
            }
        }
    });

    it('vertex differences between cases', () => {
        console.log('\n=== Vertex differences ===');
        for (let i = 0; i < 8; i++) {
            const s = CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS[i];
            const f7 = DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_7[i];
            const f4 = DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_4[i];
            const diffN7 = s.x !== f7.x || s.y !== f7.y;
            const diffN4 = s.x !== f4.x || s.y !== f4.y;
            if (diffN7 || diffN4) {
                console.log(
                    `  v${i}: SUCCEED=(${s.x.toFixed(2)}, ${s.y.toFixed(2)})` +
                    (diffN7 ? ` FAIL_N7=(${f7.x.toFixed(2)}, ${f7.y.toFixed(2)})` : '') +
                    (diffN4 ? ` FAIL_N4=(${f4.x.toFixed(2)}, ${f4.y.toFixed(2)})` : '')
                );
            }
        }
    });

    it('deep dive: e11 vs e14 raw ray intersection', () => {
        for (const {name, verts} of CASES) {
            const context = initContext(verts);

            // e11 = interior edge at vertex 3, parents cw=3 ws=2
            // e14 = interior edge at vertex 6, parents cw=6 ws=5
            const e11Interior = context.graph.interiorEdges.find(ie => ie.clockwiseExteriorEdgeIndex === 3)!;
            const e14Interior = context.graph.interiorEdges.find(ie => ie.clockwiseExteriorEdgeIndex === 6)!;
            const e11Data = context.getEdgeWithId(e11Interior.id);
            const e14Data = context.getEdgeWithId(e14Interior.id);

            const ray11 = context.projectRayInterior(e11Interior);
            const ray14 = context.projectRayInterior(e14Interior);

            console.log(`\n=== ${name}: Raw ray data for e${e11Interior.id} vs e${e14Interior.id} ===`);
            console.log(`  ray11: src=(${ray11.sourceVector.x.toFixed(4)}, ${ray11.sourceVector.y.toFixed(4)}) basis=(${ray11.basisVector.x.toFixed(6)}, ${ray11.basisVector.y.toFixed(6)})`);
            console.log(`  ray14: src=(${ray14.sourceVector.x.toFixed(4)}, ${ray14.sourceVector.y.toFixed(4)}) basis=(${ray14.basisVector.x.toFixed(6)}, ${ray14.basisVector.y.toFixed(6)})`);

            // Direct intersection call
            const result = unitsToIntersection(ray11, ray14);
            console.log(`  unitsToIntersection: [${result[0].toFixed(4)}, ${result[1].toFixed(4)}, '${result[2]}']`);

            // Dot and cross of basis vectors
            const dot = dotProduct(ray11.basisVector, ray14.basisVector);
            const cross = crossProduct(ray11.basisVector, ray14.basisVector);
            console.log(`  dot(basis11, basis14) = ${dot.toFixed(6)}`);
            console.log(`  cross(basis11, basis14) = ${cross.toFixed(6)}`);

            // Check the relative source vector
            const relSource = subtractVectors(ray14.sourceVector, ray11.sourceVector);
            const [relBasis, relDist] = normalize(relSource);
            console.log(`  relative src (14-11): (${relSource.x.toFixed(4)}, ${relSource.y.toFixed(4)}) dist=${relDist.toFixed(4)}`);
            console.log(`  normalized rel basis: (${relBasis.x.toFixed(6)}, ${relBasis.y.toFixed(6)})`);

            // Cross product used in the intersection calc
            const crossBasis = crossProduct(ray11.basisVector, ray14.basisVector);
            const ray1Units = crossProduct(relSource, ray14.basisVector) / crossBasis;
            const ray2Units_x = (ray1Units * ray11.basisVector.x - relSource.x) / ray14.basisVector.x;
            const ray2Units_y = ray14.basisVector.y !== 0
                ? (ray1Units * ray11.basisVector.y - relSource.y) / ray14.basisVector.y
                : NaN;
            console.log(`  manual calc: ray1Units=${ray1Units.toFixed(6)}, ray2Units_x=${ray2Units_x.toFixed(6)}, ray2Units_y=${ray2Units_y.toFixed(6)}`);
            console.log(`  converging? ray1>0=${ray1Units > 0}, ray2>0=${ray2Units_x > 0} → ${ray1Units > 0 && ray2Units_x > 0 ? 'YES' : 'NO (diverging)'}`);

            // Also check what intersection point would be
            const intPt = addVectors(ray11.sourceVector, scaleVector(ray11.basisVector, ray1Units));
            console.log(`  intersection point: (${intPt.x.toFixed(4)}, ${intPt.y.toFixed(4)})`);
        }
    });

    it('deep dive: bisector direction computation at vertices 3 and 6', () => {
        for (const {name, verts} of CASES) {
            const context = initContext(verts);

            console.log(`\n=== ${name}: Bisector direction derivation ===`);

            // For each vertex, show the parent edges, their basis vectors, and the bisection result
            for (const vertexIdx of [3, 6]) {
                const ie = context.graph.interiorEdges.find(ie => ie.clockwiseExteriorEdgeIndex === vertexIdx)!;
                const cwEdge = context.getEdgeWithId(ie.clockwiseExteriorEdgeIndex);
                const wsEdge = context.getEdgeWithId(ie.widdershinsExteriorEdgeIndex);
                const edgeData = context.getEdgeWithId(ie.id);

                console.log(`\n  Vertex ${vertexIdx} (edge e${ie.id}, parents cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex}):`);
                console.log(`    cwEdge basis: (${cwEdge.basisVector.x.toFixed(6)}, ${cwEdge.basisVector.y.toFixed(6)})`);
                console.log(`    wsEdge basis: (${wsEdge.basisVector.x.toFixed(6)}, ${wsEdge.basisVector.y.toFixed(6)})`);

                // Replicate the bisection computation from addBisectionEdge
                const numExt = context.graph.numExteriorNodes;
                const spanSize = (ie.clockwiseExteriorEdgeIndex - ie.widdershinsExteriorEdgeIndex + numExt) % numExt;
                const parentsInverted = spanSize > numExt / 2;
                console.log(`    spanSize=${spanSize}, numExt=${numExt}, inverted=${parentsInverted}`);

                const fromNodeWiddershins = scaleVector(wsEdge.basisVector, -1);
                console.log(`    fromNodeWiddershins: (${fromNodeWiddershins.x.toFixed(6)}, ${fromNodeWiddershins.y.toFixed(6)})`);

                const bisectedBasis = makeBisectedBasis(cwEdge.basisVector, fromNodeWiddershins);
                console.log(`    raw bisectedBasis: (${bisectedBasis.x.toFixed(6)}, ${bisectedBasis.y.toFixed(6)})`);

                // ensureBisectionIsInterior
                const crossProd = cwEdge.basisVector.x * wsEdge.basisVector.y - cwEdge.basisVector.y * wsEdge.basisVector.x;
                const interiorBasis = crossProd < 0 ? scaleVector(bisectedBasis, -1) : bisectedBasis;
                console.log(`    cross(cw, ws) = ${crossProd.toFixed(6)}, flip=${crossProd < 0}`);
                console.log(`    ensureBisectionIsInterior result: (${interiorBasis.x.toFixed(6)}, ${interiorBasis.y.toFixed(6)})`);

                console.log(`    ACTUAL edge basis: (${edgeData.basisVector.x.toFixed(6)}, ${edgeData.basisVector.y.toFixed(6)})`);
                const match = Math.abs(edgeData.basisVector.x - interiorBasis.x) < 0.0001 && Math.abs(edgeData.basisVector.y - interiorBasis.y) < 0.0001;
                console.log(`    matches expected? ${match}`);

                // Is this vertex reflex?
                console.log(`    isPrimaryNonReflex: ${context.isPrimaryNonReflex(ie.id)}`);
            }
        }
    });

    it('deep dive: post-step-0 edges and their bisector directions', () => {
        for (const {name, verts} of CASES) {
            const context = initContext(verts);
            const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
            let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

            console.log(`\n=== ${name}: Tracing edges after each step ===`);

            // Run step 0
            try {
                const result = StepAlgorithm(context, inputs);
                inputs = result.childSteps;
                exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));

                console.log(`  After step 0: ${inputs.length} child steps`);
                for (let c = 0; c < inputs.length; c++) {
                    console.log(`  child[${c}] edges: [${inputs[c].interiorEdges.join(',')}]`);
                    for (const eid of inputs[c].interiorEdges) {
                        const ie = context.getInteriorWithId(eid);
                        const ed = context.getEdgeWithId(eid);
                        const src = context.graph.nodes[ed.source].position;
                        const numExt = context.graph.numExteriorNodes;
                        const spanSize = (ie.clockwiseExteriorEdgeIndex - ie.widdershinsExteriorEdgeIndex + numExt) % numExt;
                        const parentsInverted = spanSize > numExt / 2;
                        console.log(
                            `    e${eid}: parents(cw=${ie.clockwiseExteriorEdgeIndex}, ws=${ie.widdershinsExteriorEdgeIndex})` +
                            ` src=n${ed.source}(${src.x.toFixed(2)}, ${src.y.toFixed(2)})` +
                            ` basis=(${ed.basisVector.x.toFixed(6)}, ${ed.basisVector.y.toFixed(6)})` +
                            ` rank=${context.edgeRank(eid)} inverted=${parentsInverted}`
                        );
                    }
                }

                // Run step 1
                if (inputs.length > 0) {
                    const result2 = StepAlgorithm(context, inputs);
                    inputs = result2.childSteps;
                    exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));

                    console.log(`\n  After step 1: ${inputs.length} child steps`);
                    for (let c = 0; c < inputs.length; c++) {
                        console.log(`  child[${c}] edges: [${inputs[c].interiorEdges.join(',')}]`);
                        for (const eid of inputs[c].interiorEdges) {
                            const ie = context.getInteriorWithId(eid);
                            const ed = context.getEdgeWithId(eid);
                            const src = context.graph.nodes[ed.source].position;
                            const numExt = context.graph.numExteriorNodes;
                            const spanSize = (ie.clockwiseExteriorEdgeIndex - ie.widdershinsExteriorEdgeIndex + numExt) % numExt;
                            const parentsInverted = spanSize > numExt / 2;
                            console.log(
                                `    e${eid}: parents(cw=${ie.clockwiseExteriorEdgeIndex}, ws=${ie.widdershinsExteriorEdgeIndex})` +
                                ` src=n${ed.source}(${src.x.toFixed(2)}, ${src.y.toFixed(2)})` +
                                ` basis=(${ed.basisVector.x.toFixed(6)}, ${ed.basisVector.y.toFixed(6)})` +
                                ` rank=${context.edgeRank(eid)} inverted=${parentsInverted}`
                            );
                        }
                    }

                    // Check collisions between all edges in each child step
                    for (let c = 0; c < inputs.length; c++) {
                        const childEdges = inputs[c].interiorEdges;
                        console.log(`\n  child[${c}] collisions:`);
                        for (let i = 0; i < childEdges.length; i++) {
                            for (let j = i + 1; j < childEdges.length; j++) {
                                const ie1 = context.getInteriorWithId(childEdges[i]);
                                const ie2 = context.getInteriorWithId(childEdges[j]);
                                const collision = collideInteriorEdges(ie1, ie2, context);
                                const ray1 = context.projectRayInterior(ie1);
                                const ray2 = context.projectRayInterior(ie2);
                                const rawIntersect = unitsToIntersection(ray1, ray2);
                                const dot = dotProduct(ray1.basisVector, ray2.basisVector);

                                console.log(
                                    `    e${childEdges[i]} x e${childEdges[j]}: ` +
                                    `raw=[${rawIntersect[0].toFixed(4)}, ${rawIntersect[1].toFixed(4)}, '${rawIntersect[2]}'] ` +
                                    `dot=${dot.toFixed(4)} ` +
                                    (collision
                                        ? `collision: type=${collision.eventType} offset=${collision.offsetDistance.toFixed(4)}`
                                        : `collision: null`)
                                );
                            }
                        }
                    }
                }
            } catch (e) {
                console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    });

    it('deep dive: step 1 collision landscape (the divergence point)', () => {
        // Step 0 is identical across all 3 cases (12x13 interiorPair).
        // The question is: at step 1, what collisions are available and which fires?
        for (const {name, verts} of CASES) {
            const context = initContext(verts);
            const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
            let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

            // Run step 0
            const result0 = StepAlgorithm(context, inputs);
            inputs = result0.childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));

            console.log(`\n=== ${name}: Step 1 collision landscape ===`);
            console.log(`  Edges: [${inputs[0].interiorEdges.join(',')}]`);
            console.log(`  Accepted: [${context.acceptedEdges.map((v, j) => v ? j : '').filter(Boolean).join(',')}]`);

            // Generate ALL possible collisions for these edges (interior-interior and interior-exterior)
            const edges = inputs[0].interiorEdges;
            const allEvents: { label: string; event: NonNullable<ReturnType<typeof collideEdges>> }[] = [];

            for (let i = 0; i < edges.length; i++) {
                for (let j = i + 1; j < edges.length; j++) {
                    const event = collideEdges(edges[i], edges[j], context);
                    if (event) {
                        allEvents.push({label: `e${edges[i]} x e${edges[j]} (${event.intersectionData[2]})`, event});
                    }
                }
                // Interior vs exterior
                const isReflex = !context.isPrimaryNonReflex(edges[i]);
                if (isReflex) {
                    for (let ext = 0; ext < context.graph.numExteriorNodes; ext++) {
                        if (context.acceptedEdges[ext]) continue;
                        const event = collideEdges(edges[i], ext, context);
                        if (event) {
                            allEvents.push({label: `e${edges[i]} x ext${ext} (${event.intersectionData[2]})`, event});
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

            // Specifically check e15 vs ext edges and e14 vs e16
            const e14Id = context.graph.interiorEdges.find(ie => ie.clockwiseExteriorEdgeIndex === 6)?.id;
            const e15Id = context.graph.interiorEdges.find(ie => ie.clockwiseExteriorEdgeIndex === 7)?.id;
            const e16 = edges.find(e => context.edgeRank(e) === 'secondary');
            if (e14Id && e15Id && e16) {
                console.log(`\n  Key comparison:`);
                const e14_e16 = collideEdges(e14Id, e16, context);
                console.log(`  e${e14Id} x e${e16}: ${e14_e16 ? `type=${e14_e16.eventType} offset=${e14_e16.offsetDistance.toFixed(4)}` : 'null'}`);

                for (let ext = 0; ext < context.graph.numExteriorNodes; ext++) {
                    if (context.acceptedEdges[ext]) continue;
                    const e15_ext = collideEdges(e15Id, ext, context);
                    if (e15_ext && e15_ext.eventType !== 'phantomDivergentOffset') {
                        console.log(`  e${e15Id} x ext${ext}: type=${e15_ext.eventType} offset=${e15_ext.offsetDistance.toFixed(4)}`);
                    }
                }
            }
        }
    });

    it('deep dive: e16 vs ext6 collision in all cases', () => {
        for (const {name, verts} of CASES) {
            const context = initContext(verts);
            const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
            let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

            // Run step 0 to create e16
            const result0 = StepAlgorithm(context, inputs);
            inputs = result0.childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));

            // Find e16 (the secondary edge with parents cw=5, ws=3)
            const e16Id = inputs[0].interiorEdges.find(e => context.edgeRank(e) === 'secondary');
            if (!e16Id) {
                console.log(`${name}: No secondary edge found`);
                continue;
            }
            const e16Interior = context.getInteriorWithId(e16Id);
            const e16Data = context.getEdgeWithId(e16Id);
            const e16Ray = context.projectRayInterior(e16Interior);

            console.log(`\n=== ${name}: e${e16Id} (cw=${e16Interior.clockwiseExteriorEdgeIndex}, ws=${e16Interior.widdershinsExteriorEdgeIndex}) ===`);
            console.log(`  src=(${e16Ray.sourceVector.x.toFixed(4)}, ${e16Ray.sourceVector.y.toFixed(4)}) basis=(${e16Ray.basisVector.x.toFixed(6)}, ${e16Ray.basisVector.y.toFixed(6)})`);
            console.log(`  isPrimaryNonReflex=${context.isPrimaryNonReflex(e16Id)}, rank=${context.edgeRank(e16Id)}`);

            // Check e16 vs ext6
            const ext6 = context.getEdgeWithId(6);
            const ext6Ray = context.projectRay(ext6);
            console.log(`  ext6: src=(${ext6Ray.sourceVector.x.toFixed(4)}, ${ext6Ray.sourceVector.y.toFixed(4)}) basis=(${ext6Ray.basisVector.x.toFixed(6)}, ${ext6Ray.basisVector.y.toFixed(6)}) accepted=${context.acceptedEdges[6]}`);

            // Parents of e16 — can it collide with ext6?
            console.log(`  e16's cw parent = ${e16Interior.clockwiseExteriorEdgeIndex}, ws parent = ${e16Interior.widdershinsExteriorEdgeIndex}`);
            console.log(`  ext6.id = ${ext6.id}. Is parent of e16? cw=${ext6.id === e16Interior.clockwiseExteriorEdgeIndex}, ws=${ext6.id === e16Interior.widdershinsExteriorEdgeIndex}`);

            const collision = collideEdges(e16Id, 6, context);
            if (collision) {
                console.log(`  collision: type=${collision.eventType} offset=${collision.offsetDistance.toFixed(4)} pos=(${collision.position.x.toFixed(2)}, ${collision.position.y.toFixed(2)})`);
            } else {
                console.log(`  collision: null`);
            }

            // Also check all non-accepted exterior edges
            for (let ext = 0; ext < context.graph.numExteriorNodes; ext++) {
                if (context.acceptedEdges[ext]) continue;
                const c = collideEdges(e16Id, ext, context);
                if (c && c.eventType !== 'phantomDivergentOffset') {
                    console.log(`  e${e16Id} x ext${ext}: type=${c.eventType} offset=${c.offsetDistance.toFixed(4)}`);
                }
            }
        }
    });

    it('deep dive: trace collideInteriorAndExteriorEdge for e16 x ext6', () => {
        for (const {name, verts} of CASES) {
            const context = initContext(verts);
            const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
            let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

            // Run step 0
            StepAlgorithm(context, inputs);
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));

            // Get e16 and ext6
            const e16Id = context.graph.interiorEdges.find(ie => ie.clockwiseExteriorEdgeIndex === 5 && ie.widdershinsExteriorEdgeIndex === 3)?.id;
            if (!e16Id) continue;
            const iEdge = context.getInteriorWithId(e16Id);
            const eEdge = context.getEdgeWithId(6);

            console.log(`\n=== ${name}: Trace collideInteriorAndExteriorEdge(e${e16Id}, ext6) ===`);

            // Check: accepted?
            console.log(`  ext6 accepted? ${context.acceptedEdges[6]}`);

            // Check: parent?
            const cwParent = context.clockwiseParent(iEdge);
            const wsParent = context.widdershinsParent(iEdge);
            console.log(`  e16 cwParent=${cwParent.id}, wsParent=${wsParent.id}. ext6=${eEdge.id}. isParent? ${cwParent.id === eEdge.id || wsParent.id === eEdge.id}`);

            // Ray intersection
            const ray1 = context.projectRayInterior(iEdge);
            const ray2 = context.projectRay(eEdge);
            console.log(`  ray1(e16): src=(${ray1.sourceVector.x.toFixed(4)}, ${ray1.sourceVector.y.toFixed(4)}) basis=(${ray1.basisVector.x.toFixed(6)}, ${ray1.basisVector.y.toFixed(6)})`);
            console.log(`  ray2(ext6): src=(${ray2.sourceVector.x.toFixed(4)}, ${ray2.sourceVector.y.toFixed(4)}) basis=(${ray2.basisVector.x.toFixed(6)}, ${ray2.basisVector.y.toFixed(6)})`);

            const intersectionData = unitsToIntersection(ray1, ray2);
            console.log(`  intersection: [${intersectionData[0].toFixed(6)}, ${intersectionData[1].toFixed(6)}, '${intersectionData[2]}']`);

            if (intersectionData[2] !== 'converging') {
                console.log(`  → REJECTED: not converging`);
                continue;
            }

            // widdershins parent ray check
            const widdershinsParentRay = {
                sourceVector: context.findSource(iEdge.id).position,
                basisVector: wsParent.basisVector
            };
            const exteriorCollisionRay = {
                sourceVector: context.graph.nodes[eEdge.target!].position,
                basisVector: scaleVector(eEdge.basisVector, -1)
            };
            console.log(`  wsParentRay: src=(${widdershinsParentRay.sourceVector.x.toFixed(4)}, ${widdershinsParentRay.sourceVector.y.toFixed(4)}) basis=(${widdershinsParentRay.basisVector.x.toFixed(6)}, ${widdershinsParentRay.basisVector.y.toFixed(6)})`);
            console.log(`  extCollRay: src=(${exteriorCollisionRay.sourceVector.x.toFixed(4)}, ${exteriorCollisionRay.sourceVector.y.toFixed(4)}) basis=(${exteriorCollisionRay.basisVector.x.toFixed(6)}, ${exteriorCollisionRay.basisVector.y.toFixed(6)})`);

            const [alongParent] = unitsToIntersection(widdershinsParentRay, exteriorCollisionRay);
            const triangleOtherVertex = addVectors(widdershinsParentRay.sourceVector, scaleVector(widdershinsParentRay.basisVector, alongParent));
            console.log(`  alongParent=${alongParent.toFixed(6)}`);
            console.log(`  triangleOtherVertex=(${triangleOtherVertex.x.toFixed(4)}, ${triangleOtherVertex.y.toFixed(4)})`);

            const triangleOtherBisector = makeBisectedBasis(eEdge.basisVector, scaleVector(wsParent.basisVector, -1));
            console.log(`  triangleOtherBisector=(${triangleOtherBisector.x.toFixed(6)}, ${triangleOtherBisector.y.toFixed(6)})`);

            const otherRay = {sourceVector: triangleOtherVertex, basisVector: triangleOtherBisector};
            const intermediateIntersection = unitsToIntersection(ray1, otherRay);
            const [alongOriginalInterior, _other, resultTypeFinal] = intermediateIntersection;
            console.log(`  intermediate intersection: [${intermediateIntersection[0].toFixed(6)}, ${intermediateIntersection[1].toFixed(6)}, '${resultTypeFinal}']`);

            if (resultTypeFinal !== 'converging') {
                console.log(`  → REJECTED: intermediate not converging`);
                continue;
            }

            // Wavefront shrink validation
            const {graph} = context;
            const numExt = graph.numExteriorNodes;
            const sourceBisectorId = graph.nodes[eEdge.source].outEdges.find(id => id >= numExt)!;
            const targetBisectorId = graph.nodes[eEdge.target!].outEdges.find(id => id >= numExt)!;

            const finalCollisionOffset = crossProduct(ray1.basisVector, wsParent.basisVector) * alongOriginalInterior;
            console.log(`  finalCollisionOffset=${finalCollisionOffset.toFixed(6)}`);

            const sourceBisectorBasis = context.getEdgeWithId(sourceBisectorId).basisVector;
            const tSource = finalCollisionOffset / crossProduct(sourceBisectorBasis, eEdge.basisVector);
            const advancedSource = addVectors(graph.nodes[eEdge.source].position, scaleVector(sourceBisectorBasis, tSource));
            const [, alongWfSource] = unitsToIntersection(ray1, {sourceVector: advancedSource, basisVector: eEdge.basisVector});
            console.log(`  sourceBisector=e${sourceBisectorId} tSource=${tSource.toFixed(4)} advSrc=(${advancedSource.x.toFixed(4)}, ${advancedSource.y.toFixed(4)}) alongWfSource=${alongWfSource.toFixed(6)}`);

            const targetBisectorBasis = context.getEdgeWithId(targetBisectorId).basisVector;
            const tTarget = finalCollisionOffset / crossProduct(targetBisectorBasis, eEdge.basisVector);
            const advancedTarget = addVectors(graph.nodes[eEdge.target!].position, scaleVector(targetBisectorBasis, tTarget));
            const [, alongWfTarget] = unitsToIntersection(ray1, {sourceVector: advancedTarget, basisVector: scaleVector(eEdge.basisVector, -1)});
            console.log(`  targetBisector=e${targetBisectorId} tTarget=${tTarget.toFixed(4)} advTgt=(${advancedTarget.x.toFixed(4)}, ${advancedTarget.y.toFixed(4)}) alongWfTarget=${alongWfTarget.toFixed(6)}`);

            const isPhantom = alongWfSource < 0 || alongWfTarget < 0;
            console.log(`  phantom? ${isPhantom} (source<0=${alongWfSource < 0}, target<0=${alongWfTarget < 0})`);
            console.log(`  → ${isPhantom ? 'REJECTED as phantomDivergentOffset → returned null' : 'ACCEPTED as interiorAgainstExterior'}`);
        }
    });

    it('deep dive: inverted parent span creates wrong bisector direction', () => {
        // This test checks whether edges with "inverted" parent spans get the wrong direction
        // by manually computing what the bisector SHOULD be vs what it IS
        for (const {name, verts} of CASES) {
            const context = initContext(verts);
            const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
            let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

            console.log(`\n=== ${name}: Checking all secondary edges for inverted parent issues ===`);

            // Run through steps collecting secondary edges
            let stepNum = 0;
            while (inputs.length > 0 && stepNum < 5) {
                try {
                    const result = StepAlgorithm(context, inputs);
                    inputs = result.childSteps;
                    exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));

                    // Check any newly created secondary edges
                    for (const input of inputs) {
                        for (const eid of input.interiorEdges) {
                            if (context.edgeRank(eid) !== 'secondary') continue;
                            const ie = context.getInteriorWithId(eid);
                            const ed = context.getEdgeWithId(eid);
                            const numExt = context.graph.numExteriorNodes;
                            const spanSize = (ie.clockwiseExteriorEdgeIndex - ie.widdershinsExteriorEdgeIndex + numExt) % numExt;
                            const parentsInverted = spanSize > numExt / 2;

                            if (parentsInverted) {
                                const cwEdge = context.getEdgeWithId(ie.clockwiseExteriorEdgeIndex);
                                const wsEdge = context.getEdgeWithId(ie.widdershinsExteriorEdgeIndex);
                                const fromNodeWs = scaleVector(wsEdge.basisVector, -1);
                                const rawBisect = makeBisectedBasis(cwEdge.basisVector, fromNodeWs);
                                const crossProd = cwEdge.basisVector.x * wsEdge.basisVector.y - cwEdge.basisVector.y * wsEdge.basisVector.x;

                                // What ensureBisectionIsInterior would give
                                const interiorResult = crossProd < 0 ? scaleVector(rawBisect, -1) : rawBisect;

                                // What ensureDirectionNotReversed would give (if approximateDirection was used)
                                // We don't know the approx direction, but we can check if the actual differs from interior
                                const actualBasis = ed.basisVector;

                                console.log(`  Step ${stepNum} e${eid}: INVERTED parents cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex} span=${spanSize}`);
                                console.log(`    cw basis: (${cwEdge.basisVector.x.toFixed(6)}, ${cwEdge.basisVector.y.toFixed(6)})`);
                                console.log(`    ws basis: (${wsEdge.basisVector.x.toFixed(6)}, ${wsEdge.basisVector.y.toFixed(6)})`);
                                console.log(`    raw bisect: (${rawBisect.x.toFixed(6)}, ${rawBisect.y.toFixed(6)})`);
                                console.log(`    cross(cw,ws)=${crossProd.toFixed(6)}`);
                                console.log(`    ensureBisectionIsInterior would give: (${interiorResult.x.toFixed(6)}, ${interiorResult.y.toFixed(6)})`);
                                console.log(`    ACTUAL basis: (${actualBasis.x.toFixed(6)}, ${actualBasis.y.toFixed(6)})`);
                                const usedInterior = Math.abs(actualBasis.x - interiorResult.x) < 0.0001 && Math.abs(actualBasis.y - interiorResult.y) < 0.0001;
                                const usedRaw = Math.abs(actualBasis.x - rawBisect.x) < 0.0001 && Math.abs(actualBasis.y - rawBisect.y) < 0.0001;
                                const usedFlippedRaw = Math.abs(actualBasis.x + rawBisect.x) < 0.0001 && Math.abs(actualBasis.y + rawBisect.y) < 0.0001;
                                console.log(`    used ensureBisectionIsInterior? ${usedInterior} | used raw? ${usedRaw} | used flipped raw? ${usedFlippedRaw}`);
                            }
                        }
                    }
                    stepNum++;
                } catch (e) {
                    console.log(`  Step ${stepNum} ERROR: ${e instanceof Error ? e.message : String(e)}`);
                    break;
                }
            }
        }
    });
});
