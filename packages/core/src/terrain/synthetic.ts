import type { Vector2 } from '../shared/types';
import { normalFromGradient } from './slope';
import {
    clampToDomain,
    isInDomain,
    UNBOUNDED_DOMAIN,
    type TerrainDomain,
    type TerrainSample,
    type TerrainSampler,
} from './types';

/**
 * Synthetic terrain: samplers built from closed-form height functions.
 *
 * These exist so the seam can be exercised, and its slope helpers checked against hand-derived
 * numbers, with no terrain source wired up at all. A plane at a stated gradient has exactly that
 * slope everywhere; a hemisphere of radius `R` has slope `asin(d / R)` at horizontal distance `d`
 * from its centre, so a dome of radius 100 is exactly 30 degrees at 50 metres out. Those are
 * assertions about arithmetic, not snapshots of whatever the code happened to produce, and they are
 * what proves the contract before real data arrives to muddy it.
 *
 * They are also the fallback terrain for the parcels page. A player-marked region has to sit on
 * *some* ground, and a plane tilted at a chosen angle is the clearest possible demonstration that a
 * slope threshold is doing what it claims.
 *
 * Every sampler here is built from {@link createAnalyticSampler}, so the batch contract and the
 * out-of-domain clamp are implemented once and shared rather than restated per shape.
 */

/** A height field given in closed form, with its own exact gradient. */
export interface AnalyticField {
    /** Height in metres at a horizontal position in metres. */
    height(position: Vector2): number;
    /**
     * Exact partial derivatives `(df/dx, df/dy)` at that position.
     *
     * Exact, not finite-differenced. The whole point of a synthetic sampler is to be ground truth,
     * and a field whose normals came from differencing its own heights could not be used to check
     * that differencing heights is the wrong way to get a normal.
     */
    gradient(position: Vector2): Vector2;
}

/**
 * Wraps an analytic field as a {@link TerrainSampler}.
 *
 * This is the only place the seam's two structural promises are implemented: one output per input in
 * input order, and out-of-domain positions clamped to the domain rather than rejected.
 */
export function createAnalyticSampler(
    field: AnalyticField,
    domain: TerrainDomain = UNBOUNDED_DOMAIN,
): TerrainSampler {
    return {
        domain,
        sample(positions: readonly Vector2[]): TerrainSample[] {
            const samples: TerrainSample[] = new Array<TerrainSample>(positions.length);
            for (let i = 0; i < positions.length; i++) {
                const requested = positions[i];
                const inside = isInDomain(requested, domain);
                const at = inside ? requested : clampToDomain(requested, domain);
                samples[i] = {
                    height: field.height(at),
                    normal: normalFromGradient(field.gradient(at)),
                    inDomain: inside,
                };
            }
            return samples;
        },
    };
}

export interface PlaneSamplerOptions {
    /** `(df/dx, df/dy)` in metres per metre. `{ x: 0, y: 0 }` is level ground. */
    gradient: Vector2;
    /** Height in metres at `(0, 0)`. Defaults to `0`. */
    heightAtOrigin?: number;
    /** Defaults to the whole plane, since a plane is defined everywhere. */
    domain?: TerrainDomain;
}

/**
 * A tilted plane — constant slope, constant aspect, everywhere.
 *
 * The reference case. Slope is `atan(hypot(gradient))` and aspect is the bearing of `-gradient`, at
 * every position, so any helper that gets a plane wrong is broken outright.
 */
export function createPlaneSampler(options: PlaneSamplerOptions): TerrainSampler {
    const { gradient, heightAtOrigin = 0, domain } = options;
    return createAnalyticSampler(
        {
            height: (p) => heightAtOrigin + gradient.x * p.x + gradient.y * p.y,
            gradient: () => gradient,
        },
        domain,
    );
}

/**
 * A plane specified the way a person describes a hillside: how steep, and which way it faces.
 *
 * @param slopeDegrees Angle from horizontal, in `[0, 90)`.
 * @param aspectDegrees Bearing of the downhill direction, measured from +x towards +y.
 */
export function createSlopeAspectPlaneSampler(
    slopeDegrees: number,
    aspectDegrees: number,
    options: Omit<PlaneSamplerOptions, 'gradient'> = {},
): TerrainSampler {
    const grade = Math.tan((slopeDegrees * Math.PI) / 180);
    const aspect = (aspectDegrees * Math.PI) / 180;
    // The gradient points uphill, which is opposite the aspect.
    return createPlaneSampler({
        ...options,
        gradient: { x: -grade * Math.cos(aspect), y: -grade * Math.sin(aspect) },
    });
}

