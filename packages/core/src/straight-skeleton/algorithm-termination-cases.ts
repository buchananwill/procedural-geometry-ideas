import {
    AlgorithmStepInput,
    AlgorithmStepOutput, Arrival, CollisionEvent,
    PolygonNode,
    SkeletonDiagnostic,
    SkeletonSolveResult,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "./types";
import {stepLog} from "./logger";
import {
    areEqual,
    crossProduct,
    directionsAreSame,
    dotProduct,
    makeBasis,
    negateVector,
    rotateCw90,
    sineIsBelow,
    sizeOfVector,
    subtractVectors
} from "./core-functions";
import {intersectRays, symmetricLateralOffset} from "./intersection-edges";
import {
    arrivalOf,
    arrivalsAreEqual,
    bestNonPhantomCollision,
    birthArrivalOf,
    collideInteriorEdges,
    compareArrivals,
} from "./collision-helpers";
import {makeStraightSkeletonSolverContext} from "./solver-context";
import {initInteriorEdges, tryToAcceptExteriorEdge} from "./algorithm-helpers";
import {addInEdges} from "./graph-helpers";
import {handleInteriorNGon} from "./algorithm-complex-cases";
import {
    DIRECTION_SINE_BAR,
    FLOATING_POINT_EPSILON,
    MAX_WEIGHT_RATIO,
    MIN_WEIGHT_TURN_SINE,
    PARALLEL_GATE_SINE_BAR,
    TRIANGLE_INTERSECT_PAIRINGS,
} from "./constants";
import {decomposePolygon} from "./polygon-decomposition";
import {mergeSkeletonGraphs, makeMergedSolverContext} from "./graph-merge";
import {isClockwise} from "../random-polygon/geometry-helpers";
import {
    SkeletonNormalisation,
    denormaliseCollisionCache,
    denormaliseGraph,
    makeSkeletonNormalisation,
    normalisePolygon,
} from "./normalisation";
import {
    CanonicalPolygon,
    PerceptualFloorOptions,
    REMOVED_VERTEX_INDEX,
    SKELETON_NOISE_FLOOR,
    canonicalisePolygon,
    resolvePerceptualFloor,
} from "./canonicalisation";

function stringifyFinalData(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): string {
    return `{"polygonEdges" :${JSON.stringify(context.getEdges(input.interiorEdges))}, "interiorEdges": ${JSON.stringify(context.getInteriorEdges(input.interiorEdges))}, "sourceNodes": ${JSON.stringify(input.interiorEdges.map(e => context.graph.nodes[context.getEdgeWithId(e).source]))}}`
}

/**
 * The ARRIVAL at which a node was created, derived the same way the solver derives it
 * everywhere else (W-spec W30). Exterior nodes sit on the boundary, so their arrival is zero
 * distance against any weight; an interior node is born at the birth arrival of any bisector
 * emitted from it.
 *
 * Returns `undefined` for a terminal interior node, which emits nothing and therefore has no
 * arrival recorded anywhere for us to read.
 */
function nodeOffset(context: StraightSkeletonSolverContext, node: PolygonNode): Arrival | undefined {
    if (node.id < context.graph.numExteriorNodes) {
        // Zero distance is time zero against every positive weight, so the weight here is a
        // formality; `1` keeps the pair's arithmetic exactly today's.
        return {distance: 0, weight: 1};
    }

    const outInterior = node.outEdges.find(id => context.edgeRank(id) !== 'exterior');
    if (outInterior === undefined) {
        return undefined;
    }

    return birthArrivalOf(context.getInteriorWithId(outInterior), context);
}

/**
 * For a given edge, scan all existing nodes to see if any node lies exactly
 * along the edge's basis direction from its source.  If found, wire up
 * target / inEdges and return true.
 *
 * Several nodes can be collinear with the ray — an apex vertex sits directly beyond the
 * ridge node it feeds, for instance — so the *nearest* one wins. A bisector ends where the
 * wavefront next arrives, and taking any further node instead runs the edge backwards
 * through skeleton the solver has already resolved.
 *
 * CAUSALITY. This snap pass is an *early* part of the algorithm, written to close the
 * terminal scenario when the skeleton fully solves, and reached only from
 * `handleInteriorEdgePair`, the two-edge base case. It predates the tighter runtime checks
 * added later, and because it assigns `target` directly — computing no offset and building
 * no `CollisionEvent` — none of them can see it: not `validateSplitReachesEdge`'s
 * `notYetBorn` guard, not the `phantomDivergentOffset` classification in
 * `collideInteriorEdges`, not the `outOfBounds` check against `maxOffset`. Its own
 * `distance > 0` test is only a proxy for causality, and holds only while the bisector points
 * inward; a *secondary* bisector aimed at a distant original polygon vertex marches forward
 * along its ray but backwards in time. So the same birth-relative rule the collision path
 * applies is applied here explicitly: a snap is a collision at `distance` along the ray, so
 * its offset must not be earlier than the bisector's own birth offset. `makeOffsetDistance`
 * and `sourceOffsetDistance` are reused verbatim so this rule cannot drift away from
 * `notYetBorn`.
 */
function tryAttachEdgeToNode(context: StraightSkeletonSolverContext, edgeId: number): boolean {
    const edgeData = context.getEdgeWithId(edgeId);
    const source = context.findSource(edgeId);
    const interiorEdge = context.getInteriorWithId(edgeId);
    const ray = context.projectRayInterior(interiorEdge);
    const birthArrival = birthArrivalOf(interiorEdge, context);

    let nearest: PolygonNode | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < context.graph.nodes.length; i++) {
        if (i === edgeData.source) continue;
        const candidate = context.graph.nodes[i];
        const separation = subtractVectors(candidate.position, source.position);
        const distance = sizeOfVector(separation);
        // POINT-ON-RAY, ASKED OF THE RAW SEPARATION (journal decision 105). This was
        // `vectorsAreEqual(normalize(separation), basis)` — a component box on a normalised vector,
        // which is the form the ruling removes: the division by `distance` is unbounded as the
        // candidate approaches the source, so the nearest nodes — exactly the ones this loop is
        // looking for — were judged on the noisiest reading of their own direction.
        if (!(distance > 0 && distance < nearestDistance
            && directionsAreSame(separation, edgeData.basisVector, DIRECTION_SINE_BAR))) {
            continue;
        }

        // Same tolerance convention as `notYetBorn`: a snap exactly at the birth arrival is
        // legitimate, only a strictly earlier one is rejected (W-spec W30).
        const snapArrival = arrivalOf(interiorEdge, context, ray, distance);
        if (compareArrivals(snapArrival, birthArrival) < 0) {
            stepLog.debug(
                `Rejecting snap of e${edgeId} to node ${candidate.id}: snap arrival ${snapArrival.distance}/${snapArrival.weight} precedes the bisector's birth arrival ${birthArrival.distance}/${birthArrival.weight}.`,
            );
            continue;
        }

        // Stronger form, mirroring the phantom classifier: both sides must agree on when the
        // meeting happens, so the candidate's own birth offset has to match the offset this
        // bisector computes on arriving there. This earns its keep beyond the birth check above.
        // A snap mutates two things — `target` here and `inEdges` on the node — but only
        // `target` is ever rewritten downstream, so a snap that is later superseded leaves the
        // node permanently claiming an in-edge that no longer points at it. On the peanut the
        // birth check alone still let e67 and e68 snap outward before a later pass corrected
        // their targets, leaving nodes 31 and 35 holding exactly such phantom in-edges.
        const candidateArrival = nodeOffset(context, candidate);
        if (candidateArrival !== undefined && !arrivalsAreEqual(candidateArrival, snapArrival)) {
            stepLog.debug(
                `Rejecting snap of e${edgeId} to node ${candidate.id}: node exists at time ${candidateArrival.distance / candidateArrival.weight} but the bisector arrives at ${snapArrival.distance / snapArrival.weight}.`,
            );
            continue;
        }

        nearest = candidate;
        nearestDistance = distance;
    }

    if (nearest === undefined) {
        return false;
    }

    edgeData.target = nearest.id;
    addInEdges(nearest, [edgeId]);
    return true;
}

/**
 * Pre-pass: try to resolve every edge in the input by snapping it to an
 * existing node.  Returns the list of edge IDs that could NOT be resolved
 * (and therefore still need collision handling).
 */
