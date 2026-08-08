import {
    CollisionEvent,
    CollisionType,
    InteriorEdge,
    NO_COLLISION_SENTINEL,
    PolygonEdge,
    RayProjection,
    SkeletonDirection,
    StraightSkeletonSolverContext,
    Vector2
} from "./types";
import {intersectRays} from "./intersection-edges";
import {
    areEqual,
    crossProduct,
    findPositionAlongRay,
    normalize,
    projectToPerpendicular,
    subtractVectors
} from "./core-functions";
import {NO_COLLISION_RESULTS} from "./constants";
import {
    generateSplitEventFromTheEdgeItself,
    generateSplitEventViaBisector,
} from "./generate-split-event";

/**
 * Pick the best (lowest offset) non-phantom/non-outOfBounds collision.
 * Falls back to the lowest-offset collision of any type if none qualify.
 */
export function bestNonPhantomCollision(events: CollisionEvent[]): CollisionEvent | undefined {
    const byOffset = (a: CollisionEvent, b: CollisionEvent) => a.offsetDistance - b.offsetDistance;
    return events
            .filter(e => e.eventType !== 'phantomDivergentOffset' && e.eventType !== 'outOfBounds')
            .sort(byOffset)[0]
        ?? events.sort(byOffset)[0];
}

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

/** How much offset each unit travelled along this edge's ray buys its clockwise parent. */
function offsetRate(edge: InteriorEdge, ray: RayProjection, context: StraightSkeletonSolverContext): number {
    return crossProduct(ray.basisVector, context.clockwiseParent(edge).basisVector);
}

/**
 * Where two edges running head-on along the same line actually meet.
 *
 * `intersectRays` reports a head-on pair as the full separation along both rays — each ray
 * reaching the other's source — which is twice the event and puts the collision point on top
 * of an existing node. They really meet where their offsets agree, which splits the
 * separation in proportion to how fast each converts travel into offset. Returns `null` when
 * the two rates cancel, leaving no offset at which they agree.
 */
function meetHeadOn(
    edgeA: InteriorEdge,
    edgeB: InteriorEdge,
    ray1: RayProjection,
    ray2: RayProjection,
    separation: number,
    context: StraightSkeletonSolverContext,
): [number, number] | null {
    const rateA = offsetRate(edgeA, ray1, context);
    const rateB = offsetRate(edgeB, ray2, context);
    const combinedRate = rateA + rateB;

    if (areEqual(combinedRate, 0)) {
        return null;
    }

    const sourceOffsetA = sourceOffsetDistance(edgeA, context);
    const sourceOffsetB = sourceOffsetDistance(edgeB, context);
    const alongA = (sourceOffsetB - sourceOffsetA + separation * rateB) / combinedRate;

    return [alongA, separation - alongA];
}

/**
 * */
