import {Vector2} from "@proc-geo/core";

// test-helpers.ts
export {
    interiorNodes, boundingBox, initContext,
    stepWithCapture, collectCollisionEvents,
} from './test-helpers';
export type { StepSnapshot, LabelledCollisionEvent } from './test-helpers';

// test-constants.ts
export {
    TRIANGLE, SQUARE, RECTANGLE, PENTAGON_HOUSE, SYMMETRICAL_OCTAGON,
    DEFAULT_PENTAGON, AWKWARD_HEXAGON, AWKWARD_HEPTAGON, IMPOSSIBLE_OCTAGON, BROKEN_POLYGON, CRAZY_POLYGON,
    getAcceptedExteriorEdges,
} from './test-constants';

// In CLEAN_TEST_POLYGONS since 2026-08-28. It spent the arc in KNOWN_DEFECT_POLYGONS because its
// strips overlapped by a tenth of its area while the solve reported `complete: true`; the corridor
// midline of its bar now exists and it tiles exactly. See the fixture header, and
// collinear-dumbbell.test.ts, which is now a specification rather than a tripwire.
export {COLLINEAR_DUMBBELL} from './test-constants';
export type { DiagnosticStepResult } from './test-constants';
import {
    TRIANGLE, SQUARE, RECTANGLE, PENTAGON_HOUSE, SYMMETRICAL_OCTAGON,
    DEFAULT_PENTAGON, AWKWARD_HEXAGON, AWKWARD_HEPTAGON, IMPOSSIBLE_OCTAGON, BROKEN_POLYGON,
    CRAZY_POLYGON, COLLINEAR_DUMBBELL
} from './test-constants';

// duck-octagon.ts
export {
    DUCK_OCTAGON_FAILS, DUCK_OCTAGON_PASSES, MOORHEN_FAILS, MOORHEN_PASSES
} from './duck-octagon';
import {
    DUCK_OCTAGON_FAILS,
    DUCK_OCTAGON_PASSES,
    MOORHEN_FAILS,
    MOORHEN_PASSES
} from './duck-octagon';

// double-reflex-spaceship.ts
export {
    FAILURE_CASE_DOUBLE_SPACESHIP_V2,
    PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP,
    SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP
} from './double-reflex-spaceship';
import {
    FAILURE_CASE_DOUBLE_SPACESHIP_V2,
    PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP,
    SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP
} from './double-reflex-spaceship';

// isthmus-failure.ts
export {
    CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS,
    DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_7,
    DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_4,
} from './isthmus-failure';
import {
    CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS,
    DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_7,
    DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_4,
} from './isthmus-failure';

// long-octagon.ts
export {
    LONG_OCTAGON, FAILING_LONG_OCTAGON, FAILING_GENTLE_REFLEX_PENTAGON
} from './long-octagon';
import {
    LONG_OCTAGON,
    FAILING_LONG_OCTAGON,
    FAILING_GENTLE_REFLEX_PENTAGON
} from './long-octagon';

// mid-case-failure.ts
export {
    SUCCESS_OUTER, FAILURE_START_CASE, FAILURE_END_CASE, SUCCESS_INNER
} from './mid-case-failure';
import {
    SUCCESS_OUTER,
    FAILURE_START_CASE,
    FAILURE_END_CASE,
    SUCCESS_INNER
} from './mid-case-failure';

// missing-edge-at-node-11.ts
export {MissingEdgeAtNode11} from './missing-edge-at-node-11';
import {MissingEdgeAtNode11} from './missing-edge-at-node-11';

// more-edge-cases.ts
export {CAUSES_MISSING_SECONDARY_EDGE, WACKY_OCTAGON} from './more-edge-cases';
import {CAUSES_MISSING_SECONDARY_EDGE, WACKY_OCTAGON} from './more-edge-cases';

