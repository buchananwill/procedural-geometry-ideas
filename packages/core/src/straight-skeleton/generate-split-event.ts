import {
    Arrival,
    InteriorEdge, IntersectionResult, PolygonEdge,
    RayProjection,
    SkeletonDirection,
    SplitEvent,
    SplitOffsetResult,
    StraightSkeletonSolverContext,
    WavefrontSegment
} from "./types";
import {complexLog, splitLog} from "./logger";
import {
    crossProduct,
    findPositionAlongRay,
    negateVector,
    subtractVectors,
} from "./core-functions";
import {inwardDistanceFromWall} from "./wall-time";
import {
    arrivalUncertainty,
    BASIS_LENGTH_ERROR,
    offsetRateForwardError,
    pointAlongRayUncertainty,
    UNIT_ROUNDOFF,
    WALL_DIRECTION_ERROR,
    weightedRateSumForwardBound,
    weightedRateSumRoundingBound,
} from "./constants";
import {intersectRays} from "./intersection-edges";
import {linkGuardRefuses} from "./wavefront-links";
import {
    exteriorRayTerms,
    interiorDirectionError,
    interiorRayTerms,
    nodePositionUncertainty,
    rayIntersectionUncertainty,
    sourceOffsetWithBudget,
    timeOf
} from "./collision-helpers";

/**
 * THE PRICING BOTH SPLIT OFFSETS SHARE (W-spec W20, W21, W26): the clockwise parent's and the struck edge's weights,
 * the instigator's rate against its clockwise parent `r = cross(d, c)` and its rate of approach to the struck edge `q`,
 * each scaled by the other wall's weight and summed into the divisor, and the error terms charged on them (journal-5
 * decisions 162(a), 167): the instigator source's budget, its direction error, both rates' forward errors and the
 * divisor's.
 */
interface SplitPricing {
    clockwiseWeight: number;
    splitWeight: number;
    rateAgainstParent: number;
    rateTowardsSplit: number;
    divisor: number;
    sourceBudget: number;
    directionError: number;
    rateError: number;
    towardsSplitError: number;
    divisorBudget: number;
}

/**
 * {@link SplitPricing} for `instigatorData` against `edgeToSplit`, or `null` inside the divisor's guard.
 *
 * `rateTowardsSplit` is the caller's own spelling of `q`: `−cross(d, e)` and `cross(−d, e)` are equal but for the sign
 * of an exact zero, and each split offset keeps the spelling it has.
 *
 * A DIVISION GUARD (C8 spec T19, census S33 and S34): two rates, each a unit cross product off by `k·u`, each scaled by
 * a weight, summed — `meetHeadOn`'s structure exactly, so its bound.
 */
function splitPricing(
    context: StraightSkeletonSolverContext,
    instigatorData: InteriorEdge,
    instigatorRay: RayProjection,
    edgeToSplit: PolygonEdge,
    rateTowardsSplit: number,
): SplitPricing | null {
    const clockwiseParent = context.clockwiseParent(instigatorData);
    const clockwiseWeight = context.weightOf(clockwiseParent.id);
    const splitWeight = context.weightOf(edgeToSplit.id);
    const rateAgainstParent = crossProduct(instigatorRay.basisVector, clockwiseParent.basisVector);

    const termAgainstParent = rateAgainstParent * splitWeight;
    const termTowardsSplit = rateTowardsSplit * clockwiseWeight;
    const divisor = termAgainstParent + termTowardsSplit;
    const divisorBound = weightedRateSumRoundingBound(termAgainstParent, termTowardsSplit, clockwiseWeight, splitWeight);
    if (Math.abs(divisor) <= divisorBound) {
        return null;
    }

    const directionError = interiorDirectionError(instigatorData, context);
    const rateError = offsetRateForwardError(directionError, WALL_DIRECTION_ERROR, rateAgainstParent);
    const towardsSplitError = offsetRateForwardError(directionError, WALL_DIRECTION_ERROR, rateTowardsSplit);
    return {
        clockwiseWeight,
        splitWeight,
        rateAgainstParent,
        rateTowardsSplit,
        divisor,
        sourceBudget: nodePositionUncertainty(context, context.getEdgeWithId(instigatorData.id).source),
        directionError,
        rateError,
        towardsSplitError,
        divisorBudget: weightedRateSumForwardBound(
            termAgainstParent, termTowardsSplit, clockwiseWeight, splitWeight, rateError, towardsSplitError),
    };
}

