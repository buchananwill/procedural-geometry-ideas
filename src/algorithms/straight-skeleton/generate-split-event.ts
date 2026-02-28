import {
    CollisionEvent,
    InteriorEdge, IntersectionResult, PolygonEdge,
    RayProjection,
    SkeletonDirection,
    SplitOffsetResult,
    StraightSkeletonSolverContext
} from "@/algorithms/straight-skeleton/types";
import {complexLog, splitLog} from "@/algorithms/straight-skeleton/logger";
import {
    areEqual, crossProduct, dotProduct,
    findPositionAlongRay,
    makeBisectedBasis,
    makeRay,
    negateVector,
} from "@/algorithms/straight-skeleton/core-functions";
import {intersectRays} from "@/algorithms/straight-skeleton/intersection-edges";
import {makeOffsetDistance} from "@/algorithms/straight-skeleton/collision-helpers";

/**
 * Find the split offset by constructing a triangular incenter.
 * Uses the parent bisector most perpendicular to the edge being split.
 * Useful when the bisector doesn't directly strike the edge in its starting state.
 */
function findOffsetViaIncenter(
    instigatorData: InteriorEdge,
    edgeToSplit: PolygonEdge,
    context: StraightSkeletonSolverContext
): SplitOffsetResult | null {
    const {
        clockwise: instigatorClockwiseParent,
        widdershins: instigatorWiddershinsParent
    } = context.parentEdges(instigatorData.id);

    // Make a ray from the parent that is most perpendicular to the splitting edge
    const clockwiseDot = dotProduct(instigatorClockwiseParent.basisVector, edgeToSplit.basisVector);
    const widdershinsDot = dotProduct(instigatorWiddershinsParent.basisVector, edgeToSplit.basisVector);

    const usingClockwiseParent = Math.abs(clockwiseDot) < Math.abs(widdershinsDot);

    let ray1ForTempNode: RayProjection;
    if (usingClockwiseParent) {
        ray1ForTempNode = context.projectRayReversed(instigatorClockwiseParent);
    } else {
        ray1ForTempNode = context.projectRay(instigatorWiddershinsParent);
    }

    // prepare rays from each end, looking towards the edge's centre
    const edgeToSplitRayCw = context.projectRay(edgeToSplit);
    const edgeToSplitRayWs: RayProjection = makeRay(context.graph.nodes[edgeToSplit.target!].position, negateVector(edgeToSplit.basisVector))

    const collisionCw = intersectRays(ray1ForTempNode, edgeToSplitRayCw);
    const collisionWs = intersectRays(ray1ForTempNode, edgeToSplitRayWs);

    // intersect both in case ray is narrowly passing outside either end of the edge
    const bestResult = (): [IntersectionResult, boolean] => {
        if (collisionCw[2] === 'converging' && collisionWs[2] !== "converging") {
            return [collisionCw, true];
        }

        if (collisionWs[2] === 'converging' && collisionCw[2] !== 'converging') {
            return [collisionWs, false];
        }

        const [cwRay1] = collisionCw;
        const [wsRay1] = collisionWs;

        const usingCw = cwRay1 < wsRay1;
        return usingCw ? [collisionCw, usingCw] : [collisionWs, usingCw];
    };

    const result = bestResult();

    // Make temporary node from the intersection point
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

    const offsetDistance = makeOffsetDistance(instigatorData, context, incenterRay1, incenterLengthRay1);

    // Discard negative offsets
    if (offsetDistance < 0) {
        splitLog.warn(`Offset distance was < 0: ${offsetDistance}, intersection: ${intersectionData}, instigator: ${instigatorData}, edgeToSplit: ${edgeToSplit}`)
        return null;
    }

    const position = findPositionAlongRay(incenterRay1, incenterLengthRay1);

    return {offsetDistance, position, intersectionData};
}

/**
 * Find the split offset by direct bisector–edge intersection.
 * Solves the equation:
 * offset = distanceAlongBisector * cross(bisector, parent)
 * where distanceAlongBisector partitions the total bisector length by the ratio
 * of the perpendicular projections to parent and struck edge.
 */
function findOffsetByDirectStrike(
    instigatorData: InteriorEdge,
    edgeToSplit: PolygonEdge,
    initialIntersection: IntersectionResult,
    context: StraightSkeletonSolverContext
): SplitOffsetResult | null {
    const instigatorRay = context.projectRayInterior(instigatorData);
    const [rayLength1] = initialIntersection;
    const clockwiseInstigatorParent = context.clockwiseParent(instigatorData);
    const crossClockwiseParent = crossProduct(instigatorRay.basisVector, clockwiseInstigatorParent.basisVector);
    const instigatorTargetCross = crossProduct(negateVector(instigatorRay.basisVector), edgeToSplit.basisVector);
    const divisor = crossClockwiseParent + instigatorTargetCross;

    if (areEqual(divisor, 0)) {
        return null;
    }

    const distanceToSplitAlongInstigator = rayLength1 * instigatorTargetCross / divisor;
    const offsetDistance = distanceToSplitAlongInstigator * crossClockwiseParent;

    if (offsetDistance <= 0) {
        return null;
    }

    const position = findPositionAlongRay(instigatorRay, distanceToSplitAlongInstigator);

    return {offsetDistance, position, intersectionData: initialIntersection};
}

