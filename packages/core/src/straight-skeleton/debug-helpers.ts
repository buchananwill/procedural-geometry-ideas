import type {CollisionEvent, PrimaryInteriorEdge, RayProjection, StraightSkeletonSolverContext, Vector2} from './types';
import {collideEdges} from './collision-helpers';
import {birthArrivalOf, timeOf} from './collision-helpers';
import {addVectors, makeBasis, makeWeightedBisectedBasis, scaleVector} from "./core-functions";
import {intersectRays} from "./intersection-edges";

export interface CollisionSweepEvent {
    instigatorEdgeId: number;
    event: CollisionEvent;
}

/**
 * For each edge in edgeIds, collide against all other interior edges
 * and all exterior edges. Uses collideEdges directly (not cache-aware)
 * so that debug sweeps work independently of algorithm state.
 *
 * Returns everything including phantomDivergentOffset for full debug visibility.
 * Sorted by offsetDistance ascending.
 */
export function generateCollisionSweep(
    edgeIds: number[],
    context: StraightSkeletonSolverContext
): CollisionSweepEvent[] {
    const results: CollisionSweepEvent[] = [];
    const edgeIdSet = new Set(edgeIds);

    for (const edgeId of edgeIds) {
        // Collide against all interior edges
        for (const interiorEdge of context.graph.interiorEdges) {
            if (interiorEdge.id === edgeId) continue;
            const events = collideEdges(edgeId, interiorEdge.id, context);
            if (events !== null) {
                results.push(...events.map(event => ({instigatorEdgeId: edgeId, event: event})));
            }
        }

        // Collide against all exterior edges
        for (let i = 0; i < context.graph.numExteriorNodes; i++) {
            const events = collideEdges(edgeId, i, context);
                results.push(...events.map(event => ({instigatorEdgeId: edgeId, event: event})));

        }
    }

    results.sort((a, b) => a.event.offsetDistance - b.event.offsetDistance);
    return results;
}

/**
 * Compute the wavefront TIME of each interior node (W-spec W5, W40).
 *
 * For each node with id >= numExteriorNodes, picks any outgoing interior edge and returns that
 * edge's BIRTH ARRIVAL as a time — the source's perpendicular distance from its clockwise parent's
 * supporting line, divided by that parent's weight. The distance half is `sourceOffsetDistance`,
 * unchanged (W-spec W6); the division is by exactly `1.0` at unit weights, so the readout the
 * dashboard has always drawn is untouched.
 *
 * A SIBLING OF `computeNodeOffsets`, NOT A SECOND SOURCE OF TRUTH. This one reads the solver
 * context mid-solve and dates a node from the bisector leaving it; the projection's table re-derives
 * from the finished graph and canonicalises simultaneous sets. They agree on a completed solve and
 * only this one is available while stepping, which is why the debug overlay has its own.
 */
export function computeNodeOffsetDistances(
    context: StraightSkeletonSolverContext
): Map<number, number> {
    const result = new Map<number, number>();
    const {graph} = context;

    for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
        const node = graph.nodes[i];
        // Find an outgoing interior edge
        for (const edgeId of node.outEdges) {
            if (context.edgeRank(edgeId) !== 'exterior') {
                const edge = context.getInteriorWithId(edgeId);
                result.set(i, timeOf(birthArrivalOf(edge, context)));
                break;
            }
        }
    }

    return result;
}

/**
 * Computes the initial interior bisectors at each polygon vertex, extended until they hit the
 * nearest non-adjacent exterior edge.
 *
 * WEIGHTED, BECAUSE AN UNWEIGHTED OVERLAY DRAWN OVER A WEIGHTED SOLVE IS A WRONG PICTURE (W-spec
 * W15, arc decision 114(ii)). `weights[i]` is the speed of the edge LEAVING vertex `i`, parallel to
 * `vertices` exactly as the solver's own input is, and the direction drawn is the kernel's —
 * `normalize(w_ws · c − w_cw · b)`, the same spelling `addBisectionEdge` uses — so the overlay and
 * the solve's primary bisectors are one construction and not two. The direction is invariant under
 * a common scaling of all weights, so this needs no normalisation of its own: the caller may pass
 * the raw array or the solve's normalised one and get the same picture.
 *
 * Absent or empty weights mean all ones, and the answer is then bit-for-bit the unweighted overlay
 * this function has always drawn. A weights array of the wrong length is REFUSED rather than padded,
 * for the reason W-spec W1 refuses it at the solver's door: a short array silently draws a different
 * polygon's bisectors.
 */
