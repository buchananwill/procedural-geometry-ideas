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
        selection: [2, 3, 4],
        pivotIndex: 0,
        strategyId: 'saturate',
        delta: { kind: 'rotate', angle: PI_OVER_THREE },
        ...overrides,
    };
}

describe('saturate rotation (spec worked example)', () => {
    // Joint [0,1,2] (at element 1) limited to PI/9; selection [2,3,4], pivot 0.
    const chain = verticalChain();
    chain.constraints[1] = { jointAngle: { min: -PI_OVER_NINE, max: PI_OVER_NINE } };
    const result = solveArticulation(input(chain));
    const p = result.elements;

    it('saturates the constrained joint (within bisection resolution)', () => {
        const angle = Math.abs(jointAngleAt(p, 1)!);
        expect(angle).toBeLessThanOrEqual(PI_OVER_NINE + 1e-6);
        expect(angle).toBeGreaterThan(PI_OVER_NINE - 0.05);
    });
    it('preserves pivot-to-first-selected distance and unselected links', () => {
        expect(distV(p[0], p[2])).toBeCloseTo(2, 6);
        expect(distV(p[0], p[1])).toBeCloseTo(1, 9);
        expect(p[1]).toEqual({ x: 0, y: 1 }); // unselected, never moves
    });
    it('passes the surplus to the rest of the selection about element 2', () => {
        // 3 and 4 stay rigid relative to each other and to 2
        expect(distV(p[2], p[3])).toBeCloseTo(1, 6);
        expect(distV(p[3], p[4])).toBeCloseTo(1, 6);
        // the recursion actually moved them beyond the phase-1 rigid pose:
        // joint at 2 absorbed surplus, so it is decidedly non-zero
        expect(Math.abs(jointAngleAt(p, 2)!)).toBeGreaterThan(0.05);
    });
    it('consumes (nearly) the whole delta across the recursion', () => {
        expect(result.appliedFraction).toBeGreaterThan(0.9);
    });
    it('element 5 stays unmoved', () => {
        expect(p[5]).toEqual({ x: 0, y: 5 });
    });
    it('reports the saturated element as frozen', () => {
        expect(result.appliedStrategyId).toBe('saturate');
        expect(result.frozenElementIndices).toEqual([2]);
    });
});

describe('saturate rotation peels one element per saturated joint', () => {
    // Joints at elements 1 and 2 both limited to PI/9: element 2 saturates joint 1
    // and becomes the rotation centre, then element 3 saturates joint 2.
    const chain = verticalChain();
    chain.constraints[1] = { jointAngle: { min: -PI_OVER_NINE, max: PI_OVER_NINE } };
    chain.constraints[2] = { jointAngle: { min: -PI_OVER_NINE, max: PI_OVER_NINE } };
    const result = solveArticulation(input(chain));

    it('names the peeled elements in the order they stopped', () => {
        expect(result.frozenElementIndices).toEqual([2, 3]);
    });
    it('leaves the last selected element carrying the remainder', () => {
        expect(Math.abs(jointAngleAt(result.elements, 3)!)).toBeGreaterThan(0.05);
    });
});

describe('saturate rotation about a pivot inside the selection', () => {
    // Selection straddles pivot 2, so splitSpans yields the descending span
    // below the pivot before the ascending span above it. A span turning
    // rigidly about the pivot can only change the joint at the pivot itself,
    // so that is the joint each span saturates, peeling its near element.
    const chain = verticalChain();
    chain.constraints[2] = { jointAngle: { min: -PI_OVER_NINE, max: PI_OVER_NINE } };
    const result = solveArticulation(input(chain, { selection: [0, 1, 2, 3, 4], pivotIndex: 2 }));

    it('reports each span\'s peeled elements, below-span first', () => {
        expect(result.frozenElementIndices).toEqual([1, 3]);
    });
});

describe('saturate full saturation discards the remainder', () => {
    it('stops once every selected element is saturated', () => {
        const chain = verticalChain();
        chain.constraints[1] = { jointAngle: { min: -PI_OVER_NINE, max: PI_OVER_NINE } };
        // single selected element: once joint 1 saturates there is nothing to recurse into
        const result = solveArticulation(input(chain, { selection: [2] }));
        expect(result.appliedFraction).toBeLessThan(1);
        const angle = Math.abs(jointAngleAt(result.elements, 1)!);
        expect(angle).toBeLessThanOrEqual(PI_OVER_NINE + 1e-6);
        expect(result.frozenElementIndices).toEqual([2]);
    });
});

describe('saturate without constraints degrades to rigid', () => {
    it('matches the rigid pose when nothing saturates', () => {
        const chain = verticalChain();
        const sat = solveArticulation(input(chain));
        const rig = solveArticulation(input(verticalChain(), { strategyId: 'rigid' }));
        sat.elements.forEach((pt, i) => {
            expect(pt.x).toBeCloseTo(rig.elements[i].x, 9);
            expect(pt.y).toBeCloseTo(rig.elements[i].y, 9);
        });
        expect(sat.appliedFraction).toBe(1);
        expect(sat.appliedStrategyId).toBe('saturate');
        expect(sat.frozenElementIndices).toEqual([]);
    });
});
