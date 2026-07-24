import { evaluateCubicBezier, fitStrokeSpline } from "@proc-geo/core";
import type { CubicBezier, Vector2 } from "@proc-geo/core";

function sampleBezier(seg: CubicBezier, count: number): Vector2[] {
    const out: Vector2[] = [];
    for (let i = 0; i < count; i++) {
        out.push(evaluateCubicBezier(seg, i / (count - 1)));
    }
    return out;
}

describe("fitStrokeSpline", () => {
    it("returns null for fewer than two distinct points", () => {
        expect(fitStrokeSpline([], 1)).toBeNull();
        expect(fitStrokeSpline([{ x: 5, y: 5 }], 1)).toBeNull();
        expect(fitStrokeSpline([{ x: 5, y: 5 }, { x: 5, y: 5 }], 1)).toBeNull();
    });

    it("fits a straight line with a single near-exact segment", () => {
        const points: Vector2[] = [];
        for (let i = 0; i <= 20; i++) {
            points.push({ x: i * 10, y: i * 5 });
        }
        const fit = fitStrokeSpline(points, 1)!;
        expect(fit).not.toBeNull();
        expect(fit.segments.length).toBe(1);
        expect(fit.maxError).toBeLessThan(1);
        // Endpoints are interpolated exactly.
        expect(fit.segments[0].p0).toEqual({ x: 0, y: 0 });
        expect(fit.segments[0].p3).toEqual({ x: 200, y: 100 });
    });

    it("recovers a curve sampled from a known cubic Bezier within tolerance", () => {
        const source: CubicBezier = {
            p0: { x: 0, y: 0 },
            p1: { x: 30, y: 100 },
            p2: { x: 70, y: 100 },
            p3: { x: 100, y: 0 },
        };
        const points = sampleBezier(source, 50);
        const fit = fitStrokeSpline(points, 1)!;
        expect(fit).not.toBeNull();
        expect(fit.maxError).toBeLessThan(1);

        // Every input point must sit within tolerance of its assigned parameter position.
        expect(fit.parameterization.length).toBe(50);
        points.forEach((p, i) => {
            const { segmentIndex, t } = fit.parameterization[i];
            const onCurve = evaluateCubicBezier(fit.segments[segmentIndex], t);
            const d = Math.hypot(onCurve.x - p.x, onCurve.y - p.y);
            expect(d).toBeLessThanOrEqual(1 + 1e-9);
        });
    });

    it("assigns a monotonically non-decreasing segment index across input points", () => {
        const points: Vector2[] = [];
        for (let i = 0; i <= 100; i++) {
            const x = i * 4;
            points.push({ x, y: 60 * Math.sin(x / 40) });
        }
        const fit = fitStrokeSpline(points, 2)!;
        expect(fit).not.toBeNull();
        for (let i = 1; i < fit.parameterization.length; i++) {
            expect(fit.parameterization[i].segmentIndex).toBeGreaterThanOrEqual(
                fit.parameterization[i - 1].segmentIndex,
            );
        }
    });

    it("compresses a dense noisy stroke into far fewer segments than points", () => {
        const points: Vector2[] = [];
        for (let i = 0; i <= 200; i++) {
            const x = i * 2;
            // Deterministic pseudo-noise on top of a smooth wave.
            const noise = 1.5 * Math.sin(i * 12.9898) * Math.cos(i * 78.233);
            points.push({ x, y: 80 * Math.sin(x / 90) + noise });
        }
        const fit = fitStrokeSpline(points, 5)!;
        expect(fit).not.toBeNull();
        expect(fit.maxError).toBeLessThanOrEqual(5);
        expect(fit.segments.length).toBeLessThan(points.length / 10);
    });

    it("handles consecutive duplicate points without gaps in the parameterization", () => {
        const points: Vector2[] = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 50, y: 20 },
            { x: 50, y: 20 },
            { x: 100, y: 0 },
        ];
        const fit = fitStrokeSpline(points, 2)!;
        expect(fit).not.toBeNull();
        expect(fit.parameterization.length).toBe(5);
        fit.parameterization.forEach((p) => {
            expect(p).toBeDefined();
            expect(Number.isFinite(p.t)).toBe(true);
            // Duplicates share their representative's parameter.
        });
        expect(fit.parameterization[0]).toEqual(fit.parameterization[1]);
        expect(fit.parameterization[2]).toEqual(fit.parameterization[3]);
    });

    it("splits a sharp V into multiple segments at tight tolerance", () => {
        const points: Vector2[] = [];
        for (let i = 0; i <= 20; i++) points.push({ x: i * 5, y: i * 5 });
        for (let i = 1; i <= 20; i++) points.push({ x: 100 + i * 5, y: 100 - i * 5 });
        const fit = fitStrokeSpline(points, 1)!;
        expect(fit).not.toBeNull();
        expect(fit.segments.length).toBeGreaterThan(1);
        expect(fit.maxError).toBeLessThanOrEqual(1);
    });
});