/**
 * A split offset's result, `along` units along the instigator's ray at `distance` from its clockwise parent's line: the
 * arrival on the instigator's own clock ({@link arrivalUncertainty}'s budget, from `sourceOffsetBudget` and the travel's
 * `alongBudget`), the event point `P + a·b̂` ({@link pointAlongRayUncertainty}'s budget), and `intersectionData`.
 */
function splitOffsetResult(
    pricing: SplitPricing,
    instigatorRay: RayProjection,
    along: number,
    alongBudget: number,
    distance: number,
    sourceOffsetBudget: number,
    intersectionData: IntersectionResult,
): SplitOffsetResult {
    const arrival: Arrival = {
        distance,
        weight: pricing.clockwiseWeight,
        uncertainty: arrivalUncertainty(
            sourceOffsetBudget, pricing.rateAgainstParent, pricing.rateError, along, alongBudget, distance, false),
    };
    const position = findPositionAlongRay(instigatorRay, along);
    return {
        offsetDistance: timeOf(arrival),
        arrival,
        position,
        positionUncertainty: pointAlongRayUncertainty(
            pricing.sourceBudget, along, alongBudget, pricing.directionError, position),
        intersectionData,
    };
}

/**
 * Where along the instigator's ray its own wavefront clock reads the same as the split edge's — the
 * split event, solved in closed form (W-spec W21, arc journal decision 115).
 *
 * THE ONE SITE WHERE UNIT-WEIGHT BIT-IDENTITY IS NOT ACHIEVABLE, and it is named as such (arc decision
 * 115 amends 112(d) to make this the single named exception). The unweighted construction — a
 * temporary node on whichever parent is more perpendicular to the split edge, bisected there with
 * `makeBisectedBasis`, and two rays intersected — reaches THE SAME POINT by different arithmetic, so
 * its unit-weight bits are not these bits. The difference is bounded by ulps BY CONSTRUCTION — same
 * point, different route — so a unit-weight answer that differs from the unweighted one by more than
 * a few ulps is a defect in this form. There is no unit-weight branch back to that construction: W-spec
 * W36 forbids a branch on unit weights, on journal decision 105's ground.
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
    // S33's division guard ({@link splitPricing}).
    const pricing = splitPricing(context, instigatorData, instigatorRay, edgeToSplit,
        -crossProduct(instigatorRay.basisVector, edgeToSplit.basisVector));
    if (pricing === null) {
        return null;
    }
    const {clockwiseWeight, splitWeight, rateAgainstParent, divisor} = pricing;

    const [sourceFromParent, sourceFromParentBudget] = sourceOffsetWithBudget(instigatorData, context);
    const sourceFromSplit = inwardDistanceFromWall(context, edgeToSplit.id, instigatorRay.sourceVector);

    const alongInstigator =
        (sourceFromSplit * clockwiseWeight - sourceFromParent * splitWeight) / divisor;
    const travelledOffset = alongInstigator * rateAgainstParent;
    const distance = sourceFromParent + travelledOffset;

    // THE SPLIT'S ERROR BUDGET, COMPLETE TO FIRST ORDER (journal-5 decisions 162(a), 167). The travel
    // `a = N/Δ` carries its numerator's inputs and the two rates' FORWARD errors, not only the divisor's
    // backward rounding:
    //
    //     E_E₀ = e_P + |P − A|·(η_e + 3u) + λ·|E₀|  the source's distance from the split line (the line's
    //                                              turn about its stored source A, the subtraction and
    //                                              the dot's rounding, the normal's length error)
    //     E_Δ  = w_e·E_r + w_cw·E_q + 2u·(|r·w_e| + |q·w_cw|)
    //     E_N  = w_cw·E_E₀ + w_e·E_D₀ + 3u·(|E₀·w_cw| + |D₀·w_e|)
    //     E_a  = E_N/|Δ| + |a|·E_Δ/|Δ| + u·|a|
    //
    // and the arrival `D₀ + a·r` is then `arrivalUncertainty`'s form, the event point `P + a·b̂`
    // `pointAlongRayUncertainty`'s.
    const fromSplitSource = subtractVectors(instigatorRay.sourceVector, context.sourcePosition(edgeToSplit.id));
    const sourceFromSplitBudget = pricing.sourceBudget
        + Math.hypot(fromSplitSource.x, fromSplitSource.y) * (WALL_DIRECTION_ERROR + 3 * UNIT_ROUNDOFF)
        + BASIS_LENGTH_ERROR * Math.abs(sourceFromSplit);
    const numeratorBudget = clockwiseWeight * sourceFromSplitBudget + splitWeight * sourceFromParentBudget
        + 3 * UNIT_ROUNDOFF * (Math.abs(sourceFromSplit * clockwiseWeight) + Math.abs(sourceFromParent * splitWeight));
    const alongBudget = numeratorBudget / Math.abs(divisor)
        + Math.abs(alongInstigator) * pricing.divisorBudget / Math.abs(divisor)
        + UNIT_ROUNDOFF * Math.abs(alongInstigator);

    // Discard negative arrivals. The weight is positive, so the sign is the distance's.
    if (distance < 0) {
        splitLog.warn(`Offset distance was < 0: ${distance}, instigator: ${instigatorData}, edgeToSplit: ${edgeToSplit}`)
        return null;
    }

    // The closed form has no second ray to classify, and `SplitOffsetResult.intersectionData` is
    // consumed only as a classification of the two PARTICIPANTS. It is therefore the instigator against
    // the split edge's own ray — the same pair `findOffsetByDirectStrike` reports, so both split paths
    // describe their event the same way.
    const intersectionData = intersectRays(
        instigatorRay, context.projectRay(edgeToSplit), context.coaxialityFloor,
        context.angularResolution);

    return splitOffsetResult(
        pricing, instigatorRay, alongInstigator, alongBudget, distance, sourceFromParentBudget, intersectionData);
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
 * 100 000 random operands. The formula assumes a primary instigator (its source lies on its
 * parent's line, so there is no source term).
 */
