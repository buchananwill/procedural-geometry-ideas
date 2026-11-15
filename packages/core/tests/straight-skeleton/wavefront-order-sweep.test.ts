/*
 * THE WAVEFRONT'S STORED ORDER OVER THE 642-CELL SWEEP (skeleton wavefront-order spec, decisions 15 and 23):
 * `checkWavefront` at every step boundary of every root cell of the full-grid sweep harness, up to the
 * boundary at which decision 32's cause first holds. Every cell is counted. See `wavefront-order.test.ts`
 * for the corpus.
 */
import {setSkeletonLogLevel} from '@proc-geo/core';
import {
    describeReport,
    runRoster,
    sweepRoster,
    unacceptedFaceFindings,
    unaccountedEntries,
} from './wavefront-probe-helpers';

setSkeletonLogLevel('silent');

describe('the wavefront links over the 642-cell sweep', () => {
    jest.setTimeout(30 * 60 * 1000);

    it('hold W1 to W4 at every step boundary of every cell that solves completely', () => {
        const roster = sweepRoster();
        expect(roster).toHaveLength(642);
        const report = runRoster(roster);
        // eslint-disable-next-line no-console
        console.log(describeReport('the 642-cell sweep', report));
        expect(report.entries).toHaveLength(roster.length);
        expect(unaccountedEntries(report)).toEqual([]);
        expect(report.violations).toEqual([]);
        // Edge-acceptance spec, decision 9: a face that never closes is signalled.
        expect(unacceptedFaceFindings(report)).toEqual({complete: [], unsignalled: []});
    });
});
