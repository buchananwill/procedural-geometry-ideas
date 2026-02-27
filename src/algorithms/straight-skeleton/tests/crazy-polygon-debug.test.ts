import {
    initContext,
    stepWithCapture
} from '@/algorithms/straight-skeleton/test-cases/test-helpers';
import {setSkeletonLogLevel} from '@/algorithms/straight-skeleton/logger';
import {
    collideEdges,
    makeOffsetDistance,
    sourceOffsetDistance
} from '@/algorithms/straight-skeleton/collision-helpers';

import {CRAZY_POLYGON} from '../test-cases/test-constants';
import {stepAlgorithm} from '../algorithm-termination-cases';
import {tryToAcceptExteriorEdge} from '../algorithm-helpers';
import {
    addVectors,
    crossProduct,
    subtractVectors,
    normalize,
    dotProduct,
    scaleVector,
    projectFromPerpendicular,
    areEqual
} from '../core-functions';
import {intersectRays} from '../intersection-edges';
import {generateSplitEventFromTheEdgeItself} from '../generate-split-event';
import type {
    AlgorithmStepInput,
    RayProjection,
    Vector2
} from '../types';

import {runAlgorithmV5} from '../algorithm-termination-cases';

setSkeletonLogLevel('debug');
const fmt = (v: Vector2) => `(${v.x.toFixed(4)}, ${v.y.toFixed(4)})`;
const fmtRay = (r: RayProjection) => `src=${fmt(r.sourceVector)} basis=${fmt(r.basisVector)}`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Crazy Polygon Debug', () => {

    it('1. initializes without error', () => {
        expect(() => initContext(CRAZY_POLYGON)).not.toThrow();
    });

    it('2. step-by-step trace with stepWithCapture', () => {
        const result = stepWithCapture(CRAZY_POLYGON);

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

    it('3. collision events at each step', () => {
        const context = initContext(CRAZY_POLYGON);
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

    it('4. reflex vertex identification and bisector directions', () => {
        const context = initContext(CRAZY_POLYGON);
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
            const prev = CRAZY_POLYGON[(v - 1 + numExt) % numExt];
            const curr = CRAZY_POLYGON[v];
            const next = CRAZY_POLYGON[(v + 1) % numExt];
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

    it('5. post-failure state analysis', () => {
        const result = stepWithCapture(CRAZY_POLYGON);
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

        const activeInterior = context.graph.interiorEdges
            .filter(ie => !context.isAcceptedInterior(ie));
        console.log(`\nActive interior edges: ${activeInterior.length}`);
        for (const ie of activeInterior) {
            const edgeData = context.getEdgeWithId(ie.id);
            const sourcePos = context.graph.nodes[edgeData.source].position;
            const cwParent = context.clockwiseParent(ie);
            const wsParent = context.widdershinsParent(ie);
            console.log(
                `  e${ie.id}: parents(cw=${ie.clockwiseExteriorEdgeIndex}, ws=${ie.widdershinsExteriorEdgeIndex})` +
                ` reflex=${context.isReflexEdge(ie)} rank=${context.edgeRank(ie.id)}` +
                `\n    basis=${fmt(edgeData.basisVector)} source=node${edgeData.source} ${fmt(sourcePos)}` +
                `\n    cwParent basis=${fmt(cwParent.basisVector)} wsParent basis=${fmt(wsParent.basisVector)}` +
                `\n    parent dot=${dotProduct(cwParent.basisVector, wsParent.basisVector).toFixed(6)}`
            );
        }

        console.log('\n=== All pairwise collisions among active edges ===');
        const activeIds = activeInterior.map(ie => ie.id);
        for (let i = 0; i < activeIds.length; i++) {
            for (let j = i + 1; j < activeIds.length; j++) {
                const eA = context.getInteriorWithId(activeIds[i]);
                const eB = context.getInteriorWithId(activeIds[j]);
                const rayA = context.projectRayInterior(eA);
                const rayB = context.projectRayInterior(eB);
                const intersection = intersectRays(rayA, rayB);
                const collisions = collideEdges(activeIds[i], activeIds[j], context);
                const collisionStr = collisions.length > 0 ? collisions.map(c => `${c.eventType} offset=${c.offsetDistance.toFixed(4)}`).join('; ') : 'NO COLLISION';
                console.log(
                    `  ${activeIds[i]} x ${activeIds[j]}: ray result=[${intersection[0].toFixed(4)}, ${intersection[1].toFixed(4)}, ${intersection[2]}]` +
                    ` → ${collisionStr}`
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
                const collisions = collideEdges(ie.id, ext, context);
                const collisionStr = collisions.length > 0 ? collisions.map(c => `${c.eventType} offset=${c.offsetDistance.toFixed(4)}`).join('; ') : 'NO COLLISION';
                console.log(
                    `  e${ie.id} x ext${ext}: initialRay=[${initial[0].toFixed(4)}, ${initial[1].toFixed(4)}, ${initial[2]}]` +
                    ` → ${collisionStr}`
                );
            }
        }
    });

    it('6. DEEP TRACE: e15 vs ext1 through generateSplitEventFromTheEdgeItself', () => {
        // Run algorithm to the failure state
        const result = stepWithCapture(CRAZY_POLYGON);
        if (!result.error) {
            console.log('Algorithm succeeded — nothing to trace');
            return;
        }
        const context = result.context;

        // e15 is the reflex bisector at v7
        const e15 = context.getInteriorWithId(15);
        const ext1 = context.getEdgeWithId(1);

        console.log('\n=== DEEP TRACE: e15 vs ext1 ===');
        console.log(`e15: parents(cw=${e15.clockwiseExteriorEdgeIndex}, ws=${e15.widdershinsExteriorEdgeIndex})`);
        const instigatorRay = context.projectRayInterior(e15);
        const edgeSplitRay = context.projectRay(ext1);
        console.log(`  instigatorRay: ${fmtRay(instigatorRay)}`);
        console.log(`  edgeSplitRay:  ${fmtRay(edgeSplitRay)}`);

        // Step 1: Initial convergence
        const initialTest = intersectRays(instigatorRay, edgeSplitRay);
        console.log(`\n  INITIAL CONVERGENCE: [${initialTest[0].toFixed(6)}, ${initialTest[1].toFixed(6)}, ${initialTest[2]}]`);
        if (initialTest[2] !== 'converging') {
            console.log('  >>> STOPPED: initial rays do not converge');
            return;
        }

        // Step 2: Simple split computation
        const rayLength1 = initialTest[0];
        const cwInstigatorParent = context.clockwiseParent(e15);
        console.log(`\n  CW parent of instigator: ext${cwInstigatorParent.id} basis=${fmt(cwInstigatorParent.basisVector)}`);

        const instigatorOwnParentCross = crossProduct(instigatorRay.basisVector, cwInstigatorParent.basisVector);
        const instigatorTargetCross = crossProduct(scaleVector(instigatorRay.basisVector, -1), ext1.basisVector);
        const divisor = instigatorOwnParentCross + instigatorTargetCross;
        console.log(`  instigatorOwnParentCross = ${instigatorOwnParentCross.toFixed(6)}`);
        console.log(`  instigatorTargetCross    = ${instigatorTargetCross.toFixed(6)}`);
        console.log(`  divisor = ${divisor.toFixed(6)} (need > 0: ${divisor > 0})`);

        if (divisor <= 0) {
            console.log('  >>> STOPPED: divisor <= 0, falls through to clockwise fallback');
        } else {
            const distToSplit = rayLength1 * instigatorTargetCross / divisor;
            const offsetDistance = distToSplit * instigatorOwnParentCross;
            const splitPosition = addVectors(instigatorRay.sourceVector, scaleVector(instigatorRay.basisVector, distToSplit));
            console.log(`  distanceToSplitAlongInstigator = ${distToSplit.toFixed(6)}`);
            console.log(`  offsetDistance = ${offsetDistance.toFixed(6)} (need > 0: ${offsetDistance > 0})`);
            console.log(`  splitPosition = ${fmt(splitPosition)}`);

            if (offsetDistance <= 0) {
                console.log('  >>> STOPPED: offsetDistance <= 0');
            } else {
                // Step 3: Bisector validation
                const wsBisector = context.widdershinsBisector(ext1.id);
                const cwBisector = context.clockwiseBisector(ext1.id);
                const wsSource = context.findSource(wsBisector.id);
                const cwSource = context.findSource(cwBisector.id);

                console.log(`\n  --- Bisector validation ---`);
                console.log(`  ext1 target=node${ext1.target} source=node${ext1.source}`);
                console.log(`  widdershinsBisector(ext1) = e${wsBisector.id} (at target of ext1, node${ext1.target})`);
                console.log(`    basis=${fmt(wsBisector.basisVector)} source=node${wsSource.id} ${fmt(wsSource.position)}`);
                console.log(`    accepted=${context.isAccepted(wsBisector.id)}`);
                console.log(`  clockwiseBisector(ext1) = e${cwBisector.id} (at source of ext1, node${ext1.source})`);
                console.log(`    basis=${fmt(cwBisector.basisVector)} source=node${cwSource.id} ${fmt(cwSource.position)}`);
                console.log(`    accepted=${context.isAccepted(cwBisector.id)}`);

                const wsProjection = projectFromPerpendicular(wsBisector.basisVector, ext1.basisVector, offsetDistance);
                const cwProjection = projectFromPerpendicular(cwBisector.basisVector, ext1.basisVector, offsetDistance);
                console.log(`\n  wsProjection = ${wsProjection.toFixed(6)} (units along e${wsBisector.id} to reach offset ${offsetDistance.toFixed(4)})`);
                console.log(`  cwProjection = ${cwProjection.toFixed(6)} (units along e${cwBisector.id} to reach offset ${offsetDistance.toFixed(4)})`);

                const wsProjectedPos = addVectors(wsSource.position, scaleVector(wsBisector.basisVector, wsProjection));
                const cwProjectedPos = addVectors(cwSource.position, scaleVector(cwBisector.basisVector, cwProjection));
                console.log(`  wsProjectedPos = ${fmt(wsProjectedPos)} (where v2's bisector is at this offset)`);
                console.log(`  cwProjectedPos = ${fmt(cwProjectedPos)} (where v1's bisector is at this offset)`);

                const wsTestRay: RayProjection = {
                    sourceVector: wsProjectedPos,
                    basisVector: scaleVector(ext1.basisVector, -1)
                };
                const cwTestRay: RayProjection = {
                    sourceVector: cwProjectedPos,
                    basisVector: ext1.basisVector
                };

                console.log(`\n  wsTestRay: ${fmtRay(wsTestRay)}`);
                console.log(`  cwTestRay: ${fmtRay(cwTestRay)}`);

                const wsTest = intersectRays(wsTestRay, instigatorRay);
                const cwTest = intersectRays(cwTestRay, instigatorRay);
                console.log(`\n  wsTest result: [${wsTest[0].toFixed(6)}, ${wsTest[1].toFixed(6)}, ${wsTest[2]}]`);
                console.log(`  cwTest result: [${cwTest[0].toFixed(6)}, ${cwTest[1].toFixed(6)}, ${cwTest[2]}]`);

                const wsPass = wsTest[2] === 'converging';
                const cwPass = cwTest[2] === 'converging';
                console.log(`\n  >>> VALIDATION: ws=${wsPass ? 'PASS' : 'FAIL'} cw=${cwPass ? 'PASS' : 'FAIL'}`);
                if (!wsPass || !cwPass) {
                    console.log('  >>> generateSplitEventFromTheEdgeItself returns null here');

                    // Geometric analysis of the failure
                    console.log('\n  --- Why the validation fails ---');
                    console.log(`  Split hits ext1 at x=${splitPosition.x.toFixed(4)}`);
                    console.log(`  At offset ${offsetDistance.toFixed(4)}:`);
                    console.log(`    v2 bisector (e${wsBisector.id}) projected to ${fmt(wsProjectedPos)} → edge boundary at x=${wsProjectedPos.x.toFixed(4)}`);
                    console.log(`    v1 bisector (e${cwBisector.id}) projected to ${fmt(cwProjectedPos)} → edge boundary at x=${cwProjectedPos.x.toFixed(4)}`);
                    console.log(`    Shrunk ext1 spans x=[${cwProjectedPos.x.toFixed(4)}, ${wsProjectedPos.x.toFixed(4)}]`);
                    console.log(`    Split position x=${splitPosition.x.toFixed(4)}`);
                    if (splitPosition.x > wsProjectedPos.x) {
                        console.log(`    >>> Split is ${(splitPosition.x - wsProjectedPos.x).toFixed(4)} PAST the v2 end of the shrunk edge`);
                    } else if (splitPosition.x < cwProjectedPos.x) {
                        console.log(`    >>> Split is ${(cwProjectedPos.x - splitPosition.x).toFixed(4)} PAST the v1 end of the shrunk edge`);
                    } else {
                        console.log(`    >>> Split is within bounds — failure may be from ray direction issue`);
                    }
                }
            }
        }

        // Also try the official function to confirm
        console.log('\n  --- Official result ---');
        const officialResult = generateSplitEventFromTheEdgeItself(e15.id, ext1.id, context);
        console.log(`  generateSplitEventFromTheEdgeItself(e15, ext1) = ${officialResult === null ? 'null' : `offset=${officialResult.offsetDistance.toFixed(4)} pos=${fmt(officialResult.position)}`}`);

        // Try e15 vs all unaccepted ext edges
        console.log('\n  --- e15 vs all unaccepted exterior edges ---');
        for (let ext = 0; ext < context.graph.numExteriorNodes; ext++) {
            if (context.acceptedEdges[ext]) continue;
            const result = generateSplitEventFromTheEdgeItself(e15.id, ext, context);
            const extEdge = context.getEdgeWithId(ext);
            const extRay = context.projectRay(extEdge);
            const initial = intersectRays(instigatorRay, extRay);
            console.log(`  e15 x ext${ext}: initial=[${initial[0].toFixed(4)}, ${initial[1].toFixed(4)}, ${initial[2]}] → ${result === null ? 'null' : `offset=${result.offsetDistance.toFixed(4)}`}`);
        }
    });

    it('7. DEEP TRACE: e15 vs ext1 phantom collision (e10 x e15 as interior pair)', () => {
        const result = stepWithCapture(CRAZY_POLYGON);
        if (!result.error) return;
        const context = result.context;

        const e10 = context.getInteriorWithId(10);
        const e15 = context.getInteriorWithId(15);
        const ray10 = context.projectRayInterior(e10);
        const ray15 = context.projectRayInterior(e15);

        console.log('\n=== e10 x e15 phantom collision analysis ===');
        const intersection = intersectRays(ray10, ray15);
        console.log(`  ray10: ${fmtRay(ray10)}`);
        console.log(`  ray15: ${fmtRay(ray15)}`);
        console.log(`  intersection: [${intersection[0].toFixed(6)}, ${intersection[1].toFixed(6)}, ${intersection[2]}]`);

        const offset10 = makeOffsetDistance(e10, context, ray10, intersection[0]);
        const offset15 = makeOffsetDistance(e15, context, ray15, intersection[1]);
        const srcOffset10 = sourceOffsetDistance(e10, context);
        const srcOffset15 = sourceOffsetDistance(e15, context);

        console.log(`\n  e10 offset: ${offset10.toFixed(6)} (sourceOffset=${srcOffset10.toFixed(6)})`);
        console.log(`  e15 offset: ${offset15.toFixed(6)} (sourceOffset=${srcOffset15.toFixed(6)})`);
        console.log(`  areEqual(${offset10.toFixed(6)}, ${offset15.toFixed(6)}) = ${areEqual(offset10, offset15)}`);
        console.log(`  delta = ${Math.abs(offset10 - offset15).toFixed(6)}`);

        // What point does the collision occur at?
        const collisionPos = addVectors(ray10.sourceVector, scaleVector(ray10.basisVector, intersection[0]));
        console.log(`\n  Collision position: ${fmt(collisionPos)}`);

        // What are the parent edges, and where is this point relative to them?
        const e10CwParent = context.clockwiseParent(e10);
        const e10WsParent = context.widdershinsParent(e10);
        const e15CwParent = context.clockwiseParent(e15);
        const e15WsParent = context.widdershinsParent(e15);

        console.log(`  e10 parents: cw=ext${e10CwParent.id} ws=ext${e10WsParent.id}`);
        console.log(`  e15 parents: cw=ext${e15CwParent.id} ws=ext${e15WsParent.id}`);
    });
});

// ---------------------------------------------------------------------------
// Fuzz test: CRAZY_POLYGON vertex perturbation
// ---------------------------------------------------------------------------

describe('Crazy Polygon Fuzz', () => {
    jest.setTimeout(120_000);

    function reflectInPerpendicularBisector(V: Vector2, A: Vector2, B: Vector2): Vector2 {
        const M = scaleVector(addVectors(A, B), 0.5);
        const d = subtractVectors(B, A);
        const VM = subtractVectors(V, M);
        const dLenSq = d.x * d.x + d.y * d.y;
        if (dLenSq < 1e-12) return V;
        const proj = (VM.x * d.x + VM.y * d.y) / dLenSq;
        return {x: V.x - 2 * proj * d.x, y: V.y - 2 * proj * d.y};
    }

    function computeEllipseForVertex(vertices: Vector2[], i: number) {
        const n = vertices.length;
        const V = vertices[i];
        const A = vertices[(i - 1 + n) % n];
        const B = vertices[(i + 1) % n];
        const F1 = V;
        const F2 = reflectInPerpendicularBisector(V, A, B);
        const distAV = Math.sqrt((A.x - V.x) ** 2 + (A.y - V.y) ** 2);
        const distBV = Math.sqrt((B.x - V.x) ** 2 + (B.y - V.y) ** 2);
        const a = (distAV + distBV) / 2;
        const focalVec = subtractVectors(F2, F1);
        const c = Math.sqrt(focalVec.x ** 2 + focalVec.y ** 2) / 2;
        if (c >= a - 1e-9) return null;
        const b = Math.sqrt(a * a - c * c);
        if (b < 1e-6) return null;
        const center = scaleVector(addVectors(F1, F2), 0.5);
        const rotation = Math.atan2(focalVec.y, focalVec.x);
        return {center, semiMajor: a, semiMinor: b, rotation};
    }

    function generateGridPoints(ellipse: ReturnType<typeof computeEllipseForVertex>, gridSize: number = 5): Vector2[] {
        if (!ellipse) return [];
        const {center, semiMajor: a, semiMinor: b, rotation} = ellipse;
        const cosR = Math.cos(rotation);
        const sinR = Math.sin(rotation);
        const points: Vector2[] = [];
        for (let xi = 0; xi < gridSize; xi++) {
            for (let yi = 0; yi < gridSize; yi++) {
                const u = -1 + (2 * (xi + 0.5)) / gridSize;
                const v = -1 + (2 * (yi + 0.5)) / gridSize;
                if (u * u + v * v > 1) continue;
                points.push({
                    x: center.x + u * a * cosR - v * b * sinR,
                    y: center.y + u * a * sinR + v * b * cosR,
                });
            }
        }
        return points;
    }

    function checkAlgorithmResult(vertices: Vector2[]): string | null {
        let ctx;
        try {
            ctx = runAlgorithmV5(vertices);
        } catch (e) {
            return `Threw: ${e instanceof Error ? e.message : String(e)}`;
        }
        const {graph} = ctx;
        for (let i = 0; i < graph.numExteriorNodes; i++) {
            if (!ctx.acceptedEdges[i]) return `Exterior edge ${i} not accepted`;
        }
        if (graph.edges.length !== graph.numExteriorNodes + graph.interiorEdges.length) {
            return `Edge count invariant: ${graph.edges.length} !== ${graph.numExteriorNodes} + ${graph.interiorEdges.length}`;
        }
        const xs = vertices.map(v => v.x);
        const ys = vertices.map(v => v.y);
        const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        for (const node of graph.nodes.slice(graph.numExteriorNodes)) {
            if (node.position.x < minX - 1 || node.position.x > maxX + 1 ||
                node.position.y < minY - 1 || node.position.y > maxY + 1) {
                return `Interior node outside bounding box at ${fmt(node.position)}`;
            }
        }
        return null;
    }

    it('fuzz v7 (the reflex vertex) perturbation around its ellipse', () => {
        const GRID = 7; // finer grid for the vertex of interest
        const V_IDX = 7;
        const ellipse = computeEllipseForVertex(CRAZY_POLYGON, V_IDX);
        expect(ellipse).not.toBeNull();

        const points = generateGridPoints(ellipse, GRID);
        const failures: {pos: Vector2; reason: string}[] = [];
        const successes: {pos: Vector2}[] = [];

        for (const point of points) {
            const modified = CRAZY_POLYGON.map(v => ({...v}));
            modified[V_IDX] = {x: point.x, y: point.y};
            const reason = checkAlgorithmResult(modified);
            if (reason) {
                failures.push({pos: point, reason});
            } else {
                successes.push({pos: point});
            }
        }

        console.log(`\n=== v7 fuzz: ${points.length} positions tested ===`);
        console.log(`  Successes: ${successes.length}`);
        console.log(`  Failures:  ${failures.length}`);

        if (failures.length > 0) {
            console.log('\n  --- Failure positions ---');
            for (const f of failures) {
                console.log(`    ${fmt(f.pos)}: ${f.reason}`);
            }
        }

        // Log original position for reference
        console.log(`\n  Original v7: ${fmt(CRAZY_POLYGON[V_IDX])}`);
    });

    it('fuzz all vertices of CRAZY_POLYGON', () => {
        const GRID = 5;
        interface FuzzResult {
            vertexIndex: number;
            original: Vector2;
            moved: Vector2;
            reason: string;
        }
        const allFailures: FuzzResult[] = [];

        for (let vi = 0; vi < CRAZY_POLYGON.length; vi++) {
            const ellipse = computeEllipseForVertex(CRAZY_POLYGON, vi);
            if (!ellipse) continue;

            const points = generateGridPoints(ellipse, GRID);
            for (const point of points) {
                const modified = CRAZY_POLYGON.map(v => ({...v}));
                modified[vi] = {x: point.x, y: point.y};
                const reason = checkAlgorithmResult(modified);
                if (reason) {
                    allFailures.push({vertexIndex: vi, original: CRAZY_POLYGON[vi], moved: point, reason});
                }
            }
        }

        console.log(`\n=== CRAZY_POLYGON full fuzz: ${allFailures.length} failures ===`);
        const byVertex = new Map<number, FuzzResult[]>();
        for (const f of allFailures) {
            const list = byVertex.get(f.vertexIndex) ?? [];
            list.push(f);
            byVertex.set(f.vertexIndex, list);
        }
        for (const [vi, failures] of byVertex) {
            console.log(`  v${vi}: ${failures.length} failures`);
            for (const f of failures) {
                console.log(`    ${fmt(f.original)} → ${fmt(f.moved)}: ${f.reason}`);
            }
        }
    });

});
