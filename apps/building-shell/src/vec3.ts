// The app's vector arithmetic, in one place (journal decision 94, N2; decision 100, N7 for the 2D cross).
import type {Vec2} from 'manifold-3d';
import type {Vec3} from './tags.ts';

/** Vertex `v`'s point in a flat xyz array: the app's one point reader (journal decision 145, B3). */
export const pointAt = (P: ArrayLike<number>, v: number): Vec3 => [P[3 * v], P[3 * v + 1], P[3 * v + 2]];

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

/** A straight segment between two points. */
export type Segment = [Vec3, Vec3];

/** Distance from `p` to segment `s` (journal decision 145, B4: the app's one copy). */
export function segmentDistance(p: Vec3, [a, b]: Segment): number {
  const ab = sub3(b, a);
  const L2 = dot3(ab, ab);
  const t = L2 ? Math.max(0, Math.min(1, dot3(sub3(p, a), ab) / L2)) : 0;
  return dist3(add3(a, scale3(ab, t)), p);
}

/** The point of triangle `a`, `b`, `c` nearest `p` (Ericson, Real-Time Collision Detection, 5.1.5). */
export function nearestOnTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = sub3(b, a), ac = sub3(c, a), ap = sub3(p, a);
  const d1 = dot3(ab, ap), d2 = dot3(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub3(p, b), d3 = dot3(ab, bp), d4 = dot3(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add3(a, scale3(ab, d1 / (d1 - d3)));
  const cp = sub3(p, c), d5 = dot3(ab, cp), d6 = dot3(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add3(a, scale3(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add3(b, scale3(sub3(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return add3(a, add3(scale3(ab, vb * denom), scale3(ac, vc * denom)));
}

/** The nearest points of segments `p`-`q` and `r`-`s`, first on `p`-`q` (Ericson, 5.1.9). */
export function nearestOnSegments(p: Vec3, q: Vec3, r: Vec3, s: Vec3): Segment {
  const d1 = sub3(q, p), d2 = sub3(s, r), w = sub3(p, r);
  const a = dot3(d1, d1), e = dot3(d2, d2), f = dot3(d2, w);
  const clamp = (x: number): number => Math.max(0, Math.min(1, x));
  let u: number, v: number;
  if (a === 0 && e === 0) return [p, r];
  if (a === 0) { u = 0; v = clamp(f / e); } else {
    const c = dot3(d1, w);
    if (e === 0) { v = 0; u = clamp(-c / a); } else {
      const b = dot3(d1, d2), den = a * e - b * b;
      u = den !== 0 ? clamp((b * f - c * e) / den) : 0;
      v = (b * u + f) / e;
      if (v < 0) { v = 0; u = clamp(-c / a); } else if (v > 1) { v = 1; u = clamp((b - c) / a); }
    }
  }
  return [add3(p, scale3(d1, u)), add3(r, scale3(d2, v))];
}
