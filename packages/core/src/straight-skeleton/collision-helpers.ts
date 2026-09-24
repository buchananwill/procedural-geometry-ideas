import {
    Arrival,
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
    crossProduct,
    findPositionAlongRay,
    normalize,
    offsetRateIsArithmeticZero,
    projectToPerpendicular,
    subtractVectors
} from "./core-functions";
import {
    ARRIVAL_MOMENT_ULPS,
    CROSS_PRODUCT_ROUNDING_UNITS,
    HELD_SIMULTANEITY_WINDOW,
    UNIT_ROUNDOFF,
    weightedRateSumRoundingBound,
} from "./constants";
import {NO_COLLISION_RESULTS} from "./constants";
import {
    generateSplitEventFromTheEdgeItself,
    generateSplitEventViaBisector,
} from "./generate-split-event";

/*
 * ----------------------------------------------------------------------------
 * THE ARRIVAL VOCABULARY — A TIME IS THE PAIR IT CAME FROM
 * ----------------------------------------------------------------------------
 *
 * W-spec W7 and W22, arc journal decision 112(b) and 112(c). Under weights the wavefront of exterior
 * edge `i` stands at perpendicular distance `w_i · t` from its supporting line at time `t`, so every
 * quantity the solver used to compute as a perpendicular distance IS a time once divided by the
 * weight of the edge it was measured against. The division is performed exactly once, by
 * {@link timeOf}, and only for reporting, sorting keys and denormalisation; every TOLERANCE decision
 * is taken on the undivided pair by cross-multiplication.
 *
 * AT UNIT WEIGHTS EVERY ONE OF THESE IS TODAY'S ARITHMETIC. Each product is by `1.0`, which is exact
 * for every finite double, so the operands and the operation order below are the ones the unweighted
 * solver used. That is the whole mechanism behind arc decision 112(d)'s bit-identity bar — there is
 * no branch on unit weights anywhere (W-spec W36).
 */

/** The wavefront clock reading of an arrival: `distance / weight` (W-spec W7). */
export function timeOf(arrival: Arrival): number {
    return arrival.distance / arrival.weight;
}

/**
 * THE SIMULTANEITY WINDOW OF ONE PAIR, cross-multiplied (C8 spec T12 as amended by journal decision
 * 160, T13): the width, in the units of `|d₁·w₂ − d₂·w₁|`, inside which the two arrivals are ONE
 * MOMENT of the wavefront clock.
 *
 *     window  =  min( cap · min(w₁, w₂),
 *                     max( ARRIVAL_MOMENT_ULPS · ε · max(|d₁·w₂|, |d₂·w₁|),
 *                          uncertainty₁ · w₂  +  uncertainty₂ · w₁ ) )
 *
 * which, divided through by `w₁·w₂`, is the time-axis statement
 *
 *     |t₁ − t₂|  <  min( cap / max(w₁, w₂),  max( 64·ε·max(t₁, t₂),  e₁/w₁ + e₂/w₂ ) ).
 *
 * THE FLOOR IS ARITHMETIC: the moment bar of S29 at the LATER of the two times (`t` in the bar is the
 * larger arrival time), which two routes to one exact value never exceed. WIDENED BY CONDITIONING: the
 * two arrivals' own pricing error budgets ({@link Arrival.uncertainty}), converted to time by their
 * own weights — an ordering the arithmetic cannot vouch for is not an ordering. CAPPED BY PERCEPTION:
 * `cap` is the solve's `simultaneityWindow` (δ), stated on the FASTER participant, so inside the
 * window no participating edge advances more than δ — where decision 157 releases the solver from
 * deciding. At unit weights it reads `min(δ, max(64·ε·max(d₁, d₂), e₁ + e₂))` on `|d₁ − d₂|`.
 *
 * A literal `cap = 0` makes the window `0`: an exact comparison.
 *
 * LANDED AND MEASURED, NOT SPENT — A MEASURED STOP (C8 dispatch 2, 2026-09-24; T16, T37). With all seven
 * sites (S22–S28) comparing at this window, 211 of the 580 sweep cells move and 45 core tests fail:
 * `Near Regular Circle 48` and the regular circles of the vertex-count sweep stop solving (STOP 1), and
 * two CLEAN digests move (`Near Regular Peanut 32`, `Slightly Deformed Peanut 2`). The movers are NOT
 * ill-conditioned pairs: on the Peanut the phantom test (S23) splits `e37 × e57` (sin θ = 0.374, |sep| =
 * 0.401, budget 6.4e-16 per reading) whose two readings differ by 5.0e-15 against a moment bar of 2.9e-15;
 * on `Near Regular Circle 32` the layer (S22) splits a 32-way meeting whose arrivals differ by 8.7e-15 to
 * 1.2e-14 against a bar of 8.3e-15 (sin θ = 0.195, budgets 6.7e-16). The pricing budget charges only the
 * division by `sin θ`; the readings also differ by the rounding of the bisector bases, the rates and the
 * source offsets, which it does not charge, so well-conditioned many-way meetings fall one to two moment
 * bars apart and are split. By site alone: S22 moves 209 cells, S23 75, S24 11 (hash only) plus a
 * `Golf Cart` recursion throw, S25–S28 nothing. The sites spend `HELD_SIMULTANEITY_WINDOW` through
 * {@link compareArrivals}; see constants.ts.
 */
