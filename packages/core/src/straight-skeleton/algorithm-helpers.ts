import {
    InteriorEdge,
    PolygonEdge,
    SkeletonDirection,
    StraightSkeletonSolverContext,
    Vector2, BisectionParams, StraightSkeletonGraph
} from "./types";
import {complexLog} from "./logger";
import {
    crossProduct,
    makeRay,
    makeWeightedBisectedBasis,
    negateVector,
    sineIsBelow
} from "./core-functions";
import {adjacentExteriorEdge} from "./graph-helpers";
import {exteriorFaceIsClosed, linkInitialRings, openWavefrontSlot} from "./wavefront-links";
import {intersectRays} from "./intersection-edges";
import {
    arrivalOf,
    exteriorRayTerms,
    interiorRayTerms,
    rayIntersectionUncertainty,
    timeOf
} from "./collision-helpers";
import {ZERO_RATE_SINE_BAR} from "./constants";


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
 * REACHED ONLY WHERE THE OFFSET RATE READS ZERO ({@link addBisectionEdge}). Every other bisector takes
 * its direction from the sign of {@link bisectorOffsetRate}, which says the same thing in the quantity
 * the solver actually measures. Kept exported as the spelling of the rule.
 *
 * ONE AXIS AT TWO BARS, AN OPEN DISAGREEMENT UNDER JOURNAL DECISION 105 (D14). The two sites ask one
 * expression of different operands: this one of `(cw, ws)` directly, at the angular resolution (spec
 * A15, journal decision 146); the rate's zero test of `(bisectedBasis, cw)`, which is the same cross
 * product divided by `|cw − ws|`, at the held `ZERO_RATE_SINE_BAR` (its re-derivations are refused; see
 * {@link addBisectionEdge}). So the rate's zero is reached only below `1e-8`, and every vertex that
 * reaches it reads straight here.
 * Measured: angular-predicate-basis-decisions.md, "Measurement record", "ensureBisectionIsInterior: the straight test at the resolution".
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
 * is stepped over: a waist bisector is consumed at the wrong end and its partner escapes the polygon.
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
 * non-negative for every bisector that can exist. It is `ensureBisectionIsInterior`'s rule: for the bisected basis
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
 * say this; the ring's ordering does, so the case is not an ambiguity.
 *
 * NO CALLER'S DIRECTION HINT MAY OVERRULE IT. A hint drawn from the two ARRIVALS bracketing a gap (the
 * bisection of the two) is symmetric in them, so a two-run vertex event would hand the same hint to
 * BOTH of its gaps, which face opposite ways: wrong for at least one of them by construction, and for
 * the corridor gap every time it matters. Flipped to such a hint, `COLLINEAR_DUMBBELL`'s bar midline is
 * born pointing out of the bar into a globe (both ends), the `CROSS` draws each arm's midline along the
 * OPPOSITE arm, and `T_SHAPE`'s stem midline points up into the head and is retired as a zero-length
 * self-loop, leaving the stem no ridge at all.
 */
