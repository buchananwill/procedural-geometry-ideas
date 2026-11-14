/*
 * THE WAVEFRONT'S STORED ORDER OVER THE RECURSION CENSUS (skeleton wavefront-order spec, decisions 15 and
 * 23): `checkWavefront` at every step boundary of every solve the census grid runs — the root and every
 * region of `FULL_CORPUS` × merge groups 1–4 × depths 0.25 / 0.6 / 1 at three levels, residue recursed —
 * outside decision 32's path. See `wavefront-order.test.ts`.
 */
import {
    FULL_DEPTH_FRACTION,
    flattenRecursiveTree,
    MAX_RECURSION_LEVELS,
    setSkeletonLogLevel,
    subdivideRecursively,
    uniformLevelSpecs,
} from '@proc-geo/core';
import {FULL_CORPUS} from '@proc-geo/test-fixtures';
import {describeReport, emptyReport, withWavefrontProbe} from './wavefront-probe-helpers';

setSkeletonLogLevel('silent');

const DEPTH_FRACTIONS = [0.25, 0.6, FULL_DEPTH_FRACTION];
const MERGE_GROUP_SIZES = [1, 2, 3, 4];

describe('the wavefront links over the recursion census', () => {
    jest.setTimeout(30 * 60 * 1000);

    it.each(DEPTH_FRACTIONS)('hold W1 to W4 at every step boundary of every region solve at depth %s', depthFraction => {
        const report = emptyReport();
        let label = '';
        let regions = 0;
        withWavefrontProbe(report, () => label, () => {
            for (const mergeGroupSize of MERGE_GROUP_SIZES) {
                for (const fixture of FULL_CORPUS) {
                    label = `${fixture.name}|d${depthFraction}|m${mergeGroupSize}`;
                    const root = subdivideRecursively(fixture.vertices, {
                        levels: uniformLevelSpecs({
                            levels: MAX_RECURSION_LEVELS, mergeGroupSize, depthFraction, residue: 'recurse',
                        }),
                    });
                    regions += flattenRecursiveTree(root).length;
                }
            }
        });
        // eslint-disable-next-line no-console
        console.log(describeReport(`the recursion census at depth ${depthFraction} (${regions} regions)`, report));
        expect(report.solves).toBeGreaterThan(0);
        expect(report.violations).toEqual([]);
    });
});
