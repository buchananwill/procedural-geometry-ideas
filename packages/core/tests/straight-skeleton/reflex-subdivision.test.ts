import {isClockwise, setSkeletonLogLevel, SKELETON_NOISE_FLOOR, solveSkeleton, Vector2} from '@proc-geo/core';

import {insertIrregularly, insertRegularly} from './subdivision-helpers';

/*
 * ============================================================================
 *  PART SPECIFICATION, PART RECORDED DEFECT. Read the split before editing.
 * ============================================================================
 *
 * Subdivision adds vertices without changing the shape: every added vertex is collinear with
 * its neighbours, so the straight skeleton of the subdivided polygon is the straight skeleton
 * of the original. That makes it the cleanest stress test of the solver's event handling — it
 * manufactures exact simultaneity without changing the answer.
 *
 * ----------------------------------------------------------------------------
 * WHAT WAS FIXED
 * ----------------------------------------------------------------------------
 *
 * `collision-handling.ts`, `interiorNonAdjacent`: the branch terminated the instigator and then
 * `accept`ed the target without ever giving it a node. The reciprocal event could not repair
 * that — by then both are accepted and the handler returns early — so 49 of 50 such events
 * stranded their target. Both participants are now terminated, as `interiorPair` always did.
 *
 * That single change took the double-reflex plus from 2 of 10 subdivision counts to 10 of 10,
 * and the reflex L from 3 of 10 to 6 of 10. It is an unconditional defect fix, independent of
 * reflex shapes or subdivision.
 *
 * ----------------------------------------------------------------------------
 * BOTH FAILURE LISTS ARE NOW EMPTY, AND INPUT CANONICALISATION IS WHY
 * ----------------------------------------------------------------------------
 *
 * `REFLEX_L_KNOWN_FAILURES` was [5, 6, 8, 10] and `DOUBLE_REFLEX_PLUS_KNOWN_FAILURES` was [9].
 * Both are empty. The reflex L and the double-reflex plus solve at every k from 1 to 10.
 *
 * Subdividing an edge into k pieces adds vertices that are collinear with their neighbours and
 * nothing else, so they deviate from the chord between those neighbours by around 1e-16 in unit
 * space — invisible against a 1e-6 noise floor. The canonicalisation stage removes them and hands
 * the solver back the unsubdivided fixture, which always passed. The failing input is gone rather
 * than handled.
 *
 * AMENDED 2026-08-27: the defect underneath is no longer untouched. The double-split partition fix
 * (`GOLF_CART`, journal decision 56) taught `handleInteriorNGon` to partition a layer at every
 * simultaneous split rather than deduping same-start events down to one, and that turned out to be
 * exactly the regime these fixtures manufacture. Re-measured with the stage off: BOTH regular-
 * insertion failure sets are now empty too, and the L at k = 6 resolves uncanonicalised. The
 * historical sets are recorded on the constants below, and the tests now pin the re-measured empty
 * sets so a regression in either direction stays loud. What still convicts the stage of doing real
 * work is the irregular-insertion family, which the structural fix does not reach: the plus still
 * fails 4 of 10 irregular seeds with the stage off.
 *
 * ----------------------------------------------------------------------------
 * WHAT THE UNDERLYING DEFECT WAS, KEPT AS HISTORY OF ITS FIX
 * ----------------------------------------------------------------------------
 *
 * The L failures came from several ring-partitioning events landing in one offset layer.
 * `handleInteriorNGon` resolved each against the whole unmodified ring, so their surviving-arc
 * calculations overlapped and contradicted. A partitioning event is one whose participants are
 * non-contiguous on the ring — opposite stretches of wavefront meeting. A convex polygon produces
 * at most one, at the very end; a reflex notch creates facing walls, and on this fixture the arms
 * are of equal width, so several pinches happen at *exactly* the same offset. Instrumented over
 * the sweep, that count was 0 for the convex hexagon at every k, 0 or 1 for every configuration
 * that passed, and 3, 5, 9, 13 or 17 for every one that failed.
 *
 * An earlier structural fix for it was written, landed, measured and then **reverted** as buying
 * nothing for real inputs at real complexity cost. The measurement that settled that reversion:
 * hand-drawn strokes tracing an L and a cross, with per-axis tremor at 0.5, 1.5 and 3.0 units,
 * through three realistic stage combinations, budgeted and solved — **288 of 288 before the
 * structural fix, and 288 of 288 after**. Identical. Smoothing, RDP and Schneider fitting all
 * destroy the exact collinearity and exact even spacing this defect requires, so no drawn region
 * reaches the failing regime. The defect was then re-fixed for its own sake when `GOLF_CART`
 * failed on the same structure at a visible scale — see the amendment above.
 *
 * ----------------------------------------------------------------------------
 * THE PLUS'S k = 9 WAS AN OPEN REGRESSION. IT IS CLOSED, AND HERE IS THE CHAIN.
 * ----------------------------------------------------------------------------
 *
 * That entry was recorded as a bug rather than a limitation, so it is closed explicitly rather
 * than allowed to lapse.
 *
 * Task 236 changed the solver's boundary normalisation to scale by the power of two NEAREST the
 * longest bounding-box side instead of by the side itself, so that normalise/denormalise is
 * bit-exactly invertible. Every fixture in this file spans exactly 300 units, so the OLD scale
 * was exactly 300 — and dividing by exactly the span is what made a uniformly subdivided edge
 * come out uniformly subdivided IN UNIT SPACE, on the bit: edge vector over span is exactly 1, so
 * vertex j landed exactly on `corner + j / k`. Under a scale of 256 it does not, and the several
 * ring-partitioning events this fixture lands in a single offset layer stopped being bit-identical
 * to each other.
 *
 * So the old scale was CANONICALISING this input by accident, and k = 9 passing was a property of
 * the scale rather than of the solver. The stage now canonicalises it on purpose, which is why
 * this is a fix and not a second accident: it does not depend on the fixture's span sharing a
 * factor with the normalisation scale. Confirmed at the time that it was never a
 * tolerance-against-magnitude problem — taking the scale exponent by `Math.ceil` and by
 * `Math.floor`, opposite directions of relative epsilon, reproduced the identical failure set, and
 * rescaling a fixture to span exactly 256 shuffled the set's membership without changing its size.
 */

