import type { ArticulationChain, SolveResult, StrategyId } from './types';

/**
 * The unchanged pose, reported as the full delta having been applied and
 * attributed to the strategy that would have run on a non-degenerate input.
 */
export function identityResult(chain: ArticulationChain, appliedStrategyId: StrategyId): SolveResult {
    return {
        elements: chain.elements.map((p) => ({ ...p })),
        appliedFraction: 1,
        appliedStrategyId,
        frozenElementIndices: [],
    };
}
