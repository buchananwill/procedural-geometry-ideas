import type { Vector2 } from "@/algorithms/straight-skeleton/types";
import type { SegmentIntersection } from "./types";
import { subtractVectors, crossProduct, addVectors, scaleVector } from "@/algorithms/straight-skeleton/core-functions";

const EPSILON = 1e-10;

/**
 * Test two finite line segments for intersection.
 * Segment A: a1 → a2.  Segment B: b1 → b2.
 * Returns null if segments don't intersect within their bounds.
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
  if (Math.abs(cross) < EPSILON) {
    return null;
  }

  const diff = subtractVectors(b1, a1);
  const tA = crossProduct(diff, dB) / cross;
  const tB = crossProduct(diff, dA) / cross;

  if (tA < -EPSILON || tA > 1 + EPSILON || tB < -EPSILON || tB > 1 + EPSILON) {
    return null;
  }

  const point = addVectors(a1, scaleVector(dA, tA));
  return { tA, tB, point };
}

/**
 * Signed area of a polygon via the shoelace formula.
 * Negative = clockwise winding (the convention used throughout this codebase).
 */
export function signedArea(vertices: Vector2[]): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  return area / 2;
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
