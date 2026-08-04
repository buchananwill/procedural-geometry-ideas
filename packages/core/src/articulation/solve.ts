import type {
    ArticulationChain,
    ConstraintStrategy,
    ElementClampTolerance,
    SolveInput,
    SolveResult,
    StrategyId,
    StrategyResult,
    TransformDelta,
} from './types';
import { lenV } from './geometry';
import { ARTICULATION_EPSILON, DEFAULT_ELEMENT_CLAMP_TOLERANCE, measureClampedElementIndices } from './validity';
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

/**
 * Degeneracy is epsilon-based, matching the saturate cascade's own bail-out:
 * a sub-epsilon delta must yield an identity result (appliedFraction 1), not
 * a cascade that consumes nothing and reports a spurious full clamp.
 */
function isDegenerateDelta(delta: TransformDelta): boolean {
    if (delta.kind === 'translate') {
        return !Number.isFinite(delta.vector.x) || !Number.isFinite(delta.vector.y)
            || lenV(delta.vector) <= ARTICULATION_EPSILON;
    }
    return !Number.isFinite(delta.angle) || Math.abs(delta.angle) <= ARTICULATION_EPSILON;
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
 * The strategy a sanitized selection dispatches to: the registered one, with
 * rigid standing in for a discontiguous selection (which the other strategies'
 * span arithmetic assumes away) and for an unregistered id.
 */
function resolveStrategy(strategyId: StrategyId, selection: number[]): ConstraintStrategy {
    if (!isContiguous(selection)) return rigidStrategy;
    return STRATEGIES[strategyId] ?? rigidStrategy;
}

/**
 * The one place element clamps are measured: strategies produce a pose, and the
 * at-bound set is read back off that pose on identical terms for all of them,
 * identity results included.
 */
function withElementClampReport(
    result: StrategyResult,
    chain: ArticulationChain,
    selection: number[],
    tolerance: ElementClampTolerance,
): SolveResult {
    return {
        ...result,
        clampedElementIndices: measureClampedElementIndices(result.elements, chain.constraints, selection, tolerance),
    };
}

/**
 * Entry point. Normalizes the selection, returns identity for degenerate
 * inputs, applies the shared discontiguous-selection -> rigid fallback,
 * otherwise delegates to the chosen strategy, and reports the element clamps of
 * whichever pose came back. Never throws on bad input.
 */
export function solveArticulation(input: SolveInput): SolveResult {
    const { chain, pivotIndex, delta } = input;
    const chainLength = chain.elements.length;
    const selection = sanitizeSelection(input.selection, chainLength);
    const strategy = resolveStrategy(input.strategyId, selection);
    const tolerance = input.elementClampTolerance ?? DEFAULT_ELEMENT_CLAMP_TOLERANCE;
    const reported = (result: StrategyResult): SolveResult =>
        withElementClampReport(result, chain, selection, tolerance);

    if (chainLength < 2 || selection.length === 0) return reported(identityResult(chain, strategy.id));
    if (isDegenerateDelta(delta)) return reported(identityResult(chain, strategy.id));
    if (!isValidPivotForDelta(delta, pivotIndex, chainLength)) return reported(identityResult(chain, strategy.id));
    if (isRotationOfPivotAlone(delta, selection, pivotIndex)) return reported(identityResult(chain, strategy.id));

    return reported(strategy.solve({
        chain,
        selection,
        selectionSet: new Set(selection),
        pivotIndex,
        delta,
    }));
}
