/*
 * THE WAVEFRONT'S STORED ORDER, PART A, OVER THE 642-CELL SWEEP (skeleton wavefront-order spec, decision
 * 15): `checkWavefront` at every step boundary of every root cell of the full-grid sweep harness, with the
 * four comparisons of decision 16 recorded and printed. See `wavefront-order.test.ts` for the corpus.
 */
import {setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';
import {allCells} from '../sweep-harness/sweep';
import {describeReport, emptyReport, withWavefrontProbe} from './wavefront-probe-helpers';

setSkeletonLogLevel('silent');

describe('the wavefront links over the 642-cell sweep', () => {
    jest.setTimeout(30 * 60 * 1000);

    it('hold W1 to W4 at every step boundary of every cell that solves completely', () => {
        const cells = allCells();
        expect(cells).toHaveLength(642);
        const report = emptyReport();
        let label = '';
        withWavefrontProbe(report, () => label, () => {
            for (const cell of cells) {
                label = cell.name;
                try {
                    solveSkeleton(cell.vertices, cell.options);
                } catch {
                    // A cell refused at the boundary stage runs no solve; the harness records it the same way.
                }
            }
        });
        // eslint-disable-next-line no-console
        console.log(describeReport('the 642-cell sweep', report));
        expect(report.violations).toEqual([]);
    });
});
