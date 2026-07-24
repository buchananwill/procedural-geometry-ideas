import type { Vector2 } from '../straight-skeleton/types';

/** A single captured input sample. `t` is the pointer-event timestamp (ms). */
export interface StrokePoint {
    x: number;
    y: number;
    t: number;
    pressure?: number;
}

export interface CubicBezier {
    p0: Vector2;
    p1: Vector2;
    p2: Vector2;
    p3: Vector2;
}

// ── Stage configs (discriminated unions on `variant`) ────────────────────────

export type SmoothingConfig =
    | { variant: 'pass-through' }
    | { variant: 'moving-average'; windowSize: number }
    | { variant: 'gaussian'; sigma: number }
    | { variant: 'one-euro'; minCutoff: number; beta: number }
    | { variant: 'chaikin'; iterations: number };

export type SimplificationConfig =
    | { variant: 'pass-through' }
    | { variant: 'rdp'; epsilon: number }
    | { variant: 'resample'; spacing: number };

export type CornerDetectionConfig =
    | { variant: 'pass-through' }
    | { variant: 'angle-threshold'; thresholdDeg: number; span: number };

export type FittingConfig =
    | { variant: 'pass-through' }
    | { variant: 'schneider'; errorTolerance: number }
    | { variant: 'catmull-rom'; alpha: number };

export interface StrokePipelineConfig {
    smoothing: SmoothingConfig;
    simplification: SimplificationConfig;
    cornerDetection: CornerDetectionConfig;
    fitting: FittingConfig;
}

// ── Stage outputs ────────────────────────────────────────────────────────────

export interface CornerDetectionResult {
    points: StrokePoint[];
    /** Indices into `points` that fitting must treat as hard breakpoints. Empty for pass-through. */
    cornerIndices: number[];
}

/** Location of one fitted input point on the spline. */
export interface SplineParameterization {
    segmentIndex: number;
    t: number;
}

export interface FitResult {
    segments: CubicBezier[];
    /** One entry per fitted input point (duplicates share their representative's entry). */
    parameterization: SplineParameterization[];
    /** Max distance between any fitted input point and its position on the accepted spline. */
    maxError: number;
}

export interface StrokePipelineResult {
    raw: StrokePoint[];
    smoothed: StrokePoint[];
    simplified: StrokePoint[];
    corners: CornerDetectionResult;
    /** Null when the fitting stage is pass-through or the stroke is too short to fit. */
    fit: FitResult | null;
    /** Index-matched to `raw`: each raw point's target position on the final curve. */
    correspondence: Vector2[];
}
