import type { Vector2 } from '../shared/types';
import { bearingDegrees, slopeDegrees } from './slope';
import { boundsOfPoints } from './placement';
import type { TerrainSample, TerrainSampler } from './types';

/**
 * Evaluating a lot against the ground it sits on.
 *
 * This is the first thing downstream of the seam that a resort builder actually asks for: given a
 * parcel and the terrain, is it buildable, which way does it face, and how steep is the worst of it.
 *
 * ## One batch for every polygon, not one batch per polygon
 *
 * {@link evaluatePolygonSlopes} flattens the sample positions for *all* the polygons into a single
 * array and issues exactly one {@link TerrainSampler.sample} call, then slices the results back
 * apart. Sampling each polygon in its own call would be simpler to write and would be the wrong
 * shape: on the Unreal side each call is a batched voxel dispatch, so a page with 200 lots would
 * become 200 dispatches. The seam is batch-shaped precisely so this can be one, and the count of
 * `sample` calls is a property worth preserving in tests.
 */

/** How a polygon sits on the terrain. Angles in degrees, heights in metres. */
export interface PolygonSlopeStatistics {
    /** How many terrain samples this polygon was judged on. Never zero for a polygon with vertices. */
    sampleCount: number;
    meanSlopeDegrees: number;
    minSlopeDegrees: number;
    maxSlopeDegrees: number;
    meanHeightMetres: number;
    minHeightMetres: number;
    maxHeightMetres: number;
    /**
     * Mean downhill bearing over the polygon, in degrees on `(-180, 180]`.
     *
     * A circular mean — the downhill unit vectors are summed and the sum's bearing taken — because
     * averaging the angles themselves puts the mean of 179 and -179 at zero, i.e. reports a slope
     * facing exactly backwards. `null` when the polygon is level, or when its aspects cancel so
     * completely (a lot straddling a summit) that no direction represents it.
     */
    aspectDegrees: number | null;
    /** Fraction of samples at or below the slope threshold, in `[0, 1]`. */
    buildableFraction: number;
    /** `false` when any sample fell outside the sampler's domain. */
    fullyInDomain: boolean;
    /** The verdict. See {@link PolygonSlopeOptions.slopeThresholdDegrees}. */
    buildable: boolean;
}

export interface PolygonSlopeOptions {
    /**
     * Slope in degrees at or below which ground counts as buildable.
     *
     * The verdict is `meanSlopeDegrees <= slopeThresholdDegrees`, and additionally requires that the
     * whole lot lie on known terrain. Mean rather than max, deliberately: a chalet pad is graded, so
     * one sample clipping a rock step should not condemn a lot that is otherwise a gentle shelf.
     * {@link PolygonSlopeStatistics.maxSlopeDegrees} and
     * {@link PolygonSlopeStatistics.buildableFraction} are reported alongside so a caller that wants
     * a stricter rule has the numbers to impose one without re-sampling.
     */
    slopeThresholdDegrees: number;
    /**
     * Roughly how many interior samples to place in each polygon. Defaults to
     * {@link DEFAULT_INTERIOR_SAMPLES}.
     *
     * Approximate because the interior samples come from a square lattice over the polygon's
     * bounding box with the outside ones discarded, so a polygon that fills its box gets more of
     * them than a sliver does — which is the right way round.
     */
    interiorSamples?: number;
}

/** Interior samples per polygon when the caller does not say. */
export const DEFAULT_INTERIOR_SAMPLES = 24;

/** The positions one polygon is judged on: its own corners, plus a lattice over its interior. */
export function polygonSamplePositions(
    polygon: readonly Vector2[],
    interiorSamples: number = DEFAULT_INTERIOR_SAMPLES,
): Vector2[] {
    // The corners are always included. They are where a building's footprint meets its neighbours,
    // and they guarantee a non-empty sample set for a lot too small to catch a lattice point.
    const positions: Vector2[] = polygon.map((vertex) => ({ x: vertex.x, y: vertex.y }));
    if (polygon.length < 3 || interiorSamples <= 0) return positions;

    const bounds = boundsOfPoints(polygon);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (width <= 0 || height <= 0) return positions;

    // A lattice, not a random scatter: the same parcel must produce the same verdict every render,
    // and a seeded scatter would only be determinism with extra steps.
    const perSide = Math.max(2, Math.ceil(Math.sqrt(interiorSamples)));
    for (let row = 0; row < perSide; row++) {
        for (let column = 0; column < perSide; column++) {
            const candidate = {
                x: bounds.minX + (width * (column + 0.5)) / perSide,
                y: bounds.minY + (height * (row + 0.5)) / perSide,
            };
            if (isPointInPolygon(candidate, polygon)) positions.push(candidate);
        }
    }
    return positions;
}

