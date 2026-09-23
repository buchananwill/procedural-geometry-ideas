import type {Vector2} from '@proc-geo/core';
import {COLLINEAR_DUMBBELL} from './test-constants';

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
 * One member of the anti-parallel corridor family (spec A24): a ring PLUS a recorded displacement of
 * one corridor mid-line source, applied by a harness rather than by the ring.
 *
 * `vertices` is ordinary solver input. `lateralDisplacement` is NOT: it is a distance in the solve's
 * UNIT space, applied across the corridor to the source of the corridor's second mid-line bisector
 * after the solver has created it and before the two-edge corridor sub-polygon is stepped. The
 * harness that applies it is `packages/core/tests/straight-skeleton/anti-parallel-corridor.test.ts`.
 */
export interface AntiParallelCorridorFixture {
    name: string;
    /** The ring. `COLLINEAR_DUMBBELL`'s own coordinates: the bar is the corridor. */
    vertices: Vector2[];
    /** Unit-space lateral displacement of the second mid-line source, across the corridor. */
    lateralDisplacement: number;
}

/*
 * ============================================================================
 *  THE ANTI-PARALLEL CORRIDOR FAMILY — spec A24, journal decision 150.
 * ============================================================================
 *
 * `COLLINEAR_DUMBBELL`'s bar is a corridor between two exactly anti-parallel walls, and its two
 * mid-line bisectors are born at the bar's two end pinches pointing at each other along `y = 5`. In
 * unit space they sit 0.375 apart on `y = 0`. The family displaces the SECOND of them — the one born
 * at the bar's right end — across the corridor by a named `δ`, moving its node, as a near-simultaneous
 * upstream event moved `r0.2.1`'s:
 *
 *   - `_COAXIAL` (δ = 0) — the control;
 *   - `_SUB_EPSILON` (δ = 5e-9) — inside the retired coordinate epsilon;
 *   - `_IN_BAND` (δ = 2.754e-8) — `r0.2.1`'s own displacement (journal F57), the band `(1e-8, 1e-6]`
 *     the coaxiality lane cured in dispatch 1;
 *   - `_ABOVE_FLOOR` (δ = 5e-6) — five times the library floor, outside the lane.
 *
 * WHY A DISPLACEMENT AND NOT A RING (spec A24, I3). A corridor's two mid-line sources are equidistant
 * from both walls in exact arithmetic, so no plain ring puts them on different lines: three
 * constructions were measured negative on 2026-09-11 (thin slit, tilted-wall dumbbell, stepped-wall
 * dumbbell).
 *
 * O4 — THE FOURTH CONSTRUCTION, ATTEMPTED 2026-09-23 AND MEASURED NEGATIVE. Spec O4 asked for one
 * timeboxed attempt at a ring whose upstream event at one corridor end is deliberately
 * near-simultaneous with another, so the coincidence merge displaces the mid-line source out of the
 * lane. The ring tried is an OFFSET CROSS: a vertical corridor `x ∈ [8, 10]`, `y ∈ [0, 10]`, with a
 * right bar `y ∈ [4, 6]` (to `x = 18`) and a left bar `y ∈ [4 + η, 6 + η]` (to `x = 0`), so the two
 * bars' end pinches and the four reflex bisectors of the junction arrive within `η` of each other near
 * `(9, 5)` at offset 1. Measured with `solveSkeleton` at the library floor (unit scale 1/32):
 *
 *   - η = 1e-6 / 1e-5 / 2e-5: complete, empty diagnostics; the right bar's mid-line source is displaced
 *     `η/8` across its bar — 1.25e-7 / 1.25e-6 / 2.5e-6 in caller units, 3.9e-9 / 3.9e-8 / 7.8e-8 in
 *     unit space — which is 12.8× INSIDE the lane at its largest, and the pair is priced head-on.
 *     Displacement is bounded by construction: a coincidence merge joins arrivals less than one floor
 *     apart and its medoid is a member, so one merge cannot move a source by a floor or more.
 *   - η = 3e-5 up to 1e-2: the arrivals separate into layers, both bars' mid-line sources land EXACTLY
 *     on their own mid-lines (lateral 0), and the solve fails in a DIFFERENT way — the n-gon
 *     `[26, 27, 28, 30]` produces no event, the coaxial completion fires on the vertical corridor's
 *     exactly coaxial pair e28/e30 (symmetric lateral 0; the pair is head-on but its offset rates
 *     cancel, so `meetHeadOn` returns no time) and a step failure follows ("Unable to play interior
 *     edge 27 in any span"). That is a completion firing on a real ring, reported as a finding; its
 *     walls are not all parallel, so spec A16's arm does not reach it.
 *
 * So the ring-plus-displacement form stands. None of the four is enrolled in a roster: a roster entry
 * is `{name, vertices}` — solver input — and the displacement is not in the vertices, so enrolling
 * would put four copies of `COLLINEAR_DUMBBELL` (already in `CLEAN_TEST_POLYGONS`) into every corpus
 * sweep. The measured verdicts, before and after spec A16's arm, are pinned by the harness.
 */

