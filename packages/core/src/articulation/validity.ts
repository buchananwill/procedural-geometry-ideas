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
 * Shared validity predicate: true iff every enabled bound holds. A link is
 * governed by BOTH endpoints' constraints (intersection semantics). Validity
 * is a property of the data, never of the strategy.
 */
export function isPoseValid(elements: Vector2[], constraints: ElementConstraints[]): boolean {
    for (let i = 1; i < elements.length; i++) {
        const d = distV(elements[i - 1], elements[i]);
        const prevBound = constraints[i]?.distanceToPrev;
        if (prevBound && !boundHolds(d, prevBound)) return false;
        const nextBound = constraints[i - 1]?.distanceToNext;
        if (nextBound && !boundHolds(d, nextBound)) return false;
    }
    for (let i = 1; i < elements.length - 1; i++) {
        const bound = constraints[i]?.jointAngle;
        if (!bound) continue;
        const angle = jointAngleAt(elements, i);
        if (angle === null) continue;
        if (!boundHolds(angle, bound)) return false;
    }
    return true;
}
