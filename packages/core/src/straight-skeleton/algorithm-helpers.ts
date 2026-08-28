import {
    InteriorEdge,
    PolygonEdge,
    PolygonNode,
    StraightSkeletonSolverContext,
    Vector2, BisectionParams, StraightSkeletonGraph
} from "./types";
import {complexLog, solverLog} from "./logger";
import {
    areEqual,
    assertIsNumber,
    crossProduct, dotProduct,
    makeBisectedBasis,
    makeRay,
    negateVector
} from "./core-functions";
import {interiorEdgeIndex} from "./graph-helpers";
import {intersectRays} from "./intersection-edges";
import {makeOffsetDistance} from "./collision-helpers";


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
 * {@link addBisectionEdge}. Kept because it is the exported spelling of the rule and is still
 * what decides the ambiguous case there.
 */
export function ensureBisectionIsInterior(clockwiseEdge: PolygonEdge, widdershinsEdge: PolygonEdge, bisectedBasis: Vector2
) {
    const cross = crossProduct(clockwiseEdge.basisVector, widdershinsEdge.basisVector);
    return cross < 0 && !areEqual(cross, 0) ? negateVector(bisectedBasis) : bisectedBasis;
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
 * THE DIRECTION IS DECIDED BY THE OFFSET RATE, and only where the rate cannot decide does anything
 * else get a say. A straight-skeleton bisector traces a wavefront vertex, and the wavefront clock
 * runs one way, so the rate against the clockwise parent ({@link bisectorOffsetRate}) is
 * non-negative for every bisector that can exist. That is not a new rule: for the bisected basis
 * `normalize(c - w)` the rate is `cross(c, w) / |c - w|`, so its sign IS
 * `ensureBisectionIsInterior`'s test — said in the quantity the solver prices collisions with, and
 * determinate over a wider band, because the `1 / |c - w|` keeps near-parallel parents (where the
 * turn is tiny but the bisector's direction is not in doubt) out of the tolerance hole.
 *
 * `approximateDirection` is a TIE-BREAK, not an override. It used to be applied unconditionally and
 * could therefore flip a determinate bisector to run backwards in time — it is a guess at the
 * direction, derived by rotating the instigating bisector ninety degrees, and that guess is wrong
 * whenever the split edge is near anti-parallel to the parent being paired with it. The genuinely
 * ambiguous case is exactly the anti-parallel one: with `w = -c` the bisected basis is `c` itself,
 * the rate is zero, both directions are equally forward, and the caller's guess is the only
 * information there is.
 */
export function addBisectionEdge(context: StraightSkeletonSolverContext, clockwiseExteriorEdgeIndex: number, widdershinsExteriorEdgeIndex: number, source: number, approximateDirection?: Vector2): number {

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

    const bisectedBasis = makeBisectedBasis(fromNodeClockwise, fromNodeWiddershins);

    const offsetRate = bisectorOffsetRate(context, newEdge, bisectedBasis);
    let finalBasis: Vector2;

    if (!areEqual(offsetRate, 0)) {
        finalBasis = offsetRate < 0 ? negateVector(bisectedBasis) : bisectedBasis;
    } else {
        finalBasis = ensureBisectionIsInterior(clockwiseEdge, widdershinsEdge, bisectedBasis)

        if (approximateDirection && dotProduct(approximateDirection, finalBasis) < 0) {
            finalBasis = negateVector(finalBasis)
        }
    }

    graph.edges.push({id, source, basisVector: finalBasis})

    graph.nodes[source].outEdges.push(id);

    return id;
}

/**
 * Creates a new bisection interior edge and extends acceptedEdges to cover it.
 * Returns the edge index. Does NOT evaluate intersections or push to heap.
 */
export function createBisectionInteriorEdge(context: StraightSkeletonSolverContext, clockwiseParent: number, widdershinsParent: number, source: number, approximateDirection?: Vector2): number {
    const {acceptedEdges, graph} = context;
    const edgeIndex = addBisectionEdge(context, clockwiseParent, widdershinsParent, source, approximateDirection);

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
        const [ray1Length, ray2Length] = intersectRays(newRay, exteriorEdgeRay);
        if (ray1Length > 0 && ray2Length > 0) {
            const exteriorTargetNode = context.graph.nodes[polygonEdge.target!]
            const rayFromTargetEnd = makeRay(exteriorTargetNode.position, negateVector(polygonEdge.basisVector));
            const [ray1LengthTarget, ray2LengthTarget] = intersectRays(newRay, rayFromTargetEnd);
            if (ray1LengthTarget > 0 && ray2LengthTarget > 0) {
                const offset = makeOffsetDistance(interiorEdge, context, newRay, ray1Length)
                context.updateMaxOffset(edgeIndex, offset)
                complexLog.info(`EdgeId: ${edgeIndex}, collided edge: ${i}, offset: ${offset}`)

            }
        }
    }

    return edgeIndex;
}

export function bisectWithParams(context: StraightSkeletonSolverContext, params: BisectionParams) {
    return createBisectionInteriorEdge(context, params.clockwiseExteriorEdgeIndex, params.widdershinsExteriorEdgeIndex, params.source, params.approximateDirection ?? undefined);
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
