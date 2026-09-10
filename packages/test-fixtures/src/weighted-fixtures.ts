import {Vector2} from "@proc-geo/core";
import {INVISIBLE_VERTEX_RECTANGLE, INVISIBLE_VERTEX_INDEX} from "./invisible-vertex-rectangle";
import {PENTAGON_HOUSE} from "./test-constants";

/*
 * ============================================================================
 *  THE WEIGHTED ROSTER — §4 of the weighted-offsets decision spec (W-spec W50)
 * ============================================================================
 *
 * A weight is a per-exterior-edge, strictly positive SPEED: `weights[i]` is the speed of the edge
 * from vertex `i` to vertex `(i + 1) % n`, and the wavefront of that edge stands at perpendicular
 * distance `w_i · t` from its supporting line at time `t`. Everything the solver calls an offset is
 * that clock.
 *
 * NOT ENROLLED IN `CLEAN_TEST_POLYGONS` OR `FULL_CORPUS`, and W-spec W50 says why: those rosters'
 * sweeps assume unit weights, and their count of 59 is the full-graph digest's. A weight is an
 * OPTION on the solve, not a property of a polygon — the same ring solves differently under
 * different weights and identically to the unweighted corpus under all ones — so a weighted fixture
 * is a `(ring, weights)` PAIR and cannot be a member of a list of rings.
 *
 * HOW THE WEIGHTS ARE CARRIED, and this is the delegate's interpretation rather than the spec's
 * word: each entry is one object holding `vertices` and `weights` side by side, plus an `expected`
 * block carrying whichever analytic quantities §4 states for that fixture. The alternative — a
 * `NamedTestPolygon` plus a separate parallel weight table keyed by name — was rejected because it
 * lets the two drift apart silently, which is exactly the failure a fixture roster exists to
 * prevent. `expected` is optional per field: §4 states node positions and times for some fixtures,
 * corner velocities for others, and a refusal for two of them.
 *
 * Coordinates are CLOCKWISE in a y-up frame (up, right, down is clockwise — the `SQUARE`
 * convention), and every weight array is already at minimum `1`, so the solver's normalisation
 * (W-spec W4) divides by exactly `1.0` and changes nothing.
 */

/** One interior node the analytic answer places, with the wavefront time it is reached at. */
export interface WeightedNodeExpectation {
    position: Vector2;
    /** The wavefront clock reading, `distance / weight`, at which every incident face reaches it. */
    time: number;
}

/** The vertex a refusal must name, and the two weights that meet there. */
export interface WeightedRefusalExpectation {
    vertexIndex: number;
    incomingWeight: number;
    outgoingWeight: number;
}

export interface WeightedTestPolygon {
    name: string;
    vertices: Vector2[];
    /** One entry per vertex: the speed of the edge LEAVING that vertex. Minimum is exactly 1. */
    weights: number[];
    expected?: {
        /** The interior nodes §4 derives analytically, in no particular order. */
        interiorNodes?: WeightedNodeExpectation[];
        /** The kernel velocity at each input vertex, `v · n₁ = w₁`, `v · n₂ = w₂`. */
        cornerVelocities?: Vector2[];
        /** Set where §4 expects `solveSkeleton` to THROW at the door rather than solve. */
        refusal?: WeightedRefusalExpectation;
    };
}

/**
 * §4.1 — A rectangle with one edge at weight 2.
 *
 * Edge 3 is the bottom wall `y = 0`. Its wavefront is `y = 2t` while the top's is `y = 2 − t`, so
 * they meet at `t = 2/3` on the line `y = 4/3` — a third of the way down instead of halfway. The
 * side walls are unweighted, so the ridge runs from `x = t` to `x = 4 − t`.
 *
 * At unit weights the same ring gives `(1, 1)` and `(3, 1)` at time `1`, which is what makes this
 * the simplest fixture that separates a weighted solve from an unweighted one.
 */
export const WEIGHTED_RECTANGLE_FAST_FLOOR: WeightedTestPolygon = {
    name: 'Weighted Rectangle (fast floor)',
    vertices: [{x: 0, y: 0}, {x: 0, y: 2}, {x: 4, y: 2}, {x: 4, y: 0}],
    weights: [1, 1, 1, 2],
    expected: {
        interiorNodes: [
            {position: {x: 2 / 3, y: 4 / 3}, time: 2 / 3},
            {position: {x: 10 / 3, y: 4 / 3}, time: 2 / 3},
        ],
        cornerVelocities: [{x: 1, y: 2}, {x: 1, y: -1}, {x: -1, y: -1}, {x: -1, y: 2}],
    },
};