export function pairSimultaneityWindow(a: Arrival, b: Arrival, cap: number): number {
    const left = a.distance * b.weight;
    const right = b.distance * a.weight;
    const momentBar = ARRIVAL_MOMENT_ULPS * Number.EPSILON * Math.max(Math.abs(left), Math.abs(right));
    const conditioning = a.uncertainty * b.weight + b.uncertainty * a.weight;
    return Math.min(cap * Math.min(a.weight, b.weight), Math.max(momentBar, conditioning));
}

/**
 * Order two arrivals in time, division-free (W-spec W22, W26), with the SIMULTANEITY WINDOW stated per
 * pair (C8 spec T13).
 *
 * `d₁/w₁ < d₂/w₂` restated as `d₁·w₂ < d₂·w₁`. Two arrivals are one moment when
 *
 *     |d₁·w₂ − d₂·w₁|  <  window · min(w₁, w₂)      ⟺      |t₁ − t₂|  <  window / max(w₁, w₂)
 *
 * — inside the window no participating edge advances more than `window` (a LENGTH). The seven window
 * sites pass `HELD_SIMULTANEITY_WINDOW`: T12's amended per-pair form ({@link pairSimultaneityWindow}) is
 * landed but its move hit T37's STOPs (see there). The bar is stated on the FASTER participant, which is
 * what dissolves W-spec W48's fusing hazard for every weight ratio (T22). At unit weights it reads
 * `|d₁ − d₂| < window`, the operands and operation order of the unweighted solver.
 *
 * NO DEFAULT (T4): every caller states its window, or a literal `0` where it only ORDERS (S31).
 *
 * AN EXACTLY ZERO DIFFERENCE IS NEVER AN ORDERING, even at `window = 0`. That is not a widening:
 * `fp_compare` reports `1` for two identical operands at a zero epsilon (its window is strict), and
 * this comparator is handed to `toSorted` in three places where today's `a - b` returns `0` for a
 * tie and leaves the stable order alone. Preserving that is what keeps the layer sort bit-identical.
 */
export function compareArrivals(a: Arrival, b: Arrival, window: number): -1 | 0 | 1 {
    const left = a.distance * b.weight;
    const right = b.distance * a.weight;
    const difference = left - right;
    if (difference === 0 || Math.abs(difference) < window * Math.min(a.weight, b.weight)) {
        return 0;
    }
    return difference < 0 ? -1 : 1;
}

/** Do these two arrivals name one moment of the wavefront clock, within `window`? (W-spec W22, C8 T13.) */
export function arrivalsAreEqual(a: Arrival, b: Arrival, window: number): boolean {
    return compareArrivals(a, b, window) === 0;
}

/** The LATER of two arrivals — `Math.max` on times, cross-multiplied (W-spec W18). */
export function laterArrival(a: Arrival, b: Arrival): Arrival {
    return a.distance * b.weight >= b.distance * a.weight ? a : b;
}

