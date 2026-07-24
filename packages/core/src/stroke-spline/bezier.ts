import type { Vector2 } from '../straight-skeleton/types';
import type { CubicBezier } from './types';

export function evaluateCubicBezier(seg: CubicBezier, t: number): Vector2 {
    const mt = 1 - t;
    const b0 = mt * mt * mt;
    const b1 = 3 * mt * mt * t;
    const b2 = 3 * mt * t * t;
    const b3 = t * t * t;
    return {
        x: b0 * seg.p0.x + b1 * seg.p1.x + b2 * seg.p2.x + b3 * seg.p3.x,
        y: b0 * seg.p0.y + b1 * seg.p1.y + b2 * seg.p2.y + b3 * seg.p3.y,
    };
}

/** Degree-2 Bezier evaluation, used for the derivative of a cubic. */
function evaluateQuadratic(p0: Vector2, p1: Vector2, p2: Vector2, t: number): Vector2 {
    const mt = 1 - t;
    const b0 = mt * mt;
    const b1 = 2 * mt * t;
    const b2 = t * t;
    return {
        x: b0 * p0.x + b1 * p1.x + b2 * p2.x,
        y: b0 * p0.y + b1 * p1.y + b2 * p2.y,
    };
}

export function cubicBezierDerivative(seg: CubicBezier, t: number): Vector2 {
    return evaluateQuadratic(
        { x: 3 * (seg.p1.x - seg.p0.x), y: 3 * (seg.p1.y - seg.p0.y) },
        { x: 3 * (seg.p2.x - seg.p1.x), y: 3 * (seg.p2.y - seg.p1.y) },
        { x: 3 * (seg.p3.x - seg.p2.x), y: 3 * (seg.p3.y - seg.p2.y) },
        t,
    );
}

export function cubicBezierSecondDerivative(seg: CubicBezier, t: number): Vector2 {
    const q0 = { x: 6 * (seg.p2.x - 2 * seg.p1.x + seg.p0.x), y: 6 * (seg.p2.y - 2 * seg.p1.y + seg.p0.y) };
    const q1 = { x: 6 * (seg.p3.x - 2 * seg.p2.x + seg.p1.x), y: 6 * (seg.p3.y - 2 * seg.p2.y + seg.p1.y) };
    return {
        x: (1 - t) * q0.x + t * q1.x,
        y: (1 - t) * q0.y + t * q1.y,
    };
}
