import {Arrival, StraightSkeletonSolverContext, Vector2} from "./types";
import {dotProduct, negateVector, sineIsBelow, sizeOfVector, subtractVectors} from "./core-functions";
import {intersectRays, lateralOffset, symmetricLateralOffset} from "./intersection-edges";
import {
    arrivalOf,
    arrivalsAreEqual,
    birthArrivalOf,
    compareArrivals,
    nodePositionUncertainty,
    separationUncertainty,
} from "./collision-helpers";
import {retireBisectors} from "./wavefront-links";
import {HELD_SIMULTANEITY_WINDOW} from "./constants";

/*
 * THE TERMINAL LADDER (journal decision 145): what every per-arity handler climbs when a sub-polygon with live
 * interior edges produced no event. The closures, the coaxial completion, and the commit of a closure. The pair, the
 * triangle (`algorithm-termination-cases.ts`) and the n-gon (`algorithm-complex-cases.ts`) import from here, and this
 * module imports neither.
 */

/**
 * Does the ANCHOR at `separation` from a ray's source lie on that ray, travelling forward? — the closure's
 * point-on-ray ({@link solveDegenerateClosure}, census S11) in the COAXIAL FORM (C8 spec T11, T32; journal
 * decision 161(e)): forward by the EXACT sign of `dot(sep, basis)`, and the lateral `|cross(sep, basis)| /
 * |basis|` STRICTLY within the coaxiality lane λ (T7) — the lane `sourceLiesAhead` and the co-linear exits
 * read, asked of a point.
 *
 * ONE-SIDED, NOT SYMMETRIC (spec I8): the candidate is a node, not a ray, so there is no second line to
 * measure against and no winding sign to order the pair by. Acceptance wires edges to an EXISTING node and
 * moves nothing, so under T2 it answers a question — δ's class.
 *
 * A LATERAL BAR, NOT A SINE: a sine bar on a raw separation is a lateral bar that grows with the separation
 * (spec A9). The snap's point-on-ray ({@link pointLiesOnRay}, S10) is a different site and keeps the sine.
 * Measured: tolerance-derivation-decisions.md, "Measurement record", "anchorLiesOnRay: the closure's point-on-ray at the lane".
 */
function anchorLiesOnRay(separation: Vector2, basis: Vector2, coaxialityFloor: number): boolean {
    return dotProduct(separation, basis) > 0 && lateralOffset(separation, basis) < coaxialityFloor;
}

/**
 * Commit a degenerate closure: terminate the sub-polygon's edges at the closure point and accept
 * them all.
 *
 * Only edges without a target are terminated — the snap pre-pass can resolve one edge of a
 * sub-polygon before the collision path runs, and re-terminating it would duplicate its entry in
 * the target node's `inEdges`. An edge that closes onto its own source becomes a zero-length
 * self-loop and is marked `culled`, so consumers can tell this deliberate retirement apart from a
 * self-loop that would indicate a solver defect.
 */
export function applyDegenerateClosure(context: StraightSkeletonSolverContext, edgeIds: number[], position: Vector2): void {
    const unresolved = edgeIds.filter(id => context.getEdgeWithId(id).target === undefined);
    if (unresolved.length > 0) {
        // Every closure point is an EXISTING node's stored position (the anchor's, or the leading
        // source's), so `findOrAddNode` returns that node and keeps its own budget: this adds nothing
        // to it (journal-5 decision 167).
        context.terminateEdgesAtPoint(unresolved, position, 0);
    }

    for (const id of edgeIds) {
        const edge = context.getEdgeWithId(id);
        if (edge.target === edge.source) {
            context.getInteriorWithId(id).culled = true;
        }
    }

    context.acceptAll(edgeIds);
    // The closed sub-polygon's bisectors leave the wavefront (skeleton wavefront-order spec, decision 9).
    retireBisectors(context, edgeIds);
}