/**
 * The arrival of a bisector `alongRay` units along its own ray, as the pair (W-spec W7).
 *
 * The distance half is {@link makeOffsetDistance}, unchanged and untouched (W-spec W6): the
 * perpendicular distance from the bisector's clockwise parent's supporting line is exactly what a
 * time needs beside a weight, and leaving its arithmetic alone is what makes every unit-weight
 * number downstream bit-identical.
 *
 * `uncertainty` is the pricing error budget of `alongRay` (C8 spec T12 as amended), stated by the
 * caller that priced it: {@link rayIntersectionUncertainty} for a ray intersection, the head-on
 * divisor's bound for a head-on meeting, `0` for a travel that is the distance between two stored
 * positions.
 */
export function arrivalOf(
    edge: InteriorEdge,
    context: StraightSkeletonSolverContext,
    ray: RayProjection,
    alongRay: number,
    uncertainty: number,
): Arrival {
    return {
        distance: makeOffsetDistance(edge, context, ray, alongRay),
        weight: context.weightOf(context.clockwiseParent(edge).id),
        uncertainty,
    };
}

/**
 * The birth arrival of a bisector: its source's distance from its clockwise parent, and that weight.
 *
 * ITS UNCERTAINTY IS 0: the source is a STORED node position, not a priced one, and the distance is a
 * projection of two stored positions — no division by a small quantity, so no conditioning to carry
 * (C8 spec T12 as amended; a stored position has no pricing error).
 */
export function birthArrivalOf(edge: InteriorEdge, context: StraightSkeletonSolverContext): Arrival {
    return {
        distance: sourceOffsetDistance(edge, context),
        weight: context.weightOf(context.clockwiseParent(edge).id),
        uncertainty: 0,
    };
}

/**
 * The pricing error budget of a RAY INTERSECTION (C8 spec T12 as amended, journal decision 160(a)):
 * `k·u·|sep| / sin²θ`, the conditioning quantity of spec A3 and O1's histogram — `intersectRays`
 * divides by `sin θ`, evaluated as a cross product of unit bases carrying `k·u` of absolute error
 * (`k` = `CROSS_PRODUCT_ROUNDING_UNITS`, argued in constants.ts), so the meeting point is placed to
 * within `|sep|·k·u/sin²θ` along each ray. A distance along a ray moves the offset by at most that
 * much, so it bounds the arrival's distance too. Every priced pair has `sin θ ≥ ρ`, and ρ was sized
 * (A3) so that this stays under δ at `|sep| ≤ √2`.
 */
export function rayIntersectionUncertainty(ray1: RayProjection, ray2: RayProjection): number {
    const sine = crossProduct(ray1.basisVector, ray2.basisVector);
    const [, separation] = normalize(subtractVectors(ray2.sourceVector, ray1.sourceVector));
    return CROSS_PRODUCT_ROUNDING_UNITS * UNIT_ROUNDOFF * separation / (sine * sine);
}

/**
 * Pick the best (earliest arrival) non-phantom/non-outOfBounds collision.
 * Falls back to the earliest collision of any type if none qualify.
 */