// comparative-heptagons.ts
export {
    NOT_SOLVABLE, WRONG_COLLISION_AT_NODE_10
} from './comparative-heptagons';
import {
    NOT_SOLVABLE,
    WRONG_COLLISION_AT_NODE_10
} from './comparative-heptagons';

// premature-split-event.ts
export {
    INPUT_OCTAGON as PREMATURE_SPLIT_OCTAGON
} from './premature-split-event';
import {
    INPUT_OCTAGON as PREMATURE_SPLIT_OCTAGON
} from './premature-split-event';
export {LONG_SIDE_ACUTE_VERTEX} from "./long-single-side-highly-acute-vertex";
import {LONG_SIDE_ACUTE_VERTEX} from "./long-single-side-highly-acute-vertex";

// collision-e38-and-e30-gets-dropped-incorrectly.ts
export {
    INCORRECT_ORDERING_E38_E30_COLLISION
} from './collision-e38-and-e30-gets-dropped-incorrectly';
import {
    INCORRECT_ORDERING_E38_E30_COLLISION
} from './collision-e38-and-e30-gets-dropped-incorrectly';

// crab-test-case.ts
export {CRAB_TEST_CASE, CRAB_TEST_CASE_2, CRAB_TEST_CASE_3} from './crab-test-case';

// loses-when-reflex-is-first-collision.ts
export {LOSES_WHEN_REFLEX_IS_FIRST_COLLISION, PASSES_WITH_SOFTER_REFLEX, PASSES_WHEN_REFLEX_HITS_ADJACENT_BISECTOR} from './loses-when-reflex-is-first-collision';

// simple-reflex-misses-first-event.ts
export {SIMPLE_REFLEX} from './simple-reflex-misses-first-event';

// why-no-collision-e15-e18.ts
export {WHY_NO_COLLISION} from './why-no-collision-e15-e18';

// premature-bisector-split.ts
export {PREMATURE_BISECTOR_SPLIT_FAILS, PREMATURE_BISECTOR_SPLIT_PASSES} from './premature-bisector-split';
import {PREMATURE_BISECTOR_SPLIT_FAILS, PREMATURE_BISECTOR_SPLIT_PASSES} from './premature-bisector-split';

// short-edge-promontory.ts
// PROMOTED into CLEAN_TEST_POLYGONS on 2026-08-27 under journal decision 64. Both of its recorded
// blockers are dead: the translation-to-1e9 envelope (re-measured dead, F14) and the bit-exact
// normalisation round trip, which decision 64 ruled is corpus-scoped bookkeeping to be re-measured
// rather than a designed invariant. Its centring drift is sub-ulp of the polygon's extent.
export {SHORT_EDGE_PROMONTORY} from './short-edge-promontory';
import {SHORT_EDGE_PROMONTORY} from './short-edge-promontory';

// near-regular-polygons.ts
// Five of the seven are in CLEAN_TEST_POLYGONS: `NEAR_REGULAR_CIRCLE_16` and `NEAR_REGULAR_CIRCLE_32`
// joined on 2026-08-27, `NEAR_REGULAR_PEANUT_32` later the same day under journal decision 64, and
// `NEAR_REGULAR_ELLIPSE_16` / `NEAR_REGULAR_ELLIPSE_32` on 2026-08-28 under journal decision 65,
// once simultaneous events were resolved in a canonical order and their node ids stopped depending
// on scale. The other two are in KNOWN_DEFECT_POLYGONS on one measured, pinned failure each —
// Circle 48 at translation 1e10 and Rosette5 40 at 1e11, in large-coordinate-known-failures.test.ts.
// Both are clean at their native placement, which is why their defect signatures below are zero:
// the translation envelope is the only sweep that separates them from the clean roster.
export {
    NEAR_REGULAR_CIRCLE_16,
    NEAR_REGULAR_CIRCLE_32,
    NEAR_REGULAR_CIRCLE_48,
    NEAR_REGULAR_ELLIPSE_16,
    NEAR_REGULAR_ELLIPSE_32,
    NEAR_REGULAR_PEANUT_32,
    NEAR_REGULAR_ROSETTE5_40,
} from './near-regular-polygons';
import {
    NEAR_REGULAR_CIRCLE_16,
    NEAR_REGULAR_CIRCLE_32,
    NEAR_REGULAR_CIRCLE_48,
    NEAR_REGULAR_ELLIPSE_16,
    NEAR_REGULAR_ELLIPSE_32,
    NEAR_REGULAR_PEANUT_32,
    NEAR_REGULAR_ROSETTE5_40,
} from './near-regular-polygons';