/**
 * §4.2 — A corridor with unequal walls, which is W-spec W14 and W39(ii)'s conviction.
 *
 * Edge 1 is the top wall at speed 3 against a bottom wall at 1. The corridor closes all at once at
 * `t* = width / (w₁ + w₂) = 1/4`, on the line at `w_bottom · t* = 1/4` from the SLOW wall — not on
 * the midline. At unit weights the ridge is at `y = 1/2` with nodes `(1/2, 1/2)` and `(19/2, 1/2)`.
 */
export const WEIGHTED_CORRIDOR_FAST_CEILING: WeightedTestPolygon = {
    name: 'Weighted Corridor (fast ceiling)',
    vertices: [{x: 0, y: 0}, {x: 0, y: 1}, {x: 10, y: 1}, {x: 10, y: 0}],
    weights: [1, 3, 1, 1],
    expected: {
        interiorNodes: [
            {position: {x: 1 / 4, y: 1 / 4}, time: 1 / 4},
            {position: {x: 39 / 4, y: 1 / 4}, time: 1 / 4},
        ],
        cornerVelocities: [{x: 1, y: 1}, {x: 1, y: -3}, {x: -1, y: -3}, {x: -1, y: 1}],
    },
};

/**
 * §4.3 — Fast beside slow at a REFLEX vertex: arc decision 112(f)'s conditioning hazard, fixtured.
 *
 * An L whose inner shelf (edge 3, `(2,2) → (6,2)`) runs at speed 4 against a slow riser
 * (edge 2, `(2,4) → (2,2)`). The reflex vertex `(2,2)` has `n_riser = (−1, 0)` and
 * `n_shelf = (0, −1)`, so `v = (−1, −4)` and speed `sqrt(17)`: the fast shelf drags the vertex down
 * the riser at four times the riser's own rate, and the riser's wavefront segment LENGTHENS at
 * rate 4.
 *
 * The first event is at `t = 2/5`: the shelf (`y = 2 − 4t`) and the floor (edge 5, `y = t`) are
 * anti-facing parallel walls of width 2, so the whole lower block closes at once on the equi-time
 * line `y = 2/5` — the reflex trace arriving at its left end and both right-hand corner traces at
 * its right end.
 */
export const WEIGHTED_FAST_SHELF_L: WeightedTestPolygon = {
    name: 'Weighted L (fast shelf beside slow riser)',
    vertices: [
        {x: 0, y: 0}, {x: 0, y: 4}, {x: 2, y: 4}, {x: 2, y: 2}, {x: 6, y: 2}, {x: 6, y: 0},
    ],
    weights: [1, 1, 1, 4, 1, 1],
    expected: {
        interiorNodes: [
            {position: {x: 8 / 5, y: 2 / 5}, time: 2 / 5},
            {position: {x: 28 / 5, y: 2 / 5}, time: 2 / 5},
        ],
    },
};

/**
 * §4.3, second variant — a weight change at a turn whose sine is exactly `1e-3`, which is where
 * W-spec W49's guard is MEASURED rather than asserted.
 *
 * A ten-by-ten square whose bottom wall is broken at its midpoint by a vertex standing `2.5e-3`
 * inside it, so the two halves of that wall meet at a turn of sine `0.4 · 2.5e-3 = 1e-3`. The two
 * halves carry weights 4 and 1.
 *
 * `|v| = |w₁ − w₂| / sin(turn)` — the whole of W-spec W49's argument — puts the kernel velocity at
 * that vertex at `3 / 1e-3 = 3e3` on a shape of extent 10. The turn sine is seven times
 * `MIN_WEIGHT_TURN_SINE` (`1.41e-4`), so the door ADMITS this input: it is the approach to the
 * guard's bar, not a violation of it, and the number it records is why the bar is where it is.
 */
