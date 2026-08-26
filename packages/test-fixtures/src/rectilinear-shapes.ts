import type {Vector2} from '@proc-geo/core';

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
 * A T-shape: a horizontal bar over a vertical stem. Every dimension combination tried
 * (symmetric and several asymmetric stem-width/bar-height/overhang ratios) hits the same
 * solver bug at the T-junction's pair of reflex vertices — `runAlgorithmV5` reports a
 * "Partition sorting failure" and leaves interior edges unresolved. Left out of
 * `ALL_TEST_POLYGONS`'s regression sweep for that reason; kept here for visual inspection.
 */
export const T_SHAPE: Vector2[] = [
    {x: 0, y: 6},
    {x: 6, y: 6},
    {x: 6, y: 4},
    {x: 4, y: 4},
    {x: 4, y: 0},
    {x: 2, y: 0},
    {x: 2, y: 4},
    {x: 0, y: 4},
];
