import type {SkeletonSolveResult} from '@proc-geo/core';
import {buildSkeletonTree, computeMaxOffset} from '@proc-geo/core';

import {holedTilingError, oracleCausalityCounts, rateViolations} from './wavefront-measurement-helpers';

/*
 * THE CORRECT RESULT OF A SINGLE-LOOP SOLVE, AS ONE VALUE (BSA.D266, BSA.D336, BSA.D338).
 *
 * A test of a cured defect asserts what the right answer is, so that it is green because the solve is right and goes
 * red if the defect comes back. These are the properties every sound single-loop skeleton has, read without one node or
 * edge id, so that a change to the solver's numbering moves none of them:
 *
 *  - it completes, with no diagnostic but the informational notes of the boundary stage;
 *  - the solver's four causality oracles and the test side's four (`wavefront-measurement-helpers.ts`) find nothing;
 *  - it is a tree (`buildSkeletonTree`);
 *  - its strips and offset rings tile the outline at depth fractions 0.2, 0.5 and 1.0 of the deepest offset, to
 *    {@link TILING_BAR} (the sweep harness's depths, and the holed battery's bar).
 *
 * `expect(singleLoopSoundness(result, floor)).toEqual(SOUND_SINGLE_LOOP)` asserts all of it, and a failure prints the
 * whole report. This file is deliberately NOT named `*.test.ts`.
 */

/** The relative tiling miss a sound solve stays under. */
export const TILING_BAR = 1e-12;

/** The depth fractions of the deepest offset at which the tiling is read. */
const TILING_FRACTIONS = [0.2, 0.5, 1.0];

/** Diagnostics that note what the boundary stage did to the input and say nothing about the skeleton. */
const INFORMATIONAL_KINDS = ['winding-normalised', 'vertices-canonicalised'];

/** Violations per causality oracle. */
export interface OracleCounts {
    offset: number;
    clearance: number;
    direction: number;
    rate: number;
}

export interface SingleLoopSoundness {
    complete: boolean;
    /** Every diagnostic kind but the informational ones, sorted. */
    kinds: string[];
    /** The solver's `causality-violation` diagnostics, counted per oracle. */
    solverOracles: OracleCounts;
    /** The test side's oracles, counted, at the floor the solve ran at. */
    testOracles: OracleCounts;
    /** `buildSkeletonTree(result).isTree`; undefined on an incomplete solve or a throw. */
    isTree: boolean | undefined;
    /** Every tiling reading is under {@link TILING_BAR}; false on an incomplete solve or a throw. */
    tiles: boolean;
}

export const SOUND_SINGLE_LOOP: SingleLoopSoundness = {
    complete: true,
    kinds: [],
    solverOracles: {offset: 0, clearance: 0, direction: 0, rate: 0},
    testOracles: {offset: 0, clearance: 0, direction: 0, rate: 0},
    isTree: true,
    tiles: true,
};

/**
 * The report of {@link SOUND_SINGLE_LOOP}'s properties on `result`. `perceptualFloor` is the floor the solve ran at:
 * the library's, `SKELETON_NOISE_FLOOR`, when it was given none, as it is when only `noiseFloor` is set.
 */
export function singleLoopSoundness(result: SkeletonSolveResult, perceptualFloor: number): SingleLoopSoundness {
    const solverOracles: OracleCounts = {offset: 0, clearance: 0, direction: 0, rate: 0};
    for (const diagnostic of result.diagnostics) {
        if (diagnostic.kind === 'causality-violation') {
            solverOracles[diagnostic.oracle] += 1;
        }
    }
    const testOracles: OracleCounts = {
        ...oracleCausalityCounts(result, perceptualFloor),
        rate: rateViolations(result.graph, perceptualFloor).length,
    };
    let isTree: boolean | undefined;
    let tiles = false;
    if (result.complete) {
        try {
            isTree = buildSkeletonTree(result).isTree;
        } catch {
            isTree = undefined;
        }
        try {
            const maxOffset = computeMaxOffset(result);
            tiles = TILING_FRACTIONS.every(fraction => holedTilingError(result, maxOffset * fraction) < TILING_BAR);
        } catch {
            tiles = false;
        }
    }
    return {
        complete: result.complete,
        kinds: result.diagnostics.map(diagnostic => diagnostic.kind)
            .filter(kind => !INFORMATIONAL_KINDS.includes(kind)).sort(),
        solverOracles,
        testOracles,
        isTree,
        tiles,
    };
}
