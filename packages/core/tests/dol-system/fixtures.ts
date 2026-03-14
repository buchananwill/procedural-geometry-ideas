import type {SystemConfig} from '../../src/dol-system/types';

// -- Fixture A -- "Unit Square" -----------------------------------------------

export const SQUARE_CONFIG: SystemConfig = {
    alphabet: {X: ['F']},
    productions: {X: ['F', '+', 'X']},
    axiom: ['X'],
    turtle: {stepLength: 1, angleDelta: 90, generationScaling: 1},
    maxIterations: 3,
};

// -- Fixture B -- "Immediate Convergence" -------------------------------------

export const CONVERGE_CONFIG: SystemConfig = {
    alphabet: {},
    productions: {},
    axiom: ['F', '+', 'F', '-', 'F'],
    turtle: {stepLength: 1, angleDelta: 90, generationScaling: 1},
    maxIterations: 5,
};

// -- Fixture C -- "Simple Branch" ---------------------------------------------

export const BRANCH_CONFIG: SystemConfig = {
    alphabet: {
        stem: ['F'],
        tip: ['[', '+', 'F', ']', '[', '-', 'F', ']'],
    },
    productions: {
        stem: ['stem', 'tip'],
    },
    axiom: ['stem'],
    turtle: {stepLength: 1, angleDelta: 90, generationScaling: 1},
    maxIterations: 1,
};

// -- Expected pipeline outputs (used in Phase 4 & 5) -------------------------

export const EXPECTED_SQUARE_PATHS = {
    pathCount: 1,
    segmentCount: 4,
    bounds: {min: {x: 0, y: 0}, max: {x: 1, y: 1}},
};

export const EXPECTED_CONVERGE_PATHS = {
    pathCount: 1,
    segmentCount: 3,
    bounds: {min: {x: 0, y: 0}, max: {x: 2, y: 1}},
};

export const EXPECTED_BRANCH_PATHS = {
    pathCount: 2,
    segmentCounts: [2, 1],
    bounds: {min: {x: 0, y: -1}, max: {x: 1, y: 1}},
};
