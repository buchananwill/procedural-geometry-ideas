import {
    flattenRecursiveTree,
    FULL_DEPTH_FRACTION,
    MAX_RECURSION_LEVELS,
    setSkeletonLogLevel,
    SKELETON_NOISE_FLOOR,
    solveSkeleton,
    subdivideRecursively,
    uniformLevelSpecs,
    Vector2,
} from '@proc-geo/core';
import {
    OFF_EDGE_JITTER_L_SEED_15838,
    OFF_EDGE_JITTER_L_SEED_55433,
    OFF_EDGE_JITTER_PLUS_SEED_7919,
} from '@proc-geo/test-fixtures';

import {JITTER_DOUBLE_REFLEX_PLUS, JITTER_REFLEX_L, jitterSweep} from './jitter-helpers';
import {escapedNodes} from './containment-helpers';

/*
 * ============================================================================
 *  A RECORDED DEFECT, PINNED AS IT STANDS. Read this before "fixing" a failure here.
 * ============================================================================
 *
 * `along-edge-jitter.test.ts` re-measured backlog item 2 and closed it: jitter ALONG a reflex
 * shape's edge lines is 0/80 in the default configuration at every magnitude, because on-line
 * samples deviate from their chord by float noise and canonicalisation removes them all.
 *
 * THE SAME SWEEP FOUND THE FAILURE HAD NOT DIED — IT HAD MOVED, AND IT MOVED INTO THE COLUMN THE
 * BACKLOG USES AS ITS CONTROL. Item 2 states that jitter with an off-edge component passes 80/80.
 * That is true far from the noise floor and false near it. At an off-edge magnitude of 1e-3 caller
 * units on a 300-unit shape the reflex L fails 22 of 80 cells and the double-reflex plus 46 of 80,
 * WITH THE DEFAULT SOLVER OPTIONS. This file is that failure pinned, and the three fixtures it
 * names are `packages/test-fixtures/src/near-floor-jitter.ts`.
 *
 * ----------------------------------------------------------------------------
 * WHY 1e-3 AND NOT SOME OTHER MAGNITUDE: A BAND, NOT A THRESHOLD
 * ----------------------------------------------------------------------------
 *
 * The noise floor is a unit-space constant and these shapes normalise by 256, so 1e-3 caller units
 * of off-edge displacement is about 3.9e-6 in unit space — a few times the 1e-6 floor. Large enough
 * to survive canonicalisation, small enough that the polygon is still near-degenerate. A decade
 * either side is quiet: at 1e-6 the stage removes the perturbation outright (0/80), and at 0.1 the
 * shape is ordinarily non-degenerate (1/80 on each). Measured over the five-magnitude sweep, with
 * the stage on:
 *
 *     magnitude   1e-9    1e-6    1e-3    0.1     1.0
 *     reflex L    0/80    0/80   22/80   1/80    0/80
 *     plus        0/80    0/80   46/80   1/80    0/80
 *
 * AND THE STAGE IS NOT WHAT CAUSES IT. The same sweep with `{noiseFloor: 0}` — the solver as it
 * behaved before the stage existed — is worse rather than better, and stays bad a further three
 * decades down, where the stage-on column has gone quiet:
 *
 *     magnitude   1e-9    1e-6    1e-3    0.1     1.0
 *     reflex L   10/80   20/80   30/80   1/80    0/80
 *     plus        0/80   69/80   53/80   1/80    0/80
 *
 * So canonicalisation is buying real ground here (69/80 down to 0/80 at 1e-6, for instance) and runs
 * out of it at 1e-3, where the perturbation clears the floor. The defect is the solver's, in the same
 * near-degenerate regime backlog items 2, 3 and 7 all sit in; the floor only sets where it starts.
 *
 * THIS IS THE REGIME THE BACKLOG ITEM SAYS MATTERS: "a real hand-drawn L-shaped or cross-shaped
 * region. Real strokes are near-degenerate, not exactly so." The pipeline as it stands still does
 * not reach it — smoothing, RDP and Schneider fitting destroy this geometry, and simulated strokes
 * score 288/288 — so this is a bound on the solver, not a broken feature.
 *
 * ----------------------------------------------------------------------------
 * EVERY FAILURE HERE IS SIGNALLED, NEVER A SILENT WRONG ANSWER
 * ----------------------------------------------------------------------------
 *
 * All three fixtures come back `complete: false` with `step-failure` followed by `unresolved-edges`.
 * That matters more than the count: the worst failure mode a result type has is a wrong skeleton
 * that reports success, and this class is not it. A consumer checking `complete` sees the problem.
 *
 * ----------------------------------------------------------------------------
 * WHAT TO DO WHEN A CELL STARTS PASSING
 * ----------------------------------------------------------------------------
 *
 * These assertions are the CURRENT behaviour, asserted exactly, and they fire in both
 * directions. If a fixture starts solving: promote it into `ALL_TEST_POLYGONS` in
 * `packages/test-fixtures/src/index.ts`, delete its block here, rewrite the fixture's header as a
 * passing record, and re-measure the two sweep counts — a fix that reaches one of these three
 * almost certainly moves 22/80 and 46/80 as well. If a count SHRINKS without a fixture flipping,
 * something helped and the account above needs re-measuring. If anything GROWS, the regime
 * regressed. Do not adjust a number here to make the suite green.
 *
 * ----------------------------------------------------------------------------
 * 2026-08-28: MOST OF THE CLASS IS CURED, AND THE PROMOTION RULE ABOVE IS BLOCKED, NOT IGNORED
 * ----------------------------------------------------------------------------
 *
 * Journal decision 70 made `addBisectionEdge` choose a bisector's direction by its OFFSET RATE and
 * demoted `approximateDirection` to an anti-parallel tie-break, so a bisector can no longer be
 * flipped to run backwards through the wavefront. Re-measured, all three counts moved the good way,
 * and the two reflex-L fixtures now SOLVE:
 *
 *     magnitude 1e-3, stage on   before   after
 *     reflex L                    22/80    1/80
 *     double-reflex plus          46/80   13/80
 *
 * The rule above says to promote a fixture that starts solving, and BOTH L FIXTURES MEET THAT
 * CRITERION — they solve completely, and no node of either escapes its polygon. They are still not
 * promoted, and the reason is measured rather than preferred: the recursive-subdivision census over
 * `ALL_TEST_POLYGONS` must stand at zero recorded failures, and across its own grid (three depths ×
 * four merge groups × three levels) `OFF_EDGE_JITTER_L_SEED_15838` yields 5 failed nodes and
 * `OFF_EDGE_JITTER_L_SEED_55433` yields 10. They solve as ROOTS and still defeat the driver as
 * REGIONS, which is the half of decision 67's class that survives. Enrolling them would take the
 * census from 0 to 15 and turn a live defect into corpus noise.
 *
 * So they stay here, visibly pinned, with their blocks rewritten to assert the BETTER behaviour
 * exactly — nothing is laundered out under journal decision 53, and a regression back to a failing
 * root fires here. The promotion needs the lead's ruling, not this file's.
 */

