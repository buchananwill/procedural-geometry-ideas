import {FULL_CORPUS} from '@proc-geo/test-fixtures';
import {
    denormaliseLength,
    flattenRecursiveTree,
    FULL_DEPTH_FRACTION,
    makeSkeletonNormalisation,
    MAX_RECURSION_LEVELS,
    normaliseLength,
    normalisePolygon,
    setSkeletonLogLevel,
    SKELETON_NOISE_FLOOR,
    subdivideRecursively,
    uniformLevelSpecs,
    Vector2,
} from '@proc-geo/core';

import {distanceToSegment, distanceToSupportingLine} from './wavefront-measurement-helpers';

/**
 * ============================================================================
 *  THE FOLD INVARIANT: NO REGION IS HANDED TO A SOLVE STILL CARRYING A SPIKE.
 * ============================================================================
 *
 * WHY IT EXISTS. `canonicalisation.ts` is the stage that removes boundary geometry too small to see
 * before the skeleton sees it, and the recursion driver runs it on every sub-region it cuts — that is
 * the mechanism by which recursion is not allowed to introduce fractal complexity. Nothing asserted
 * that the mechanism WORKED at the level it is applied. The unit suite convicts the predicate on
 * hand-authored rings; the census counts failures; neither says "every polygon this pipeline hands to
 * a solver is free of invisible vertices", which is the property the stage exists to create.
 *
 * IT WAS FALSE, and had been for months (journal F37, decision 100). `canonicalisation.ts` measured
 * deviation with `distanceToSegment`, whose clamp turns a FOLD — an apex whose perpendicular foot
 * overshoots the end of the chord between its neighbours — into a measurement of the fold's LENGTH
 * instead of its WIDTH. Folds therefore screened far above the floor and travelled into solves as
 * zero-area spikes. On `(seed 55433)`'s failing region `r0.10` the spike measured 3.88 times the
 * floor under the clamp and 3.3e-5 times the floor without it, and dropping it makes the region
 * solve.
 *
 * WHAT THIS SWEEP MEASURES, PRECISELY, because each choice decides cases:
 *
 *  - THE POPULATION IS THE CENSUS GRID'S. Every fixture of `FULL_CORPUS`, every node of every tree,
 *    at all three swept depths and all four merge group sizes, to `MAX_RECURSION_LEVELS`. The census
 *    and this sweep therefore talk about the same regions and a row of one can be looked up in the
 *    other by id. Every violation ever found here has been at depth 1.0, which is F35's reading of
 *    the whole failure class.
 *  - THE RING IS `canonicalBoundary`, NOT `boundary`. `boundary` is what the cutter produced and is
 *    expected to carry folds; `canonicalBoundary` is what the solve actually ran on, and is the thing
 *    the stage promises about.
 *  - THE FLOOR IS THE ROOT'S, said in the region's own unit space — `normaliseLength` of
 *    `denormaliseLength` of `SKELETON_NOISE_FLOOR`, which is the driver's own `rootNoiseFloor`
 *    restated from the published primitives rather than reached for through a seam.
 *  - A DECLINED-DEGENERATE REGION IS EXCLUDED, and this is not a loophole. The degeneracy screen runs
 *    BEFORE canonicalisation, so such a region is never canonicalised and never solved: its
 *    `canonicalBoundary` is its `boundary` by construction. Four of them on `(seed 7919)` do carry
 *    under-floor vertices, which is exactly what "declined" means — journal decision 96 accepts them.
 *    The invariant is about boundaries HANDED TO A SOLVE, and those are not.
 *  - THE MEASUREMENT COMES FROM THE SUITES' SHARED HELPERS, not from the primitive
 *    `canonicalisation.ts` calls, so a predicate and an oracle cannot be wrong together.
 *
 * MEASURED BY REVERTING THE PREDICATE, 2026-08-29 — the conviction of this whole file. Pre-fix the
 * grid carries 39 surviving spikes, every one of them on the three jitter fixtures: 19 on
 * `(seed 55433)`, 14 on `(seed 55433, k=4)`, 6 on `(seed 7919)`. They resolve to 5 distinct
 * positions, since one spike is counted again in each merge group whose cut passes through it and
 * again in the child region that inherits it. Post-fix: zero. (F37's figure of 12 is the merge group
 * 3 column of that same grid, which is the group the failing-region harvest uses.)
 *
 * THE FOLD COUNT MOVES TOO, 41 pre-fix to 24 post-fix, and that is not a contradiction: the folds
 * are counted on regions the CUTTER produced, and once the spikes stop reaching solves those solves
 * succeed, so the trees below them are different trees. The pre-fix reading is 20 / 14 / 7 across
 * the same three fixtures.
 *
 * THE ARRIVAL ORDERING THEN TOOK 24 TO {@link FOLDS_HANDED_IN} — see that constant. The predicate
 * measurement above is unaffected by it: reverting the predicate today still fires the sweep, and
 * that mutation is what convicts this file.
 */

