import type { StrokePipelineConfig, StrokePoint } from '@proc-geo/core';
import { DEFAULT_STROKE_PIPELINE_CONFIG, parseGeometryPayload, runStrokePipeline, solveSkeleton } from '@proc-geo/core';
import {
    DEFAULT_STROKE_REDUCTION_MODE,
    MAX_VERTEX_BUDGET,
    MIN_VERTEX_BUDGET,
    STROKE_REDUCTION_MODES,
    summariseStrokeCopy,
} from '../../src/components/pen-stroke/stroke-clipboard';
import type { StrokeReductionMode } from '../../src/components/pen-stroke/stroke-clipboard';
import { interpretGeometryPaste } from '../../src/components/geometry-clipboard';

/**
 * The mode control, and the invariant it must not break: what the canvas previews
 * and what the clipboard carries are one array, not two reductions that agree.
 */

const MODES: StrokeReductionMode[] = ['faithful', 'straighten'];

/** A shaky hand-drawn rectangle: straight runs the mode is supposed to recover. */
function shakyRectangle(): StrokePoint[] {
    const corners = [
        { x: 150, y: 120 },
        { x: 640, y: 120 },
        { x: 640, y: 430 },
        { x: 150, y: 430 },
    ];
    const points: StrokePoint[] = [];
    let index = 0;
    for (let c = 0; c < corners.length; c++) {
        const a = corners[c];
        const b = corners[(c + 1) % corners.length];
        const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 4));
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            points.push({
                x: a.x + (b.x - a.x) * t + Math.sin(index * 0.37) * 3,
                y: a.y + (b.y - a.y) * t + Math.sin(index * 0.29) * 3,
                t: index * 8,
            });
            index++;
        }
    }
    points.push({ ...points[0], t: index * 8 });
    return points;
}

/** An arc that stops well short of its start, so no closure threshold can join it. */
function arcStroke(sampleCount: number, radius = 200): StrokePoint[] {
    const points: StrokePoint[] = [];
    for (let i = 0; i <= sampleCount; i++) {
        const theta = (i / sampleCount) * Math.PI;
        points.push({ x: 400 + radius * Math.cos(theta), y: 300 + radius * Math.sin(theta), t: i * 8 });
    }
    return points;
}

const CLOSED_CONFIG: StrokePipelineConfig = {
    ...DEFAULT_STROKE_PIPELINE_CONFIG,
    closure: { variant: 'distance-threshold', threshold: 30 },
};

describe('the mode control', () => {
    it('offers exactly the two modes, faithful first and by default', () => {
        expect(STROKE_REDUCTION_MODES.map((m) => m.value)).toEqual(MODES);
        expect(DEFAULT_STROKE_REDUCTION_MODE).toBe('faithful');
        for (const mode of STROKE_REDUCTION_MODES) {
            expect(mode.label.length).toBeGreaterThan(0);
            expect(mode.hint.length).toBeGreaterThan(0);
        }
    });

    it('defaults to faithful when no mode is given, byte for byte', () => {
        const result = runStrokePipeline(shakyRectangle(), CLOSED_CONFIG);
        expect(summariseStrokeCopy(result, 12)).toEqual(summariseStrokeCopy(result, 12, 'faithful'));
    });

    it('reports which mode built the payload', () => {
        const result = runStrokePipeline(shakyRectangle(), CLOSED_CONFIG);
        for (const mode of MODES) {
            expect(summariseStrokeCopy(result, 12, mode).mode).toBe(mode);
        }
    });
});

describe('preview and clipboard carry the same vertices in both modes', () => {
    const result = runStrokePipeline(shakyRectangle(), CLOSED_CONFIG);

    for (const mode of MODES) {
        for (const budget of [MIN_VERTEX_BUDGET, 8, 12, 16, MAX_VERTEX_BUDGET]) {
            it(`${mode} @ budget ${String(budget)}`, () => {
                const summary = summariseStrokeCopy(result, budget, mode);
                const parsed = parseGeometryPayload(summary.text);
                expect(parsed.ok).toBe(true);
                if (!parsed.ok) return;
                expect(summary.vertices).toHaveLength(summary.vertexCount);
                expect(summary.vertices.length).toBeLessThanOrEqual(budget);
                // Exact equality, not a tolerance: the payload is serialised from
                // this very array, so anything less would let the two drift.
                expect(parsed.payload.vertices).toEqual(summary.vertices);
            });
        }
    }
});

describe('the two modes are genuinely different, and both are usable', () => {
    const result = runStrokePipeline(shakyRectangle(), CLOSED_CONFIG);

    it('straighten moves vertices the faithful mode leaves alone', () => {
        const faithful = summariseStrokeCopy(result, 12, 'faithful');
        const straight = summariseStrokeCopy(result, 12, 'straighten');
        expect(straight.straightened).toBeGreaterThan(0);
        expect(faithful.straightened).toBe(0);
        expect(straight.vertices).not.toEqual(faithful.vertices);
        expect(straight.text).not.toBe(faithful.text);
    });

    it('straighten says in the panel line how many it moved; faithful does not', () => {
        expect(summariseStrokeCopy(result, 12, 'straighten').description).toContain('Straightened');
        expect(summariseStrokeCopy(result, 12, 'faithful').description).not.toContain('Straightened');
    });

    it('both honour the budget and report a real deviation', () => {
        for (const mode of MODES) {
            for (const budget of [8, 12, 16, 24]) {
                const summary = summariseStrokeCopy(result, budget, mode);
                expect(summary.vertexCount).toBeLessThanOrEqual(budget);
                expect(summary.reduced).toBe(true);
                expect(Number.isFinite(summary.maxError)).toBe(true);
                expect(summary.maxError).toBeGreaterThan(0);
                expect(summary.description).toContain(`${String(budget)}-vertex budget`);
            }
        }
    });

    it('both produce a polygon the straight skeleton page accepts and solves', () => {
        for (const mode of MODES) {
            for (const budget of [8, 12, 16, 24]) {
                const outcome = interpretGeometryPaste(summariseStrokeCopy(result, budget, mode).text);
                expect(outcome.ok).toBe(true);
                if (!outcome.ok) return;
                expect(solveSkeleton(outcome.vertices).complete).toBe(true);
            }
        }
    }, 120000);

    it('straighten leaves an open stroke open, exactly as faithful does', () => {
        const open = runStrokePipeline(arcStroke(60), CLOSED_CONFIG);
        expect(open.closed).toBe(false);
        const summary = summariseStrokeCopy(open, 12, 'straighten');
        expect(summary.closed).toBe(false);
        expect(summary.description).toContain('Open path');
        expect(interpretGeometryPaste(summary.text).ok).toBe(false);
    });

    it('straighten puts the rectangle’s vertices closer to its true edges', () => {
        const offEdge = (v: { x: number; y: number }) =>
            Math.min(Math.abs(v.x - 150), Math.abs(v.x - 640), Math.abs(v.y - 120), Math.abs(v.y - 430));
        const mean = (mode: StrokeReductionMode) => {
            const vertices = summariseStrokeCopy(result, 12, mode).vertices;
            return vertices.reduce((sum, v) => sum + offEdge(v), 0) / vertices.length;
        };
        expect(mean('straighten')).toBeLessThan(mean('faithful'));
    });
});
