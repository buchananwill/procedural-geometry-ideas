import type {Vector2} from '@proc-geo/core';

/** A wall's wavefront speed for a roof pitch, as building-shell gives it (`loopWeights`): 1 / tan(pitch). */
export const speedOfPitch = (pitchDegrees: number) => 1 / Math.tan(pitchDegrees * Math.PI / 180);

/** A single-loop weighted outline: counter-clockwise, as building-shell hands an island; edge i runs from vertex i to i + 1. */
export interface WeightedOutline {
    name: string;
    vertices: Vector2[];
    weights: number[];
}

const outline = (name: string, points: number[][], pitches: number[]): WeightedOutline => ({
    name,
    vertices: points.map(([x, y]) => ({x, y})),
    weights: pitches.map(speedOfPitch),
});

/**
 * THE LEVEL-RIDGE TIE (BSA.F107, BSA.D335), the smallest outline found that reproduces it: a bar [0,1000]×[0,500] with a
 * notch [300,600]×[400,500] cut from its top, at file 7's pitches. Edge pitches: the floor, E, the right block's top, W,
 * the notch's floor, the tab's E wall, the tab's roof, the far W. `level-ridge-tie.test.ts` derives its geometry.
 */
export const LEVEL_RIDGE_TIE = outline('Level ridge tie',
    [[0, 0], [1000, 0], [1000, 500], [600, 500], [600, 400], [300, 400], [300, 500], [0, 500]],
    [60, 30, 30, 37, 60, 23.5, 22.5, 37]);

/**
 * The island of the user's layout file 7 (BSA.F107), as building-shell's roof stage solves it: four Rings, one storey,
 * every side hipped. Its two collinear vertices on x = 150 are removed by canonicalisation.
 */
export const FILE_7_ISLAND = outline('Layout file 7 island',
    [[150, 350], [700, 350], [700, 550], [1150, 550], [1150, 1100], [700, 1100], [700, 950], [350, 950], [350, 1050],
        [150, 1050], [150, 950], [150, 750]],
    [52.5, 30, 60, 30, 30, 37, 60, 23.5, 22.5, 37, 37, 37]);