setSkeletonLogLevel('silent');

const SQUARE: Vector2[] = [
    {x: 100, y: 100}, {x: 100, y: 400}, {x: 400, y: 400}, {x: 400, y: 100},
];

const IRREGULAR_HEXAGON: Vector2[] = [
    {x: 100, y: 200}, {x: 180, y: 100}, {x: 320, y: 120},
    {x: 400, y: 240}, {x: 300, y: 380}, {x: 150, y: 340},
];

const REFLEX_L: Vector2[] = [
    {x: 100, y: 100}, {x: 100, y: 400}, {x: 250, y: 400},
    {x: 250, y: 250}, {x: 400, y: 250}, {x: 400, y: 100},
];

const DOUBLE_REFLEX_PLUS: Vector2[] = [
    {x: 200, y: 100}, {x: 200, y: 200}, {x: 100, y: 200}, {x: 100, y: 300},
    {x: 200, y: 300}, {x: 200, y: 400}, {x: 300, y: 400}, {x: 300, y: 300},
    {x: 400, y: 300}, {x: 400, y: 200}, {x: 300, y: 200}, {x: 300, y: 100},
];

/** The solver only handles clockwise winding; these fixtures are authored either way. */
function clockwise(polygon: Vector2[]): Vector2[] {
    return isClockwise(polygon) ? polygon : [...polygon].reverse();
}

function solvesCompletely(polygon: Vector2[], k: number): boolean {
    return solveSkeleton(insertRegularly(clockwise(polygon), k)).complete;
}

/**
 * As {@link solvesCompletely}, with input canonicalisation switched off.
 *
 * A zero noise floor is an exact identity in the stage — the comparison against it is strict — so
 * this is the solver as it behaved before the stage existed, reached through the public option
 * rather than through a seam in the solver.
 */
function solvesCompletelyUncanonicalised(polygon: Vector2[], k: number): boolean {
    return solveSkeleton(insertRegularly(clockwise(polygon), k), {noiseFloor: 0}).complete;
}

