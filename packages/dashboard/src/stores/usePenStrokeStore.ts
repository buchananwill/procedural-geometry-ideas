import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current } from 'immer';
import type {
    CornerDetectionConfig,
    FittingConfig,
    SimplificationConfig,
    SmoothingConfig,
    StrokePipelineResult,
    StrokePoint,
} from '@proc-geo/core';
import { DEFAULT_STROKE_PIPELINE_CONFIG, runStrokePipeline } from '@proc-geo/core';

export interface PenStrokeStoreState {
    rawPoints: StrokePoint[];
    isDrawing: boolean;
    smoothing: SmoothingConfig;
    simplification: SimplificationConfig;
    cornerDetection: CornerDetectionConfig;
    fitting: FittingConfig;
    lerpAlpha: number;
    result: StrokePipelineResult | null;
    /** View-level toggle for the live smoothing ghost-trail preview; no pipeline recompute. */
    smoothingPreviewEnabled: boolean;

    beginStroke: (p: StrokePoint) => void;
    appendPoint: (p: StrokePoint) => void;
    endStroke: () => void;
    clearStroke: () => void;
    setSmoothing: (config: SmoothingConfig) => void;
    setSimplification: (config: SimplificationConfig) => void;
    setCornerDetection: (config: CornerDetectionConfig) => void;
    setFitting: (config: FittingConfig) => void;
    setLerpAlpha: (alpha: number) => void;
    setSmoothingPreviewEnabled: (enabled: boolean) => void;
}

/** Re-run the full pipeline from the stored raw input (the fixture until re-drawn). */
function rerun(s: PenStrokeStoreState) {
    if (s.isDrawing || s.rawPoints.length < 2) {
        s.result = null;
        return;
    }
    const plain = current(s);
    s.result = runStrokePipeline(plain.rawPoints, {
        smoothing: plain.smoothing,
        simplification: plain.simplification,
        cornerDetection: plain.cornerDetection,
        fitting: plain.fitting,
    }) as StrokePipelineResult;
}

export const usePenStrokeStore = create<PenStrokeStoreState>()(
    immer((set) => ({
        rawPoints: [],
        isDrawing: false,
        smoothing: DEFAULT_STROKE_PIPELINE_CONFIG.smoothing,
        simplification: DEFAULT_STROKE_PIPELINE_CONFIG.simplification,
        cornerDetection: DEFAULT_STROKE_PIPELINE_CONFIG.cornerDetection,
        fitting: DEFAULT_STROKE_PIPELINE_CONFIG.fitting,
        lerpAlpha: 1,
        result: null,
        smoothingPreviewEnabled: false,

        beginStroke: (p) =>
            set((s) => {
                s.rawPoints = [p];
                s.isDrawing = true;
                s.result = null;
            }),

        appendPoint: (p) =>
            set((s) => {
                if (!s.isDrawing) return;
                s.rawPoints.push(p);
            }),

        endStroke: () =>
            set((s) => {
                if (!s.isDrawing) return;
                s.isDrawing = false;
                rerun(s);
            }),

        clearStroke: () =>
            set((s) => {
                s.rawPoints = [];
                s.isDrawing = false;
                s.result = null;
            }),

        setSmoothing: (config) =>
            set((s) => {
                s.smoothing = config;
                rerun(s);
            }),

        setSimplification: (config) =>
            set((s) => {
                s.simplification = config;
                rerun(s);
            }),

        setCornerDetection: (config) =>
            set((s) => {
                s.cornerDetection = config;
                rerun(s);
            }),

        setFitting: (config) =>
            set((s) => {
                s.fitting = config;
                rerun(s);
            }),

        setLerpAlpha: (alpha) =>
            set((s) => {
                s.lerpAlpha = alpha;
            }),

        setSmoothingPreviewEnabled: (enabled) =>
            set((s) => {
                s.smoothingPreviewEnabled = enabled;
            }),
    }))
);
