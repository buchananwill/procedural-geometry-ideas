import {
    CollisionEvent,
    InteriorEdge, PolygonEdge,
    RayProjection,
    StraightSkeletonSolverContext
} from "@/algorithms/straight-skeleton/types";
import {
    addVectors, crossProduct, dotProduct,
    makeBisectedBasis,
    projectFromPerpendicular,
    scaleVector
} from "@/algorithms/straight-skeleton/core-functions";
import {intersectRays} from "@/algorithms/straight-skeleton/intersection-edges";
import {makeOffsetDistance} from "@/algorithms/straight-skeleton/collision-helpers";

/**
 * Code paths to add:
 *
 * 1. Handling the potential edge split.
 * 2. Finding an edge split via the widdershins bisector DONE
 * 3. Finding an edge split via the clockwise bisector DONE
 * 4. Finding an edge split via the edge itself
 * */
export function generateSplitEvent(instigatorData: InteriorEdge, edgeToSplit: PolygonEdge, ray2ForTempNode: RayProjection, context: StraightSkeletonSolverContext): CollisionEvent | null {

    // ray1 is always reversed from the instigator's clockwise parent
    const instigatorClockwiseParent = context.clockwiseParent(instigatorData);
    const instigatorWiddershinsParent = context.widdershinsParent(instigatorData);


    const clockwiseSpan = context.clockwiseSpanExcludingAccepted(instigatorClockwiseParent, edgeToSplit);
    const widdershinsSpan = context.clockwiseSpanExcludingAccepted(edgeToSplit, instigatorWiddershinsParent)
    if (Math.min(clockwiseSpan, widdershinsSpan) < 2) {
        return null;
    }

    const clockwiseDot = dotProduct(instigatorClockwiseParent.basisVector, edgeToSplit.basisVector);
    const widdershinsDot = dotProduct(instigatorWiddershinsParent.basisVector, edgeToSplit.basisVector);


    let ray1ForTempNode: RayProjection;
    if (Math.abs(clockwiseDot) < Math.abs(widdershinsDot)) {
        ray1ForTempNode = context.projectRayReversed(instigatorClockwiseParent);
    } else {
        ray1ForTempNode = context.projectRay(instigatorWiddershinsParent);
    }

    // ray2 is supplied by the caller, to find the temporary intersection with the splitting edge
    const [ray1Length, _, intersectionResult] = intersectRays(ray1ForTempNode, ray2ForTempNode)
    if (intersectionResult !== 'converging') {
        return null;
        // throw new Error(`Exterior edges for finding temp node did not yield a converging result. ${JSON.stringify([context, instigatorData, edgeToSplit, ray2ForTempNode])}`)
    }
    const tempNodePosition = addVectors(ray1ForTempNode.sourceVector, scaleVector(ray1ForTempNode.basisVector, ray1Length));


    // Perform incenter computation using the temporary node
    const tempBasisPart2 = dotProduct(ray2ForTempNode.basisVector, ray1ForTempNode.basisVector) < 0
        ? scaleVector(ray2ForTempNode.basisVector, -1)
        : ray2ForTempNode.basisVector;
    const tempBasis = makeBisectedBasis(scaleVector(ray1ForTempNode.basisVector, -1), tempBasisPart2);
    const incenterRay1 = context.projectRayInterior(instigatorData);
    const incenterRay2: RayProjection = {sourceVector: tempNodePosition, basisVector: tempBasis};

    const intersectionData = intersectRays(incenterRay1, incenterRay2);
    const [incenterLengthRay1] = intersectionData;

    // Check these edges really collide
    const offsetDistance = makeOffsetDistance(instigatorData, context, incenterRay1, incenterLengthRay1);
    if (offsetDistance < 0) {
        return null;
    }
    const clockwiseBisector = context.clockwiseBisector(edgeToSplit.id);
    const widdershinsBisector = context.widdershinsBisector(edgeToSplit.id);

    const projectionAlongBisectorA = projectFromPerpendicular(clockwiseBisector.basisVector, edgeToSplit.basisVector, offsetDistance);
    const projectionAlongBisectorB = projectFromPerpendicular(widdershinsBisector.basisVector, edgeToSplit.basisVector, offsetDistance);
    const sourceClockwise = context.findSource(clockwiseBisector.id);
    const sourceWiddershins = context.findSource(widdershinsBisector.id);

    const clockwiseVertexAtOffset = addVectors(sourceClockwise.position, scaleVector(clockwiseBisector.basisVector, projectionAlongBisectorA));
    const widdershinsVertexAtOffset = addVectors(sourceWiddershins.position, scaleVector(widdershinsBisector.basisVector, projectionAlongBisectorB));
    const clockwiseRayTest: RayProjection = {
        sourceVector: clockwiseVertexAtOffset,
        basisVector: scaleVector(edgeToSplit.basisVector, -1)
    };
    const widdershinsRayTest: RayProjection = {
        sourceVector: widdershinsVertexAtOffset,
        basisVector: edgeToSplit.basisVector
    };

    const validationResultWs = intersectRays(incenterRay1, widdershinsRayTest)
    const validationResultCw = intersectRays(incenterRay1, clockwiseRayTest)
    if (validationResultCw[1] < 0 || validationResultWs[1] < 0) {
        console.log(`Split event validation failed: ${JSON.stringify([validationResultWs, validationResultCw, context])}`)
        // TODO: add debug logging
        return null;
    }

    const position = addVectors(incenterRay1.sourceVector, scaleVector(incenterRay1.basisVector, incenterLengthRay1));


    return {
        position,
        intersectionData,
        collidingEdges: [instigatorData.id, edgeToSplit.id],
        offsetDistance,
        eventType: 'interiorAgainstExterior'
    }
}