function resolveEdgesPointingAtNodes(context: StraightSkeletonSolverContext, edgeIds: number[]): number[] {
    const unresolved: number[] = [];
    for (const id of edgeIds) {
        if (!tryAttachEdgeToNode(context, id)) {
            unresolved.push(id);
        }
    }
    return unresolved;
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
function applyDegenerateClosure(context: StraightSkeletonSolverContext, edgeIds: number[], position: Vector2): void {
    const unresolved = edgeIds.filter(id => context.getEdgeWithId(id).target === undefined);
    if (unresolved.length > 0) {
        context.terminateEdgesAtPoint(unresolved, position);
    }

    for (const id of edgeIds) {
        const edge = context.getEdgeWithId(id);
        if (edge.target === edge.source) {
            context.getInteriorWithId(id).culled = true;
        }
    }

    context.acceptAll(edgeIds);
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
function solveDegenerateClosure(context: StraightSkeletonSolverContext, interiorEdgeIds: number[]): Vector2 | undefined {
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
            if (edgeId === anchorId || areEqual(distance, 0)) {
                arrivals.push(birthArrival);
                continue;
            }

            // Same point-on-ray predicate as `tryAttachEdgeToNode`, on the raw separation — see
            // there for why normalising first was the defect rather than the convenience.
            if (!directionsAreSame(separation, ray.basisVector, DIRECTION_SINE_BAR)) {
                valid = false;
                break;
            }

            const arrival = arrivalOf(interior, context, ray, distance);
            if (compareArrivals(arrival, birthArrival) < 0) {
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
        if (arrivals.every(arrival => arrivalsAreEqual(arrival, arrivals[0]))) {
            return anchorPosition;
        }
    }

    return undefined;
}

/**
 * Where a sub-polygon whose wavefront vertices all travel in the SAME direction closes, or
 * `undefined` when it is not one.
 *
 * PARALLEL RAYS POINTING THE SAME WAY NEVER MEET, at any offset, so this sub-polygon has no future
 * event at all: every pair of its vertices holds its separation forever, and the ring they bound
 * keeps whatever area it has. That is a terminal state rather than a collision the generators failed
 * to find, which is why it is decided here instead of priced. It is what the near-floor off-edge
 * jitter class leaves behind: an exactly-collinear pair of non-adjacent walls — the plus's left wall,
 * rejoined into one supporting line when canonicalisation removes the sample that broke it — reduces
 * the ring to a slit whose two ends run side by side.
 *
 * THE SAME-DIRECTION TEST IS `intersectRays`' OWN: parallel and pointing the same way in one
 * predicate, so the anti-parallel pair that shares the 'parallel' verdict — two vertices retreating
 * from each other — is excluded rather than closed. It was written as `areEqual(dot, 1)`.
 *
 * ONE QUESTION, ONE BAR — journal decision 107(a). This function used to ask parallelism twice, four
 * orders apart: the parent gate below at {@link DIRECTION_SINE_BAR} (1e-8, a cross product against
 * zero from the start) and this bisector test at `PARALLEL_GATE_SINE_BAR` (1.4142e-4, inherited from
 * `areEqual(dot, 1)`). MEASURED 2026-08-29, and the two bars are NOT symmetric in what they hold up:
 *   - Loosening the PARENT gate to the gate bar is caught — the plus's pinned 4-of-80 off-edge
 *     jitter cells move (`along-edge-jitter-known-failures.test.ts`). It is load-bearing at 1e-8.
 *   - Tightening THIS test to `DIRECTION_SINE_BAR` is caught by NOTHING: the corpus digest is
 *     bit-identical across all 59 fixtures and the whole suite passes.
 * The four orders were unconvicted headroom on this corpus rather than a measured requirement, and
 * a value no instrument can see is the class the tolerance audit flagged (canonicalisation's
 * segment-vs-line stood unconvicted for years). Both readings of "these directions agree" now sit at
 * `DIRECTION_SINE_BAR`, so a bisector set and its parent set are held to the same standard of
 * parallelism, which is what makes the gate's argument about the two apply.
 *
 * THE ANCHOR IS THE LEADING SOURCE, and it has to be: every other edge terminated there travels
 * forward along its own basis, while any earlier anchor wires an edge to a point behind its own
 * source — the backwards-running edge journal decision 70 exists to prevent. The anchor edge closes
 * onto its own source as a culled self-loop, the representation {@link applyDegenerateClosure}
 * already uses for a surplus bisector. NO NODE MOVES: the leading source is an existing node, and
 * the other edges' targets are the only thing assigned.
 *
 * A set with no strictly-leading source — two vertices exactly level across the ray — is left to the
 * throw, because either choice would wire an edge across its own wavefront rather than along it. The
 * corpus contains no such set.
 *
 * GATED ON {@link solveDegenerateClosure}'S OWN PRECONDITION — all exterior parents parallel — and
 * that gate is what keeps this a closure rather than a cover-up. Parallel walls are the regime where
 * one offset governs the whole sub-polygon and a leading source is the point the wavefront reached;
 * where the walls are not parallel, parallel bisectors are evidence of a solve already corrupted
 * upstream, and closing them would convert a signalled failure into a complete answer with the
 * corruption still in it. Measured: without the gate this closes every large-coordinate cell of
 * journal decisions 66 and 81 — whose graphs have shattered a 48-way hub into ten nodes and carry
 * backwards-running edges — and reports them complete.
 */
function solveParallelClosure(
    context: StraightSkeletonSolverContext,
    interiorEdgeIds: number[],
): Vector2 | undefined {
    const parents = distinctExteriorParents(context, interiorEdgeIds)
        .map(parentId => context.getEdgeWithId(parentId).basisVector);
    for (let i = 0; i < parents.length; i++) {
        for (let j = i + 1; j < parents.length; j++) {
            if (!sineIsBelow(parents[i], parents[j], DIRECTION_SINE_BAR)) {
                return undefined;
            }
        }
    }

    const bases = interiorEdgeIds.map(id => context.getEdgeWithId(id).basisVector);
    for (let i = 0; i < bases.length; i++) {
        for (let j = i + 1; j < bases.length; j++) {
            if (!directionsAreSame(bases[i], bases[j], DIRECTION_SINE_BAR)) {
                return undefined;
            }
        }
    }

    for (const anchorId of interiorEdgeIds) {
        const anchorPosition = context.sourcePosition(anchorId);
        const leads = interiorEdgeIds.every((edgeId, index) => edgeId === anchorId
            || dotProduct(subtractVectors(anchorPosition, context.sourcePosition(edgeId)), bases[index]) > 0);
        if (leads) {
            return anchorPosition;
        }
    }

    return undefined;
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
 * for "anti-parallel" is the EXISTING one — `intersectRays`' own parallel gate, unchanged by this
 * package — so this narrows nothing that the normal lane already decided; the offset ordering is the
 * same symmetric measure {@link sourceLiesAhead} tests against the lane, used here to rank rather
 * than to admit.
 *
 * NARROW ONLY ON REFUSAL (F44's pattern, F27's restraint gate). The normal lane at the client's
 * floor decides everything the corpus needs; this runs only after that lane has refused, so no solve
 * that succeeds today pays for it, and a firing is a SECOND SPECIMEN to be reported rather than a
 * tolerance to be widened. `coaxial-lane.test.ts` pins the corpus count at zero at two floors.
 *
 * Returns `undefined` when there is no candidate pair at all, and the throw then stands — removing
 * it would convert a signalled failure into a silent one.
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
            if (!sineIsBelow(first.basisVector, second.basisVector, PARALLEL_GATE_SINE_BAR)
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

export function handleInteriorEdgePair(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length !== 2) {
        throw new Error("Invalid call: expecting two interior edges");
    }

    const remaining = resolveEdgesPointingAtNodes(context, input.interiorEdges);

    // All edges resolved without collision
    if (remaining.length === 0) {
        context.acceptAll(input.interiorEdges);
        return {childSteps: []};
    }

    // One edge resolved, the other still needs a target — try to snap it too
    if (remaining.length === 1) {
        // The resolved edge created a new target node; re-attempt the remaining one
        if (tryAttachEdgeToNode(context, remaining[0])) {
            context.acceptAll(input.interiorEdges);
            return {childSteps: []};
        }
    }

    // Fall back to collision-based resolution
    const [id1, id2] = input.interiorEdges;
    const interior1 = context.getInteriorWithId(id1);
    const interior2 = context.getInteriorWithId(id2);

    // ANTI-PARALLEL IS NOT HEAD-ON. This used to test `dot(basis1, basis2) === -1` and cross-wire
    // on the strength of it, which is wrong: two bisectors pointing directly *away* from each
    // other are equally anti-parallel. Cross-wiring those makes each terminate at the other's
    // source, so both edges run backwards along their own basis — a 2-cycle in which the
    // wavefront vertex is drawn travelling the opposite way to the direction it actually moves.
    //
    // `intersectRays` already draws the distinction the dot product cannot. Its anti-parallel
    // branch returns 'head-on' only when the other ray's source lies *ahead* along this ray, and
    // 'parallel' when it lies behind. No new geometric rule is needed here; the existing one just
    // has to be consulted rather than re-derived badly.
    const [, , pairIntersection] = intersectRays(
        context.projectRayInterior(interior1),
        context.projectRayInterior(interior2),
        context.coaxialityFloor,
    );

    // Head on Collision
    if (pairIntersection === 'head-on') {
        context.crossWireEdges(id1, id2);
    } else if (pairIntersection === 'identical-source') {
        // A SHARED SOURCE IS A TERMINAL STATE, NOT A FAILURE. Rays leaving one point in different
        // directions do not intersect, and there is nothing left for them to propagate into: the
        // wavefront has finished. `intersectRays` classifies coincident sources first, before every
        // other test, and that verdict is already computed above for the head-on check — it was
        // then discarded by `NO_COLLISION_RESULTS` as "no collision" so that the collision branch
        // below threw two lines later. No new predicate and no new tolerance is introduced here; an
        // existing decision simply stops being thrown away.
        context.terminateEdgesAtPoint([id1, id2], context.sourcePosition(id1));
    } else {
        const collisions = collideInteriorEdges(interior1, interior2, context);

        if (collisions.length === 0) {
            // A collinear same-direction pair in a fully degenerate closure (all exterior parents
            // parallel, zero offset delta) produces no pairwise collision in either ordering:
            // the meeting point is the leading edge's source, not a point between sources. Close
            // it there, culling the leading edge as a self-loop.
            const closure = solveDegenerateClosure(context, input.interiorEdges);
            if (closure !== undefined) {
                applyDegenerateClosure(context, input.interiorEdges, closure);
                return {childSteps: []};
            }

            // 'co-linear-from-2' defers to "the other edge's" pass, which only exists where both
            // orderings are generated (the n-gon path). This base case runs one ordering, so the
            // deferral has to be honoured here by trying the reverse ordering explicitly.
            collisions.push(...collideInteriorEdges(interior2, interior1, context));
        }

        if (collisions.length === 0) {
            // Nothing collided in either ordering and no anchor closes the pair, so the last
            // question is whether a collision was ever possible. Same-direction parallel rays are
            // the case where it was not.
            const parallelClosure = solveParallelClosure(context, input.interiorEdges);
            if (parallelClosure !== undefined) {
                applyDegenerateClosure(context, input.interiorEdges, parallelClosure);
                return {childSteps: []};
            }

            // THE COMPLETION, BEFORE THE THROW (spec A19). See {@link findCoaxialCompletion}: this
            // is the state the model says cannot exist, so it is completed rather than refused, and
            // the completion is recorded so it is signalled and never silent.
            const completion = findCoaxialCompletion(context, input.interiorEdges);
            if (completion !== undefined) {
                context.diagnostics.push({
                    kind: 'coaxial-completion',
                    detail: `Sub-polygon [${input.interiorEdges.join(', ')}] produced no event and no `
                        + `closure; completed by pricing e${completion.firstId} against `
                        + `e${completion.secondId} as head-on at a symmetric lateral offset of `
                        + `${completion.offset} against a coaxiality lane of ${context.coaxialityFloor}.`,
                });
                context.crossWireEdges(completion.firstId, completion.secondId);
                context.acceptAll(input.interiorEdges);
                return {childSteps: []};
            }

            throw new Error(`Unable to generate any collision from last two edges: ${stringifyFinalData(context, input)}`)
        }

        // Pick the best (lowest offset, non-phantom) collision
        const best = bestNonPhantomCollision(collisions)!;

        // A COLLINEAR SAME-DIRECTION PAIR CLOSES ON ITS LEADING SOURCE. It is not a head-on pair and
        // must not be cross-wired: both rays run the SAME way along one line, so wiring each to the
        // other's source sends the leading one BACKWARDS along its own basis — journal decision 70's
        // defect — and leaves two bisectors spanning one node pair where the ridge admits one (I5).
        //
        // This is the near-anti-parallel corridor, and the exactly-anti-parallel one is a different
        // case that does not reach here. Where the two walls are exactly parallel the bisector offset
        // rate is zero, `addBisectionEdge` takes its direction from the ordered parent pair, and the
        // two mid-lines are born pointing at each other — `intersectRays` calls that 'head-on' and
        // the mid-line legitimately carries two half-edges, one per face. Where the walls are skewed
        // by even a few parts in 1e5 the rate is non-zero and decides both directions, so both
        // mid-lines point the SAME way — up the widening corridor, the direction the wavefront clock
        // runs — and the trailing one simply reaches the leading one's source. The leading bisector
        // has no wavefront left to trace and retires as a culled self-loop.
        //
        // THE CLOSURE IS `solveParallelClosure`'S ANCHOR RULE, applied where the geometry has already
        // been decided rather than guessed: that function's header states this argument in full and
        // is gated to the exactly-parallel regime because it is reached with NO collision at all, so
        // it must first establish that a collision was impossible. Here `intersectRays` has already
        // classified the pair as collinear and same-direction; the only remaining question is which
        // source leads, and the raw separation answers it with no tolerance. NO NODE MOVES — the
        // leading source is an existing node and only the other edge's target is assigned.
        //
        // MEASURED: at native placement this branch is reached exactly twice across the 59-fixture
        // corpus, both on `OFF_EDGE_JITTER_PLUS_SEED_7919`, and both were I5 crossed-pairing pins
        // carrying a direction violation apiece. It is reached again on the large-coordinate cells
        // journal decisions 66/81 accept, where it retires a bisector that used to be wired back to
        // an EXTERIOR node; those cells still fail as pinned and their hub in-degrees moved with it
        // (`large-coordinate-known-failures.test.ts`). Taking `id1` instead of the leading source is
        // convicted by seven tests across five suites.
        const intersectionType = best.intersectionData[2];
        if (intersectionType === 'co-linear-from-1') {
            const separation = subtractVectors(context.sourcePosition(id2), context.sourcePosition(id1));
            const leadingId = dotProduct(separation, context.getEdgeWithId(id1).basisVector) > 0 ? id2 : id1;
            /*
             * W-SPEC W33 IS NOT IMPLEMENTED HERE, AND THAT IS A MEASURED NEGATIVE RESULT RATHER
             * THAN AN OMISSION — see the weighted-offsets delegate's report.
             *
             * W33 asks this closure to gain an equi-time check: the trailer reaches the leading
             * source at `arrivalOf(T, …, separation)` while the leader was born there at its own
             * birth arrival, and under weights the two need not agree. The check was written and
             * run over the whole corpus AT UNIT WEIGHTS, where W33 predicted it might move the
             * digest. It does not move the digest — every one of the 59 native-placement pins
             * survives it — but it fires elsewhere, because the configurations that reach this
             * branch are the near-anti-parallel corridors whose two mid-lines carry CONSTANT and
             * slightly DIFFERENT times:
             *
             *   - with W33's own stated consequence (fall through to the throw at the end of the
             *     collision branch): ten pinned assertions across six suites move, and one of them
             *     is the recursion census reporting the plus seed at 16 failed regions where 15 is
             *     pinned — a DEFECT GROWING, which the corpus doctrine treats as a regression and
             *     not as a re-pin;
             *   - with the softest consequence available (fall through to the ordinary
             *     `terminateEdgesAtPoint` on the collision): four assertions move, including
             *     `NEAR_REGULAR_ROSETTE5_40` at 1e11 leaving one unresolved edge where two are
             *     pinned (an unattributed CURE) and the 48-way cluster at 2e10 shattering into 12
             *     nodes where 11 are pinned.
             *
             * Both outcomes rewrite the corpus's failure register, which is the lead's call and not
             * a delegate's, and no §4 weighted fixture reaches this branch, so nothing is currently
             * measuring what the check would buy. The closure therefore stands on the raw
             * separation exactly as it did before weights, and the gap is reported rather than
             * papered over.
             */
            applyDegenerateClosure(context, input.interiorEdges, context.sourcePosition(leadingId));
            return {childSteps: []};
        } else {
            // Standard convergence — wire both edges to the collision point
            context.terminateEdgesAtPoint([id1, id2], best.position);
        }
    }

    context.acceptAll(input.interiorEdges);

    return {
        childSteps: []
    }
}

/** A terminal point and the wavefront offset at which every face reaches it. */
interface TerminalSolution {
    position: Vector2;
    /** The wavefront clock `t`: the offset from the supporting lines at which they meet here. */
    offset: number;
}

type Row3 = [number, number, number];

function determinant3(row0: Row3, row1: Row3, row2: Row3): number {
    return row0[0] * (row1[1] * row2[2] - row1[2] * row2[1])
        - row0[1] * (row1[0] * row2[2] - row1[2] * row2[0])
        + row0[2] * (row1[0] * row2[1] - row1[1] * row2[0]);
}

/** The exterior edges bounding these interior edges' faces, deduplicated, in first-seen order. */
function distinctExteriorParents(context: StraightSkeletonSolverContext, interiorEdgeIds: number[]): number[] {
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

/**
 * Where three offset lines meet, and when — solved in closed form, with no tolerance anywhere.
 *
 * Each supporting line contributes `n . P - t = n . A`, where `n` is that edge's inward unit
 * normal and `A` any point on it. Three of them are three equations in the three unknowns
 * `(x, y, t)`, solved here by Cramer's rule.
 *
 * THE WAVEFRONT CLOCK IS AN UNKNOWN, NOT A CONSTRAINT CHECKED AFTERWARDS. That is what makes this
 * stronger than intersecting two bisectors and then pricing the result on each edge's clock and
 * hoping the two agree: the returned point is by construction the one place all three offset lines
 * coincide at a single common offset. It also means the solve never reads a bisector source, so
 * coincident sources stop being a case.
 *
 * THE INWARD NORMAL IS NOT RE-DERIVED HERE. It is `rotateCw90` of the edge's unit basis, which is
 * the convention `FaceEdge.normal` already establishes in `parcel-slicing.ts` — inward for a
 * clockwise ring, and the normal against which `(p - start) . normal` is the skeleton offset within
 * that edge's face. `initBoundingPolygon` orients every exterior edge from its own node to the
 * next, so that basis and that rotation agree with the face model exactly. An outward normal
 * produces a negative `t` that is internally consistent and wrong; the caller tests the sign.
 *
 * Returns `undefined` when the system is singular, which is malformed input rather than poor
 * conditioning: across 785 measured terminals the determinant never fell below 0.106 in magnitude.
 */
function solveTerminalPoint(
    context: StraightSkeletonSolverContext,
    exteriorParentIds: number[],
): TerminalSolution | undefined {
    const lines = exteriorParentIds.map(parentId => {
        const normal = rotateCw90(context.getEdgeWithId(parentId).basisVector);
        return {
            normal,
            weight: context.weightOf(parentId),
            offsetFromOrigin: dotProduct(normal, context.sourcePosition(parentId)),
        };
    });

    // W-spec W28: each line contributes `n · P − w · t = n · A`. At unit weights the third column is
    // the double `-1`, which is the row this always had, so position and time are bit-identical by
    // construction.
    //
    // W-spec W29: a triangle over two SAME-FACING PARALLEL parents is singular today and REGULAR
    // under unequal weights — with `n₁ = n₃` the determinant is `(w₃ − w₁) · (n₁ × n₂)` — and the
    // solve then returns the point where the faster wall overtakes the slower. No new branch: the
    // singular fall-through below simply stops being taken.
    const rows = lines.map<Row3>(line => [line.normal.x, line.normal.y, -line.weight]);
    const rhs = lines.map(line => line.offsetFromOrigin);

    const determinant = determinant3(rows[0], rows[1], rows[2]);
    // The determinant is trilinear in the rows, so a weight scales it; the singularity bar carries
    // the same scaling (W-spec W26, W28). At unit weights `max(1, 1, 1)` is `1` and this is
    // `areEqual(determinant, 0)`.
    const largestWeight = Math.max(lines[0].weight, lines[1].weight, lines[2].weight);
    if (Math.abs(determinant) < FLOATING_POINT_EPSILON * largestWeight) {
        return undefined;
    }

    const substituted = (column: number): number => {
        const replaced = rows.map<Row3>((row, index) => {
            const copy: Row3 = [row[0], row[1], row[2]];
            copy[column] = rhs[index];
            return copy;
        });
        return determinant3(replaced[0], replaced[1], replaced[2]) / determinant;
    };

    return {position: {x: substituted(0), y: substituted(1)}, offset: substituted(2)};
}

/**
 * The closed-form answer for this terminal triangle, or `undefined` when the assumptions it rests
 * on do not hold — in which case the existing collision path resolves the step instead.
 *
 * Every fall-through is logged, because each one is an assumption made observable rather than an
 * assumption trusted: all 785 measured terminals had exactly three distinct parents and a
 * well-conditioned system, but that is a measurement on one corpus and not a proof.
 */
function solveTerminalTriangle(
    context: StraightSkeletonSolverContext,
    interiorEdgeIds: number[],
): TerminalSolution | undefined {
    const parents = distinctExteriorParents(context, interiorEdgeIds);
    if (parents.length !== 3) {
        stepLog.debug(
            `Terminal triangle [${interiorEdgeIds.join(', ')}] has ${parents.length} distinct exterior parents, `
            + `not three, so the three-line system is not determined: falling through to the collision path.`,
        );
        return undefined;
    }

    const solution = solveTerminalPoint(context, parents);
    if (solution === undefined) {
        stepLog.debug(
            `Terminal triangle [${interiorEdgeIds.join(', ')}] over parents [${parents.join(', ')}] has a singular `
            + `determinant: falling through to the collision path.`,
        );
        return undefined;
    }

    // The offset is the wavefront clock, measured outwards from the boundary, so it cannot run
    // backwards. A negative one means the normals came out pointing away from the interior — the
    // one sign-sensitive step in this construction — and the position it pairs with is worthless.
    if (solution.offset < 0 && !areEqual(solution.offset, 0)) {
        stepLog.debug(
            `Terminal triangle [${interiorEdgeIds.join(', ')}] solved to a negative offset `
            + `${solution.offset}, so its parents' normals point outward: falling through to the collision path.`,
        );
        return undefined;
    }

    return solution;
}

export function handleInteriorEdgeTriangle(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length !== 3) {
        throw new Error("Invalid call: expecting three interior edges");
    }

    const terminal = solveTerminalTriangle(context, input.interiorEdges);
    if (terminal !== undefined) {
        context.terminateEdgesAtPoint(input.interiorEdges, terminal.position);
        context.acceptAll(input.interiorEdges);

        return {
            childSteps: []
        }
    }

    const allCollisions: CollisionEvent[] = [];
    for (const [index1, index2] of TRIANGLE_INTERSECT_PAIRINGS) {
        const edge1 = context.getInteriorWithId(input.interiorEdges[index1]);
        const edge2 = context.getInteriorWithId(input.interiorEdges[index2]);
        allCollisions.push(...collideInteriorEdges(edge1, edge2, context));
    }

    // Pick the best non-phantom collision; fall back to any collision
    const best = bestNonPhantomCollision(allCollisions);

    if (!best) {
        // A triangle whose exterior parents are all parallel defeats every pairwise generator:
        // the terminal solve is singular, head-on rates cancel, and perpendicular arrivals meet
        // at an existing source with zero travel ('diverging'). If the whole triangle closes on
        // one edge's source at a single shared offset, terminate it there — the anchor edge
        // becomes a culled self-loop. Failing that, and as in the two-edge base case, a triangle
        // whose three vertices all travel the same way has no future event either, and closes at
        // its leading source rather than throwing.
        const closure = solveDegenerateClosure(context, input.interiorEdges)
            ?? solveParallelClosure(context, input.interiorEdges);
        if (closure === undefined) {
            throw new Error(`Failed to collide interior edges in triangle: ${stringifyFinalData(context, input)}`);
        }

        applyDegenerateClosure(context, input.interiorEdges, closure);
        return {childSteps: []};
    }

    context.terminateEdgesAtPoint(input.interiorEdges, best.position);

    context.acceptAll(input.interiorEdges);

    return {
        childSteps: []
    }
}


export function handleAlgorithmStepInput(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    const result: AlgorithmStepOutput = {
        childSteps: []
    };

    if (input.interiorEdges.length < 2) {
        throw new Error("Fewer than 2 interior edges is not a valid skeleton state")
    }

    if (input.interiorEdges.length === 2) {
        result.childSteps.push(...handleInteriorEdgePair(context, input).childSteps)
    }

    if (input.interiorEdges.length === 3) {
        result.childSteps.push(...handleInteriorEdgeTriangle(context, input).childSteps)
    }

    if (input.interiorEdges.length > 3) {
        result.childSteps.push(...handleInteriorNGon(context, input).childSteps)
    }

    return result;
}

export function stepAlgorithm(context: StraightSkeletonSolverContext, inputs: AlgorithmStepInput[]): AlgorithmStepOutput {
    const childSteps: AlgorithmStepInput[] = [];
    const errors: string[] = [];

    for (const input of inputs) {
        try {
            childSteps.push(...handleAlgorithmStepInput(context, input).childSteps);
        } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
        }
    }

    if (errors.length > 0) {
        stepLog.warn(`stepAlgorithm: ${errors.length} sub-polygon(s) failed:\n${errors.join('\n')}`);
    }

    return {
        childSteps: childSteps.filter(steps => steps.interiorEdges.length > 1),
        errors
    }
}

/** Outcome of solving one simple (non-self-intersecting) polygon. */
interface SimplePolygonRun {
    context: StraightSkeletonSolverContext;
    /** Messages accumulated from every `stepAlgorithm` iteration of this run. */
    errors: string[];
}

/**
 * Carry the solve's own informational reports onto the caller's diagnostics list (spec A19).
 *
 * `errors` already carries what a step THREW; this carries what a step DECIDED and had no other way
 * to say — today, only the coaxial completion. Written once because the self-intersecting path runs
 * one context per sub-polygon and every one of them has to be heard.
 */
function pushSolveDiagnostics(diagnostics: SkeletonDiagnostic[], run: SimplePolygonRun): void {
    diagnostics.push(...run.context.diagnostics);
}

/** Run the straight skeleton algorithm on a single simple (non-self-intersecting) polygon. */
function runSimplePolygon(nodes: Vector2[], perceptualFloor: number, weights?: readonly number[]): SimplePolygonRun {
    const context = makeStraightSkeletonSolverContext(nodes, perceptualFloor, weights);
    const exteriorEdges = [...context.graph.edges]
    const errors: string[] = [];

    initInteriorEdges(context);

    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}]
    while (inputs.length > 0) {
        const output = stepAlgorithm(context, inputs);
        errors.push(...(output.errors ?? []));
        inputs = output.childSteps
        exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id))
    }

    return {context, errors}
}

