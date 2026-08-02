import { jointAngleAt, isPoseValid, ARTICULATION_EPSILON } from '../../src/articulation/validity';
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
