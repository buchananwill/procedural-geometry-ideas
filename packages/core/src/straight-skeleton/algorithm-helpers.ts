import {
    InteriorEdge,
    PolygonEdge,
    PolygonNode,
    StraightSkeletonSolverContext,
    Vector2, BisectionParams, StraightSkeletonGraph
} from "./types";
import {complexLog, solverLog} from "./logger";
import {
    assertIsNumber,
    crossProduct,
    makeRay,
    makeWeightedBisectedBasis,
    negateVector,
    sineIsBelow
} from "./core-functions";
import {interiorEdgeIndex} from "./graph-helpers";
import {intersectRays} from "./intersection-edges";
import {arrivalOf, rayIntersectionUncertainty, timeOf} from "./collision-helpers";

/** `addBisectionEdge`'s zero-rate sine bar, held for C8 dispatch 2 (T17, T31; census S19). */
const ZERO_RATE_SINE_BAR = 0.00000001;


/**
 * Flip a naive bisection when the boundary turns widdershins at the vertex, which puts the
 * bisection outside the polygon.
 *
 * The cross product is the sine of the turn, so at a straight vertex it is zero and its sign
 * is whatever the last bits of the two edge bases happen to say — the same collinear vertex
 * reads positive near the origin and negative once translated. There is no turn to correct
 * for in that case: `makeBisectedBasis` has already fallen back to the inward perpendicular,
 * and flipping it points the bisector out of the polygon. So a turn indistinguishable from
 * zero is treated as no turn at all.
 *
 * SUPERSEDED FOR NEW BISECTORS by {@link bisectorOffsetRate}, which says the same thing in the
 * quantity the solver actually measures and stays determinate over a wider band — see
 * {@link addBisectionEdge}. Kept because it is the exported spelling of the rule and because the
 * two tolerances do not coincide exactly: the rate divides the cross product by `|c + w|`, which is
 * close to 2 for the anti-parallel parents that reach the other branch, so a cross product between
 * one and two epsilons reads as a zero rate and a non-zero turn. This decides that sliver the same
 * way the rate branch would have.
 *
 * THE NON-COINCIDENCE ABOVE IS AN OPEN DISAGREEMENT UNDER JOURNAL DECISION 105 (D14). The two
 * sites ask one expression of different operands: this one of `(cw, ws)` directly, the rate of
 * `(bisectedBasis, cw)`, which is the same cross product divided by `|cw − ws|`. Spec A15 closes it
 * by moving BOTH to the angular resolution on `(cw, ws)`. This site moved (2026-09-23, journal
 * decision 146); the rate's zero test did NOT — both readings of that move were refused by the corpus,
 * measured at the site in {@link addBisectionEdge} — so D14 stays open, now the other way round:
 * the rate's zero is reached only below `1e-8`, and every vertex that reaches it reads straight here.
 *
 * MEASURED, THE SLIVER THIS MOVE DECIDES IS NOT EMPTY OFF THE CORPUS. The full-graph digest of all
 * 59 fixtures is bit-identical under the move, as the 2026-08 widening measurements predicted; but
 * `NEAR_REGULAR_CIRCLE_32` jittered at one epsilon of its span, seed 5 (a cell of
 * `wavefront-causality.test.ts`'s generator, unpinned) reaches it once, and moves: 53 nodes to 52,
 * offset violations 1 → 2, clearance 6 → 4, direction 2 → 1. Reported rather than pinned.
 */
export function ensureBisectionIsInterior(
    clockwiseEdge: PolygonEdge,
    widdershinsEdge: PolygonEdge,
    bisectedBasis: Vector2,
    angularResolution: number,
) {
    const cross = crossProduct(clockwiseEdge.basisVector, widdershinsEdge.basisVector);
    // "Is this vertex straight?" — at the solve's angular resolution (spec A15), on the RAW PARENT
    // directions (spec A20: an input-geometry question, which carries no weight). A REQUIRED
    // parameter because this function has no context; `addBisectionEdge` hands it the context's.
    const straight = sineIsBelow(clockwiseEdge.basisVector, widdershinsEdge.basisVector, angularResolution);
    return cross < 0 && !straight ? negateVector(bisectedBasis) : bisectedBasis;
}