/** Standard crossing-number test. Points exactly on an edge may fall either way; nothing here cares. */
export function isPointInPolygon(point: Vector2, polygon: readonly Vector2[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        const straddles = a.y > point.y !== b.y > point.y;
        if (straddles && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Evaluates every polygon against the terrain in a single batched sample.
 *
 * @param polygons Closed polygons, in the sampler's own coordinates — metres. Convert first if the
 *                 polygons are in canvas units; see {@link module:terrain/placement}.
 * @returns One entry per polygon, in input order.
 */
export function evaluatePolygonSlopes(
    polygons: readonly (readonly Vector2[])[],
    sampler: TerrainSampler,
    options: PolygonSlopeOptions,
): PolygonSlopeStatistics[] {
    const { slopeThresholdDegrees, interiorSamples = DEFAULT_INTERIOR_SAMPLES } = options;

    const positions: Vector2[] = [];
    const spans: { start: number; count: number }[] = [];
    for (const polygon of polygons) {
        const start = positions.length;
        for (const position of polygonSamplePositions(polygon, interiorSamples)) positions.push(position);
        spans.push({ start, count: positions.length - start });
    }

    const samples = sampler.sample(positions);

    return spans.map((span) => summarise(samples, span.start, span.count, slopeThresholdDegrees));
}

/** Everything a single polygon's verdict needs, read off one contiguous run of the batch. */
function summarise(
    samples: readonly TerrainSample[],
    start: number,
    count: number,
    slopeThresholdDegrees: number,
): PolygonSlopeStatistics {
    if (count === 0) {
        return {
            sampleCount: 0,
            meanSlopeDegrees: 0,
            minSlopeDegrees: 0,
            maxSlopeDegrees: 0,
            meanHeightMetres: 0,
            minHeightMetres: 0,
            maxHeightMetres: 0,
            aspectDegrees: null,
            buildableFraction: 0,
            fullyInDomain: false,
            buildable: false,
        };
    }

    let slopeTotal = 0;
    let slopeMin = Infinity;
    let slopeMax = -Infinity;
    let heightTotal = 0;
    let heightMin = Infinity;
    let heightMax = -Infinity;
    let downhillX = 0;
    let downhillY = 0;
    let underThreshold = 0;
    let fullyInDomain = true;

    for (let i = start; i < start + count; i++) {
        const sample = samples[i];
        const slope = slopeDegrees(sample.normal);
        slopeTotal += slope;
        if (slope < slopeMin) slopeMin = slope;
        if (slope > slopeMax) slopeMax = slope;
        heightTotal += sample.height;
        if (sample.height < heightMin) heightMin = sample.height;
        if (sample.height > heightMax) heightMax = sample.height;
        if (slope <= slopeThresholdDegrees) underThreshold++;
        if (!sample.inDomain) fullyInDomain = false;

        // Summing the raw horizontal part of the normal is the circular mean, already weighted the
        // way it should be: that vector points downhill and its length is `sin(slope)`, so a level
        // sample — whose aspect is arbitrary — contributes nothing and steep ground dominates.
        downhillX += sample.normal.x;
        downhillY += sample.normal.y;
    }

    const meanSlope = slopeTotal / count;
    const aspect = bearingDegrees(downhillX, downhillY);
    return {
        sampleCount: count,
        meanSlopeDegrees: meanSlope,
        minSlopeDegrees: slopeMin,
        maxSlopeDegrees: slopeMax,
        meanHeightMetres: heightTotal / count,
        minHeightMetres: heightMin,
        maxHeightMetres: heightMax,
        aspectDegrees: aspect,
        buildableFraction: underThreshold / count,
        fullyInDomain,
        buildable: fullyInDomain && meanSlope <= slopeThresholdDegrees,
    };
}
