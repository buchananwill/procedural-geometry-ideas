import {initContext} from './test-cases/test-helpers';
import {collideEdges, collideInteriorAndExteriorEdge} from './collision-helpers';
import {StepAlgorithm} from './algorithm-termination-cases';
import {tryToAcceptExteriorEdge} from './algorithm-helpers';
import {BISECTOR_SEVEN_FAILURE} from './test-cases/duck-octagon';
import {crossProduct, scaleVector, addVectors, projectToPerpendicular, projectFromPerpendicular} from './core-functions';
import {intersectRays} from './intersection-edges';
import {makeBisectedBasis} from './core-functions';
import type {AlgorithmStepInput} from './types';

// The CRAZY polygon — extracted from CRAZY_COLLISION_WITH_EXTERIOR_EDGE graph nodes 0-7
const CRAZY_POLYGON = [
    {x: 250, y: 250},
    {x: 300, y: 450},
    {x: 500, y: 450},
    {x: 537.7868459349927, y: 389.0072879736522},
    {x: 572.2271765542667, y: 326.21280723459523},
    {x: 546.1435543836416, y: 249.6495408920134},
    {x: 488.47201260232487, y: 273.35264679006406},
    {x: 455.1750427158221, y: 327.2846666246924}
];

function runToStep(polygon: {x: number, y: number}[], steps: number) {
    const context = initContext(polygon);
    const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

    for (let s = 0; s < steps; s++) {
        inputs = StepAlgorithm(context, inputs).childSteps;
        exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
    }

    return {context, inputs, exteriorEdges};
}