export function bestNonPhantomCollision(events: CollisionEvent[]): CollisionEvent | undefined {
    // W-spec W27. At unit weights `compareArrivals(a, b, 0)` is the sign of `a.distance - b.distance`
    // with a tie reported as `0`, which is what `a.offsetDistance - b.offsetDistance` gave.
    const byArrival = (a: CollisionEvent, b: CollisionEvent) => compareArrivals(a.arrival, b.arrival, 0);
    return events
            .filter(e => e.eventType !== 'phantomDivergentOffset' && e.eventType !== 'outOfBounds')
            .sort(byArrival)[0]
        ?? events.sort(byArrival)[0];
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
    // "There is no offset gradient against this parent" — a substitution of 0 for the computed rate.
    //
    // HISTORY (the move to the angular resolution, refused): THE BAR STAYED AT THE SCRATCH EPSILON — A
    // MEASURED STOP, NOT AN OMISSION (spec A15's `makeOffsetDistance` row, A25 STOP 3; journal decision 146). Moved to the angular resolution, on
    // its own and with every other site at its old bar, and RE-MEASURED 2026-09-23 on the current tree
    // under the solver's own causality check (journal-5 decisions 148, 149): ONE defect fixture stops
    // solving — `Off-edge Jitter Reflex L (seed 55433, k=4)`, with step failures and unresolved edges —
    // and three stay complete while gaining violations, every one of them diagnosed as a
    // `causality-violation` (offset/clearance/direction): `(seed 15838)` 0/0/0 → 1/1/1, `(seed 55433)`
    // 0/0/0 → 1/0/1, `Off-edge Jitter Plus (seed 7919)` 0/0/0 → 0/1/0. (The earlier measurement
    // recorded here had all three reflex-L fixtures stop solving; it no longer holds.) The mechanism is inferred rather than traced: a
    // ray whose rate against its parent is a few parts in 1e6 — a slightly skewed corridor mid-line —
    // is then priced as travelling at CONSTANT offset while its partner's arrival is priced at its
    // true rate, and the equi-time check that follows (`arrivalsAreEqual`, still at the scratch
    // epsilon) reads the pair as phantom. The time windows are the tolerance package's (register C8),
    // and this site moves with them.
    //
    // THE OFFSET RATE'S FORWARD ROUNDING BOUND, 8u, SINCE C8 DISPATCH 3 (census S20; spec T2, T30; journal
    // decisions 161(e) and 164). Acceptance SUBSTITUTES 0 for a computed rate, so under T2 it may discard
    // only what the arithmetic cannot vouch for: whether the exact geometry's rate is zero, which charges
    // the normalised bases' own direction errors as well as the evaluation — `offsetRateIsArithmeticZero`,
    // argued at `FORWARD_CROSS_PRODUCT_ROUNDING_UNITS` in constants.ts. `alongRay · rate` has no division
    // in it, so every rate outside the bound is priced as it is. Held at a named sine literal `1e-8`
    // through dispatches 1 and 2 (T33's precondition, dissolved by decision 161(e)). `addBisectionEdge`'s
    // zero rate (S19) asks the same of the same operand; measured at this bar, it stays held (see there).
    //
    // MEASURED on dispatch 2's 580 cells. At the retired 1e-8, 37 evaluations of a rate in (2u, 1e-8) were
    // zeroed, on three cells: `Golf Cart` at 1e-6 and at 1e-5 (e16 and e21, |rate| 7.28e-16 = 3.3u) and the
    // jittered Circle 32 at 1 × 1e-8, seed 5 (e70, 6.22e-9). `k·u`, landed first in dispatch 3, priced all
    // of them and moved the `Golf Cart` digest pin (e16 and e21's `maxOffset` by tens of ulps); at 8u the
    // `Golf Cart` rates are zeroed again and its pin is back to native. What is now priced is e70 alone —
    // one bisector on one cell, 19 evaluations — and this site moves no cell: geometry,
    // verdict, node count, every oracle and every digest pin unmoved.
    const noGradient = offsetRateIsArithmeticZero(
        crossProduct(ray.basisVector, context.clockwiseParent(edge).basisVector));
    const deltaOffset = noGradient ? 0 : collisionDistanceFromBasisUnits(ray.basisVector, alongRay, context.clockwiseParent(edge).basisVector);
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
 * of an existing node. They really meet where their TIMES agree, which splits the
 * separation in proportion to how fast each converts travel into time. Returns `null` when
 * the two weighted rates cancel, leaving no time at which they agree.
 *
 * WEIGHTED BY CROSS-MULTIPLICATION (W-spec W19, W26). Each edge converts travel into distance
 * against its own clockwise parent at `r`, and into TIME at `r / w`. Setting
 * `(s_A + a·r_A)/w_A = (s_B + (sep − a)·r_B)/w_B` and clearing the denominators gives the numerator
 * and divisor below, and the zero test on the divisor is scaled by the same `w_A · w_B` that scaled
 * it. At unit weights every product is by `1.0` and the expression is the unweighted
 * `(s_B − s_A + sep·r_B) / (r_A + r_B)` in the same operation order — measured 0 mismatches in
 * 100 000 random operands.
 *
 * Returns `[alongA, alongB, uncertainty]`, the third being the meeting's pricing error budget (C8 spec
 * T12 as amended): the divisor carries at most `cancellationBound` of absolute error, so the quotient
 * `alongA` carries `|alongA| · cancellationBound / |combinedRate|` to first order — and `alongB =
 * separation − alongA` carries the same error. It is the head-on analogue of `k·u·|sep|/sin²θ`: a
 * division by a small evaluated quantity, charged its own rounding.
 */
