import {
    detectCorners,
    evaluateCubicBezier,
    fitCatmullRom,
    fitStroke,
    runStrokePipeline,
    simplifyStroke,
    smoothStroke,
    DEFAULT_STROKE_PIPELINE_CONFIG,
} from "@proc-geo/core";
import type { StrokePipelineConfig, StrokePoint, Vector2 } from "@proc-geo/core";

function makeStroke(count: number, fn: (i: number) => { x: number; y: number }): StrokePoint[] {
    const out: StrokePoint[] = [];
    for (let i = 0; i < count; i++) {
        out.push({ ...fn(i), t: i * 8 });
    }
    return out;
}

/** An L-shaped stroke: right along y=0, then down from (100, 0). */
function makeLStroke(): StrokePoint[] {
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= 20; i++) pts.push({ x: i * 5, y: 0, t: i * 8 });
    for (let i = 1; i <= 20; i++) pts.push({ x: 100, y: i * 5, t: (20 + i) * 8 });
    return pts;
}

describe("smoothing variants", () => {
    const zigzag = makeStroke(41, (i) => ({ x: i * 10, y: (i % 2) * 10 }));

    it("gaussian: preserves count and endpoints, reduces zigzag amplitude", () => {
        const smoothed = smoothStroke(zigzag, { variant: 'gaussian', sigma: 2 });
        expect(smoothed.length).toBe(zigzag.length);
        expect(smoothed[0]).toEqual(zigzag[0]);
        expect(smoothed[40]).toEqual(zigzag[40]);
        const spread = Math.max(...smoothed.slice(5, 35).map((p) => Math.abs(p.y - 5)));
        expect(spread).toBeLessThan(2);
    });

    it("one-euro: preserves count and first point, reduces jitter", () => {
        const smoothed = smoothStroke(zigzag, { variant: 'one-euro', minCutoff: 1, beta: 0.005 });
        expect(smoothed.length).toBe(zigzag.length);
        expect(smoothed[0]).toEqual(zigzag[0]);
        const rawSpread = Math.max(...zigzag.slice(10, 35).map((p) => Math.abs(p.y - 5)));
        const smoothSpread = Math.max(...smoothed.slice(10, 35).map((p) => Math.abs(p.y - 5)));
        expect(smoothSpread).toBeLessThan(rawSpread / 2);
        smoothed.forEach((p) => {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
        });
    });

    it("one-euro: tolerates non-increasing timestamps", () => {
        const stroke = makeStroke(10, (i) => ({ x: i * 10, y: 0 }));
        stroke.forEach((p) => (p.t = 100));
        const smoothed = smoothStroke(stroke, { variant: 'one-euro', minCutoff: 1, beta: 0.005 });
        smoothed.forEach((p) => expect(Number.isFinite(p.x)).toBe(true));
    });

    it("chaikin: roughly doubles point count per iteration, keeps endpoints, interpolates metadata", () => {
        const stroke = makeStroke(11, (i) => ({ x: i * 10, y: (i % 2) * 20 }));
        const once = smoothStroke(stroke, { variant: 'chaikin', iterations: 1 });
        expect(once.length).toBe(2 * (stroke.length - 1) + 2);
        expect(once[0]).toEqual(stroke[0]);
        expect(once[once.length - 1]).toEqual(stroke[stroke.length - 1]);
        for (let i = 1; i < once.length; i++) {
            expect(once[i].t).toBeGreaterThanOrEqual(once[i - 1].t);
        }
        const twice = smoothStroke(stroke, { variant: 'chaikin', iterations: 2 });
        expect(twice.length).toBeGreaterThan(once.length);
    });
});