describe('Bisector 7 — CRAZY polygon analysis', () => {

    it('trace the algorithm step by step on CRAZY polygon to find where e18 is created and how it collides with ext1', () => {
        const context = initContext(CRAZY_POLYGON);
        const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);
        let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

        // Show all edges at init
        console.log('=== INITIALIZATION ===');
        for (let i = 0; i < context.graph.edges.length; i++) {
            const e = context.graph.edges[i];
            const b = e.basisVector;
            const src = context.graph.nodes[e.source].position;
            const isInterior = i >= 8;
            if (isInterior) {
                const ie = context.getInteriorWithId(i);
                console.log(`  e${i}: src=n${e.source}(${src.x.toFixed(1)}, ${src.y.toFixed(1)}) basis=(${b.x.toFixed(4)}, ${b.y.toFixed(4)}) cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex}`);
            }
        }

        // Run step by step
        for (let s = 0; s < 5; s++) {
            console.log(`\n=== STEP ${s} ===`);
            const activeIds = inputs[0]?.interiorEdges ?? [];
            console.log(`  Active: [${activeIds.join(', ')}]`);

            const result = StepAlgorithm(context, inputs);
            inputs = result.childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));

            const accepted = context.acceptedEdges.map((v, i) => v ? i : null).filter(v => v !== null);
            console.log(`  Accepted after: [${accepted.join(', ')}]`);

            // Show any new edges
            for (let i = 8; i < context.graph.edges.length; i++) {
                const e = context.graph.edges[i];
                if (e.target === undefined) continue; // not yet terminated
                const ie = context.getInteriorWithId(i);
                const src = context.graph.nodes[e.source].position;
                const tgt = context.graph.nodes[e.target].position;
                const b = e.basisVector;
                if (context.acceptedEdges[i] === false && !activeIds.includes(i)) {
                    // Newly visible
                }
            }

            // Show the new active edges with details
            if (inputs.length > 0 && inputs[0].interiorEdges) {
                for (const eid of inputs[0].interiorEdges) {
                    const ie = context.getInteriorWithId(eid);
                    const ed = context.getEdgeWithId(eid);
                    const src = context.graph.nodes[ed.source].position;
                    console.log(`  e${eid}: src=n${ed.source}(${src.x.toFixed(2)}, ${src.y.toFixed(2)}) basis=(${ed.basisVector.x.toFixed(6)}, ${ed.basisVector.y.toFixed(6)}) cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex} span=${(ie.clockwiseExteriorEdgeIndex - ie.widdershinsExteriorEdgeIndex + 8) % 8}`);
                }
            }

            if (!inputs.length || !inputs[0].interiorEdges?.length) {
                console.log('  Algorithm terminated.');
                break;
            }
        }
    });

    it('deep trace: why does collideInteriorAndExteriorEdge accept e18 vs ext1 on CRAZY polygon?', () => {
        // Run to step 2 (e18 should exist after step 2)
        const {context, inputs} = runToStep(CRAZY_POLYGON, 3);

        console.log('Active edges after step 2:', inputs[0]?.interiorEdges);
        console.log('Accepted:', context.acceptedEdges.map((v, i) => v ? i : null).filter(v => v !== null));

        // Find e18 (cw=6, ws=2, span=4)
        const e18Id = inputs[0].interiorEdges.find(eid => {
            const ie = context.getInteriorWithId(eid);
            return ie.clockwiseExteriorEdgeIndex === 6 && ie.widdershinsExteriorEdgeIndex === 2;
        });

        if (!e18Id) {
            console.log('e18 (cw=6, ws=2) not found! Available edges:');
            for (const eid of inputs[0].interiorEdges) {
                const ie = context.getInteriorWithId(eid);
                console.log(`  e${eid}: cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex}`);
            }
            return;
        }

        const ie18 = context.getInteriorWithId(e18Id);
        const ed18 = context.getEdgeWithId(e18Id);
        const src18 = context.graph.nodes[ed18.source].position;
        console.log(`\ne18 (id=${e18Id}): src=n${ed18.source}(${src18.x.toFixed(4)}, ${src18.y.toFixed(4)}) basis=(${ed18.basisVector.x.toFixed(6)}, ${ed18.basisVector.y.toFixed(6)})`);
        console.log(`  cw=${ie18.clockwiseExteriorEdgeIndex} ws=${ie18.widdershinsExteriorEdgeIndex} span=4 N/2=4`);

        // Show parent edge details
        const cwParent = context.clockwiseParent(ie18);
        const wsParent = context.widdershinsParent(ie18);
        console.log(`  cwParent (ext${cwParent.id}): basis=(${cwParent.basisVector.x.toFixed(6)}, ${cwParent.basisVector.y.toFixed(6)})`);
        console.log(`  wsParent (ext${wsParent.id}): basis=(${wsParent.basisVector.x.toFixed(6)}, ${wsParent.basisVector.y.toFixed(6)})`);
        const cwWsCross = crossProduct(cwParent.basisVector, wsParent.basisVector);
        console.log(`  cross(cwParent, wsParent) = ${cwWsCross.toFixed(8)} ← near zero = ambiguous direction`);

        // Show e18's basis vs wsParent basis — the offset calculation depends on this
        const e18WsCross = crossProduct(ed18.basisVector, wsParent.basisVector);
        console.log(`  cross(e18.basis, wsParent.basis) = ${e18WsCross.toFixed(8)} ← used in offset calc`);

        // Now trace collideInteriorAndExteriorEdge(e18, ext1)
        console.log(`\n=== Deep trace: collideInteriorAndExteriorEdge(e18, ext1) ===`);
        const ext1 = context.getEdgeWithId(1);
        console.log(`  ext1: n${ext1.source}(${context.graph.nodes[ext1.source].position.x}, ${context.graph.nodes[ext1.source].position.y}) → n${ext1.target}(${context.graph.nodes[ext1.target!].position.x}, ${context.graph.nodes[ext1.target!].position.y})`);
        console.log(`  ext1 basis=(${ext1.basisVector.x}, ${ext1.basisVector.y})`);
        console.log(`  ext1 accepted? ${context.acceptedEdges[1]}`);
        console.log(`  isParent? cw=${cwParent.id}===1? ${cwParent.id === 1}, ws=${wsParent.id}===1? ${wsParent.id === 1}`);

        // Step 1: ray intersection
        const ray1 = context.projectRayInterior(ie18);
        const ray2 = context.projectRay(ext1);
        console.log(`\n  [Step 1] Ray intersection`);
        console.log(`    ray1(e18): src=(${ray1.sourceVector.x.toFixed(4)}, ${ray1.sourceVector.y.toFixed(4)}) basis=(${ray1.basisVector.x.toFixed(6)}, ${ray1.basisVector.y.toFixed(6)})`);
        console.log(`    ray2(ext1): src=(${ray2.sourceVector.x.toFixed(4)}, ${ray2.sourceVector.y.toFixed(4)}) basis=(${ray2.basisVector.x.toFixed(6)}, ${ray2.basisVector.y.toFixed(6)})`);

        const intersectionData = intersectRays(ray1, ray2);
        console.log(`    result: [${intersectionData[0].toFixed(6)}, ${intersectionData[1].toFixed(6)}, '${intersectionData[2]}']`);

        if (intersectionData[2] !== 'converging') {
            console.log(`    NOT converging → would return null. No ext1 collision.`);
            return;
        }

        // Step 2: Triangle construction
        console.log(`\n  [Step 2] Triangle construction`);
        const widdershinsParentRay = {
            sourceVector: context.findSource(ie18.id).position,
            basisVector: wsParent.basisVector
        };
        const exteriorCollisionRay = {
            sourceVector: context.graph.nodes[ext1.target!].position,
            basisVector: scaleVector(ext1.basisVector, -1)
        };
        console.log(`    wsParentRay: src=(${widdershinsParentRay.sourceVector.x.toFixed(4)}, ${widdershinsParentRay.sourceVector.y.toFixed(4)}) basis=(${widdershinsParentRay.basisVector.x.toFixed(6)}, ${widdershinsParentRay.basisVector.y.toFixed(6)})`);
        console.log(`    extCollRay: src=(${exteriorCollisionRay.sourceVector.x.toFixed(4)}, ${exteriorCollisionRay.sourceVector.y.toFixed(4)}) basis=(${exteriorCollisionRay.basisVector.x.toFixed(6)}, ${exteriorCollisionRay.basisVector.y.toFixed(6)})`);

        const [alongParent] = intersectRays(widdershinsParentRay, exteriorCollisionRay);
        const triangleOtherVertex = addVectors(widdershinsParentRay.sourceVector, scaleVector(widdershinsParentRay.basisVector, alongParent));
        console.log(`    alongParent=${alongParent.toFixed(6)} → triangleVertex=(${triangleOtherVertex.x.toFixed(4)}, ${triangleOtherVertex.y.toFixed(4)})`);

        const triangleOtherBisector = makeBisectedBasis(ext1.basisVector, scaleVector(wsParent.basisVector, -1));
        console.log(`    triangleOtherBisector=(${triangleOtherBisector.x.toFixed(6)}, ${triangleOtherBisector.y.toFixed(6)})`);

        // Step 3: Intermediate intersection
        console.log(`\n  [Step 3] Intermediate intersection`);
        const otherRay = {sourceVector: triangleOtherVertex, basisVector: triangleOtherBisector};
        const intermediateIntersection = intersectRays(ray1, otherRay);
        console.log(`    result: [${intermediateIntersection[0].toFixed(6)}, ${intermediateIntersection[1].toFixed(6)}, '${intermediateIntersection[2]}']`);

        if (intermediateIntersection[2] !== 'converging') {
            console.log(`    NOT converging → would return null.`);
            return;
        }

        // Step 4: Offset calculation
        console.log(`\n  [Step 4] Offset calculation`);
        const alongOriginalInterior = intermediateIntersection[0];
        const finalCollisionOffset = projectToPerpendicular(ray1.basisVector, widdershinsParentRay.basisVector, alongOriginalInterior);
        console.log(`    alongOriginalInterior = ${alongOriginalInterior.toFixed(6)}`);
        console.log(`    cross(e18.basis, wsParent.basis) = ${crossProduct(ray1.basisVector, widdershinsParentRay.basisVector).toFixed(8)}`);
        console.log(`    finalCollisionOffset = ${finalCollisionOffset.toFixed(8)}`);
        console.log(`    collision position = (${(ray1.sourceVector.x + ray1.basisVector.x * alongOriginalInterior).toFixed(4)}, ${(ray1.sourceVector.y + ray1.basisVector.y * alongOriginalInterior).toFixed(4)})`);

        if (finalCollisionOffset === 0) {
            console.log(`    Offset is exactly 0 → would return null.`);
            return;
        }

        // Step 5: Wavefront validation
        console.log(`\n  [Step 5] Wavefront validation`);
        const {graph} = context;
        const numExt = graph.numExteriorNodes;
        const sourceBisectorId = graph.nodes[ext1.source].outEdges.find(id => id >= numExt)!;
        const targetBisectorId = graph.nodes[ext1.target!].outEdges.find(id => id >= numExt)!;

        const sourceBisectorBasis = context.getEdgeWithId(sourceBisectorId).basisVector;
        const targetBisectorBasis = context.getEdgeWithId(targetBisectorId).basisVector;

        console.log(`    ext1.source(n${ext1.source}) bisector: e${sourceBisectorId} basis=(${sourceBisectorBasis.x.toFixed(6)}, ${sourceBisectorBasis.y.toFixed(6)})`);
        console.log(`    ext1.target(n${ext1.target}) bisector: e${targetBisectorId} basis=(${targetBisectorBasis.x.toFixed(6)}, ${targetBisectorBasis.y.toFixed(6)})`);

        // Source side
        const crossSource = crossProduct(sourceBisectorBasis, ext1.basisVector);
        const tSource = crossSource !== 0 ? finalCollisionOffset / crossSource : 0;
        const advancedSource = addVectors(graph.nodes[ext1.source].position, scaleVector(sourceBisectorBasis, tSource));
        const [, alongWfSource] = intersectRays(ray1, {sourceVector: advancedSource, basisVector: ext1.basisVector});
        console.log(`    SOURCE: cross(bisector, ext1)=${crossSource.toFixed(6)} tSource=${tSource.toFixed(6)}`);
        console.log(`      advancedSource=(${advancedSource.x.toFixed(4)}, ${advancedSource.y.toFixed(4)})`);
        console.log(`      alongWfSource=${alongWfSource.toFixed(6)} → ${alongWfSource >= 0 ? 'PASS' : 'FAIL'}`);

        // Target side
        const crossTarget = crossProduct(targetBisectorBasis, ext1.basisVector);
        const tTarget = crossTarget !== 0 ? finalCollisionOffset / crossTarget : 0;
        const advancedTarget = addVectors(graph.nodes[ext1.target!].position, scaleVector(targetBisectorBasis, tTarget));
        const [, alongWfTarget] = intersectRays(ray1, {sourceVector: advancedTarget, basisVector: scaleVector(ext1.basisVector, -1)});
        console.log(`    TARGET: cross(bisector, ext1)=${crossTarget.toFixed(6)} tTarget=${tTarget.toFixed(6)}`);
        console.log(`      advancedTarget=(${advancedTarget.x.toFixed(4)}, ${advancedTarget.y.toFixed(4)})`);
        console.log(`      alongWfTarget=${alongWfTarget.toFixed(6)} → ${alongWfTarget >= 0 ? 'PASS' : 'FAIL'}`);

        const isPhantom = alongWfSource < 0 || alongWfTarget < 0;
        console.log(`\n    VERDICT: ${isPhantom ? 'PHANTOM (rejected)' : 'ACCEPTED as interiorAgainstExterior'}`);
        console.log(`    finalCollisionOffset=${finalCollisionOffset.toFixed(8)}`);

        // Key insight: if finalCollisionOffset is near zero, the wavefront barely shrinks,
        // so the check trivially passes (any point on ext1 is "within" the barely-shrunk wavefront).
        // This happens because cross(e18.basis, wsParent.basis) ≈ 0 when e18 spans half the polygon.
        console.log(`\n  === KEY INSIGHT ===`);
        console.log(`  e18 parents: cw=ext${ie18.clockwiseExteriorEdgeIndex} ws=ext${ie18.widdershinsExteriorEdgeIndex} (span=4, N/2=4)`);
        console.log(`  e18 basis is nearly antiparallel to wsParent (ext2) basis.`);
        console.log(`  cross(e18.basis, wsParent.basis) = ${crossProduct(ray1.basisVector, widdershinsParentRay.basisVector).toFixed(8)}`);
        console.log(`  This makes finalCollisionOffset ≈ 0 regardless of distance traveled.`);
        console.log(`  With offset ≈ 0, the wavefront barely shrinks, so ANY point on ext1 passes validation.`);
    });

    it('compare: same analysis on BISECTOR_SEVEN_FAILURE with ensureBisectionIsInterior', () => {
        // Run BISECTOR_SEVEN_FAILURE with the ORIGINAL algorithm (no fix).
        // We need to see what e18's basis is in this case.
        const {context, inputs} = runToStep(BISECTOR_SEVEN_FAILURE, 3);

        if (!inputs.length || !inputs[0].interiorEdges?.length) {
            console.log('Algorithm terminated before step 3 on BISECTOR_SEVEN_FAILURE');
            return;
        }

        console.log('Active edges:', inputs[0].interiorEdges);

        for (const eid of inputs[0].interiorEdges) {
            const ie = context.getInteriorWithId(eid);
            const ed = context.getEdgeWithId(eid);
            const src = context.graph.nodes[ed.source].position;
            const span = (ie.clockwiseExteriorEdgeIndex - ie.widdershinsExteriorEdgeIndex + 8) % 8;
            console.log(`  e${eid}: src=n${ed.source}(${src.x.toFixed(2)}, ${src.y.toFixed(2)}) basis=(${ed.basisVector.x.toFixed(6)}, ${ed.basisVector.y.toFixed(6)}) cw=${ie.clockwiseExteriorEdgeIndex} ws=${ie.widdershinsExteriorEdgeIndex} span=${span}`);

            if (span === 4) {
                const cwP = context.clockwiseParent(ie);
                const wsP = context.widdershinsParent(ie);
                console.log(`    ^^^ SPAN=N/2 edge! cross(cw,ws)=${crossProduct(cwP.basisVector, wsP.basisVector).toFixed(8)}`);
                console.log(`    cross(basis, wsParent.basis)=${crossProduct(ed.basisVector, wsP.basisVector).toFixed(8)}`);
            }
        }
    });
});