/**
 * Legacy entry point, preserved verbatim for existing callers.
 *
 * It reports nothing about how well the solve went, and retains four silent-failure modes:
 * 1. Counter-clockwise input does not throw — it yields a graph with only the boundary and no
 *    resolved interior edges.
 * 2. Per-sub-polygon exceptions are swallowed by `stepAlgorithm`, so a partially-resolved
 *    skeleton is indistinguishable from a complete one.
 * 3. Self-intersecting input returns the merged solver context, whose helpers throw when called.
 * 4. Input canonicalisation can remove vertices, so the returned graph may carry fewer exterior
 *    nodes than the caller passed in, with nothing said about it. There is no diagnostics channel
 *    here to say it on — which is the whole reason this entry point is legacy.
 *
 * Prefer {@link solveSkeleton}, which normalises winding, reports every one of those on
 * `diagnostics`, and returns `context: null` instead of a throwing stub for the merged path.
 */
/**
 * The boundary stage the two LEGACY entry points share: carry the polygon to unit extent, then
 * canonicalise it there against the standing noise floor.
 *
 * Stated once because it is one decision, not two: both entry points must hand the solver the same
 * polygon for the stepped snapshots to describe the solve `runAlgorithmV5` performs. Neither has a
 * diagnostics channel, so the removal is SILENT in both — which is what makes them legacy, and why
 * `solveSkeleton` keeps its own copy of the sequence: it reports what was removed, and it honours a
 * region-space `noiseFloor` override, and neither of those belongs here.
 *
 * THE PERCEPTUAL FLOOR IS THE ONE OPTION THESE TWO DO HONOUR (journal decision 106), because the
 * dashboard explorer drives them and the whole point of the option is that a client's renderer, not
 * this module, decides what can be seen. It is a single scale-free value, not a region pass-down.
 */