const NEAR_STRAIGHT_TURN_SINE = 1e-3;
/** The offset that makes the turn sine at the broken wall's midpoint exactly `NEAR_STRAIGHT_TURN_SINE`. */
const NEAR_STRAIGHT_DEVIATION = NEAR_STRAIGHT_TURN_SINE * 2.5;
export const WEIGHTED_NEAR_STRAIGHT_WEIGHT_CHANGE: WeightedTestPolygon = {
    name: 'Weighted Square (weight change at a 1e-3 turn)',
    vertices: [
        {x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 0},
        {x: 5, y: NEAR_STRAIGHT_DEVIATION},
    ],
    weights: [1, 1, 1, 4, 1],
};

/**
 * W-spec W44 / arc journal decision 120 — a weight change at a vertex UNDER THE NOISE FLOOR whose
 * turn is nonetheless VISIBLE, which is the only configuration the pin can be convicted on.
 *
 * The two quantities the boundary stage and the door read are different: canonicalisation removes on
 * CHORD DEVIATION, and the door refuses on TURN SINE. They come apart when the two edges either side
 * of the vertex are SHORT — the turn is `≈ 2 · deviation / edge length`, so a short pair of edges
 * makes a visible corner out of an invisible deviation. That is decision 124(c)'s case stated as
 * geometry: "two long edges meeting at a small but visible turn" read the other way round.
 *
 * A ten-by-ten square with a small triangular bump standing `0.05` proud of its bottom wall, whose
 * apex `V` deviates `4e-6` from the chord between the bump's two shoulders. In the solver's unit
 * space that deviation is `5e-7`, half the `1e-6` noise floor, so at EQUAL weights `V` is removed as
 * invisible. Its turn sine is `2e-4`, above `MIN_WEIGHT_TURN_SINE` (`1.41e-4`), so a weight change
 * there passes the door — and W-spec W44 then PINS it, because a vertex whose incident weights
 * differ is structural whatever its deviation from the chord.
 *
 * The pair of solves is the conviction: unit weights lose `V`, these weights keep it.
 */
export const WEIGHTED_SUB_FLOOR_WEIGHT_CHANGE: WeightedTestPolygon = {
    name: 'Weighted Bump (sub-floor weight change at a visible turn)',
    vertices: [
        {x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 0},
        {x: 5.04, y: 0.05}, {x: 5.00, y: 0.050004}, {x: 4.96, y: 0.05},
    ],
    weights: [1, 1, 1, 1, 1, 2, 2],
};

/** The index of the sub-floor, visible-turn, weight-change vertex the pin must keep. */
export const SUB_FLOOR_WEIGHT_CHANGE_INDEX = 5;

/** The turn sine `WEIGHTED_NEAR_STRAIGHT_WEIGHT_CHANGE` is built to sit at (W-spec W49). */
export const NEAR_STRAIGHT_WEIGHT_CHANGE_TURN_SINE = NEAR_STRAIGHT_TURN_SINE;
/** `|w₁ − w₂| / sin(turn)` at that vertex: the conditioning hazard, as a number. */
export const NEAR_STRAIGHT_WEIGHT_CHANGE_SPEED = 3 / NEAR_STRAIGHT_TURN_SINE;

/**
 * §4.4 — The near-maximum-ratio square, at `R = MAX_WEIGHT_RATIO`.
 *
 * `SQUARE` with its bottom edge at the fastest speed the contract admits. The bottom wavefront
 * `y = R t` meets the top's `y = 2 − t` at `t = 2 / (R + 1)`, so the ridge sits at
 * `y = 2R / (R + 1)` — hard against the top wall — and runs from `x = 2 / (R + 1)` to
 * `x = 2 − 2 / (R + 1)`.
 *
 * Its companion in the test file is the same ring at `R + 1`, which the ratio guard REFUSES.
 */
const NEAR_MAX_RATIO = 100;
export const WEIGHTED_SQUARE_NEAR_MAX_RATIO: WeightedTestPolygon = {
    name: 'Weighted Square (near-maximum ratio)',
    vertices: [{x: 0, y: 0}, {x: 0, y: 2}, {x: 2, y: 2}, {x: 2, y: 0}],
    weights: [1, 1, 1, NEAR_MAX_RATIO],
    expected: {
        interiorNodes: [
            {
                position: {x: 2 / (NEAR_MAX_RATIO + 1), y: 2 * NEAR_MAX_RATIO / (NEAR_MAX_RATIO + 1)},
                time: 2 / (NEAR_MAX_RATIO + 1),
            },
            {
                position: {
                    x: 2 - 2 / (NEAR_MAX_RATIO + 1),
                    y: 2 * NEAR_MAX_RATIO / (NEAR_MAX_RATIO + 1),
                },
                time: 2 / (NEAR_MAX_RATIO + 1),
            },
        ],
    },
};

