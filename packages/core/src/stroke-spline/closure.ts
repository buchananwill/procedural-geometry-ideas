import type { Vector2 } from '../straight-skeleton/types';
import type {
    ClosureConfig,
    CornerDetectionConfig,
    CornerDetectionResult,
    FitResult,
    SeamNeighbours,
    StrokePoint,
} from './types';

/**
 * Closed-loop support for the stroke pipeline.
 *
 * Closure is decided on the *raw* stroke — "did the hand come back to where it
 * started" is a property of the capture, not of whatever the smoothing and
 * simplification variants happened to do to the ends. Everything downstream of
 * the decision operates on the corner-detection output.
 *
 * Scope: the smoothing window and the simplification / corner-detection spans
 * still treat the first and last points as endpoints. Only the *join* is
 * closed here, not the stages' notion of a neighbourhood.
 */

/** A closed chain needs at least three distinct points once the seam collapses two into one. */
const MIN_CLOSED_POINTS = 4;

export interface ClosureOutcome {
    /** True when the stroke was interpreted as a closed loop. */
    closed: boolean;
    /**
     * The corner-detection result to fit. When closed, its last point holds the
     * first point's coordinates verbatim; otherwise it is the input unchanged.
     */
    corners: CornerDetectionResult;
    /** Seam tangent neighbours for the fitters, or null when the seam should crease. */
    seam: SeamNeighbours | null;
}

/**
 * Whether the stroke's last raw sample has returned to its first. The threshold
 * is inclusive: a gap exactly equal to `threshold` counts as closed. Strokes of
 * fewer than four samples are never closed — collapsing the seam would leave
 * too few distinct points to bound a region.
 */
export function isStrokeClosed(raw: StrokePoint[], config: ClosureConfig): boolean {
    switch (config.variant) {
        case 'pass-through':
            return false;
        case 'distance-threshold': {
            if (raw.length < MIN_CLOSED_POINTS) return false;
            const first = raw[0];
            const last = raw[raw.length - 1];
            return Math.hypot(last.x - first.x, last.y - first.y) <= config.threshold;
        }
        default: {
            const _exhaustive: never = config;
            return _exhaustive;
        }
    }
}

/**
 * Turn angle in degrees at the seam, measured `span` points either side across
 * the wrap. Mirrors `angleThresholdCorners`, except the incoming arm walks
 * backwards from the duplicated end point instead of stopping at it. Null when
 * the chain is too short to measure or an arm is degenerate.
 */
function seamTurnAngleDeg(points: StrokePoint[], span: number): number | null {
    const n = points.length;
    // n - 1 distinct points once the seam duplicate is discounted; the detector
    // needs span points either side of the measured index.
    if (span < 1 || n < 2 * span + 2) return null;
    const seam = points[0];
    const prev = points[n - 1 - span];
    const next = points[span];
    const v1x = seam.x - prev.x;
    const v1y = seam.y - prev.y;
    const v2x = next.x - seam.x;
    const v2y = next.y - seam.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 === 0 || len2 === 0) return null;
    const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (len1 * len2)));
    return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Whether the seam of a closed chain is itself a corner under the configured
 * corner detector. The windowed scan in `detectCorners` can never nominate
 * index 0 or n-1, so the seam is tested here with the same criterion; a seam
 * corner keeps its crease instead of being smoothed over.
 */
export function isSeamCorner(points: StrokePoint[], config: CornerDetectionConfig): boolean {
    if (config.variant !== 'angle-threshold') return false;
    const angle = seamTurnAngleDeg(points, config.span);
    return angle !== null && angle >= config.thresholdDeg;
}

/** The points either side of the seam, which give the fitters a two-sided end tangent. */
function seamNeighbours(points: StrokePoint[]): SeamNeighbours {
    const n = points.length;
    return {
        before: { x: points[n - 2].x, y: points[n - 2].y },
        after: { x: points[1].x, y: points[1].y },
    };
}

/**
 * Decide closure and prepare the fitting input. When closed, the final point is
 * moved onto the first point exactly — the chain length is preserved, so the
 * index-matched correspondence path is unaffected.
 */
export function applyClosure(
    raw: StrokePoint[],
    corners: CornerDetectionResult,
    closure: ClosureConfig,
    cornerDetection: CornerDetectionConfig,
): ClosureOutcome {
    const asOpen: ClosureOutcome = { closed: false, corners, seam: null };
    if (!isStrokeClosed(raw, closure)) return asOpen;

    const points = corners.points;
    if (points.length < MIN_CLOSED_POINTS) return asOpen;

    const closedPoints = points.slice();
    const first = closedPoints[0];
    const last = closedPoints[closedPoints.length - 1];
    closedPoints[closedPoints.length - 1] = { ...last, x: first.x, y: first.y };

    const closedCorners: CornerDetectionResult = {
        points: closedPoints,
        cornerIndices: corners.cornerIndices,
    };
    const seam = isSeamCorner(closedPoints, cornerDetection) ? null : seamNeighbours(closedPoints);
    return { closed: true, corners: closedCorners, seam };
}

/**
 * Make the fitted chain a genuine loop: the last segment's endpoint is assigned
 * the first segment's start point verbatim, so a consumer comparing with an
 * absolute epsilon sees no sliver. Fitting a chain whose seam point was already
 * snapped normally lands there anyway; this makes it a guarantee rather than a
 * consequence of how a fitter copies its endpoints.
 */
export function closeFittedChain(fit: FitResult): void {
    if (fit.segments.length === 0) return;
    const start: Vector2 = fit.segments[0].p0;
    const last = fit.segments[fit.segments.length - 1];
    last.p3 = { x: start.x, y: start.y };
}
