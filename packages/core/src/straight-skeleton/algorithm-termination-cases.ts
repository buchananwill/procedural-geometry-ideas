import {
    AlgorithmStepInput,
    CollisionEvent,
    PolygonNode,
    StraightSkeletonSolverContext,
    Vector2
} from "./types";
import {stepLog} from "./logger";
import {directionsAreSame, dotProduct, rotateCw90, sizeOfVector, subtractVectors} from "./core-functions";
import {intersectRays} from "./intersection-edges";
import {
    arrivalOf,
    arrivalsAreEqual,
    bestNonPhantomCollision,
    birthArrivalOf,
    collideInteriorEdges,
    compareArrivals,
    nodeBirthArrival,
    nodePositionUncertainty,
    priceHeadOnPair,
    separationUncertainty,
} from "./collision-helpers";
import {addInEdges} from "./graph-helpers";
import {retireBisectors} from "./wavefront-links";
import {
    cramerQuotientRoundingBound,
    determinant3RoundingBound,
    determinant3TripleSum,
    HELD_SIMULTANEITY_WINDOW,
    POINT_ON_RAY_SINE_BAR,
    UNIT_ROUNDOFF,
    WALL_DIRECTION_ERROR,
} from "./constants";
import {
    applyDegenerateClosure,
    climbTerminalLadder,
    distinctExteriorParents,
    solveDegenerateClosure,
} from "./terminal-ladder";

/*
 * THE TWO BASE CASES of a step: a sub-polygon of two live interior edges (the pair, with its snap pre-pass) and of
 * three (the triangle, with its closed-form terminal solve). Both fall back to the terminal ladder
 * (`terminal-ladder.ts`) when no event is found.
 */

function stringifyFinalData(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): string {
    return `{"polygonEdges" :${JSON.stringify(context.getEdges(input.interiorEdges))}, "interiorEdges": ${JSON.stringify(context.getInteriorEdges(input.interiorEdges))}, "sourceNodes": ${JSON.stringify(input.interiorEdges.map(e => context.graph.nodes[context.getEdgeWithId(e).source]))}}`
}

/**
 * Does the point at `separation` from a ray's source lie ON that ray, travelling forward? — THE SNAP'S
 * predicate ({@link tryAttachEdgeToNode}, census S10), on the raw separation, with no division by its
 * length, as a sine at the held {@link POINT_ON_RAY_SINE_BAR}.
 *
 * The closure's point-on-ray test (S11) takes the coaxial form instead ({@link anchorLiesOnRay}): forward by the
 * exact sign and LATERAL within the coaxiality floor. The snap keeps the sine bar because its move to that form is a
 * measured STOP (spec A15's point-on-ray row, A25 STOP 4; journal decision 146; tolerance-derivation spec T32, T37
 * STOP 3): at the lane, snaps attach displaced nodes that grow causality counts, and cells go from a signalled
 * failure to `complete: true` with empty diagnostics while carrying violations. A defect that stops announcing itself
 * is a defect that got worse (journal decisions 72 and 134(c)), the failure mode decision 138(a) found at
 * `intersectRays`' identical-source exit. The bar is held until the half-merge windows these displaced nodes come
 * from are moved (see {@link POINT_ON_RAY_SINE_BAR}).
 * Measured: tolerance-derivation-decisions.md, "Measurement record", "pointLiesOnRay: the snap's measurements".
 */