/**
 * §4.5 — A mirror-symmetric shape with asymmetric weights: the METAMORPHIC pair.
 *
 * `PENTAGON_HOUSE` with its right roof edge (edge 0, apex → `(6,6)`) at speed 2 and its left roof
 * edge (edge 4, `(0,6)` → apex) at 1. The apex node moves toward the SLOW roof and the solve stops
 * being mirror-symmetric — and the falsification is that mirroring the ring AND the weight array
 * through W-spec W45's reversal map yields the mirrored skeleton exactly.
 */
export const WEIGHTED_PENTAGON_HOUSE: WeightedTestPolygon = {
    name: 'Weighted Pentagon House (asymmetric roof)',
    vertices: PENTAGON_HOUSE,
    weights: [2, 1, 1, 1, 1],
};

/**
 * §4.6 — THE STEP, which is W-spec W29 and W32's conviction.
 *
 * A twelve-by-ten block with a four-by-two notch cut out of its lower right. Edge 5 is the low floor
 * `y = 0` at speed 2; edge 3 is the high floor `y = 2` at 1; edge 4 is the riser `x = 8` between
 * them. The reflex `(8,2)` traces `v = (−1, 1)` and the convex `(8,0)` traces `v = (−1, 2)` — at
 * UNIT weights both trace `(−1, 1)` and the riser's wavefront never collapses at all.
 *
 * Under weights it collapses at `t = 2` at `(6, 4)`: an edge-collapse node that does not exist in
 * the unweighted skeleton. The left block is 8 wide so that its own side corridor (`t = 4`) and its
 * floor-meets-top event (`t = 10/3`) both come AFTER the event under test.
 */
export const WEIGHTED_STEP: WeightedTestPolygon = {
    name: 'Weighted Step (fast low floor)',
    vertices: [
        {x: 0, y: 0}, {x: 0, y: 10}, {x: 12, y: 10}, {x: 12, y: 2}, {x: 8, y: 2}, {x: 8, y: 0},
    ],
    weights: [1, 1, 1, 1, 1, 2],
    expected: {
        interiorNodes: [{position: {x: 6, y: 4}, time: 2}],
    },
};

/**
 * §4.7 — A collinear vertex with a weight change ACROSS it: refused at the door.
 *
 * `INVISIBLE_VERTEX_RECTANGLE`'s vertex 5 sits at the exact midpoint of the span from vertex 4 to
 * vertex 6, so its turn is zero. A weight change there is outside the contract (arc decision
 * 124(b)), and the refusal names that vertex — BEFORE canonicalisation, which would otherwise have
 * removed it and hidden the question.
 */
export const WEIGHTED_INVISIBLE_VERTEX_REFUSED: WeightedTestPolygon = {
    name: 'Weighted Invisible Vertex Rectangle (weight change at the invisible vertex)',
    vertices: INVISIBLE_VERTEX_RECTANGLE,
    weights: INVISIBLE_VERTEX_RECTANGLE.map((_unused, index) =>
        index >= INVISIBLE_VERTEX_INDEX ? 2 : 1),
    expected: {
        refusal: {vertexIndex: INVISIBLE_VERTEX_INDEX, incomingWeight: 1, outgoingWeight: 2},
    },
};

/**
 * §4.7, second assertion — the same ring with the weight change at a VISIBLE corner instead.
 *
 * Only edge 3 differs, and both of its endpoints are proper corners of the ring, so nothing is
 * pinned at the invisible vertex and the boundary stage removes it exactly as it does at unit
 * weights: `removedCount` is 1. That is what convicts W-spec W44's pinning — the pin fires on the
 * weight-change vertices and NOWHERE else.
 */
export const WEIGHTED_INVISIBLE_VERTEX_SOLVES: WeightedTestPolygon = {
    name: 'Weighted Invisible Vertex Rectangle (weight change at a corner)',
    vertices: INVISIBLE_VERTEX_RECTANGLE,
    weights: INVISIBLE_VERTEX_RECTANGLE.map((_unused, index) => index === 3 ? 2 : 1),
};

