import {
    Arrival,
    CollisionEvent,
    InteriorEdge, IntersectionResult, PolygonEdge,
    RayProjection,
    SkeletonDirection,
    SplitOffsetResult,
    StraightSkeletonSolverContext,
    Vector2
} from "./types";
import {complexLog, splitLog} from "./logger";
import {
    areEqual, crossProduct, dotProduct,
    findPositionAlongRay,
    makeRay,
    negateVector,
    rotateCw90,
    subtractVectors,
} from "./core-functions";
import {FLOATING_POINT_EPSILON} from "./constants";
import {intersectRays} from "./intersection-edges";
import {sourceOffsetDistance, timeOf} from "./collision-helpers";

/**
 * The perpendicular distance of `point` from the supporting LINE of `edge`, measured on the inward
 * side — `dot(rotateCw90(basis), point − A)` for any `A` on the line.
 *
 * The same reading as `makeOffsetDistance`'s rate: for a point travelling along a unit direction `d`
 * this distance changes at `cross(d, basis)` per unit travelled, which is exactly the quantity the
 * offset machinery already prices with.
 */
function distanceFromEdgeLine(
    point: Vector2,
    edge: PolygonEdge,
    context: StraightSkeletonSolverContext,
): number {
    const normal = rotateCw90(edge.basisVector);
    const fromEdge = subtractVectors(point, context.sourcePosition(edge.id));
    return normal.x * fromEdge.x + normal.y * fromEdge.y;
}

/**
 * Where along the instigator's ray its own wavefront clock reads the same as the split edge's — the
 * split event, solved in closed form (W-spec W21, arc journal decision 115).
 *
 * THE ONE SITE WHERE UNIT-WEIGHT BIT-IDENTITY IS NOT ACHIEVABLE, and it is named as such. This
 * replaced a construction that built a temporary node on whichever parent was more perpendicular to
 * the split edge, bisected there with `makeBisectedBasis`, and intersected two rays. That
 * construction reaches THE SAME POINT by different arithmetic, so its unit-weight bits are not
 * these bits; arc decision 115 amends 112(d) to make this the single named exception, with the
 * movement measured and attributed pin by pin. Movement is bounded by ulps BY CONSTRUCTION — same
 * point, different route — so a pin that moves by more than a few ulps is a defect in this form and
 * not an attribution. Keeping the old construction "when both weights are one" was rejected: that is
 * a branch on unit weights, which W-spec W36 forbids on journal decision 105's ground.
 *
 * THE FORM. With `D₀` the instigator's source distance from its own clockwise parent's line, `E₀`
 * its source distance from the split edge's line, `r = cross(d, c)` the rate against the clockwise
 * parent and `q = −cross(d, e)` the rate of approach to the split edge:
 *
 *     D(s) = D₀ + s·r          (distance from the clockwise parent's line)
 *     E(s) = E₀ − s·q          (distance from the split edge's line)
 *     equi-time:  D(s)/w_cw = E(s)/w_e
 *     s = (E₀·w_cw − D₀·w_e) / (r·w_e + q·w_cw)
 *
 * and the arrival is `{D₀ + s·r, w_cw}` — the instigator's own clock, which is the convention every
 * arrival in the solver is stated in. The divisor's zero test carries the same `w_e · w_cw` scaling
 * as the quantity it guards (W-spec W26).
 */
