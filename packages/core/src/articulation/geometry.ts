import type { Vector2 } from '../shared/types';

export const addV = (a: Vector2, b: Vector2): Vector2 => ({ x: a.x + b.x, y: a.y + b.y });
export const subV = (a: Vector2, b: Vector2): Vector2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scaleV = (v: Vector2, k: number): Vector2 => ({ x: v.x * k, y: v.y * k });
export const lenV = (v: Vector2): number => Math.hypot(v.x, v.y);
export const distV = (a: Vector2, b: Vector2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const crossV = (a: Vector2, b: Vector2): number => a.x * b.y - a.y * b.x;
export const dotV = (a: Vector2, b: Vector2): number => a.x * b.x + a.y * b.y;

/** Rotate point p about center by angle (radians, CCW positive). */
export function rotateAbout(p: Vector2, center: Vector2, angle: number): Vector2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}