const ALL_K = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Subdivision counts at which the reflex L fails with the canonicalisation stage switched off.
 *
 * Was [5, 6, 8, 10] until 2026-08-27, when the double-split partition fix (journal decision 56)
 * emptied it — the solver now resolves these layers itself. Pinned so movement in either
 * direction stays loud.
 */
const REFLEX_L_FAILURES_WITHOUT_CANONICALISATION: number[] = [];

/**
 * The same for the double-reflex plus. Was [9] — the OPEN regression the power-of-two
 * normalisation scale introduced — until the same fix emptied it.
 */
const PLUS_FAILURES_WITHOUT_CANONICALISATION: number[] = [];

describe('subdivided edges: convex control (specification)', () => {
    it.each(ALL_K)('solves the square subdivided %i times per edge', k => {
        expect(solvesCompletely(SQUARE, k)).toBe(true);
    });

    it.each(ALL_K)('solves the irregular hexagon subdivided %i times per edge', k => {
        expect(solvesCompletely(IRREGULAR_HEXAGON, k)).toBe(true);
    });
});

describe('subdivided edges: double-reflex plus (specification)', () => {
    it.each(ALL_K)('solves the plus subdivided %i times per edge', k => {
        expect(solvesCompletely(DOUBLE_REFLEX_PLUS, k)).toBe(true);
    });

    it('fails at nothing, so drift in either direction is loud', () => {
        expect(ALL_K.filter(k => !solvesCompletely(DOUBLE_REFLEX_PLUS, k))).toEqual([]);
    });
});

describe('subdivided edges: reflex L (specification)', () => {
    it.each(ALL_K)('solves the reflex L subdivided %i times per edge', k => {
        expect(solvesCompletely(REFLEX_L, k)).toBe(true);
    });

    it('fails at nothing, so drift in either direction is loud', () => {
        expect(ALL_K.filter(k => !solvesCompletely(REFLEX_L, k))).toEqual([]);
    });
});