describe("simplification variants", () => {
    it("rdp: collapses a nearly straight line to its endpoints", () => {
        const stroke = makeStroke(50, (i) => ({ x: i * 4, y: 0.3 * Math.sin(i) }));
        const simplified = simplifyStroke(stroke, { variant: 'rdp', epsilon: 1 });
        expect(simplified.length).toBe(2);
        expect(simplified[0]).toEqual(stroke[0]);
        expect(simplified[1]).toEqual(stroke[49]);
    });

    it("rdp: keeps the apex of an L and returns a subset of the input", () => {
        const stroke = makeLStroke();
        const simplified = simplifyStroke(stroke, { variant: 'rdp', epsilon: 1 });
        expect(simplified.length).toBe(3);
        expect(simplified.some((p) => p.x === 100 && p.y === 0)).toBe(true);
        simplified.forEach((p) => expect(stroke).toContain(p));
    });

    it("resample: emits near-uniform spacing and keeps both endpoints", () => {
        const stroke = makeStroke(80, (i) => ({ x: i * 3, y: 30 * Math.sin(i / 8) }));
        const resampled = simplifyStroke(stroke, { variant: 'resample', spacing: 15 });
        expect(resampled[0]).toEqual(stroke[0]);
        expect(resampled[resampled.length - 1].x).toBe(stroke[79].x);
        expect(resampled[resampled.length - 1].y).toBe(stroke[79].y);
        // All gaps except the final closing one are exactly `spacing` along the polyline.
        for (let i = 1; i < resampled.length - 1; i++) {
            const gap = Math.hypot(
                resampled[i].x - resampled[i - 1].x,
                resampled[i].y - resampled[i - 1].y,
            );
            expect(gap).toBeLessThanOrEqual(15 + 1e-9);
        }
        expect(resampled.length).toBeLessThan(stroke.length);
    });
});

describe("corner detection: angle threshold", () => {
    it("finds exactly the apex of an L stroke", () => {
        const stroke = makeLStroke();
        const result = detectCorners(stroke, { variant: 'angle-threshold', thresholdDeg: 60, span: 2 });
        expect(result.cornerIndices).toEqual([20]);
    });

    it("finds no corners on a smooth arc", () => {
        const stroke = makeStroke(60, (i) => ({
            x: 200 * Math.cos(i / 30),
            y: 200 * Math.sin(i / 30),
        }));
        const result = detectCorners(stroke, { variant: 'angle-threshold', thresholdDeg: 60, span: 2 });
        expect(result.cornerIndices).toEqual([]);
    });

    it("finds both corners of a Z stroke", () => {
        const pts: StrokePoint[] = [];
        for (let i = 0; i <= 15; i++) pts.push({ x: i * 6, y: 0, t: i });
        for (let i = 1; i <= 15; i++) pts.push({ x: 90 - i * 6, y: i * 6, t: 15 + i });
        for (let i = 1; i <= 15; i++) pts.push({ x: i * 6, y: 90, t: 30 + i });
        const result = detectCorners(pts, { variant: 'angle-threshold', thresholdDeg: 60, span: 2 });
        expect(result.cornerIndices).toEqual([15, 30]);
    });
});

describe("catmull-rom fitting", () => {
    it("interpolates every input point exactly with zero error", () => {
        const points: Vector2[] = [
            { x: 0, y: 0 }, { x: 40, y: 60 }, { x: 100, y: 50 }, { x: 150, y: 90 }, { x: 200, y: 0 },
        ];
        const fit = fitCatmullRom(points, 0.5)!;
        expect(fit).not.toBeNull();
        expect(fit.segments.length).toBe(4);
        expect(fit.maxError).toBe(0);
        points.forEach((p, i) => {
            const { segmentIndex, t } = fit.parameterization[i];
            const onCurve = evaluateCubicBezier(fit.segments[segmentIndex], t);
            expect(onCurve.x).toBeCloseTo(p.x, 9);
            expect(onCurve.y).toBeCloseTo(p.y, 9);
        });
    });

    it("handles duplicates and degenerate input", () => {
        expect(fitCatmullRom([{ x: 1, y: 1 }, { x: 1, y: 1 }], 0.5)).toBeNull();
        const fit = fitCatmullRom(
            [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }],
            0.5,
        )!;
        expect(fit).not.toBeNull();
        expect(fit.parameterization.length).toBe(4);
        expect(fit.parameterization[0]).toEqual(fit.parameterization[1]);
    });
});