/**
 * How much wavefront offset one unit of travel along this basis buys, against the clockwise parent.
 *
 * THE SAME QUANTITY `makeOffsetDistance` USES to price every collision, and the reason the sign
 * matters: the wavefront clock only ever runs forward, so a bisector whose rate is negative moves
 * BACKWARDS in time along its own ray. Every offset computed for it then decreases with travel, the
 * layer's lowest-offset selection reaches its far end first, and a collision waiting near its source
 * is stepped over. That is how a waist bisector came to be consumed at the wrong end and its partner
 * left to escape the polygon.
 *
 * Written against the parent stored on the edge, not against the arguments a caller passed, so this
 * cannot drift away from the rate `sourceOffsetDistance` and `makeOffsetDistance` will read later.
 */
function bisectorOffsetRate(context: StraightSkeletonSolverContext, edge: InteriorEdge, basis: Vector2): number {
    return crossProduct(basis, context.clockwiseParent(edge).basisVector);
}

export function ensureDirectionNotReversed(basis: Vector2, approximateDirection: Vector2) {
    const dot = basis.x * approximateDirection.x + basis.y * approximateDirection.y;
    return dot < 0 ? negateVector(basis) : basis;
}

/**
 * returns index of just-added edge
 *
 * THE DIRECTION IS DECIDED BY THE OFFSET RATE, and where the rate is zero it is decided by the
 * PARENT ORDERING. A straight-skeleton bisector traces a wavefront vertex, and the wavefront clock
 * runs one way, so the rate against the clockwise parent ({@link bisectorOffsetRate}) is
 * non-negative for every bisector that can exist. That is not a new rule: for the bisected basis
 * `normalize(c - w)` the rate is `cross(c, w) / |c - w|`, so its sign IS
 * `ensureBisectionIsInterior`'s test — said in the quantity the solver prices collisions with, and
 * determinate over a wider band, because the `1 / |c - w|` keeps near-parallel parents (where the
 * turn is tiny but the bisector's direction is not in doubt) out of the tolerance hole.
 *
 * A ZERO RATE MEANS ANTI-PARALLEL PARENTS, AND NOTHING ELSE. The rate is `cross(cw, ws) / |c + w|`
 * and `|c + w|` is never zero on the path that reaches it, so the rate vanishes exactly when the two
 * parents are parallel. Parents pointing the SAME way make `c + w` zero, `makeBisectedBasis` returns
 * the inward perpendicular, and the rate is then ±1 — determinate. So only the anti-parallel pair
 * arrives here: the two walls of a corridor, whose bisector is the corridor's midline, at constant
 * offset along its whole length. `makeBisectedBasis` returns `c` for it, the clockwise parent's own
 * basis.
 *
 * AND `c` IS THE ANSWER, NOT A COIN TOSS. The parent pair is ORDERED by the ring: walking the
 * sub-polygon clockwise you traverse the widdershins parent, turn at this bisector's source, and
 * leave along the clockwise parent. Anti-parallel walls make that turn a U-turn — the CLOSED end of
 * the corridor — and the corridor extends the way the departing wall points, which is `c`. The other
 * end of the same corridor is a bisector whose parents are the same two walls in the opposite roles,
 * so its `c` is the other direction, and the two midlines meet head-on. Nothing about the offset can
 * say this, which is why it was mistaken for a genuine ambiguity.
 *
 * WHAT USED TO DECIDE IT, AND WHY IT COULD NOT. Callers passed an `approximateDirection` hint and
 * this branch flipped `c` to agree with it. `bisectionsForMerge`'s hint is the bisection of the two
 * ARRIVALS bracketing a gap, which is symmetric in them — so a two-run vertex event handed the same
 * hint to BOTH of its gaps, which face opposite ways, and the hint was therefore wrong for at least
 * one of them by construction. Measured, it was wrong for the corridor gap every time it mattered:
 * `COLLINEAR_DUMBBELL`'s bar midline was born pointing out of the bar into a globe (both ends), the
 * `CROSS` drew each arm's midline along the OPPOSITE arm, and `T_SHAPE`'s stem midline pointed up
 * into the head and was retired as a zero-length self-loop — the stem had no ridge at all.
 */