// slightly-deformed-peanut.ts
// Added and promoted into CLEAN_TEST_POLYGONS on 2026-08-28 under journal decision 69. Both were
// silent wrong answers when they arrived — `complete: true`, empty diagnostics, and a waist bisector
// outside the polygon — and both solve after the split-at-the-vertex correction in
// `generateSplitEventFromTheEdgeItself`. See the fixture file for the deformation and the mechanism.
export {SLIGHTLY_DEFORMED_PEANUT_1, SLIGHTLY_DEFORMED_PEANUT_2} from './slightly-deformed-peanut';
import {SLIGHTLY_DEFORMED_PEANUT_1, SLIGHTLY_DEFORMED_PEANUT_2} from './slightly-deformed-peanut';

// rectilinear-shapes.ts
export {CROSS} from './rectilinear-shapes';
import {CROSS} from './rectilinear-shapes';

export {T_SHAPE} from './rectilinear-shapes';
import {T_SHAPE} from './rectilinear-shapes';

export {GOLF_CART} from './rectilinear-shapes';
import {GOLF_CART} from './rectilinear-shapes';

export {ASYMMETRIC_DUMBBELL, THREE_GLOBE_CHAIN} from './rectilinear-shapes';
import {ASYMMETRIC_DUMBBELL, THREE_GLOBE_CHAIN} from './rectilinear-shapes';

// invisible-vertex-rectangle.ts
// In CLEAN_TEST_POLYGONS: it solves clean, and its property is not a defect but a boundary-stage
// removal — one vertex sits exactly on its own edge, so the solve runs at 15 exterior nodes for 16
// input vertices. Added 2026-08-28 under journal decision 75 as the reconstruction of the shape a
// dashboard inspection read as a corrupted solve; see the fixture file and
// `invisible-vertex-renumbering.test.ts`.
export {INVISIBLE_VERTEX_RECTANGLE, INVISIBLE_VERTEX_INDEX} from './invisible-vertex-rectangle';
import {INVISIBLE_VERTEX_RECTANGLE} from './invisible-vertex-rectangle';

// near-floor-jitter.ts
// Three of the four are in KNOWN_DEFECT_POLYGONS below: each defeats the recursive driver on the
// census grid. They are the live near-floor off-edge jitter defect of journal decision 67; the
// mechanism and the magnitude sweep are in along-edge-jitter-known-failures.test.ts, and the fixture
// file header carries the generator and why the failing band sits just above the noise floor.
//
// `OFF_EDGE_JITTER_L_SEED_15838` was CURED ON THE CENSUS GRID on 2026-08-28 under journal decision
// 77 — 5 failed regions to 0 — and stays here on the canonical-area drift bound instead. See its
// entry in the roster below for the measurement and for the ruling that promotion waits on.
export {
    OFF_EDGE_JITTER_L_SEED_15838,
    OFF_EDGE_JITTER_L_SEED_55433,
    OFF_EDGE_JITTER_L_SEED_55433_K4,
    OFF_EDGE_JITTER_PLUS_SEED_7919,
} from './near-floor-jitter';
import {
    OFF_EDGE_JITTER_L_SEED_15838,
    OFF_EDGE_JITTER_L_SEED_55433,
    OFF_EDGE_JITTER_L_SEED_55433_K4,
    OFF_EDGE_JITTER_PLUS_SEED_7919,
} from './near-floor-jitter';

