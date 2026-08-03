import type { ConstraintStrategy, SolveInput, SolveResult, StrategyId, StrategyInput, TransformDelta } from './types';
import { lenV } from './geometry';
import { isContiguous } from './topology';
import { identityResult } from './identity-result';
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

function sanitizeSelection(selection: number[], chainLength: number): number[] {
    return [...new Set(selection)]
        .filter((i) => Number.isInteger(i) && i >= 0 && i < chainLength)
        .sort((a, b) => a - b);
}

function isDegenerateDelta(delta: TransformDelta): boolean {
    if (delta.kind === 'translate') {
        return !Number.isFinite(delta.vector.x) || !Number.isFinite(delta.vector.y) || lenV(delta.vector) === 0;
    }
    return !Number.isFinite(delta.angle) || delta.angle === 0;
}

function isValidPivotForDelta(delta: TransformDelta, pivotIndex: number, chainLength: number): boolean {
    if (delta.kind === 'translate') return true; // the pivot plays no role in translation
    return Number.isInteger(pivotIndex) && pivotIndex >= 0 && pivotIndex < chainLength;
}

/** Rotating a selection that is nothing but the pivot itself moves nothing. */
function isRotationOfPivotAlone(delta: TransformDelta, selection: number[], pivotIndex: number): boolean {
    return delta.kind === 'rotate' && selection.length === 1 && selection[0] === pivotIndex;
}

/**
 * Entry point. Normalizes the selection, returns identity for degenerate
 * inputs, applies the shared discontiguous-selection -> rigid fallback, and
 * otherwise delegates to the chosen strategy. Never throws on bad input.
 */
export function solveArticulation(input: SolveInput): SolveResult {
    const { chain, pivotIndex, delta } = input;
    const chainLength = chain.elements.length;
    const selection = sanitizeSelection(input.selection, chainLength);
    if (chainLength < 2 || selection.length === 0) return identityResult(chain);
    if (isDegenerateDelta(delta)) return identityResult(chain);
    if (!isValidPivotForDelta(delta, pivotIndex, chainLength)) return identityResult(chain);
    if (isRotationOfPivotAlone(delta, selection, pivotIndex)) return identityResult(chain);

    const strategyInput: StrategyInput = {
        chain,
        selection,
        selectionSet: new Set(selection),
        pivotIndex,
        delta,
    };

    if (!isContiguous(selection)) return rigidStrategy.solve(strategyInput);

    const strategy = STRATEGIES[input.strategyId] ?? rigidStrategy;
    return strategy.solve(strategyInput);
}
