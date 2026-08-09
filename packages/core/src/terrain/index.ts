/**
 * The terrain seam.
 *
 * One batched point-sample interface ({@link TerrainSampler}), slope helpers that read everything
 * off the returned normal, synthetic terrain that implements the interface from closed-form
 * functions, and an adapter over a window of real mapgen4 terrain.
 *
 * Read {@link module:terrain/types} first — it carries the contract and the reasoning behind its
 * shape. Nothing in this directory imports mapgen4, Unreal, React, or anything else; it is plain
 * TypeScript over plain numbers, which is the only way it can be a seam rather than a coupling.
 */

// ── The seam ─────────────────────────────────────────────────────────────────
export type { TerrainSampler, TerrainSample, TerrainDomain, Vector3 } from './types';
export {
    TERRAIN_NORMAL_TOLERANCE,
    UNBOUNDED_DOMAIN,
    clampToDomain,
    isInDomain,
    isValidTerrainNormal,
    squareDomain,
} from './types';

// ── Slope, from the normal ───────────────────────────────────────────────────
export {
    ASPECT_FLAT_TOLERANCE,
    aspectDegrees,
    aspectRadians,
    bearingDegrees,
    bearingRadians,
    downhillDirection,
    normalFromGradient,
    normaliseUpward,
    slopeDegrees,
    slopeGrade,
    slopeRadians,
    uphillDirection,
} from './slope';

// ── Synthetic terrain ────────────────────────────────────────────────────────
export type {
    AnalyticField,
    HemisphereSamplerOptions,
    PlaneSamplerOptions,
    RidgeSamplerOptions,
} from './synthetic';
export {
    createAnalyticSampler,
    createFlatSampler,
    createHemisphereSampler,
    createPlaneSampler,
    createRidgeSampler,
    createSlopeAspectPlaneSampler,
} from './synthetic';

// ── mapgen4 adapter ──────────────────────────────────────────────────────────
export type {
    Mapgen4SamplerMetrics,
    Mapgen4SamplerOptions,
    Mapgen4TerrainSampler,
} from './mapgen4-sampler';
export {
    DEFAULT_HORIZONTAL_EXTENT_METRES,
    DEFAULT_VERTICAL_SCALE_METRES,
    createMapgen4Sampler,
    mapgen4ReliefMetres,
} from './mapgen4-sampler';
export type { Mapgen4PatchData } from './mapgen4-patch-data';
export {
    MAPGEN4_PATCH,
    MAPGEN4_PATCH_ELEVATION_RANGE,
    MAPGEN4_PATCH_WINDOW_UNITS,
} from './mapgen4-patch-data';

// ── Placing a polygon on the terrain ─────────────────────────────────────────
export type { Bounds2, FitPlacementOptions, TerrainPlacement } from './placement';
export { boundsOfPoints, fitPlacementToDomain } from './placement';

// ── Judging a lot against the ground ─────────────────────────────────────────
export type { PolygonSlopeOptions, PolygonSlopeStatistics } from './polygon-slope';
export {
    DEFAULT_INTERIOR_SAMPLES,
    evaluatePolygonSlopes,
    isPointInPolygon,
    polygonSamplePositions,
} from './polygon-slope';
