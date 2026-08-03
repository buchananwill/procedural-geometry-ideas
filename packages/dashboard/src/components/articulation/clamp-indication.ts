/**
 * Shared clamp-indication predicate for the badge and the canvas highlight.
 * Saturate's consumed-distance arithmetic can leave appliedFraction a hair
 * under 1 after a fully absorbed drag; the tolerance keeps both indicators
 * quiet in that case, and keeping them on one predicate keeps them in sync.
 */
export function indicatesClamping(appliedFraction: number): boolean {
    return appliedFraction < 1 - 1e-6;
}
