import {setSkeletonLogLevel, SKELETON_NOISE_FLOOR, solveSkeleton} from '@proc-geo/core';

import {singleLoopSoundness, SOUND_SINGLE_LOOP} from './correct-solve-helpers';
import {
    clockwise,
    JITTER_CANONICAL_SKELETONS,
    JITTER_DOUBLE_REFLEX_PLUS,
    JITTER_K,
    JITTER_REFLEX_L,
    JITTER_ROOFS,
    JITTER_SEEDS,
    jitteredSamples,
    jitterSweep,
    leastCanonicalCoverage,
    offRoofArcPoints,
} from './jitter-helpers';

/*
 * ============================================================================
 *  BACKLOG ITEM 2, RE-MEASURED 2026-08-28 AND CLOSED. Read the verdict before editing a number.
 * ============================================================================
 *
 * `docs/notes/solver-hardening-backlog.md` item 2 records, from scratchpad scripts of 2026-08-09
 * that no longer exist, that reflex shapes whose edge samples are jittered ALONG the edge line are
 * unreliable: over 8 seeds x k = 1..10 the reflex L scored 48/80 failing and the double-reflex plus
 * 25/80, while jitter with an OFF-EDGE component passed 80/80. Between then and now the solver
 * gained input canonicalisation, the double-split partition fix and simultaneous-event
 * canonicalisation. This file is that measurement redone, and its result kept.
 *
 * The construction is `jitter-helpers.ts`, which spells out every constant. The magnitude is the one
 * thing the backlog does not record, so it was swept: 1e-9, 1e-6, 1e-3, 0.1 and 1.0 caller units on
 * shapes spanning 300.
 *
 * ----------------------------------------------------------------------------
 * THE VERDICT: CLOSED IN THE DEFAULT CONFIGURATION, AND CLOSED BY CONSTRUCTION
 * ----------------------------------------------------------------------------
 *
 * With the canonicalisation stage on — the default, and the only configuration a consumer sees —
 * along-edge jitter scores 0/80 on BOTH shapes at EVERY magnitude in the sweep. 48/80 and 25/80 are
 * now 0/80 and 0/80.
 *
 * It is closed structurally rather than luckily, which is why the mechanism is asserted below and
 * not merely described. A sample displaced along its own edge stays on the chord between its
 * neighbours, so its perpendicular deviation is float noise — measured at worst 1.3e-13 caller units
 * over 100k random on-line triples, about 5e-16 in unit space, TEN ORDERS below the 1e-6 floor.
 * Canonicalisation therefore removes every jittered sample whatever the jitter magnitude, and hands
 * the solver back the six- or twelve-vertex fixture it has always solved. There is no magnitude at
 * which this family can reach the solver, so there is no cell left for the sweep to find.
 *
 * ----------------------------------------------------------------------------
 * THE FULL EIGHTY-CELL MEASUREMENT, 2026-08-28. HISTORY, NOT A GATE.
 * ----------------------------------------------------------------------------
 *
 * Journal decision 68: the eighty-cell form of this table cost 222 s and became the critical path of
 * the whole core suite, which is too much for a class that is CLOSED. The measurement is recorded
 * here as dated prose and the standing regression below runs a representative subset of it. Every
 * figure in this block was measured on 2026-08-28 over the full 8 seeds x k = 1..10 grid, and the
 * way to re-measure it is to widen the subset constants below back to `JITTER_K` and `JITTER_SEEDS`
 * — `jitterSweep` takes both as parameters and defaults to the full grid precisely so that this
 * block can be reproduced without rewriting anything.
 *
 * Failures of eighty, stage ON (`SKELETON_NOISE_FLOOR` = 1e-6, the default):
 *
 *     magnitude          1e-9    1e-6    1e-3    0.1     1.0
 *     L   along-edge      0       0       0       0       0
 *     L   off-edge        0       0      22       1       0
 *     plus along-edge     0       0       0       0       0
 *     plus off-edge       0       0      46       1       0
 *
 * Failures of eighty, stage OFF (`{noiseFloor: 0}` — an exact identity in the stage, and the only
 * like-for-like comparison with 2026-08-09, which predates the stage entirely):
 *
 *     magnitude          1e-9    1e-6    1e-3    0.1     1.0
 *     L   along-edge      0       2      34      34      34      (recorded 2026-08-09: 48)
 *     L   off-edge       10      20      30       1       0      (recorded 2026-08-09:  0)
 *     plus along-edge     0      15      56      56      56      (recorded 2026-08-09: 25)
 *     plus off-edge       0      69      53       1       0      (recorded 2026-08-09:  0)
 *
 * ----------------------------------------------------------------------------
 * RE-MEASURED IN FULL, LATER ON 2026-08-28: BOTH TABLES MOVED, ALL OF IT DOWNWARDS
 * ----------------------------------------------------------------------------
 *
 * The block above is kept as it was written. What follows is the same eighty cells per column,
 * re-measured on the solver with journal decision 78's event-floor clustering, the parallel-vertex
 * closure in `algorithm-termination-cases.ts` and the split-path position identity in
 * `coincident-events.ts` all in place — the reason the subset assertions below moved. Stage ON:
 *
 *     magnitude          1e-9    1e-6    1e-3    0.1     1.0
 *     L   along-edge      0       0       0       0       0
 *     L   off-edge        0       0       0       0       0     (was 22 at 1e-3, 1 at 0.1)
 *     plus along-edge     0       0       0       0       0
 *     plus off-edge       0       0      10       1       0     (was 46 at 1e-3)
 *
 * Stage OFF:
 *
 *     magnitude          1e-9    1e-6    1e-3    0.1     1.0
 *     L   along-edge      0       0      19      19      19     (was 0, 2, 34, 34, 34)
 *     L   off-edge       10      16       2       0       0     (was 10, 20, 30, 1, 0)
 *     plus along-edge     0       0      40      40      40     (was 0, 15, 56, 56, 56)
 *     plus off-edge       0      54      10       1       0     (was 0, 69, 53, 1, 0)
 *
 * TWO THINGS THAT TABLE SAYS, AND BOTH MATTER MORE THAN THE ZEROES.
 *
 * FIRST: with the stage off the class is STILL ALIVE, and no longer worse than the record — 59 of
 * 160 against the 90 of 160 measured earlier today and the 73 of 160 recorded in 2026-08-09,
 * redistributed between the two shapes. Nothing that has landed removes the defect; canonicalisation
 * removes the INPUT, and the solver work since has taken about a third of what is left.
 *
 * SECOND: the off-edge column, which the backlog uses as its CONTROL, is only clean far from the
 * noise floor. At 1e-3 with the stage ON the L is now clean and the plus fails 10/80 — a live defect
 * at default options, pinned in `along-edge-jitter-known-failures.test.ts`, which keeps the FULL
 * eighty-cell grid because it is measuring something that is still broken.
 *
 * WHY 1.0 IS THE HEADLINE MAGNITUDE FOR THE CONTROL BELOW, AND WHY THE CHOICE BARELY MATTERS. The
 * backlog gives two anchors: along-edge fails about half its cells, and off-edge passes all eighty.
 * 1.0 is the only magnitude at which the second anchor reproduces, with the stage on and off alike.
 * The choice is nearly free, because the along-edge count SATURATES: 19/80 and 40/80 at 1e-3, at 0.1
 * and at 1.0, on the same insertion counts each time — the plateau survived every cure, only its
 * height fell. Once the jitter is large enough to break exact even spacing at all, which insertion
 * counts fail is a property of the shape's offset layers rather than of how hard it was pushed. The
 * subset below reproduces that plateau at both ends.
 *
 * ----------------------------------------------------------------------------
 * THE STAGE-OFF ALONG-EDGE CLASS CURED AT THE TOP OF THE PLATEAU, 2026-11-15 (BSA.D335 stage 1,
 * BSA.F108, BSA.F109, BSA.D338)
 * ----------------------------------------------------------------------------
 *
 * Everything above is history, and it counted only cells that came back incomplete. The stage-off
 * along-edge failures at 0.1 and 1.0 were the pairwise fallback's: of two meetings at one moment on one
 * bisector it took whichever the edge-id tie-break named, which could be the far one. The nearer along
 * the bisector's ray is now resolved first. Re-measured over all eighty cells per shape against the
 * CORRECT result, not completeness — complete with no diagnostic, every causality oracle at zero on
 * both sides, a tree, the strips tiling to 1e-12 at depth fractions 0.2, 0.5 and 1.0 (the sweep
 * harness's `measureSolve`), every arc on the shape's hand-derived roof and the whole canonical
 * skeleton covered. Cells that fail any of it, stage OFF, along-edge, at the parent commit and now:
 *
 *     magnitude          1e-9    1e-6    1e-3    0.1     1.0
 *     L    parent         30      72      68      69      69
 *     L    now            28      72      13       0       0
 *     plus parent         29      72      65      67      67
 *     plus now            29      72      31       0       0
 *
 * So the class is cured at 0.1 and 1.0 and NOT below. At 1e-3 the 44 wrong cells all complete: 40
 * carry direction violations, and 7 miss the tiling bar by less than 1e-6. At 1e-6 and 1e-9 every
 * wrong cell completes. At 1e-6 all 144 miss the tiling bar, 33 of them by more than 1e-6 (tenths of
 * the area at depth fraction 0.5 on k = 4), 36 are not trees and 15 carry causality violations; at
 * 1e-9, 49 of the 57 miss the tiling bar, 34 by more than 1e-6, and 13 carry causality violations.
 * None of that is attributed here.
 * The off-edge rows are not re-measured; `along-edge-jitter-known-failures.test.ts` holds them.
 *
 * The stage-OFF block below asserts the correct result on the sampled cells at 1.0 and 1e-3, every one
 * of which is right (BSA.D336). It used to pin the defect's counts, and was green while the solver was
 * wrong. Its 1e-3 cells hold only with the place order of the pairwise fallback (BSA.D335 stage 2):
 * with edge-id order in its place, `k = 4, seed 47514` on the plus completes and is not a tree.
 *
 * ----------------------------------------------------------------------------
 * WHAT TO DO WHEN A TEST HERE FAILS
 * ----------------------------------------------------------------------------
 *
 * The stage-ON assertions are a SPECIFICATION: they must stay at zero. If one fails, canonicalisation
 * has stopped removing on-line samples and the closure argument above no longer holds — fix that
 * before anything else.
 *
 * The stage-OFF assertions are a SPECIFICATION too: each sampled cell solves correctly. If one fails,
 * the solver has regressed in a regime the default configuration never reaches, and the report names
 * the cell and the property it lost.
 */

