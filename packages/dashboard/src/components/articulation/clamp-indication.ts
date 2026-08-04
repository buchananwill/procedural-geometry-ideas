/**
 * Selection-clamp predicate for the badge. Saturate's consumed-distance
 * arithmetic can leave appliedFraction a hair under 1 after a fully absorbed
 * drag; the tolerance keeps the badge quiet in that case. Element clamps are a
 * separate report and the canvas colours those directly.
 */
export function indicatesClamping(appliedFraction: number): boolean {
    return appliedFraction < 1 - 1e-6;
}
