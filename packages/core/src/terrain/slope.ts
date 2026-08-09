import type { Vector2 } from '../shared/types';
import type { Vector3 } from './types';

/**
 * Slope read off a surface normal.
 *
 * ## Why the normal and never a height difference
 *
 * Slope could be had by sampling two nearby heights and dividing. Nothing here does that, and
 * nothing downstream should.
 *
 * The reason is that this code is a rehearsal for C++ inside Unreal, where the terrain is a voxel
 * field and `MultiQueryVoxelLayer` returns the normal alongside the height for free — it comes out
 * of the density-field gradient the mesher already computed. Differencing heights instead would
 * produce a *different number*: it depends on the step size chosen, it is a secant where the normal
 * is a tangent, and it disagrees with the normal by more the rougher the terrain gets. Two
 * implementations of the same buildability rule would then disagree about which lots are buildable,
 * and the disagreement would be worst exactly where it matters, on the steep ground near the
 * threshold.
 *
 * So the normal is the single source of truth for slope on both sides of the port. Every function
 * here is a closed-form read of one normal, with no sampling, no step size, and no tuning.
 *
 * ## Conventions
 *
 * `z` is up and `x`/`y` span the horizontal plane. For a height field `z = f(x, y)` the upward unit
 * normal is `normalize(-df/dx, -df/dy, 1)`, so the horizontal part of the normal points **downhill**
 * and its magnitude relative to `normal.z` is the gradient. Both facts are used below.
 */

/**
 * Below this horizontal normal magnitude a surface is treated as flat and its aspect as undefined.
 *
 * A flat surface genuinely has no downhill direction: `atan2(0, 0)` returns `0`, which would report
 * "downhill is due +x" for ground that has no downhill at all. Reporting `null` instead makes the
 * caller decide, which for the display on the parcels page means drawing no arrow rather than an
 * arrow pointing at nothing.
 */
export const ASPECT_FLAT_TOLERANCE = 1e-12;

/** Slope angle from horizontal, in radians, on `[0, PI/2)` for any contract-valid normal. */
export function slopeRadians(normal: Vector3): number {
    // acos of the vertical component: the angle between the surface normal and straight up is
    // exactly the angle between the surface and horizontal. Clamped because a normal that is unit
    // length only to within tolerance can put `z` a hair past 1 and turn acos into NaN.
    return Math.acos(Math.min(1, Math.max(-1, normal.z)));
}

/** Slope angle from horizontal, in degrees. */
export function slopeDegrees(normal: Vector3): number {
    return (slopeRadians(normal) * 180) / Math.PI;
}

/**
 * Slope as a gradient — rise over run, the tangent of the slope angle.
 *
 * `0` is level, `1` is 45 degrees, `Infinity` is a vertical wall. This is the form to compare
 * against a road or piste grade, which is conventionally quoted as a percentage of this number.
 */
export function slopeGrade(normal: Vector3): number {
    const horizontal = Math.hypot(normal.x, normal.y);
    if (normal.z <= 0) return Infinity;
    return horizontal / normal.z;
}

/**
 * Aspect: the compass-free bearing of the **downhill** direction, in radians on `(-PI, PI]`,
 * measured from +x towards +y.
 *
 * `null` when the surface is flat to within {@link ASPECT_FLAT_TOLERANCE}, because a flat surface
 * has no downhill direction and every answer would be a fabrication.
 */
export function aspectRadians(normal: Vector3): number | null {
    return bearingRadians(normal.x, normal.y);
}

/**
 * Bearing of a horizontal vector, in radians on `(-PI, PI]`. `null` for a vector too short to have
 * one, per {@link ASPECT_FLAT_TOLERANCE}.
 *
 * Shared by {@link aspectRadians} and by the circular mean of aspects over a polygon, so both agree
 * on the range convention. The `-PI` fold-up matters more than it looks: `atan2` returns `-PI` for a
 * due-west vector whose `y` is negative zero, which is exactly what a gradient pointing along +x
 * produces, so without it the commonest test case in the suite reports `-180` for a bearing the
 * documentation promises as `180`.
 */
export function bearingRadians(x: number, y: number): number | null {
    if (Math.hypot(x, y) <= ASPECT_FLAT_TOLERANCE) return null;
    const radians = Math.atan2(y, x);
    return radians === -Math.PI ? Math.PI : radians;
}

/** {@link bearingRadians} in degrees, on `(-180, 180]`. */
export function bearingDegrees(x: number, y: number): number | null {
    const radians = bearingRadians(x, y);
    return radians === null ? null : (radians * 180) / Math.PI;
}

/** {@link aspectRadians} in degrees, on `(-180, 180]`. `null` on flat ground. */
export function aspectDegrees(normal: Vector3): number | null {
    const radians = aspectRadians(normal);
    return radians === null ? null : (radians * 180) / Math.PI;
}

/**
 * Unit horizontal vector pointing straight downhill. `null` on flat ground.
 *
 * This is the horizontal part of the normal, renormalised — the normal already points downhill in
 * the horizontal plane, by the sign convention of `normalize(-df/dx, -df/dy, 1)`.
 */
export function downhillDirection(normal: Vector3): Vector2 | null {
    const length = Math.hypot(normal.x, normal.y);
    if (length <= ASPECT_FLAT_TOLERANCE) return null;
    return { x: normal.x / length, y: normal.y / length };
}

/** Unit horizontal vector pointing straight uphill — the gradient direction. `null` on flat ground. */
export function uphillDirection(normal: Vector3): Vector2 | null {
    const downhill = downhillDirection(normal);
    return downhill === null ? null : { x: -downhill.x, y: -downhill.y };
}

/**
 * The upward unit normal of the height field whose gradient is `gradient`.
 *
 * The inverse of {@link slopeGrade} and {@link uphillDirection} taken together, and the construction
 * every analytic sampler in {@link module:terrain/synthetic} is built from: give it `df/dx` and
 * `df/dy` and it returns a normal that satisfies the seam contract by construction.
 */
export function normalFromGradient(gradient: Vector2): Vector3 {
    const length = Math.hypot(gradient.x, gradient.y, 1);
    return { x: -gradient.x / length, y: -gradient.y / length, z: 1 / length };
}

/**
 * Normalises an arbitrary upward-ish vector into a contract-valid normal.
 *
 * Flips a downward vector rather than rejecting it, because the commonest source of one is a face
 * normal from a cross product whose winding nobody has pinned down. Returns straight up for a
 * degenerate input — a zero vector, or a horizontal one, which in a height field can only come from
 * a triangle with no area in plan — since that is the only answer that keeps the seam total and the
 * `z > 0` half of the normal contract intact.
 */
export function normaliseUpward(vector: Vector3): Vector3 {
    const length = Math.hypot(vector.x, vector.y, vector.z);
    if (length === 0 || !Number.isFinite(length) || vector.z === 0) return { x: 0, y: 0, z: 1 };
    const sign = vector.z < 0 ? -1 : 1;
    return {
        x: (sign * vector.x) / length,
        y: (sign * vector.y) / length,
        z: (sign * vector.z) / length,
    };
}
