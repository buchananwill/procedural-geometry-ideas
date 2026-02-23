import {
    CollisionEvent,
    InteriorEdge, PolygonEdge, RayProjection,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {unitsToIntersection} from "@/algorithms/straight-skeleton/intersection-edges";
import {
    addVectors, areEqual,
    crossProduct, makeBisectedBasis,
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

export function collideInteriorAndExteriorEdge(iEdge: InteriorEdge, eEdge: PolygonEdge, context: StraightSkeletonSolverContext): CollisionEvent | null {

    // no need to test against accepted edges
    if (context.acceptedEdges[eEdge.id]){
        return null;
    }

    const cwParent = context.clockwiseParent(iEdge);
    const wsParent = context.widdershinsParent(iEdge);

    // Cannot collide with own parent
    if (cwParent.id === eEdge.id || wsParent.id === eEdge.id){
        return null;
    }

    const ray1 = context.projectRayInterior(iEdge);
    const ray2 = context.projectRay(eEdge);

    const intersectionData = unitsToIntersection(ray1, ray2);
    const [alongRay1, _alongRay2, resultType] = intersectionData;

    // Only meaningful result for collisions with exterior edges
    if (resultType !== 'converging'){
        return null;
    }

    // make rays from vertex source with widdershins parent basis, and intersected exterior edge reverse basis from target.
    const widdershinsParentRay: RayProjection = {sourceVector: context.findSource(iEdge.id).position, basisVector: wsParent.basisVector}
    const exteriorCollisionRay: RayProjection = {sourceVector: context.graph.nodes[eEdge.target!].position, basisVector: scaleVector(eEdge.basisVector, -1)}
    const [alongParent] = unitsToIntersection(widdershinsParentRay, exteriorCollisionRay);
    const triangleOtherVertex = addVectors(widdershinsParentRay.sourceVector, scaleVector(widdershinsParentRay.basisVector, alongParent))
    const triangleOtherBisector = makeBisectedBasis(eEdge.basisVector, scaleVector(wsParent.basisVector, -1))
    const otherRay: RayProjection = {sourceVector: triangleOtherVertex, basisVector: triangleOtherBisector};

    const [alongOriginalInterior, _other, resultTypeFinal] = unitsToIntersection(ray1, otherRay)
    if (resultTypeFinal !== 'converging'){
        throw new Error("Expected converging result from constructing triangle incenter")
    }

    const finalCollisionOffset = collisionDistanceFromBasisUnits(ray1.basisVector, alongOriginalInterior, cwParent.basisVector)

    const sourceOffset = sourceOffsetDistance(iEdge, context);

    return {
        collidingEdges: [iEdge.id, eEdge.id],
        intersectionData,
        offsetDistance: sourceOffset + finalCollisionOffset,
        position: addVectors(ray1.sourceVector, scaleVector(ray1.basisVector, alongOriginalInterior))
    }
}

/**
 * */
export function collideInteriorEdges(edgeA: InteriorEdge, edgeB: InteriorEdge, context: StraightSkeletonSolverContext): CollisionEvent | null {
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

export function collideEdges(edgeIdA: number, edgeIdB: number, context: StraightSkeletonSolverContext): CollisionEvent | null {
    const rankA = context.edgeRank(edgeIdA);
    const rankB = context.edgeRank(edgeIdB);

    if (rankA === 'exterior'){
        return null
    }
    const interiorEdge = context.getInteriorWithId(edgeIdA);

    if (rankB !== 'exterior'){
        return collideInteriorEdges(interiorEdge, context.getInteriorWithId(edgeIdB), context)
    }

    return collideInteriorAndExteriorEdge(interiorEdge, context.getEdgeWithId(edgeIdB), context)
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
            const event = collideInteriorEdges(interiorEdge1, interiorEdge2, context)
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

