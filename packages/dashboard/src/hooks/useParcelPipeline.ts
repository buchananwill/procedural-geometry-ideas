import { useEffect, useMemo } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import type { SliceOptions } from '@proc-geo/core';
import type { Vertex } from '../stores/usePolygonStore';
import {
    deriveSliceDefaults,
    effectiveSliceOptions,
    useParcelStore,
} from '../stores/useParcelStore';
import { paramsDiffer, runParcelPipeline } from './parcel-pipeline';
import type { PipelineParams, ParcelPipelineResult } from './parcel-pipeline';

export type {
    ParcelPipelineFailure,
    ParcelPipelineResult,
    ParcelPipelineStage,
    PipelineParams,
} from './parcel-pipeline';
export { runParcelPipeline } from './parcel-pipeline';

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

/**
 * Reads the parcel knobs, debounces them, and runs {@link runParcelPipeline} over the result.
 *
 * THE ARITHMETIC IS NOT HERE. This hook owns exactly the three things that need React — the two
 * debounces, the memo the page re-renders against, and the effect that refreshes the derived slice
 * defaults — and the pipeline itself lives in `parcel-pipeline.ts` as a pure function. It was split
 * out so that what the page computes, and in particular the perceptual floor it solves at, can be
 * asserted without mounting anything.
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
    const mitreToleranceDeg = useParcelStore((s) => s.mitreToleranceDeg);
    const seed = useParcelStore((s) => s.seed);
    const setDerived = useParcelStore((s) => s.setDerived);

    const sliceOptions = useMemo<SliceOptions>(
        () => effectiveSliceOptions({ derived, overrides, splitIrregularity, seed }),
        [derived, overrides, splitIrregularity, seed],
    );

    // The polygon debounces slower than the knobs — a re-solve costs far more than a re-cut — so
    // the debounced group is assembled from individually debounced fields rather than debounced
    // as one object.
    const [debouncedVertices] = useDebouncedValue(vertices, POLYGON_DEBOUNCE_MS);
    const [debouncedDepthPercent] = useDebouncedValue(depthPercent, PARAMETER_DEBOUNCE_MS);
    const [debouncedMitreToleranceDeg] = useDebouncedValue(mitreToleranceDeg, PARAMETER_DEBOUNCE_MS);
    const [debouncedSliceOptions] = useDebouncedValue(sliceOptions, PARAMETER_DEBOUNCE_MS);

    const liveParams = useMemo<PipelineParams>(
        () => ({ vertices, depthPercent, mitreToleranceDeg, sliceOptions }),
        [vertices, depthPercent, mitreToleranceDeg, sliceOptions],
    );
    const debouncedParams = useMemo<PipelineParams>(
        () => ({
            vertices: debouncedVertices,
            depthPercent: debouncedDepthPercent,
            mitreToleranceDeg: debouncedMitreToleranceDeg,
            sliceOptions: debouncedSliceOptions,
        }),
        [debouncedVertices, debouncedDepthPercent, debouncedMitreToleranceDeg, debouncedSliceOptions],
    );

    useEffect(() => {
        setDerived(deriveSliceDefaults(debouncedVertices));
    }, [debouncedVertices, setDerived]);

    return useMemo<ParcelPipelineResult>(
        () => runParcelPipeline(debouncedParams, paramsDiffer(liveParams, debouncedParams)),
        [liveParams, debouncedParams],
    );
}