export function addBisectionEdge(context: StraightSkeletonSolverContext, clockwiseExteriorEdgeIndex: number, widdershinsExteriorEdgeIndex: number, source: number): number {

    const {graph} = context;
    const clockwiseEdge = graph.edges[clockwiseExteriorEdgeIndex];
    const widdershinsEdge = graph.edges[widdershinsExteriorEdgeIndex];

    // KEPT FOR ITS THROW, AND FOR THE LOG. `clockwiseSpanExcludingAccepted` refuses to measure a
    // span touching an accepted edge, so these two calls are how a caller that tries to bisect
    // between finished parents is caught here rather than downstream.
    const spanCwToWs = context.clockwiseSpanExcludingAccepted(clockwiseEdge, widdershinsEdge)
    const spanWsToCs = context.clockwiseSpanExcludingAccepted(widdershinsEdge, clockwiseEdge);

    // NAMED, NOT ACTED ON — AND THAT IS THE CORRECTION, NOT AN OVERSIGHT. The two branches this
    // used to have both assigned the parents from the SAME two variables, by shorthand, so they
    // differed only in the order the keys were written into the object literal: the "inverted"
    // branch never swapped anything. Reading it as a swap is what made the stored parents look
    // inconsistent with the `ensureBisectionIsInterior` call below, and they never were. The
    // condition is now recorded in the log it always wrote and nowhere else, so the next reader
    // cannot mistake a key ordering for a parent ordering.
    //
    // THE CONDITION IS LIVE, WHICH IS WHY THE COLLAPSE IS WORTH MAKING RATHER THAN DEAD CODE TO
    // DELETE. Measured by mutation: restoring the two branches changes nothing (4345/4345 green),
    // but making the inverted branch genuinely swap the parents fails 559 tests across 26 suites
    // and takes the recursive-subdivision census from 0 recorded failures to 298. The branch is
    // reached often and on this corpus the right answer is always "do not swap", so what looked
    // like a latent inconsistency was a trap for the reader and never a defect in the output.
    const parentsInverted = spanWsToCs > spanCwToWs;
    if (parentsInverted) {
        solverLog.debug(`Inverted parent ordering: ${clockwiseExteriorEdgeIndex}, ${widdershinsExteriorEdgeIndex}`);
    }

    const id = graph.edges.length;
    graph.interiorEdges.push({
        id,
        clockwiseExteriorEdgeIndex,
        widdershinsExteriorEdgeIndex,
        length: Number.MAX_VALUE,
    })

    const newEdge = context.getInteriorWithId(id);

    const fromNodeWiddershins = negateVector(context.widdershinsParent(newEdge).basisVector)
    const fromNodeClockwise = context.clockwiseParent(newEdge).basisVector;

    // W-spec W12–W14, W17. The direction is the KERNEL's — the solution of `v · n₁ = w₁`,
    // `v · n₂ = w₂` — spelled as the scaled difference `normalize(w_ws · c − w_cw · b)` so that at
    // unit weights it performs today's operations in today's order and is bit-identical. The sign
    // rule below is untouched: for positive weights the rate's sign is still the sign of `c × b`
    // (W-spec W13), so convex keeps the numerator and reflex negates it exactly as before.
    const bisectedBasis = makeWeightedBisectedBasis(
        fromNodeClockwise,
        fromNodeWiddershins,
        context.weightOf(clockwiseExteriorEdgeIndex),
        context.weightOf(widdershinsExteriorEdgeIndex));

    const offsetRate = bisectorOffsetRate(context, newEdge, bisectedBasis);
    let finalBasis: Vector2;

    // THE ZERO TEST IS IN THE ONE ANGULAR FORM; ONLY THE SIGN COMES FROM THE RATE ITSELF. The rate is
    // `cross(bisectedBasis, clockwiseParent)` and both operands are unit, so `sineIsBelow` is the
    // same bar and the same number as the `areEqual(offsetRate, 0)` this replaces — but it names the
    // space, which `areEqual` on a cross product never did (journal decision 105).
    //
    // THIS ONE STAYS AT THE SCRATCH EPSILON, ON THE RATE'S OWN OPERANDS — A MEASURED STOP, NOT AN
    // OMISSION (spec A15's `addBisectionEdge` row, A25 STOPs 3 and 4; journal decision 146). The spec
    // moves it to the angular resolution on the RAW PARENT directions `(cw, ws)`, the operands
    // `ensureBisectionIsInterior` reads, to close D14. Both readings of that row were measured on
    // 2026-09-23 and both were refused by the corpus:
    //
    //   - LITERALLY, orientation-blind — `sineIsBelow(cw, ws, angularResolution)`: a near-STRAIGHT
    //     vertex (parents pointing the same way, sine under the bar) then takes this branch, where
    //     `ensureBisectionIsInterior` calls it straight and never flips a bisector that
    //     `normalize(c − b)` pointed out of the polygon. `Off-edge Jitter Reflex L (seed 55433)` and
    //     `Off-edge Jitter Plus (seed 7919)` STOP SOLVING (STOP 3), and four clean fixtures (T-Shape,
    //     both dumbbells, Three Globe Chain) reach the branch they never reached.
    //   - ORIENTATION-AWARE — `directionsAreSame(cw, −ws, angularResolution)`, anti-parallel parents
    //     only, which is what "a zero rate" means: three bisectors are born with a NEGATIVE offset
    //     rate — `Off-edge Jitter Plus (seed 7919)` e48 at −8.8e-6 and e52 at −3.4e-6,
    //     `Off-edge Jitter Reflex L (seed 55433, k=4)` e48 at −7.8e-6, every one below the angular
    //     resolution — breaking the bisector rate rule, which `wavefront-causality.test.ts` holds
    //     universal over `FULL_CORPUS` (STOP 4). Re-measured 2026-09-23 under the solver's own
    //     causality check (journal-5 decisions 148, 149): both fixtures stay complete, the offset,
    //     clearance and direction counts do not move on either instrument, and NO diagnostic is raised
    //     — the negative rates are seen ONLY by the test-side rate check, which the solver does not run.
    //
    // A rate of a few parts in 1e6 is a real, if slow, wavefront direction: pricing it as zero hands
    // the direction to the parent ordering, which disagrees with the rate's sign. So the rate's own
    // zero test keeps the arithmetic bar it had, and D14 stays open — now with `ensureBisectionIsInterior`
    // at the resolution, where the rate's zero is reached only below `1e-8` and every such vertex reads
    // straight. The tolerance package (register C8) owns this site's re-derivation.
    //
    // NOT RE-DERIVED IN C8 DISPATCH 1 (census S19): T17's orientation-aware reading at ρ, with the
    // fourth oracle as its complement (T18), is dispatch 2's (T29–T32). The bar is held bit-identical.
    //
    // C8 DISPATCH 2 MEASURED T17 AND IT STOPS (2026-09-24, T37 STOPs 1 and 3; the window still held,
    // so T33's precondition is unmet as well). `directionsAreSame(cw, −ws, ρ)` on the raw parents,
    // with the fourth oracle landed at T18: the three sub-ρ negative rates appear as F65 found them and
    // the oracle correctly leaves them unflagged, three off-edge jitter cells lose a direction violation
    // (the L at k = 2 seed 55433, the plus at k = 4 seed 47514 and k = 6 seed 15838) — but the jittered
    // Circle 32 at 3 × 1e-8, seed 7, STOPS SOLVING (a pair-handler step failure on e71/e76), and the plus
    // at k = 2, seed 23757 gains an offset violation of 1.77e-6 with its `causality-violation` diagnostic.
    // Held here; the fourth oracle stands on its own (causality-check.ts) and reads zero everywhere.
    const zeroRate = sineIsBelow(bisectedBasis, context.clockwiseParent(newEdge).basisVector,
        ZERO_RATE_SINE_BAR);
    if (!zeroRate) {
        finalBasis = offsetRate < 0 ? negateVector(bisectedBasis) : bisectedBasis;
    } else {
        finalBasis = ensureBisectionIsInterior(clockwiseEdge, widdershinsEdge, bisectedBasis,
            context.angularResolution)
    }

    graph.edges.push({id, source, basisVector: finalBasis})

    graph.nodes[source].outEdges.push(id);

    return id;
}