describe('the regular-insertion failures are gone even with the stage off, since decision 56', () => {
    /*
     * These two used to reproduce the historical failure sets with the stage switched off, which
     * was what convicted the stage of emptying the lists above. Since the double-split partition
     * fix they reproduce EMPTY sets with the stage off too: the solver now handles the regular-
     * insertion regime itself. The stage's own conviction now rests on the irregular-insertion
     * measurement below, which the structural fix does not reach.
     */

    it('reproduces the reflex L\'s recorded failures exactly when the stage is off', () => {
        expect(ALL_K.filter(k => !solvesCompletelyUncanonicalised(REFLEX_L, k)))
            .toEqual(REFLEX_L_FAILURES_WITHOUT_CANONICALISATION);
    });

    it('reproduces the plus\'s recorded regression exactly when the stage is off', () => {
        expect(ALL_K.filter(k => !solvesCompletelyUncanonicalised(DOUBLE_REFLEX_PLUS, k)))
            .toEqual(PLUS_FAILURES_WITHOUT_CANONICALISATION);
    });

    it('holds for irregularly inserted vertices too, which is a different failure set', () => {
        /*
         * Decision 11: probe irregular insertion parameters as well as equal ones, because equal
         * subdivision is a special input — it manufactures exact simultaneity and exactly equal
         * spacing that irregular insertion never produces.
         *
         * PROBING BOTH FAMILIES IS STILL RIGHT AND THIS FILE NO LONGER CONVICTS THE STAGE. Said
         * plainly rather than left to be inferred from four zeroes. Historically the two families
         * caught DIFFERENT failures with the stage off — the reflex L failed 4 of 10 regular counts
         * and 0 of 10 irregular seeds, the plus 1 of 10 regular and 2 of 10 irregular — so a suite
         * probing either alone would have declared one of these shapes clean. Successive solver
         * fixes have since emptied every one of those cells:
         *
         *     stage off, this file          2026-08-09   after D56   after D90
         *     reflex L, regular                 4/10          0          0
         *     reflex L, irregular               0/10          0          0
         *     plus, regular                     1/10          0          0
         *     plus, irregular                   4/10          2          0
         *
         * The last cell fell to the corridor-midline fix (journal decision 90): the plus's arms are
         * corridors, and both surviving seeds produced a sub-polygon whose midline had been born
         * pointing out of the arm. WHERE THE STAGE'S CONVICTION LIVES NOW is
         * `stroke-derived-polygons.test.ts` (the L still fails at k = 4, 7, 8 and 10 with the floor
         * at zero) and `along-edge-jitter.test.ts` (both shapes still fail with the stage off). The
         * assertions below are therefore a SPECIFICATION — the solver handles this whole regime
         * unaided now — and they stay because a return of any of these cells must be loud.
         */
        const seeds = Array.from({length: 10}, (_unused, index) => (index + 1) * 7919);
        const fails = (polygon: Vector2[], floor: number): number =>
            seeds.filter(seed => !solveSkeleton(
                insertIrregularly(clockwise(polygon), 2, seed), {noiseFloor: floor}).complete).length;

        expect(fails(REFLEX_L, SKELETON_NOISE_FLOOR)).toBe(0);
        expect(fails(DOUBLE_REFLEX_PLUS, SKELETON_NOISE_FLOOR)).toBe(0);

        // The conviction, and the asymmetry that makes probing both families necessary.
        //
        // RE-MEASURED 2026-08-28: the plus's irregular count went 2 to 0 under the corridor-midline
        // fix (journal decision 90) — its arms are corridors, and both of the surviving two were
        // sub-polygons whose midline had been born pointing out of the arm. The asymmetry the
        // measurement exists for now shows as the REGULAR family alone (the block above), which is
        // the same point made by the other half of the pair.
        expect(fails(REFLEX_L, 0)).toBe(0);
        expect(fails(DOUBLE_REFLEX_PLUS, 0)).toBe(0);
    });

    it('removes only the inserted vertices, restoring the fixture the solver always handled', () => {
        // The mechanism, asserted rather than described: at every k the canonicalised polygon is
        // back to the six corners the fixture was authored with. If this stopped holding, the
        // lists above could go empty for some other reason and nothing would say so.
        for (const k of ALL_K) {
            const result = solveSkeleton(insertRegularly(clockwise(REFLEX_L), k));
            expect(result.graph.numExteriorNodes).toBe(REFLEX_L.length);
        }
    });
});

describe('subdivided edges: the stranded-target signature is fixed', () => {
    it('L at k = 3 — the former minimal case — strands no interior edge', () => {
        const result = solveSkeleton(insertRegularly(clockwise(REFLEX_L), 3));

        // The canonicalisation report is the only diagnostic, and it is informational: 12 inserted
        // vertices removed, none of which the silhouette ever had.
        expect(result.diagnostics.map(diagnostic => diagnostic.kind)).toEqual(['vertices-canonicalised']);
        expect(result.complete).toBe(true);

        // e42 and e45 used to finish accepted-but-targetless, because `handleCollisionEvent`'s
        // `interiorNonAdjacent` branch accepted the target without ever terminating it.
        const stranded = result.graph.interiorEdges
            .filter(interior => result.graph.edges[interior.id].target === undefined)
            .map(interior => interior.id);
        expect(stranded).toEqual([]);
    });

    it('L at k = 6 resolves with the stage on and, since decision 56, with it off as well', () => {
        // This used to pin the span-assignment failure the stage removed, so "k = 6 passes" could
        // not come to mean "k = 6 stopped being measured". The double-split partition fix resolved
        // the uncanonicalised solve too; both halves are pinned as complete so a regression in the
        // structural fix shows up here even while the stage keeps the canonicalised half green.
        expect(solveSkeleton(insertRegularly(clockwise(REFLEX_L), 6)).complete).toBe(true);

        const uncanonicalised = solveSkeleton(insertRegularly(clockwise(REFLEX_L), 6), {noiseFloor: 0});
        expect(uncanonicalised.complete).toBe(true);
        expect(uncanonicalised.diagnostics.some(diagnostic => diagnostic.kind === 'step-failure')).toBe(false);
    });
});