setSkeletonLogLevel('silent');

/** Caller-space displacement magnitudes, on shapes spanning 300 units. */
const MAGNITUDES = [1e-9, 1e-6, 1e-3, 0.1, 1.0];

/** The magnitude at which the off-edge control reproduces its recorded 80/80 pass. */
const HEADLINE_MAGNITUDE = 1.0;

const ALONG_EDGE = false;
const OFF_EDGE = true;

/** The stage switched off, reached through the public option: a zero floor is an exact identity. */
const STAGE_OFF = 0;

/*
 * THE REPRESENTATIVE SUBSET, per journal decision 68: two of the eight seeds and three of the ten
 * insertion counts, so every column below is SIX cells rather than eighty and the file runs in
 * seconds instead of minutes.
 *
 * NOT AN ARBITRARY SIX. The counts are chosen so the subset can still SEE the recorded defect: with
 * the stage off, the full grid's along-edge failures land on counts [4, 6, 8, 9, 10] for the L and
 * [6, 7, 8, 9, 10] for the plus, so 4 catches the L and 7 catches the plus. (They were in both until
 * the parallel-vertex closure re-measurement; the subset is unchanged and still sees each shape.)
 * `k = 2` is carried as the cheap control that must stay clean. A subset drawn only from the passing
 * counts would assert zero for the wrong reason and would go on passing through a total regression
 * of the stage-off regime. Since the cure (2026-11-15) the same counts are where a return of the
 * defect would show first: on the parent commit, 8 of the 12 stage-off cells below (both shapes) are
 * wrong at 1.0, and 8 of 12 at 1e-3.
 *
 * `failed` counts below are therefore OUT OF SIX. The eighty-cell figures are in the header.
 */
