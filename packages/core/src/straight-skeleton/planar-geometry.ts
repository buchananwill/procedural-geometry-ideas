import type {Vector2} from "./types";
import {addVectors, crossProduct, scaleVector, subtractVectors} from "./core-functions";
import {CROSS_PRODUCT_ROUNDING_UNITS, UNIT_ROUNDOFF} from "./constants";

/*
 * PLANAR GEOMETRY THE SOLVER OWNS: rings, segments and lines in the plane, with no graph in sight. The solver's own
 * port boundary is this package, so these live here; `random-polygon/geometry-helpers.ts`,
 * `stroke-spline/vertex-budget.ts` and `terrain/polygon-slope.ts` re-export these for their own callers.
 */

/** Result of a finite segment-segment intersection test */
export interface SegmentIntersection {
    /** Parameter along segment A (0..1) */
    tA: number;
    /** Parameter along segment B (0..1) */
    tB: number;
    /** The intersection point */
    point: Vector2;
}

/**
 * Test two finite line segments for intersection.
 * Segment A: a1 → a2.  Segment B: b1 → b2.
 * Returns null if segments don't intersect within their bounds.
 *
 * THE PARALLEL TEST IS A DIVISION GUARD, AND TAKES ITS OWN ROUNDING BOUND (C8 spec T24, I6; census
 * S46): `cross(dA, dB)` is `|dA|·|dB|·sin θ` evaluated from raw (unnormalised) segment vectors, so its
 * absolute rounding error is `k·u·|dA|·|dB|` with `k` = `CROSS_PRODUCT_ROUNDING_UNITS` (the unit-vector
 * argument of constants.ts, scaled by the operands' lengths). Inside that bound the divisor has no sign
 * the arithmetic can vouch for, and the pair is parallel. An absolute bar on a raw cross product would be
 * a bar on an AREA, so a different angle at every segment length.
 *
 * CONTAINMENT IS EXACT: `t ∈ [0, 1]` with no slack. A slack on `t` would widen every segment by a
 * parameter, not a length; a caller that wants touches at a shared vertex treated as no crossing says
 * so with a length of its own (`polygon-decomposition.ts`, T24).
 */
export function segmentSegmentIntersection(
    a1: Vector2,
    a2: Vector2,
    b1: Vector2,
    b2: Vector2,
): SegmentIntersection | null {
    const dA = subtractVectors(a2, a1);
    const dB = subtractVectors(b2, b1);
    const cross = crossProduct(dA, dB);

    // Parallel or collinear — treat as no intersection
    const parallelBound = CROSS_PRODUCT_ROUNDING_UNITS * UNIT_ROUNDOFF
        * Math.hypot(dA.x, dA.y) * Math.hypot(dB.x, dB.y);
    if (Math.abs(cross) <= parallelBound) {
        return null;
    }

    const diff = subtractVectors(b1, a1);
    const tA = crossProduct(diff, dB) / cross;
    const tB = crossProduct(diff, dA) / cross;

    if (tA < 0 || tA > 1 || tB < 0 || tB > 1) {
        return null;
    }

    const point = addVectors(a1, scaleVector(dA, tA));
    return {tA, tB, point};
}

/**
 * Signed area of a polygon via the shoelace formula.
 * Negative = clockwise winding (the convention used throughout this codebase).
 *
 * Each term is taken relative to the polygon's own first vertex. The shoelace sum is
 * invariant under translation, so this is mathematically identical to summing over absolute
 * coordinates — but it is also numerically translation-invariant. Summed absolutely, every
 * term is of order D^2 for a polygon at distance D from the origin, so the sum carries an
 * absolute error of about D^2 * 2^-52 while the answer itself is only the true area A, and
 * the sign is lost once D > sqrt(A) * 6.7e7. Relative terms are of order A, so no such
 * cancellation occurs.
 */
export function signedArea(vertices: Vector2[]): number {
    let area = 0;
    const n = vertices.length;
    if (n === 0) return 0;
    const origin = vertices[0];
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area +=
            (vertices[i].x - origin.x) * (vertices[j].y - origin.y) -
            (vertices[j].x - origin.x) * (vertices[i].y - origin.y);
    }
    return area / 2;
}

/** The perimeter of a closed ring: the sum of its edge lengths, the closing edge included. */
export function ringPerimeter(vertices: Vector2[]): number {
    let perimeter = 0;
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        perimeter += Math.hypot(vertices[j].x - vertices[i].x, vertices[j].y - vertices[i].y);
    }
    return perimeter;
}

/**
 * Returns true if the polygon vertices are in clockwise winding order
 * (negative signed area, matching the convention used by the straight skeleton algorithm).
 */
export function isClockwise(vertices: Vector2[]): boolean {
    return signedArea(vertices) < 0;
}

/** Standard crossing-number test. Points exactly on an edge may fall either way; nothing here cares. */
export function isPointInPolygon(point: Vector2, polygon: readonly Vector2[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        const straddles = a.y > point.y !== b.y > point.y;
        if (straddles && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Perpendicular distance from `p` to the infinite LINE through `a` and `b`, with no clamping.
 *
 * THE UNCLAMPED SIBLING OF {@link distanceToSegment}, AND THE TWO ARE NOT INTERCHANGEABLE. They agree
 * exactly while the perpendicular foot lands inside `a`-`b`, and they disagree without bound outside
 * it: where `p` overshoots an endpoint the clamped form returns the distance to that endpoint, which
 * is dominated by how FAR ALONG the chord `p` went rather than by how far OFF it. For a fold — an
 * apex doubling back past the end of the chord between its own neighbours — that difference is the
 * difference between measuring the fold's length and measuring its width. A caller asking "how far
 * off this chord is it" wants this one; a caller asking "how close to this segment is it", such as
 * RDP's error bound, wants the clamped one.
 *
 * A zero-length chord has no line to be perpendicular to, so the distance to the point is returned —
 * the same fallback the clamped form takes, and the alternative is a 0/0 `NaN` that compares false
 * against every threshold and so silently passes any test written as a bound.
 */
export function distanceToSupportingLine(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
}

/** Distance from `p` to the segment `a`-`b` (the segment, so endpoints cap it). */
export function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
