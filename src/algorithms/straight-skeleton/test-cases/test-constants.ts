import type {StraightSkeletonSolverContext, Vector2} from '@/algorithms/straight-skeleton/types';
import * as var_module_global_error from "VAR_MODULE_GLOBAL_ERROR";

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
