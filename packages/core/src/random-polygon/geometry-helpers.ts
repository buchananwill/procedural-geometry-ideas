import type { Vector2 } from "../shared/types";
import type { SegmentIntersection } from "./types";
import { segmentSegmentIntersection } from "../straight-skeleton/planar-geometry";

/*
 * The ring and segment primitives this module used to define are the solver's, and live in
 * `straight-skeleton/planar-geometry.ts`; they are re-exported here for this module's callers.
 */
export { segmentSegmentIntersection, signedArea, ringPerimeter, isClockwise } from "../straight-skeleton/planar-geometry";

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
