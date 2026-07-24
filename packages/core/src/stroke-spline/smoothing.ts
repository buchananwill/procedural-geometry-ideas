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

export function smoothStroke(points: StrokePoint[], config: SmoothingConfig): StrokePoint[] {
    switch (config.variant) {
        case 'pass-through':
            return points.slice();
        case 'moving-average':
            return movingAverage(points, config.windowSize);
        default: {
            const _exhaustive: never = config;
            return _exhaustive;
        }
    }
}