export function computePrimaryInteriorEdges(
    vertices: Vector2[],
    weights?: readonly number[],
): PrimaryInteriorEdge[] {
    if (vertices.length < 3) return [];

    const n = vertices.length;
    if (weights !== undefined && weights.length > 0 && weights.length !== n) {
        throw new Error(
            `computePrimaryInteriorEdges received ${weights.length} weights for ${n} vertices; `
            + `a weight array must be parallel to the vertices, one speed per edge.`);
    }
    const weightOf = (index: number): number =>
        weights === undefined || weights.length === 0 ? 1 : weights[index];
    const result: PrimaryInteriorEdge[] = [];

    for (let i = 0; i < n; i++) {
        const source = vertices[i];

        // CW edge: from vertex i to vertex i+1
        const cwBasis = makeBasis(vertices[i], vertices[(i + 1) % n]);
        // WS edge: from vertex i-1 to vertex i
        const wsBasis = makeBasis(vertices[(i - 1 + n) % n], vertices[i]);

        // Bisect: CW basis and reversed WS basis, at the two parents' speeds (W-spec W12).
        const fromNodeWS = scaleVector(wsBasis, -1);
        const bisected = makeWeightedBisectedBasis(
            cwBasis, fromNodeWS, weightOf(i), weightOf((i - 1 + n) % n));

        // Determine correct direction via cross product (same as addBisectionEdge initial logic)
        const cross = cwBasis.x * wsBasis.y - cwBasis.y * wsBasis.x;
        const basis = cross < 0 ? scaleVector(bisected, -1) : bisected;

        const ray: RayProjection = {sourceVector: source, basisVector: basis};

        // Find nearest intersection with any non-adjacent exterior edge
        let bestDist = Number.POSITIVE_INFINITY;

        for (let j = 0; j < n; j++) {
            // Skip the two edges adjacent to this vertex
            if (j === i || j === (i - 1 + n) % n) continue;

            const edgeStart = vertices[j];
            const edgeEnd = vertices[(j + 1) % n];
            const edgeBasis = makeBasis(edgeStart, edgeEnd);
            const edgeLength = Math.sqrt(
                (edgeEnd.x - edgeStart.x) ** 2 + (edgeEnd.y - edgeStart.y) ** 2
            );
            const edgeRay: RayProjection = {sourceVector: edgeStart, basisVector: edgeBasis};

            const [distAlongBisector, distAlongEdge] = intersectRays(ray, edgeRay);

            // Must be forward along bisector, and within the edge segment
            if (distAlongBisector > 0 && distAlongEdge >= 0 && distAlongEdge <= edgeLength) {
                if (distAlongBisector < bestDist) {
                    bestDist = distAlongBisector;
                }
            }
        }

        if (isFinite(bestDist)) {
            const target = addVectors(source, scaleVector(basis, bestDist));
            result.push({source, target, vertexIndex: i});
        }
    }

    return result;
}

/**
 * Computes pairwise intersection points between primary interior edges (bisectors).
 * O(n^2) segment-segment intersection using unitsToIntersection.
 */
export function computePrimaryEdgeIntersections(primaryEdges: PrimaryInteriorEdge[]): Vector2[] {
    const points: Vector2[] = [];

    for (let i = 0; i < primaryEdges.length; i++) {
        for (let j = i + 1; j < primaryEdges.length; j++) {
            const a = primaryEdges[i];
            const b = primaryEdges[j];

            const aBasis: Vector2 = {
                x: a.target.x - a.source.x,
                y: a.target.y - a.source.y,
            };
            const aLen = Math.sqrt(aBasis.x * aBasis.x + aBasis.y * aBasis.y);
            if (aLen === 0) continue;

            const bBasis: Vector2 = {
                x: b.target.x - b.source.x,
                y: b.target.y - b.source.y,
            };
            const bLen = Math.sqrt(bBasis.x * bBasis.x + bBasis.y * bBasis.y);
            if (bLen === 0) continue;

            const rayA: RayProjection = {sourceVector: a.source, basisVector: aBasis};
            const rayB: RayProjection = {sourceVector: b.source, basisVector: bBasis};

            const [tA, tB] = intersectRays(rayA, rayB);

            // Both parameters must be in [0, 1] since we used unnormalized basis vectors
            // whose length equals the full segment length
            if (tA > 0 && tA < 1 && tB > 0 && tB < 1) {
                points.push(addVectors(a.source, scaleVector(aBasis, tA)));
            }
        }
    }

    return points;
}