function findOffsetByDirectStrike(
    instigatorData: InteriorEdge,
    edgeToSplit: PolygonEdge,
    initialIntersection: IntersectionResult,
    context: StraightSkeletonSolverContext
): SplitOffsetResult | null {
    const instigatorRay = context.projectRayInterior(instigatorData);
    const [rayLength1] = initialIntersection;
    // S34's division guard, the same structure and the same bound as S33 ({@link splitPricing}).
    const pricing = splitPricing(context, instigatorData, instigatorRay, edgeToSplit,
        crossProduct(negateVector(instigatorRay.basisVector), edgeToSplit.basisVector));
    if (pricing === null) {
        return null;
    }
    const {
        clockwiseWeight,
        rateAgainstParent: crossClockwiseParent,
        rateTowardsSplit: negativeInstigatorCrossTarget,
        divisor: crossSumDivisor,
    } = pricing;

    const distanceToSplitAlongInstigator =
        rayLength1 * negativeInstigatorCrossTarget * clockwiseWeight / crossSumDivisor;
    const distance = distanceToSplitAlongInstigator * crossClockwiseParent;

    // THE SPLIT'S ERROR BUDGET, COMPLETE TO FIRST ORDER (journal-5 decisions 162(a), 167). Besides S34's
    // divisor rounding it charges the intersection behind `rayLength1`, which is `intersectRays`' travel of
    // the instigator to the split edge's line and carries that intersection's whole budget. With
    // `a = L₁·n·w_cw/Δ`, `n = cross(−b̂, ê)`:
    //
    //     E_L₁ = rayIntersectionUncertainty(instigator, split edge)       (bases, sources, division)
    //     E_n  = η_b + η_e + k·u                                          (a rate's forward error)
    //     E_Δ  = w_e·E_r + w_cw·E_n + 2u·(|r·w_e| + |n·w_cw|)
    //     E_a  = (E_L₁·|n| + |L₁|·E_n)·w_cw/|Δ| + |a|·E_Δ/|Δ| + 3u·|a|
    //
    // The arrival `a·r` has no source term — this form's primary-only assumption (a primary instigator's
    // source lies on its clockwise parent's line, `s = 0` exactly).
    const [, rayLength2] = initialIntersection;
    const rayLength1Budget = rayIntersectionUncertainty(
        instigatorRay, context.projectRay(edgeToSplit),
        interiorRayTerms(instigatorData, context, rayLength1), exteriorRayTerms(rayLength2));
    const alongBudget = (rayLength1Budget * Math.abs(negativeInstigatorCrossTarget)
            + Math.abs(rayLength1) * pricing.towardsSplitError) * clockwiseWeight / Math.abs(crossSumDivisor)
        + Math.abs(distanceToSplitAlongInstigator) * pricing.divisorBudget / Math.abs(crossSumDivisor)
        + 3 * UNIT_ROUNDOFF * Math.abs(distanceToSplitAlongInstigator);

    return splitOffsetResult(
        pricing, instigatorRay, distanceToSplitAlongInstigator, alongBudget, distance, 0, initialIntersection);
}

