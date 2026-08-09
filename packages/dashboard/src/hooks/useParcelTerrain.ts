import { useMemo } from 'react';
import {
    boundsOfPoints,
    createFlatSampler,
    createHemisphereSampler,
    createMapgen4Sampler,
    createRidgeSampler,
    createSlopeAspectPlaneSampler,
    evaluatePolygonSlopes,
    fitPlacementToDomain,
    slopeDegrees,
    squareDomain,
} from '@proc-geo/core';
import type {
    Parcel,
    PolygonSlopeStatistics,
    TerrainPlacement,
    TerrainSampler,
    Vector2,
} from '@proc-geo/core';
import type { Vertex } from '../stores/usePolygonStore';
import { useTerrainStore } from '../stores/useTerrainStore';
import type { TerrainSourceId } from '../stores/useTerrainStore';

/**
 * Puts the marked region on terrain and judges every parcel against it.
 *
 * ## Where the metres come from
 *
 * A polygon on this canvas is in arbitrary units — the fixtures span three orders of magnitude — and
 * the seam speaks only metres. The two are reconciled once, by
 * `fitPlacementToDomain`: the polygon's bounding box is centred in the terrain domain at a uniform
 * scale, filling most of it. Every parcel vertex then goes through that one transform on its way to
 * the sampler, and {@link ParcelTerrainState.metresPerUnit} is reported so the page can say out loud
 * what a canvas unit is worth. Resizing the polygon rescales the placement rather than sliding the
 * region across the terrain, which keeps the page's numbers comparable across fixtures — the terrain
 * is a demonstration surface here, not a fixed world.
 *
 * ## Two sample calls, and only two
 *
 * One batch for every parcel of every strip, and one for the background slope field. Not one per
 * parcel: the seam is batch-shaped because the Unreal call it stands in for is a batched dispatch,
 * and a page that fanned it out into hundreds of calls would be rehearsing the wrong thing.
 */

/** One cell of the sampled slope field, in polygon coordinates, ready to draw. */
export interface SlopeFieldCell {
    x: number;
    y: number;
    size: number;
    slopeDegrees: number;
    inDomain: boolean;
}

export interface ParcelTerrainState {
    enabled: boolean;
    /** Mean-slope statistics per parcel, in the same flattened order as `ParcelPipelineResult.parcels`. */
    slopes: PolygonSlopeStatistics[];
    /** Same statistics, grouped by strip, to match `parcelsByStrip`. */
    slopesByStrip: PolygonSlopeStatistics[][];
    field: SlopeFieldCell[];
    placement: TerrainPlacement | null;
    /** Metres of ground per polygon unit under the current placement. */
    metresPerUnit: number;
    /** Side length of the terrain patch, in metres. */
    extentMetres: number;
    /** Vertical relief of the terrain patch in metres, when the source reports one. */
    reliefMetres: number | null;
    slopeThresholdDegrees: number;
    maxDisplaySlopeDegrees: number;
    buildableCount: number;
    unbuildableCount: number;
    /** Area-weighted mean of the parcel mean slopes. `0` when there are no parcels. */
    meanSlopeDegrees: number;
    steepestSlopeDegrees: number;
}

/** Cells across the slope field. 48x48 is 2304 primitives — legible, and Konva copes. */
const FIELD_RESOLUTION = 48;

const EMPTY: Omit<ParcelTerrainState, 'slopeThresholdDegrees' | 'maxDisplaySlopeDegrees' | 'extentMetres'> = {
    enabled: false,
    slopes: [],
    slopesByStrip: [],
    field: [],
    placement: null,
    metresPerUnit: 1,
    reliefMetres: null,
    buildableCount: 0,
    unbuildableCount: 0,
    meanSlopeDegrees: 0,
    steepestSlopeDegrees: 0,
};

interface SamplerConfig {
    source: TerrainSourceId;
    extentMetres: number;
    verticalScaleMetres: number;
    planeSlopeDegrees: number;
    planeAspectDegrees: number;
}

/** Builds the sampler the chosen source describes, sized to the requested ground extent. */
function buildSampler(config: SamplerConfig): { sampler: TerrainSampler; reliefMetres: number | null } {
    const { source, extentMetres } = config;
    const domain = squareDomain(extentMetres);
    const centre: Vector2 = { x: extentMetres / 2, y: extentMetres / 2 };

    switch (source) {
        case 'mapgen4': {
            const sampler = createMapgen4Sampler({
                horizontalExtentMetres: extentMetres,
                verticalScaleMetres: config.verticalScaleMetres,
            });
            return { sampler, reliefMetres: sampler.metrics.reliefMetres };
        }
        case 'plane': {
            const sampler = createSlopeAspectPlaneSampler(
                config.planeSlopeDegrees,
                config.planeAspectDegrees,
                { domain },
            );
            // A plane's relief across the patch is its grade times its extent.
            const relief = Math.tan((config.planeSlopeDegrees * Math.PI) / 180) * extentMetres;
            return { sampler, reliefMetres: relief };
        }
        case 'ridge': {
            // A crest across the middle of the patch, standing a fifth of the extent tall.
            const height = extentMetres / 5;
            return {
                sampler: createRidgeSampler({
                    crest: centre,
                    axis: { x: 1, y: 0.35 },
                    halfWidth: extentMetres / 2,
                    height,
                    domain,
                }),
                reliefMetres: height,
            };
        }
        case 'dome': {
            const radius = extentMetres / 2;
            return {
                sampler: createHemisphereSampler({ centre, radius, domain }),
                reliefMetres: radius,
            };
        }
        case 'flat':
        default:
            return { sampler: createFlatSampler(0, domain), reliefMetres: 0 };
    }
}