/**
 * Creates a new bisection interior edge and extends acceptedEdges to cover it.
 * Returns the edge index. Does NOT evaluate intersections or push to heap.
 */
export function createBisectionInteriorEdge(context: StraightSkeletonSolverContext, clockwiseParent: number, widdershinsParent: number, source: number): number {
    const {acceptedEdges, graph} = context;
    const edgeIndex = addBisectionEdge(context, clockwiseParent, widdershinsParent, source);

    while (acceptedEdges.length <= edgeIndex) {
        acceptedEdges.push(false);
    }
    acceptedEdges[edgeIndex] = false;


    const interiorEdge = context.getInteriorWithId(edgeIndex);
    const newRay = context.projectRayInterior(interiorEdge)
    for (let i = 0; i < context.graph.numExteriorNodes; i++) {
        if (interiorEdge.clockwiseExteriorEdgeIndex === i || interiorEdge.widdershinsExteriorEdgeIndex === i) {
            continue;
        }
        const polygonEdge = context.getEdgeWithId(i);
        const exteriorEdgeRay = context.projectRay(polygonEdge)
        const [ray1Length, ray2Length] = intersectRays(newRay, exteriorEdgeRay, context.coaxialityFloor,
            context.angularResolution);
        if (ray1Length > 0 && ray2Length > 0) {
            const exteriorTargetNode = context.graph.nodes[polygonEdge.target!]
            const rayFromTargetEnd = makeRay(exteriorTargetNode.position, negateVector(polygonEdge.basisVector));
            const [ray1LengthTarget, ray2LengthTarget] = intersectRays(newRay, rayFromTargetEnd,
                context.coaxialityFloor, context.angularResolution);
            if (ray1LengthTarget > 0 && ray2LengthTarget > 0) {
                // W-spec W16: `maxOffset` is a TIME. At unit weights `distance / 1.0` is exact.
                // A ray intersection, so it carries the intersection's pricing error budget (C8 spec T12
                // as amended); only its time is read here, into `maxOffset`.
                const time = timeOf(arrivalOf(interiorEdge, context, newRay, ray1Length,
                    rayIntersectionUncertainty(newRay, exteriorEdgeRay)))
                context.updateMaxOffset(edgeIndex, time)
                complexLog.info(`EdgeId: ${edgeIndex}, collided edge: ${i}, time: ${time}`)

            }
        }
    }

    return edgeIndex;
}