function meetHeadOn(
    edgeA: InteriorEdge,
    edgeB: InteriorEdge,
    ray1: RayProjection,
    ray2: RayProjection,
    separation: number,
    context: StraightSkeletonSolverContext,
): [number, number, number] | null {
    const rateA = offsetRate(edgeA, ray1, context);
    const rateB = offsetRate(edgeB, ray2, context);
    const weightA = context.weightOf(context.clockwiseParent(edgeA).id);
    const weightB = context.weightOf(context.clockwiseParent(edgeB).id);
    const termA = rateA * weightB;
    const termB = rateB * weightA;
    const combinedRate = termA + termB;

    // A DIVISION-SAFETY TEST, NOT AN ANGLE QUESTION (spec A15's `meetHeadOn` row), RE-DERIVED FROM THE
    // UNIT ROUNDOFF (spec A6 as amended, journal decision 144) — it was `FLOATING_POINT_EPSILON·wA·wB`.
    // The question is whether the evaluated sum is distinguishable from an arithmetic zero, so the bar
    // is the sum's own rounding-error bound. Each rate is a cross product of unit vectors, off by at
    // most `k·u` absolutely (`k` = `CROSS_PRODUCT_ROUNDING_UNITS` = 2, argued in constants.ts); each
    // product by a weight and the final addition each round once (relative `u`). To first order:
    //
    //     |fl(sum) − sum|  ≤  k·u·(wA + wB)  +  2u·(|rateA·wB| + |rateB·wA|)   =: headOnCancellationBound
    //
    // A sum inside that bound has no sign and no magnitude the arithmetic can vouch for, so no time
    // at which the two agree can be computed from it: the pair has no head-on meeting (`null`).
    // At unit weights the bound is at most `8u ≈ 8.9e-16`, seven orders inside the old `1e-8`;
    // measured 2026-09-23, no evaluation on `FULL_CORPUS` falls between the two.
    // The bound is now one shared function (C8 spec T19), the same expression in the same order, so
    // this site and the two split divisors it is the pattern for (S33, S34) spend one bound bit for bit.
    const cancellationBound = weightedRateSumRoundingBound(termA, termB, weightA, weightB);
    if (Math.abs(combinedRate) <= cancellationBound) {
        return null;
    }

    const sourceOffsetA = sourceOffsetDistance(edgeA, context);
    const sourceOffsetB = sourceOffsetDistance(edgeB, context);
    const alongA = (sourceOffsetB * weightA - sourceOffsetA * weightB + separation * rateB * weightA)
        / combinedRate;

    return [alongA, separation - alongA, Math.abs(alongA) * cancellationBound / Math.abs(combinedRate)];
}

