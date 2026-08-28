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

// Exported individually and DELIBERATELY left out of ALL_TEST_POLYGONS below: the sweeps over that
// list assert that every entry both solves and tiles, and this one solves — reporting
// `complete: true` with empty diagnostics — while its strips overlap by a tenth of its area. The
// failure is pinned as it stands by collinear-dumbbell.test.ts; see the fixture for why its
// degeneracy is shared supporting lines rather than redundant vertices.
export {COLLINEAR_DUMBBELL} from './test-constants';
export type { DiagnosticStepResult } from './test-constants';
import {
    TRIANGLE, SQUARE, RECTANGLE, PENTAGON_HOUSE, SYMMETRICAL_OCTAGON,
    DEFAULT_PENTAGON, AWKWARD_HEXAGON, AWKWARD_HEPTAGON, IMPOSSIBLE_OCTAGON, BROKEN_POLYGON, CRAZY_POLYGON
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
// PROMOTED into ALL_TEST_POLYGONS on 2026-08-27 under journal decision 64. Both of its recorded
// blockers are dead: the translation-to-1e9 envelope (re-measured dead, F14) and the bit-exact
// normalisation round trip, which decision 64 ruled is corpus-scoped bookkeeping to be re-measured
// rather than a designed invariant. Its centring drift is sub-ulp of the polygon's extent.
export {SHORT_EDGE_PROMONTORY} from './short-edge-promontory';
import {SHORT_EDGE_PROMONTORY} from './short-edge-promontory';

// near-regular-polygons.ts
// Five of the seven are in ALL_TEST_POLYGONS: `NEAR_REGULAR_CIRCLE_16` and `NEAR_REGULAR_CIRCLE_32`
// joined on 2026-08-27, `NEAR_REGULAR_PEANUT_32` later the same day under journal decision 64, and
// `NEAR_REGULAR_ELLIPSE_16` / `NEAR_REGULAR_ELLIPSE_32` on 2026-08-28 under journal decision 65,
// once simultaneous events were resolved in a canonical order and their node ids stopped depending
// on scale. The other two stay out on one measured, pinned failure each — Circle 48 at translation
// 1e10 and Rosette5 40 at 1e11, in large-coordinate-known-failures.test.ts. See the file header.
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
    NEAR_REGULAR_ELLIPSE_16,
    NEAR_REGULAR_ELLIPSE_32,
    NEAR_REGULAR_PEANUT_32,
} from './near-regular-polygons';

// rectilinear-shapes.ts
export {CROSS} from './rectilinear-shapes';
import {CROSS} from './rectilinear-shapes';

export {T_SHAPE} from './rectilinear-shapes';
import {T_SHAPE} from './rectilinear-shapes';

export {GOLF_CART} from './rectilinear-shapes';
import {GOLF_CART} from './rectilinear-shapes';

// near-floor-jitter.ts
// Exported individually and DELIBERATELY left out of ALL_TEST_POLYGONS below: none of the three
// solves completely, and the sweeps over that list assert that every entry does. Journal decision 53
// permits an exclusion only as a visible, pinned characterisation of a defect awaiting its fix, and
// that pin is along-edge-jitter-known-failures.test.ts. Added 2026-08-28 when backlog item 2 was
// re-measured; see the fixture file header for the generator, the magnitude and why the failing band
// sits just above the noise floor.
export {
    OFF_EDGE_JITTER_L_SEED_15838,
    OFF_EDGE_JITTER_L_SEED_55433,
    OFF_EDGE_JITTER_PLUS_SEED_7919,
} from './near-floor-jitter';

export interface NamedTestPolygon {
    name: string;
    vertices: Vector2[];
}

export const ALL_TEST_POLYGONS: NamedTestPolygon[] = [
    // Basic shapes (test-constants.ts)
    {name: 'Triangle', vertices: TRIANGLE},
    {name: 'Square', vertices: SQUARE},
    {name: 'Rectangle', vertices: RECTANGLE},
    {name: 'Pentagon House', vertices: PENTAGON_HOUSE},
    {name: 'Default Pentagon', vertices: DEFAULT_PENTAGON},
    // {name: 'Symmetrical Octagon', vertices: SYMMETRICAL_OCTAGON}, // DOES NOT TERMINATE IN FUZZ TEST,
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

    // Near-regular control shapes (near-regular-polygons.ts). The other two are deliberately
    // absent, each on a pinned failure; see the note above this list's imports.
    {name: 'Near Regular Circle 16', vertices: NEAR_REGULAR_CIRCLE_16},
    {name: 'Near Regular Circle 32', vertices: NEAR_REGULAR_CIRCLE_32},
    {name: 'Near Regular Peanut 32', vertices: NEAR_REGULAR_PEANUT_32},
    // Promoted 2026-08-28, decision 65.
    {name: 'Near Regular Ellipse 16', vertices: NEAR_REGULAR_ELLIPSE_16},
    {name: 'Near Regular Ellipse 32', vertices: NEAR_REGULAR_ELLIPSE_32},
];