export function useParcelTerrain(
    vertices: Vertex[],
    parcelsByStrip: Parcel[][],
): ParcelTerrainState {
    const enabled = useTerrainStore((s) => s.enabled);
    const source = useTerrainStore((s) => s.source);
    const slopeThresholdDegrees = useTerrainStore((s) => s.slopeThresholdDegrees);
    const maxDisplaySlopeDegrees = useTerrainStore((s) => s.maxDisplaySlopeDegrees);
    const extentMetres = useTerrainStore((s) => s.extentMetres);
    const verticalScaleMetres = useTerrainStore((s) => s.verticalScaleMetres);
    const planeSlopeDegrees = useTerrainStore((s) => s.planeSlopeDegrees);
    const planeAspectDegrees = useTerrainStore((s) => s.planeAspectDegrees);
    const showSlopeField = useTerrainStore((s) => s.showSlopeField);

    return useMemo<ParcelTerrainState>(() => {
        const shared = { slopeThresholdDegrees, maxDisplaySlopeDegrees, extentMetres };
        if (!enabled || vertices.length < 3) return { ...EMPTY, ...shared };

        const { sampler, reliefMetres } = buildSampler({
            source,
            extentMetres,
            verticalScaleMetres,
            planeSlopeDegrees,
            planeAspectDegrees,
        });
        const placement = fitPlacementToDomain(boundsOfPoints(vertices), sampler.domain);

        // ── Batch one: every parcel of every strip. ─────────────────────────────────────────────
        const parcels = parcelsByStrip.flat();
        const boundariesInMetres = parcels.map((parcel) => parcel.boundary.map(placement.toMetres));
        const slopes = evaluatePolygonSlopes(boundariesInMetres, sampler, { slopeThresholdDegrees });

        const slopesByStrip: PolygonSlopeStatistics[][] = [];
        let cursor = 0;
        for (const strip of parcelsByStrip) {
            slopesByStrip.push(slopes.slice(cursor, cursor + strip.length));
            cursor += strip.length;
        }

        // ── Batch two: the background field, over the polygon's own bounding box. ───────────────
        // Drawn in polygon coordinates so it lines up with the parcels without a second transform
        // at render time, but sampled in metres like everything else.
        const field: SlopeFieldCell[] = [];
        if (showSlopeField) {
            const bounds = boundsOfPoints(vertices);
            const width = bounds.maxX - bounds.minX;
            const height = bounds.maxY - bounds.minY;
            const span = Math.max(width, height);
            if (span > 0) {
                const cell = span / FIELD_RESOLUTION;
                const cells: { x: number; y: number }[] = [];
                const columns = Math.ceil(width / cell) || 1;
                const rows = Math.ceil(height / cell) || 1;
                for (let row = 0; row < rows; row++) {
                    for (let column = 0; column < columns; column++) {
                        cells.push({
                            x: bounds.minX + column * cell,
                            y: bounds.minY + row * cell,
                        });
                    }
                }
                const samples = sampler.sample(
                    cells.map((c) => placement.toMetres({ x: c.x + cell / 2, y: c.y + cell / 2 })),
                );
                for (let i = 0; i < cells.length; i++) {
                    field.push({
                        x: cells[i].x,
                        y: cells[i].y,
                        size: cell,
                        slopeDegrees: slopeDegrees(samples[i].normal),
                        inDomain: samples[i].inDomain,
                    });
                }
            }
        }

        let buildableCount = 0;
        let slopeTotal = 0;
        let areaTotal = 0;
        let steepest = 0;
        for (let i = 0; i < parcels.length; i++) {
            if (slopes[i].buildable) buildableCount++;
            const area = Math.max(parcels[i].area, 0);
            slopeTotal += slopes[i].meanSlopeDegrees * area;
            areaTotal += area;
            if (slopes[i].maxSlopeDegrees > steepest) steepest = slopes[i].maxSlopeDegrees;
        }

        return {
            ...shared,
            enabled: true,
            slopes,
            slopesByStrip,
            field,
            placement,
            metresPerUnit: placement.metresPerUnit,
            reliefMetres,
            buildableCount,
            unbuildableCount: parcels.length - buildableCount,
            meanSlopeDegrees: areaTotal > 0 ? slopeTotal / areaTotal : 0,
            steepestSlopeDegrees: steepest,
        };
    }, [
        enabled,
        source,
        slopeThresholdDegrees,
        maxDisplaySlopeDegrees,
        extentMetres,
        verticalScaleMetres,
        planeSlopeDegrees,
        planeAspectDegrees,
        showSlopeField,
        vertices,
        parcelsByStrip,
    ]);
}
