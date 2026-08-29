import {
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    sliceStrips,
    solveSkeleton,
} from '@proc-geo/core';
import type {
    Parcel,
    SkeletonDiagnostic,
    SkeletonSolveResult,
    SliceOptions,
    Strip,
    Vector2,
} from '@proc-geo/core';
import { EXPLORER_PERCEPTUAL_FLOOR } from '../scene/perceptual-floor';
import type { Vertex } from '../stores/usePolygonStore';
import { polygonArea } from '../stores/useParcelStore';

/**
 * The parcel pipeline itself — solve, offset, strips, slice — as one pure function.
 *
 * SEPARATED FROM `useParcelPipeline` DELIBERATELY. The hook owns debouncing, memo identity and a
 * store effect, none of which this needs, and all of which stand between this arithmetic and a test:
 * asserting anything about the page's parcels would otherwise mean rendering a React tree. The
 * floor this solves at is a ruled decision (journal 108(b)) and a ruled decision that no test can
 * reach is a decision that can be reverted by accident.
 */

/** Which step of the pipeline refused the input. `null` means nothing has failed. */
export type ParcelPipelineStage = 'solve' | 'offset' | 'strips' | 'slice';

export interface ParcelPipelineFailure {
    stage: ParcelPipelineStage;
    message: string;
}

export interface ParcelPipelineResult {
    /** Vertices the numbers below were computed from — the debounced ones, not necessarily current. */
    vertices: Vertex[];
    /** True while the debounce is still holding back a newer polygon or parameter set. */
    stale: boolean;
    solve: SkeletonSolveResult | null;
    /** `false` whenever the skeleton cannot be trusted; nothing downstream is computed in that case. */
    complete: boolean;
    diagnostics: SkeletonDiagnostic[];
    maxOffset: number;
    /** Absolute inward depth the strips were cut at: `maxOffset * depthPercent / 100`. */
    depth: number;
    offsetRings: Vector2[][];
    strips: Strip[];
    /** Parcels grouped by their strip, as `sliceStrips` returns them. */
    parcelsByStrip: Parcel[][];
    /** Every parcel, flattened, in strip order. */
    parcels: Parcel[];
    polygonArea: number;
    parcelArea: number;
    /** Share of the polygon covered by parcels, in `[0, 1]`. `0` when the polygon has no area. */
    coverage: number;
    sliceOptions: SliceOptions;
    failure: ParcelPipelineFailure | null;
}

/**
 * Every knob the pipeline recomputes from, grouped so the live and debounced readings travel as
 * one value each. The hook's main memo depends on exactly two objects — adding a knob costs a field
 * here and nothing there.
 */
export interface PipelineParams {
    vertices: Vertex[];
    depthPercent: number;
    mitreToleranceDeg: number;
    sliceOptions: SliceOptions;
}

/** Field-wise staleness: is the debounce still holding back a newer reading of any knob? */
export function paramsDiffer(a: PipelineParams, b: PipelineParams): boolean {
    return (
        a.vertices !== b.vertices ||
        a.depthPercent !== b.depthPercent ||
        a.mitreToleranceDeg !== b.mitreToleranceDeg ||
        a.sliceOptions !== b.sliceOptions
    );
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the parcel pipeline over one reading of the knobs, and reports where it stopped.
 *
 * Every stage after the solve throws on an unusable input rather than returning an empty result, so
 * each is attempted only once its precondition holds and each is caught separately. The stage that
 * refused is part of the result, because "no parcels" and "the strips never got built" look
 * identical on a canvas and only one of them is a bug in the polygon.
 */
export function runParcelPipeline(params: PipelineParams, stale: boolean): ParcelPipelineResult {
    const { vertices, depthPercent, mitreToleranceDeg, sliceOptions } = params;

    const empty: ParcelPipelineResult = {
        vertices,
        stale,
        solve: null,
        complete: false,
        diagnostics: [],
        maxOffset: 0,
        depth: 0,
        offsetRings: [],
        strips: [],
        parcelsByStrip: [],
        parcels: [],
        polygonArea: polygonArea(vertices),
        parcelArea: 0,
        coverage: 0,
        sliceOptions,
        failure: null,
    };

    if (vertices.length < 3) {
        return { ...empty, failure: { stage: 'solve', message: 'A polygon needs at least three vertices.' } };
    }

    let solve: SkeletonSolveResult;
    try {
        // ON THE EXPLORER'S DERIVED FLOOR, like every other solve in this package (journal decision
        // 108(b)). The parcels page draws through the same `SceneCanvas` at the same zoom cap as the
        // two solver pages, so a skeleton computed here at the library's finer 1e-6 would carry arcs
        // this canvas cannot separate — and the strips and parcels cut from them would inherit
        // slivers no viewer can see. One client, one floor.
        solve = solveSkeleton(vertices, { perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR });
    } catch (error) {
        return { ...empty, failure: { stage: 'solve', message: describe(error) } };
    }

    const solved: ParcelPipelineResult = {
        ...empty,
        solve,
        complete: solve.complete,
        diagnostics: solve.diagnostics,
    };

    // computeMaxOffset, computeOffsetRings and computeStrips all reject an incomplete solve or a
    // merged (context-less) one. Stopping here is what keeps the page from rendering garbage.
    if (!solve.complete) {
        return solved;
    }
    if (solve.context === null) {
        // A complete solve with no context is the decompose-and-merge path: the input
        // self-intersected. Reported separately because `complete` is true and the counts are
        // all zero, which without this reads as "this polygon simply yields no parcels".
        return {
            ...solved,
            failure: {
                stage: 'offset',
                message:
                    'The polygon self-intersects, so it was decomposed and merged and no solver ' +
                    'context survives. Offsets, strips and parcels all need one. Resolve the ' +
                    'self-intersection to get parcels.',
            },
        };
    }

    let maxOffset: number;
    let depth: number;
    let offsetRings: Vector2[][];
    try {
        maxOffset = computeMaxOffset(solve);
        depth = (maxOffset * depthPercent) / 100;
        offsetRings = computeOffsetRings(solve, depth);
    } catch (error) {
        return { ...solved, failure: { stage: 'offset', message: describe(error) } };
    }

    const offset = { ...solved, maxOffset, depth, offsetRings };

    let strips: Strip[];
    try {
        // The effective minWidth doubles as the strip-level minimum edge length: an exterior
        // edge too short to host one minimum-width parcel merges into its straightest
        // neighbouring run instead of spawning a degenerate strip of its own. The mitre
        // tolerance is a human dial in degrees (180 = off); core takes radians.
        strips = computeStrips(solve, {
            depth,
            minEdgeLength: sliceOptions.minWidth,
            mitreTolerance: (mitreToleranceDeg * Math.PI) / 180,
        });
    } catch (error) {
        return { ...offset, failure: { stage: 'strips', message: describe(error) } };
    }

    const withStrips = { ...offset, strips };

    let parcelsByStrip: Parcel[][];
    try {
        parcelsByStrip = sliceStrips(strips, sliceOptions);
    } catch (error) {
        return { ...withStrips, failure: { stage: 'slice', message: describe(error) } };
    }

    const parcels = parcelsByStrip.flat();
    const parcelArea = parcels.reduce((total, parcel) => total + parcel.area, 0);

    return {
        ...withStrips,
        parcelsByStrip,
        parcels,
        parcelArea,
        coverage: empty.polygonArea > 0 ? parcelArea / empty.polygonArea : 0,
    };
}
