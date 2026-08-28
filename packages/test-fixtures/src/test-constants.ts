import type {StraightSkeletonSolverContext, Vector2} from '@proc-geo/core';

// ---------------------------------------------------------------------------
// Test polygon constants — NODES MUST BE ORDERED CLOCKWISE
// ---------------------------------------------------------------------------

export const TRIANGLE: Vector2[] = [{x: 0, y: 0}, {x: 2, y: 4}, {x: 4, y: 0}];

export const SQUARE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 2}, {x: 2, y: 2}, {x: 2, y: 0}];

export const RECTANGLE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 2}, {x: 4, y: 2}, {x: 4, y: 0}];

export const PENTAGON_HOUSE: Vector2[] = [
    {x: 3, y: 9},
    {x: 6, y: 6},
    {x: 6, y: 0},
    {x: 0, y: 0},
    {x: 0, y: 6}
];

export const SYMMETRICAL_OCTAGON: Vector2[] = [
    {x: 0, y: 3},
    {x: 0, y: 6},
    {x: 3, y: 9},
    {x: 6, y: 9},
    {x: 9, y: 6},
    {x: 9, y: 3},
    {x: 6, y: 0},
    {x: 3, y: 0}
]

export const DEFAULT_PENTAGON: Vector2[] = [
    {x: 250, y: 250},
    {x: 300, y: 450},
    {x: 500, y: 450},
    {x: 550, y: 250},
    {x: 400, y: 100},
];

export const AWKWARD_HEXAGON: Vector2[] = [
    {x: 250, y: 250},
    {x: 300, y: 450},
    {x: 500, y: 450},
    {x: 740, y: 201},
    {x: 572.8069677084923, y: 148.66030511340506},
    {x: 400, y: 100},
];

export const AWKWARD_HEPTAGON: Vector2[] = [
    {x: 250, y: 250},
    {x: 300, y: 450},
    {x: 500, y: 450},
    {x: 562.2692018374426, y: 407.2957030936534},
    {x: 740, y: 201},
    {x: 616.8069677084923, y: 263.66030511340506},
    {x: 519, y: 201},
];

export const IMPOSSIBLE_OCTAGON: Vector2[] = [
    {x: 316.9999990463257, y: 219.00000095367432},
    {x: 250, y: 250},
    {x: 300, y: 450},
    {x: 500, y: 450},
    {x: 577, y: 372},
    {x: 605.5056829452515, y: 334.50568294525146},
    {x: 580.5056829452515, y: 205.50568294525146},
    {x: 396, y: 214},
];

export const BROKEN_POLYGON: Vector2[] = [
    {x: 342, y: 305},
    {x: 231.4124715468463, y: 348.6498861873851},
    {x: 219, y: 490},
    {x: 573.9551266342539, y: 440.59680388705004},
    {x: 655, y: 453},
    {x: 680, y: 232},
    {x: 572.4959638502904, y: 228.0766686722798},
    {x: 421, y: 169},
];

export const CRAZY_POLYGON: Vector2[] = [
    {x: 250, y: 250},
    {x: 300, y: 450},
    {x: 500, y: 450},
    {x: 537.7868459349927, y: 389.0072879736522},
    {x: 572.2271765542667, y: 326.21280723459523},
    {x: 546.1435543836416, y: 249.6495408920134},
    {x: 488.47201260232487, y: 273.35264679006406},
    {x: 455.1750427158221, y: 327.2846666246924}
];

/**
 * An axis-aligned dumbbell whose *non-adjacent* edges share supporting lines.
 *
 * ITS DEGENERACY IS NOT REDUNDANT VERTICES, and must not be described as such. Every one of its
 * twelve turns is 90 degrees, so nothing is collinear *at a vertex* and no vertex-local test can
 * see anything wrong with it. What is degenerate is that pairs of non-adjacent edges lie on one
 * line — two on `y = 0`, two on `y = 10`, two on `x = 10` and two on `x = 20` — which makes
 * wall-to-wall distances exactly equal, so the pinches all land in a single offset layer.
 *
 * WHAT IT COST, AND WHAT FIXED IT (2026-08-28, journal decision 90; `solver-hardening-backlog.md`
 * item 7). For most of this arc it tiled with a 1.0e-1 relative error — strips overlapping strips by
 * about 22 of its 220 area units — while the solve reported `complete: true` with empty diagnostics.
 * The bar had NO SKELETON: its midline was born at each end pointing OUT of the bar, into the globe
 * behind it, so each globe was drawn as though the bar were not there and their faces overlapped
 * along the shaft. The cause was a direction hint that overruled the parent-derived basis wherever
 * the offset rate is zero, which is exactly the anti-parallel-parent case a corridor midline is.
 * With the hint gone the two midline bisectors meet head-on along `y = 5` and the shape tiles
 * exactly. `computeMaxOffset` is 5.
 *
 * IN `CLEAN_TEST_POLYGONS` SINCE THAT FIX. `packages/core/tests/straight-skeleton/collinear-dumbbell.test.ts`
 * is now a specification of the right answer; it was a tripwire pinning the wrong one.
 */
export const COLLINEAR_DUMBBELL: Vector2[] = [
    {x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 6},
    {x: 20, y: 6}, {x: 20, y: 10}, {x: 30, y: 10}, {x: 30, y: 0},
    {x: 20, y: 0}, {x: 20, y: 4}, {x: 10, y: 4}, {x: 10, y: 0},
];

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

export interface DiagnosticStepResult {
    stepIndex: number;
    poppedEdgeId?: number;
    acceptedInteriorEdges?: number[];
    newInteriorEdgeIds?: number[];
    acceptedExteriorEdges?: number[];
    newNodePosition?: Vector2;
    graphIsComplete?: boolean;
    error?: string;
}

export function getAcceptedExteriorEdges(context: StraightSkeletonSolverContext): number[] {
    const result: number[] = [];
    for (let i = 0; i < context.graph.numExteriorNodes; i++) {
        if (context.acceptedEdges[i]) result.push(i);
    }
    return result;
}
