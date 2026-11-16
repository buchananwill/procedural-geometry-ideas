/*
 * AN EXTERIOR EDGE IS ACCEPTED ONLY ONCE ITS FACE HAS CLOSED (skeleton edge-acceptance spec, decision 21;
 * docs/notes/ISSUE-skeleton-edge-accepted-before-its-face-closes.md; BSA.F95, BSA.F99, BSA.D296).
 *
 * This file was red by design under stage 1's decision 32 and is green because the defect is gone. The solver
 * used to accept an exterior edge when any chain of accepted interior edges joined its two end nodes, and on five
 * single-loop solves that chain ran through a hub node where several faces met within the floor while a bisector
 * still traced the edge's face. The bisector that would have closed that ring was then refused for its accepted
 * parent, and the ring was left with two neighbours whose parents do not meet. The edge is now accepted exactly
 * when no live bisector names it as a parent, asked at step boundaries only, and no birth is refused for an
 * accepted parent.
 *
 * Two kinds of case. The two complete sweep cells the issue reproduced hold W1 to W4 at every step boundary and
 * still complete. And every roster the standing gate runs is swept for the cause itself, which can no longer hold
 * at a boundary: no solve of any roster accepts an exterior edge a live bisector still names.
 */
import type {AlgorithmStepInput, StraightSkeletonSolverContext} from '@proc-geo/core';
import {checkWavefront, setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';
import {setWavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront-check';
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