export interface HemisphereSamplerOptions {
    /** Horizontal centre of the dome, in metres. */
    centre: Vector2;
    /** Dome radius in metres. Also its height above `baseHeight` at the centre. */
    radius: number;
    /** Height of the flat ground the dome sits on, in metres. Defaults to `0`. */
    baseHeight?: number;
    domain?: TerrainDomain;
}

/**
 * A hemispherical dome on flat ground.
 *
 * Chosen as the second reference shape because its slope varies over the surface but is still known
 * in closed form: at horizontal distance `d` from the centre the surface normal is the sphere normal
 * `(p - centre, sqrt(R^2 - d^2)) / R`, so the slope is exactly `asin(d / R)` — level at the summit,
 * 30 degrees at half the radius, vertical at the rim. Aspect points radially outward everywhere,
 * which also makes it the cleanest test that aspect is the *downhill* bearing and not the uphill one.
 *
 * Outside the radius the ground is flat at `baseHeight`, so the rim is a crease: slope drops from
 * near-vertical to zero across it. That discontinuity is real geometry, not an artefact, and it is
 * useful — it is the one place in the synthetic set where two adjacent samples disagree violently.
 */
export function createHemisphereSampler(options: HemisphereSamplerOptions): TerrainSampler {
    const { centre, radius, baseHeight = 0, domain } = options;
    const radiusSquared = radius * radius;
    return createAnalyticSampler(
        {
            height: (p) => {
                const dSquared = (p.x - centre.x) ** 2 + (p.y - centre.y) ** 2;
                return dSquared >= radiusSquared ? baseHeight : baseHeight + Math.sqrt(radiusSquared - dSquared);
            },
            gradient: (p) => {
                const dx = p.x - centre.x;
                const dy = p.y - centre.y;
                const dSquared = dx * dx + dy * dy;
                if (dSquared >= radiusSquared) return { x: 0, y: 0 };
                // h = sqrt(R^2 - d^2), so dh/dx = -x / sqrt(R^2 - d^2).
                const vertical = Math.sqrt(radiusSquared - dSquared);
                return { x: -dx / vertical, y: -dy / vertical };
            },
        },
        domain,
    );
}

export interface RidgeSamplerOptions {
    /** A point on the crest line, in metres. */
    crest: Vector2;
    /** Direction the crest line runs. Need not be unit length. */
    axis: Vector2;
    /** Distance in metres from the crest to where the ridge meets flat ground. */
    halfWidth: number;
    /** Height of the crest above `baseHeight`, in metres. */
    height: number;
    baseHeight?: number;
    domain?: TerrainDomain;
}

/**
 * A raised-cosine ridge: a smooth linear crest falling away symmetrically to flat ground.
 *
 * The shape a ski resort actually sits on, and the one that makes an aspect readout mean something —
 * the two flanks face exactly opposite ways, so a display that colours by aspect must show them as
 * opposites and a display that colours by slope must show them as identical.
 *
 * Height at signed cross-crest distance `s` is `base + height/2 * (1 + cos(PI * s / halfWidth))`,
 * which is level at the crest, level again where it meets the ground, and steepest exactly halfway
 * between at a slope of `atan(PI * height / (2 * halfWidth))`.
 */
export function createRidgeSampler(options: RidgeSamplerOptions): TerrainSampler {
    const { crest, axis, halfWidth, height, baseHeight = 0, domain } = options;
    const axisLength = Math.hypot(axis.x, axis.y);
    // Unit vector across the ridge. Falls back to +x for a degenerate axis so the sampler stays total.
    const across: Vector2 =
        axisLength === 0 ? { x: 1, y: 0 } : { x: -axis.y / axisLength, y: axis.x / axisLength };

    const crossDistance = (p: Vector2) => (p.x - crest.x) * across.x + (p.y - crest.y) * across.y;

    return createAnalyticSampler(
        {
            height: (p) => {
                const s = crossDistance(p);
                if (Math.abs(s) >= halfWidth) return baseHeight;
                return baseHeight + (height / 2) * (1 + Math.cos((Math.PI * s) / halfWidth));
            },
            gradient: (p) => {
                const s = crossDistance(p);
                if (Math.abs(s) >= halfWidth) return { x: 0, y: 0 };
                const dhds = -((height * Math.PI) / (2 * halfWidth)) * Math.sin((Math.PI * s) / halfWidth);
                return { x: dhds * across.x, y: dhds * across.y };
            },
        },
        domain,
    );
}

/** Level ground at a fixed height. Slope zero, aspect undefined, everywhere. */
export function createFlatSampler(height = 0, domain?: TerrainDomain): TerrainSampler {
    return createAnalyticSampler({ height: () => height, gradient: () => ({ x: 0, y: 0 }) }, domain);
}