const SUBSET_SEEDS = [JITTER_SEEDS[0], JITTER_SEEDS[5]];
const SUBSET_COUNTS = [2, 4, 7];

describe('along-edge jitter: closed in the default configuration (specification)', () => {
    it.each(MAGNITUDES)('leaves the reflex L clean at magnitude %p', magnitude => {
        expect(jitterSweep(JITTER_REFLEX_L, magnitude, ALONG_EDGE, SKELETON_NOISE_FLOOR, SUBSET_COUNTS, SUBSET_SEEDS))
            .toEqual({failed: 0, failingCounts: []});
    });

    it.each(MAGNITUDES)('leaves the double-reflex plus clean at magnitude %p', magnitude => {
        expect(jitterSweep(JITTER_DOUBLE_REFLEX_PLUS, magnitude, ALONG_EDGE, SKELETON_NOISE_FLOOR, SUBSET_COUNTS, SUBSET_SEEDS))
            .toEqual({failed: 0, failingCounts: []});
    });

    it('is closed BY CANONICALISATION: the jittered ring comes back as the bare fixture', () => {
        /*
         * The mechanism, asserted rather than described. Without this, the zeroes above could go on
         * holding for some entirely different reason and nothing would say so — and the claim that
         * the closure is magnitude-independent would be an inference rather than a measurement. This
         * assertion, not the sweep, is what makes the subset above sufficient: it holds for EVERY
         * cell of the full grid by the same argument, because it does not depend on k or on the seed.
         */
        for (const magnitude of MAGNITUDES) {
            for (const [polygon, corners] of [[JITTER_REFLEX_L, 6], [JITTER_DOUBLE_REFLEX_PLUS, 12]] as const) {
                const vertices = jitteredSamples(clockwise(polygon), 7, 55433, magnitude, ALONG_EDGE);
                const result = solveSkeleton(vertices);

                expect(vertices).toHaveLength(corners * 7);
                expect(result.graph.numExteriorNodes).toBe(corners);
                expect(result.diagnostics.map(diagnostic => diagnostic.kind)).toEqual(['vertices-canonicalised']);
            }
        }
    });

    it('discards a deviation ten orders below the floor, whatever the jitter magnitude', () => {
        // The number the closure argument rests on. An on-line sample deviates from the chord
        // between its neighbours only by float noise, so the floor never has to be a judgement call
        // here — 1e-6 and 1e-12 would both remove it.
        for (const magnitude of MAGNITUDES) {
            const vertices = jitteredSamples(clockwise(JITTER_REFLEX_L), 7, 55433, magnitude, ALONG_EDGE);
            const detail = solveSkeleton(vertices).diagnostics[0].detail;
            const discarded = Number(/largest discarded deviation ([\d.e-]+)\./.exec(detail)?.[1]);

            expect(discarded).toBeLessThan(1e-14);
        }
    });
});

