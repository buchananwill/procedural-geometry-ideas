import {
    CollisionEvent, CollisionType,
    IntersectionResult,
    InteriorEdge,
    PolygonEdge,
    RayProjection,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {unitsToIntersection} from "@/algorithms/straight-skeleton/intersection-edges";
import {
    addVectors,
    areEqual,
    crossProduct, dotProduct,
    makeBisectedBasis,
    normalize, projectFromPerpendicular, projectToPerpendicular,
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

    const cwParent = context.clockwiseParent(iEdge);
    const wsParent = context.widdershinsParent(iEdge);

    // Cannot collide with own parent
    if (cwParent.id === eEdge.id || wsParent.id === eEdge.id) {
        return null;
    }

    const ray1 = context.projectRayInterior(iEdge);
    const ray2 = context.projectRay(eEdge);

    const intersectionData = unitsToIntersection(ray1, ray2);
    const [alongRay1, _alongRay2, resultType] = intersectionData;

    const offsetAtCollision = makeOffsetDistance(iEdge, context, ray1, alongRay1);

    // --- Direct hit path: bisector ray converges with the exterior edge line ---
    if (resultType === 'converging') {
        return validateDirectHitCollision(iEdge, eEdge, context, ray1, intersectionData, offsetAtCollision, wsParent);
    }

    // --- Fallback path: check via endpoint bisectors of the exterior edge ---
    return checkEndpointBisectorFallback(iEdge, eEdge, context, ray1, cwParent);
}

/**
 * Direct hit path: the bisector ray converges with the exterior edge line.
 * Performs triangle validation, offset sign check, and wavefront boundary check.
 */
function validateDirectHitCollision(
    iEdge: InteriorEdge,
    eEdge: PolygonEdge,
    context: StraightSkeletonSolverContext,
    ray1: RayProjection,
    intersectionData: IntersectionResult,
    offsetAtCollision: number,
    wsParent: PolygonEdge,
): CollisionEvent | null {

    // Triangle validation: make rays from vertex source with widdershins parent basis,
    // and intersected exterior edge with its reverse basis from its target.
    const widdershinsParentRay: RayProjection = {
        sourceVector: context.findSource(iEdge.id).position,
        basisVector: wsParent.basisVector
    }
    const exteriorCollisionRay: RayProjection = {
        sourceVector: context.graph.nodes[eEdge.target!].position,
        basisVector: scaleVector(eEdge.basisVector, -1)
    }
    const [alongParent] = unitsToIntersection(widdershinsParentRay, exteriorCollisionRay);
    const triangleOtherVertex = addVectors(widdershinsParentRay.sourceVector, scaleVector(widdershinsParentRay.basisVector, alongParent))
    const triangleOtherBisector = makeBisectedBasis(eEdge.basisVector, scaleVector(wsParent.basisVector, -1))
    const otherRay: RayProjection = {sourceVector: triangleOtherVertex, basisVector: triangleOtherBisector};

    const intermediateIntersection = unitsToIntersection(ray1, otherRay)
    const [alongOriginalInterior, _other, resultTypeFinal] = intermediateIntersection;
    if (resultTypeFinal !== 'converging') {
        // Non-reflex angle — no valid collision
        return null;
    }

    const collisionOffsetIfValid = projectToPerpendicular(ray1.basisVector, widdershinsParentRay.basisVector, alongOriginalInterior)
    if (collisionOffsetIfValid <= 0) {
        return null;
    }

    // Wavefront boundary deep check
    if (!isWithinWavefrontBoundary(eEdge, context, ray1, offsetAtCollision)) {
        return null;
    }

    return {
        collidingEdges: [iEdge.id, eEdge.id],
        intersectionData,
        offsetDistance: collisionOffsetIfValid,
        position: addVectors(ray1.sourceVector, scaleVector(ray1.basisVector, alongOriginalInterior)),
        eventType: "interiorAgainstExterior"
    }
}

/**
 * Fallback path: the bisector ray doesn't converge with the exterior edge line directly,
 * but may still collide because the topology brings them together as the polygon shrinks.
 *
 * Tests the bisector against the primary bisectors at each endpoint of the exterior edge.
 * If either converges, computes the split point where the perpendicular distance from the
 * bisector to its own parent edges equals the perpendicular distance to the exterior edge.
 */
function checkEndpointBisectorFallback(
    iEdge: InteriorEdge,
    eEdge: PolygonEdge,
    context: StraightSkeletonSolverContext,
    ray1: RayProjection,
    cwParent: PolygonEdge,
): CollisionEvent | null {
    const {graph} = context;
    const numExt = graph.numExteriorNodes;

    // Get the primary bisectors at the exterior edge's source and target vertices
    const sourceBisectorId = graph.nodes[eEdge.source].outEdges.find(id => id >= numExt);
    const targetBisectorId = graph.nodes[eEdge.target!].outEdges.find(id => id >= numExt);
    if (sourceBisectorId === undefined || targetBisectorId === undefined) {
        return null;
    }

    // Test the interior bisector ray against each endpoint bisector
    const srcBisectorRay = context.projectRayInterior(context.getInteriorWithId(sourceBisectorId));
    const tgtBisectorRay = context.projectRayInterior(context.getInteriorWithId(targetBisectorId));

    const srcResult = unitsToIntersection(ray1, srcBisectorRay);
    const tgtResult = unitsToIntersection(ray1, tgtBisectorRay);

    const srcConverges = srcResult[2] === 'converging';
    const tgtConverges = tgtResult[2] === 'converging';

    // If the bisector doesn't converge with either endpoint bisector, no indirect collision
    if (!srcConverges && !tgtConverges) {
        return null;
    }

    // Compute the equal-perpendicular-distance split point
    const splitResult = findEqualDistanceSplitPoint(iEdge, eEdge, context, ray1, cwParent);
    if (splitResult === null) {
        return null;
    }

    const {t, offset, position} = splitResult;

    // The endpoint bisector convergence must occur before the split point along ray1.
    // This confirms the bisector actually enters the exterior edge's wavefront territory
    // before reaching the split. If the convergence is further along ray1 than the split,
    // the split is geometrically invalid.
    const earliestEndpointHit = Math.min(
        srcConverges ? srcResult[0] : Infinity,
        tgtConverges ? tgtResult[0] : Infinity
    );
    if (earliestEndpointHit > t) {
        return null;
    }

    // Wavefront boundary deep check using the computed offset
    if (!isWithinWavefrontBoundary(eEdge, context, ray1, offset)) {
        return null;
    }

    // Construct synthetic intersection data for downstream consumers
    const relToEdgeSource = subtractVectors(position, graph.nodes[eEdge.source].position);
    const alongExterior = dotProduct(relToEdgeSource, eEdge.basisVector);
    const syntheticIntersectionData: IntersectionResult = [t, alongExterior, 'converging'];

    return {
        collidingEdges: [iEdge.id, eEdge.id],
        intersectionData: syntheticIntersectionData,
        offsetDistance: offset,
        position,
        eventType: "interiorAgainstExterior"
    }
}

/**
 * Finds the point along the bisector ray where the perpendicular distance to its own
 * parent edges equals the perpendicular distance to the target exterior edge.
 *
 * Returns the parameter t along ray1, the offset distance, and the position, or null
 * if no valid split point exists (parallel rates, behind origin, or non-positive offset).
 */
function findEqualDistanceSplitPoint(
    iEdge: InteriorEdge,
    eEdge: PolygonEdge,
    context: StraightSkeletonSolverContext,
    ray1: RayProjection,
    cwParent: PolygonEdge,
): {t: number, offset: number, position: Vector2} | null {
    const {graph} = context;

    // offset(t) = sourceOffset + offsetRate * t
    // This is the perpendicular distance from a point on the bisector to its parent edges
    const srcOffset = sourceOffsetDistance(iEdge, context);
    const offsetRate = crossProduct(ray1.basisVector, cwParent.basisVector);

    // d_ext(t) = d_ext_0 + d_ext_rate * t
    // This is the perpendicular distance from a point on the bisector to the exterior edge line
    const relSource = subtractVectors(ray1.sourceVector, graph.nodes[eEdge.source].position);
    const d_ext_0 = crossProduct(relSource, eEdge.basisVector);
    const d_ext_rate = crossProduct(ray1.basisVector, eEdge.basisVector);

    // Solve: sourceOffset + offsetRate * t = d_ext_0 + d_ext_rate * t
    const rateDiff = offsetRate - d_ext_rate;
    if (areEqual(rateDiff, 0)) {
        return null; // Rates are parallel — distances never cross
    }

    const t = (d_ext_0 - srcOffset) / rateDiff;
    if (t <= 0) {
        return null; // Behind the bisector origin
    }

    const offset = srcOffset + offsetRate * t;
    if (offset <= 0) {
        return null; // Non-positive offset means the collision is in the wrong direction
    }

    const position = addVectors(ray1.sourceVector, scaleVector(ray1.basisVector, t));
    return {t, offset, position};
}

/**
 * Validates that a collision point is within the shrunk wavefront of the exterior edge.
 * Advances the exterior edge's source and target vertices along their primary bisectors
 * to the collision offset, then checks that ray1 intersects within the resulting segment.
 */
function isWithinWavefrontBoundary(
    eEdge: PolygonEdge,
    context: StraightSkeletonSolverContext,
    ray1: RayProjection,
    offsetAtCollision: number,
): boolean {
    const {graph} = context;
    const numExt = graph.numExteriorNodes;
    const sourceBisectorId = graph.nodes[eEdge.source].outEdges.find(id => id >= numExt)!;
    const targetBisectorId = graph.nodes[eEdge.target!].outEdges.find(id => id >= numExt)!;

    const sourceBisectorBasis = context.getEdgeWithId(sourceBisectorId).basisVector;
    const tSource = projectFromPerpendicular(sourceBisectorBasis, eEdge.basisVector, offsetAtCollision);
    const advancedSource = addVectors(graph.nodes[eEdge.source].position, scaleVector(sourceBisectorBasis, tSource));
    const [, alongWfSource] = unitsToIntersection(ray1, {sourceVector: advancedSource, basisVector: eEdge.basisVector});

    const targetBisectorBasis = context.getEdgeWithId(targetBisectorId).basisVector;
    const tTarget = projectFromPerpendicular(targetBisectorBasis, eEdge.basisVector, offsetAtCollision);
    const advancedTarget = addVectors(graph.nodes[eEdge.target!].position, scaleVector(targetBisectorBasis, tTarget));
    const [, alongWfTarget] = unitsToIntersection(ray1, {
        sourceVector: advancedTarget,
        basisVector: scaleVector(eEdge.basisVector, -1)
    });

    return alongWfSource >= 0 && alongWfTarget >= 0;
}

function makeOffsetDistance(edge: InteriorEdge, context: StraightSkeletonSolverContext, ray: RayProjection, alongRay: number): number {
    const sourceOffset = sourceOffsetDistance(edge, context);
    const clockwiseParent = context.clockwiseParent(edge);
    const crossWithParent = crossProduct(ray.basisVector, clockwiseParent.basisVector);
    // const dotWithParent = dotProduct(ray.basisVector, clockwiseParent.basisVector);
    const deltaOffset = areEqual((crossWithParent), 0) ? 0 : projectToPerpendicular(ray.basisVector, clockwiseParent.basisVector, alongRay);

    return sourceOffset + deltaOffset;

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

    const offsetDistance = makeOffsetDistance(edgeA, context, ray1, alongRay1);
    const offsetTarget = makeOffsetDistance(edgeB, context, ray2, _alongRay2);

    const anyShared = checkSharedParents(edgeA.id, edgeB.id, context).includes(true);

    const eventType: CollisionType = !areEqual(offsetDistance, offsetTarget)
        ? 'phantomDivergentOffset'
        : anyShared
            ? 'interiorPair'
            : 'interiorNonAdjacent'
    ;

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

    if (event !== null && event.eventType != 'phantomDivergentOffset')
    {
        context.updateMinLength(edgeIdA, event.intersectionData[0])
        context.updateMinLength(edgeIdB, event.intersectionData[1])
    }

    return event;

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

function makeCollisionEventComparator(context: StraightSkeletonSolverContext) {

    function collisionEventComparator(e1: CollisionEvent, e2: CollisionEvent) {
        const diff = e1.offsetDistance - e2.offsetDistance;

        return diff;
        // if (!areEqual(diff, 0)) {
        //     return diff;
        // }
        //
        // if (e1.eventType !== e2.eventType) {
        //     return e1.eventType === 'interiorAgainstExterior' ? 1 : -1
        // }
        //
        // if (e1.eventType === 'interiorAgainstExterior') {
        //     return -1;
        // }
        //
        // const shareParent = (edge1: number, edge2: number) => {
        //     return checkSharedParents(edge1, edge2, context).includes(true);
        // }
        //
        // const [e1a, e1b] = e1.collidingEdges
        //
        // if (shareParent(e1a, e1b)) {
        //     return -1;
        // }
        //
        // const [e2a, e2b] = e2.collidingEdges;
        //
        // if (shareParent(e2a, e2b)) {
        //     return 1;
        // }
        //
        // return -1
    };

    return collisionEventComparator
}


export function createCollisionEvents(context: StraightSkeletonSolverContext): CollisionEvent[] {
    const comparator = makeCollisionEventComparator(context);

    const events: CollisionEvent[][] = [];

    const {graph} = context;

    for (const interiorEdge of graph.interiorEdges) {
        if (context.isAcceptedInterior(interiorEdge)) {
            continue;
        }

        const nextEvents: CollisionEvent[] = []
        events.push(nextEvents);

        for (const edge of graph.edges) {
            if (interiorEdge.id === edge.id || context.acceptedEdges[edge.id]) {
                continue;
            }
            const event = collideEdges(interiorEdge.id, edge.id, context)
            if (event !== null) {
                nextEvents.push(event);
            }

        }

        nextEvents.sort((e1, e2) => {
            return e1.offsetDistance - e2.offsetDistance; //Math.max(e1.intersectionData[0], e1.intersectionData[1]) - Math.max(e2.intersectionData[0], e2.intersectionData[1]);
        })

    }

    return events
        .filter(elist => elist.length > 0)
        .sort((list1, list2) => comparator(list1[0], list2[0]))
        .flatMap(list => list[0]);
}

