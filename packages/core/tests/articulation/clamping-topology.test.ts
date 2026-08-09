import { CLAMP_RESOLUTION, clampToValid } from '../../src/articulation/clamping';
import { isContiguous, splitSpans } from '../../src/articulation/topology';
import type { Vector2 } from '../../src/shared/types';

describe('clampToValid', () => {
    // 1-D probe: pose is a single point moving +x by t * 10, so the predicate
    // can recover the step fraction it is being asked about as x / 10.
    const poseAt = (t: number): Vector2[] => [{ x: t * 10, y: 0 }];
    const fractionOf = (elements: Vector2[]): number => elements[0].x / 10;

    it('returns t=1 when the full delta is valid', () => {
        const r = clampToValid(poseAt, () => true);
        expect(r.t).toBe(1);
        expect(r.elements[0].x).toBeCloseTo(10, 9);
    });
    it('finds the largest valid t of a monotone valid prefix', () => {
        const isValid = (els: Vector2[]) => els[0].x <= 4; // valid iff t <= 0.4
        const r = clampToValid(poseAt, isValid);
        expect(r.t).toBeLessThanOrEqual(0.4);
        expect(r.t).toBeGreaterThan(0.4 - CLAMP_RESOLUTION);
        expect(isValid(r.elements)).toBe(true);
    });
    it('returns identity (t=0) when even tiny deltas are invalid', () => {
        const r = clampToValid(poseAt, (els) => els[0].x <= -1);
        expect(r.t).toBe(0);
        expect(r.elements[0].x).toBe(0);
    });
    it('reaches the topmost island of a disconnected valid set', () => {
        const isValid = (els: Vector2[]) => {
            const fraction = fractionOf(els);
            return fraction <= 0.1 || (fraction >= 0.6 && fraction <= 0.8);
        };
        const r = clampToValid(poseAt, isValid);
        expect(r.t).toBeLessThanOrEqual(0.8);
        expect(r.t).toBeGreaterThan(0.8 - CLAMP_RESOLUTION);
        expect(isValid(r.elements)).toBe(true);
    });
    it('accepts a valid set that is the single point t=1', () => {
        const r = clampToValid(poseAt, (els) => fractionOf(els) === 1);
        expect(r.t).toBe(1);
        expect(r.elements[0].x).toBe(10);
    });
    it('finds a valid prefix narrower than the coarse pitch', () => {
        const bound = 0.005; // below 1/64, so only the k=0 coarse sample is valid
        const isValid = (els: Vector2[]) => fractionOf(els) <= bound;
        const r = clampToValid(poseAt, isValid);
        expect(r.t).toBeGreaterThan(0);
        expect(r.t).toBeGreaterThan(bound - CLAMP_RESOLUTION);
        expect(r.t).toBeLessThanOrEqual(bound);
    });
    it('lands within CLAMP_RESOLUTION of an analytic linear bound', () => {
        const bound = 1 / 3;
        const r = clampToValid(poseAt, (els) => fractionOf(els) <= bound);
        expect(r.t).toBeLessThanOrEqual(bound);
        expect(r.t).toBeGreaterThan(bound - CLAMP_RESOLUTION);
    });
    it('leaves the accepted fraction plus CLAMP_RESOLUTION on a tested invalid fraction', () => {
        // The attribution invariant saturate's cascade relies on when it decides
        // which boundary pairs stop: that sum must reproduce a searched fraction
        // bit-exactly, not merely approximately, so at least one boundary
        // predicate provably fails there.
        const testedInvalidFractions = new Set<number>();
        let requestedFraction = 0;
        const recordingPoseAt = (t: number): Vector2[] => {
            requestedFraction = t;
            return poseAt(t);
        };
        const isValid = (els: Vector2[]) => {
            const fraction = fractionOf(els);
            const valid = fraction <= 0.1 || (fraction >= 0.6 && fraction <= 0.8);
            if (!valid) testedInvalidFractions.add(requestedFraction);
            return valid;
        };
        const r = clampToValid(recordingPoseAt, isValid);
        expect(r.t).toBeLessThan(1);
        expect(testedInvalidFractions.has(r.t + CLAMP_RESOLUTION)).toBe(true);
    });
});

describe('isContiguous', () => {
    it('accepts single runs and rejects gaps', () => {
        expect(isContiguous([2])).toBe(true);
        expect(isContiguous([1, 2, 3])).toBe(true);
        expect(isContiguous([1, 3, 5])).toBe(false);
        expect(isContiguous([])).toBe(true);
    });
});

describe('splitSpans', () => {
    it('pivot outside selection: one span walking away from pivot', () => {
        expect(splitSpans([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
        expect(splitSpans([1, 2, 3], 5)).toEqual([[3, 2, 1]]);
    });
    it('pivot inside selection: two spans, pivot excluded, each walking outward', () => {
        expect(splitSpans([1, 2, 3, 4, 5], 3)).toEqual([[2, 1], [4, 5]]);
    });
    it('pivot at selection edge: single outward span', () => {
        expect(splitSpans([3, 4, 5], 3)).toEqual([[4, 5]]);
    });
    it('selection is only the pivot: no spans', () => {
        expect(splitSpans([3], 3)).toEqual([]);
    });
});
