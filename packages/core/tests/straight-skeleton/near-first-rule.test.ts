/*
 * THE NEAR-FIRST RULE'S BAR AND ITS REACH ACROSS EVENT KINDS, EACH HELD BY A SOLVE IT DECIDES (BSA.D335, BSA.F109,
 * BSA.D338).
 *
 * Of two simultaneous events on one bisector, the pairwise fallback resolves the nearer along the bisector's ray first
 * (`nearerAlongSharedBisector` in `event-order.ts`). Two of its choices had no test that a change to them
 * would turn red (BSA.F109); each describe below is one, on a cell of the sweep harness's along-edge grid with the
 * boundary stage off (`{noiseFloor: 0}`), so that the jittered samples reach the solver:
 *
 *  - THE BAR. Two events are ordered only when they lie MORE THAN THE PERCEPTUAL FLOOR apart along the ray; nearer than
 *    that they are one point and go to the tie-break. With the bar at zero, `alongedge:plus:k2:s63352` completes with
 *    no diagnostic and is wrong: its skeleton is not a tree, and its strips miss the outline's area by 2% to 10%.
 *  - THE REACH. The rule orders events of DIFFERENT kinds on one ray, ahead of the kinds' priority. Restricted to events
 *    of one kind, two cells at magnitude 1e-3 come out with direction violations: on them a non-adjacent collision
 *    nearer along a ray is resolved before an adjacent pair farther along it, and the restricted rule takes the pair
 *    first. These two were found by a bounded search (BSA.D338): the along-edge grid at magnitudes 1, 0.1, 1e-3 and
 *    1e-6 with the stage off, its off-edge grid at 1e-3 and 1, the grid's k = 2 to 5 cells at every third rotation of
 *    their starting vertex, five subdivided shapes at k = 1 to 10, and `FULL_CORPUS` and `HOLED_TEST_POLYGONS` with
 *    the stage off: 1,763 inputs, each solved with and without the restriction, and these two the only ones it changes. No split (an
 *    `interiorAgainstExterior` event) was among the reordered events on them.
 *
 * Each test asserts the correct result: the sound single-loop battery of `correct-solve-helpers.ts` and the shape's
 * hand-derived roof and canonical skeleton (`jitter-helpers.ts`). No assertion reads a node or edge id.
 */
import {setSkeletonLogLevel, SKELETON_NOISE_FLOOR, solveSkeleton} from '@proc-geo/core';
import {singleLoopSoundness, SOUND_SINGLE_LOOP} from './correct-solve-helpers';
import {
    clockwise,
    JITTER_CANONICAL_SKELETONS,
    JITTER_DOUBLE_REFLEX_PLUS,
    JITTER_ROOFS,
    jitteredSamples,
    leastCanonicalCoverage,
    offRoofArcPoints,
} from './jitter-helpers';

setSkeletonLogLevel('silent');

/** Positions agree with the hand derivation to a millionth of the shapes' 300-unit span. */
const HAND_TOLERANCE = 1e-6 * 300;

function expectCorrectPlus(k: number, seed: number, magnitude: number) {
    const result = solveSkeleton(jitteredSamples(clockwise(JITTER_DOUBLE_REFLEX_PLUS), k, seed, magnitude, false), {noiseFloor: 0});
    // `noiseFloor: 0` turns canonicalisation off; the perceptual floor is the library's.
    expect(singleLoopSoundness(result, SKELETON_NOISE_FLOOR)).toEqual(SOUND_SINGLE_LOOP);
    expect(offRoofArcPoints(result, JITTER_ROOFS.plus, HAND_TOLERANCE)).toEqual([]);
    expect(leastCanonicalCoverage(result, JITTER_CANONICAL_SKELETONS.plus, HAND_TOLERANCE)).toBeGreaterThan(1 - 1e-9);
}

describe('the near-first rule orders two events only when they are more than the perceptual floor apart', () => {
    it('alongedge:plus:k2:s63352, noiseFloor 0: a tree, no causality violation, and the hand-derived roof', () => {
        expectCorrectPlus(2, 63352, 1.0);
    });
});

describe('the near-first rule orders events of different kinds on one ray, ahead of their priority', () => {
    it.each([[8, 47514], [10, 63352]])('alongedge:plus:k%i:s%i at magnitude 1e-3, noiseFloor 0: sound, on the hand-derived roof', (k, seed) => {
        expectCorrectPlus(k, seed, 1e-3);
    });
});
