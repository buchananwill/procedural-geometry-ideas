// The app's vector arithmetic, in one place (journal decision 94, N2; decision 100, N7 for the 2D cross).
import type {Vec2} from 'manifold-3d';
import type {Vec3} from './tags.ts';

export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dist3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** The 2D cross product: positive when `b` turns counter-clockwise from `a`. */
export const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
/** `u` scaled to unit length (journal decision 107, N13). */
export const unit3 = (u: Vec3): Vec3 => {
  const L = Math.hypot(...u);
  return [u[0] / L, u[1] / L, u[2] / L];
};

/** Where `p`'s foot falls on the line through `a` and `b`, as a fraction of `a` to `b` (0 at `a`, 1 at `b`). */
export function lineParam(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub3(b, a);
  return dot3(sub3(p, a), ab) / dot3(ab, ab);
}

/** Distance from `p` to the point at fraction `t` of `a` to `b`: `p`'s offset from the line, when `t` is its foot. */
export function lineOffset(p: Vec3, a: Vec3, b: Vec3, t: number): number {
  const ab = sub3(b, a), ap = sub3(p, a);
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
}

/**
 * Distance from `p` to the line through `a` and `b`, or to `a` itself when the two coincide: the app's one copy (the
 * type review of WP3.3 to WP3.5, N14).
 */
export function lineDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub3(b, a);
  if (dot3(ab, ab) === 0) return Math.hypot(...sub3(p, a));
  return lineOffset(p, a, b, lineParam(p, a, b));
}
