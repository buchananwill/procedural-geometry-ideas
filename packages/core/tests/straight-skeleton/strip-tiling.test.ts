import {CLEAN_TEST_POLYGONS, FULL_CORPUS, KNOWN_DEFECT_POLYGONS} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset, computeOffsetRings, computeStrips, solveSkeleton,
    SkeletonSolveResult, Strip, Vector2,
} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE STRIPS AND THE RESIDUE ACCOUNT FOR THE POLYGON, EXACTLY, CORPUS-WIDE.
 * ============================================================================
 *
 * At any depth the wavefront divides the polygon into two things and nothing else: the strips it has
 * swept, and the residue ring it has not reached. Their areas must add up to the polygon's. That is
 * a property of what a straight skeleton IS, not of any particular decomposition, which makes it the
 * sharpest cheap statement available about whether a skeleton is right — sharper than containment,
 * which the wrong answer below satisfied, and sharper than completeness, which it also satisfied.
 *
 * WHY IT WAS WRITTEN (journal decision 77, 2026-08-28). `OFF_EDGE_JITTER_L_SEED_15838`'s strips
 * covered 160% of its own area — the faces of the two walls of its corridor fused into a single ring
 * and were reported once for each wall — while the solve said `complete: true` with zero causality
 * violations, zero escaped nodes and a skeleton whose every node sits within 1e-11 of where an
 * independent oracle puts it. Nothing in the suite saw it. `collinear-dumbbell.test.ts` had measured
 * exactly this quantity since the dumbbell was enrolled, on one fixture, and the corpus was never
 * swept for it.
 *
 * ----------------------------------------------------------------------------
 * MEASURED AGAINST THE POLYGON THE SOLVER SOLVED, WHICH IS NOT ALWAYS THE CALLER'S
 * ----------------------------------------------------------------------------
 *
 * The boundary stage removes vertices below the render-scale floor, and where those vertices are not
 * exactly collinear that removal MOVES AREA — 5.17e-7 of it on seed 15838, whose three removed
 * samples are jittered rather than flat. Comparing against the caller's ring would score that drift
 * as a tiling failure, when the strips are in fact tiling their own polygon perfectly: measured both
 * ways, the discrepancy against the caller's ring equals the canonicalisation drift to seven
 * significant figures. So the reference is the graph's own exterior ring, and what this file asserts
 * is a property of the decomposition rather than a restatement of what the floor removed.
 *
 * ----------------------------------------------------------------------------
 * THE BAR IS MACHINE PRECISION, BECAUSE THAT IS WHAT THE CORPUS ACHIEVES
 * ----------------------------------------------------------------------------
 *
 * Measured 2026-08-28 over all 56 fixtures at both depths: the worst error anywhere outside the
 * dumbbell is 8.52e-16, on `Convergence Towards Isthmus (succeeds)`. A bar of 1e-14 is therefore ten
 * times the measured maximum and still eleven orders below the failure it was written for. It is
 * headroom against arithmetic, not slack bought to make a fixture pass, and it must not be widened
 * to admit one.
 */

/** Depth fractions of the maximum offset the identity is asserted at. */
const SWEPT_FRACTIONS = [0.2, 0.5];

/** Ten times the worst error the corpus achieves. See this file's header. */
const TILING_TOLERANCE = 1e-14;

/**
 * Fixtures whose tiling error is pinned rather than asserted clean, and what it measures.
 *
 * ONE ENTRY, AND IT IS THE DUMBBELL. Journal decision 72 requires each known-defect fixture to be
 * swept and pinned at whatever actually holds; measured here, six of the seven tile to machine
 * precision and only `COLLINEAR_DUMBBELL` does not. Its strips overlap strips by 22 of its 220 area
 * units, which is the silent wrong answer it is enrolled for, and the same tenth
 * `collinear-dumbbell.test.ts` measures against the caller's ring — the two agree because nothing is
 * removed from that fixture by the floor.
 */
const PINNED_TILING_ERRORS: Record<string, number> = {
    'Collinear Dumbbell': 0.1,
    // Journal decision 82, 2026-08-28. NOT a strip defect and not a bar that was widened to admit
    // one: the render-floor coincidence rule of decision 78 resolves this fixture's cluster B — two
    // events 3.13e-7 apart in unit space, 2.7e-7 of its extent — into one node, and the merged node
    // sits at the medoid of its own event set rather than at either of the two points the epsilon
    // bar used to place. The skeleton therefore MOVES by the pair separation, and the strips carry
    // that displacement into their areas. 7.36e-13 is what a 3.13e-7 unit-space move costs an area
    // identity; the global bar stays at 1e-14, where the other 54 fixtures still sit.
    'Off-edge Jitter Reflex L (seed 15838)': 7.36e-13,
    // The same mechanism one step further out, and the same ruling. Giving the split/partition pass
    // render-floor position identity (journal decision 85) resolves this fixture's two simultaneous
    // splits — 5.4e-7 apart in unit space, which no zoom separates — into one node at the medoid of
    // their two positions, so the skeleton moves by that separation and the strips carry it into
    // their areas. 1.78e-12 is what a 5.4e-7 unit-space move costs an area identity. The cure it
    // bought is in `graph-index-invariants.test.ts` (a sub-floor pair gone) and in
    // `wavefront-causality.test.ts` (this fixture's direction violation gone).
    'Off-edge Jitter Reflex L (seed 55433, k=4)': 1.78e-12,
};

