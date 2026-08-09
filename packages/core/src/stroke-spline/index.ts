export type {
    StrokePoint,
    CubicBezier,
    SmoothingConfig,
    SimplificationConfig,
    CornerDetectionConfig,
    FittingConfig,
    ClosureConfig,
    SeamNeighbours,
    StrokePipelineConfig,
    CornerDetectionResult,
    SplineParameterization,
    FitResult,
    StrokePipelineResult,
} from './types';

export { evaluateCubicBezier, cubicBezierDerivative, cubicBezierSecondDerivative } from './bezier';
export { smoothStroke } from './smoothing';
export { simplifyStroke } from './simplification';
export { detectCorners } from './corner-detection';
export { fitStrokeSpline } from './schneider';
export { fitCatmullRom } from './catmull-rom';
export { fitStroke } from './fitting';
export { mapByArcLengthFraction, flattenSpline, mapRawToSpline } from './correspondence';
export { isStrokeClosed, isSeamCorner, closeFittedChain } from './closure';
export type { VertexBudgetResult } from './vertex-budget';
export {
    reduceToVertexBudget,
    reduceRingToVertexBudget,
    strokeToBudgetedPolygon,
    strokeToRing,
    hasRedundantSeam,
    DEFAULT_VERTEX_BUDGET,
} from './vertex-budget';
export type { StraightenedBudgetResult, StraightenOptions } from './straighten';
export { straightenToVertexBudget, strokeToStraightenedPolygon } from './straighten';
export {
    runStrokePipeline,
    lerpStroke,
    DEFAULT_STROKE_PIPELINE_CONFIG,
    SMOOTHING_VARIANT_DEFAULTS,
    SIMPLIFICATION_VARIANT_DEFAULTS,
    CORNER_DETECTION_VARIANT_DEFAULTS,
    FITTING_VARIANT_DEFAULTS,
    CLOSURE_VARIANT_DEFAULTS,
} from './pipeline';
