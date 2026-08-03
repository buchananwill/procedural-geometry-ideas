import { solveArticulation } from '../../src/articulation/solve';
import { jointAngleAt } from '../../src/articulation/validity';
import { distV } from '../../src/articulation/geometry';
import type { ArticulationChain, SolveInput } from '../../src/articulation/types';
import type { Vector2 } from '../../src/shared/types';

const PI_OVER_THREE = Math.PI / 3;
const PI_OVER_NINE = Math.PI / 9;

function verticalChain(): ArticulationChain {
    const elements: Vector2[] = [0, 1, 2, 3, 4, 5].map((y) => ({ x: 0, y }));
    return { elements, constraints: elements.map(() => ({})) };
}

function input(chain: ArticulationChain, overrides: Partial<SolveInput> = {}): SolveInput {
    return {
        chain,
        selection: [1, 2, 3],
        pivotIndex: 0,
        strategyId: 'spread',
        delta: { kind: 'rotate', angle: PI_OVER_THREE },
        ...overrides,
    };
}

describe('spread rotation (spec worked example)', () => {
    const chain = verticalChain();
    const result = solveArticulation(input(chain));
    const p = result.elements;

    it('applies the full delta when unconstrained', () => {
        expect(result.appliedFraction).toBe(1);
    });
    it('reports the spread strategy and freezes nothing', () => {
        expect(result.appliedStrategyId).toBe('spread');
        expect(result.frozenElementIndices).toEqual([]);
    });
    it('rotates element 1 by delta/3 about the pivot', () => {
        expect(p[1].x).toBeCloseTo(-Math.sin(PI_OVER_NINE), 9);
        expect(p[1].y).toBeCloseTo(Math.cos(PI_OVER_NINE), 9);
    });
    it('sets joint angles at 1 and 2 to delta/3 each', () => {
        expect(jointAngleAt(p, 1)).toBeCloseTo(PI_OVER_NINE, 9);
        expect(jointAngleAt(p, 2)).toBeCloseTo(PI_OVER_NINE, 9);
    });
    it('preserves selected-neighbour distances', () => {
        expect(distV(p[0], p[1])).toBeCloseTo(1, 9);
        expect(distV(p[1], p[2])).toBeCloseTo(1, 9);
        expect(distV(p[2], p[3])).toBeCloseTo(1, 9);
    });
    it('does not move unselected elements 4 and 5', () => {
        expect(p[4]).toEqual({ x: 0, y: 4 });
        expect(p[5]).toEqual({ x: 0, y: 5 });
    });
    it('lets boundary distance [3,4] change', () => {
        expect(distV(p[3], p[4])).not.toBeCloseTo(1, 2);
    });
});

describe('spread with a gap between pivot and selection', () => {
    it('counts only pairs whose second element is selected', () => {
        const chain = verticalChain();
        // pivot 0, selection [2,3]: pairs (1,2) and (2,3) qualify -> divisor 2
        const result = solveArticulation(input(chain, { selection: [2, 3] }));
        const p = result.elements;
        // element 1 unselected: unmoved; distance (1,2) preserved (last
        // unselected to first selected)
        expect(p[1]).toEqual({ x: 0, y: 1 });
        expect(distV(p[1], p[2])).toBeCloseTo(1, 9);
        expect(jointAngleAt(p, 2)).toBeCloseTo(PI_OVER_THREE / 2, 9);
    });
});

describe('spread clamping keeps the divisor fixed', () => {
    it('halved delta still spreads over the same pairs', () => {
        const chain = verticalChain();
        // Constrain joint 1 so only half the per-pair share fits.
        chain.constraints[1] = { jointAngle: { min: -PI_OVER_NINE / 2, max: PI_OVER_NINE / 2 } };
        const result = solveArticulation(input(chain));
        const p = result.elements;
        expect(result.appliedFraction).toBeLessThan(1);
        expect(result.appliedFraction).toBeGreaterThan(0);
        // Every qualifying pair still gets an equal share: joints 1 and 2 stay equal.
        expect(jointAngleAt(p, 1)).toBeCloseTo(jointAngleAt(p, 2)!, 6);
    });
    it('names no frozen element, because spread clamps the whole selection at once', () => {
        const chain = verticalChain();
        chain.constraints[1] = { jointAngle: { min: -PI_OVER_NINE / 2, max: PI_OVER_NINE / 2 } };
        const result = solveArticulation(input(chain));
        expect(result.appliedStrategyId).toBe('spread');
        expect(result.frozenElementIndices).toEqual([]);
    });
});

describe('spread with pivot inside the selection', () => {
    it('applies the full delta independently to both spans', () => {
        const chain = verticalChain();
        const result = solveArticulation(input(chain, { selection: [1, 2, 3], pivotIndex: 2 }));
        const p = result.elements;
        // below span [1]: one qualifying pair (2,1) -> element 1 rotates by
        // the full delta about the pivot
        expect(distV(p[2], p[1])).toBeCloseTo(1, 9);
        expect(p[1]).not.toEqual({ x: 0, y: 1 });
        // above span [3]: one qualifying pair (2,3)
        expect(distV(p[2], p[3])).toBeCloseTo(1, 9);
        expect(p[3]).not.toEqual({ x: 0, y: 3 });
        // pivot itself does not move
        expect(p[2]).toEqual({ x: 0, y: 2 });
    });
});