setSkeletonLogLevel('silent');

/*
 * SLOW ON PURPOSE, and for the same reason as `along-edge-jitter.test.ts`: an off-edge magnitude
 * above the floor leaves every inserted sample standing, so the plus's k = 10 cells are 120-vertex
 * solves. Measuring fewer cells would stop the counts being comparable to the 2026-08-09 record.
 */
jest.setTimeout(10 * 60 * 1000);

/** The magnitude that lands just above the unit-space noise floor. See the header. */
const NEAR_FLOOR_MAGNITUDE = 1e-3;

const OFF_EDGE = true;

function diagnosticKinds(polygon: Vector2[]): string[] {
    return solveSkeleton(polygon).diagnostics.map(diagnostic => diagnostic.kind);
}

/**
 * How many regions the recursive driver cuts out of this polygon and then cannot solve.
 *
 * THE MEASUREMENT THAT HOLDS THESE FIXTURES OUT OF THE CORPUS now that they solve as roots, so it
 * is asserted rather than described. Swept over the grid the corpus census itself uses — the three
 * depth fractions and the four merge group sizes of `recursive-subdivision.test.ts` — because that
 * census is the bar the promotion would have to clear, and a count measured on any other grid would
 * not be about it.
 */
function subdivisionFailures(polygon: Vector2[]): number {
    let failures = 0;
    for (const depthFraction of [0.25, 0.6, FULL_DEPTH_FRACTION]) {
        for (const mergeGroupSize of [1, 2, 3, 4]) {
            const levels = uniformLevelSpecs({
                levels: MAX_RECURSION_LEVELS, mergeGroupSize, depthFraction, residue: 'recurse',
            });
            const tree = subdivideRecursively(polygon, {levels});
            failures += flattenRecursiveTree(tree).filter(node => node.failure !== undefined).length;
        }
    }
    return failures;
}

describe('off-edge jitter just above the noise floor: the recorded defect', () => {
    it('fails 1 of 80 cells on the reflex L, at the default noise floor', () => {
        // Was 22 of 80 on counts [3,5,6,7,8,9,10] before journal decision 70. See the header.
        expect(jitterSweep(JITTER_REFLEX_L, NEAR_FLOOR_MAGNITUDE, OFF_EDGE, SKELETON_NOISE_FLOOR))
            .toEqual({failed: 1, failingCounts: [2]});
    });

    it('fails 13 of 80 cells on the double-reflex plus, at the default noise floor', () => {
        // Was 46 of 80 on counts [2,3,4,5,6,7,8,9,10] before journal decision 70. The plus keeps
        // more of the class than the L because its facing walls are exactly parallel whatever the
        // jitter does, which is a degeneracy the direction rule does not address.
        expect(jitterSweep(JITTER_DOUBLE_REFLEX_PLUS, NEAR_FLOOR_MAGNITUDE, OFF_EDGE, SKELETON_NOISE_FLOOR))
            .toEqual({failed: 13, failingCounts: [2, 4, 6, 7, 8, 9, 10]});
    });
});