function canonicaliseInUnitSpace(
    nodes: Vector2[],
    normalisation: SkeletonNormalisation,
    perceptualFloor: number,
    pinnedIndices: readonly number[] = [],
): CanonicalPolygon {
    return canonicalisePolygon(normalisePolygon(nodes, normalisation), perceptualFloor, pinnedIndices);
}

/**
 * What the boundary stage does to a caller's ring: the surviving vertices and, on `indexRemap`,
 * where each input vertex ended up.
 *
 * THIS EXISTS FOR CALLERS THAT LABEL THE SOLVED GRAPH AGAINST THEIR OWN INPUT. A removed vertex
 * renumbers every exterior node and every exterior edge after it, so an overlay drawing input
 * indices beside solver indices is showing two index spaces in one picture and reads as a
 * corrupted solve: the bisector of exterior node 5 appears at the caller's vertex 6, carrying the
 * parents [5,4] that belong to it. That is what a dashboard inspection reported on 2026-08-28, and
 * the graph was right every time. `indexRemap[i]` is the exterior node the caller's vertex `i`
 * became, or {@link REMOVED_VERTEX_INDEX} where it was removed as invisible.
 *
 * ONE SPELLING WITH THE SOLVE ITSELF — {@link canonicaliseInUnitSpace} is this function's
 * `vertices`, so a caller's remap cannot describe a different boundary from the one the solver
 * saw. It DOES NOT describe the self-intersecting path: `decomposePolygon` rebuilds the rings and
 * `mergeSkeletonGraphs` renumbers again, so a caller must check the survivor count against the
 * graph's `numExteriorNodes` before trusting the mapping.
 */
