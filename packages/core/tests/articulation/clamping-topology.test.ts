import { clampToValid, CLAMP_BISECTION_DEPTH } from '../../src/articulation/clamping';
import { isContiguous, splitSpans } from '../../src/articulation/topology';
import type { Vector2 } from '../../src/shared/types';

describe('clampToValid', () => {
    // 1-D probe: pose is a single point moving +x by t * 10
    const poseAt = (t: number): Vector2[] => [{ x: t * 10, y: 0 }];

    it('returns t=1 when the full delta is valid', () => {
        const r = clampToValid(poseAt, () => true);
        expect(r.t).toBe(1);
        expect(r.elements[0].x).toBeCloseTo(10, 9);
    });
    it('bisects to the largest valid t', () => {
        const isValid = (els: Vector2[]) => els[0].x <= 4; // valid iff t <= 0.4
        const r = clampToValid(poseAt, isValid);
        expect(r.t).toBeLessThanOrEqual(0.4);
        expect(r.t).toBeGreaterThan(0.4 - 1 / 2 ** CLAMP_BISECTION_DEPTH);
        expect(isValid(r.elements)).toBe(true);
    });
    it('returns identity (t=0) when even tiny deltas are invalid', () => {
        const r = clampToValid(poseAt, (els) => els[0].x <= -1);
        expect(r.t).toBe(0);
        expect(r.elements[0].x).toBe(0);
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
