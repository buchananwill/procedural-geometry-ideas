// The app's vector arithmetic, in one place (journal decision 94, N2; decision 100, N7 for the 2D cross).
import type {Vec2} from 'manifold-3d';
import type {Vec3} from './tags.ts';

export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** The 2D cross product: positive when `b` turns counter-clockwise from `a`. */
export const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