/**
 * The single point at which a degenerate sub-polygon closes, or `undefined` if it is not one.
 *
 * A sub-polygon whose exterior parents are all parallel has no offset gradient along the shared
 * axis: every remaining collision happens at one offset, and the pairwise machinery finds nothing —
 * head-on rates cancel (`meetHeadOn` returns null), collinear same-direction pairs meet at a
 * source rather than between sources, and the three-line terminal solve is singular. The closure
 * point in that regime is always the SOURCE of one of the surviving edges: the node the wavefront
 * had already fully converged on when those edges were born.
 *
 * Each edge's source is auditioned as that anchor. The candidate stands only if every other edge's
 * ray passes through it travelling forward, no edge would arrive before its own birth offset (the
 * same causality rule as `tryAttachEdgeToNode` and `notYetBorn`), and all edges agree on the
 * arrival offset — simultaneity is what makes this a terminal closure rather than an ordinary
 * collision that upstream machinery should have found.
 *
 * An anchor edge terminated at its own source becomes a zero-length self-loop: the deliberate
 * representation of a culled surplus bisector, since edge ids are array indices and removal is not
 * representable. Downstream consumers already account for this (`spine.ts` counts a self-loop as
 * degree two, never a leaf).
 */
export function solveDegenerateClosure(context: StraightSkeletonSolverContext, interiorEdgeIds: number[]): Vector2 | undefined {
    for (const anchorId of interiorEdgeIds) {
        const anchorPosition = context.sourcePosition(anchorId);
        const arrivals: Arrival[] = [];
        let valid = true;

        for (const edgeId of interiorEdgeIds) {
            const interior = context.getInteriorWithId(edgeId);
            const ray = context.projectRayInterior(interior);
            const birthArrival = birthArrivalOf(interior, context);
            const separation = subtractVectors(anchorPosition, ray.sourceVector);
            const distance = sizeOfVector(separation);

            // The anchor itself, and any edge already sourced at the anchor, arrives without travel.
            //
            // EXACT (C8 spec T9, census S12): every ray source is a STORED node position, so an edge
            // sourced at the anchor has a bit-identical source and a separation of exactly 0 — the u-bar's
            // degenerate case for stored doubles. No separation on the corpus, the fine translations or the
            // jitter sweeps falls in the band (0, 1e-8), so exactness admits no anchor a looser bar would.
            if (edgeId === anchorId || distance === 0) {
                arrivals.push(birthArrival);
                continue;
            }

            // Does the anchor lie on this edge's ray? The COAXIAL form, on the raw separation — see
            // {@link anchorLiesOnRay} (S11). The snap's point-on-ray is a
            // different site and stays held ({@link pointLiesOnRay}, S10).
            if (!anchorLiesOnRay(separation, ray.basisVector, context.coaxialityFloor)) {
                valid = false;
                break;
            }

            // S27 (C8 spec T14): the closure's birth-causality test; window held (T37 STOP, C12). The travel
            // is the distance from a node's position to the anchor node's, each carrying its own budget
            // (journal-5 decision 167).
            const arrival = arrivalOf(interior, context, ray, distance, separationUncertainty(
                nodePositionUncertainty(context, context.findSource(anchorId).id),
                nodePositionUncertainty(context, context.findSource(edgeId).id),
                distance));
            if (compareArrivals(arrival, birthArrival, HELD_SIMULTANEITY_WINDOW) < 0) {
                valid = false;
                break;
            }

            arrivals.push(arrival);
        }

        if (!valid) {
            continue;
        }

        // W-spec W31: SIMULTANEITY IS EQUI-TIME. The premise this closure rests on — all exterior
        // parents parallel, so one clock governs the whole sub-polygon — holds under weights only
        // for the ANTI-facing case. Same-facing parallel parents at unequal weights have a wavefront
        // with a MOVING step, and this check fails as it should, sending the step to the collision
        // path (W-spec W29).
        //
        // S25 (C8 spec T14): simultaneity ANCHORED on the first arrival — every arrival is compared with
        // that one, never chained (journal decision 155); window held (T37 STOP, C12; see constants.ts).
        if (arrivals.every(arrival => arrivalsAreEqual(arrival, arrivals[0], HELD_SIMULTANEITY_WINDOW))) {
            return anchorPosition;
        }
    }

    return undefined;
}