function findOffsetViaIncenter(
    instigatorData: InteriorEdge,
    edgeToSplit: PolygonEdge,
    context: StraightSkeletonSolverContext
): SplitOffsetResult | null {
    const instigatorRay = context.projectRayInterior(instigatorData);
    const clockwiseParent = context.clockwiseParent(instigatorData);

    const clockwiseWeight = context.weightOf(clockwiseParent.id);
    const splitWeight = context.weightOf(edgeToSplit.id);

    const rateAgainstParent = crossProduct(instigatorRay.basisVector, clockwiseParent.basisVector);
    const rateTowardsSplit = -crossProduct(instigatorRay.basisVector, edgeToSplit.basisVector);

    const divisor = rateAgainstParent * splitWeight + rateTowardsSplit * clockwiseWeight;
    if (Math.abs(divisor) < FLOATING_POINT_EPSILON * splitWeight * clockwiseWeight) {
        return null;
    }

    const sourceFromParent = sourceOffsetDistance(instigatorData, context);
    const sourceFromSplit = distanceFromEdgeLine(instigatorRay.sourceVector, edgeToSplit, context);

    const alongInstigator =
        (sourceFromSplit * clockwiseWeight - sourceFromParent * splitWeight) / divisor;
    const arrival: Arrival = {
        distance: sourceFromParent + alongInstigator * rateAgainstParent,
        weight: clockwiseWeight,
    };

    // Discard negative arrivals. The weight is positive, so the sign is the distance's.
    if (arrival.distance < 0) {
        splitLog.warn(`Offset distance was < 0: ${arrival.distance}, instigator: ${instigatorData}, edgeToSplit: ${edgeToSplit}`)
        return null;
    }

    const position = findPositionAlongRay(instigatorRay, alongInstigator);

    // INTERPRETATION (recorded in the delegate's report): the closed form has no second ray to
    // classify, and `SplitOffsetResult.intersectionData` is consumed only as a classification of the
    // two PARTICIPANTS. It is therefore the instigator against the split edge's own ray — the same
    // pair `findOffsetByDirectStrike` reports, so both split paths now describe their event the same
    // way.
    const intersectionData = intersectRays(instigatorRay, context.projectRay(edgeToSplit));

    return {offsetDistance: timeOf(arrival), arrival, position, intersectionData};
}

/**
 * Find the split arrival by direct bisector–edge intersection.
 * Solves the equation:
 * distance = distanceAlongBisector * cross(bisector, parent)
 * where distanceAlongBisector partitions the total bisector length by the ratio
 * of the perpendicular projections to parent and struck edge.
 *
 * WEIGHTED BY CROSS-MULTIPLICATION (W-spec W20, W26). The two projections are converted into TIMES
 * by their own edges' weights before the split of `rayLength1` is taken, which is the same
 * clearing-of-denominators as `meetHeadOn`. At unit weights every product is by `1.0` and this is
 * `rayLength1 · negT / (crossCw + negT)` in the same operation order — measured 0 mismatches in
 * 100 000 random operands. The formula keeps today's primary-only assumption (the instigator's
 * source lies on its parent's line, so there is no source term); that is not new.
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
    const clockwiseWeight = context.weightOf(clockwiseInstigatorParent.id);
    const splitWeight = context.weightOf(edgeToSplit.id);
    const crossClockwiseParent = crossProduct(instigatorRay.basisVector, clockwiseInstigatorParent.basisVector);
    const negativeInstigatorCrossTarget = crossProduct(negateVector(instigatorRay.basisVector), edgeToSplit.basisVector);
    const crossSumDivisor = crossClockwiseParent * splitWeight + negativeInstigatorCrossTarget * clockwiseWeight;

    if (Math.abs(crossSumDivisor) < FLOATING_POINT_EPSILON * splitWeight * clockwiseWeight) {
        return null;
    }

    const distanceToSplitAlongInstigator =
        rayLength1 * negativeInstigatorCrossTarget * clockwiseWeight / crossSumDivisor;
    const arrival: Arrival = {
        distance: distanceToSplitAlongInstigator * crossClockwiseParent,
        weight: clockwiseWeight,
    };

    const position = findPositionAlongRay(instigatorRay, distanceToSplitAlongInstigator);

    return {
        offsetDistance: timeOf(arrival),
        arrival,
        position,
        intersectionData: initialIntersection,
    };
}

export function generateSplitEvent(instigatorData: InteriorEdge, edgeToSplit: PolygonEdge, context: StraightSkeletonSolverContext): CollisionEvent | null {

    const {
        clockwise: instigatorClockwiseParent,
        widdershins: instigatorWiddershinsParent
    } = context.parentEdges(instigatorData.id);

    // Can't split an edge that is already finished, or split from behind a finished one. An
    // accepted exterior edge has no wavefront left to cut, and its span is not measurable —
    // `clockwiseSpanExcludingAccepted` throws rather than answer for one.
    if (context.isAccepted(edgeToSplit.id)
        || context.isAccepted(instigatorClockwiseParent.id)
        || context.isAccepted(instigatorWiddershinsParent.id)) {
        return null;
    }

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

    if (!context.validateSplitReachesEdge(instigatorData.id, edgeToSplit.id, result.arrival)) {
        splitLog.info('Split event validation failed:', instigatorData, edgeToSplit);
        return null;
    }

    return {
        position: result.position,
        intersectionData: result.intersectionData,
        collidingEdges: [instigatorData.id, edgeToSplit.id],
        offsetDistance: result.offsetDistance,
        arrival: result.arrival,
        eventType: 'interiorAgainstExterior'
    }
}

export function generateSplitEventViaBisector(
    instigatorId: number,
    targetId: number,
    direction: SkeletonDirection,
    context: StraightSkeletonSolverContext,
): CollisionEvent | null {
    if (context.edgeRank(instigatorId) !== 'primary' || context.edgeRank(targetId) === 'exterior') {
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

/**
 * Does the instigator's ray reach the split edge's supporting line, travelling forward?
 *
 * `intersectRays` reports 'converging' only when BOTH ray parameters are strictly positive. The
 * forward and reversed edge rays share one origin — the split edge's source vertex — so between
 * them they cover the whole supporting line EXCEPT that single point, where both parameters are
 * exactly zero and both tests read 'diverging'. A bisector aimed straight at the split edge's own
 * source vertex is a strike on that line like any other, and discarding it is the strict
 * inequality speaking, not the geometry.
 *
 * The zero is tested with the standing `areEqual` tolerance rather than exact equality, because
 * the vertex the bisector points at is reached through a normalisation and a bisection and lands
 * on the line to within the same absolute epsilon everything else here is measured against.
 */