function pointLiesOnRay(separation: Vector2, basis: Vector2): boolean {
    return directionsAreSame(separation, basis, POINT_ON_RAY_SINE_BAR);
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
 * CAUSALITY. This snap pass closes the terminal scenario when the skeleton fully solves, and
 * is reached only from `handleInteriorEdgePair`, the two-edge base case. Because it assigns
 * `target` directly — computing no offset and building no `CollisionEvent` — none of the
 * collision path's runtime checks can see it: not `validateSplitReachesEdge`'s
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
        // POINT-ON-RAY, ASKED OF THE RAW SEPARATION (journal decision 105), never as a component box
        // on the normalised separation: the division by `distance` is unbounded as the candidate
        // approaches the source, so the nearest nodes — exactly the ones this loop is looking for —
        // would be judged on the noisiest reading of their own direction.
        // Its bar is argued, and its move to the coaxiality floor measured and refused, at
        // {@link pointLiesOnRay}.
        if (!(distance > 0 && distance < nearestDistance
            && pointLiesOnRay(separation, edgeData.basisVector))) {
            continue;
        }

        // Same tolerance convention as `notYetBorn`: a snap exactly at the birth arrival is
        // legitimate, only a strictly earlier one is rejected (W-spec W30). S26 (C8 spec T14): "before
        // the birth" is a same-moment question; its window is held with the other six at
        // `HELD_SIMULTANEITY_WINDOW` (T37 STOP; register C12, see constants.ts).
        // The snap's travel is the distance between two node positions, each carrying its own budget.
        const snapArrival = arrivalOf(interiorEdge, context, ray, distance, separationUncertainty(
            nodePositionUncertainty(context, candidate.id), nodePositionUncertainty(context, source.id), distance));
        if (compareArrivals(snapArrival, birthArrival, HELD_SIMULTANEITY_WINDOW) < 0) {
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
        // birth check alone lets e67 and e68 snap outward before a later pass corrects their
        // targets, leaving nodes 31 and 35 holding exactly such phantom in-edges.
        // S24 (C8 spec T14): the snap's equal-time check; its window is held with the other six at
        // `HELD_SIMULTANEITY_WINDOW` (T37 STOP; register C12, see constants.ts).
        const candidateArrival = nodeBirthArrival(context, candidate);
        if (candidateArrival !== undefined
            && !arrivalsAreEqual(candidateArrival, snapArrival, HELD_SIMULTANEITY_WINDOW)) {
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

export function handleInteriorEdgePair(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepInput[] {
    if (input.interiorEdges.length !== 2) {
        throw new Error("Invalid call: expecting two interior edges");
    }

    const remaining = resolveEdgesPointingAtNodes(context, input.interiorEdges);

    // All edges resolved without collision
    if (remaining.length === 0) {
        context.acceptAll(input.interiorEdges);
        retireBisectors(context, input.interiorEdges);
        return [];
    }

    // One edge resolved, the other still needs a target — try to snap it too
    if (remaining.length === 1) {
        // The resolved edge created a new target node; re-attempt the remaining one
        if (tryAttachEdgeToNode(context, remaining[0])) {
            context.acceptAll(input.interiorEdges);
            retireBisectors(context, input.interiorEdges);
            return [];
        }
    }

    // Fall back to collision-based resolution
    const [id1, id2] = input.interiorEdges;
    const interior1 = context.getInteriorWithId(id1);
    const interior2 = context.getInteriorWithId(id2);

    // ANTI-PARALLEL IS NOT HEAD-ON. A test of `dot(basis1, basis2) === -1` cannot decide a
    // cross-wiring: two bisectors pointing directly *away* from each other are equally
    // anti-parallel. Cross-wiring those makes each terminate at the other's source, so both edges
    // run backwards along their own basis — a 2-cycle in which the wavefront vertex is drawn
    // travelling the opposite way to the direction it actually moves.
    //
    // `intersectRays` draws the distinction the dot product cannot. Its anti-parallel branch
    // returns 'head-on' only when the other ray's source lies *ahead* along this ray, and
    // 'parallel' when it lies behind, so its verdict is consulted here rather than re-derived.
    const [, , pairIntersection] = intersectRays(
        context.projectRayInterior(interior1),
        context.projectRayInterior(interior2),
        context.coaxialityFloor,
        context.angularResolution,
    );

    // Head on Collision
    if (pairIntersection === 'head-on') {
        context.crossWireEdges(id1, id2);
    } else if (pairIntersection === 'identical-source') {
        // A SHARED SOURCE IS A TERMINAL STATE, NOT A FAILURE. Rays leaving one point in different
        // directions do not intersect, and there is nothing left for them to propagate into: the
        // wavefront has finished. `intersectRays` classifies coincident sources first, before every
        // other test, and that verdict, already computed above for the head-on check, is acted on
        // here: read as "no collision", it would send the pair to the collision branch below, which
        // throws. No predicate or tolerance of its own is involved.
        // The shared source is an existing node: it keeps its own budget (journal-5 decision 167).
        context.terminateEdgesAtPoint([id1, id2], context.sourcePosition(id1), 0);
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
                return [];
            }

            // 'co-linear-from-2' defers to "the other edge's" pass, which only exists where both
            // orderings are generated (the n-gon path). This base case runs one ordering, so the
            // deferral has to be honoured here by trying the reverse ordering explicitly.
            collisions.push(...collideInteriorEdges(interior2, interior1, context));
        }

        if (collisions.length === 0) {
            // Nothing collided in either ordering, so the pair is on the TERMINAL LADDER (journal
            // decision 145) — the same ladder the triangle and the n-gon climb: a closure if either
            // applies (same-direction parallel rays are the case where no collision was ever
            // possible), else the coaxial completion, else the throw.
            const rung = climbTerminalLadder(context, input.interiorEdges);
            if (rung?.rung === 'closure') {
                applyDegenerateClosure(context, input.interiorEdges, rung.position);
                return [];
            }
            if (rung?.rung === 'completion') {
                // Two live edges ARE the pair: pricing them head-on wires each to the other's source,
                // the ridge between the two sources, as the head-on branch above does.
                context.crossWireEdges(rung.completion.firstId, rung.completion.secondId);
                context.acceptAll(input.interiorEdges);
                retireBisectors(context, input.interiorEdges);
                return [];
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
        // REACHED on `OFF_EDGE_JITTER_PLUS_SEED_7919` at native placement, and on the large-coordinate
        // cells journal decisions 66/81 accept, where it retires a bisector that cross-wiring would
        // wire back to an EXTERIOR node. Taking `id1` instead of the leading source fails seven tests
        // across five suites.
        // Measured: solver-coincidence-and-terminal-cases-decisions.md, "Measurement record", "handleInteriorEdgePair: the co-linear closure's reach".
        const intersectionType = best.intersectionData[2];
        if (intersectionType === 'co-linear-from-1') {
            const separation = subtractVectors(context.sourcePosition(id2), context.sourcePosition(id1));
            const leadingId = dotProduct(separation, context.getEdgeWithId(id1).basisVector) > 0 ? id2 : id1;
            /*
             * THE CLOSURE STANDS ON THE RAW SEPARATION, WITH NO EQUI-TIME CHECK (W-spec W33 is not
             * implemented, a measured negative result). W33 asks for one: the trailer reaches the
             * leading source at `arrivalOf(T, …, separation)` while the leader was born there at its
             * own birth arrival, and under weights the two need not agree. The check fires even at
             * unit weights, because the configurations that reach this branch are near-anti-parallel
             * corridors whose two mid-lines carry CONSTANT and slightly DIFFERENT times, and either
             * consequence of it firing rewrites the corpus's failure register (a defect grows under
             * the throw; an unattributed cure and a shattered cluster under the plain termination).
             * No weighted fixture reaches this branch, so nothing measures what the check would buy.
             * Measured: weighted-offsets-decisions.md, "Measurement record", "handleInteriorEdgePair: W33's equi-time check".
             */
            applyDegenerateClosure(context, input.interiorEdges, context.sourcePosition(leadingId));
            return [];
        } else {
            // Standard convergence — wire both edges to the collision point
            context.terminateEdgesAtPoint([id1, id2], best.position, best.positionUncertainty);
        }
    }

    context.acceptAll(input.interiorEdges);
    // The pair closes, and both its bisectors leave the wavefront (skeleton wavefront-order spec, decision 9).
    retireBisectors(context, input.interiorEdges);

    return [];
}

/** A terminal point and the wavefront offset at which every face reaches it. */
interface TerminalSolution {
    position: Vector2;
    /** The wavefront clock `t`: the offset from the supporting lines at which they meet here. */
    offset: number;
    /**
     * `offset`'s own first-order rounding bound (C8 spec T20): the sign test on `offset` reads it as
     * the width of "zero within the arithmetic".
     */
    offsetRoundingBound: number;
    /**
     * `position`'s first-order error budget against the exact walls (journal-5 decision 167): the Cramer
     * quotients' own rounding (c₃ = 5, {@link cramerQuotientRoundingBound}) for `x` and `y`, plus the walls'
     * input error — each normal turned by its wall's `2u`, each right-hand side `n·A` off by `4u·|A|` (the
     * turn and the dot's rounding) — carried through the inverse: `|δ(x, y)| ≤ (Σᵢ|C_i0| + Σᵢ|C_i1|)/|det| ·
     * maxᵢ(4u·|Aᵢ| + 2u·‖X‖₁)`, with `C` the cofactors (the inverse's first two rows are `C_i0/det`,
     * `C_i1/det`). RECORDED, NEVER READ BY A WINDOW: the triangle builds no `Arrival`, and its node is
     * terminal — every edge into it is accepted and nothing is ever born from it — so no arrival is ever
     * priced from this position and no window site compares its time.
     */
    positionUncertainty: number;
}

type Row3 = [number, number, number];

/** `Σᵢ |C_i,column|` — the absolute cofactors of one column of a 3×3 matrix (the inverse's row, times |det|). */
function cofactorColumnSum(rows: Row3[], column: number): number {
    let total = 0;
    for (let row = 0; row < 3; row++) {
        const keptRows = [0, 1, 2].filter(index => index !== row);
        const keptColumns = [0, 1, 2].filter(index => index !== column);
        const minor = rows[keptRows[0]][keptColumns[0]] * rows[keptRows[1]][keptColumns[1]]
            - rows[keptRows[0]][keptColumns[1]] * rows[keptRows[1]][keptColumns[0]];
        total += Math.abs(minor);
    }
    return total;
}

function determinant3(row0: Row3, row1: Row3, row2: Row3): number {
    return row0[0] * (row1[1] * row2[2] - row1[2] * row2[1])
        - row0[1] * (row1[0] * row2[2] - row1[2] * row2[0])
        + row0[2] * (row1[0] * row2[1] - row1[1] * row2[0]);
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
    // the double `-1`, so the unweighted solve's position and time are reproduced bit for bit.
    //
    // W-spec W29: a triangle over two SAME-FACING PARALLEL parents is singular at equal weights and
    // REGULAR under unequal weights — with `n₁ = n₃` the determinant is `(w₃ − w₁) · (n₁ × n₂)` — and
    // the solve then returns the point where the faster wall overtakes the slower. No branch is
    // needed: a regular determinant does not take the singular fall-through below.
    const rows = lines.map<Row3>(line => [line.normal.x, line.normal.y, -line.weight]);
    const rhs = lines.map(line => line.offsetFromOrigin);

    const determinant = determinant3(rows[0], rows[1], rows[2]);
    // A DIVISION GUARD (C8 spec T19, census S35): the determinant is singular when it lies inside its
    // own first-order rounding bound, `c₃·u·Σ|triple products|` with `c₃` = 5 argued at
    // `DETERMINANT3_ROUNDING_UNITS` (constants.ts). The bound is trilinear in the rows like the
    // determinant, so a weight scales both alike (W-spec W26, W28) without a separate factor. Across
    // 785 measured terminals the determinant never falls below 0.106, so the guard fires only on a
    // system that is singular in fact.
    const determinantBound = determinant3RoundingBound(determinant3TripleSum(rows[0], rows[1], rows[2]));
    if (Math.abs(determinant) <= determinantBound) {
        return undefined;
    }

    const replacedRows = (column: number): Row3[] => rows.map<Row3>((row, index) => {
        const copy: Row3 = [row[0], row[1], row[2]];
        copy[column] = rhs[index];
        return copy;
    });
    const substituted = (column: number): number => {
        const replaced = replacedRows(column);
        return determinant3(replaced[0], replaced[1], replaced[2]) / determinant;
    };

    const position = {x: substituted(0), y: substituted(1)};
    const offset = substituted(2);
    const offsetRows = replacedRows(2);
    const denominatorSum = determinant3TripleSum(rows[0], rows[1], rows[2]);
    const offsetRoundingBound = cramerQuotientRoundingBound(
        determinant3TripleSum(offsetRows[0], offsetRows[1], offsetRows[2]),
        denominatorSum,
        offset,
        determinant);

    // THE POSITION'S BUDGET (journal-5 decision 167): see `TerminalSolution.positionUncertainty`.
    const quotientRounding = (column: number, value: number): number => {
        const replaced = replacedRows(column);
        return cramerQuotientRoundingBound(
            determinant3TripleSum(replaced[0], replaced[1], replaced[2]), denominatorSum, value, determinant);
    };
    const pointSize = Math.abs(position.x) + Math.abs(position.y);
    const worstResidual = Math.max(...exteriorParentIds.map(parentId => {
        const source = context.sourcePosition(parentId);
        return 4 * UNIT_ROUNDOFF * (Math.abs(source.x) + Math.abs(source.y))
            + WALL_DIRECTION_ERROR * pointSize;
    }));
    const positionUncertainty = quotientRounding(0, position.x) + quotientRounding(1, position.y)
        + (cofactorColumnSum(rows, 0) + cofactorColumnSum(rows, 1)) / Math.abs(determinant) * worstResidual;
    return {position, offset, offsetRoundingBound, positionUncertainty};
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
    //
    // A SIGN DETECTOR, NOT A DIVISION GUARD (C8 spec T20, census S36): "negative beyond noise" is
    // negative beyond `t`'s own first-order rounding bound, argued at `cramerQuotientRoundingBound`
    // (constants.ts). A true orientation error gives `t` of order −1, far outside that bound.
    if (solution.offset < 0 && -solution.offset > solution.offsetRoundingBound) {
        stepLog.debug(
            `Terminal triangle [${interiorEdgeIds.join(', ')}] solved to a negative offset `
            + `${solution.offset}, so its parents' normals point outward: falling through to the collision path.`,
        );
        return undefined;
    }

    return solution;
}

/** The six ordered pairings of a triangle's three bisectors, in the order the triangle handler collides them. */
export const TRIANGLE_INTERSECT_PAIRINGS = [[0,1],[1,2],[2,0],[1,0],[2,1],[0,2]]

export function handleInteriorEdgeTriangle(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepInput[] {
    if (input.interiorEdges.length !== 3) {
        throw new Error("Invalid call: expecting three interior edges");
    }

    const terminal = solveTerminalTriangle(context, input.interiorEdges);
    if (terminal !== undefined) {
        context.terminateEdgesAtPoint(input.interiorEdges, terminal.position, terminal.positionUncertainty);
        context.acceptAll(input.interiorEdges);
        retireBisectors(context, input.interiorEdges);

        return [];
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
        // THE TERMINAL LADDER (journal decision 145), the same one the pair and the n-gon climb.
        // A triangle whose exterior parents are all parallel defeats every pairwise generator: the
        // terminal solve is singular, head-on rates cancel, and perpendicular arrivals meet at an
        // existing source with zero travel ('diverging'). If the whole triangle closes on one edge's
        // source at a single shared offset, it terminates there — the anchor edge becomes a culled
        // self-loop — and a triangle whose three vertices all travel the same way has no future event
        // either and closes at its leading source. Failing both, the coaxial completion.
        const rung = climbTerminalLadder(context, input.interiorEdges);
        if (rung === undefined) {
            throw new Error(`Failed to collide interior edges in triangle: ${stringifyFinalData(context, input)}`);
        }

        if (rung.rung === 'closure') {
            applyDegenerateClosure(context, input.interiorEdges, rung.position);
            return [];
        }

        // THE COMPLETION, IN THE TRIANGLE'S OWN TERMS: the named pair is priced head-on exactly as
        // `collideInteriorEdges` prices a head-on verdict, and — as with any best collision here —
        // the whole triangle terminates at that event's point.
        const event = priceHeadOnPair(
            context.getInteriorWithId(rung.completion.firstId),
            context.getInteriorWithId(rung.completion.secondId),
            context);
        context.terminateEdgesAtPoint(input.interiorEdges, event.position, event.positionUncertainty);
        context.acceptAll(input.interiorEdges);
        retireBisectors(context, input.interiorEdges);
        return [];
    }

    context.terminateEdgesAtPoint(input.interiorEdges, best.position, best.positionUncertainty);

    context.acceptAll(input.interiorEdges);
    // The triangle closes, and its bisectors leave the wavefront (skeleton wavefront-order spec, decision 9).
    retireBisectors(context, input.interiorEdges);

    return [];
}