export function canonicaliseForSolve(
    vertices: Vector2[],
    options?: PerceptualFloorOptions & WeightOptions,
): CanonicalPolygon {
    // W-spec W44: a weighted caller's remap must describe the same boundary the weighted solve saw,
    // and under weights that boundary keeps every weight-change vertex. Unweighted callers pass
    // nothing and pin nothing, exactly as before.
    const normalisation = makeSkeletonNormalisation(vertices);
    const unitVertices = normalisePolygon(vertices, normalisation);
    const pinned = options?.weights === undefined || options.weights.length === 0
        ? []
        : weightChangeVertexIndices(weightsAtTheDoor(unitVertices, options.weights));
    return canonicaliseInUnitSpace(
        vertices, normalisation, resolvePerceptualFloor(options), pinned);
}

/**
 * The complaint about the first non-finite input vertex, or `undefined` when every coordinate is
 * finite.
 *
 * REJECTED AT THE DOOR, NOT DOWNSTREAM. A NaN coordinate is invisible to the bounding-box scan that
 * opens `makeSkeletonNormalisation` — every comparison against NaN is false, so the extent is
 * computed as though the vertex were not there — and it then travels through normalisation,
 * canonicalisation and the decomposition before `findOrAddNode` finally refuses it, by which point
 * nothing names the vertex the caller actually passed. An infinity is worse: it survives the scan,
 * takes the extent to infinity, and normalises every other vertex to zero.
 *
 * The index is the caller's own, taken before canonicalisation can renumber anything.
 */
function nonFiniteVertexComplaint(vertices: Vector2[]): string | undefined {
    for (let index = 0; index < vertices.length; index++) {
        const {x, y} = vertices[index];
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return `Vertex ${index} is not finite: (${x}, ${y}). Every input vertex coordinate must be a finite number.`;
        }
    }
    return undefined;
}

function assertVerticesAreFinite(vertices: Vector2[]): void {
    const complaint = nonFiniteVertexComplaint(vertices);
    if (complaint !== undefined) {
        throw new Error(complaint);
    }
}

/*
 * ============================================================================
 *  THE WEIGHT DOOR — W-spec W1–W4, W44, W45, W48, W49
 * ============================================================================
 *
 * A weight is a per-exterior-edge, strictly positive SPEED: `weights[i]` is the speed of the edge
 * from input vertex `i` to input vertex `(i + 1) % n` (arc journal decision 112(a)). Everything the
 * solver used to call an offset is that edge's arrival TIME, `distance / weight`.
 *
 * EVERY REFUSAL HERE IS A THROW, NOT A DIAGNOSTIC, and every one of them names the offender. The
 * reason is the one `assertVerticesAreFinite` already states: `diagnostics` reports a solve that ran
 * and came back degraded, while these are inputs the solver cannot solve at all. All three run
 * BEFORE canonicalisation, so the index in the message is the caller's own, before any renumbering
 * (arc decision 124(b)).
 */

/** The caller's weights, or all ones. Rejects a mismatched length by name (W-spec W1). */
function resolveWeightArray(vertexCount: number, weights?: readonly number[]): number[] {
    if (weights === undefined || weights.length === 0) {
        return new Array<number>(vertexCount).fill(1);
    }
    if (weights.length !== vertexCount) {
        throw new Error(
            `Weight array has ${weights.length} entries but the polygon has ${vertexCount} vertices; `
            + `there must be exactly one weight per vertex — the speed of the edge leaving it.`);
    }
    return [...weights];
}

/** W-spec W2: every weight is a finite, strictly positive double. Zero and infinite are out of contract. */
function assertWeightsAreFinitePositive(weights: readonly number[]): void {
    for (let index = 0; index < weights.length; index++) {
        const weight = weights[index];
        if (!Number.isFinite(weight) || weight <= 0) {
            throw new Error(
                `Weight ${index} is ${weight}. Every edge weight must be a finite, strictly positive `
                + `number: a zero or infinite weight has no well-posed vertex velocity, and gables are `
                + `a post-process on an all-positive solve rather than a solver input.`);
        }
    }
}

