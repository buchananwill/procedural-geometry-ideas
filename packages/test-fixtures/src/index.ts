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
];
