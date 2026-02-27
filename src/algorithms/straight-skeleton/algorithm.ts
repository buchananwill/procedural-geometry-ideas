import {
    RayProjection,

    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";

import {
    addVectors,
    makeBasis,
    makeBisectedBasis,
    scaleVector,
} from "@/algorithms/straight-skeleton/core-functions";
import {intersectRays} from "@/algorithms/straight-skeleton/intersection-edges";

export function graphIsComplete(context: StraightSkeletonSolverContext): boolean {
    return context.acceptedEdges.every(flag => flag)
}

export function computeStraightSkeleton(nodes: Vector2[]): null {


    return null;
}

export interface PrimaryInteriorEdge {
    source: Vector2;
    target: Vector2;
    vertexIndex: number;
}

/**
 * Computes the initial interior angle bisectors at each polygon vertex,
 * extended until they hit the nearest non-adjacent exterior edge.
 */
export function computePrimaryInteriorEdges(vertices: Vector2[]): PrimaryInteriorEdge[] {
    if (vertices.length < 3) return [];

    const n = vertices.length;
    const result: PrimaryInteriorEdge[] = [];

    for (let i = 0; i < n; i++) {
        const source = vertices[i];

        // CW edge: from vertex i to vertex i+1
        const cwBasis = makeBasis(vertices[i], vertices[(i + 1) % n]);
        // WS edge: from vertex i-1 to vertex i
        const wsBasis = makeBasis(vertices[(i - 1 + n) % n], vertices[i]);

        // Bisect: CW basis and reversed WS basis
        const fromNodeWS = scaleVector(wsBasis, -1);
        const bisected = makeBisectedBasis(cwBasis, fromNodeWS);

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