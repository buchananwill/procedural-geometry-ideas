import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current } from 'immer';
import type {
    ClosureConfig,
    CornerDetectionConfig,
    FittingConfig,
    SimplificationConfig,
    SmoothingConfig,
    StrokePipelineResult,
    StrokePoint,
} from '@proc-geo/core';
import { DEFAULT_STROKE_PIPELINE_CONFIG, DEFAULT_VERTEX_BUDGET, runStrokePipeline } from '@proc-geo/core';
import type { StrokeClipboardSummary } from '../components/pen-stroke/stroke-clipboard';
import { clampVertexBudget, summariseStrokeCopy } from '../components/pen-stroke/stroke-clipboard';

export interface PenStrokeStoreState {
    rawPoints: StrokePoint[];
    isDrawing: boolean;
    smoothing: SmoothingConfig;
    simplification: SimplificationConfig;
    cornerDetection: CornerDetectionConfig;
    fitting: FittingConfig;
    /**
     * Loop closure. The pipeline defaults this to `pass-through`, which makes
     * `result.closed` permanently false and so makes every copied payload an
     * open path the straight skeleton must refuse. It is a store field because
     * the copy control needs it to be reachable from the UI.
     */
    closure: ClosureConfig;
    /**
     * Vertex ceiling applied to the copied payload. Not a pipeline stage — it is
     * applied to the pipeline's output on the way to the clipboard — but it lives
     * here because the canvas overlay and the copy button must budget to the same
     * number, and a number two components both read is a store field.
     */
    vertexBudget: number;
    lerpAlpha: number;
    result: StrokePipelineResult | null;
    /**
     * The clipboard payload for the current result at the current budget,
     * computed once here.
     *
     * It is state rather than a per-component `useMemo` because two consumers
     * need it — the copy button writes `text`, the canvas overlay draws
     * `vertices` — and budgeting twice from the same inputs would make "the
     * preview shows exactly what will be exported" a coincidence that holds only
     * while both call sites happen to agree. Recomputed wherever `result` or
     * `vertexBudget` changes, and nowhere else.
     */
    copySummary: StrokeClipboardSummary | null;
    /** View-level toggle for the live smoothing ghost-trail preview; no pipeline recompute. */
    smoothingPreviewEnabled: boolean;
    /** View-level toggle for drawing the budget-clamped polygon over the stroke. Off by default. */
    budgetPreviewEnabled: boolean;

    beginStroke: (p: StrokePoint) => void;
    appendPoint: (p: StrokePoint) => void;
    endStroke: () => void;
    clearStroke: () => void;
    setSmoothing: (config: SmoothingConfig) => void;
    setSimplification: (config: SimplificationConfig) => void;
    setCornerDetection: (config: CornerDetectionConfig) => void;
    setFitting: (config: FittingConfig) => void;
    setClosure: (config: ClosureConfig) => void;
    setVertexBudget: (budget: number) => void;
    setLerpAlpha: (alpha: number) => void;
    setSmoothingPreviewEnabled: (enabled: boolean) => void;
    setBudgetPreviewEnabled: (enabled: boolean) => void;
}

/** Re-run the full pipeline from the stored raw input (the fixture until re-drawn). */
function rerun(s: PenStrokeStoreState) {
    if (s.isDrawing || s.rawPoints.length < 2) {
        s.result = null;
        s.copySummary = null;
        return;
    }
    const plain = current(s);
    const result = runStrokePipeline(plain.rawPoints, {
        smoothing: plain.smoothing,
        simplification: plain.simplification,
        cornerDetection: plain.cornerDetection,
        fitting: plain.fitting,
        closure: plain.closure,
    }) as StrokePipelineResult;
    s.result = result;
    s.copySummary = summariseStrokeCopy(result, plain.vertexBudget);
}

/**
 * Closure is on by default, at a seam gap a hand can hit without aiming.
 * `distance-threshold` only closes a stroke whose last sample actually returned
 * to its first, so a genuinely open stroke is unaffected.
 */
const DEFAULT_CLOSURE: ClosureConfig = { variant: 'distance-threshold', threshold: 30 };

export const usePenStrokeStore = create<PenStrokeStoreState>()(
    immer((set) => ({
        rawPoints: [],
        isDrawing: false,
        smoothing: DEFAULT_STROKE_PIPELINE_CONFIG.smoothing,
        simplification: DEFAULT_STROKE_PIPELINE_CONFIG.simplification,
        cornerDetection: DEFAULT_STROKE_PIPELINE_CONFIG.cornerDetection,
        fitting: DEFAULT_STROKE_PIPELINE_CONFIG.fitting,
        closure: DEFAULT_CLOSURE,
        vertexBudget: DEFAULT_VERTEX_BUDGET,
        lerpAlpha: 1,
        result: null,
        copySummary: null,
        smoothingPreviewEnabled: false,
        budgetPreviewEnabled: false,

        beginStroke: (p) =>
            set((s) => {
                s.rawPoints = [p];
                s.isDrawing = true;
                s.result = null;
                s.copySummary = null;
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
                s.copySummary = null;
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

        setClosure: (config) =>
            set((s) => {
                s.closure = config;
                rerun(s);
            }),

        setVertexBudget: (budget) =>
            set((s) => {
                const clamped = clampVertexBudget(budget);
                if (clamped === s.vertexBudget) return;
                s.vertexBudget = clamped;
                // Only the budgeting is redone: the budget is applied to the
                // pipeline's output, so nothing upstream of it can have changed.
                const plain = current(s);
                s.copySummary = plain.result ? summariseStrokeCopy(plain.result, clamped) : null;
            }),

        setLerpAlpha: (alpha) =>
            set((s) => {
                s.lerpAlpha = alpha;
            }),

        setSmoothingPreviewEnabled: (enabled) =>
            set((s) => {
                s.smoothingPreviewEnabled = enabled;
            }),

        setBudgetPreviewEnabled: (enabled) =>
            set((s) => {
                s.budgetPreviewEnabled = enabled;
            }),
    }))
);
