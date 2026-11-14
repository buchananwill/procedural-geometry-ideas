/*
 * RED BY DESIGN (skeleton wavefront-order spec, decision 32; BSA.F95, BSA.D290, BSA.D266, BSA.D293).
 *
 * An exterior edge accepted while a live bisector still names it as a parent. The new bisector that would
 * close that bisector's ring is then refused for its accepted parent, and the ring is left with two
 * neighbours whose parents do not meet: W1 to W4 cannot hold without changing when an edge is accepted,
 * which is not stage 1's work. This file asserts what SHOULD hold, and stays red until the defect is fixed —
 * see docs/notes/ISSUE-skeleton-edge-accepted-before-its-face-closes.md.
 *
 * Two kinds of case. The two complete sweep cells the issue reproduces are asserted to hold W1 to W4 at
 * every step boundary. And every roster decision 15's gate runs is swept for the cause itself: each case
 * asserts that no solve of its roster accepts an exterior edge a live bisector still names, so its failure
 * NAMES every solve the gate excludes, complete or not. The gates exclude such a solve by its cause, only
 * from the boundary at which the cause first holds, and never by a list of names.
 */
import type {AlgorithmStepInput, StraightSkeletonSolverContext} from '@proc-geo/core';
import {checkWavefront, setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';
import {setWavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront';
import {allCells} from '../sweep-harness/sweep';
import {
    CENSUS_DEPTH_FRACTIONS,
    censusRoster,
    corpusRoster,
    RosterEntry,
    runRoster,
    sweepRoster,
} from './wavefront-probe-helpers';

setSkeletonLogLevel('silent');

const EARLY_ACCEPTANCE_CELLS = ['fine:circle48@200000000000', 'ladder:1x:s2'];

describe('the wavefront links on a solve whose edge is accepted before its face closes', () => {
    jest.setTimeout(30 * 60 * 1000);

    it.each(EARLY_ACCEPTANCE_CELLS)('%s holds W1 to W4 at every step boundary', name => {
        const cell = allCells().find(candidate => candidate.name === name);
        expect(cell).toBeDefined();
        const violations: string[] = [];
        let step = 0;
        setWavefrontProbe({
            stepBoundary: (context: StraightSkeletonSolverContext, inputs: readonly AlgorithmStepInput[]) => {
                violations.push(...checkWavefront(context, inputs).map(violation => `step ${step}: ${violation}`));
                step++;
            },
        });
        let complete: boolean;
        try {
            complete = solveSkeleton(cell!.vertices, cell!.options).complete;
        } finally {
            setWavefrontProbe(null);
        }
        expect(complete).toBe(true);
        expect(violations).toEqual([]);
    });

    const rosters: [string, () => RosterEntry[]][] = [
        ['FULL_CORPUS at 1e-6 and 1e-5 and the weighted fixtures', corpusRoster],
        ['the 642-cell sweep', sweepRoster],
        ...CENSUS_DEPTH_FRACTIONS.map((depthFraction): [string, () => RosterEntry[]] => [
            `the recursion census at depth ${depthFraction}`,
            () => censusRoster(depthFraction, {regions: 0, screened: 0}),
        ]),
    ];

    it.each(rosters)('no solve of %s accepts an exterior edge a live bisector still names', (_title, roster) => {
        const report = runRoster(roster());
        expect(report.earlyAcceptanceSolves.map(solve =>
            `${solve.complete ? 'complete' : 'incomplete'} ${solve.label} from step ${solve.fromStep}: ${solve.detail}`))
            .toEqual([]);
    });
});
