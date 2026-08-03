import {
    jointAngleAt,
    isPoseValid,
    isPoseNoWorse,
    linkDistanceViolation,
    jointAngleViolation,
    ARTICULATION_EPSILON,
} from '../../src/articulation/validity';
import type { ElementConstraints } from '../../src/articulation/types';
import type { Vector2 } from '../../src/shared/types';

const straight: Vector2[] = [0, 1, 2, 3].map((y) => ({ x: 0, y }));
const none: ElementConstraints[] = straight.map(() => ({}));

describe('jointAngleAt', () => {
    it('is 0 along a straight chain', () => {
        expect(jointAngleAt(straight, 1)).toBeCloseTo(0, 9);
        expect(jointAngleAt(straight, 2)).toBeCloseTo(0, 9);
    });
    it('is null at chain ends', () => {
        expect(jointAngleAt(straight, 0)).toBeNull();
        expect(jointAngleAt(straight, 3)).toBeNull();
    });
    it('is CCW-positive for a left turn', () => {
        // walking +x then turning up (+y) is a CCW (positive) turn
        const bent: Vector2[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
        expect(jointAngleAt(bent, 1)).toBeCloseTo(Math.PI / 2, 9);
    });
    it('is null when a segment is degenerate', () => {
        const dup: Vector2[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];
        expect(jointAngleAt(dup, 1)).toBeNull();
    });
});

describe('isPoseValid', () => {
    it('accepts any pose when unconstrained', () => {
        expect(isPoseValid(straight, none)).toBe(true);
    });
    it('enforces distanceToPrev', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[1] = { distanceToPrev: { min: 2, max: 3 } }; // actual distance is 1
        expect(isPoseValid(straight, c)).toBe(false);
        c[1] = { distanceToPrev: { min: 0.5, max: 1.5 } };
        expect(isPoseValid(straight, c)).toBe(true);
    });
    it('enforces distanceToNext on the same link (intersection semantics)', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[0] = { distanceToNext: { min: 2, max: 3 } }; // link (0,1) has length 1
        expect(isPoseValid(straight, c)).toBe(false);
    });
    it('enforces jointAngle bounds', () => {
        const bent: Vector2[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]; // +PI/2 at 1
        const c: ElementConstraints[] = bent.map(() => ({}));
        c[1] = { jointAngle: { min: -Math.PI / 4, max: Math.PI / 4 } };
        expect(isPoseValid(bent, c)).toBe(false);
        c[1] = { jointAngle: { min: 0, max: Math.PI } };
        expect(isPoseValid(bent, c)).toBe(true);
    });
    it('treats min > max as unsatisfiable', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[1] = { distanceToPrev: { min: 2, max: 0.5 } };
        expect(isPoseValid(straight, c)).toBe(false);
    });
    it('tolerates epsilon-scale violations', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[1] = { distanceToPrev: { min: 1 + ARTICULATION_EPSILON / 2, max: 2 } };
        expect(isPoseValid(straight, c)).toBe(true);
    });
    it('ignores jointAngle constraints on end elements', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[0] = { jointAngle: { min: 1, max: 2 } };
        expect(isPoseValid(straight, c)).toBe(true);
    });
});

describe('linkDistanceViolation', () => {
    it('is zero when the link is unconstrained', () => {
        expect(linkDistanceViolation(straight, none, 0)).toBe(0);
    });
    it('is zero when the length lies inside the bounds', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[1] = { distanceToPrev: { min: 0.5, max: 1.5 } }; // link (0,1) is 1 long
        expect(linkDistanceViolation(straight, c, 0)).toBe(0);
    });
    it('measures the shortfall below the minimum', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[1] = { distanceToPrev: { min: 2.5, max: 3 } };
        expect(linkDistanceViolation(straight, c, 0)).toBeCloseTo(1.5, 9);
    });
    it('measures the excess above the maximum', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[1] = { distanceToPrev: { min: 0, max: 0.25 } };
        expect(linkDistanceViolation(straight, c, 0)).toBeCloseTo(0.75, 9);
    });
    it('reports the worse of the two endpoints, so the tighter bound governs', () => {
        const tightOnUpperEndpoint = straight.map(() => ({} as ElementConstraints));
        tightOnUpperEndpoint[0] = { distanceToNext: { min: 0, max: 0.75 } }; // exceeded by 0.25
        tightOnUpperEndpoint[1] = { distanceToPrev: { min: 0, max: 0.25 } }; // exceeded by 0.75
        expect(linkDistanceViolation(straight, tightOnUpperEndpoint, 0)).toBeCloseTo(0.75, 9);

        const tightOnLowerEndpoint = straight.map(() => ({} as ElementConstraints));
        tightOnLowerEndpoint[0] = { distanceToNext: { min: 0, max: 0.25 } };
        tightOnLowerEndpoint[1] = { distanceToPrev: { min: 0, max: 0.75 } };
        expect(linkDistanceViolation(straight, tightOnLowerEndpoint, 0)).toBeCloseTo(0.75, 9);
    });
    it('is zero for an endpoint whose own bound holds while the other fails', () => {
        const c = straight.map(() => ({} as ElementConstraints));
        c[0] = { distanceToNext: { min: 0.5, max: 1.5 } };
        expect(linkDistanceViolation(straight, c, 1)).toBe(0);
    });
});