/**
 * W-spec W3 and W48, arc decision 119: the weight ratio is checked at the door and refused by a
 * throw, naming the two extreme edges and the constant.
 */
function assertWeightRatioIsInContract(weights: readonly number[]): void {
    let slowestIndex = 0;
    let fastestIndex = 0;
    for (let index = 1; index < weights.length; index++) {
        if (weights[index] < weights[slowestIndex]) {
            slowestIndex = index;
        }
        if (weights[index] > weights[fastestIndex]) {
            fastestIndex = index;
        }
    }

    const ratio = weights[fastestIndex] / weights[slowestIndex];
    if (ratio > MAX_WEIGHT_RATIO) {
        throw new Error(
            `Weight ratio ${ratio} exceeds MAX_WEIGHT_RATIO (${MAX_WEIGHT_RATIO}): edge ${fastestIndex} `
            + `has weight ${weights[fastestIndex]} and edge ${slowestIndex} has weight `
            + `${weights[slowestIndex]}. Beyond that ratio the solver's absolute time window is wider `
            + `on the fastest edge than the client's own noise floor, so two arrivals the client can `
            + `see as two things would be fused into one.`);
    }
}

/**
 * W-spec W49, arc journal decision 124(b): **WEIGHTS MAY CHANGE ONLY AT A VISIBLE CORNER.**
 *
 * A vertex whose two incident edges carry different weights and whose turn sine `|c × b|` is below
 * {@link MIN_WEIGHT_TURN_SINE} is refused. The kernel there is either inconsistent (an exactly
 * collinear weight change has NO vertex velocity: the two offset lines are parallel at different
 * distances for every `t > 0` and the wavefront has a step of height `|w₁ − w₂| · t`) or so badly
 * conditioned that the solver's own time window becomes a spatial slack of a fraction of the whole
 * polygon — `|v| = |w₁ − w₂| / sin(turn)`, measured at `1.5e7` for a turn of `1e-6`.
 *
 * THIS IS A FENCE, NOT A CONVENTION. Arc decision 124's model invariant is that the base of the roof
 * lies in a single plane; a configuration the weighted skeleton cannot make well-posed without an
 * extra convention (the struck riser of W-spec W53) is OUTSIDE the contract, not inside it with the
 * convention bolted on. A dormer is a feature stitched into the roof the skeleton produces.
 *
 * UNIT WEIGHTS NEVER REACH THE ANGULAR TEST: it is guarded by `w₁ !== w₂` first, so with every
 * weight equal this function looks at no geometry at all and the digest cannot move.
 */
export function assertWeightsChangeOnlyAtVisibleCorners(
    vertices: readonly Vector2[],
    weights: readonly number[],
): void {
    const count = vertices.length;
    for (let index = 0; index < count; index++) {
        const incomingWeight = weights[(index - 1 + count) % count];
        const outgoingWeight = weights[index];
        if (incomingWeight === outgoingWeight) {
            continue;
        }

        const outgoing = makeBasis(vertices[index], vertices[(index + 1) % count]);
        const incoming = makeBasis(vertices[(index - 1 + count) % count], vertices[index]);
        const turnSine = Math.abs(crossProduct(outgoing, incoming));
        if (turnSine < MIN_WEIGHT_TURN_SINE) {
            throw new Error(
                `Vertex ${index} carries a weight change (${incomingWeight} to ${outgoingWeight}) at a `
                + `turn whose sine is ${turnSine}, below MIN_WEIGHT_TURN_SINE (${MIN_WEIGHT_TURN_SINE}). `
                + `Weights may change only at a visible corner: a collinear or near-collinear weight `
                + `change has no well-posed vertex velocity, and anything needing one — a dormer, for `
                + `instance — is a separate feature stitched into the roof the skeleton produces.`);
        }
    }
}

/**
 * W-spec W4: weights are normalised so that the MINIMUM is exactly `1`, once, before anything else
 * reads them.
 *
 * The skeleton is invariant under a common scaling of all weights (every time scales by the
 * reciprocal), so one convention fixes the time unit. Minimum `1` is the one that keeps every time
 * at most the distance it came from — `t = d / w ≤ d` — so every ABSOLUTE tolerance on a time is at
 * least as wide in distance terms as it is at unit weight, and at most {@link MAX_WEIGHT_RATIO}
 * times wider, which is exactly the band W-spec W48 derives the ratio bound from.
 *
 * ALL-ONES DIVIDES BY `1.0`, WHICH IS EXACT, so the unit-weight path is untouched bit for bit.
 */
function normaliseWeights(weights: readonly number[]): number[] {
    const minimum = Math.min(...weights);
    return weights.map(weight => weight / minimum);
}

/**
 * Every check at the door, in the order the spec fixes them, returning the normalised weights.
 *
 * `unitVertices` is the caller's ring carried to unit extent — the turn guard is stated in unit
 * space (W-spec N19) — while the indices reported are the caller's own, which they still are because
 * nothing has been renumbered yet.
 */
function weightsAtTheDoor(
    unitVertices: readonly Vector2[],
    weights?: readonly number[],
): number[] {
    const resolved = resolveWeightArray(unitVertices.length, weights);
    assertWeightsAreFinitePositive(resolved);
    assertWeightRatioIsInContract(resolved);
    assertWeightsChangeOnlyAtVisibleCorners(unitVertices, resolved);
    return normaliseWeights(resolved);
}

/**
 * The vertices canonicalisation may not remove: those whose two incident edges differ in weight
 * (W-spec W44, arc journal decisions 120 and 124(c)).
 *
 * SUCH A VERTEX IS STRUCTURAL, WHATEVER ITS DEVIATION FROM THE CHORD. Decision 55's rule — "a vertex
 * collinear with the chord between its neighbours contributes nothing" — becomes "collinear AND
 * equal-weighted contributes nothing" under weights: the vertex is invisible in the SILHOUETTE and
 * visible in the SKELETON, because the weight change either side of it is what the client authored.
 * It is pinned, never merged in either direction.
 *
 * WELL-CONDITIONED BY THE DOOR IT HAS ALREADY PASSED. Every vertex this pins has a visible turn —
 * {@link assertWeightsChangeOnlyAtVisibleCorners} ran first — so its kernel speed is at most
 * `|w₁ − w₂| / MIN_WEIGHT_TURN_SINE`. A sub-floor CHORD DEVIATION does not condition the kernel; the
 * turn does, and the turn is bounded from below.
 *
 * UNIT WEIGHTS PIN NOTHING: with every weight equal this returns an empty list, canonicalisation
 * behaves exactly as it did before pins existed, and the digest cannot move.
 */
function weightChangeVertexIndices(weights: readonly number[]): number[] {
    const pinned: number[] = [];
    for (let index = 0; index < weights.length; index++) {
        if (weights[(index - 1 + weights.length) % weights.length] !== weights[index]) {
            pinned.push(index);
        }
    }
    return pinned;
}

/**
 * Weights carried through canonicalisation's renumbering (W-spec W45).
 *
 * Edge `i` survives as edge `indexRemap[i]` when vertex `i` survives; a merged edge — one whose
 * intervening vertices were removed — takes the weight of its first constituent, which is the weight
 * of ALL of them, because {@link weightChangeVertexIndices} pinned every vertex where two weights
 * met. There is no merge rule to choose here: under W-spec W44 the choice cannot arise.
 */
function remapWeightsThroughCanonicalisation(
    weights: readonly number[],
    indexRemap: readonly number[],
    survivorCount: number,
): number[] {
    const remapped = new Array<number>(survivorCount).fill(1);
    for (let index = 0; index < indexRemap.length; index++) {
        const survivor = indexRemap[index];
        if (survivor !== REMOVED_VERTEX_INDEX) {
            remapped[survivor] = weights[index];
        }
    }
    return remapped;
}

/**
 * Weights carried through the winding reversal (W-spec W45).
 *
 * Reversing an `n`-ring sends vertex `j` to `v_{n−1−j}`, so reversed edge `j` runs from `v_{n−1−j}`
 * to `v_{n−2−j}` — which is original edge `n−2−j`, traversed backwards. A weight is a speed and is
 * indifferent to which way its edge is traversed, so the value is carried unchanged to that index.
 */
function reverseWeights(weights: readonly number[]): number[] {
    const count = weights.length;
    return weights.map((_unused, index) => weights[(count - 2 - index + count) % count]);
}