/**
 * When this pair of arrivals has HAPPENED — the offset by which both participants have reached the
 * meeting point, not the offset at which whichever of them reported the event got there.
 *
 * ONE EVENT MUST CARRY ONE TIME, and until this existed it did not. `offsetDistance` is measured
 * from `edgeA`'s clockwise parent and `offsetTarget` from `edgeB`'s, and `createCollisions` reports
 * every pair from both directions, so one physical arrival reached the solver as two events with two
 * different offsets. Measured on `OFF_EDGE_JITTER_L_SEED_55433_K4`: `ie42 x ie52` is reported at
 * 2.929716788515e-1 by `ie42` and 2.929716789418e-1 by `ie52` — 9.03e-11 apart, on an offset of
 * 2.93e-1 — while `ie42 x ie54` at the same point agrees to one ulp. With linear causality as the
 * solver's model (journal decision 102) that asymmetry is not cosmetic: it decides pairings, and it
 * let the LATEST arrival of a five-edge ring present itself as the earliest by naming the faster
 * participant's clock.
 *
 * NOT ROUNDING — THE WALLS ARE NOT CONCURRENT, and this was measured before the correction was
 * written. At that meeting point the perpendicular distance to `ie42`'s two parents is
 * 2.929716788515e-1 and to `ie52`'s is 2.929716789418e-1: each ray sits on its own equidistant locus
 * to within 3e-19, and the loci genuinely cross 9.03e-11 out of step. So there is no single true
 * offset to recover by computing more carefully — there is only the question of when the pair may be
 * treated as met, and the answer is when the slower of the two has arrived. The
 * `phantomDivergentOffset` test above already says the two readings must agree, at
 * `FLOATING_POINT_EPSILON`; this decides what to do inside that tolerance instead of picking the
 * instigator's reading and calling it the event's.
 *
 * WHAT IT COSTS THE CORPUS, MEASURED AGAINST A FULL-GRAPH DIGEST OF ALL 59 FIXTURES. Five of them —
 * `Near Regular Peanut 32`, `Near Regular Ellipse 32`, `Slightly Deformed Peanut 1` and `2`, and
 * `Near Regular Rosette5 40` — move by a node COORDINATE and nothing else: same nodes, same in and
 * out edges, same parents, worst movement 1.17e-13 in caller units on a 500-unit extent, which is
 * 2.3e-16 of extent and so under an ulp of the shape. The layer window and the coincidence medoid
 * both read this offset, and a member set at the window's edge is what shifts. The other 54 are
 * bit-identical. Three instrument counters move with it and are re-pinned where they live:
 * `near-regular-ring-loss-diagnosis` 40 to 33 fired, `offset-event-boundary-regression` 179 to 176
 * fired — both with `silentLosses` still empty, so those mutations became HARMLESS rather than
 * unreported — and `large-coordinate-known-failures`' half-merge split, [12,40] to [10,40].
 */
function arrivalOffsetOfPair(arrivalFromA: Arrival, arrivalFromB: Arrival): Arrival {
    // W-spec W18: `Math.max` on TIMES, decided by cross-multiplication. At unit weights the two
    // products are by `1.0` and this is `Math.max` on the two distances.
    return laterArrival(arrivalFromA, arrivalFromB);
}

/**
 * */
export function collideInteriorEdges(edgeA: InteriorEdge, edgeB: InteriorEdge, context: StraightSkeletonSolverContext): CollisionEvent[] {
    const ray1 = context.projectRayInterior(edgeA);
    const ray2 = context.projectRayInterior(edgeB);


    const intersectionData = intersectRays(ray1, ray2, context.coaxialityFloor, context.angularResolution);
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

    // THE PRICING ERROR BUDGET (C8 spec T12 as amended, journal decision 160(a)), one per verdict: a
    // 'converging' pair was priced by `intersectRays`' division by `sin θ`; a 'head-on' pair by
    // `meetHeadOn`'s division by the combined rate; a 'co-linear-from-1' pair was not priced at all —
    // its travel is the distance between two STORED sources, so it carries no pricing error (0).
    const uncertainty = resultType === 'converging'
        ? rayIntersectionUncertainty(ray1, ray2)
        : headOnMeeting?.[2] ?? 0;

    const arrivalA = arrivalOf(edgeA, context, ray1, alongRay1, uncertainty);
    const arrivalB = arrivalOf(edgeB, context, ray2, _alongRay2, uncertainty);

    const anyShared = checkSharedParents(edgeA.id, edgeB.id, context).includes(true);

    // W-spec W23. The two participants must agree on WHEN the meeting happens, which under weights
    // is an equi-time question and not an equi-distance one; the sign test stays on the distance,
    // because the weight is positive and cannot change it.
    //
    // S23 (C8 spec T14): the phantom test asks whether the two readings are ONE MOMENT. Its window is
    // held with the other six at `HELD_SIMULTANEITY_WINDOW` (T37 STOP, dispatches 1 and 2; see the
    // constant), per pair.
    const eventType: CollisionType = !arrivalsAreEqual(arrivalA, arrivalB, HELD_SIMULTANEITY_WINDOW) || arrivalA.distance <= 0
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

    const pairArrival = arrivalOffsetOfPair(arrivalA, arrivalB);
    events.push({
        offsetDistance: timeOf(pairArrival),
        arrival: pairArrival,
        collidingEdges: [edgeA.id, edgeB.id],
        position: findPositionAlongRay(ray1, alongRay1),
        intersectionData,
        eventType
    })

    return events
}