describe('OFF_EDGE_JITTER_L_SEED_55433: the specimen of the class', () => {
    /*
     * The one fixture canonicalisation does not touch. Its value WAS that it foreclosed the easy
     * misreading of the other two — that what fails is a ring left ragged by partial removal.
     * Nothing is removed here: all eighteen vertices are above the floor.
     *
     * IT NOW SOLVES (journal decision 70), and it is pinned solving so that it cannot quietly stop.
     * What it still cannot do is survive being SUBDIVIDED, which is why it is not in the corpus;
     * see the header.
     */

    it('loses no vertex to canonicalisation, and now solves completely', () => {
        const result = solveSkeleton(OFF_EDGE_JITTER_L_SEED_55433);

        expect(OFF_EDGE_JITTER_L_SEED_55433).toHaveLength(18);
        expect(result.graph.numExteriorNodes).toBe(18);
        expect(result.complete).toBe(true);
        expect(result.diagnostics).toEqual([]);
    });

    it('keeps every skeleton node inside its polygon', () => {
        // The solve completing is only half the claim, and the deformed peanuts are why the other
        // half is asserted: a bisector that escapes the boundary reports `complete: true` too.
        expect(escapedNodes(OFF_EDGE_JITTER_L_SEED_55433)).toEqual([]);
    });

    it('still defeats the recursive driver as a region, which is what holds it out of the corpus', () => {
        expect(subdivisionFailures(OFF_EDGE_JITTER_L_SEED_55433)).toBe(10);
    });

    it('is still the reflex L to within a thousandth of a unit', () => {
        // The premise the whole measurement rests on, made checkable: this is a resampling of the
        // fixture, not a different shape. Every original corner is present exactly, and every
        // inserted sample sits within the jitter magnitude of the edge it was placed on.
        for (const corner of JITTER_REFLEX_L) {
            expect(OFF_EDGE_JITTER_L_SEED_55433).toContainEqual(corner);
        }
        for (const vertex of OFF_EDGE_JITTER_L_SEED_55433) {
            expect(distanceToBoundary(vertex, JITTER_REFLEX_L)).toBeLessThan(2e-3);
        }
    });
});

describe('the two fixtures canonicalisation reaches', () => {
    it('OFF_EDGE_JITTER_L_SEED_15838 loses three samples and now solves', () => {
        const result = solveSkeleton(OFF_EDGE_JITTER_L_SEED_15838);

        expect(OFF_EDGE_JITTER_L_SEED_15838).toHaveLength(18);
        expect(result.graph.numExteriorNodes).toBe(15);
        // Solves since journal decision 70; the canonicalisation diagnostic is the only one left,
        // and it reports a removal rather than a failure. See the header for why it stays here.
        expect(result.complete).toBe(true);
        expect(diagnosticKinds(OFF_EDGE_JITTER_L_SEED_15838)).toEqual(['vertices-canonicalised']);
    });

    it('OFF_EDGE_JITTER_L_SEED_15838 keeps every skeleton node inside its polygon', () => {
        expect(escapedNodes(OFF_EDGE_JITTER_L_SEED_15838)).toEqual([]);
    });

    it('OFF_EDGE_JITTER_L_SEED_15838 still defeats the recursive driver as a region', () => {
        expect(subdivisionFailures(OFF_EDGE_JITTER_L_SEED_15838)).toBe(5);
    });

    it('OFF_EDGE_JITTER_PLUS_SEED_7919 loses four samples and then fails', () => {
        const result = solveSkeleton(OFF_EDGE_JITTER_PLUS_SEED_7919);

        expect(OFF_EDGE_JITTER_PLUS_SEED_7919).toHaveLength(24);
        expect(result.graph.numExteriorNodes).toBe(20);
        expect(result.complete).toBe(false);
        expect(diagnosticKinds(OFF_EDGE_JITTER_PLUS_SEED_7919))
            .toEqual(['vertices-canonicalised', 'step-failure', 'unresolved-edges']);
        expect(result.diagnostics.at(-1)?.detail)
            .toBe('2 interior edge(s) finished without a target node: 44, 58.');
    });

    it('discards deviations just UNDER the floor, which is what makes these near-degenerate', () => {
        // The whole defect in two numbers. Both fixtures were jittered by the same 1e-3, and what
        // separates a removed sample from a surviving one is a draw landing either side of a
        // deviation of about 1e-6 in unit space. The survivors sit a hair above it.
        for (const fixture of [OFF_EDGE_JITTER_L_SEED_15838, OFF_EDGE_JITTER_PLUS_SEED_7919]) {
            const detail = solveSkeleton(fixture).diagnostics[0].detail;
            const discarded = Number(/largest discarded deviation ([\d.e-]+)\./.exec(detail)?.[1]);

            expect(discarded).toBeGreaterThan(1e-7);
            expect(discarded).toBeLessThan(SKELETON_NOISE_FLOOR);
        }
    });
});

/** Distance from `point` to the closest edge of the closed ring `polygon`. */
function distanceToBoundary(point: Vector2, polygon: Vector2[]): number {
    let closest = Infinity;
    for (let index = 0; index < polygon.length; index++) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const lengthSquared = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
        closest = Math.min(closest, Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy)));
    }
    return closest;
}
