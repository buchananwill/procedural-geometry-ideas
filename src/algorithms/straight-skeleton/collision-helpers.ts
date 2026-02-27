import {
    AlgorithmStepInput,
    CollisionEvent,
    CollisionType,
    InteriorEdge,
    NO_COLLISION_SENTINEL,
    PolygonEdge,
    RayProjection,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {intersectRays} from "@/algorithms/straight-skeleton/intersection-edges";
import {
    addVectors,
    areEqual,
    crossProduct,
    normalize,
    projectToPerpendicular,
    scaleVector,
    subtractVectors
} from "@/algorithms/straight-skeleton/core-functions";
import {NO_COLLISION_RESULTS} from "@/algorithms/straight-skeleton/constants";
import {
    generateSplitEventFromTheEdgeItself,
    generateSplitEventViaClockwiseBisector,
    generateSplitEventViaWiddershinsBisector
} from "@/algorithms/straight-skeleton/generate-split-event";
import {createCollisions} from "@/algorithms/straight-skeleton/algorithm-complex-cases";

export function collisionDistanceFromBasisUnits(collidingChild: Vector2, units: number, clockwiseParentBasis: Vector2) {
    return units * crossProduct(collidingChild, clockwiseParentBasis);
}

export function sourceOffsetDistance(edge: InteriorEdge, context: StraightSkeletonSolverContext) {
    const edgeRank = context.edgeRank(edge.id);

    if (edgeRank === 'secondary') {
        const edgeSourceNode = context.findSource(edge.id);
        const clockwiseParent = context.clockwiseParent(edge);
        const parentSourceNode = context.findSource(clockwiseParent.id);
        const parentSourceToEdgeSource = subtractVectors(edgeSourceNode.position, parentSourceNode.position);
        const [basis, size] = normalize(parentSourceToEdgeSource);
        return projectToPerpendicular(basis, clockwiseParent.basisVector, size);
    }

    return 0;
}

export function collideInteriorAndExteriorEdge(iEdge: InteriorEdge, eEdge: PolygonEdge, context: StraightSkeletonSolverContext): CollisionEvent | null {

    // no need to test against accepted edges
    if (context.acceptedEdges[eEdge.id]) {
        return null;
    }

    if (context.isReflexEdge(iEdge)) {
        return generateSplitEventFromTheEdgeItself(iEdge.id, eEdge.id, context);
    }
    return null;


}

export function makeOffsetDistance(edge: InteriorEdge, context: StraightSkeletonSolverContext, ray: RayProjection, alongRay: number): number {
    const sourceOffset = sourceOffsetDistance(edge, context);
    const crossWithParent = crossProduct(ray.basisVector, context.clockwiseParent(edge).basisVector);
    const deltaOffset = areEqual((crossWithParent), 0) ? 0 : collisionDistanceFromBasisUnits(ray.basisVector, alongRay, context.clockwiseParent(edge).basisVector);
    return sourceOffset + deltaOffset;

}

/**
 * */
export function collideInteriorEdges(edgeA: InteriorEdge, edgeB: InteriorEdge, context: StraightSkeletonSolverContext): CollisionEvent | null {
    const ray1 = context.projectRayInterior(edgeA);
    const ray2 = context.projectRayInterior(edgeB);


    const intersectionData = intersectRays(ray1, ray2);
    const [alongRay1, _alongRay2, resultType] = intersectionData;

    if (NO_COLLISION_RESULTS.includes(resultType)) {
        return null;
    }

    // Will be handled by other edge
    if (resultType === 'co-linear-from-2') {
        return null;
    }


    const offsetDistance = makeOffsetDistance(edgeA, context, ray1, alongRay1);
    const offsetTarget = makeOffsetDistance(edgeB, context, ray2, _alongRay2);

    const anyShared = checkSharedParents(edgeA.id, edgeB.id, context).includes(true);

    const eventType: CollisionType = !areEqual(offsetDistance, offsetTarget) || offsetDistance <= 0
        ? 'phantomDivergentOffset'
        : anyShared
            ? 'interiorPair'
            : 'interiorNonAdjacent';

    // If the edgeA is a reflex edge, we're looking to generate a split event.
    const isReflexA = context.isReflexEdge(edgeA)
    const isReflexB = context.isReflexEdge(edgeB)
    if (isReflexA || isReflexB) {
        const reflexEdge = isReflexA ? edgeA : edgeB;
        const otherEdge = isReflexA ? edgeB : edgeA;
        const widdershinsEvent = generateSplitEventViaWiddershinsBisector(reflexEdge.id, otherEdge.id, context);
        const clockwiseEvent = generateSplitEventViaClockwiseBisector(reflexEdge.id, otherEdge.id, context);
        const widdershinsValid = widdershinsEvent !== null && widdershinsEvent.offsetDistance > 0 && (widdershinsEvent.offsetDistance < offsetDistance || eventType === 'phantomDivergentOffset')
        const clockwiseValid =  clockwiseEvent !== null && clockwiseEvent.offsetDistance > 0 && (clockwiseEvent.offsetDistance < offsetDistance || eventType === 'phantomDivergentOffset')
        if (!clockwiseValid && widdershinsValid) {
            return widdershinsEvent;
        }

        if (!widdershinsValid&& clockwiseValid) {
            return clockwiseEvent;
        }

        if (widdershinsValid && clockwiseValid) {
            return widdershinsEvent.offsetDistance < clockwiseEvent.offsetDistance ? widdershinsEvent : clockwiseEvent;
        }


    }


    return {
        offsetDistance: Math.max(offsetTarget, offsetDistance),
        collidingEdges: [edgeA.id, edgeB.id],
        position: addVectors(scaleVector(ray1.basisVector, alongRay1), ray1.sourceVector),
        intersectionData,
        eventType
    }
}

export function collideEdges(edgeIdA: number, edgeIdB: number, context: StraightSkeletonSolverContext): CollisionEvent | null {
    const rankA = context.edgeRank(edgeIdA);
    const rankB = context.edgeRank(edgeIdB);

    let event: CollisionEvent | null = null;
    if (context.isAccepted(edgeIdA) || context.isAccepted(edgeIdB)) {
        return event;
    }

    if (rankA === 'exterior') {
        return event
    }
    const interiorEdge = context.getInteriorWithId(edgeIdA);

    if (rankB === 'exterior') {
        event = collideInteriorAndExteriorEdge(interiorEdge, context.getEdgeWithId(edgeIdB), context)
    } else {
        event = collideInteriorEdges(interiorEdge, context.getInteriorWithId(edgeIdB), context)
    }

    // if (event !== null && event.eventType != 'phantomDivergentOffset') {
    //     context.updateMinLength(edgeIdA, event.intersectionData[0])
    //     context.updateMinLength(edgeIdB, event.intersectionData[1])
    // }

    return event;

}

/**
 * Cache-aware wrapper around collideEdges.
 * Checks the context's collisionCache first; on miss, computes via
 * collideEdges and stores the result (using NO_COLLISION_SENTINEL for null).
 */
export function findOrComputeCollision(
    edgeIdA: number,
    edgeIdB: number,
    context: StraightSkeletonSolverContext
): CollisionEvent | null {
    // Fresh acceptance check — prevents returning stale cached results
    // for edges accepted since the cache entry was written.
    if (context.isAccepted(edgeIdA) || context.isAccepted(edgeIdB)) {
        return null;
    }

    const cache = context.collisionCache;
    const innerMap = cache.get(edgeIdA);
    if (innerMap !== undefined) {
        const cached = innerMap.get(edgeIdB);
        if (cached !== undefined) {
            return cached === NO_COLLISION_SENTINEL ? null : cached;
        }
    }

    // Miss — compute and store
    const result = collideEdges(edgeIdA, edgeIdB, context);

    let targetMap = cache.get(edgeIdA);
    if (targetMap === undefined) {
        targetMap = new Map();
        cache.set(edgeIdA, targetMap);
    }
    targetMap.set(edgeIdB, result ?? NO_COLLISION_SENTINEL);

    return result;
}

export function checkSharedParents(edge1: number, edge2: number, context: StraightSkeletonSolverContext): [boolean, boolean, boolean, boolean] {
    const edge1Data = context.getInteriorWithId(edge1);
    const edge2Data = context.getInteriorWithId(edge2);

    const e1CwParent = context.clockwiseParent(edge1Data)
    const e1WsParent = context.widdershinsParent(edge1Data);

    const e2CwParent = context.clockwiseParent(edge2Data);
    const e2WsParent = context.widdershinsParent(edge2Data);

    return [
        e1CwParent.id === e2WsParent.id,
        e1WsParent.id === e2CwParent.id,
        e1WsParent.id === e2CwParent.id,
        e1CwParent.id === e2WsParent.id,
    ]
}
