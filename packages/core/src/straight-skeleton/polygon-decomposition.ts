import {Vector2} from "./types";
import {segmentSegmentIntersection, signedArea, isClockwise} from "../random-polygon/geometry-helpers";
import {DEGENERATE_AREA_EPSILON} from "./constants";

/**
 * How close to a segment's end a crossing must be before it counts as an endpoint touch instead.
 *
 * A DIMENSIONLESS PARAMETRIC BAR on `t ∈ [0, 1]`, and its space is the point: it carries the same
 * value as {@link FLOATING_POINT_EPSILON} but is NOT that constant and must not be re-pointed at it,
 * because `t` has already been divided by the segment's own length. A `t` of 1e-8 is 1e-8 of a
 * length on every segment — so this bar is relative by construction where the solver's epsilon is
 * absolute, and the two agreeing on a number is a coincidence of history rather than a shared
 * meaning. Claim: two edges meeting within a hundred-millionth of a segment's length of a shared
 * vertex are meeting AT that vertex, and a polygon is not self-intersecting for touching itself
 * where it is already joined.
 *
 * NAMED AND CLASSIFIED, NOT RE-VALUED, under journal decision 104. The audit's own proposal — to
 * restate it as an absolute length against the segment's length — is a value change on every
 * segment whose length is not one, and nothing has measured what it would move.
 */
const ENDPOINT_PARAMETER_EPSILON = 1e-8;

export interface CrossingPoint {
    point: Vector2;
    /** Index of first edge (edge from vertices[edgeI] to vertices[edgeI+1]) */
    edgeI: number;
    /** Index of second edge */
    edgeJ: number;
    /** Parameter along first edge (0..1) */
    tI: number;
    /** Parameter along second edge (0..1) */
    tJ: number;
}

export interface DecompositionResult {
    /** The simple sub-polygons after decomposition (all clockwise) */
    subPolygons: Vector2[][];
    /** The crossing points inserted (these become interior nodes in the merged graph) */
    crossingPoints: Vector2[];
    /** Whether the original polygon was self-intersecting */
    wasSelfIntersecting: boolean;
}

/**
 * Find the first crossing between any pair of non-adjacent edges.
 * Returns null if polygon is simple.
 * O(n^2) brute force — fine for the polygon sizes used here (< 50 vertices).
 */
export function findFirstCrossing(vertices: Vector2[]): CrossingPoint | null {
    const n = vertices.length;
    if (n < 4) return null; // Triangle can't self-intersect

    for (let i = 0; i < n; i++) {
        const i2 = (i + 1) % n;
        for (let j = i + 2; j < n; j++) {
            // Skip adjacent edges: edge j and edge i share a vertex when j === (i - 1 + n) % n
            // In the loop j starts at i+2, so j > i+1. We also need to skip j = n-1 when i = 0 (closing edge is adjacent to edge 0).
            if (i === 0 && j === n - 1) continue;

            const j2 = (j + 1) % n;
            const result = segmentSegmentIntersection(vertices[i], vertices[i2], vertices[j], vertices[j2]);

            if (result === null) continue;

            // Skip endpoint-only touches (shared vertices, not true crossings)
            if (result.tA < ENDPOINT_PARAMETER_EPSILON
                || result.tA > 1 - ENDPOINT_PARAMETER_EPSILON) continue;
            if (result.tB < ENDPOINT_PARAMETER_EPSILON
                || result.tB > 1 - ENDPOINT_PARAMETER_EPSILON) continue;

            return {
                point: result.point,
                edgeI: i,
                edgeJ: j,
                tI: result.tA,
                tJ: result.tB,
            };
        }
    }

    return null;
}

/**
 * Given vertices and a crossing, split into sub-polygons.
 * Discards degenerate sub-polygons (fewer than 3 vertices, near-zero area, or counter-clockwise winding).
 * Returns 0, 1, or 2 valid sub-polygons.
 */
export function splitAtCrossing(vertices: Vector2[], crossing: CrossingPoint): Vector2[][] {
    const {point, edgeI: i, edgeJ: j} = crossing;
    const n = vertices.length;

    // Sub-polygon A: X, V_{i+1}, V_{i+2}, ..., V_j
    const subA: Vector2[] = [point];
    for (let k = i + 1; k <= j; k++) {
        subA.push(vertices[k % n]);
    }

    // Sub-polygon B: X, V_{j+1}, V_{j+2}, ..., V_i
    // Loop from j+1, wrapping around, stopping at (i+1)%n — so last vertex added is V_i.
    const subB: Vector2[] = [point];
    for (let k = (j + 1) % n; k !== (i + 1) % n; k = (k + 1) % n) {
        subB.push(vertices[k]);
    }

    return [subA, subB].filter(isValidSubPolygon);
}

/**
 * Check if a sub-polygon is valid for skeleton computation:
 * - At least 3 vertices
 * - Non-degenerate area
 * - Clockwise winding (counter-clockwise = exterior island, discard)
 */
function isValidSubPolygon(vertices: Vector2[]): boolean {
    if (vertices.length < 3) return false;
    const area = signedArea(vertices);
    if (Math.abs(area) < DEGENERATE_AREA_EPSILON) return false;
    // Clockwise winding has negative signed area in this codebase's convention
    return area < 0;
}

/**
 * Ensure vertices are in clockwise order; reverse if counter-clockwise.
 */
export function ensureClockwise(vertices: Vector2[]): Vector2[] {
    if (isClockwise(vertices)) return vertices;
    return [...vertices].reverse();
}

/**
 * Recursively decompose a possibly self-intersecting polygon into simple sub-polygons.
 * Each returned sub-polygon is guaranteed simple and clockwise-wound.
 */
export function decomposePolygon(vertices: Vector2[], maxDepth?: number): DecompositionResult {
    const limit = maxDepth ?? (vertices.length * (vertices.length - 1)) / 2;
    return decomposeRecursive(vertices, limit, 0);
}

function decomposeRecursive(vertices: Vector2[], maxDepth: number, depth: number): DecompositionResult {
    if (depth > maxDepth) {
        throw new Error(`Polygon decomposition exceeded max recursion depth (${maxDepth})`);
    }

    const crossing = findFirstCrossing(vertices);

    if (crossing === null) {
        // Simple polygon — base case
        return {
            subPolygons: [ensureClockwise(vertices)],
            crossingPoints: [],
            wasSelfIntersecting: false,
        };
    }

    const validSubs = splitAtCrossing(vertices, crossing);

    if (validSubs.length === 0) {
        // Both sub-polygons were degenerate — return empty
        return {
            subPolygons: [],
            crossingPoints: [crossing.point],
            wasSelfIntersecting: true,
        };
    }

    // Recurse on each valid sub-polygon
    const allSubPolygons: Vector2[][] = [];
    const allCrossingPoints: Vector2[] = [crossing.point];

    for (const sub of validSubs) {
        const result = decomposeRecursive(sub, maxDepth, depth + 1);
        allSubPolygons.push(...result.subPolygons);
        allCrossingPoints.push(...result.crossingPoints);
    }

    return {
        subPolygons: allSubPolygons,
        crossingPoints: allCrossingPoints,
        wasSelfIntersecting: true,
    };
}
