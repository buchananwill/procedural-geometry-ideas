/*
 * Driver for the full-grid sweep harness (see README.md). SKIPPED unless `SWEEP_OUT` is set,
 * so the normal suite never runs it; with it set, every group and region depth is written
 * under that prefix. Kept as a jest test so the harness compiles with the suite's own
 * module mapping and stays honest against the tree.
 */
import {runRegions, runSweep} from './sweep';

const OUT = process.env.SWEEP_OUT;
const describeIfRequested = OUT ? describe : describe.skip;

describeIfRequested('full-grid sweep harness', () => {
    jest.setTimeout(60 * 60 * 1000);

    it.each(['corpus', 'fine', 'offedge', 'alongedge', 'ladder', 'regular'])('sweeps %s', group => {
        runSweep(`${OUT}-${group}.json`, group);
    });

    it.each([
        [0.25, 'd0.25'],
        [0.6, 'd0.6'],
        [1, 'd1'],
    ])('sweeps the census regions at depth %s', (depthFraction, tag) => {
        runRegions(`${OUT}-regions-${tag}.json`, depthFraction, tag);
    });
});