/**
 * Fixtures the identity cannot be measured on at all, and why.
 *
 * `computeMaxOffset` refuses an incomplete solve, so there is no depth to sweep. THE LIST IS NOW
 * EMPTY: `Off-edge Jitter Plus (seed 7919)` was its only member and the parallel-vertex closure in
 * `algorithm-termination-cases.ts` cured its root, so it falls into the sweep — and measures 1.46e-16
 * at every swept depth, which is the clean-roster band and evidence that the closure produced a
 * skeleton whose strips genuinely tile the polygon.
 *
 * The list is kept rather than deleted because a static exclusion that outlives its reason is exactly
 * the laundering journal decision 72 retired: an empty one asserts, in the reach test below, that
 * every fixture in the corpus is measured here.
 */
const UNMEASURABLE: string[] = [];

function signedRingArea(ring: Vector2[]): number {
    let total = 0;
    for (let index = 0; index < ring.length; index++) {
        const from = ring[index];
        const to = ring[(index + 1) % ring.length];
        total += from.x * to.y - to.x * from.y;
    }
    return total / 2;
}

function stripArea(strip: Strip): number {
    return strip.holes.reduce(
        (area, hole) => area - Math.abs(signedRingArea(hole)),
        Math.abs(signedRingArea(strip.boundary)));
}

/** How far the strips plus the residue ring miss the solved polygon's area, relative to it. */
function tilingError(result: SkeletonSolveResult, depth: number): number {
    const {graph} = result;
    const solved = graph.nodes.slice(0, graph.numExteriorNodes).map(node => node.position);
    const solvedArea = Math.abs(signedRingArea(solved));

    const covered = computeStrips(result, {depth}).reduce((total, strip) => total + stripArea(strip), 0)
        + computeOffsetRings(result, depth).reduce((total, ring) => total + Math.abs(signedRingArea(ring)), 0);

    return Math.abs(covered - solvedArea) / solvedArea;
}

function worstTilingError(vertices: Vector2[]): number {
    const result = solveSkeleton(vertices);
    const maxOffset = computeMaxOffset(result);
    return Math.max(...SWEPT_FRACTIONS.map(fraction => tilingError(result, maxOffset * fraction)));
}

describe('the strips and the residue account for the polygon they were cut from', () => {
    it.each(CLEAN_TEST_POLYGONS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s tiles to machine precision',
        (_name, vertices) => {
            expect(worstTilingError(vertices)).toBeLessThan(TILING_TOLERANCE);
        },
    );

    it.each(KNOWN_DEFECT_POLYGONS
        .filter(polygon => !UNMEASURABLE.includes(polygon.name))
        .map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s tiles to exactly what is pinned for it',
        (name, vertices) => {
            const pinned = PINNED_TILING_ERRORS[name];
            if (pinned === undefined) {
                expect(worstTilingError(vertices)).toBeLessThan(TILING_TOLERANCE);
                return;
            }
            // Relative, because these two are eleven orders of magnitude apart and an absolute
            // `toBeCloseTo` would be vacuous on one of them and unsatisfiable on the other.
            expect(worstTilingError(vertices) / pinned).toBeCloseTo(1, 2);
        },
    );

    it('is not vacuous: the sweep reaches every fixture in the corpus', () => {
        // The guard on its own reach. A depth that stopped producing strips, or a roster that lost a
        // fixture, would leave every assertion above passing over nothing.
        const measured = FULL_CORPUS.filter(polygon => !UNMEASURABLE.includes(polygon.name));

        expect(measured).toHaveLength(FULL_CORPUS.length);
        expect(UNMEASURABLE.every(name => FULL_CORPUS.some(polygon => polygon.name === name))).toBe(true);

        const result = solveSkeleton(CLEAN_TEST_POLYGONS[0].vertices);
        expect(computeStrips(result, {depth: computeMaxOffset(result) * 0.2}).length).toBeGreaterThan(0);
    });

    it('only the three pinned fixtures miss the bar, which is why it can be this tight', () => {
        // Measured rather than assumed, and asserted as a SET so that a fourth fixture starting to
        // miss is caught here rather than absorbed into a tolerance. The three are of two completely
        // different kinds and the set says so: the dumbbell's strips OVERLAP by a tenth of its area,
        // a silent wrong answer, while seed 15838 and (seed 55433, k=4) miss by 7.36e-13 and
        // 1.78e-12 because a merged event set moved one of their nodes to its medoid. See
        // {@link PINNED_TILING_ERRORS}.
        const failing = FULL_CORPUS
            .filter(polygon => !UNMEASURABLE.includes(polygon.name))
            .filter(polygon => worstTilingError(polygon.vertices) >= TILING_TOLERANCE)
            .map(polygon => polygon.name)
            .sort();

        expect(failing).toEqual(Object.keys(PINNED_TILING_ERRORS).sort());
    });
});
