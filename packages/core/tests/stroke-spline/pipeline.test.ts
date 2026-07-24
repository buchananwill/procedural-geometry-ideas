import {
    DEFAULT_STROKE_PIPELINE_CONFIG,
    lerpStroke,
    runStrokePipeline,
    smoothStroke,
} from "@proc-geo/core";
import type { StrokePipelineConfig, StrokePoint } from "@proc-geo/core";

function makeStroke(count: number, fn: (i: number) => { x: number; y: number }): StrokePoint[] {
    const out: StrokePoint[] = [];
    for (let i = 0; i < count; i++) {
        out.push({ ...fn(i), t: i * 8 });
    }
    return out;
}

const PASS_THROUGH_CONFIG: StrokePipelineConfig = {
    smoothing: { variant: 'pass-through' },
    simplification: { variant: 'pass-through' },
    cornerDetection: { variant: 'pass-through' },
    fitting: { variant: 'pass-through' },
};

describe("smoothStroke (moving average)", () => {
    it("preserves point count, endpoints, timestamps, and pressure", () => {
        const stroke = makeStroke(30, (i) => ({ x: i * 10, y: (i % 2) * 6 }));
        stroke[10].pressure = 0.7;
        const smoothed = smoothStroke(stroke, { variant: 'moving-average', windowSize: 5 });
        expect(smoothed.length).toBe(stroke.length);
        expect(smoothed[0]).toEqual(stroke[0]);
        expect(smoothed[29]).toEqual(stroke[29]);
        expect(smoothed[10].t).toBe(stroke[10].t);
        expect(smoothed[10].pressure).toBe(0.7);
    });

    it("reduces zigzag amplitude in the interior", () => {
        const stroke = makeStroke(41, (i) => ({ x: i * 10, y: (i % 2) * 10 }));
        const smoothed = smoothStroke(stroke, { variant: 'moving-average', windowSize: 5 });
        const rawSpread = Math.max(...stroke.slice(5, 35).map((p) => Math.abs(p.y - 5)));
        const smoothSpread = Math.max(...smoothed.slice(5, 35).map((p) => Math.abs(p.y - 5)));
        expect(smoothSpread).toBeLessThan(rawSpread / 2);
    });
});

describe("runStrokePipeline", () => {
    it("all-pass-through: correspondence is the identity over raw positions", () => {
        const stroke = makeStroke(25, (i) => ({ x: i * 7, y: 40 * Math.sin(i / 4) }));
        const result = runStrokePipeline(stroke, PASS_THROUGH_CONFIG);
        expect(result.fit).toBeNull();
        expect(result.correspondence.length).toBe(stroke.length);
        result.correspondence.forEach((c, i) => {
            expect(c.x).toBeCloseTo(stroke[i].x);
            expect(c.y).toBeCloseTo(stroke[i].y);
        });
        // Lerp is a no-op at any alpha when raw and target coincide.
        const mid = lerpStroke(result.raw, result.correspondence, 0.5);
        mid.forEach((p, i) => {
            expect(p.x).toBeCloseTo(stroke[i].x);
            expect(p.y).toBeCloseTo(stroke[i].y);
        });
    });

    it("default config produces a fit and an index-matched correspondence", () => {
        const stroke = makeStroke(80, (i) => ({
            x: i * 5,
            y: 70 * Math.sin(i / 12) + 1.2 * Math.sin(i * 12.9898),
        }));
        const result = runStrokePipeline(stroke, DEFAULT_STROKE_PIPELINE_CONFIG);
        expect(result.fit).not.toBeNull();
        expect(result.fit!.segments.length).toBeGreaterThanOrEqual(1);
        expect(result.smoothed.length).toBe(stroke.length);
        expect(result.correspondence.length).toBe(stroke.length);
        result.correspondence.forEach((c) => {
            expect(Number.isFinite(c.x)).toBe(true);
            expect(Number.isFinite(c.y)).toBe(true);
        });
    });

    it("lerp endpoints: alpha 0 is the raw stroke, alpha 1 is the correspondence", () => {
        const stroke = makeStroke(60, (i) => ({ x: i * 6, y: 50 * Math.cos(i / 9) }));
        const result = runStrokePipeline(stroke, DEFAULT_STROKE_PIPELINE_CONFIG);
        const atZero = lerpStroke(result.raw, result.correspondence, 0);
        const atOne = lerpStroke(result.raw, result.correspondence, 1);
        atZero.forEach((p, i) => {
            expect(p.x).toBeCloseTo(stroke[i].x);
            expect(p.y).toBeCloseTo(stroke[i].y);
        });
        atOne.forEach((p, i) => {
            expect(p.x).toBeCloseTo(result.correspondence[i].x);
            expect(p.y).toBeCloseTo(result.correspondence[i].y);
        });
    });

    it("correspondence targets sit within fit tolerance of the smoothed stroke", () => {
        const stroke = makeStroke(100, (i) => ({ x: i * 4, y: 60 * Math.sin(i / 15) }));
        const config: StrokePipelineConfig = {
            ...DEFAULT_STROKE_PIPELINE_CONFIG,
            fitting: { variant: 'schneider', errorTolerance: 3 },
        };
        const result = runStrokePipeline(stroke, config);
        expect(result.fit).not.toBeNull();
        result.correspondence.forEach((c, i) => {
            const s = result.smoothed[i];
            const d = Math.hypot(c.x - s.x, c.y - s.y);
            expect(d).toBeLessThanOrEqual(3 + 1e-9);
        });
    });

    it("handles degenerate strokes without throwing", () => {
        const single = makeStroke(1, () => ({ x: 10, y: 10 }));
        const result = runStrokePipeline(single, DEFAULT_STROKE_PIPELINE_CONFIG);
        expect(result.fit).toBeNull();
        expect(result.correspondence.length).toBe(1);

        const empty = runStrokePipeline([], DEFAULT_STROKE_PIPELINE_CONFIG);
        expect(empty.correspondence.length).toBe(0);
    });
});
