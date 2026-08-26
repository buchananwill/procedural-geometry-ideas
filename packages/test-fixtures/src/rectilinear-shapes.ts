import type {Vector2} from '@proc-geo/core';

// ---------------------------------------------------------------------------
// Strictly rectilinear polygons — every edge is axis-aligned.
// NODES MUST BE ORDERED CLOCKWISE
// ---------------------------------------------------------------------------

/** A Swiss-flag-style cross: a square with four equal arms. Solves completely. */
export const CROSS: Vector2[] = [
    {x: 2, y: 6},
    {x: 4, y: 6},
    {x: 4, y: 4},
    {x: 6, y: 4},
    {x: 6, y: 2},
    {x: 4, y: 2},
    {x: 4, y: 0},
    {x: 2, y: 0},
    {x: 2, y: 2},
    {x: 0, y: 2},
    {x: 0, y: 4},
    {x: 2, y: 4},
];

/**
 * A T-shape: a horizontal bar over a vertical stem. Solves completely, and is the corpus's
 * exercise of the DEGENERATE CLOSURE path: after the four simultaneous initial collisions, the
 * bar's remaining sub-polygons have all-parallel exterior parents, so the whole head closes at a
 * single offset onto the node at the top of the stem. The two surplus bisectors emitted at that
 * node are retired as culled zero-length self-loops (`InteriorEdge.culled`).
 */
export const T_SHAPE: Vector2[] = [
    {x: 0, y: 600},
    {x: 600, y: 600},
    {x: 600, y: 400},
    {x: 400, y: 400},
    {x: 400, y: 0},
    {x: 200, y: 0},
    {x: 200, y: 400},
    {x: 0, y: 400},
];