// weighted-fixtures.ts
// §4 of the weighted-offsets decision spec. DELIBERATELY NOT ENROLLED in CLEAN_TEST_POLYGONS or
// FULL_CORPUS (W-spec W50): those rosters' sweeps assume unit weights and their count of 59 is the
// full-graph digest's, and a weight is an option on the solve rather than a property of a ring — the
// same ring solves differently under different weights. Two of these entries are inputs the solver
// REFUSES; see the file header.
export {
    WEIGHTED_TEST_POLYGONS,
    WEIGHTED_RECTANGLE_FAST_FLOOR,
    WEIGHTED_CORRIDOR_FAST_CEILING,
    WEIGHTED_FAST_SHELF_L,
    WEIGHTED_NEAR_STRAIGHT_WEIGHT_CHANGE,
    NEAR_STRAIGHT_WEIGHT_CHANGE_TURN_SINE,
    NEAR_STRAIGHT_WEIGHT_CHANGE_SPEED,
    WEIGHTED_SUB_FLOOR_WEIGHT_CHANGE,
    SUB_FLOOR_WEIGHT_CHANGE_INDEX,
    WEIGHTED_SQUARE_NEAR_MAX_RATIO,
    WEIGHTED_PENTAGON_HOUSE,
    WEIGHTED_STEP,
    WEIGHTED_INVISIBLE_VERTEX_REFUSED,
    WEIGHTED_INVISIBLE_VERTEX_SOLVES,
    WEIGHTED_DORMER_SQUARE_REFUSED,
    WEIGHTED_SQUARE_ALTERNATING,
} from './weighted-fixtures';
export type {
    WeightedTestPolygon,
    WeightedNodeExpectation,
    WeightedRefusalExpectation,
} from './weighted-fixtures';

export interface NamedTestPolygon {
    name: string;
    vertices: Vector2[];
}

/*
 * ============================================================================
 *  TWO ROSTERS, ONE CORPUS. Journal decisions 72 and 74, 2026-08-28.
 * ============================================================================
 *
 * EXCLUSION IS RETIRED AS A MECHANISM. Every polygon fixture that carries a defect is enrolled here
 * rather than held out of the lists, because a held-out fixture — however visibly its defect is
 * pinned elsewhere — still shapes the corpus around the defect and is invisible to the dashboard,
 * which is where the user inspects it.
 *
 * THERE IS NO `ALL_TEST_POLYGONS` (decision 74). The name is retired rather than re-pointed: a
 * roster called ALL that leaves the defect fixtures out launders the word, and a rename that left
 * the old export standing would turn every stale reference into a silent semantic flip instead of a
 * compile error. {@link CLEAN_TEST_POLYGONS} is that roster under an honest name, and its meaning is
 * unchanged: every entry solves, tiles and subdivides, and the dozens of sweeps written against it go
 * on asserting exactly that. {@link KNOWN_DEFECT_POLYGONS} is the same shape of list for fixtures
 * with a measured defect, and {@link FULL_CORPUS} is the two concatenated.
 *
 * A DEFECT FIXTURE IS NOT "THE ONES THAT FAIL". Each carries a measured signature — pinned in
 * `recursive-subdivision.test.ts` for the census grid and in its own known-failures suite for
 * everything else — and a sweep over the full corpus asserts that signature EXACTLY. A fixture doing
 * better than its pin fails the suite as loudly as one doing worse, and the cure is promotion into
 * the clean roster rather than an adjusted number.
 *
 * WHICH INVARIANTS ARE UNIVERSAL IS MEASURED, NOT ASSUMED. Containment, the bisector rate rule and
 * signalled-not-silent hold over the defect roster too and are swept over the full corpus; wavefront
 * causality, clearance and edge direction do NOT, and their violations are part of the signatures.
 */
