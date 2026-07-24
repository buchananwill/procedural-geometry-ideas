import type { Vector2 } from '../straight-skeleton/types';
import type {
    CornerDetectionConfig,
    CornerDetectionResult,
    FittingConfig,
    FitResult,
    SimplificationConfig,
    StrokePipelineConfig,
    StrokePipelineResult,
    StrokePoint,
} from './types';
import { smoothStroke } from './smoothing';
import { fitStrokeSpline } from './schneider';
import { mapByArcLengthFraction, mapRawToSpline } from './correspondence';

export const DEFAULT_STROKE_PIPELINE_CONFIG: StrokePipelineConfig = {
    smoothing: { variant: 'moving-average', windowSize: 5 },
    simplification: { variant: 'pass-through' },
    cornerDetection: { variant: 'pass-through' },
    fitting: { variant: 'schneider', errorTolerance: 4 },
};

function simplifyStroke(points: StrokePoint[], config: SimplificationConfig): StrokePoint[] {
    switch (config.variant) {
        case 'pass-through':
            return points.slice();
        default: {
            const _exhaustive: never = config.variant;
            return _exhaustive;
        }
    }
}

function detectCorners(points: StrokePoint[], config: CornerDetectionConfig): CornerDetectionResult {
    switch (config.variant) {
        case 'pass-through':
            return { points: points.slice(), cornerIndices: [] };
        default: {
            const _exhaustive: never = config.variant;
            return _exhaustive;
        }
    }
}

function fitStroke(corners: CornerDetectionResult, config: FittingConfig): FitResult | null {
    switch (config.variant) {
        case 'pass-through':
            return null;
        case 'schneider':
            return fitStrokeSpline(corners.points, config.errorTolerance);
        default: {
            const _exhaustive: never = config;
            return _exhaustive;
        }
    }
}

export function runStrokePipeline(raw: StrokePoint[], config: StrokePipelineConfig): StrokePipelineResult {
    const smoothed = smoothStroke(raw, config.smoothing);
    const simplified = simplifyStroke(smoothed, config.simplification);
    const corners = detectCorners(simplified, config.cornerDetection);
    const fit = fitStroke(corners, config.fitting);

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

    return { raw, smoothed, simplified, corners, fit, correspondence };
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