export function bisectWithParams(context: StraightSkeletonSolverContext, params: BisectionParams) {
    return createBisectionInteriorEdge(context, params.clockwiseExteriorEdgeIndex, params.widdershinsExteriorEdgeIndex, params.source);
}

export function initInteriorEdges(context: StraightSkeletonSolverContext) {
    const exteriorEdges = [...context.graph.edges];

    // create interior edges from exterior node bisections
    for (let clockwiseExteriorEdgeIndex = 0; clockwiseExteriorEdgeIndex < exteriorEdges.length; clockwiseExteriorEdgeIndex++) {
        const widdershinsExteriorEdgeIndex = (clockwiseExteriorEdgeIndex - 1 + exteriorEdges.length) % exteriorEdges.length;
        createBisectionInteriorEdge(context, clockwiseExteriorEdgeIndex, widdershinsExteriorEdgeIndex, clockwiseExteriorEdgeIndex)
    }

}

export function hasInteriorLoop(edge: number, {acceptedEdges, graph}: StraightSkeletonSolverContext): boolean {


    // invalid id case
    if (edge >= graph.edges.length) {
        return false;
    }
    const isExterior = edge < graph.numExteriorNodes;
    const edgeData = graph.edges[edge];

    // not yet in the accepted array at all
    if (edge >= acceptedEdges.length) {
        return false;
    }

    // has already been accepted (loop is definition of acceptable exterior edge)
    if (isExterior && acceptedEdges[edge]) {
        return true;
    }

    // for interior edges check their parents
    if (!isExterior) {
        const interiorEdge = graph.interiorEdges[interiorEdgeIndex(edgeData, graph)];
        const clockwiseParent = interiorEdge.clockwiseExteriorEdgeIndex;
        const widdershinsParent = interiorEdge.widdershinsExteriorEdgeIndex;
        return acceptedEdges[clockwiseParent] || acceptedEdges[widdershinsParent];
    }

    const targetIndex = edgeData.target;
    assertIsNumber(targetIndex);

    // hard case/base case: find interior loop from exterior edge
    const targetNode: PolygonNode = graph.nodes[targetIndex];
    const visitedEdges = new Set<number>();
    const candidateEdges: number[] = [...targetNode.outEdges];

    const testAndAddCandidates = (edges: number[]): boolean => {
        for (const candidateEdge of edges) {
            if (candidateEdge === edge) {
                return true;
            }
            if (candidateEdge < graph.numExteriorNodes) {
                continue;
            }
            if (visitedEdges.has(candidateEdge)) {
                continue;
            }
            if (candidateEdge >= acceptedEdges.length) {
                continue;
            }
            if (!acceptedEdges[candidateEdge]) {
                continue;
            }
            candidateEdges.push(candidateEdge);
        }
        return false;
    }

    while (candidateEdges.length > 0) {
        const nextEdge = candidateEdges.pop()
        assertIsNumber(nextEdge)
        visitedEdges.add(nextEdge)

        if (nextEdge < graph.numExteriorNodes) {
            continue;
        }

        if (!acceptedEdges[nextEdge]) {
            continue;
        }

        const nextEdgeData = graph.edges[nextEdge];
        const nextTargetIndex = nextEdgeData.target;

        const nextSource = graph.nodes[nextEdgeData.source];
        // We need to skip this test for the source of the very first edge, otherwise we short circuit and get a false positive
        if (nextEdgeData.source !== targetIndex) {
            if (testAndAddCandidates(nextSource.outEdges)) {
                return true;
            }
            if (testAndAddCandidates(nextSource.inEdges)) {
                return true;
            }
        }
        if (nextTargetIndex !== undefined) {
            const nextTarget = graph.nodes[nextTargetIndex];

            if (testAndAddCandidates(nextTarget.outEdges)) {
                return true;
            }
            if (testAndAddCandidates(nextTarget.inEdges)) {
                return true;
            }
        }
    }

    return false;
}

export function tryToAcceptExteriorEdge(context: StraightSkeletonSolverContext, exteriorEdge: number) {
    if (hasInteriorLoop(exteriorEdge, context)) {
        context.acceptedEdges[exteriorEdge] = true;
    }

    return context.acceptedEdges[exteriorEdge];
}