export function generateSplitEventViaWiddershinsBisector(instigatorId: number, targetId: number, context: StraightSkeletonSolverContext): CollisionEvent | null {

    // function assumes we've located split via the widdershins bisector
    if (context.edgeRank(instigatorId) === 'exterior' || context.edgeRank(targetId) === 'exterior') {
        return null;
    }

    // TODO: check instigatorId is reflex??
    const instigatorData = context.getInteriorWithId(instigatorId);

    const edgeToSplit = context.clockwiseParent(context.getInteriorWithId(targetId))
    const targetNodeOfSplittingEdge = context.graph.nodes[edgeToSplit.target!];
    const ray2ForTempNode: RayProjection = {
        sourceVector: targetNodeOfSplittingEdge.position,
        basisVector: scaleVector(edgeToSplit.basisVector, -1)
    }

    return generateSplitEvent(instigatorData, edgeToSplit, ray2ForTempNode, context)
}

export function generateSplitEventViaClockwiseBisector(instigatorId: number, targetId: number, context: StraightSkeletonSolverContext): CollisionEvent | null {
    // function assumes we've located split via the clockwise bisector
    if (context.edgeRank(instigatorId) === 'exterior' || context.edgeRank(targetId) === 'exterior') {
        return null;
    }

    // TODO: check instigatorId is reflex??
    const instigatorData = context.getInteriorWithId(instigatorId);

    const edgeToSplit = context.widdershinsParent(context.getInteriorWithId(targetId))
    const sourceNodeOfSplittingEdge = context.findSource(edgeToSplit.id);
    const ray2ForTempNode: RayProjection = {
        sourceVector: sourceNodeOfSplittingEdge.position,
        basisVector: edgeToSplit.basisVector
    }

    return generateSplitEvent(instigatorData, edgeToSplit, ray2ForTempNode, context)
}