/** δ = 0: the control. The two mid-lines are one line, and the pair is priced head-on. */
export const ANTI_PARALLEL_CORRIDOR_COAXIAL: AntiParallelCorridorFixture = {
    name: 'Anti-parallel Corridor (coaxial)',
    vertices: COLLINEAR_DUMBBELL,
    lateralDisplacement: 0,
};

/** δ = 5e-9: inside the retired coordinate epsilon. */
export const ANTI_PARALLEL_CORRIDOR_SUB_EPSILON: AntiParallelCorridorFixture = {
    name: 'Anti-parallel Corridor (sub-epsilon)',
    vertices: COLLINEAR_DUMBBELL,
    lateralDisplacement: 5e-9,
};

/** δ = 2.754e-8: `r0.2.1`'s own displacement (journal F57), 36× inside the library floor. */
export const ANTI_PARALLEL_CORRIDOR_IN_BAND: AntiParallelCorridorFixture = {
    name: 'Anti-parallel Corridor (in band)',
    vertices: COLLINEAR_DUMBBELL,
    lateralDisplacement: 2.754e-8,
};

/** δ = 5e-6: five times the library floor, outside the coaxiality lane. */
export const ANTI_PARALLEL_CORRIDOR_ABOVE_FLOOR: AntiParallelCorridorFixture = {
    name: 'Anti-parallel Corridor (above floor)',
    vertices: COLLINEAR_DUMBBELL,
    lateralDisplacement: 5e-6,
};

/**
 * O4's OFFSET CROSS at η = 1e-4 — a plain ring the solver FAILS on, and since 2026-09-23 the
 * recursion suites' constructed unsolvable specimen.
 *
 * A vertical corridor `x ∈ [8, 10]` with a right bar `y ∈ [4, 6]` and a left bar raised by η. It is the
 * O4 construction recorded in the family header above, at the first rung past its measured
 * transition (η = 3e-5): it does NOT displace a corridor mid-line — both bars' mid-line sources land
 * exactly on their own mid-lines — and fails instead in the n-gon `[26, 27, 28, 30]`, where the vertical
 * corridor's exactly coaxial head-on pair has cancelling offset rates, so no event is priced; the
 * coaxial completion fires on it (symmetric lateral 0) and a step failure follows. Its walls are not
 * all parallel, so spec A16's arm does not reach it, and it fails identically before and after that
 * arm and the coaxial collinearity exits.
 *
 * WHY IT IS HERE. The recursion driver's natural population of regions that fail a solve went extinct
 * on 2026-09-23 — `OFF_EDGE_JITTER_PLUS_SEED_7919`'s last five were cured by the coaxial collinearity
 * exits (journal decision 150) — and the suites that assert how a failed solve is RECORDED need one.
 *
 * ENROLLED IN `KNOWN_DEFECT_POLYGONS` 2026-09-23, JOURNAL DECISION 151(d), as 'Offset Cross Junction':
 * the constructed defect specimen the register has wanted since decision 138(c), and the dashboard's
 * specimen. Its signature is pinned in every suite that sweeps `FULL_CORPUS`. It fails at floors 1e-6
 * and 3e-6 and solves complete from 1e-5 up.
 */
export const OFFSET_CROSS_JUNCTION: Vector2[] = [
    {x: 8, y: 0}, {x: 8, y: 4.0001}, {x: 0, y: 4.0001}, {x: 0, y: 6.0001},
    {x: 8, y: 6.0001}, {x: 8, y: 10}, {x: 10, y: 10}, {x: 10, y: 6},
    {x: 18, y: 6}, {x: 18, y: 4}, {x: 10, y: 4}, {x: 10, y: 0},
];

/** The four, in ascending displacement. */
export const ANTI_PARALLEL_CORRIDOR_FAMILY: AntiParallelCorridorFixture[] = [
    ANTI_PARALLEL_CORRIDOR_COAXIAL,
    ANTI_PARALLEL_CORRIDOR_SUB_EPSILON,
    ANTI_PARALLEL_CORRIDOR_IN_BAND,
    ANTI_PARALLEL_CORRIDOR_ABOVE_FLOOR,
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