export function generateSplitEvent(instigatorData: InteriorEdge, edgeToSplit: PolygonEdge, context: StraightSkeletonSolverContext): CollisionEvent | null {

    const {
        clockwise: instigatorClockwiseParent,
        widdershins: instigatorWiddershinsParent
    } = context.parentEdges(instigatorData.id);

    // Can't split an edge from behind!
    const isBehindEdge = crossProduct(context.getEdgeWithInterior(instigatorData).basisVector, edgeToSplit.basisVector) > 0;
    if (isBehindEdge) {
        return null;
    }

    // Can't split your neighbour
    const clockwiseSpan = context.clockwiseSpanExcludingAccepted(instigatorClockwiseParent, edgeToSplit);
    const widdershinsSpan = context.clockwiseSpanExcludingAccepted(edgeToSplit, instigatorWiddershinsParent)
    if (Math.min(clockwiseSpan, widdershinsSpan) < 2) {
        return null;
    }

    const result = findOffsetViaIncenter(instigatorData, edgeToSplit, context);
    if (result === null) {
        return null;
    }

    if (!context.validateSplitReachesEdge(instigatorData.id, edgeToSplit.id, result.offsetDistance)) {
        splitLog.info('Split event validation failed:', instigatorData, edgeToSplit);
        return null;
    }

    return {
        position: result.position,
        intersectionData: result.intersectionData,
        collidingEdges: [instigatorData.id, edgeToSplit.id],
        offsetDistance: result.offsetDistance,
        eventType: 'interiorAgainstExterior'
    }
}

export function generateSplitEventViaBisector(
    instigatorId: number,
    targetId: number,
    direction: SkeletonDirection,
    context: StraightSkeletonSolverContext,
): CollisionEvent | null {
    if (context.edgeRank(instigatorId) === 'exterior' || context.edgeRank(targetId) === 'exterior') {
        return null;
    }

    const instigatorData = context.getInteriorWithId(instigatorId);
    // The bisector direction names the side the bisector sits on;
    // the edge to split is the parent on the *opposite* side.
    const opposite = direction === SkeletonDirection.Clockwise
        ? SkeletonDirection.Widdershins : SkeletonDirection.Clockwise;
    const edgeToSplit = context.parentEdge(targetId, opposite);

    return generateSplitEvent(instigatorData, edgeToSplit, context);
}

export function generateSplitEventFromTheEdgeItself(instigatorId: number, targetId: number, context: StraightSkeletonSolverContext): CollisionEvent | null {
    const edgeToSplit = context.getEdgeWithId(targetId);
    const instigatorData = context.getInteriorWithId(instigatorId);

    const edgeSplitRay = context.projectRay(edgeToSplit);
    const instigatorRay = context.projectRayInterior(instigatorData);

    const initialIntersectionTest = intersectRays(instigatorRay, edgeSplitRay);
    if (initialIntersectionTest[2] !== 'converging') {
        // We expect now to handle the "near miss" scenarios via the intersections of the bisectors themselves.
        return null;
    }

    // --- Path 1: Direct-strike offset ---
    const directResult = findOffsetByDirectStrike(instigatorData, edgeToSplit, initialIntersectionTest, context);
    if (directResult !== null) {
        if (!context.validateSplitReachesEdge(instigatorId, targetId, directResult.offsetDistance)) {
            complexLog.debug('Collide creates invalid split', directResult, instigatorId, targetId, context)
        } else {
            return {
                intersectionData: directResult.intersectionData,
                offsetDistance: directResult.offsetDistance,
                collidingEdges: [instigatorId, targetId],
                eventType: 'interiorAgainstExterior',
                position: directResult.position
            };
        }
    }

    // --- Path 2: Incenter fallback ---

    // Guards — only needed before incenter path
    const isBehindEdge = crossProduct(context.getEdgeWithInterior(instigatorData).basisVector, edgeToSplit.basisVector) > 0;
    if (isBehindEdge) {
        return null;
    }

    const {
        clockwise: instigatorClockwiseParent,
        widdershins: instigatorWiddershinsParent
    } = context.parentEdges(instigatorData.id);
    const clockwiseSpan = context.clockwiseSpanExcludingAccepted(instigatorClockwiseParent, edgeToSplit);
    const widdershinsSpan = context.clockwiseSpanExcludingAccepted(edgeToSplit, instigatorWiddershinsParent);
    if (Math.min(clockwiseSpan, widdershinsSpan) < 2) {
        return null;
    }

    const incenterResult = findOffsetViaIncenter(instigatorData, edgeToSplit, context);
    if (incenterResult === null) {
        return null;
    }

    if (!context.validateSplitReachesEdge(instigatorId, targetId, incenterResult.offsetDistance)) {
        return null;
    }

    return {
        position: incenterResult.position,
        intersectionData: incenterResult.intersectionData,
        collidingEdges: [instigatorId, targetId],
        offsetDistance: incenterResult.offsetDistance,
        eventType: 'interiorAgainstExterior'
    };
}