export function addBisectionEdge(context: StraightSkeletonSolverContext, clockwiseExteriorEdgeIndex: number, widdershinsExteriorEdgeIndex: number, source: number): number {

    const {graph} = context;
    const clockwiseEdge = graph.edges[clockwiseExteriorEdgeIndex];
    const widdershinsEdge = graph.edges[widdershinsExteriorEdgeIndex];

    // A BISECTOR BETWEEN FINISHED PARENTS IS REFUSED HERE, BY A DIRECT TEST (skeleton wavefront-order
    // spec, decision 21). An accepted parent has no wavefront left to bisect. The message speaks of a
    // span, which nothing here computes; it is the text `generate-split-event.ts` throws for the same
    // refusal, and step failures carry it.
    if (context.isAccepted(clockwiseExteriorEdgeIndex) || context.isAccepted(widdershinsExteriorEdgeIndex)) {
        throw new Error('Cannot compute span with accepted edges.');
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
    // unit weights it is the unweighted bisected basis bit for bit. For positive weights the rate's
    // sign is the sign of `c × b` (W-spec W13), so the sign rule below keeps the numerator at a convex
    // vertex and negates it at a reflex one.
    const bisectedBasis = makeWeightedBisectedBasis(
        fromNodeClockwise,
        fromNodeWiddershins,
        context.weightOf(clockwiseExteriorEdgeIndex),
        context.weightOf(widdershinsExteriorEdgeIndex));

    const offsetRate = bisectorOffsetRate(context, newEdge, bisectedBasis);
    let finalBasis: Vector2;

    // THE ZERO TEST IS IN THE ONE ANGULAR FORM; ONLY THE SIGN COMES FROM THE RATE ITSELF. The rate is
    // `cross(bisectedBasis, clockwiseParent)` and both operands are unit, so `sineIsBelow` asks the rate's
    // zero as a sine and names the space of its bar (journal decision 105).
    //
    // HELD AT `ZERO_RATE_SINE_BAR` (1e-8, census S19), ON THE RATE'S OWN OPERANDS, BY MEASURED STOPS. Every
    // re-derivation measured is refused: the angular resolution on the raw parents, read orientation-blind
    // or orientation-aware (spec A15's `addBisectionEdge` row, A25 STOPs 3 and 4; C8 spec T17, T37 STOPs 1
    // and 3), `k·u` (journal-5 decision 161(b)) and the forward bound 8u (journal-5 decision 164) each stop
    // a solve, raise a causality violation, or turn the clean `Golf Cart` — at the root or in its level-1
    // regions — into a silent wrong answer whose strips fall 3.2% short. Two reasons stand under the
    // measurements. A rate of a few parts in 1e6 is a real, if slow, wavefront direction: pricing it as zero
    // hands the direction to the parent ordering, which disagrees with the rate's sign. And the rates this
    // site must not price by sign are TRUE rates of a sub-perceptual tilt (`Golf Cart`'s vertex 3 sits one
    // ulp below 400), which no rounding bound on the rate separates from a genuine negative rate of
    // −6.22e-9. The bar is held beside the simultaneity window and the same-point box, measured with them
    // as one set (register C12; journal-5 decisions 165, 167(d); see constants.ts).
    // Measured: tolerance-derivation-decisions.md, "Measurement record", "addBisectionEdge: the zero-rate bar's re-derivations".
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
    // Its link slots, unlinked until the event that bore it links it (skeleton wavefront-order spec).
    openWavefrontSlot(context, edgeIndex);


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
                // A ray intersection, so it carries the intersection's error budget (journal-5 decision
                // 167's complete model); only its time is read here, into `maxOffset`.
                const time = timeOf(arrivalOf(interiorEdge, context, newRay, ray1Length,
                    rayIntersectionUncertainty(newRay, exteriorEdgeRay,
                        interiorRayTerms(interiorEdge, context, ray1Length), exteriorRayTerms(ray2Length))))
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

/**
 * ONE RING PER LOOP, IN LOOP ORDER (skeleton loops-input spec, decisions 12 to 15). The bisector at local vertex
 * `j` of loop `k` has source node and clockwise parent `start_k + j`, and the edge arriving at that node within
 * its own loop, read through `adjacentExteriorEdge`, as its widdershins parent. Creation follows exterior id
 * order, so the bisectors' ids follow the loops' vertex order.
 *
 * NO HOLE IS SPECIAL HERE. `addBisectionEdge` gives every bisector its direction unchanged (decision 15): with a
 * hole wound opposite to the outline, the side it bisects into is the building, so a corner convex in the hole's
 * own shape is reflex in the region. And each bisector's first `maxOffset` tests every exterior edge of every loop
 * (decision 14): a hole wall bounds an outline bisector's life exactly as an outline wall does.
 */
export function initInteriorEdges(context: StraightSkeletonSolverContext) {
    const {graph} = context;

    // create interior edges from exterior node bisections
    const bisectorAtNode: number[] = [];
    for (const loop of graph.loops) {
        for (let local = 0; local < loop.count; local++) {
            const clockwiseExteriorEdgeIndex = loop.start + local;
            const widdershinsExteriorEdgeIndex = adjacentExteriorEdge(
                graph, clockwiseExteriorEdgeIndex, SkeletonDirection.Widdershins);
            bisectorAtNode.push(createBisectionInteriorEdge(
                context, clockwiseExteriorEdgeIndex, widdershinsExteriorEdgeIndex, clockwiseExteriorEdgeIndex));
        }
    }

    // THE FIRST RINGS, IN EACH LOOP'S VERTEX ORDER (skeleton wavefront-order spec, decision 8): the bisector
    // at vertex i is born i-th, its clockwise parent is edge i and its clockwise neighbour is the bisector
    // at the next vertex of its loop, whose widdershins parent is that same edge.
    linkInitialRings(context, bisectorAtNode);
}

/**
 * ACCEPT AN EXTERIOR EDGE EXACTLY WHEN ITS FACE IS CLOSED: when no live bisector names it as a parent (skeleton
 * edge-acceptance spec, decisions 1 to 4; BSA.D296). Asked at step boundaries only — `runSimplePolygon`,
 * `runSimplePolygonStepped` and the test-side runners that follow `stepAlgorithm` the same way — where nothing is
 * pending, so there it is the approved predicate exactly. Once accepted an edge stays accepted: no birth can name
 * it, because `addBisectionEdge` refuses an accepted parent.
 *
 * FACE CLOSURE, NOT CONNECTIVITY. Accepting an edge when any chain of accepted interior edges joins its two end
 * nodes is wrong: the chain can run through a hub node where several faces' bisectors met within the floor, and
 * accept the edge while a bisector still traces its face (five single-loop solves; BSA.F95, BSA.F99). The next
 * birth naming the edge is then refused and its ring breaks.
 *
 * Only an exterior edge is ever accepted here; any other id is returned as it stands.
 *
 * A CONTEXT WITH NO INTERIOR EDGES ACCEPTS NOTHING (BSA.F100, BSA.D304): before `initInteriorEdges` no bisector has
 * traced any face, so no face has closed, although no live bisector names any edge either. The predicate alone would
 * accept every edge there, so the empty context is answered `false` by its own test. No solver caller asks it there.
 */
export function tryToAcceptExteriorEdge(context: StraightSkeletonSolverContext, exteriorEdge: number) {
    if (exteriorEdge >= 0 && exteriorEdge < context.graph.numExteriorNodes
        && context.graph.interiorEdges.length > 0
        && exteriorFaceIsClosed(context, exteriorEdge)) {
        context.acceptedEdges[exteriorEdge] = true;
    }

    return context.acceptedEdges[exteriorEdge];
}
