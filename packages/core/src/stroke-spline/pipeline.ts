import type { Vector2 } from '../straight-skeleton/types';
import type {
    ClosureConfig,
    CornerDetectionConfig,
    FittingConfig,
    SimplificationConfig,
    SmoothingConfig,
    StrokePipelineConfig,
    StrokePipelineResult,
    StrokePoint,
} from './types';
import { smoothStroke } from './smoothing';
import { simplifyStroke } from './simplification';
import { detectCorners } from './corner-detection';
import { fitStroke } from './fitting';
import { applyClosure, closeFittedChain } from './closure';
import { mapByArcLengthFraction, mapRawToSpline } from './correspondence';

const OPEN_CLOSURE_CONFIG: ClosureConfig = { variant: 'pass-through' };

export const DEFAULT_STROKE_PIPELINE_CONFIG: StrokePipelineConfig = {
    smoothing: { variant: 'moving-average', windowSize: 5 },
    simplification: { variant: 'pass-through' },
    cornerDetection: { variant: 'pass-through' },
    fitting: { variant: 'schneider', errorTolerance: 4 },
    closure: { variant: 'pass-through' },
};

/** Default config per variant, used when a stage's dropdown selection changes. */
export const SMOOTHING_VARIANT_DEFAULTS: Record<SmoothingConfig['variant'], SmoothingConfig> = {
    'pass-through': { variant: 'pass-through' },
    'moving-average': { variant: 'moving-average', windowSize: 5 },
    'gaussian': { variant: 'gaussian', sigma: 2 },
    'one-euro': { variant: 'one-euro', minCutoff: 1, beta: 0.005 },
    'chaikin': { variant: 'chaikin', iterations: 3 },
};

export const SIMPLIFICATION_VARIANT_DEFAULTS: Record<SimplificationConfig['variant'], SimplificationConfig> = {
    'pass-through': { variant: 'pass-through' },
    'rdp': { variant: 'rdp', epsilon: 2 },
    'resample': { variant: 'resample', spacing: 10 },
};

export const CORNER_DETECTION_VARIANT_DEFAULTS: Record<CornerDetectionConfig['variant'], CornerDetectionConfig> = {
    'pass-through': { variant: 'pass-through' },
    // Span 4: at typical pointer sample density, upstream smoothing spreads a
    // hand-drawn corner over several samples; a tighter span misses it.
    'angle-threshold': { variant: 'angle-threshold', thresholdDeg: 60, span: 4 },
};

export const FITTING_VARIANT_DEFAULTS: Record<FittingConfig['variant'], FittingConfig> = {
    'pass-through': { variant: 'pass-through' },
    'schneider': { variant: 'schneider', errorTolerance: 4 },
    'catmull-rom': { variant: 'catmull-rom', alpha: 0.5 },
};

export const CLOSURE_VARIANT_DEFAULTS: Record<ClosureConfig['variant'], ClosureConfig> = {
    'pass-through': { variant: 'pass-through' },
    // 20px: the slack a hand leaves when returning a loop to its start, and
    // comfortably above the few px that smoothing shifts the endpoints by.
    'distance-threshold': { variant: 'distance-threshold', threshold: 20 },
};

export function runStrokePipeline(raw: StrokePoint[], config: StrokePipelineConfig): StrokePipelineResult {
    const smoothed = smoothStroke(raw, config.smoothing);
    const simplified = simplifyStroke(smoothed, config.simplification);
    const detected = detectCorners(simplified, config.cornerDetection);
    const { closed, corners, seam } = applyClosure(
        raw,
        detected,
        config.closure ?? OPEN_CLOSURE_CONFIG,
        config.cornerDetection,
    );
    const fit = fitStroke(corners, config.fitting, seam);
    if (closed && fit) closeFittedChain(fit);

    let correspondence: Vector2[];
    if (fit) {
        correspondence = mapRawToSpline(raw, corners.points.length, fit);
    } else {
        // Pass-through fitting: the final polyline itself is the morph target.
        correspondence =
            corners.points.length === raw.length
                ? corners.points.map((p) => ({ x: p.x, y: p.y }))
                : mapByArcLengthFraction(raw, corners.points);
    }

    return { raw, smoothed, simplified, corners, fit, correspondence, closed };
}

/** View-level morph between the raw capture and its spline correspondence. */
export function lerpStroke(raw: StrokePoint[], correspondence: Vector2[], alpha: number): Vector2[] {
    return raw.map((p, i) => {
        const target = correspondence[i] ?? p;
        return {
            x: p.x + (target.x - p.x) * alpha,
            y: p.y + (target.y - p.y) * alpha,
        };
    });
}