/**
 * §4.8 — THE DORMER SQUARE, and the refusal that makes arc decision 124's model invariant visible.
 *
 * A 2×2 square with an exactly collinear vertex at the centre of each side, placed there to model
 * dormers, and weights alternating so that EVERY midpoint is a weight change at a vertex with zero
 * turn. The user reasoned from this shape: "the varying edge weights manifestly make the collinear
 * vertices no longer trivial".
 *
 * IT IS REFUSED, and that refusal IS the model invariant stated as a test (arc decision 124): the
 * base of the roof lies in a single plane, no roof-perimeter vertex lies outside it, and a dormer is
 * a feature STITCHED INTO the roof the skeleton produces. A solver that accepted this input would
 * have to invent a convention (the struck W-spec W53 riser) to make it well-posed.
 *
 * Vertex 0 is a genuine corner whose two weights also differ, and it passes; vertex 1 is the first
 * collinear weight change, and it is the vertex the error names.
 */
export const WEIGHTED_DORMER_SQUARE_REFUSED: WeightedTestPolygon = {
    name: 'Weighted Dormer Square (collinear weight changes)',
    vertices: [
        {x: 0, y: 0}, {x: 0, y: 1}, {x: 0, y: 2}, {x: 1, y: 2},
        {x: 2, y: 2}, {x: 2, y: 1}, {x: 2, y: 0}, {x: 1, y: 0},
    ],
    weights: [1, 2, 1, 2, 1, 2, 1, 2],
    expected: {
        refusal: {vertexIndex: 1, incomingWeight: 1, outgoingWeight: 2},
    },
};

/**
 * §4.8's companion — the same square with the midpoints REMOVED, which solves.
 *
 * Every weight change now sits at a 90° corner, so the door passes it and the contract's other edge
 * stays honest: the alternating weights that are refused on a subdivided ring are perfectly
 * admissible on the ring the silhouette actually has.
 *
 * THE CORNER VELOCITIES BELOW ARE DERIVED, AND THEY DISAGREE WITH §4.8's LIST. See
 * `weighted-offsets.test.ts` for the derivation and the delegate's report for the finding: on a
 * four-cycle, alternating weights give OPPOSITE edges the same speed, so the configuration is
 * mirror-symmetric about both axes and two-fold rotational — it cannot be four-fold rotational with
 * no mirror symmetry, whatever weights are chosen.
 */
export const WEIGHTED_SQUARE_ALTERNATING: WeightedTestPolygon = {
    name: 'Weighted Square (alternating edge weights)',
    vertices: [{x: 0, y: 0}, {x: 0, y: 2}, {x: 2, y: 2}, {x: 2, y: 0}],
    weights: [1, 2, 1, 2],
    expected: {
        interiorNodes: [
            {position: {x: 0.5, y: 1}, time: 0.5},
            {position: {x: 1.5, y: 1}, time: 0.5},
        ],
        cornerVelocities: [{x: 1, y: 2}, {x: 1, y: -2}, {x: -1, y: -2}, {x: -1, y: 2}],
    },
};

/**
 * Every weighted fixture, in §4's order.
 *
 * NOT part of `CLEAN_TEST_POLYGONS` or `FULL_CORPUS` — see this file's header and W-spec W50. Two of
 * these entries are expected to THROW rather than solve, so a sweep over this list must read
 * `expected.refusal` before it solves anything.
 */
export const WEIGHTED_TEST_POLYGONS: WeightedTestPolygon[] = [
    WEIGHTED_RECTANGLE_FAST_FLOOR,
    WEIGHTED_CORRIDOR_FAST_CEILING,
    WEIGHTED_FAST_SHELF_L,
    WEIGHTED_NEAR_STRAIGHT_WEIGHT_CHANGE,
    WEIGHTED_SUB_FLOOR_WEIGHT_CHANGE,
    WEIGHTED_SQUARE_NEAR_MAX_RATIO,
    WEIGHTED_PENTAGON_HOUSE,
    WEIGHTED_STEP,
    WEIGHTED_INVISIBLE_VERTEX_REFUSED,
    WEIGHTED_INVISIBLE_VERTEX_SOLVES,
    WEIGHTED_DORMER_SQUARE_REFUSED,
    WEIGHTED_SQUARE_ALTERNATING,
];
