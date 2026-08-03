import type { Vector2 } from '../shared/types';
import type { ElementConstraints, MinMax } from './types';
import { crossV, dotV, distV, lenV, subV } from './geometry';

export const ARTICULATION_EPSILON = 1e-6;

/**
 * Signed turning angle at element i between (p[i]-p[i-1]) and (p[i+1]-p[i]),
 * CCW positive, in (-PI, PI]. Null at chain ends or when a segment is
 * degenerate (constraint cannot be evaluated).
 */
export function jointAngleAt(elements: Vector2[], i: number): number | null {
    if (i <= 0 || i >= elements.length - 1) return null;
    const vIn = subV(elements[i], elements[i - 1]);
    const vOut = subV(elements[i + 1], elements[i]);
    if (lenV(vIn) < ARTICULATION_EPSILON || lenV(vOut) < ARTICULATION_EPSILON) return null;
    return Math.atan2(crossV(vIn, vOut), dotV(vIn, vOut));
}

function boundHolds(value: number, bound: MinMax): boolean {
    return value >= bound.min - ARTICULATION_EPSILON && value <= bound.max + ARTICULATION_EPSILON;
}

/**
 * Distance bounds on the link between `lowerIndex` and `lowerIndex + 1`. The
 * link is governed by BOTH endpoints' constraints (intersection semantics).
 */
export function linkDistanceHolds(
    elements: Vector2[],
    constraints: ElementConstraints[],
    lowerIndex: number,
): boolean {
    const distance = distV(elements[lowerIndex], elements[lowerIndex + 1]);
    const prevBound = constraints[lowerIndex + 1]?.distanceToPrev;
    if (prevBound && !boundHolds(distance, prevBound)) return false;
    const nextBound = constraints[lowerIndex]?.distanceToNext;
    if (nextBound && !boundHolds(distance, nextBound)) return false;
    return true;
}

/** Joint-angle bound at one element; vacuously true where it cannot be evaluated. */
export function jointAngleHolds(
    elements: Vector2[],
    constraints: ElementConstraints[],
    index: number,
): boolean {
    const bound = constraints[index]?.jointAngle;
    if (!bound) return true;
    const angle = jointAngleAt(elements, index);
    if (angle === null) return true;
    return boundHolds(angle, bound);
}

/**
 * Shared validity predicate: true iff every enabled bound holds. Validity is a
 * property of the data, never of the strategy.
 */
export function isPoseValid(elements: Vector2[], constraints: ElementConstraints[]): boolean {
    for (let lowerIndex = 0; lowerIndex < elements.length - 1; lowerIndex++) {
        if (!linkDistanceHolds(elements, constraints, lowerIndex)) return false;
    }
    for (let index = 1; index < elements.length - 1; index++) {
        if (!jointAngleHolds(elements, constraints, index)) return false;
    }
    return true;
}