/**
 * Where a sub-polygon whose wavefront vertices all travel along ONE AXIS closes — all the same way,
 * or (spec A16) a corridor of opposed orientations with no head-on pair — or `undefined` when it is
 * not one.
 *
 * PARALLEL RAYS POINTING THE SAME WAY NEVER MEET, at any offset, so this sub-polygon has no future
 * event at all: every pair of its vertices holds its separation forever, and the ring they bound
 * keeps whatever area it has. That is a terminal state rather than a collision the generators failed
 * to find, which is why it is decided here instead of priced. It is what the near-floor off-edge
 * jitter class leaves behind: an exactly-collinear pair of non-adjacent walls — the plus's left wall,
 * rejoined into one supporting line when canonicalisation removes the sample that broke it — reduces
 * the ring to a slit whose two ends run side by side.
 *
 * ANTI-PARALLEL RAYS THAT ARE NOT HEAD-ON NEVER MEET EITHER (spec A16, journal decision 150), and
 * {@link antiParallelArmAdmits} is that arm: the bisector test is parallelism alone, at the
 * resolution, and orientation is asked separately — a same-direction set is admitted, and a set
 * carrying opposed orientations is admitted only when `intersectRays` prices none of its opposed
 * pairs `'head-on'`. A pairwise `directionsAreSame` test would exclude every anti-parallel pair at
 * any bar, so a corridor whose mid-lines miss the coaxiality lane would reach no closure at all —
 * only the coaxial completion, or with no pair pointing together, the throw.
 *
 * ONE QUESTION, ONE BAR (journal decision 107(a), spec A11): the parent gate and the bisector test
 * both ask parallelism, so both read the solve's angular resolution (spec A15, A20; journal decision
 * 146). The bisector test is a ray-direction question; the parent gate an input-geometry one, on the
 * RAW wall directions.
 * Measured: angular-predicate-basis-decisions.md, "Measurement record", "solveParallelClosure: the parent gate and the bisector test".
 *
 * THE ANCHOR IS THE LEADING SOURCE, and it has to be: every other edge terminated there travels
 * forward along its own basis, while any earlier anchor wires an edge to a point behind its own
 * source — the backwards-running edge journal decision 70 exists to prevent. The anchor edge closes
 * onto its own source as a culled self-loop, the representation {@link applyDegenerateClosure}
 * already uses for a surplus bisector. NO NODE MOVES: the leading source is an existing node, and
 * the other edges' targets are the only thing assigned.
 *
 * A set with no source every other edge reaches forward — two vertices exactly level across the ray,
 * or a RETREATING opposed pair, each source behind the other — is left to the rungs below and, with no
 * pair pointing together, to the throw: any anchor would wire an edge across its own wavefront or back
 * along it. The corpus contains no such set.
 *
 * GATED ON {@link solveDegenerateClosure}'S OWN PRECONDITION — all exterior parents parallel — and
 * that gate is what keeps this a closure rather than a cover-up. Parallel walls are the regime where
 * one offset governs the whole sub-polygon and a leading source is the point the wavefront reached;
 * where the walls are not parallel, parallel bisectors are evidence of a solve already corrupted
 * upstream, and closing them would convert a signalled failure into a complete answer with the
 * corruption still in it. With `intersectRays`' collinearity exits in the coaxial form (spec A15), the
 * large-coordinate cells of journal decisions 66 and 81 close at `handleInteriorEdgePair`'s collinear
 * branch before they reach this closure; the gate is held by the anti-parallel arm (spec A17, journal
 * decision 150): without it, `terminal-cases.test.ts`'s approaching pair on a SQUARE — walls not
 * parallel — is closed at its leading source instead of reaching the completion.
 * Measured: angular-predicate-basis-decisions.md, "Measurement record", "solveParallelClosure: the parallel-walls gate".
 */