describe("corner-aware fitting", () => {
    it("schneider splits at a detected corner and pins the apex", () => {
        const stroke = makeLStroke();
        const corners = detectCorners(stroke, { variant: 'angle-threshold', thresholdDeg: 60, span: 2 });
        const fit = fitStroke(corners, { variant: 'schneider', errorTolerance: 1 })!;
        expect(fit).not.toBeNull();
        // Two straight arms -> exactly one segment each.
        expect(fit.segments.length).toBe(2);
        expect(fit.maxError).toBeLessThanOrEqual(1);
        // The apex is an exact endpoint of both sections.
        expect(fit.segments[0].p3).toEqual({ x: 100, y: 0 });
        expect(fit.segments[1].p0).toEqual({ x: 100, y: 0 });
    });

    it("catmull-rom creases at a detected corner", () => {
        const stroke = makeLStroke();
        const corners = detectCorners(stroke, { variant: 'angle-threshold', thresholdDeg: 60, span: 2 });
        const fit = fitStroke(corners, { variant: 'catmull-rom', alpha: 0.5 })!;
        expect(fit).not.toBeNull();
        // Apex is a hard section boundary.
        const apexSegments = fit.segments.filter(
            (s) => (s.p0.x === 100 && s.p0.y === 0) || (s.p3.x === 100 && s.p3.y === 0),
        );
        expect(apexSegments.length).toBe(2);
    });
});

describe("pipeline integration with count-changing stages", () => {
    it("rdp + catmull-rom: correspondence stays index-matched to raw", () => {
        const stroke = makeStroke(100, (i) => ({ x: i * 4, y: 50 * Math.sin(i / 10) }));
        const config: StrokePipelineConfig = {
            smoothing: { variant: 'pass-through' },
            simplification: { variant: 'rdp', epsilon: 2 },
            cornerDetection: { variant: 'pass-through' },
            fitting: { variant: 'catmull-rom', alpha: 0.5 },
        };
        const result = runStrokePipeline(stroke, config);
        expect(result.fit).not.toBeNull();
        expect(result.simplified.length).toBeLessThan(stroke.length);
        expect(result.correspondence.length).toBe(stroke.length);
        result.correspondence.forEach((c) => {
            expect(Number.isFinite(c.x)).toBe(true);
            expect(Number.isFinite(c.y)).toBe(true);
        });
        // Endpoints of an interpolating fit over an arc-length mapping stay anchored.
        expect(result.correspondence[0].x).toBeCloseTo(stroke[0].x, 6);
        expect(result.correspondence[0].y).toBeCloseTo(stroke[0].y, 6);
    });

    it("chaikin smoothing (count-changing) still yields a total correspondence", () => {
        const stroke = makeStroke(40, (i) => ({ x: i * 8, y: (i % 2) * 12 }));
        const config: StrokePipelineConfig = {
            ...DEFAULT_STROKE_PIPELINE_CONFIG,
            smoothing: { variant: 'chaikin', iterations: 3 },
        };
        const result = runStrokePipeline(stroke, config);
        expect(result.smoothed.length).toBeGreaterThan(stroke.length);
        expect(result.correspondence.length).toBe(stroke.length);
        result.correspondence.forEach((c) => {
            expect(Number.isFinite(c.x)).toBe(true);
            expect(Number.isFinite(c.y)).toBe(true);
        });
    });

    it("full stack: one-euro + resample + angle-threshold + schneider on a noisy L", () => {
        const stroke = makeLStroke().map((p, i) => ({
            ...p,
            x: p.x + 0.8 * Math.sin(i * 12.9898),
            y: p.y + 0.8 * Math.cos(i * 78.233),
        }));
        const config: StrokePipelineConfig = {
            smoothing: { variant: 'one-euro', minCutoff: 1, beta: 0.005 },
            simplification: { variant: 'resample', spacing: 8 },
            cornerDetection: { variant: 'angle-threshold', thresholdDeg: 45, span: 2 },
            fitting: { variant: 'schneider', errorTolerance: 3 },
        };
        const result = runStrokePipeline(stroke, config);
        expect(result.fit).not.toBeNull();
        expect(result.correspondence.length).toBe(stroke.length);
        result.correspondence.forEach((c) => {
            expect(Number.isFinite(c.x)).toBe(true);
            expect(Number.isFinite(c.y)).toBe(true);
        });
    });
});