export function collideInteriorEdges(edgeA: InteriorEdge, edgeB: InteriorEdge, context: StraightSkeletonSolverContext): CollisionEvent[] {
    const ray1 = context.projectRayInterior(edgeA);
    const ray2 = context.projectRayInterior(edgeB);


    const intersectionData = intersectRays(ray1, ray2);
    const [rawAlongRay1, rawAlongRay2, resultType] = intersectionData;

    if (NO_COLLISION_RESULTS.includes(resultType)) {
        return [];
    }

    // Will be handled by other edge
    if (resultType === 'co-linear-from-2') {
        return [];
    }

    const headOnMeeting = resultType === 'head-on'
        ? meetHeadOn(edgeA, edgeB, ray1, ray2, rawAlongRay1, context)
        : null;

    if (resultType === 'head-on' && headOnMeeting === null) {
        return [];
    }

    const [alongRay1, _alongRay2] = headOnMeeting ?? [rawAlongRay1, rawAlongRay2];

    const offsetDistance = makeOffsetDistance(edgeA, context, ray1, alongRay1);
    const offsetTarget = makeOffsetDistance(edgeB, context, ray2, _alongRay2);

    const anyShared = checkSharedParents(edgeA.id, edgeB.id, context).includes(true);

    const eventType: CollisionType = !areEqual(offsetDistance, offsetTarget) || offsetDistance <= 0
        ? 'phantomDivergentOffset'
        : anyShared
            ? 'interiorPair'
            : 'interiorNonAdjacent';

    // If the edgeA is a reflex edge, we're looking to generate a split event.
    const events: CollisionEvent[] = [];
    const canGenerateSplits = context.isReflexEdge(edgeA)
        && context.edgeRank(edgeA.id) === 'primary';
    // && context.edgeRank(edgeB.id) === 'primary';
    if (canGenerateSplits) {
        const reflexEdge = edgeA;
        const otherEdge = edgeB;
        const widdershinsEvent = generateSplitEventViaBisector(reflexEdge.id, otherEdge.id, SkeletonDirection.Widdershins, context);
        const clockwiseEvent = generateSplitEventViaBisector(reflexEdge.id, otherEdge.id, SkeletonDirection.Clockwise, context);
        if (widdershinsEvent) {
            events.push(widdershinsEvent)
        }

        if (clockwiseEvent) {
            events.push(clockwiseEvent);
        }

    }

    events.push({
        offsetDistance: offsetDistance,
        collidingEdges: [edgeA.id, edgeB.id],
        position: findPositionAlongRay(ray1, alongRay1),
        intersectionData,
        eventType
    })

    return events
}

export function collideEdges(edgeIdA: number, edgeIdB: number, context: StraightSkeletonSolverContext): CollisionEvent[] {
    const rankA = context.edgeRank(edgeIdA);
    const rankB = context.edgeRank(edgeIdB);

    const events: CollisionEvent[] = [];
    if (context.isAccepted(edgeIdA) || context.isAccepted(edgeIdB)) {
        return [];
    }

    if (rankA === 'exterior') {
        return []
    }
    const interiorEdge = context.getInteriorWithId(edgeIdA);

    if (rankB === 'exterior') {
        const event = collideInteriorAndExteriorEdge(interiorEdge, context.getEdgeWithId(edgeIdB), context)
        if (event) {
            events.push(event)
        }
    } else {
        events.push(...collideInteriorEdges(interiorEdge, context.getInteriorWithId(edgeIdB), context));
    }

    events.forEach(e => {
        if (interiorEdge.maxOffset && e.offsetDistance > interiorEdge.maxOffset) {
            e.eventType = 'outOfBounds';
        }

    })

    return events;

}

/**
 * Cache-aware wrapper around collideEdges.
 * Checks the context's collisionCache first; on miss, computes via
 * collideEdges and stores the result (using NO_COLLISION_SENTINEL for null).
 * IMPORTANT: Reflex bisectors cannot cache their results, because they need to re-evaluate for split validity if the
 * rate of shrinkage of an edge changes (after a collapse event)
 */
export function findOrComputeCollision(
    edgeIdA: number,
    edgeIdB: number,
    context: StraightSkeletonSolverContext
): CollisionEvent[] {
    // Fresh acceptance check — prevents returning stale cached results
    // for edges accepted since the cache entry was written.
    if (context.isAccepted(edgeIdA) || context.isAccepted(edgeIdB)) {
        return [];
    }

    const isReflex = context.isReflexEdge(context.getInteriorWithId(edgeIdA))

    if (isReflex){
        return collideEdges(edgeIdA, edgeIdB, context);
    }

    const cache = context.collisionCache;
    const innerMap = cache.get(edgeIdA);
    if (innerMap !== undefined) {
        const cached = innerMap.get(edgeIdB);
        if (cached !== undefined) {
            return cached === NO_COLLISION_SENTINEL ? [] : cached;
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
    const {clockwise: e1CwParent, widdershins: e1WsParent} = context.parentEdges(edge1);
    const {clockwise: e2CwParent, widdershins: e2WsParent} = context.parentEdges(edge2);

    return [
        e1CwParent.id === e2WsParent.id,
        e1WsParent.id === e2CwParent.id,
        e1WsParent.id === e2CwParent.id,
        e1CwParent.id === e2WsParent.id,
    ]
}