/**
 * The first of these validating segments the neighbour guard does not refuse (skeleton join-and-divide spec,
 * decision 5), or `undefined` when it refuses them all. On one loop no split validates on more than one segment
 * (BSA.F95), so there this is the guard asked of the one segment.
 */
function firstUnrefused(
    context: StraightSkeletonSolverContext,
    instigatorId: number,
    validating: readonly WavefrontSegment[],
): WavefrontSegment | undefined {
    return validating.find(segment => !linkGuardRefuses(context, instigatorId, segment));
}

/** Would the instigator split `edge` from behind: does its own basis turn clockwise of the edge's? */
function isBehindEdge(context: StraightSkeletonSolverContext, instigatorData: InteriorEdge, edge: PolygonEdge): boolean {
    return crossProduct(context.getEdgeWithInterior(instigatorData).basisVector, edge.basisVector) > 0;
}

/** The split event of a priced offset, striking `struckSegment` of edge `targetId`. */
function splitEventOf(
    result: SplitOffsetResult,
    instigatorId: number,
    targetId: number,
    struckSegment: WavefrontSegment,
): SplitEvent {
    return {
        position: result.position,
        positionUncertainty: result.positionUncertainty,
        intersectionData: result.intersectionData,
        collidingEdges: [instigatorId, targetId],
        offsetDistance: result.offsetDistance,
        arrival: result.arrival,
        eventType: 'interiorAgainstExterior',
        struckSegment,
    };
}

/**
 * The split by the incenter form ({@link findOffsetViaIncenter}), validated against the edge's live segments, on the
 * first validating segment the neighbour guard does not refuse (wavefront-order spec, decision 19: the guard reads the
 * links; join-and-divide spec, decision 5), or
 * `null`. Each caller asks its own guards first.
 */
function incenterSplit(
    instigatorData: InteriorEdge,
    edgeToSplit: PolygonEdge,
    context: StraightSkeletonSolverContext,
): SplitEvent | null {
    const result = findOffsetViaIncenter(instigatorData, edgeToSplit, context);
    if (result === null) {
        return null;
    }

    const validating = context.validateSplitReachesEdge(instigatorData.id, edgeToSplit.id, result.arrival);
    if (validating.length === 0) {
        splitLog.info('Split event validation failed:', instigatorData, edgeToSplit);
        return null;
    }

    // Can't split your neighbour (wavefront-order spec, decision 19): asked of the segment the split strikes, in the links, and of
    // every validating segment in turn — the first it does not refuse is struck (join-and-divide spec, decision 5).
    const struckSegment = firstUnrefused(context, instigatorData.id, validating);
    if (struckSegment === undefined) {
        return null;
    }
    return splitEventOf(result, instigatorData.id, edgeToSplit.id, struckSegment);
}

export function generateSplitEvent(instigatorData: InteriorEdge, edgeToSplit: PolygonEdge, context: StraightSkeletonSolverContext): SplitEvent | null {

    const {
        clockwise: instigatorClockwiseParent,
        widdershins: instigatorWiddershinsParent
    } = context.parentEdges(instigatorData.id);

    // Can't split an edge that is already finished, or split from behind a finished one. An
    // accepted exterior edge has no wavefront left to cut.
    if (context.isAccepted(edgeToSplit.id)
        || context.isAccepted(instigatorClockwiseParent.id)
        || context.isAccepted(instigatorWiddershinsParent.id)) {
        return null;
    }

    // Can't split an edge from behind!
    if (isBehindEdge(context, instigatorData, edgeToSplit)) {
        return null;
    }

    return incenterSplit(instigatorData, edgeToSplit, context);
}


