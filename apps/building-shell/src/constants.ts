/**
 * The app's one geometric tolerance, in centimetres. `manifold-3d` stores positions as float32, so no test in the
 * shell can be finer than this (spec decision 16).
 *
 * Spec decision 16's named exceptions, each its own constant beside the code it governs, and each derived from this
 * one or from the 1/1024 cm snap grid:
 * - `RETAG_SLACK_CM` (`regions.ts`, journal decision 73): the re-tag pass's containment slack;
 * - `IMPRINT_SIDE_CM` and `IMPRINT_MERGE_CM` (`imprint.ts`, journal decision 122, F-F): how far either side of a raw
 *   edge the imprint reads its winners, and how near two new imprint vertices are one;
 * - `CLEAN_TOLERANCE_CM` and `CLEAN_MAX_MOVE_CM` (`clean.ts`, journal decisions 101 and 122): the cleaning's cluster
 *   and cap tolerance, and the furthest it may move any vertex, which is this tolerance itself.
 */
export const SHELL_TOLERANCE_CM = 0.01;
