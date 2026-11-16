/*
 * THE PAIRWISE FALLBACK NUMBERS WHAT IT RESOLVES BY PLACE, NOT BY EDGE ID (BSA.D335 stage 2).
 *
 * Two events of one moment that share no bisector consume no common edge, so the order they are resolved in decides no
 * pairing, only which node is created first. The fallback used to take them in edge-id order; it now takes them by place
 * (`inPlaceOrder`: leftmost, then lowest, in unit space), and the edge ids decide only between events at one point.
 *
 * THE CELL is the sweep harness's `alongedge:L:k2:s15838`: the reflex L with each edge cut in two by a sample jittered
 * along it, solved with canonicalisation off. Its arm collapses in one fallback layer onto two nodes on the ridge
 * y = 175. Measured: by place the left one (x ≈ 249.2) is created first; by edge id the right one (x ≈ 324.2) was. The
 * skeleton is the same either way, every node position bit-identical; only the two ids swap.
 */
import {setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';
import {clockwise, JITTER_REFLEX_L, jitteredSamples} from './jitter-helpers';

setSkeletonLogLevel('silent');

describe('the pairwise fallback numbers what it resolves by place (BSA.D335 stage 2)', () => {
    it('creates the left of two ridge nodes of one fallback layer first', () => {
        const result = solveSkeleton(jitteredSamples(clockwise(JITTER_REFLEX_L), 2, 15838, 1.0, false), {noiseFloor: 0});
        const onRidge = (x: number) => result.graph.nodes.filter(node =>
            Math.abs(node.position.y - 175) < 1e-6 && Math.abs(node.position.x - x) < 0.01);

        const [left] = onRidge(249.19);
        const [right] = onRidge(324.22);
        expect(left).toBeDefined();
        expect(right).toBeDefined();
        expect(left.id).toBeLessThan(right.id);
    });
});
