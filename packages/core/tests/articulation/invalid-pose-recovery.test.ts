import { solveArticulation } from '../../src/articulation/solve';
import { isPoseValid, linkDistanceViolation } from '../../src/articulation/validity';
import type { ArticulationChain, ElementConstraints } from '../../src/articulation/types';
import type { Vector2 } from '../../src/shared/types';

function overstretchedPair(): ArticulationChain {
    const elements: Vector2[] = [{ x: 0, y: 0 }, { x: 5, y: 0 }];
    const constraints: ElementConstraints[] = [{}, { distanceToPrev: { min: 1, max: 3 } }];
    return { elements, constraints };
}

describe('rigid translate that fully repairs a violated link', () => {
    const chain = overstretchedPair();
    const result = solveArticulation({
        chain,
        selection: [1],
        pivotIndex: 0,
        strategyId: 'rigid',
        delta: { kind: 'translate', vector: { x: -3, y: 0 } },
    });

    it('starts from an invalid pose', () => {
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(false);
    });
    it('applies the whole delta', () => {
        expect(result.appliedFraction).toBe(1);
        expect(result.elements[1].x).toBeCloseTo(2, 9);
    });
    it('ends absolutely valid', () => {
        expect(isPoseValid(result.elements, chain.constraints)).toBe(true);
    });
});

describe('rigid translate that only partially repairs a violated link', () => {
    const chain = overstretchedPair();
    const startingViolation = linkDistanceViolation(chain.elements, chain.constraints, 0);
    const result = solveArticulation({
        chain,
        selection: [1],
        pivotIndex: 0,
        strategyId: 'rigid',
        delta: { kind: 'translate', vector: { x: -1, y: 0 } },
    });

    it('applies the whole delta even though the pose stays invalid', () => {
        expect(result.appliedFraction).toBe(1);
        expect(result.elements[1].x).toBeCloseTo(4, 9);
        expect(isPoseValid(result.elements, chain.constraints)).toBe(false);
    });
    it('shrinks the violation it could not eliminate', () => {
        expect(startingViolation).toBeCloseTo(2, 9);
        expect(linkDistanceViolation(result.elements, chain.constraints, 0)).toBeCloseTo(1, 9);
    });
});

describe('rigid translate that a violation elsewhere in the chain does not touch', () => {
    const chain: ArticulationChain = {
        elements: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 9, y: 0 }],
        constraints: [{}, {}, {}, { distanceToPrev: { min: 1, max: 3 } }],
    };
    const startingViolation = linkDistanceViolation(chain.elements, chain.constraints, 2);
    const result = solveArticulation({
        chain,
        selection: [1],
        pivotIndex: 0,
        strategyId: 'rigid',
        delta: { kind: 'translate', vector: { x: 0, y: 1 } },
    });

    it('applies the whole delta', () => {
        expect(result.appliedFraction).toBe(1);
        expect(result.elements[1]).toEqual({ x: 1, y: 1 });
    });
    it('leaves the untouched violation exactly where it was', () => {
        expect(startingViolation).toBeCloseTo(4, 9);
        expect(linkDistanceViolation(result.elements, chain.constraints, 2)).toBeCloseTo(4, 9);
    });
});

describe('saturate translate whose boundary link starts violated', () => {
    const chain: ArticulationChain = {
        elements: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }],
        constraints: [{}, { distanceToPrev: { min: 1, max: 3 } }, {}],
    };
    const startingViolation = linkDistanceViolation(chain.elements, chain.constraints, 0);
    const result = solveArticulation({
        chain,
        selection: [1, 2],
        pivotIndex: 0,
        strategyId: 'saturate',
        delta: { kind: 'translate', vector: { x: -1, y: 0 } },
    });

    it('moves the boundary element instead of holding it back', () => {
        expect(result.elements[1].x).toBeCloseTo(4, 9);
        expect(result.elements[2].x).toBeCloseTo(5, 9);
        expect(result.appliedFraction).toBeCloseTo(1, 9);
    });
    it('shrinks the boundary violation', () => {
        expect(startingViolation).toBeCloseTo(2, 9);
        expect(linkDistanceViolation(result.elements, chain.constraints, 0)).toBeCloseTo(1, 9);
    });
});

describe('spread rotation from a violated pose', () => {
    const chain: ArticulationChain = {
        elements: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
        constraints: [{}, { distanceToPrev: { min: 3, max: 4 } }, {}],
    };
    const result = solveArticulation({
        chain,
        selection: [1, 2],
        pivotIndex: 0,
        strategyId: 'spread',
        delta: { kind: 'rotate', angle: Math.PI / 6 },
    });

    it('rotates freely because rotation about element 0 preserves every distance', () => {
        expect(result.appliedFraction).toBe(1);
        expect(result.elements[1].y).toBeGreaterThan(0);
    });
    it('does not worsen the violated link', () => {
        const before = linkDistanceViolation(chain.elements, chain.constraints, 0);
        const after = linkDistanceViolation(result.elements, chain.constraints, 0);
        expect(after).toBeLessThanOrEqual(before + 1e-6);
    });
});

describe('a delta that would worsen an existing violation is still refused', () => {
    const chain = overstretchedPair();
    const result = solveArticulation({
        chain,
        selection: [1],
        pivotIndex: 0,
        strategyId: 'rigid',
        delta: { kind: 'translate', vector: { x: 2, y: 0 } },
    });

    it('applies nothing', () => {
        expect(result.appliedFraction).toBe(0);
        expect(result.elements[1]).toEqual({ x: 5, y: 0 });
    });
});
