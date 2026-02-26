import {
    CollisionEvent,
    InteriorEdge, PolygonEdge,
    RayProjection,
    StraightSkeletonSolverContext
} from "@/algorithms/straight-skeleton/types";
import {
    addVectors,
    makeBisectedBasis,
    projectFromPerpendicular,
    scaleVector
} from "@/algorithms/straight-skeleton/core-functions";
import {intersectRays} from "@/algorithms/straight-skeleton/intersection-edges";
import {makeOffsetDistance } from "@/algorithms/straight-skeleton/collision-helpers";

/**
 * Code paths to add:
 *
 * 1. Handling the potential edge split.
 * 2. Finding an edge split via the widdershins bisector DONE
 * 3. Finding an edge split via the clockwise bisector DONE
 * 4. Finding an edge split via the edge itself
 * */
export function generateSplitEvent(instigatorData: InteriorEdge, edgeToSplit: PolygonEdge, bisectorOfSplittingEdge: PolygonEdge, ray2ForTempNode: RayProjection, context: StraightSkeletonSolverContext): CollisionEvent | null{

    // ray1 is always reversed from the instigator's clockwise parent
    const instigatorClockwiseParent = context.clockwiseParent(instigatorData);
    const ray1ForTempNode = context.projectRayReversed(instigatorClockwiseParent)

    // ray2 is supplied by the caller, to find the temporary intersection with the splitting edge
    const [ray1Length, _, intersectionResult] = intersectRays(ray1ForTempNode, ray2ForTempNode)
    if (intersectionResult !== 'converging'){
        throw new Error("Exterior edges for finding temp node did not yield a converging result.")
    }
    const tempNodePosition = addVectors(ray1ForTempNode.sourceVector, scaleVector(ray1ForTempNode.basisVector, ray1Length));
    const bisectorBSource = context.findSource(bisectorOfSplittingEdge.id)

    // Perform incenter computation using the temporary node
    const tempBasis = makeBisectedBasis(instigatorClockwiseParent.basisVector, ray2ForTempNode.basisVector);
    const incenterRay1 = context.projectRayInterior(instigatorData);
    const incenterRay2: RayProjection = {sourceVector: tempNodePosition, basisVector: tempBasis};

    const intersectionData = intersectRays(incenterRay1, incenterRay2);
    const [incenterLengthRay1] = intersectionData;

    // Check these edges really collide
    const offsetDistance = makeOffsetDistance(instigatorData, context, incenterRay1, incenterLengthRay1);
    const projectionAlongBisectorB = projectFromPerpendicular(bisectorOfSplittingEdge.basisVector, edgeToSplit.basisVector, offsetDistance);
    const vertexLocationAtGivenOffset = addVectors(bisectorBSource.position, scaleVector(bisectorOfSplittingEdge.basisVector, projectionAlongBisectorB));
    const rayToCheckCollisionIsReal: RayProjection = {sourceVector: vertexLocationAtGivenOffset, basisVector: edgeToSplit.basisVector};

    const validationResult = intersectRays(incenterRay1, rayToCheckCollisionIsReal)
    if (validationResult[2] !== 'converging'){
        // TODO: add debug logging
        return null;
    }

    const position = addVectors(incenterRay1.sourceVector, addVectors(incenterRay1.sourceVector, scaleVector(incenterRay1.basisVector, incenterLengthRay1)));

    return {
        position,
        intersectionData,
        collidingEdges: [instigatorData.id, edgeToSplit.id],
        offsetDistance,
        eventType: 'interiorAgainstExterior'
    }
}

export function generateSplitEventViaWiddershinBisector(instigatorId: number, targetId: number, context: StraightSkeletonSolverContext): CollisionEvent | null {

    // function assumes we've located split via the widdershins bisector
    if (context.edgeRank(instigatorId) === 'exterior' || context.edgeRank(targetId) === 'exterior'){
        return null;
    }

    // TODO: check instigatorId is reflex??
    const instigatorData = context.getInteriorWithId(instigatorId);
    const bisectorB = context.getEdgeWithId(targetId);

    const edgeToSplit = context.clockwiseParent(context.getInteriorWithId(targetId))
    const targetNodeOfSplittingEdge = context.graph.nodes[edgeToSplit.target!];
    const ray2ForTempNode: RayProjection = {sourceVector: targetNodeOfSplittingEdge.position, basisVector: scaleVector(edgeToSplit.basisVector, -1)}

    return generateSplitEvent(instigatorData, edgeToSplit, bisectorB, ray2ForTempNode,context)
}

export function generateSplitEventViaClockwiseBisector(instigatorId: number, targetId: number, context: StraightSkeletonSolverContext): CollisionEvent | null {
    // function assumes we've located split via the widdershins bisector
    if (context.edgeRank(instigatorId) === 'exterior' || context.edgeRank(targetId) === 'exterior'){
        return null;
    }

    // TODO: check instigatorId is reflex??
    const instigatorData = context.getInteriorWithId(instigatorId);
    const bisectorB = context.getEdgeWithId(targetId);

    const edgeToSplit = context.widdershinsParent(context.getInteriorWithId(targetId))
    const sourceNodeOfSplittingEdge = context.findSource(edgeToSplit.id);
    const ray2ForTempNode: RayProjection = {sourceVector: sourceNodeOfSplittingEdge.position, basisVector: edgeToSplit.basisVector}

    return generateSplitEvent(instigatorData, edgeToSplit, bisectorB, ray2ForTempNode,context)
}

// TODO: Diagrammatic Analysis of this scenario to prove robustness. I think the only catch is we need to also check the projection of the opposite bisector, at the found offset, before we sign off on the collision.
export function generateSplitEventFromTheEdgeItself(instigatorId: number, targetId: number, context: StraightSkeletonSolverContext): CollisionEvent | null{
    const edgeToSplit = context.getEdgeWithId(targetId);
    const instigatorData = context.getInteriorWithId(instigatorId);

    const edgeSplitRay = context.projectRay(edgeToSplit)
    const instigatorRay = context.projectRayInterior(instigatorData);

    const initialIntersectionTest = intersectRays(instigatorRay, edgeSplitRay);
    if (initialIntersectionTest[2] !== 'converging'){
        // We expect now to handle the "near miss" scenarios via the intersections of the bisectors themselves.
        return null;
    }

    const clockwiseResult = generateSplitEventViaClockwiseBisector(instigatorId, targetId, context);

    if (clockwiseResult !== null) {
        const {offsetDistance } = clockwiseResult;
        const sourceNode = context.findSource(targetId);
        const widdershinsBisectorId = sourceNode.outEdges.find(edgeId => context.edgeRank(edgeId) === 'primary');
        if (widdershinsBisectorId === undefined){
            throw new Error("Widdershins bisector could not be found on exterior edge's source");
        }
        const bisectorData = context.getInteriorWithId(widdershinsBisectorId);
        const bisectorRay = context.projectRayInterior(bisectorData)

        const exteriorVertexProjection = projectFromPerpendicular(bisectorRay.basisVector, edgeToSplit.basisVector, offsetDistance);
        const exteriorVertexPosition = addVectors(sourceNode.position, scaleVector(bisectorRay.basisVector, exteriorVertexProjection));
        const validationRay : RayProjection = {sourceVector: exteriorVertexPosition, basisVector: edgeToSplit.basisVector};
        const widdershinValidation = intersectRays(validationRay, instigatorRay)
        if (widdershinValidation[2] !== 'converging'){
            return null;
        }
    }

    return clockwiseResult;
}