/**
 * The HEAD-ON event of an anti-parallel, pointing-together pair, priced as `collideInteriorEdges`
 * prices a pair `intersectRays` has called 'head-on' — used ONLY by the coaxial completion (spec A19,
 * journal decisions 136 and 145) in the triangle and n-gon handlers, where a sub-polygon with live
 * edges produced no event, no closure applied, and the completion names the pair the refused lane
 * should have admitted.
 *
 * THE SAME ARITHMETIC AS THE NORMAL LANE'S HEAD-ON ARM: the full separation is split where the two
 * participants' TIMES agree ({@link meetHeadOn}), and the event's arrival is the later of the two
 * readings. Two things differ, both because this is a completion and not a verdict:
 *
 *   - where `meetHeadOn` finds the weighted rates cancel to an arithmetic zero there is no time at
 *     which the two agree, and the normal lane would return no event; the completion instead meets
 *     them at the MIDPOINT of the separation, which is where two equal-rate fronts meet;
 *   - the event is never classified `phantomDivergentOffset`: the completion is the explicit claim
 *     that these two rays DO collide, so its type is the parent-sharing classification alone.
 */
export function priceHeadOnPair(
    edgeA: InteriorEdge,
    edgeB: InteriorEdge,
    context: StraightSkeletonSolverContext,
): CollisionEvent {
    const ray1 = context.projectRayInterior(edgeA);
    const ray2 = context.projectRayInterior(edgeB);
    const [, separation] = normalize(subtractVectors(ray2.sourceVector, ray1.sourceVector));

    // The midpoint fallback is a MODEL CHOICE, not a priced quantity — halving a stored separation — so
    // its pricing error budget is 0 (C8 spec T12 as amended); a priced meeting carries meetHeadOn's.
    const [alongRay1, alongRay2, uncertainty] = meetHeadOn(edgeA, edgeB, ray1, ray2, separation, context)
        ?? [separation / 2, separation / 2, 0];

    const pairArrival = arrivalOffsetOfPair(
        arrivalOf(edgeA, context, ray1, alongRay1, uncertainty),
        arrivalOf(edgeB, context, ray2, alongRay2, uncertainty));
    const anyShared = checkSharedParents(edgeA.id, edgeB.id, context).includes(true);

    return {
        offsetDistance: timeOf(pairArrival),
        arrival: pairArrival,
        collidingEdges: [edgeA.id, edgeB.id],
        position: findPositionAlongRay(ray1, alongRay1),
        intersectionData: [separation, separation, 'head-on'],
        eventType: anyShared ? 'interiorPair' : 'interiorNonAdjacent',
    };
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
        // W-spec W16. `maxOffset` is a TIME; it is restated as an arrival against this edge's own
        // clockwise-parent weight so the comparison is the division-free one every other tolerance
        // decision uses. At unit weights `maxOffset * 1.0` is exact and this is `>` on the two
        // distances.
        if (interiorEdge.maxOffset) {
            const boundWeight = context.weightOf(context.clockwiseParent(interiorEdge).id);
            // A bound, not a priced arrival: its uncertainty is 0, and the comparison is exact anyway (S31).
            const bound: Arrival = {distance: interiorEdge.maxOffset * boundWeight, weight: boundWeight, uncertainty: 0};
            if (compareArrivals(e.arrival, bound, 0) > 0) {
                e.eventType = 'outOfBounds';
            }
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