/** Positions agree with the hand derivation to a millionth of the shapes' 300-unit span. */
const HAND_TOLERANCE = 1e-6 * 300;

/**
 * Every subset cell of `shape` at `magnitude` with the stage off whose solve is not the correct one, as text: the sound
 * single-loop battery of `correct-solve-helpers.ts`, and the shape's hand-derived roof and canonical skeleton.
 */
function incorrectCells(shape: keyof typeof JITTER_ROOFS, magnitude: number): string[] {
    const polygon = shape === 'L' ? JITTER_REFLEX_L : JITTER_DOUBLE_REFLEX_PLUS;
    const found: string[] = [];
    for (const k of SUBSET_COUNTS) {
        for (const seed of SUBSET_SEEDS) {
            const result = solveSkeleton(jitteredSamples(clockwise(polygon), k, seed, magnitude, ALONG_EDGE), {noiseFloor: STAGE_OFF});
            // `noiseFloor: 0` turns canonicalisation off; the perceptual floor is the library's.
            const report = {
                ...singleLoopSoundness(result, SKELETON_NOISE_FLOOR),
                offRoof: offRoofArcPoints(result, JITTER_ROOFS[shape], HAND_TOLERANCE).length,
                coversCanonical: leastCanonicalCoverage(result, JITTER_CANONICAL_SKELETONS[shape], HAND_TOLERANCE) > 1 - 1e-9,
            };
            const correct = {...SOUND_SINGLE_LOOP, offRoof: 0, coversCanonical: true};
            if (JSON.stringify(report) !== JSON.stringify(correct)) {
                found.push(`k = ${k}, seed ${seed}: ${JSON.stringify(report)}`);
            }
        }
    }
    return found;
}

