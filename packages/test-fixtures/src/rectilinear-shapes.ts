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

/**
 * A dumbbell whose two globes are DIFFERENT SIZES, joined by the same two-unit bar.
 *
 * The `COLLINEAR_DUMBBELL` class with its mirror symmetry removed. The bar is still a corridor of
 * anti-parallel walls (`y = 4` and `y = 6`) whose two ends pinch at the same offset — that is forced
 * by the bar's width and cannot be broken while the bar stays parallel — but the two globes now
 * finish at different offsets, so nothing else about the solve is symmetric. It exists so the
 * corridor-midline fix is convicted on a shape that is not the fixture rescaled: measured before it,
 * this tiled at 6.96e-2 while reporting `complete: true`, with the bar's midline drawn out of the bar
 * into each globe.
 */
export const ASYMMETRIC_DUMBBELL: Vector2[] = [
    {x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 6},
    {x: 20, y: 6}, {x: 20, y: 12}, {x: 34, y: 12}, {x: 34, y: -2},
    {x: 20, y: -2}, {x: 20, y: 4}, {x: 10, y: 4}, {x: 10, y: 0},
];

/**
 * Three globes in a row, joined by TWO bars — two corridors in series, in one offset layer.
 *
 * The `COLLINEAR_DUMBBELL` class with more than one corridor. Both bars are two units wide, so all
 * four of their end pinches land at the same offset and the layer has to resolve four simultaneous
 * closure nodes and emit four corridor midlines. Measured before the corridor-midline fix, this
 * tiled at 1.29e-1 while reporting `complete: true`, and the middle bar's two midlines were wired to
 * each other ACROSS the middle globe rather than along their own bar — the failure the dumbbell's
 * single corridor cannot exhibit.
 */
export const THREE_GLOBE_CHAIN: Vector2[] = [
    {x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 6},
    {x: 20, y: 6}, {x: 20, y: 10}, {x: 30, y: 10}, {x: 30, y: 6},
    {x: 40, y: 6}, {x: 40, y: 10}, {x: 50, y: 10}, {x: 50, y: 0},
    {x: 40, y: 0}, {x: 40, y: 4}, {x: 30, y: 4}, {x: 30, y: 0},
    {x: 20, y: 0}, {x: 20, y: 4}, {x: 10, y: 4}, {x: 10, y: 0},
];

/**
 * The T-shape with its right stem wall slanted: vertex 3 moves from (400,400) to
 * (560.97, 400−6e-14). Edges 2 and 6 both lie on y=400, parallel to top edge 0 at distance 200,
 * so the reflex bisectors from vertices 3 and 6 split edge 0 at the same offset — forced exactly —
 * but at different points, because the slant tilts vertex 3's bisector. That double split of one
 * exterior edge defeated the partition dedupe's one-split-per-start assumption
 * (`Partition sorting failure`, recorded 2026-08-26) until the layer learned to partition at every
 * split point (journal decision 56, 2026-08-27). Solves completely; pinned end-to-end with its
 * variant matrix in `packages/core/tests/straight-skeleton/golf-cart.test.ts`. The 6e-14
 * perturbation on vertex 3's y is inert — measured neither necessary nor sufficient — and is kept
 * because this is the coordinate set the failure was recorded with.
 * */
export const GOLF_CART: Vector2[] = [
        {
            "x": 0,
            "y": 600
        },
        {
            "x": 600,
            "y": 600
        },
        {
            "x": 600,
            "y": 400
        },
        {
            "x": 560.9659381815327,
            "y": 399.99999999999994
        },
        {
            "x": 400,
            "y": 0
        },
        {
            "x": 200,
            "y": 0
        },
        {
            "x": 200,
            "y": 400
        },
        {
            "x": 0,
            "y": 400
        }
    ]
