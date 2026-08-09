import type { Vector2 } from '../shared/types';
import type { TerrainDomain } from './types';

/**
 * Placing a polygon on the terrain.
 *
 * A polygon drawn on a canvas is in arbitrary units — the fixtures in this repo span three orders of
 * magnitude. The terrain seam is in metres and nothing else. Something has to reconcile them, and
 * the honest place for it is here, in one explicit, invertible transform, rather than as a scale
 * factor smuggled into a slope calculation.
 *
 * The transform is deliberately **uniform**: one scale for both axes. A non-uniform fit would make
 * the polygon fill the domain more completely and would silently shear every slope reading, because
 * a lot stretched in x and not in y no longer sits on the ground it appears to sit on.
 */

/** An axis-aligned bounding box in polygon units. */
export interface Bounds2 {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** A reversible mapping from polygon units to metres on the terrain. */
export interface TerrainPlacement {
    /** Metres of ground per polygon unit. Quote this in a UI; it is what makes the numbers real. */
    metresPerUnit: number;
    /** Polygon units to metres. */
    toMetres(point: Vector2): Vector2;
    /** Metres back to polygon units — for drawing a terrain-space result on the polygon's canvas. */
    fromMetres(point: Vector2): Vector2;
}

/** Bounding box of a point set. An empty set yields a degenerate box at the origin. */
export function boundsOfPoints(points: readonly Vector2[]): Bounds2 {
    if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points) {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
    }
    return { minX, minY, maxX, maxY };
}

export interface FitPlacementOptions {
    /**
     * Fraction of the domain the polygon's bounding box should span, in `(0, 1]`.
     *
     * Below 1 the region sits inside the terrain with ground to spare around it, which is the
     * realistic case: a player marks out part of a mountain, not the whole of it. It also keeps a
     * parcel that pokes a little past the polygon outline on real terrain rather than off the edge.
     */
    fill?: number;
}

const DEFAULT_FILL = 0.8;

/**
 * Centres a polygon's bounding box in a terrain domain at a uniform scale.
 *
 * The result is a placement, not a resampling: nothing about the polygon changes, only the
 * interpretation of its coordinates. A degenerate box — a single point, or a polygon with no extent
 * in either axis — maps at 1 metre per unit, since there is no meaningful scale to derive and
 * failing here would take out the whole page for an empty canvas.
 */
export function fitPlacementToDomain(
    bounds: Bounds2,
    domain: TerrainDomain,
    options: FitPlacementOptions = {},
): TerrainPlacement {
    const { fill = DEFAULT_FILL } = options;

    const boundsWidth = bounds.maxX - bounds.minX;
    const boundsHeight = bounds.maxY - bounds.minY;
    const domainWidth = domain.maxX - domain.minX;
    const domainHeight = domain.maxY - domain.minY;

    const usable = Math.min(domainWidth, domainHeight) * fill;
    const extent = Math.max(boundsWidth, boundsHeight);
    const metresPerUnit = extent > 0 && Number.isFinite(usable) && usable > 0 ? usable / extent : 1;

    // Centre-to-centre, so the polygon lands on the middle of the terrain whatever its aspect ratio.
    const polygonCentreX = (bounds.minX + bounds.maxX) / 2;
    const polygonCentreY = (bounds.minY + bounds.maxY) / 2;
    const domainCentreX = Number.isFinite(domainWidth) ? (domain.minX + domain.maxX) / 2 : 0;
    const domainCentreY = Number.isFinite(domainHeight) ? (domain.minY + domain.maxY) / 2 : 0;

    return {
        metresPerUnit,
        toMetres: (point) => ({
            x: domainCentreX + (point.x - polygonCentreX) * metresPerUnit,
            y: domainCentreY + (point.y - polygonCentreY) * metresPerUnit,
        }),
        fromMetres: (point) => ({
            x: polygonCentreX + (point.x - domainCentreX) / metresPerUnit,
            y: polygonCentreY + (point.y - domainCentreY) / metresPerUnit,
        }),
    };
}
