import {Vector2} from "@/algorithms/straight-skeleton/types";

// test-constants.ts
export {
    TRIANGLE, SQUARE, RECTANGLE, PENTAGON_HOUSE, SYMMETRICAL_OCTAGON,
    DEFAULT_PENTAGON, AWKWARD_HEXAGON, AWKWARD_HEPTAGON, IMPOSSIBLE_OCTAGON, BROKEN_POLYGON,
} from '@/algorithms/straight-skeleton/test-cases/test-constants';
import {
    TRIANGLE, SQUARE, RECTANGLE, PENTAGON_HOUSE, SYMMETRICAL_OCTAGON,
    DEFAULT_PENTAGON, AWKWARD_HEXAGON, AWKWARD_HEPTAGON, IMPOSSIBLE_OCTAGON, BROKEN_POLYGON,
} from '@/algorithms/straight-skeleton/test-cases/test-constants';

// duck-octagon.ts
export {DUCK_OCTAGON_FAILS, DUCK_OCTAGON_PASSES, MOORHEN_FAILS, MOORHEN_PASSES} from '@/algorithms/straight-skeleton/test-cases/duck-octagon';
import {DUCK_OCTAGON_FAILS, DUCK_OCTAGON_PASSES, MOORHEN_FAILS, MOORHEN_PASSES} from '@/algorithms/straight-skeleton/test-cases/duck-octagon';

// double-reflex-spaceship.ts
export {FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP, SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP} from '@/algorithms/straight-skeleton/test-cases/double-reflex-spaceship';
import {FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP, SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP} from '@/algorithms/straight-skeleton/test-cases/double-reflex-spaceship';

// isthmus-failure.ts
export {
    CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS,
    DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_7,
    DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_4,
} from '@/algorithms/straight-skeleton/test-cases/isthmus-failure';
import {
    CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS,
    DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_7,
    DIVERGENCE_TOWARDS_ISTHMUS_FAILS_NODE_4,
} from '@/algorithms/straight-skeleton/test-cases/isthmus-failure';

// long-octagon.ts
export {LONG_OCTAGON, FAILING_LONG_OCTAGON, FAILING_GENTLE_REFLEX_PENTAGON} from '@/algorithms/straight-skeleton/test-cases/long-octagon';
import {LONG_OCTAGON, FAILING_LONG_OCTAGON, FAILING_GENTLE_REFLEX_PENTAGON} from '@/algorithms/straight-skeleton/test-cases/long-octagon';

// mid-case-failure.ts
export {SUCCESS_OUTER, FAILURE_START_CASE, FAILURE_END_CASE, SUCCESS_INNER} from '@/algorithms/straight-skeleton/test-cases/mid-case-failure';
import {SUCCESS_OUTER, FAILURE_START_CASE, FAILURE_END_CASE, SUCCESS_INNER} from '@/algorithms/straight-skeleton/test-cases/mid-case-failure';

// missing-edge-at-node-11.ts
export {MissingEdgeAtNode11} from '@/algorithms/straight-skeleton/test-cases/missing-edge-at-node-11';
import {MissingEdgeAtNode11} from '@/algorithms/straight-skeleton/test-cases/missing-edge-at-node-11';

// more-edge-cases.ts
export {CAUSES_MISSING_SECONDARY_EDGE, WACKY_OCTAGON} from '@/algorithms/straight-skeleton/test-cases/more-edge-cases';
import {CAUSES_MISSING_SECONDARY_EDGE, WACKY_OCTAGON} from '@/algorithms/straight-skeleton/test-cases/more-edge-cases';

// comparative-heptagons.ts
export {NOT_SOLVABLE, WRONG_COLLISION_AT_NODE_10} from '@/algorithms/straight-skeleton/test-cases/comparative-heptagons';
import {NOT_SOLVABLE, WRONG_COLLISION_AT_NODE_10} from '@/algorithms/straight-skeleton/test-cases/comparative-heptagons';

// premature-split-event.ts
export {INPUT_OCTAGON as PREMATURE_SPLIT_OCTAGON} from '@/algorithms/straight-skeleton/test-cases/premature-split-event';
import {INPUT_OCTAGON as PREMATURE_SPLIT_OCTAGON} from '@/algorithms/straight-skeleton/test-cases/premature-split-event';

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
    {name: 'Symmetrical Octagon', vertices: SYMMETRICAL_OCTAGON},
    {name: 'Awkward Hexagon', vertices: AWKWARD_HEXAGON},
    {name: 'Awkward Heptagon', vertices: AWKWARD_HEPTAGON},
    {name: 'Impossible Octagon', vertices: IMPOSSIBLE_OCTAGON},
    {name: 'Broken Polygon', vertices: BROKEN_POLYGON},

    // Duck octagon variants (duck-octagon.ts)
    {name: 'Duck Octagon (fails)', vertices: DUCK_OCTAGON_FAILS},
    {name: 'Duck Octagon (passes)', vertices: DUCK_OCTAGON_PASSES},
    {name: 'Moorhen (fails)', vertices: MOORHEN_FAILS},
    {name: 'Moorhen (passes)', vertices: MOORHEN_PASSES},

    // Double reflex spaceship variants (double-reflex-spaceship.ts)
    {name: 'Double Reflex Spaceship (fails)', vertices: FAILURE_CASE_DOUBLE_REFLEX_SPACESHIP},
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
];