export function generateSplitEventViaBisector(
    instigatorId: number,
    targetId: number,
    direction: SkeletonDirection,
    context: StraightSkeletonSolverContext,
): SplitEvent | null {
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
 * The zero is tested against a tolerance rather than exact equality, because the vertex the
 * bisector points at is reached through a normalisation and a bisection and lands on the line only
 * to within the arithmetic that built it.
 *
 * THE TOLERANCE IS THE COAXIALITY FLOOR — A DISTANCE, NOT AN ANGLE (spec A15's
 * `generateSplitEventFromTheEdgeItself` row, journal decisions 144 and 146). "Does this strike land
 * at the split edge's own end?" is a distance-to-zero question along the edge's unit ray, so it is
 * asked in the floor's category: a strike within the client's floor of the vertex IS a strike at the
 * vertex, not the scratch epsilon decision 144 retires. STRICTLY BELOW the floor (C8 spec T7): "the
 * same point, before any node exists" is one inequality across the package, the one canonicalisation
 * and the coincidence clustering use. Strict and non-strict differ on a boundary of measure zero: no
 * lateral on the corpus, the fine translations or the jitter sweeps equals the floor exactly (0 of
 * 10.5 million evaluations measured).
 *
 * EXPORTED FOR ITS OWN TEST, not for other callers — see `slightly-deformed-peanut.test.ts`.
 */
export function reachesSupportingLine(
    [alongInstigator, alongEdge, resultType]: IntersectionResult,
    coaxialityFloor: number,
): boolean {
    return resultType === 'converging'
        || (alongInstigator > 0 && Math.abs(alongEdge) < coaxialityFloor);
}

export function generateSplitEventFromTheEdgeItself(instigatorId: number, targetId: number, context: StraightSkeletonSolverContext): SplitEvent | null {
    const edgeToSplit = context.getEdgeWithId(targetId);
    const instigatorData = context.getInteriorWithId(instigatorId);

    const edgeSplitRay = context.projectRay(edgeToSplit);
    const backwardsEdgeSplitRay = context.projectRayReversed(edgeToSplit);
    const instigatorRay = context.projectRayInterior(instigatorData);

    const initialIntersectionTest = intersectRays(instigatorRay, edgeSplitRay, context.coaxialityFloor,
        context.angularResolution);
    const initialIntersectionTest2 = intersectRays(
        instigatorRay, backwardsEdgeSplitRay, context.coaxialityFloor, context.angularResolution);
    if (!reachesSupportingLine(initialIntersectionTest, context.coaxialityFloor)
        && !reachesSupportingLine(initialIntersectionTest2, context.coaxialityFloor)) {
        // A near miss is handled by the intersections of the bisectors themselves.
        return null;
    }

    // Cannot split from behind
    if (isBehindEdge(context, instigatorData, edgeToSplit)) {
        return null;
    }

    // --- Path 1: Direct-strike offset ---
    const directResult = findOffsetByDirectStrike(instigatorData, edgeToSplit, initialIntersectionTest, context);
    if (directResult !== null) {
        // THE FIRST VALIDATING SEGMENT, UNGUARDED (join-and-divide spec, decision 5): asking the neighbour guard
        // here moves seven complete sweep cells (BSA.F98).
        const [struckSegment] = context.validateSplitReachesEdge(instigatorId, targetId, directResult.arrival);
        if (struckSegment === undefined) {
            complexLog.debug('Collide creates invalid split', directResult, instigatorId, targetId, context)
        } else {
            return splitEventOf(directResult, instigatorId, targetId, struckSegment);
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

    // AN ACCEPTED INSTIGATOR PARENT OR STRUCK EDGE IS A STEP FAILURE, by a direct throw (wavefront-order spec,
    // decision 21's reasoning, applied to this site). An edge is accepted only when no live bisector names it
    // (skeleton edge-acceptance spec), so this cannot fire; it is the guard. The thrown text speaks of a span;
    // the test is the rule.
    if (context.isAccepted(edgeToSplit.id)
        || context.isAccepted(instigatorClockwiseParent.id)
        || context.isAccepted(instigatorWiddershinsParent.id)) {
        throw new Error('Cannot compute span with accepted edges.');
    }

    return incenterSplit(instigatorData, edgeToSplit, context);
}
