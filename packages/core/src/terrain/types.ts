import type { Vector2 } from '../shared/types';

/**
 * The terrain seam: one batched point-sample call, and nothing else.
 *
 * ## Why this shape and no other
 *
 * Both ends of this pipeline were read before the interface was fixed, and both of them are batch
 * point samplers — neither is a raster.
 *
 * - **mapgen4**, the generator this repo adapts, stores elevation on an irregular *dual mesh*:
 *   `elevation_t` per triangle and `elevation_r` per region. There is no grid. Reading a height at
 *   an arbitrary point means locating a containing triangle and interpolating, and mapgen4 ships no
 *   helper for that at all.
 * - **Unreal's `MultiQueryVoxelLayer`**, the consumer, takes an array of arbitrary world positions
 *   and returns a height *and a normal* for each, evaluated in one batched dispatch.
 *
 * A grid-indexing interface fits neither. A per-point interface fits both but lies about the cost
 * model: on the Unreal side the dispatch is the expensive part and the per-point work is nearly
 * free, so code written against `sample(point)` would be shaped to make a call per point and would
 * be wrong to port. Batching is therefore in the signature, not an optimisation over it.
 *
 * ## The contract
 *
 * 1. **N in, N out, order preserved.** `sample(positions)[i]` is the sample at `positions[i]`, for
 *    every `i`. An empty input yields an empty output. Implementations never reorder, never
 *    deduplicate, and never drop.
 * 2. **Total.** Every position gets a finite {@link TerrainSample}. Sampling never throws for a
 *    position, never returns `null`, and never returns `NaN`. See {@link TerrainSample.inDomain}
 *    for what happens off the edge of the world.
 * 3. **Normals are unit length**, to within {@link TERRAIN_NORMAL_TOLERANCE}, and point upward
 *    (`normal.z > 0`). Slope is read off the normal directly, so an unnormalised normal would
 *    silently produce a wrong angle rather than an error. Implementations normalise; callers do not.
 * 4. **Pure.** Sampling the same positions twice yields the same numbers. No sampler mutates the
 *    arrays it is given.
 *
 * ## Units
 *
 * Everything is **metres**: `x`/`y` in the horizontal plane, `height` above sea level, `z` up.
 *
 * This is not decoration. mapgen4's elevation is unitless and sea-level-relative, on roughly
 * `[-1, +1]`, and its map is 1000 arbitrary units across. Any slope threshold tuned against those
 * numbers means nothing once the terrain is ported, because the threshold depends entirely on how
 * many metres an elevation unit turns out to be. Fixing metres at the seam is what makes "30 degrees
 * is too steep to build on" a statement about terrain rather than about a particular generator's
 * output range.
 */
export interface TerrainSampler {
    /** The rectangle of the horizontal plane, in metres, over which this sampler has real data. */
    readonly domain: TerrainDomain;
    /**
     * Samples every position, in order.
     *
     * @param positions Horizontal positions in metres. Not mutated.
     * @returns One sample per position, same length, same order.
     */
    sample(positions: readonly Vector2[]): TerrainSample[];
}

/** An axis-aligned rectangle of the horizontal plane, in metres. */
export interface TerrainDomain {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** One terrain reading. Always finite; see {@link TerrainSampler} for the contract it satisfies. */
export interface TerrainSample {
    /** Height above sea level in metres. Negative is below sea level. */
    height: number;
    /** Unit-length upward surface normal. `z > 0` always. */
    normal: Vector3;
    /**
     * `false` when the queried position lay outside {@link TerrainSampler.domain}.
     *
     * **Out-of-domain policy: clamp to the domain and flag, never fail.** The position is clamped to
     * the nearest point on the domain rectangle and that point's sample is returned, so the field is
     * defined and continuous everywhere in the plane — edge-extended beyond the data, exactly like a
     * clamped texture sampler.
     *
     * The alternatives were considered and rejected. Throwing turns one stray position into a failed
     * batch of thousands, which is precisely the wrong failure mode for a dispatch whose whole point
     * is that it is a single call. A sentinel height (`NaN`, `-Infinity`, `undefined`) forces every
     * consumer to test every element before doing arithmetic, and the ones that forget get a silently
     * poisoned mean rather than an error. Clamping gives arithmetic that always works, and this flag
     * gives the consumers that care — a buildability check at a region boundary, say — the one bit
     * they need to reject a lot for sitting off the edge of the terrain.
     *
     * A sampler with an unbounded domain reports `true` everywhere.
     */
    inDomain: boolean;
}

/** A 3-D point or direction. `z` is up. */
export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

/**
 * How far a normal's length may drift from 1 and still satisfy the seam contract.
 *
 * Loose enough to absorb the accumulated error of normalising a cross product of interpolated
 * vertex normals in double precision, tight enough that an unnormalised normal — the mistake this
 * guards against — fails by orders of magnitude rather than marginally.
 */
export const TERRAIN_NORMAL_TOLERANCE = 1e-9;

/** True when `normal` satisfies the seam's unit-length and upward-facing contract. */
export function isValidTerrainNormal(normal: Vector3): boolean {
    if (!Number.isFinite(normal.x) || !Number.isFinite(normal.y) || !Number.isFinite(normal.z)) {
        return false;
    }
    if (normal.z <= 0) return false;
    const length = Math.hypot(normal.x, normal.y, normal.z);
    return Math.abs(length - 1) <= TERRAIN_NORMAL_TOLERANCE;
}

/** Clamps a position into `domain`, as the out-of-domain policy requires. */
export function clampToDomain(position: Vector2, domain: TerrainDomain): Vector2 {
    return {
        x: Math.min(domain.maxX, Math.max(domain.minX, position.x)),
        y: Math.min(domain.maxY, Math.max(domain.minY, position.y)),
    };
}

/** True when `position` lies inside `domain`, boundary included. */
export function isInDomain(position: Vector2, domain: TerrainDomain): boolean {
    return (
        position.x >= domain.minX &&
        position.x <= domain.maxX &&
        position.y >= domain.minY &&
        position.y <= domain.maxY
    );
}

/** A domain covering the whole plane, for samplers defined by an analytic function everywhere. */
export const UNBOUNDED_DOMAIN: TerrainDomain = {
    minX: -Infinity,
    minY: -Infinity,
    maxX: Infinity,
    maxY: Infinity,
};

/** A square domain of `extentMetres` on a side with its min corner at the origin. */
export function squareDomain(extentMetres: number): TerrainDomain {
    return { minX: 0, minY: 0, maxX: extentMetres, maxY: extentMetres };
}
