import type { ConstraintStrategy, SolveInput, SolveResult, StrategyId } from './types';
import type { ArticulationChain } from './types';
import type { Vector2 } from '../shared/types';
import { addV, lenV, scaleV } from './geometry';
import { clampToValid } from './clamping';
import { isPoseValid } from './validity';
import { isContiguous, splitSpans } from './topology';
import { rigidStrategy } from './strategies/rigid';
import { spreadStrategy } from './strategies/spread';
import { saturateStrategy } from './strategies/saturate';

/**
 * Strategy registry. Tasks adding strategies register them here; unknown ids
 * fall back to rigid so the record can grow without breaking callers.
 */
export const STRATEGIES: Partial<Record<StrategyId, ConstraintStrategy>> = {
    rigid: rigidStrategy,
    spread: spreadStrategy,
    saturate: saturateStrategy,
};

function identity(chain: ArticulationChain): SolveResult {
    return { elements: chain.elements.map((p) => ({ ...p })), appliedFraction: 1 };
}

function translateRigid(chain: ArticulationChain, selectionSet: Set<number>, vector: Vector2): SolveResult {
    const clamp = clampToValid(
        (t) => chain.elements.map((p, i) => (selectionSet.has(i) ? addV(p, scaleV(vector, t)) : { ...p })),
        (els) => isPoseValid(els, chain.constraints),
    );
    return { elements: clamp.elements, appliedFraction: clamp.t };
}

/**
 * Entry point. Normalizes the selection, dispatches translation (shared,
 * rigid-unit semantics for every strategy), applies the discontiguous ->
 * rigid fallback, splits spans around a selected pivot, and delegates
 * rotation to the chosen strategy. Never throws on bad input.
 */
export function solveArticulation(input: SolveInput): SolveResult {
    const { chain, pivotIndex, delta } = input;
    const n = chain.elements.length;
    const sorted = [...new Set(input.selection)]
        .filter((i) => Number.isInteger(i) && i >= 0 && i < n)
        .sort((a, b) => a - b);
    if (n < 2 || sorted.length === 0) return identity(chain);

    if (delta.kind === 'translate') {
        if (!Number.isFinite(delta.vector.x) || !Number.isFinite(delta.vector.y) || lenV(delta.vector) === 0) {
            return identity(chain);
        }
        return translateRigid(chain, new Set(sorted), delta.vector);
    }

    if (!Number.isFinite(delta.angle) || delta.angle === 0) return identity(chain);
    if (!Number.isInteger(pivotIndex) || pivotIndex < 0 || pivotIndex >= n) return identity(chain);

    const selectionSet = new Set(sorted);
    if (!isContiguous(sorted)) {
        return rigidStrategy.solveRotation({ chain, selectionSet, pivotIndex, spans: [sorted], angle: delta.angle });
    }
    const spans = splitSpans(sorted, pivotIndex);
    if (spans.length === 0) return identity(chain); // selection is exactly the pivot

    const strategy = STRATEGIES[input.strategyId] ?? rigidStrategy;
    return strategy.solveRotation({ chain, selectionSet, pivotIndex, spans, angle: delta.angle });
}
