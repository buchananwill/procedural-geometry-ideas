/*
 * THE WAVEFRONT'S STORED ORDER OVER THE RECURSION CENSUS (skeleton wavefront-order spec, decisions 15 and
 * 23): `checkWavefront` at every step boundary of every solve the census grid runs — the root and every
 * region of `FULL_CORPUS` × merge groups 1–4 × depths 0.25 / 0.6 / 1 at three levels, residue recursed — up
 * to the boundary at which decision 32's cause first holds. Every region is counted: each is one solve,
 * except one screened out as degenerate before any solve ran. See `wavefront-order.test.ts`.
 */
import {setSkeletonLogLevel} from '@proc-geo/core';
import {
    CENSUS_DEPTH_FRACTIONS,
    CensusTally,
    censusRoster,
    describeReport,
    runRoster,
    unacceptedFaceFindings,
    unaccountedEntries,
} from './wavefront-probe-helpers';

setSkeletonLogLevel('silent');

describe('the wavefront links over the recursion census', () => {
    jest.setTimeout(30 * 60 * 1000);

    it.each(CENSUS_DEPTH_FRACTIONS)('hold W1 to W4 at every step boundary of every region solve at depth %s', depthFraction => {
        const tally: CensusTally = {regions: 0, screened: 0};
        const roster = censusRoster(depthFraction, tally);
        const report = runRoster(roster);
        // eslint-disable-next-line no-console
        console.log(describeReport(
            `the recursion census at depth ${depthFraction} (${tally.regions} regions, ${tally.screened} screened)`, report));
        expect(report.entries).toHaveLength(roster.length);
        expect(unaccountedEntries(report)).toEqual([]);
        expect(report.solves).toBe(tally.regions - tally.screened);
        expect(report.violations).toEqual([]);
        // Edge-acceptance spec, decision 9: a face that never closes is signalled.
        expect(unacceptedFaceFindings(report)).toEqual({complete: [], unsignalled: []});
    });
});