export const CLEAN_TEST_POLYGONS: NamedTestPolygon[] = [
    // Basic shapes (test-constants.ts)
    {name: 'Triangle', vertices: TRIANGLE},
    {name: 'Square', vertices: SQUARE},
    {name: 'Rectangle', vertices: RECTANGLE},
    {name: 'Pentagon House', vertices: PENTAGON_HOUSE},
    {name: 'Default Pentagon', vertices: DEFAULT_PENTAGON},
    // PROMOTED 2026-08-28 under journal decision 73. The "DOES NOT TERMINATE IN FUZZ TEST" note it
    // carried for as long as it was commented out is DEAD: re-measured, it solves with empty
    // diagnostics, escapes nothing, holds every wavefront invariant and records no failed region
    // anywhere on the census grid. It was found by the decision-72 sweep for fixtures in neither
    // roster — a stale exclusion rather than a defect.
    {name: 'Symmetrical Octagon', vertices: SYMMETRICAL_OCTAGON},
    {name: 'Awkward Hexagon', vertices: AWKWARD_HEXAGON},
    {name: 'Awkward Heptagon', vertices: AWKWARD_HEPTAGON},
    {name: 'Impossible Octagon', vertices: IMPOSSIBLE_OCTAGON},
    {name: 'Broken Polygon', vertices: BROKEN_POLYGON},
    {name: 'Crazy Polygon', vertices: CRAZY_POLYGON},


    // Duck octagon variants (duck-octagon.ts)
    {name: 'Duck Octagon (fails)', vertices: DUCK_OCTAGON_FAILS},
    {name: 'Duck Octagon (passes)', vertices: DUCK_OCTAGON_PASSES},
    {name: 'Moorhen (fails)', vertices: MOORHEN_FAILS},
    {name: 'Moorhen (passes)', vertices: MOORHEN_PASSES},

    // Double reflex spaceship variants (double-reflex-spaceship.ts)
    {name: 'V2 Double Reflex Spaceship (fails)', vertices: FAILURE_CASE_DOUBLE_SPACESHIP_V2},
    {
        name: 'Previously failed Double Reflex Spaceship (passes)',
        vertices: PREVIOUSLY_FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP
    },
    {name: 'Double Reflex Spaceship (passes)', vertices: SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP},

    // Isthmus variants (isthmus-failure.ts)
    {name: 'Convergence Towards Isthmus (succeeds)', vertices: CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS},
    {name: 'Divergence Towards Isthmus (fails node 7)', vertices: DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_7},
    {name: 'Divergence Towards Isthmus (fails node 4)', vertices: DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_4},

    // Long octagon variants (long-octagon.ts)
    {name: 'Long Octagon', vertices: LONG_OCTAGON},
    {name: 'Failing Long Octagon', vertices: FAILING_LONG_OCTAGON},
    {name: 'Failing Gentle Reflex Pentagon', vertices: FAILING_GENTLE_REFLEX_PENTAGON},

    // Mid-case failure brackets (mid-case-failure.ts)
    {name: 'Mid-case Success Outer', vertices: SUCCESS_OUTER},
    {name: 'Mid-case Failure Start', vertices: FAILURE_START_CASE},
    {name: 'Mid-case Failure End', vertices: FAILURE_END_CASE},
    {name: 'Mid-case Success Inner', vertices: SUCCESS_INNER},

    // Standalone edge cases
    {name: 'Missing Edge at Node 11', vertices: MissingEdgeAtNode11},
    {name: 'Causes Missing Secondary Edge', vertices: CAUSES_MISSING_SECONDARY_EDGE},
    {name: 'Wacky Octagon', vertices: WACKY_OCTAGON},
    {name: 'Not Solvable Heptagon', vertices: NOT_SOLVABLE},
    {name: 'Wrong Collision at Node 10', vertices: WRONG_COLLISION_AT_NODE_10},
    {name: 'Premature Split Octagon', vertices: PREMATURE_SPLIT_OCTAGON},
    {name: 'Long Unbroken Side Then Extreme Acute Angle', vertices: LONG_SIDE_ACUTE_VERTEX},
    {name: 'Incorrect Ordering e38-e30 Collision', vertices: INCORRECT_ORDERING_E38_E30_COLLISION},

    // Premature-bisector split (premature-bisector-split.ts)
    {name: 'Premature Bisector Split (fails)', vertices: PREMATURE_BISECTOR_SPLIT_FAILS},
    {name: 'Premature Bisector Split (passes)', vertices: PREMATURE_BISECTOR_SPLIT_PASSES},

    // Short-edge promontory (short-edge-promontory.ts). Promoted 2026-08-27, decision 64.
    {name: 'Short Edge Promontory', vertices: SHORT_EDGE_PROMONTORY},

    // Rectilinear shapes (rectilinear-shapes.ts)
    {name: 'Cross', vertices: CROSS},
    {name: 'T-Shape', vertices: T_SHAPE},
    {name: 'Golf Cart', vertices: GOLF_CART},

    // The corridor-midline class (rectilinear-shapes.ts and test-constants.ts). Added and promoted
    // 2026-08-28, journal decision 90, with the fix that stopped a corridor's midline being born
    // pointing out of the corridor. All three were silent wrong answers before it — `complete: true`,
    // empty diagnostics, strips overlapping strips by 7 to 13 per cent of their own area.
    {name: 'Collinear Dumbbell', vertices: COLLINEAR_DUMBBELL},
    {name: 'Asymmetric Dumbbell', vertices: ASYMMETRIC_DUMBBELL},
    {name: 'Three Globe Chain', vertices: THREE_GLOBE_CHAIN},

    // Near-regular control shapes (near-regular-polygons.ts). The other two are in
    // KNOWN_DEFECT_POLYGONS, each on a pinned failure; see the note above this list's imports.
    {name: 'Near Regular Circle 16', vertices: NEAR_REGULAR_CIRCLE_16},
    {name: 'Near Regular Circle 32', vertices: NEAR_REGULAR_CIRCLE_32},
    {name: 'Near Regular Peanut 32', vertices: NEAR_REGULAR_PEANUT_32},
    // Promoted 2026-08-28, decision 65.
    {name: 'Near Regular Ellipse 16', vertices: NEAR_REGULAR_ELLIPSE_16},
    {name: 'Near Regular Ellipse 32', vertices: NEAR_REGULAR_ELLIPSE_32},

    // Boundary-stage renumbering (invisible-vertex-rectangle.ts). Added 2026-08-28, decision 75.
    {name: 'Invisible Vertex Rectangle', vertices: INVISIBLE_VERTEX_RECTANGLE},


    // Deformed peanut waists (slightly-deformed-peanut.ts). Added and promoted 2026-08-28,
    // decision 69, with the solver fix that stopped their waist bisectors escaping the polygon.
    {name: 'Slightly Deformed Peanut 1', vertices: SLIGHTLY_DEFORMED_PEANUT_1},
    {name: 'Slightly Deformed Peanut 2', vertices: SLIGHTLY_DEFORMED_PEANUT_2},
];