export function runAlgorithmV5(
    nodes: Vector2[],
    options?: PerceptualFloorOptions & WeightOptions,
): StraightSkeletonSolverContext {
    if (nodes.length < 3) {
        throw new Error("Must have at least three nodes to perform algorithm");
    }
    assertVerticesAreFinite(nodes);
    const perceptualFloor = resolvePerceptualFloor(options);

    // NORMALISED ONCE, HERE, BEFORE ANYTHING ELSE LOOKS AT THE POLYGON. See `normalisation.ts` for
    // why, for the enumeration of what scales, and for why it must never be re-applied mid-solve.
    // The decomposition runs in UNIT space along with the solve, because its crossing test carries
    // the same absolute tolerances the solver does. Canonicalisation follows immediately, in unit
    // space — see {@link canonicaliseInUnitSpace} and `canonicalisation.ts`.
    const normalisation = makeSkeletonNormalisation(nodes);
    // THE WEIGHT DOOR RUNS BEFORE CANONICALISATION (W-spec W49, arc decision 124(b)), so a refusal
    // names the caller's own vertex index.
    const doorWeights = weightsAtTheDoor(normalisePolygon(nodes, normalisation), options?.weights);
    const canonical = canonicaliseInUnitSpace(
        nodes, normalisation, perceptualFloor, weightChangeVertexIndices(doorWeights));
    const unitNodes = canonical.vertices;
    const canonicalWeights = remapWeightsThroughCanonicalisation(
        doorWeights, canonical.indexRemap, unitNodes.length);

    const decomposition = decomposePolygon(unitNodes, undefined, canonicalWeights);

    if (!decomposition.wasSelfIntersecting) {
        const context = runSimplePolygon(unitNodes, perceptualFloor, canonicalWeights).context;
        // BOTH HALVES OF THE CONTEXT, because both are handed to the caller and a cache left in unit
        // space would answer in the wrong units about edges that are still perfectly valid.
        denormaliseGraph(context.graph, normalisation);
        denormaliseCollisionCache(context.collisionCache, normalisation);
        return context;
    }

    const subResults = decomposition.subPolygons.map((subPoly, index) => ({
        graph: runSimplePolygon(
            subPoly, perceptualFloor, decomposition.subPolygonWeights[index]).context.graph,
    }));

    // MERGED IN UNIT SPACE, then denormalised. The merge deduplicates crossing-point nodes with
    // `vectorsAreEqual`, which is the same absolute tolerance, so it has to see unit coordinates too.
    const merged = mergeSkeletonGraphs(subResults, decomposition.crossingPoints);
    const mergedContext = makeMergedSolverContext(merged, perceptualFloor);
    denormaliseGraph(mergedContext.graph, normalisation);
    denormaliseCollisionCache(mergedContext.collisionCache, normalisation);
    return mergedContext;
}

/**
 * Per-edge wavefront speeds (arc journal decision 112(a), W-spec W1–W4).
 *
 * ONE ENTRY PER INPUT VERTEX. `weights[i]` is the speed of the edge from vertex `i` to vertex
 * `(i + 1) % n`. Omitted, or an empty array, means all ones — which is bit-identical to the
 * unweighted solver by construction, because every weighted site multiplies or divides by exactly
 * `1.0` and there is no branch on unit weights anywhere (W-spec W36).
 *
 * WHAT A WEIGHT MEANS. The wavefront of edge `i` stands at perpendicular distance `w_i · t` from its
 * supporting line at time `t`, so a fast edge sweeps further in the same time and its face in the
 * skeleton grows at its expense of its neighbours'. In the roof reading, `w` is the tangent of the
 * pitch: a shallow roof plane over a fast edge, a steep one over a slow edge.
 *
 * THREE THINGS ARE REFUSED, LOUDLY, AT THE DOOR:
 *
 *  1. a weight that is not finite and strictly positive (W-spec W2) — zero and infinite weights have
 *     no well-posed vertex velocity, and a gable is a post-process on an all-positive solve;
 *  2. `max / min` above {@link MAX_WEIGHT_RATIO} (W-spec W3, W48);
 *  3. a weight change at a vertex whose turn sine is below {@link MIN_WEIGHT_TURN_SINE} (W-spec W49,
 *     arc decision 124(b)) — **weights may change only at a visible corner**.
 *
 * The array is normalised so the slowest edge has weight exactly `1` before anything reads it
 * (W-spec W4); `SkeletonSolveResult.weights` reports the normalised, remapped array the solve ran on.
 */
export interface WeightOptions {
    weights?: readonly number[];
}

export interface SolveSkeletonOptions extends PerceptualFloorOptions, WeightOptions {
    /**
     * Reverse counter-clockwise input before solving. The solver only handles clockwise
     * winding; leaving this off on counter-clockwise input produces an unresolved skeleton.
     * Defaults to `true`.
     */
    normaliseWinding?: boolean;
    /**
     * Override the deviation below which an input vertex is treated as invisible and removed.
     * Defaults to {@link PerceptualFloorOptions.perceptualFloor}, and thence to
     * {@link SKELETON_NOISE_FLOOR}.
     *
     * NOT A SECOND PERCEPTUAL FLOOR — it is the region pass-down, and it exists because it lives in a
     * DIFFERENT SPACE. `perceptualFloor` is the client's one scale-free value; this is that value
     * carried into one sub-region's unit space by the recursion driver, so that a sliver
     * canonicalises against the root's idea of invisible rather than its own. A direct caller who
     * wants a coarser floor sets `perceptualFloor` and leaves this alone.
     *
     * IN UNIT SPACE, NOT THE CALLER'S. Canonicalisation runs after the polygon has been carried to
     * unit extent, so this value does NOT go through `normaliseLength` — it is compared directly
     * against unit-space deviations, which is what makes it relative by construction. See
     * `canonicalisation.ts`.
     *
     * THE FLOOR BELONGS TO THE ROOT REGION, which is why it is accepted here rather than derived from
     * the polygon. For a direct call the two coincide. The recursion driver will pass a sub-region's
     * root floor down through this option, because normalising a thin sliver to its own extent would
     * scale it up enormously and leave it holding every degenerate vertex it has.
     *
     * Zero is an exact identity — nothing is removed — which is the supported way to turn the stage
     * off and measure what it is buying.
     */
    noiseFloor?: number;
}

/** Collect the interior edges of a solved graph that never acquired a target node. */
function findUnresolvedInteriorEdgeIds(graph: StraightSkeletonGraph): number[] {
    return graph.interiorEdges
        .filter(interiorEdge => graph.edges[interiorEdge.id]?.target === undefined)
        .map(interiorEdge => interiorEdge.id);
}

function pushStepFailures(diagnostics: SkeletonDiagnostic[], errors: string[]): void {
    for (const error of errors) {
        diagnostics.push({kind: 'step-failure', detail: error});
    }
}

/**
 * Primary entry point: solve the straight skeleton and report how complete the answer is.
 *
 * Unlike {@link runAlgorithmV5}, every degraded outcome is visible on the returned value —
 * winding correction, self-intersection, swallowed step failures, and interior edges that
 * never resolved all appear in `diagnostics`, and `complete` summarises whether the skeleton
 * can be trusted.
 *
 * Throws only when there are fewer than three vertices.
 */
