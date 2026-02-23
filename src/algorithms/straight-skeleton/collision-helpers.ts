import {
    CollisionEvent,
    InteriorEdge,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {unitsToIntersection} from "@/algorithms/straight-skeleton/intersection-edges";
import {
    addVectors, areEqual,
    crossProduct,
    normalize,
    scaleVector,
    subtractVectors
} from "@/algorithms/straight-skeleton/core-functions";
import {NO_COLLISION_RESULTS} from "@/algorithms/straight-skeleton/constants";

export function collisionDistanceFromBasisUnits(collidingChild: Vector2, units: number, clockwiseParentBasis: Vector2) {
    return units * crossProduct(collidingChild, clockwiseParentBasis);
}

export function sourceOffsetDistance(edge: InteriorEdge, context: StraightSkeletonSolverContext) {
    const edgeRank = context.edgeRank(edge.id);

    if (edgeRank === 'secondary') {
        const edgeSourceNode = context.findSource(edge.id);
        const clockwiseParent = context.clockwiseParent(edge);
        const parentSourceNode = context.findSource(clockwiseParent.id);
        const vectorToEdgeSource = subtractVectors(edgeSourceNode.position, parentSourceNode.position);
        const [basis, size] = normalize(vectorToEdgeSource);
        return collisionDistanceFromBasisUnits(basis, size, clockwiseParent.basisVector);
    }

    return 0;
}

/**
 * */
export function collideEdges(edgeA: InteriorEdge, edgeB: InteriorEdge, context: StraightSkeletonSolverContext): CollisionEvent | null {
    const ray1 = context.projectRayInterior(edgeA);
    const ray2 = context.projectRayInterior(edgeB);

    const intersectionData = unitsToIntersection(ray1, ray2);
    const [alongRay1, _alongRay2, resultType] = intersectionData;

    if (NO_COLLISION_RESULTS.includes(resultType)) {
        return null;
    }

    // Will be handled by other edge
    if (resultType === 'co-linear-from-2') {
        return null;
    }

    const sourceOffset = sourceOffsetDistance(edgeA, context);
    const dotWithParent = crossProduct(ray1.basisVector, context.clockwiseParent(edgeA).basisVector);
    const deltaOffset = areEqual((dotWithParent), 0) ? 0 : collisionDistanceFromBasisUnits(ray1.basisVector, alongRay1, context.clockwiseParent(edgeA).basisVector);
    const offsetDistance = sourceOffset + deltaOffset;

    return {
        offsetDistance,
        collidingEdges: [edgeA.id, edgeB.id],
        position: addVectors(scaleVector(ray1.basisVector, alongRay1), ray1.sourceVector),
        intersectionData
    }
}

export function createCollisionEvents(context: StraightSkeletonSolverContext): CollisionEvent[] {
    const events: CollisionEvent[] = [];

    const {graph} = context;

    for (const interiorEdge1 of graph.interiorEdges) {
        if (context.isAccepted(interiorEdge1)) {
            continue;
        }

        for (const interiorEdge2 of graph.interiorEdges) {
            if (interiorEdge1.id === interiorEdge2.id || context.isAccepted(interiorEdge2)) {
                continue;
            }
            const event = collideEdges(interiorEdge1, interiorEdge2, context)
            if (event !== null) {
                events.push(event);
            }
        }
    }

    events.sort((e1, e2) => {
        return e1.offsetDistance - e2.offsetDistance
    })

    return events;
}