setSkeletonLogLevel('silent');

/** The census grid's own dials, so a violation here can be looked up as a census row. */
const SWEPT_DEPTH_FRACTIONS = [0.25, 0.6, FULL_DEPTH_FRACTION];
const SWEPT_MERGE_GROUP_SIZES = [1, 2, 3, 4];

/**
 * How many folds the cutter HANDED IN across the grid, and so how much work the stage did.
 *
 * THE NON-VACUITY PIN. A sweep asserting an empty list says nothing unless the population it sweeps
 * could have been non-empty, and after the fix no fold survives anywhere — so the evidence that the
 * predicate is load-bearing has to be counted on the input side. These are vertices of a region's
 * `boundary` that the clamped predicate would have KEPT and the unclamped one removes: deviation
 * under the floor to the chord's line, at or above it to the chord's segment. Four of them, all at
 * full depth, all on `(seed 7919)` — one per merge group, on four different regions.
 *
 * TWENTY-FOUR UNTIL 2026-08-29, ON THREE FIXTURES, AND THE ARRIVAL ORDERING TOOK TWENTY OF THEM
 * (journal decision 102). A fold in a region boundary is a fold in the ROOT skeleton the cutter
 * transcribes, and the sub-visible duplicate ridges the pairwise fallback used to build by ordering a
 * collapsing ring on edge id are where they came from: pairing that ring by arrival instead empties
 * `(seed 55433)` and `(seed 55433, k=4)` of folds entirely — 20 and 14 pre-predicate-fix, then 24
 * between the three of them, now 4 on one fixture. This count is therefore a reading of the ROOT's
 * cleanliness as much as of this stage's workload, and it is expected to fall further, not rise.
 */
const FOLDS_HANDED_IN = 4;

/** One region as this sweep needs it: the ring solved, the ring cut, and the floor both were judged at. */
interface SweptRegion {
    where: string;
    solved: Vector2[];
    handedIn: Vector2[];
    floor: number;
}

/**
 * Every region of every tree in the grid, in the unit space its own solve normalised into.
 *
 * Built ONCE and shared, because the grid costs about twenty seconds to walk and the two properties
 * asked of it — that nothing invisible survives, and that something invisible was there to remove —
 * are two readings of one population rather than two sweeps.
 */
function sweepCorpus(): SweptRegion[] {
    const swept: SweptRegion[] = [];

    for (const polygon of FULL_CORPUS) {
        const rootFloor = denormaliseLength(
            makeSkeletonNormalisation(polygon.vertices), SKELETON_NOISE_FLOOR);

        for (const depthFraction of SWEPT_DEPTH_FRACTIONS) {
            for (const mergeGroupSize of SWEPT_MERGE_GROUP_SIZES) {
                const root = subdivideRecursively(polygon.vertices, {
                    levels: uniformLevelSpecs({
                        levels: MAX_RECURSION_LEVELS, mergeGroupSize, depthFraction, residue: 'recurse',
                    }),
                });

                for (const node of flattenRecursiveTree(root)) {
                    if (node.outcome.kind === 'declined-degenerate') {
                        continue;
                    }
                    const normalisation = makeSkeletonNormalisation(node.boundary);
                    swept.push({
                        where: `${polygon.name} (depth ${depthFraction}, merge group ${mergeGroupSize}) ${node.id}`,
                        solved: normalisePolygon(node.canonicalBoundary, normalisation),
                        handedIn: normalisePolygon(node.boundary, normalisation),
                        floor: normaliseLength(normalisation, rootFloor),
                    });
                }
            }
        }
    }

    return swept;
}

