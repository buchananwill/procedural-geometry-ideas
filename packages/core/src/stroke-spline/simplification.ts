import type { SimplificationConfig, StrokePoint } from './types';

function perpendicularDistance(p: StrokePoint, a: StrokePoint, b: StrokePoint): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / Math.sqrt(lenSq);
}

/** Ramer-Douglas-Peucker: keeps a subset of the input points (endpoints always). */
function rdpSimplify(points: StrokePoint[], epsilon: number): StrokePoint[] {
    const n = points.length;
    if (n < 3) return points.slice();
    const keep = new Array<boolean>(n).fill(false);
    keep[0] = true;
    keep[n - 1] = true;

    const stack: [number, number][] = [[0, n - 1]];
    while (stack.length > 0) {
        const [first, last] = stack.pop()!;
        let maxDist = 0;
        let index = -1;
        for (let i = first + 1; i < last; i++) {
            const d = perpendicularDistance(points[i], points[first], points[last]);
            if (d > maxDist) {
                maxDist = d;
                index = i;
            }
        }
        if (index !== -1 && maxDist > epsilon) {
            keep[index] = true;
            stack.push([first, index], [index, last]);
        }
    }
    return points.filter((_, i) => keep[i]);
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
 * Arc-length resampling: emits interpolated points at a fixed spacing along
 * the polyline (first and last input points always included), evening out
 * the speed-dependent density of pointer capture.
 */
function resampleByArcLength(points: StrokePoint[], spacing: number): StrokePoint[] {
    const n = points.length;
    if (n < 2 || spacing <= 0) return points.slice();
    const out: StrokePoint[] = [points[0]];
    let residual = spacing;
    for (let i = 1; i < n; i++) {
        const prev = points[i - 1];
        const next = points[i];
        const segLength = Math.hypot(next.x - prev.x, next.y - prev.y);
        if (segLength === 0) continue;
        let travelled = 0;
        while (segLength - travelled >= residual) {
            travelled += residual;
            out.push(lerpStrokePoint(prev, next, travelled / segLength));
            residual = spacing;
        }
        residual -= segLength - travelled;
    }
    const last = points[n - 1];
    const tail = out[out.length - 1];
    if (tail.x !== last.x || tail.y !== last.y) {
        out.push(last);
    }
    return out;
}

export function simplifyStroke(points: StrokePoint[], config: SimplificationConfig): StrokePoint[] {
    switch (config.variant) {
        case 'pass-through':
            return points.slice();
        case 'rdp':
            return rdpSimplify(points, config.epsilon);
        case 'resample':
            return resampleByArcLength(points, config.spacing);
        default: {
            const _exhaustive: never = config;
            return _exhaustive;
        }
    }
}
