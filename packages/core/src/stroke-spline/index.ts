export type {
    StrokePoint,
    CubicBezier,
    SmoothingConfig,
    SimplificationConfig,
    CornerDetectionConfig,
    FittingConfig,
    StrokePipelineConfig,
    CornerDetectionResult,
    SplineParameterization,
    FitResult,
    StrokePipelineResult,
} from './types';

export { evaluateCubicBezier, cubicBezierDerivative, cubicBezierSecondDerivative } from './bezier';
export { smoothStroke } from './smoothing';
export { fitStrokeSpline } from './schneider';
export { mapByArcLengthFraction, flattenSpline, mapRawToSpline } from './correspondence';
export { runStrokePipeline, lerpStroke, DEFAULT_STROKE_PIPELINE_CONFIG } from './pipeline';