/** Deviation of `ring[index]` from the LINE through its cyclic neighbours, and from their SEGMENT. */
function deviationAt(ring: readonly Vector2[], index: number): {line: number; segment: number} {
    const previous = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    return {
        line: distanceToSupportingLine(ring[index], previous, next),
        segment: distanceToSegment(ring[index], previous, next),
    };
}

describe('no region reaches a solve carrying a vertex its own floor calls invisible', () => {
    let swept: SweptRegion[];

    beforeAll(() => {
        swept = sweepCorpus();
    });

    it('finds no surviving spike anywhere in the corpus\'s region trees', () => {
        const spikes: string[] = [];

        for (const region of swept) {
            // A ring the floor could not reduce further is reported as it stands rather than skipped:
            // three vertices is the stage's hard stop, so a spike there would be a real one the
            // recursion is knowingly shipping, and this sweep should say so.
            for (let index = 0; index < region.solved.length; index++) {
                const {line, segment} = deviationAt(region.solved, index);
                if (line < region.floor) {
                    spikes.push(`${region.where} v${index}: ${line.toExponential(2)} off its chord line `
                        + `(${segment.toExponential(2)} off the segment) against a floor of `
                        + `${region.floor.toExponential(2)}`);
                }
            }
        }

        expect(spikes).toEqual([]);
    });

    it('is not vacuous: the cutter hands in folds that only the unclamped predicate removes', () => {
        // The conviction of the segment-versus-line choice at corpus scale, and the companion to
        // `canonicalisation.test.ts`'s two hand-authored folds. Each of these vertices was screened
        // ABOVE the floor by the predicate this stage used to carry and is removed by the one it
        // carries now, so the empty list above is a cure rather than a sweep that finds nothing.
        const folds = swept.flatMap(region => {
            const found: string[] = [];
            for (let index = 0; index < region.handedIn.length; index++) {
                const {line, segment} = deviationAt(region.handedIn, index);
                if (line < region.floor && segment >= region.floor) {
                    found.push(`${region.where} v${index}`);
                }
            }
            return found;
        });

        expect(folds).toHaveLength(FOLDS_HANDED_IN);
    });

    it('confines the folds to one jitter fixture, at full depth', () => {
        // The character of the population rather than its size, and the statement that the fold class
        // is the jitter class: no other fixture in the corpus produces one, and none is produced at a
        // partial depth. F35 read the same confinement from the failure census.
        //
        // IT WAS ALL THREE JITTER FIXTURES UNTIL 2026-08-29. The arrival ordering (journal decision
        // 102) removed both reflex Ls from this population outright — the assertion is written as the
        // exact list rather than a subset so that either of them returning is a failure here.
        const fixtures = new Set<string>();
        const depths = new Set<string>();

        for (const region of swept) {
            for (let index = 0; index < region.handedIn.length; index++) {
                const {line, segment} = deviationAt(region.handedIn, index);
                if (line < region.floor && segment >= region.floor) {
                    fixtures.add(region.where.slice(0, region.where.indexOf(' (depth')));
                    depths.add(/depth ([\d.]+)/.exec(region.where)?.[1] ?? '');
                }
            }
        }

        expect([...fixtures].toSorted()).toEqual([
            'Off-edge Jitter Plus (seed 7919)',
        ]);
        expect([...depths]).toEqual(['1']);
    });
});