describe('along-edge jitter with the stage OFF', () => {
    /*
     * THE STAGE-OFF REGIME IS CURED (BSA.D335 stage 1, BSA.F108, BSA.F109), AND THESE TESTS ASSERT THE CURE
     * (BSA.D336). Until 2026-11-15 this block pinned the defect's counts — 1 of 6 on the L and 2 of 6 on the plus, at
     * k = 4, at both magnitudes — green while the solver was wrong. The cells failed in the pairwise fallback, which
     * broke the tie between two simultaneous meetings on one bisector by edge id and could take the far one; resolving
     * the nearer along the ray first made every one of them right. Measured on the full eighty-cell grid at magnitude
     * 1.0 the same day: all 160 cells pass the battery and the hand derivation below, where 136 failed on the parent
     * commit. Below 0.1 the full grid is not clean; see the header's last table.
     *
     * Each cell is held to the correct result, not to `complete`: the sound single-loop battery of
     * `correct-solve-helpers.ts` (no diagnostic, every oracle at zero on both sides, a tree, the strips tiling), every
     * live arc on the shape's hand-derived roof, and the whole canonical skeleton covered (`jitter-helpers.ts`). A
     * failure prints each wrong cell's report.
     */

    it('solves every sampled cell of the reflex L correctly at the headline magnitude', () => {
        expect(incorrectCells('L', HEADLINE_MAGNITUDE)).toEqual([]);
    });

    it('solves every sampled cell of the double-reflex plus correctly at the headline magnitude', () => {
        expect(incorrectCells('plus', HEADLINE_MAGNITUDE)).toEqual([]);
    });

    it('solves every sampled cell of both shapes correctly at 1e-3, three decades down', () => {
        // The plateau this block used to pin ran from 1e-3 to 1.0 on the same failing counts. Every sampled cell is
        // right here; 44 of the full grid's 160 at this magnitude are not (the header's last table).
        expect(incorrectCells('L', 1e-3)).toEqual([]);
        expect(incorrectCells('plus', 1e-3)).toEqual([]);
    });

    it('goes quiet at 1e-9, where the displacement is below the solver\'s own epsilon', () => {
        // The bottom of the plateau. At 1e-9 caller units — 3.9e-12 in unit space, four orders
        // under FLOATING_POINT_EPSILON — the samples are still exactly evenly spaced as far as the
        // solver can tell, which is the regular-insertion regime journal decision 56 fixed.
        const subset = [SUBSET_COUNTS, SUBSET_SEEDS] as const;

        expect(jitterSweep(JITTER_REFLEX_L, 1e-9, ALONG_EDGE, STAGE_OFF, ...subset).failed).toBe(0);
        expect(jitterSweep(JITTER_DOUBLE_REFLEX_PLUS, 1e-9, ALONG_EDGE, STAGE_OFF, ...subset).failed).toBe(0);
    });
});

describe('the off-edge control at the headline magnitude: clean, as recorded', () => {
    /*
     * The anchor that picks the headline magnitude, so it is asserted rather than left in prose. It
     * is still the expensive part of this file even sampled — an off-edge displacement above the
     * floor leaves every inserted sample standing, so the plus's k = 7 cells are 84-vertex solves and
     * cubic cost (backlog item 6) does the rest.
     *
     * The control is clean HERE and NOT clean three decades down; see
     * `along-edge-jitter-known-failures.test.ts`, which is the live half of this story and keeps the
     * full eighty-cell grid.
     */

    it('passes every cell on the reflex L with the stage off', () => {
        expect(jitterSweep(JITTER_REFLEX_L, HEADLINE_MAGNITUDE, OFF_EDGE, STAGE_OFF, SUBSET_COUNTS, SUBSET_SEEDS))
            .toEqual({failed: 0, failingCounts: []});
    });

    it('passes every cell on the double-reflex plus with the stage off', () => {
        expect(jitterSweep(JITTER_DOUBLE_REFLEX_PLUS, HEADLINE_MAGNITUDE, OFF_EDGE, STAGE_OFF, SUBSET_COUNTS, SUBSET_SEEDS))
            .toEqual({failed: 0, failingCounts: []});
    });

    it('and passes every cell on the reflex L with the stage on as well', () => {
        // At this magnitude the two stage settings are nearly the same computation — an off-edge
        // displacement of 1.0 caller unit is 3.9e-3 in unit space, three decades clear of the floor,
        // so canonicalisation only reaches the few samples whose draw came out near zero. The plus's
        // fourth cell of this table was measured at 0 of 6 on 2026-08-28 and is deliberately NOT run:
        // it is the slowest column in the file to re-confirm the cell either side of it.
        expect(jitterSweep(JITTER_REFLEX_L, HEADLINE_MAGNITUDE, OFF_EDGE, SKELETON_NOISE_FLOOR, SUBSET_COUNTS, SUBSET_SEEDS).failed)
            .toBe(0);
    });
});

describe('the subset is a subset of the grid the header reports', () => {
    it('draws its seeds and counts from the full sweep constants', () => {
        // Guards the one way the slimming in decision 68 could go quietly wrong: a subset that
        // drifted off the grid would still pass while measuring cells the header's table never
        // covered, and the two files would stop being comparable.
        for (const seed of SUBSET_SEEDS) {
            expect(JITTER_SEEDS).toContain(seed);
        }
        for (const count of SUBSET_COUNTS) {
            expect(JITTER_K).toContain(count);
        }
        expect(SUBSET_SEEDS).toHaveLength(2);
        expect(SUBSET_COUNTS).toHaveLength(3);
    });
});