function solveParallelClosure(
    context: StraightSkeletonSolverContext,
    interiorEdgeIds: number[],
): Vector2 | undefined {
    const parents = distinctExteriorParents(context, interiorEdgeIds)
        .map(parentId => context.getEdgeWithId(parentId).basisVector);
    for (let i = 0; i < parents.length; i++) {
        for (let j = i + 1; j < parents.length; j++) {
            if (!sineIsBelow(parents[i], parents[j], context.angularResolution)) {
                return undefined;
            }
        }
    }

    const bases = interiorEdgeIds.map(id => context.getEdgeWithId(id).basisVector);
    for (let i = 0; i < bases.length; i++) {
        for (let j = i + 1; j < bases.length; j++) {
            if (!sineIsBelow(bases[i], bases[j], context.angularResolution)) {
                return undefined;
            }
        }
    }

    if (!antiParallelArmAdmits(context, interiorEdgeIds, bases)) {
        return undefined;
    }

    // THE LEADING SOURCE, for either arm: a source that EVERY other live edge reaches travelling
    // forward along its own basis. In a same-direction set that is the one source strictly ahead of
    // all the others, and it is unique. In a corridor (opposed orientations) it is a source ahead of
    // every edge of its own orientation AND ahead of every edge of the other — for an approaching pair
    // BOTH sources qualify, each lying ahead of the other, and the tie is broken by the lower edge id,
    // a function of the edges themselves rather than of the order the partition handed them over. A
    // set in which no source is reached forward by all the others — a retreating pair, or two sources
    // level across the corridor — has no leading source and is left to the rungs below.
    let leading: {edgeId: number; position: Vector2} | undefined;
    for (const anchorId of interiorEdgeIds) {
        const anchorPosition = context.sourcePosition(anchorId);
        const leads = interiorEdgeIds.every((edgeId, index) => edgeId === anchorId
            || dotProduct(subtractVectors(anchorPosition, context.sourcePosition(edgeId)), bases[index]) > 0);
        if (leads && (leading === undefined || anchorId < leading.edgeId)) {
            leading = {edgeId: anchorId, position: anchorPosition};
        }
    }

    return leading?.position;
}

/**
 * SPEC A16 — THE ANTI-PARALLEL ARM of {@link solveParallelClosure}. Does a set whose bases are all
 * parallel to within the angular resolution admit a closure?
 *
 * A SAME-DIRECTION set always does: parallel rays pointing the same way never meet.
 *
 * A set carrying OPPOSED orientations is a CORRIDOR, the case spec A13 names: "identical direction" is
 * orientation-sensitive, so an anti-parallel pair below the resolution is neither priceable (cell (a))
 * nor identical (cell (b)), and without this arm a pair outside the coaxiality lane would reach only
 * the coaxial completion or the throw. Each OPPOSED pair is classified by `intersectRays`, the
 * solver's own verdict:
 *
 *   - `'head-on'` — coaxial within the lane and approaching — is PRICED, not closed: the set is
 *     returned to the path that prices head-on verdicts (the pair handler's head-on branch, or
 *     `collideInteriorEdges` at the other arities, and where exactly parallel walls give both
 *     mid-lines a zero offset rate so that `meetHeadOn` has no time to return, the coaxial
 *     completion below — which names that pair INSIDE the lane);
 *   - everything else — coaxial and retreating, or not coaxial in either direction — has NO future
 *     event: two anti-parallel rays on different lines pass each other, and two on one line that
 *     retreat never meet. The set is CLOSED at the leading source, as the same-direction arm closes.
 *
 * Ordering (ii) of spec A12, applied to the one sub-case that needs it (A13): one branch, not a band.
 * The parent gate of {@link solveParallelClosure} (spec A17) guards it.
 */
