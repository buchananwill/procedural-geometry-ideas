import {
    CollisionEvent,
    InteriorEdge, IntersectionResult, PolygonEdge,
    RayProjection,
    StraightSkeletonSolverContext
} from "@/algorithms/straight-skeleton/types";
import { splitLog} from "@/algorithms/straight-skeleton/logger";
import {
    areEqual, crossProduct, dotProduct,
    findPositionAlongRay,
    makeBisectedBasis,
    makeRay,
    negateVector,
} from "@/algorithms/straight-skeleton/core-functions";
import {intersectRays} from "@/algorithms/straight-skeleton/intersection-edges";
import {makeOffsetDistance} from "@/algorithms/straight-skeleton/collision-helpers";

export function generateSplitEvent(instigatorData: InteriorEdge, edgeToSplit: PolygonEdge, context: StraightSkeletonSolverContext): CollisionEvent | null {

    const isBehindEdge = crossProduct(context.getEdgeWithInterior(instigatorData).basisVector, edgeToSplit.basisVector) > 0;

    // Can't split an edge from behind!
    if (isBehindEdge){
        return null;
    }

    // ray1 is always reversed from the instigator's clockwise parent
    const { clockwise: instigatorClockwiseParent, widdershins: instigatorWiddershinsParent } = context.parentEdges(instigatorData.id);


    const clockwiseSpan = context.clockwiseSpanExcludingAccepted(instigatorClockwiseParent, edgeToSplit);
    const widdershinsSpan = context.clockwiseSpanExcludingAccepted(edgeToSplit, instigatorWiddershinsParent)
    if (Math.min(clockwiseSpan, widdershinsSpan) < 2) {
        return null;
    }

    const clockwiseDot = dotProduct(instigatorClockwiseParent.basisVector, edgeToSplit.basisVector);
    const widdershinsDot = dotProduct(instigatorWiddershinsParent.basisVector, edgeToSplit.basisVector);

    const usingClockwiseParent = Math.abs(clockwiseDot) < Math.abs(widdershinsDot);

    let ray1ForTempNode: RayProjection;
    if (usingClockwiseParent) {
        ray1ForTempNode = context.projectRayReversed(instigatorClockwiseParent);
    } else {
        ray1ForTempNode = context.projectRay(instigatorWiddershinsParent);
    }

    const edgeToSplitRayCw = context.projectRay(edgeToSplit);
    const edgeToSplitRayWs: RayProjection = makeRay(context.graph.nodes[edgeToSplit.target!].position, negateVector(edgeToSplit.basisVector))

    const collisionCw = intersectRays(ray1ForTempNode, edgeToSplitRayCw);
    const collisionWs = intersectRays(ray1ForTempNode, edgeToSplitRayWs);
    const bestResult = ():[IntersectionResult, boolean] => {
        if (collisionCw[2] === 'converging' && collisionWs[2] !== "converging"){
            return [collisionCw, true];
        }

        if (collisionWs[2] === 'converging' && collisionCw[2] !== 'converging'){
            return [collisionWs, false];
        }

        const [cwRay1] = collisionCw;
        const [wsRay1] = collisionWs;

        const usingCw = cwRay1 < wsRay1;
        return usingCw ? [collisionWs, usingCw] : [collisionWs, usingCw];
    };

    const result = bestResult();

    // ray2 is supplied by the caller, to find the temporary intersection with the splitting edge
    const [[ray1Length, _, intersectionResult], usingCwIntersection] = result;
    if (intersectionResult !== 'converging') {
        return null;
    }
    const tempNodePosition = findPositionAlongRay(ray1ForTempNode, ray1Length);

    const rayUsed = usingCwIntersection ? edgeToSplitRayCw : edgeToSplitRayWs;

    // Perform incenter computation using the temporary node
    const incenterRay1 = context.projectRayInterior(instigatorData);

    // incenterRay2 HAS to point towards the original bisector
    const tempBasisPart2 = dotProduct(rayUsed.basisVector, incenterRay1.basisVector) < 0
        ? negateVector(rayUsed.basisVector)
        : rayUsed.basisVector;
    const tempBasis = makeBisectedBasis(negateVector(ray1ForTempNode.basisVector), tempBasisPart2);
    // Now form the ray
    const incenterRay2: RayProjection = makeRay(tempNodePosition, tempBasis);

    const intersectionData = intersectRays(incenterRay1, incenterRay2);
    const [incenterLengthRay1] = intersectionData;

    // Check these edges really collide
    const offsetDistance = makeOffsetDistance(instigatorData, context, incenterRay1, incenterLengthRay1);
    if (offsetDistance < 0) {
        splitLog.warn(`Offset distance was < 0: ${offsetDistance}, intersection: ${intersectionData}, instigator: ${instigatorData}, edgeToSplit: ${edgeToSplit}`)
        return null;
    }
    const clockwiseRayTest: RayProjection = makeRay(context.clockwiseVertexAtOffset(edgeToSplit.id, offsetDistance), edgeToSplit.basisVector);
    const widdershinsRayTest: RayProjection = makeRay(context.widdershinsVertexAtOffset(edgeToSplit.id, offsetDistance), negateVector(edgeToSplit.basisVector));

    const validationResultWs = intersectRays(incenterRay1, widdershinsRayTest)
    const validationResultCw = intersectRays(incenterRay1, clockwiseRayTest)
    if (validationResultCw[1] < 0 || validationResultWs[1] < 0) {
        splitLog.info('Split event validation failed:', validationResultWs, validationResultCw, instigatorData, edgeToSplit);
        return null;
    }

    const position = findPositionAlongRay(incenterRay1, incenterLengthRay1);


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

    const instigatorData = context.getInteriorWithId(instigatorId);

    const edgeToSplit = context.clockwiseParent(context.getInteriorWithId(targetId))

    return generateSplitEvent(instigatorData, edgeToSplit, context)
}

