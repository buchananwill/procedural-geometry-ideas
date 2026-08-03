import type { ArticulationChain, SolveResult } from './types';

/** The unchanged pose, reported as the full delta having been applied. */
export function identityResult(chain: ArticulationChain): SolveResult {
    return { elements: chain.elements.map((p) => ({ ...p })), appliedFraction: 1 };
}