/**
 * Fixtures with a measured, pinned defect. Same shape as {@link CLEAN_TEST_POLYGONS}; different bar.
 *
 * ENROLLED, NOT EXCLUDED (journal decision 72). Every entry is swept alongside the clean roster and
 * asserted against its own recorded signature rather than against zero. The signatures live with the
 * suites that measure them:
 *
 *  - the recursive-subdivision census grid, per fixture, in `recursive-subdivision.test.ts`;
 *  - the near-floor jitter class — root solves, diagnostics, causality violations — in
 *    `along-edge-jitter-known-failures.test.ts`;
 *  - the strip overlap in `collinear-dumbbell.test.ts`;
 *  - the large-coordinate translation cells in `large-coordinate-known-failures.test.ts`.
 *
 * A FIXTURE LEAVES THIS LIST BY BEING FIXED. When its signature goes to zero the attributed sweeps
 * fail on the cure and say so; the answer is to move it into {@link CLEAN_TEST_POLYGONS} and delete its
 * pins, never to soften a number.
 */
export const KNOWN_DEFECT_POLYGONS: NamedTestPolygon[] = [
    // Near-floor off-edge jitter (near-floor-jitter.ts). What is left of journal decision 67's live
    // solver defect after decision 77's face-walk correction: two seeds still hand the recursive
    // driver regions it cannot subdivide (counts fell 10 to 3 and 14 to 11), and the plus seed hands
    // it fifteen sub-visible slivers now that the parallel-vertex closure has cured its root.
    //
    // SEED 15838 IS CURED ON THIS GRID — 5 failed regions to 0 — AND STILL DOES NOT PROMOTE, which
    // is a measurement rather than a hedge. The clean roster carries a second bar it fails: the
    // recursion's canonical-area drift, pinned at 1e-14, and canonicalisation legitimately removes
    // three near-floor samples from this fixture, moving its area by 5.17e-7. Every other
    // floor-touched fixture in the corpus loses only EXACTLY collinear vertices, which cost no area
    // at all. Promoting it needs a ruling on whether that bound admits a near-floor exemption — the
    // root-floor pass-down question — so its census signature is pinned at zero here, alongside the
    // dumbbell's and the two large-coordinate fixtures', all of which are enrolled on defects this
    // grid cannot see.
    {name: 'Off-edge Jitter Reflex L (seed 15838)', vertices: OFF_EDGE_JITTER_L_SEED_15838},
    {name: 'Off-edge Jitter Reflex L (seed 55433)', vertices: OFF_EDGE_JITTER_L_SEED_55433},
    {name: 'Off-edge Jitter Plus (seed 7919)', vertices: OFF_EDGE_JITTER_PLUS_SEED_7919},
    {name: 'Off-edge Jitter Reflex L (seed 55433, k=4)', vertices: OFF_EDGE_JITTER_L_SEED_55433_K4},

    // `COLLINEAR_DUMBBELL` LEFT THIS ROSTER 2026-08-28 (journal decision 90), by being fixed rather
    // than by having its number softened — the route this roster's header names. Its bar's midline
    // was born pointing out of the bar, so the shaft carried no skeleton at all and the two globes'
    // faces overlapped; the tiling error went from 0.1 to zero. It is now in CLEAN_TEST_POLYGONS
    // alongside two variants of its class added with the fix.

    // Large-coordinate envelope (near-regular-polygons.ts). Clean where they sit; each fails a
    // scatter of translations far from the origin.
    {name: 'Near Regular Circle 48', vertices: NEAR_REGULAR_CIRCLE_48},
    {name: 'Near Regular Rosette5 40', vertices: NEAR_REGULAR_ROSETTE5_40},
];

/**
 * Every polygon fixture the sweeps run, clean roster first.
 *
 * What a sweep over this list asserts differs per entry — clean fixtures assert clean, defect
 * fixtures assert their signature — so a suite reaching for it must say which bar it is applying.
 * The dashboard's fixture loaders list it whole, so every fixture in the repo can be inspected.
 */
export const FULL_CORPUS: NamedTestPolygon[] = [...CLEAN_TEST_POLYGONS, ...KNOWN_DEFECT_POLYGONS];

/** True where `name` belongs to {@link KNOWN_DEFECT_POLYGONS}, for labelling a corpus-wide list. */
export function isKnownDefectPolygon(name: string): boolean {
    return KNOWN_DEFECT_POLYGONS.some(polygon => polygon.name === name);
}
