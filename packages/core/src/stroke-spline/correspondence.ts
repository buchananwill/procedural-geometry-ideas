import type { Vector2 } from '../straight-skeleton/types';
import type { FitResult, StrokePoint } from './types';
import { evaluateCubicBezier } from './bezier';

const ARC_SAMPLES_PER_SEGMENT = 32;

function cumulativeFractions(points: { x: number; y: number }[]): number[] {
    const cumulative: number[] = [0];
    for (let i = 1; i < points.length; i++) {
        cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    const total = cumulative[cumulative.length - 1];
    if (total === 0) return cumulative.map(() => 0);
    return cumulative.map((c) => c / total);
}

/** Sample a polyline at a normalized arc-length fraction (0..1). */
function samplePolylineAtFraction(polyline: Vector2[], fractions: number[], fraction: number): Vector2 {
    if (fraction <= 0) return polyline[0];
    if (fraction >= 1) return polyline[polyline.length - 1];
    // Binary search for the containing segment.
    let lo = 0;
    let hi = fractions.length - 1;
    while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (fractions[mid] <= fraction) lo = mid;
        else hi = mid;
    }
    const span = fractions[hi] - fractions[lo];
    const t = span === 0 ? 0 : (fraction - fractions[lo]) / span;
    return {
        x: polyline[lo].x + (polyline[hi].x - polyline[lo].x) * t,
        y: polyline[lo].y + (polyline[hi].y - polyline[lo].y) * t,
    };
}

/**
 * Arc-length-fraction correspondence: each raw point's cumulative arc-length
 * fraction along the raw polyline is mapped to the same fraction along the
 * target polyline, so morph motion stays roughly normal to the stroke.
 * General fallback for any target that lacks its own parameterization.
 */
export function mapByArcLengthFraction(raw: StrokePoint[], target: Vector2[]): Vector2[] {
    if (raw.length === 0) return [];
    if (target.length === 0) return raw.map((p) => ({ x: p.x, y: p.y }));
    if (target.length === 1) return raw.map(() => ({ x: target[0].x, y: target[0].y }));
    const rawFractions = cumulativeFractions(raw);
    const targetFractions = cumulativeFractions(target);
    return rawFractions.map((f) => samplePolylineAtFraction(target, targetFractions, f));
}

/** Flatten a fitted spline into a dense polyline (for arc-length mapping). */
export function flattenSpline(fit: FitResult): Vector2[] {
    const out: Vector2[] = [];
    fit.segments.forEach((seg, segIndex) => {
        const start = segIndex === 0 ? 0 : 1;
        for (let i = start; i <= ARC_SAMPLES_PER_SEGMENT; i++) {
            out.push(evaluateCubicBezier(seg, i / ARC_SAMPLES_PER_SEGMENT));
        }
    });
    return out;
}

/**
 * Index-matched correspondence from raw points to the fitted spline. Uses the
 * fitter's own per-point parameterization when the fit consumed exactly one
 * point per raw point; otherwise falls back to arc-length-fraction mapping
 * over the flattened spline.
 */
export function mapRawToSpline(raw: StrokePoint[], fitInputCount: number, fit: FitResult): Vector2[] {
    if (fitInputCount === raw.length && fit.parameterization.length === raw.length) {
        return fit.parameterization.map((p) => evaluateCubicBezier(fit.segments[p.segmentIndex], p.t));
    }
    return mapByArcLengthFraction(raw, flattenSpline(fit));
}