function antiParallelArmAdmits(
    context: StraightSkeletonSolverContext,
    interiorEdgeIds: number[],
    bases: Vector2[],
): boolean {
    for (let i = 0; i < interiorEdgeIds.length; i++) {
        for (let j = i + 1; j < interiorEdgeIds.length; j++) {
            if (dotProduct(bases[i], bases[j]) > 0) {
                continue;
            }
            const [, , verdict] = intersectRays(
                context.projectRayInterior(context.getInteriorWithId(interiorEdgeIds[i])),
                context.projectRayInterior(context.getInteriorWithId(interiorEdgeIds[j])),
                context.coaxialityFloor,
                context.angularResolution,
            );
            if (verdict === 'head-on') {
                return false;
            }
        }
    }
    return true;
}

/** One anti-parallel, pointing-together pair, with the symmetric lateral offset that priced it. */
interface CoaxialCompletion {
    firstId: number;
    secondId: number;
    /** The symmetric lateral offset between the two sources, in unit space. */
    offset: number;
}

/**
 * THE COMPLETION ON A NO-EVENT REFUSAL — spec A19, journal decision 136 as amended.
 *
 * Reached only where a sub-polygon with LIVE interior edges has produced no collision event in
 * either ordering and no closure applies. That state is not a per-pair verdict and it is not a
 * geometry the model admits: a bounded wavefront with live vertices MUST have a next event, which is
 * a theorem of the exact geometry. So "live vertices, no event" can only be a predicate rejecting,
 * over-cautiously, an event that exists — and logically the two rays DO collide while the arithmetic
 * could not see it inside the lane.
 *
 * The answer the model supplies: among the anti-parallel, pointing-together pairs, the one with the
 * SMALLEST symmetric lateral offset is the pair that collides, and it is priced `head-on`. The gate
 * for "anti-parallel" is `intersectRays`' own — the solve's angular resolution — so this narrows
 * nothing that the normal lane already decided; the offset ordering is the
 * same symmetric measure {@link sourceLiesAhead} tests against the lane, used here to rank rather
 * than to admit.
 *
 * NARROW ONLY ON REFUSAL (F44's pattern, F27's restraint gate). The normal lane at the client's
 * floor decides everything the corpus needs; this runs only after that lane has refused, so no solve
 * the lane decides pays for it, and a firing is a SECOND SPECIMEN to be reported rather than a
 * tolerance to be widened. `coaxial-lane.test.ts` pins the corpus count at zero at two floors.
 *
 * Returns `undefined` when there is no candidate pair at all, and the throw then stands — removing
 * it would convert a signalled failure into a silent one.
 *
 * ALREADY EDGE-COUNT INDEPENDENT: it ranks every pair of the live set, so the triangle and the n-gon
 * reach it unchanged through {@link climbTerminalLadder} (journal decision 145).
 */
function findCoaxialCompletion(
    context: StraightSkeletonSolverContext,
    interiorEdgeIds: number[],
): CoaxialCompletion | undefined {
    let best: CoaxialCompletion | undefined;

    for (let i = 0; i < interiorEdgeIds.length; i++) {
        for (let j = i + 1; j < interiorEdgeIds.length; j++) {
            const firstId = interiorEdgeIds[i];
            const secondId = interiorEdgeIds[j];
            const first = context.projectRayInterior(context.getInteriorWithId(firstId));
            const second = context.projectRayInterior(context.getInteriorWithId(secondId));

            // ANTI-PARALLEL PER THE EXISTING GATE, and opposed in orientation by the exact sign —
            // the same two halves `intersectRays` splits its parallel branch on.
            if (!sineIsBelow(first.basisVector, second.basisVector, context.angularResolution)
                || dotProduct(first.basisVector, second.basisVector) >= 0) {
                continue;
            }

            // POINTING TOGETHER, ASKED BOTH WAYS. Each ray must run towards the other's source.
            const separation = subtractVectors(second.sourceVector, first.sourceVector);
            if (!(dotProduct(separation, first.basisVector) > 0
                && dotProduct(negateVector(separation), second.basisVector) > 0)) {
                continue;
            }

            const offset = symmetricLateralOffset(separation, first.basisVector, second.basisVector);
            if (best === undefined || offset < best.offset) {
                best = {firstId, secondId, offset};
            }
        }
    }

    return best;
}

