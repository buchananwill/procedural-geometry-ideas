import type { SmoothingConfig, StrokePoint } from './types';

/**
 * Symmetric moving average with a window that shrinks near the ends
 * (radius = min(halfWindow, i, n-1-i)), so the endpoints are pinned exactly
 * and no directional bias is introduced. Only positions are smoothed;
 * timestamps and pressure are carried through from the source point.
 */
function movingAverage(points: StrokePoint[], windowSize: number): StrokePoint[] {
    const n = points.length;
    if (n < 3 || windowSize < 3) return points.slice();
    const halfWindow = Math.floor(windowSize / 2);
    const out: StrokePoint[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const r = Math.min(halfWindow, i, n - 1 - i);
        if (r === 0) {
            out[i] = points[i];
            continue;
        }
        let sx = 0;
        let sy = 0;
        for (let j = i - r; j <= i + r; j++) {
            sx += points[j].x;
            sy += points[j].y;
        }
        const count = 2 * r + 1;
        out[i] = { ...points[i], x: sx / count, y: sy / count };
    }
    return out;
}

/**
 * Gaussian kernel smoothing over neighbor indices, with the same
 * endpoint-pinning shrink-at-the-ends strategy as the moving average.
 */
function gaussianSmooth(points: StrokePoint[], sigma: number): StrokePoint[] {
    const n = points.length;
    if (n < 3 || sigma <= 0) return points.slice();
    const radius = Math.ceil(3 * sigma);
    const kernel: number[] = [];
    for (let j = 0; j <= radius; j++) {
        kernel.push(Math.exp(-(j * j) / (2 * sigma * sigma)));
    }
    const out: StrokePoint[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const r = Math.min(radius, i, n - 1 - i);
        if (r === 0) {
            out[i] = points[i];
            continue;
        }
        let sx = 0;
        let sy = 0;
        let sw = 0;
        for (let j = -r; j <= r; j++) {
            const w = kernel[Math.abs(j)];
            sx += points[i + j].x * w;
            sy += points[i + j].y * w;
            sw += w;
        }
        out[i] = { ...points[i], x: sx / sw, y: sy / sw };
    }
    return out;
}

/**
 * 1-Euro filter (Casiez et al. 2012): velocity-adaptive exponential
 * smoothing driven by the captured timestamps — strong smoothing at low
 * speeds, low lag at high speeds. Causal, so unlike the kernel smoothers
 * it does not pin the final point.
 */
function oneEuroSmooth(points: StrokePoint[], minCutoff: number, beta: number): StrokePoint[] {
    const n = points.length;
    if (n < 2) return points.slice();
    const D_CUTOFF = 1;
    const FALLBACK_DT = 1 / 120;
    const alphaFor = (cutoff: number, dt: number) => {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dt);
    };

    const out: StrokePoint[] = [points[0]];
    let prevX = points[0].x;
    let prevY = points[0].y;
    let prevDx = 0;
    let prevDy = 0;
    for (let i = 1; i < n; i++) {
        const dtMs = points[i].t - points[i - 1].t;
        const dt = dtMs > 0 ? dtMs / 1000 : FALLBACK_DT;

        const rawDx = (points[i].x - prevX) / dt;
        const rawDy = (points[i].y - prevY) / dt;
        const aD = alphaFor(D_CUTOFF, dt);
        const dx = prevDx + aD * (rawDx - prevDx);
        const dy = prevDy + aD * (rawDy - prevDy);

        const speed = Math.hypot(dx, dy);
        const cutoff = minCutoff + beta * speed;
        const a = alphaFor(cutoff, dt);
        const x = prevX + a * (points[i].x - prevX);
        const y = prevY + a * (points[i].y - prevY);

        out.push({ ...points[i], x, y });
        prevX = x;
        prevY = y;
        prevDx = dx;
        prevDy = dy;
    }
    return out;
}

function lerpStrokePoint(a: StrokePoint, b: StrokePoint, t: number): StrokePoint {
    const point: StrokePoint = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        t: a.t + (b.t - a.t) * t,
    };
    if (a.pressure !== undefined && b.pressure !== undefined) {
        point.pressure = a.pressure + (b.pressure - a.pressure) * t;
    }
    return point;
}

/**
 * Chaikin corner cutting: each iteration replaces every edge with points at
 * 1/4 and 3/4 (endpoints kept), converging toward a quadratic B-spline.
 * Point count roughly doubles per iteration, so downstream correspondence
 * uses the arc-length-fraction fallback.
 */
function chaikinSmooth(points: StrokePoint[], iterations: number): StrokePoint[] {
    let current = points.slice();
    for (let iteration = 0; iteration < iterations; iteration++) {
        if (current.length < 3) break;
        const next: StrokePoint[] = [current[0]];
        for (let i = 0; i < current.length - 1; i++) {
            next.push(lerpStrokePoint(current[i], current[i + 1], 0.25));
            next.push(lerpStrokePoint(current[i], current[i + 1], 0.75));
        }
        next.push(current[current.length - 1]);
        current = next;
    }
    return current;
}

export function smoothStroke(points: StrokePoint[], config: SmoothingConfig): StrokePoint[] {
    switch (config.variant) {
        case 'pass-through':
            return points.slice();
        case 'moving-average':
            return movingAverage(points, config.windowSize);
        case 'gaussian':
            return gaussianSmooth(points, config.sigma);
        case 'one-euro':
            return oneEuroSmooth(points, config.minCutoff, config.beta);
        case 'chaikin':
            return chaikinSmooth(points, config.iterations);
        default: {
            const _exhaustive: never = config;
            return _exhaustive;
        }
    }
}
