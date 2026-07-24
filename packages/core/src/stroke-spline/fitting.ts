import type { Vector2 } from '../straight-skeleton/types';
import type { CornerDetectionResult, FitResult, FittingConfig } from './types';
import { fitStrokeSpline } from './schneider';
import { fitCatmullRom } from './catmull-rom';

type SectionFitter = (points: Vector2[]) => FitResult | null;

/**
 * Corner-aware fitting: the point list is split into sections at the detected
 * corner indices and each section is fitted independently, so tangents are
 * one-sided at corners and the curve creases there instead of rounding.
 * Section results are merged into a single FitResult with global segment
 * indices; corner points belong to the section on each side (identical
 * position), with the later section's parameter winning.
 */
function fitSections(points: Vector2[], cornerIndices: number[], fitSection: SectionFitter): FitResult | null {
    const n = points.length;
    const breaks = cornerIndices.filter((i) => i > 0 && i < n - 1).sort((a, b) => a - b);
    if (breaks.length === 0) return fitSection(points);

    const merged: FitResult = { segments: [], parameterization: new Array(n), maxError: 0 };
    const bounds = [0, ...breaks, n - 1];
    for (let s = 0; s < bounds.length - 1; s++) {
        const first = bounds[s];
        const last = bounds[s + 1];
        const sectionFit = fitSection(points.slice(first, last + 1));
        if (!sectionFit) continue;
        const segmentOffset = merged.segments.length;
        merged.segments.push(...sectionFit.segments);
        sectionFit.parameterization.forEach((p, i) => {
            merged.parameterization[first + i] = { segmentIndex: segmentOffset + p.segmentIndex, t: p.t };
        });
        if (sectionFit.maxError > merged.maxError) merged.maxError = sectionFit.maxError;
    }
    if (merged.segments.length === 0) return null;

    // Degenerate sections (e.g. all-duplicate points) leave gaps: fill each
    // from its nearest assigned neighbor so the parameterization stays total.
    let lastAssigned: FitResult['parameterization'][number] | null = null;
    for (let i = 0; i < n; i++) {
        if (merged.parameterization[i]) lastAssigned = merged.parameterization[i];
        else if (lastAssigned) merged.parameterization[i] = lastAssigned;
    }
    for (let i = n - 1; i >= 0; i--) {
        if (merged.parameterization[i]) lastAssigned = merged.parameterization[i];
        else if (lastAssigned) merged.parameterization[i] = lastAssigned;
    }
    return merged;
}

export function fitStroke(corners: CornerDetectionResult, config: FittingConfig): FitResult | null {
    const points: Vector2[] = corners.points;
    switch (config.variant) {
        case 'pass-through':
            return null;
        case 'schneider':
            return fitSections(points, corners.cornerIndices, (section) =>
                fitStrokeSpline(section, config.errorTolerance),
            );
        case 'catmull-rom':
            return fitSections(points, corners.cornerIndices, (section) =>
                fitCatmullRom(section, config.alpha),
            );
        default: {
            const _exhaustive: never = config;
            return _exhaustive;
        }
    }
}