export function solveSkeleton(vertices: Vector2[], options?: SolveSkeletonOptions): SkeletonSolveResult {
    if (vertices.length < 3) {
        throw new Error("Must have at least three nodes to perform algorithm");
    }
    // THROWN, NOT DIAGNOSED. `diagnostics` reports a solve that ran and came back degraded; a
    // non-finite vertex is input this entry point cannot solve at all, which is the same class as
    // the vertex-count check above and gets the same answer.
    assertVerticesAreFinite(vertices);

    const normaliseWinding = options?.normaliseWinding ?? true;
    // ONE FLOOR, TWO READINGS OF IT. `perceptualFloor` is the client's value and governs the
    // coincidence bar inside the solve; `noiseFloor` is the canonicalisation bar, which defaults to
    // the same value and is overridden ONLY by the recursion driver, which has already restated the
    // root's floor in this region's units. See `PerceptualFloorOptions`.
    const perceptualFloor = resolvePerceptualFloor(options);
    const noiseFloor = options?.noiseFloor ?? perceptualFloor;
    const diagnostics: SkeletonDiagnostic[] = [];

    // NORMALISED ONCE, HERE, BEFORE ANYTHING ELSE LOOKS AT THE POLYGON. See `normalisation.ts`. The
    // winding test and the decomposition both run in unit space along with the solve, because both
    // carry the same absolute tolerances and both would otherwise change meaning with the caller's
    // coordinates. Everything on the returned result is carried back before it is handed over.
    const normalisation = makeSkeletonNormalisation(vertices);
    const unitVertices = normalisePolygon(vertices, normalisation);

    // THE WEIGHT DOOR, BEFORE CANONICALISATION (W-spec W1–W4, W49; arc decision 124(b)). All three
    // refusals throw here, naming the caller's own index, because nothing has renumbered anything
    // yet. With no weights this resolves to all ones and refuses nothing.
    const doorWeights = weightsAtTheDoor(unitVertices, options?.weights);

    // CANONICALISED IMMEDIATELY AFTER, AND STILL IN UNIT SPACE. The floor is a unit-space constant,
    // which is what makes it relative by construction rather than a second tolerance system living
    // alongside the first. See `canonicalisation.ts` for what the stage removes and why removing the
    // input beats handling it. Every weight-change vertex is PINNED (W-spec W44, arc decision 120):
    // under weights such a vertex is structural whatever its deviation from the chord.
    const canonical = canonicalisePolygon(
        unitVertices, noiseFloor, weightChangeVertexIndices(doorWeights));
    let workingVertices = canonical.vertices;
    let workingWeights = remapWeightsThroughCanonicalisation(
        doorWeights, canonical.indexRemap, workingVertices.length);

    if (canonical.removedCount > 0) {
        diagnostics.push({
            kind: 'vertices-canonicalised',
            detail: `${canonical.removedCount} vertex(es) removed before solving as invisible at the `
                + `${noiseFloor} unit-space noise floor; largest discarded deviation `
                + `${canonical.maxDeviation}. ${workingVertices.length} vertices remain.`,
        });
    }

    if (normaliseWinding && !isClockwise(workingVertices)) {
        workingVertices = [...workingVertices].reverse();
        // W-spec W45: the weights are remapped through the reversal with the ring.
        workingWeights = reverseWeights(workingWeights);
        diagnostics.push({
            kind: 'winding-normalised',
            detail: `Input was counter-clockwise; ${workingVertices.length} vertices reversed to clockwise winding before solving.`,
        });
    }

    const decomposition = decomposePolygon(workingVertices, undefined, workingWeights);

    let graph: StraightSkeletonGraph;
    let context: StraightSkeletonSolverContext | null;

    if (decomposition.wasSelfIntersecting) {
        diagnostics.push({
            kind: 'self-intersecting',
            detail: `Input self-intersects; decomposed into ${decomposition.subPolygons.length} sub-polygon(s) at ${decomposition.crossingPoints.length} crossing point(s) and merged. Solver context is unavailable for merged results.`,
        });

        const subResults = decomposition.subPolygons.map((subPolygon, index) => {
            // W-spec W45: each piece of a split edge carries its original edge's weight.
            const run = runSimplePolygon(
                subPolygon, perceptualFloor, decomposition.subPolygonWeights[index]);
            pushStepFailures(diagnostics, run.errors);
            pushSolveDiagnostics(diagnostics, run);
            return {graph: run.context.graph};
        });

        graph = mergeSkeletonGraphs(subResults, decomposition.crossingPoints).graph;
        context = null;
    } else {
        const run = runSimplePolygon(workingVertices, perceptualFloor, workingWeights);
        pushStepFailures(diagnostics, run.errors);
        pushSolveDiagnostics(diagnostics, run);
        graph = run.context.graph;
        context = run.context;
    }

    // BEFORE ANYTHING READS THE GRAPH, so that the unresolved-edge scan, the completeness flag and
    // everything the caller subsequently does all see one graph in one space.
    denormaliseGraph(graph, normalisation);
    if (context !== null) {
        denormaliseCollisionCache(context.collisionCache, normalisation);
    }

    const unresolvedEdgeIds = findUnresolvedInteriorEdgeIds(graph);
    if (unresolvedEdgeIds.length > 0) {
        diagnostics.push({
            kind: 'unresolved-edges',
            detail: `${unresolvedEdgeIds.length} interior edge(s) finished without a target node: ${unresolvedEdgeIds.join(', ')}.`,
        });
    }

    const blocking = diagnostics.some(d => d.kind === 'step-failure' || d.kind === 'unresolved-edges');
    const complete = !blocking && graph.interiorEdges.length > 0;

    return {graph, context, complete, diagnostics, normalisation, weights: workingWeights};
}

export interface SteppedAlgorithmResult {
    /** Graph snapshots: index 0 = after init, 1..N = after each while-loop iteration */
    snapshots: StraightSkeletonGraph[];
    /** Non-null if the algorithm threw an error */
    error: string | null;
}

/**
 * Carry every snapshot back to caller space, once each.
 *
 * DEDUPLICATED BY OBJECT IDENTITY, because `mergeSkeletonGraphs` returns its single input graph by
 * reference when there is exactly one sub-polygon and no crossing point — in which case the merged
 * "final" snapshot IS the last sub-polygon snapshot, and denormalising the list naively would scale
 * that one graph twice. Nothing in a graph could detect a double application afterwards.
 */
function denormaliseSnapshots(snapshots: StraightSkeletonGraph[], normalisation: SkeletonNormalisation): void {
    const done = new Set<StraightSkeletonGraph>();
    for (const snapshot of snapshots) {
        if (done.has(snapshot)) {
            continue;
        }
        done.add(snapshot);
        denormaliseGraph(snapshot, normalisation);
    }
}

export function runAlgorithmV5Stepped(
    nodes: Vector2[],
    options?: PerceptualFloorOptions & WeightOptions,
): SteppedAlgorithmResult {
    if (nodes.length < 3) {
        return {snapshots: [], error: "Must have at least three nodes to perform algorithm"};
    }
    // REPORTED ON `error`, not thrown: this entry point already answers a rejected polygon that way.
    const complaint = nonFiniteVertexComplaint(nodes);
    if (complaint !== undefined) {
        return {snapshots: [], error: complaint};
    }

    // NORMALISED ONCE, HERE. See `normalisation.ts`. EVERY SNAPSHOT is denormalised on the way out,
    // not just the last: they are what a debug visualiser draws, and scrubbing through a sequence of
    // graphs half of which were in unit space would be worse than useless.
    const perceptualFloor = resolvePerceptualFloor(options);
    const normalisation = makeSkeletonNormalisation(nodes);
    // THE WEIGHT DOOR, BEFORE CANONICALISATION, as in the solving entry points.
    const doorWeights = weightsAtTheDoor(normalisePolygon(nodes, normalisation), options?.weights);
    // CANONICALISED IN UNIT SPACE, immediately after, so the stepped visualiser walks the same
    // polygon the solving entry points do. See {@link canonicaliseInUnitSpace}.
    const canonical = canonicaliseInUnitSpace(
        nodes, normalisation, perceptualFloor, weightChangeVertexIndices(doorWeights));
    const unitNodes = canonical.vertices;
    const canonicalWeights = remapWeightsThroughCanonicalisation(
        doorWeights, canonical.indexRemap, unitNodes.length);

    const decomposition = decomposePolygon(unitNodes, undefined, canonicalWeights);

    if (!decomposition.wasSelfIntersecting) {
        const result = runSimplePolygonStepped(unitNodes, perceptualFloor, canonicalWeights);
        denormaliseSnapshots(result.snapshots, normalisation);
        return result;
    }

    // For decomposed polygons, run each sub-polygon stepped and concatenate snapshots,
    // with the merged graph as the final snapshot.
    const allSnapshots: StraightSkeletonGraph[] = [];
    const subGraphs: StraightSkeletonGraph[] = [];
    let lastError: string | null = null;

    for (const [index, subPoly] of decomposition.subPolygons.entries()) {
        const result = runSimplePolygonStepped(
            subPoly, perceptualFloor, decomposition.subPolygonWeights[index]);
        allSnapshots.push(...result.snapshots);
        if (result.error) lastError = result.error;
        if (result.snapshots.length > 0) {
            subGraphs.push(result.snapshots[result.snapshots.length - 1]);
        }
    }

    // Append merged graph as final snapshot. Merged in UNIT space, because the crossing-point
    // deduplication compares positions under the same absolute tolerance the solver uses.
    const merged = mergeSkeletonGraphs(
        subGraphs.map(graph => ({graph})),
        decomposition.crossingPoints,
    );
    allSnapshots.push(merged.graph);

    denormaliseSnapshots(allSnapshots, normalisation);

    return {snapshots: allSnapshots, error: lastError};
}

function runSimplePolygonStepped(
    nodes: Vector2[],
    perceptualFloor: number,
    weights?: readonly number[],
): SteppedAlgorithmResult {
    const context = makeStraightSkeletonSolverContext(nodes, perceptualFloor, weights);
    const exteriorEdges = [...context.graph.edges];

    initInteriorEdges(context);

    const snapshots: StraightSkeletonGraph[] = [structuredClone(context.graph)];
    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

    try {
        while (inputs.length > 0) {
            inputs = stepAlgorithm(context, inputs).childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
            snapshots.push(structuredClone(context.graph));
        }
        return {snapshots, error: null};
    } catch (e) {
        snapshots.push(structuredClone(context.graph));
        return {snapshots, error: e instanceof Error ? e.message : String(e)};
    }
}