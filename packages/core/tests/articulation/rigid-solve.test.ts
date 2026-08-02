import { solveArticulation } from '../../src/articulation/solve';
import { jointAngleAt } from '../../src/articulation/validity';
import { distV } from '../../src/articulation/geometry';
import type { ArticulationChain, SolveInput } from '../../src/articulation/types';
import type { Vector2 } from '../../src/shared/types';

const PI_OVER_THREE = Math.PI / 3;

function verticalChain(): ArticulationChain {
    const elements: Vector2[] = [0, 1, 2, 3, 4, 5].map((y) => ({ x: 0, y }));
    return { elements, constraints: elements.map(() => ({})) };
}

function rotateInput(chain: ArticulationChain, overrides: Partial<SolveInput> = {}): SolveInput {
    return {
        chain,
        selection: [1, 2, 3],
        pivotIndex: 0,
        strategyId: 'rigid',
        delta: { kind: 'rotate', angle: PI_OVER_THREE },
        ...overrides,
    };
}

describe('rigid rotation (spec worked example)', () => {
    const chain = verticalChain();
    const result = solveArticulation(rotateInput(chain));
    const p = result.elements;

    it('applies the full delta when unconstrained', () => {
        expect(result.appliedFraction).toBe(1);
    });
    it('rotates selected elements about the pivot position', () => {
        // (0,1) rotated CCW by PI/3 about origin -> (-sin60, cos60)
        expect(p[1].x).toBeCloseTo(-Math.sin(PI_OVER_THREE), 9);
        expect(p[1].y).toBeCloseTo(Math.cos(PI_OVER_THREE), 9);
    });
    it('preserves pivot-to-selected distances', () => {
        [1, 2, 3].forEach((i) => expect(distV(p[0], p[i])).toBeCloseTo(i, 9));
    });
    it('preserves intra-selection distances and joint angles', () => {
        expect(distV(p[1], p[2])).toBeCloseTo(1, 9);
        expect(distV(p[2], p[3])).toBeCloseTo(1, 9);
        expect(jointAngleAt(p, 1)).toBeCloseTo(0, 9);
        expect(jointAngleAt(p, 2)).toBeCloseTo(0, 9);
    });
    it('leaves unselected elements unmoved; boundary distance [3,4] changes', () => {
        expect(p[0]).toEqual({ x: 0, y: 0 });
        expect(p[4]).toEqual({ x: 0, y: 4 });
        expect(p[5]).toEqual({ x: 0, y: 5 });
        expect(distV(p[3], p[4])).not.toBeCloseTo(1, 2);
    });
    it('does not mutate the input chain', () => {
        expect(chain.elements[1]).toEqual({ x: 0, y: 1 });
    });
});

describe('rigid clamping', () => {
    it('clamps to the largest valid same-direction delta', () => {
        const chain = verticalChain();
        // Joint at element 4 forms between links (3,4) and (4,5); rotating
        // [1,2,3] bends the joint at 3 and 4. Constrain joint 4 tightly.
        chain.constraints[4] = { jointAngle: { min: -0.1, max: 0.1 } };
        const result = solveArticulation(rotateInput(chain));
        expect(result.appliedFraction).toBeGreaterThan(0);
        expect(result.appliedFraction).toBeLessThan(1);
        const angle = jointAngleAt(result.elements, 4)!;
        expect(Math.abs(angle)).toBeLessThanOrEqual(0.1 + 1e-6);
    });
    it('returns identity when the starting pose is already invalid', () => {
        const chain = verticalChain();
        chain.constraints[1] = { distanceToPrev: { min: 5, max: 6 } };
        const result = solveArticulation(rotateInput(chain));
        expect(result.appliedFraction).toBe(0);
        expect(result.elements).toEqual(chain.elements);
    });
});

describe('translation (strategy-independent, rigid-unit)', () => {
    it('moves the selection as a unit for every strategy id', () => {
        for (const strategyId of ['rigid', 'spread', 'saturate'] as const) {
            const chain = verticalChain();
            const result = solveArticulation(rotateInput(chain, {
                strategyId,
                delta: { kind: 'translate', vector: { x: 2, y: 0 } },
            }));
            expect(result.elements[2]).toEqual({ x: 2, y: 2 });
            expect(result.elements[4]).toEqual({ x: 0, y: 4 });
            expect(result.appliedFraction).toBe(1);
        }
    });
    it('clamps translation against distance constraints', () => {
        const chain = verticalChain();
        // link (0,1) must stay <= 2 long; translating [1,2,3] by +x 5 stretches it
        chain.constraints[1] = { distanceToPrev: { min: 0, max: 2 } };
        const result = solveArticulation(rotateInput(chain, {
            delta: { kind: 'translate', vector: { x: 5, y: 0 } },
        }));
        expect(result.appliedFraction).toBeLessThan(1);
        expect(distV(result.elements[0], result.elements[1])).toBeLessThanOrEqual(2 + 1e-6);
    });
});

describe('degenerate inputs and fallbacks', () => {
    it('empty selection, zero delta, or short chain are identity', () => {
        const chain = verticalChain();
        expect(solveArticulation(rotateInput(chain, { selection: [] })).elements).toEqual(chain.elements);
        expect(solveArticulation(rotateInput(chain, { delta: { kind: 'rotate', angle: 0 } })).elements).toEqual(chain.elements);
        const tiny: ArticulationChain = { elements: [{ x: 0, y: 0 }], constraints: [{}] };
        expect(solveArticulation(rotateInput(tiny, { selection: [0] })).elements).toEqual(tiny.elements);
    });
    it('out-of-range indices are dropped / identity, never a throw', () => {
        const chain = verticalChain();
        expect(solveArticulation(rotateInput(chain, { selection: [99] })).elements).toEqual(chain.elements);
        expect(solveArticulation(rotateInput(chain, { pivotIndex: 99 })).elements).toEqual(chain.elements);
    });
    it('discontiguous selection uses rigid semantics regardless of strategy id', () => {
        const chain = verticalChain();
        const result = solveArticulation(rotateInput(chain, { selection: [1, 3, 5], strategyId: 'spread' }));
        // rigid: each selected element rotated about pivot; distances to pivot preserved
        [1, 3, 5].forEach((i) => expect(distV(result.elements[0], result.elements[i])).toBeCloseTo(i, 9));
        expect(result.elements[2]).toEqual({ x: 0, y: 2 });
    });
});