// TODO: Diagrammatic Analysis of this scenario to prove robustness. I think the only catch is we need to also check the projection of the opposite bisector, at the found offset, before we sign off on the collision.
export function generateSplitEventFromTheEdgeItself(instigatorId: number, targetId: number, context: StraightSkeletonSolverContext): CollisionEvent | null {
    const edgeToSplit = context.getEdgeWithId(targetId);
    const instigatorData = context.getInteriorWithId(instigatorId);

    const edgeSplitRay = context.projectRay(edgeToSplit)
    const instigatorRay = context.projectRayInterior(instigatorData);

    const initialIntersectionTest = intersectRays(instigatorRay, edgeSplitRay);
    if (initialIntersectionTest[2] !== 'converging') {
        // We expect now to handle the "near miss" scenarios via the intersections of the bisectors themselves.
        return null;
    }

    // Try simple split
    let simpleSplitEvent: CollisionEvent | null = null;
    {
        const [rayLength1] = initialIntersectionTest;
        const clockwiseInstigatorParent = context.clockwiseParent(instigatorData);
        const instigatorOwnParentCross = crossProduct(instigatorRay.basisVector, clockwiseInstigatorParent.basisVector)
        const instigatorTargetCross = crossProduct(scaleVector(instigatorRay.basisVector, -1), edgeToSplit.basisVector)
        const divisor = instigatorOwnParentCross + instigatorTargetCross;
        if (divisor > 0) {
            const distanceToSplitAlongInstigator = rayLength1 * instigatorTargetCross / divisor;
            const offsetDistance = distanceToSplitAlongInstigator * instigatorOwnParentCross;
            if (offsetDistance > 0) {
                const widdershinsBisector: PolygonEdge = context.widdershinsBisector(targetId);
                const clockwiseBisector = context.clockwiseBisector(targetId);

                const widdershinsProjection = projectFromPerpendicular(widdershinsBisector.basisVector, edgeToSplit.basisVector, offsetDistance)
                const clockwiseProjection = projectFromPerpendicular(clockwiseBisector.basisVector, edgeToSplit.basisVector, offsetDistance)

                const widdershinsTestRay: RayProjection = {
                    sourceVector: addVectors(context.findSource(widdershinsBisector.id).position, scaleVector(widdershinsBisector.basisVector, widdershinsProjection)),
                    basisVector: scaleVector(edgeToSplit.basisVector, -1)
                }

                const clockwiseTestRay: RayProjection = {
                    sourceVector: addVectors(context.findSource(clockwiseBisector.id).position, scaleVector(clockwiseBisector.basisVector, clockwiseProjection)),
                    basisVector: edgeToSplit.basisVector
                }

                const widdershinsTest = intersectRays(widdershinsTestRay, instigatorRay)
                const clockwiseTest = intersectRays(clockwiseTestRay, instigatorRay)

                if (widdershinsTest[2] === 'converging' && clockwiseTest[2] === 'converging') {

                    simpleSplitEvent = {
                        intersectionData: initialIntersectionTest,
                        offsetDistance,
                        collidingEdges: [instigatorId, targetId],
                        eventType: 'interiorAgainstExterior',
                        position: addVectors(scaleVector(instigatorRay.basisVector, distanceToSplitAlongInstigator), instigatorRay.sourceVector)
                    }
                }
            }
        }

    }

    const clockwiseBisector = context.clockwiseBisector(targetId);
    const widdershinsBisector = context.widdershinsBisector(targetId);

    const clockwiseResult = generateSplitEventViaClockwiseBisector(instigatorData.id, clockwiseBisector.id, context);
    const widdershinsResult = generateSplitEventViaWiddershinsBisector(instigatorData.id, widdershinsBisector.id, context)
    let bestResult: CollisionEvent | null =
        (clockwiseResult && widdershinsResult)
            ? (clockwiseResult.offsetDistance < widdershinsResult.offsetDistance
                ? clockwiseResult
                : widdershinsResult)
            : (clockwiseResult ?? widdershinsResult);
    if (bestResult !== null && simpleSplitEvent !== null) {
        const {offsetDistance} = bestResult;
        if (offsetDistance > 0) {
            if (simpleSplitEvent.offsetDistance < bestResult.offsetDistance)
                bestResult = simpleSplitEvent;
        }
    } else {
        bestResult = simpleSplitEvent
    }

    return bestResult;
}