/** A rung of the terminal ladder that applied, and what it decided (journal decision 145). */
export type TerminalLadderRung =
    | {rung: 'closure'; position: Vector2}
    | {rung: 'completion'; completion: CoaxialCompletion};

/**
 * THE TERMINAL LADDER, INDEPENDENT OF EDGE COUNT — journal decision 145.
 *
 * Reached by every per-arity handler — the pair, the triangle and the n-gon — at the one state they
 * share: a sub-polygon with live interior edges for which the collision generators produced no
 * event. An n-gon whose live edges meet at a point is a generalisation of the triangle, so every
 * handler climbs the same rungs in the same order.
 *
 *   1. THE CLOSURES — statements about the whole live set, and TERMINAL solves.
 *      {@link solveDegenerateClosure} (every live edge closes on one source at one shared offset),
 *      then {@link solveParallelClosure} (every live vertex travels the same way, so no future event
 *      exists). Returns the closure point; the caller applies it with {@link applyDegenerateClosure}.
 *   2. THE COMPLETION — a RECOVERY FROM REFUSAL (spec A19, journal decision 136 as amended). A
 *      bounded wavefront with live vertices must have a next event, so a no-event state is a
 *      predicate refusing one that exists: {@link findCoaxialCompletion} names the anti-parallel,
 *      pointing-together pair of smallest symmetric lateral offset. It is RECORDED here as a
 *      `coaxial-completion` diagnostic, so it is signalled and never silent; the caller prices the
 *      pair head-on in its own arity's terms.
 *   3. `undefined` — no rung applies and NO CANDIDATE PAIR EXISTS. The caller throws: removing that
 *      throw would convert a signalled failure into a silent one.
 *
 * Journal decision 78's many-way clustering is a different case: it handles arrivals that are found and coincide;
 * this ladder covers the state where no arrival is found at all.
 */
export function climbTerminalLadder(
    context: StraightSkeletonSolverContext,
    interiorEdgeIds: number[],
): TerminalLadderRung | undefined {
    const closure = solveDegenerateClosure(context, interiorEdgeIds)
        ?? solveParallelClosure(context, interiorEdgeIds);
    if (closure !== undefined) {
        return {rung: 'closure', position: closure};
    }

    const completion = findCoaxialCompletion(context, interiorEdgeIds);
    if (completion !== undefined) {
        context.diagnostics.push({
            kind: 'coaxial-completion',
            detail: `Sub-polygon [${interiorEdgeIds.join(', ')}] produced no event and no `
                + `closure; completed by pricing e${completion.firstId} against `
                + `e${completion.secondId} as head-on at a symmetric lateral offset of `
                + `${completion.offset} against a coaxiality lane of ${context.coaxialityFloor}.`,
        });
        return {rung: 'completion', completion};
    }

    return undefined;
}

/** The exterior edges bounding these interior edges' faces, deduplicated, in first-seen order. */
export function distinctExteriorParents(context: StraightSkeletonSolverContext, interiorEdgeIds: number[]): number[] {
    const parents: number[] = [];
    for (const edgeId of interiorEdgeIds) {
        const interior = context.getInteriorWithId(edgeId);
        for (const parent of [interior.clockwiseExteriorEdgeIndex, interior.widdershinsExteriorEdgeIndex]) {
            if (!parents.includes(parent)) {
                parents.push(parent);
            }
        }
    }
    return parents;
}
