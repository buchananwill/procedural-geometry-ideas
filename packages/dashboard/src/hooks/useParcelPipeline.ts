import { useEffect, useMemo } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
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
import type { Vertex } from '../stores/usePolygonStore';
import {
    deriveSliceDefaults,
    effectiveSliceOptions,
    polygonArea,
    useParcelStore,
} from '../stores/useParcelStore';

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
 * Debounce for the polygon. The solve is cubic in vertex count, so a pasted 200-vertex outline is
 * seconds of work on the main thread; re-running it on every drag frame would wedge the page.
 */
const POLYGON_DEBOUNCE_MS = 250;

/**
 * Debounce for the knobs. Shorter, because sweeping the depth slider is the whole point of the page
 * and it has to feel like a sweep, but not zero, because every step re-cuts the strips.
 */
const PARAMETER_DEBOUNCE_MS = 90;

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the parcel pipeline — solve, offset, strips, slice — and reports where it stopped.
 *
 * Every stage after the solve throws on an unusable input rather than returning an empty result, so
 * each is attempted only once its precondition holds and each is caught separately. The stage that
 * refused is part of the result, because "no parcels" and "the strips never got built" look
 * identical on a canvas and only one of them is a bug in the polygon.
 *
 * The derived slice defaults are refreshed here rather than in the store, because they are a
 * function of the same debounced polygon this hook already holds; deriving them anywhere else would
 * mean a second, differently-timed copy of that polygon.
 */
export function useParcelPipeline(vertices: Vertex[]): ParcelPipelineResult {
    const depthPercent = useParcelStore((s) => s.depthPercent);
    const derived = useParcelStore((s) => s.derived);
    const overrides = useParcelStore((s) => s.overrides);
    const splitIrregularity = useParcelStore((s) => s.splitIrregularity);
    const seed = useParcelStore((s) => s.seed);
    const setDerived = useParcelStore((s) => s.setDerived);

    const [debouncedVertices] = useDebouncedValue(vertices, POLYGON_DEBOUNCE_MS);
    const [debouncedDepthPercent] = useDebouncedValue(depthPercent, PARAMETER_DEBOUNCE_MS);

    const sliceOptions = useMemo<SliceOptions>(
        () => effectiveSliceOptions({ derived, overrides, splitIrregularity, seed }),
        [derived, overrides, splitIrregularity, seed],
    );
    const [debouncedSliceOptions] = useDebouncedValue(sliceOptions, PARAMETER_DEBOUNCE_MS);

    useEffect(() => {
        setDerived(deriveSliceDefaults(debouncedVertices));
    }, [debouncedVertices, setDerived]);

    return useMemo<ParcelPipelineResult>(() => {
        const stale =
            debouncedVertices !== vertices ||
            debouncedDepthPercent !== depthPercent ||
            debouncedSliceOptions !== sliceOptions;

        const empty: ParcelPipelineResult = {
            vertices: debouncedVertices,
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
            polygonArea: polygonArea(debouncedVertices),
            parcelArea: 0,
            coverage: 0,
            sliceOptions: debouncedSliceOptions,
            failure: null,
        };

        if (debouncedVertices.length < 3) {
            return { ...empty, failure: { stage: 'solve', message: 'A polygon needs at least three vertices.' } };
        }

        let solve: SkeletonSolveResult;
        try {
            solve = solveSkeleton(debouncedVertices);
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
            depth = (maxOffset * debouncedDepthPercent) / 100;
            offsetRings = computeOffsetRings(solve, depth);
        } catch (error) {
            return { ...solved, failure: { stage: 'offset', message: describe(error) } };
        }

        const offset = { ...solved, maxOffset, depth, offsetRings };

        let strips: Strip[];
        try {
            strips = computeStrips(solve, { depth });
        } catch (error) {
            return { ...offset, failure: { stage: 'strips', message: describe(error) } };
        }

        const withStrips = { ...offset, strips };

        let parcelsByStrip: Parcel[][];
        try {
            parcelsByStrip = sliceStrips(strips, debouncedSliceOptions);
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
    }, [
        vertices,
        depthPercent,
        sliceOptions,
        debouncedVertices,
        debouncedDepthPercent,
        debouncedSliceOptions,
    ]);
}
