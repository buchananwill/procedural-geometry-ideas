/*
 * RED BY DESIGN (skeleton wavefront-order spec, decision 32; BSA.F95, BSA.D290, BSA.D266).
 *
 * Two complete sweep cells on which an exterior edge is accepted while a live bisector still names it as
 * a parent. The new bisector that would close that bisector's ring is then refused for its accepted
 * parent, and the ring is left with two neighbours whose parents do not meet: W1 to W4 cannot hold
 * without changing when an edge is accepted, which is not stage 1's work. This test asserts what SHOULD
 * hold, and stays red until the defect is fixed — see
 * docs/notes/ISSUE-skeleton-edge-accepted-before-its-face-closes.md. Decision 15's gates exclude such a
 * solve by its cause, not by these names.
 */
import type {AlgorithmStepInput, StraightSkeletonSolverContext} from '@proc-geo/core';
import {checkWavefront, setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';
import {setWavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront';
import {allCells} from '../sweep-harness/sweep';

setSkeletonLogLevel('silent');

const EARLY_ACCEPTANCE_CELLS = ['fine:circle48@200000000000', 'ladder:1x:s2'];

describe('the wavefront links on a solve whose edge is accepted before its face closes', () => {
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
});