function reachesSupportingLine([alongInstigator, alongEdge, resultType]: IntersectionResult): boolean {
    return resultType === 'converging' || (alongInstigator > 0 && areEqual(alongEdge, 0));
}

export function generateSplitEventFromTheEdgeItself(instigatorId: number, targetId: number, context: StraightSkeletonSolverContext): CollisionEvent | null {
    const edgeToSplit = context.getEdgeWithId(targetId);
    const instigatorData = context.getInteriorWithId(instigatorId);

    const edgeSplitRay = context.projectRay(edgeToSplit);
    const backwardsEdgeSplitRay = context.projectRayReversed(edgeToSplit);
    const instigatorRay = context.projectRayInterior(instigatorData);

    const initialIntersectionTest = intersectRays(instigatorRay, edgeSplitRay);
    const initialIntersectionTest2 = intersectRays(instigatorRay, backwardsEdgeSplitRay);
    if (!reachesSupportingLine(initialIntersectionTest) && !reachesSupportingLine(initialIntersectionTest2)) {
        // We expect now to handle the "near miss" scenarios via the intersections of the bisectors themselves.
        return null;
    }

    // Cannot split from behind
    const isBehindEdge = crossProduct(context.getEdgeWithInterior(instigatorData).basisVector, edgeToSplit.basisVector) > 0;
    if (isBehindEdge) {
        return null;
    }

    // --- Path 1: Direct-strike offset ---
    const directResult = findOffsetByDirectStrike(instigatorData, edgeToSplit, initialIntersectionTest, context);
    if (directResult !== null) {
        if (!context.validateSplitReachesEdge(instigatorId, targetId, directResult.arrival)) {
            complexLog.debug('Collide creates invalid split', directResult, instigatorId, targetId, context)
        } else {
            return {
                intersectionData: directResult.intersectionData,
                offsetDistance: directResult.offsetDistance,
                arrival: directResult.arrival,
                collidingEdges: [instigatorId, targetId],
                eventType: 'interiorAgainstExterior',
                position: directResult.position
            };
        }
    }

    // --- Path 2: Incenter fallback ---



    const {
        clockwise: instigatorClockwiseParent,
        widdershins: instigatorWiddershinsParent
    } = context.parentEdges(instigatorData.id);

    // Second edges are implicitly always non-reflex, because they form collapse events or half a split event
    const edgeRank = context.edgeRank(instigatorId)
    if (edgeRank === 'secondary'){
        return null;
    }

    const clockwiseSpan = context.clockwiseSpanIncludingAccepted(instigatorClockwiseParent, edgeToSplit);
    const widdershinsSpan = context.clockwiseSpanIncludingAccepted(edgeToSplit, instigatorWiddershinsParent);

    if (Math.min(clockwiseSpan, widdershinsSpan) < 2) {
        return null;
    }

    const incenterResult = findOffsetViaIncenter(instigatorData, edgeToSplit, context);
    if (incenterResult === null) {
        return null;
    }

    if (!context.validateSplitReachesEdge(instigatorId, targetId, incenterResult.arrival)) {
        return null;
    }

    return {
        position: incenterResult.position,
        intersectionData: incenterResult.intersectionData,
        collidingEdges: [instigatorId, targetId],
        offsetDistance: incenterResult.offsetDistance,
        arrival: incenterResult.arrival,
        eventType: 'interiorAgainstExterior'
    };
}
