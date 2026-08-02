import type { Vector2 } from '../shared/types';

export const CLAMP_BISECTION_DEPTH = 8;

export interface ClampResult {
    elements: Vector2[];
    /** Largest known-valid scale factor in [0, 1]. */
    t: number;
}

/**
 * Largest-valid-delta search. poseAt(t) must be deterministic and computed
 * from the ORIGINAL pose scaled by t (never cumulative). If poseAt(1) is
 * valid it is returned directly; otherwise bisect t in [0, 1] to fixed depth,
 * keeping the largest valid pose seen. poseAt(0) must equal the original
 * pose; if even that is invalid the result is identity with t = 0.
 */
export function clampToValid(
    poseAt: (t: number) => Vector2[],
    isValid: (elements: Vector2[]) => boolean,
): ClampResult {
    const full = poseAt(1);
    if (isValid(full)) return { elements: full, t: 1 };
    let lo = 0;
    let hi = 1;
    let best = poseAt(0);
    let bestT = 0;
    for (let i = 0; i < CLAMP_BISECTION_DEPTH; i++) {
        const mid = (lo + hi) / 2;
        const pose = poseAt(mid);
        if (isValid(pose)) {
            lo = mid;
            best = pose;
            bestT = mid;
        } else {
            hi = mid;
        }
    }
    return { elements: best, t: bestT };
}