describe('jointAngleViolation', () => {
    const bent: Vector2[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]; // +PI/2 at 1

    it('is zero when the joint is unconstrained', () => {
        expect(jointAngleViolation(bent, bent.map(() => ({})), 1)).toBe(0);
    });
    it('is zero when the angle lies inside the bounds', () => {
        const c: ElementConstraints[] = bent.map(() => ({}));
        c[1] = { jointAngle: { min: 0, max: Math.PI } };
        expect(jointAngleViolation(bent, c, 1)).toBe(0);
    });
    it('measures the excess above the maximum', () => {
        const c: ElementConstraints[] = bent.map(() => ({}));
        c[1] = { jointAngle: { min: -Math.PI / 4, max: Math.PI / 4 } };
        expect(jointAngleViolation(bent, c, 1)).toBeCloseTo(Math.PI / 4, 9);
    });
    it('measures the shortfall below the minimum', () => {
        const c: ElementConstraints[] = bent.map(() => ({}));
        c[1] = { jointAngle: { min: Math.PI * 0.75, max: Math.PI } };
        expect(jointAngleViolation(bent, c, 1)).toBeCloseTo(Math.PI / 4, 9);
    });
    it('is zero where the angle is degenerate or absent', () => {
        const c: ElementConstraints[] = bent.map(() => ({ jointAngle: { min: 1, max: 2 } }));
        expect(jointAngleViolation(bent, c, 0)).toBe(0);
        const duplicated: Vector2[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];
        expect(jointAngleViolation(duplicated, c, 1)).toBe(0);
    });
});

describe('isPoseNoWorse', () => {
    const overstretched = straight.map(() => ({} as ElementConstraints));
    overstretched[1] = { distanceToPrev: { min: 0, max: 0.25 } };
    const pulledApart: Vector2[] = [{ x: 0, y: 0 }, { x: 0, y: 3 }, { x: 0, y: 4 }, { x: 0, y: 5 }];
    const pulledTogether: Vector2[] = [{ x: 0, y: 0 }, { x: 0, y: 0.5 }, { x: 0, y: 2 }, { x: 0, y: 3 }];

    it('accepts a candidate that reduces a violation without repairing it', () => {
        expect(isPoseValid(pulledTogether, overstretched)).toBe(false);
        expect(isPoseNoWorse(straight, pulledTogether, overstretched)).toBe(true);
    });
    it('accepts the base pose itself', () => {
        expect(isPoseNoWorse(straight, straight, overstretched)).toBe(true);
    });
    it('rejects a candidate that deepens the violation', () => {
        expect(isPoseNoWorse(straight, pulledApart, overstretched)).toBe(false);
    });
    it('reduces to absolute validity when the base pose satisfies every bound', () => {
        const satisfied = straight.map(() => ({} as ElementConstraints));
        satisfied[1] = { distanceToPrev: { min: 0.5, max: 1.5 } };
        expect(isPoseNoWorse(straight, straight, satisfied)).toBe(isPoseValid(straight, satisfied));
        expect(isPoseNoWorse(straight, pulledApart, satisfied)).toBe(isPoseValid(pulledApart, satisfied));
        expect(isPoseNoWorse(straight, pulledTogether, satisfied)).toBe(isPoseValid(pulledTogether, satisfied));
    });
});