export function generateSplitEventViaClockwiseBisector(instigatorId: number, targetId: number, context: StraightSkeletonSolverContext): CollisionEvent | null {
    // function assumes we've located split via the clockwise bisector
    if (context.edgeRank(instigatorId) === 'exterior' || context.edgeRank(targetId) === 'exterior') {
        return null;
    }

    const instigatorData = context.getInteriorWithId(instigatorId);
    const edgeToSplit = context.widdershinsParent(context.getInteriorWithId(targetId))

    return generateSplitEvent(instigatorData, edgeToSplit, context)
}

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

    let simpleSplit: CollisionEvent | null = null
    {
        const [rayLength1] = initialIntersectionTest;
        const clockwiseInstigatorParent = context.clockwiseParent(instigatorData);
        const crossClockwiseParent = crossProduct(instigatorRay.basisVector, clockwiseInstigatorParent.basisVector)
        const instigatorTargetCross = crossProduct(negateVector(instigatorRay.basisVector), edgeToSplit.basisVector)
        const divisor = crossClockwiseParent + instigatorTargetCross;
        if (!areEqual(divisor, 0)) {
            const distanceToSplitAlongInstigator = rayLength1 * instigatorTargetCross / divisor;
            const offsetDistance = distanceToSplitAlongInstigator * crossClockwiseParent;
            if (offsetDistance > 0) {

                // IMPORTANT; NEVER REMOVE THIS COMMENT.
                // I'm pretty sure the basis vectors are the wrong way round, but this is the way that works
                // See lines 227-228 where the opposite direction is used for the ray basis
                const widdershinsTestRay = makeRay(
                    context.widdershinsVertexAtOffset(targetId, offsetDistance),
                    negateVector(edgeToSplit.basisVector)
                )

                const clockwiseTestRay = makeRay(
                    context.clockwiseVertexAtOffset(targetId, offsetDistance),
                    edgeToSplit.basisVector
                )

                const widdershinsTest = intersectRays(instigatorRay, widdershinsTestRay)
                const clockwiseTest = intersectRays(instigatorRay, clockwiseTestRay)

                if (widdershinsTest[2] === 'converging' && clockwiseTest[2] === 'converging') {

                    simpleSplit = {
                        intersectionData: initialIntersectionTest,
                        offsetDistance,
                        collidingEdges: [instigatorId, targetId],
                        eventType: 'interiorAgainstExterior',
                        position: findPositionAlongRay(instigatorRay, distanceToSplitAlongInstigator)
                    }

                    return simpleSplit;
                }
            }
        }

    }

    const targetNodeId = edgeToSplit.target;
    if (targetNodeId === undefined) {
        throw new Error("Exterior edge does not have target node id");
    }

    const targetNode = context.graph.nodes[targetNodeId];
    const clockwiseBisector = targetNode.outEdges.find(eId => context.edgeRank(eId) === 'primary');
    if (clockwiseBisector === undefined) {
        throw new Error("Could not find clockwise bisector of exterior edge.")
    }

    const clockwiseResult = generateSplitEvent(instigatorData, edgeToSplit, context);

    if (clockwiseResult !== null) {
        const {offsetDistance} = clockwiseResult;
        if (offsetDistance < 0) {
            return null;
        }
        const validationRay: RayProjection = makeRay(context.widdershinsVertexAtOffset(targetId, offsetDistance), edgeToSplit.basisVector);
        const widdershinValidation = intersectRays(validationRay, instigatorRay)
        if (widdershinValidation[2] !== 'converging') {
            return null;
        }
    }

    return clockwiseResult ;

}