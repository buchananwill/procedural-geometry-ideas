import type { Vector2 } from '../shared/types';

export const CLAMP_COARSE_SAMPLE_COUNT = 64;
export const CLAMP_REFINEMENT_DEPTH = 6;
export const CLAMP_RESOLUTION = 1 / (CLAMP_COARSE_SAMPLE_COUNT * 2 ** CLAMP_REFINEMENT_DEPTH);

export interface ClampResult {
    elements: Vector2[];
    /** Largest known-valid scale factor in [0, 1]. */
    t: number;
}

/** A known-valid lower fraction paired with the known-invalid fraction above it. */
interface FractionBracket {
    lowFraction: number;
    highFraction: number;
}

/**
 * Highest `sampleIndex` in [0, CLAMP_COARSE_SAMPLE_COUNT] whose fraction is
 * valid, or null when nothing is. Scanning downwards means every sample above
 * the accepted one is known invalid, so a disconnected valid set is entered at
 * its topmost island rather than whichever one a midpoint happens to land in.
 */
function findHighestValidCoarseSampleIndex(
    poseAt: (t: number) => Vector2[],
    isValid: (elements: Vector2[]) => boolean,
): number | null {
    for (let sampleIndex = CLAMP_COARSE_SAMPLE_COUNT; sampleIndex >= 0; sampleIndex--) {
        if (isValid(poseAt(sampleIndex / CLAMP_COARSE_SAMPLE_COUNT))) return sampleIndex;
    }
    return null;
}

/**
 * Bisect the bracket to CLAMP_REFINEMENT_DEPTH, returning the final known-valid
 * lower fraction.
 *
 * The arithmetic must stay dyadic: both bounds enter as multiples of
 * 1 / CLAMP_COARSE_SAMPLE_COUNT and every midpoint halves that spacing, so all
 * sampled fractions are exact multiples of CLAMP_RESOLUTION and no rounding
 * occurs. Callers depend on that exactness -- saturate's freeze attribution
 * probes `acceptedFraction + CLAMP_RESOLUTION` and needs it to reproduce, bit
 * for bit, a fraction this search tested and found invalid. Running the full
 * depth unconditionally is what leaves the bracket exactly CLAMP_RESOLUTION
 * wide, so never exit the loop early.
 */
function refineBracketToResolution(
    poseAt: (t: number) => Vector2[],
    isValid: (elements: Vector2[]) => boolean,
    bracket: FractionBracket,
): number {
    let { lowFraction, highFraction } = bracket;
    for (let depth = 0; depth < CLAMP_REFINEMENT_DEPTH; depth++) {
        const midFraction = (lowFraction + highFraction) / 2;
        if (isValid(poseAt(midFraction))) lowFraction = midFraction;
        else highFraction = midFraction;
    }
    return lowFraction;
}

function findLargestValidFraction(
    poseAt: (t: number) => Vector2[],
    isValid: (elements: Vector2[]) => boolean,
): number {
    const highestValidSampleIndex = findHighestValidCoarseSampleIndex(poseAt, isValid);
    if (highestValidSampleIndex === null) return 0;
    if (highestValidSampleIndex === CLAMP_COARSE_SAMPLE_COUNT) return 1;
    return refineBracketToResolution(poseAt, isValid, {
        lowFraction: highestValidSampleIndex / CLAMP_COARSE_SAMPLE_COUNT,
        highFraction: (highestValidSampleIndex + 1) / CLAMP_COARSE_SAMPLE_COUNT,
    });
}

/**
 * Largest-valid-delta search. poseAt(t) must be deterministic and computed
 * from the ORIGINAL pose scaled by t (never cumulative). A descending coarse
 * scan finds the highest valid sample of CLAMP_COARSE_SAMPLE_COUNT even steps
 * -- accepting t = 1 outright when the full delta is valid -- and refinement
 * then bisects the one-sample-wide bracket above it down to CLAMP_RESOLUTION.
 * poseAt(0) must equal the original pose; if even that is invalid the result is
 * that original pose with t = 0.
 */
export function clampToValid(
    poseAt: (t: number) => Vector2[],
    isValid: (elements: Vector2[]) => boolean,
): ClampResult {
    const acceptedFraction = findLargestValidFraction(poseAt, isValid);
    return { elements: poseAt(acceptedFraction), t: acceptedFraction };
}
