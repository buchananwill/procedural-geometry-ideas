/**
 * The app's one geometric tolerance, in centimetres. `manifold-3d` stores positions as float32, so no test in the
 * shell can be finer than this (spec decision 16).
 */
export const SHELL_TOLERANCE_CM = 0.01;
