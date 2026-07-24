import type { CornerDetectionConfig, CornerDetectionResult, StrokePoint } from './types';

/**
 * Angle-threshold corner detection: a point is a corner candidate when the
 * turn angle between the incoming and outgoing directions (measured `span`
 * points to either side, to look past sample-level noise) exceeds the
 * threshold. Runs of nearby candidates are suppressed to their locally
 * sharpest point.
 */
function angleThresholdCorners(points: StrokePoint[], thresholdDeg: number, span: number): CornerDetectionResult {
    const n = points.length;
    const result: CornerDetectionResult = { points: points.slice(), cornerIndices: [] };
    if (n < 2 * span + 1) return result;

    const turnAngles = new Array<number>(n).fill(0);
    for (let i = span; i < n - span; i++) {
        const v1x = points[i].x - points[i - span].x;
        const v1y = points[i].y - points[i - span].y;
        const v2x = points[i + span].x - points[i].x;
        const v2y = points[i + span].y - points[i].y;
        const len1 = Math.hypot(v1x, v1y);
        const len2 = Math.hypot(v2x, v2y);
        if (len1 === 0 || len2 === 0) continue;
        const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (len1 * len2)));
        turnAngles[i] = (Math.acos(cos) * 180) / Math.PI;
    }

    // Group candidates whose gaps are within `span`; keep each group's sharpest.
    let groupBest = -1;
    let prevCandidate = -1;
    for (let i = span; i < n - span; i++) {
        if (turnAngles[i] < thresholdDeg) continue;
        if (groupBest !== -1 && i - prevCandidate > span) {
            result.cornerIndices.push(groupBest);
            groupBest = -1;
        }
        if (groupBest === -1 || turnAngles[i] > turnAngles[groupBest]) {
            groupBest = i;
        }
        prevCandidate = i;
    }
    if (groupBest !== -1) result.cornerIndices.push(groupBest);
    return result;
}

export function detectCorners(points: StrokePoint[], config: CornerDetectionConfig): CornerDetectionResult {
    switch (config.variant) {
        case 'pass-through':
            return { points: points.slice(), cornerIndices: [] };
        case 'angle-threshold':
            return angleThresholdCorners(points, config.thresholdDeg, config.span);
        default: {
            const _exhaustive: never = config;
            return _exhaustive;
        }
    }
}
