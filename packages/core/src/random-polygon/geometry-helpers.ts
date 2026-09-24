import type { Vector2 } from "../shared/types";
import type { SegmentIntersection } from "./types";
import { subtractVectors, crossProduct, addVectors, scaleVector } from "../straight-skeleton/core-functions";
import { CROSS_PRODUCT_ROUNDING_UNITS, UNIT_ROUNDOFF } from "../straight-skeleton/constants";

/**
 * Test two finite line segments for intersection.
 * Segment A: a1 → a2.  Segment B: b1 → b2.
 * Returns null if segments don't intersect within their bounds.
 *
 * THE PARALLEL TEST IS A DIVISION GUARD, AND TAKES ITS OWN ROUNDING BOUND (C8 spec T24, I6; census
 * S46): `cross(dA, dB)` is `|dA|·|dB|·sin θ` evaluated from raw (unnormalised) segment vectors, so its
 * absolute rounding error is `k·u·|dA|·|dB|` with `k` = `CROSS_PRODUCT_ROUNDING_UNITS` (the unit-vector
 * argument of constants.ts, scaled by the operands' lengths). Inside that bound the divisor has no sign
 * the arithmetic can vouch for, and the pair is parallel. It was an absolute `1e-10` on a raw cross
 * product — an AREA, so a different angle at every segment length.
 *
 * CONTAINMENT IS EXACT: `t ∈ [0, 1]` with no slack. The `1e-10` slack widened every segment by a
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
  return { tA, tB, point };
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

/**
 * Given a growing chain of vertices (open, not yet closed), test whether a new
 * edge from vertices[last] → newPoint intersects any existing edge except the
 * immediately adjacent one (vertices[last-1] → vertices[last]).
 *
 * Returns the earliest intersection (smallest tA along the new edge) and the
 * index of the intersected edge, or null if none.
 */
export function findSelfIntersection(
  vertices: Vector2[],
  newPoint: Vector2,
): { intersection: SegmentIntersection; edgeIndex: number } | null {
  const n = vertices.length;
  if (n < 2) return null;

  const a1 = vertices[n - 1];
  const a2 = newPoint;

  let best: { intersection: SegmentIntersection; edgeIndex: number } | null = null;

  // Test against edges 0..(n-3). Edge (n-2)→(n-1) is adjacent, skip it.
  for (let i = 0; i <= n - 3; i++) {
    const result = segmentSegmentIntersection(a1, a2, vertices[i], vertices[i + 1]);
    if (result && (best === null || result.tA < best.intersection.tA)) {
      best = { intersection: result, edgeIndex: i };
    }
  }

  return best;
}

/**
 * Given a closed polygon's vertices, test whether the closing edge
 * (vertices[last] → vertices[0]) intersects any non-adjacent edge.
 *
 * Skips edge 0→1 (shares vertex 0) and edge (n-2)→(n-1) (shares last vertex).
 * Returns the earliest intersection along the closing edge, or null.
 */
export function findClosingIntersection(
  vertices: Vector2[],
): { intersection: SegmentIntersection; edgeIndex: number } | null {
  const n = vertices.length;
  if (n < 4) return null; // Triangle always closes cleanly

  const a1 = vertices[n - 1];
  const a2 = vertices[0];

  let best: { intersection: SegmentIntersection; edgeIndex: number } | null = null;

  // Skip edge 0→1 (i=0, shares vertex 0) and edge (n-2)→(n-1) (i=n-2, shares last vertex)
  for (let i = 1; i <= n - 3; i++) {
    const result = segmentSegmentIntersection(a1, a2, vertices[i], vertices[i + 1]);
    if (result && (best === null || result.tA < best.intersection.tA)) {
      best = { intersection: result, edgeIndex: i };
    }
  }

  return best;
}
