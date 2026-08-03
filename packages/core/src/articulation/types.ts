import type { Vector2 } from '../shared/types';

/** Inclusive numeric bound; an axis is unconstrained when the field is undefined. */
export interface MinMax {
    min: number;
    max: number;
}

export interface ElementConstraints {
    /** Distance to previous element (index i-1). */
    distanceToPrev?: MinMax;
    /** Distance to next element (index i+1). */
    distanceToNext?: MinMax;
    /** Signed turning angle at this element, radians, CCW positive. */
    jointAngle?: MinMax;
}

export interface ArticulationChain {
    elements: Vector2[];
    /** Parallel to elements. */
    constraints: ElementConstraints[];
}

export type TransformDelta =
    | { kind: 'rotate'; angle: number }
    | { kind: 'translate'; vector: Vector2 };

export type StrategyId = 'rigid' | 'spread' | 'saturate';

export interface SolveInput {
    chain: ArticulationChain;
    selection: number[];
    pivotIndex: number;
    strategyId: StrategyId;
    delta: TransformDelta;
}

export interface SolveResult {
    /** Full new pose; unselected elements are unchanged copies. */
    elements: Vector2[];
    /**
     * For rigid and spread: the input delta scaled by this factor produces the
     * result pose (1 = raw delta applied, <1 = clamped, 0 = fully blocked).
     * For saturate: the fraction of the input absorbed before the remainder
     * was discarded (consumed delta / requested delta). For a rotation whose
     * pivot lies inside the selection, this is the mean of the per-span
     * fractions.
     */
    appliedFraction: number;
    /**
     * The strategy that actually produced this pose: the requested one, or
     * rigid where solveArticulation substituted it (a discontiguous selection,
     * or an id absent from the registry). An identity result reports the
     * strategy that WOULD have run had the input not been degenerate.
     */
    appliedStrategyId: StrategyId;
    /**
     * Selected elements this solve stopped moving before the rest of the
     * selection, in the order they stopped: saturate's translate cascade
     * freezes them at a boundary, and its rotation peels them off as each
     * becomes the next span's rotation centre. Simultaneous stops tie-break
     * deterministically: the lower boundary before the upper for a translate
     * step, and the below-pivot span before the above-pivot span for a
     * rotation. Rigid and spread move the selection as one body and so always
     * report an empty array, as does saturate when the whole selection carried
     * the delta through.
     */
    frozenElementIndices: number[];
}

/**
 * Normalized input handed to strategies by solveArticulation.
 *
 * `selection` is sanitized: sorted, unique, in-bounds, non-empty. Every
 * strategy but rigid additionally requires it to be CONTIGUOUS (rigid is the
 * fallback for discontiguous selections) -- spread and saturate call
 * `splitSpans`, which assumes contiguity. For a rotation, `selection` should
 * also not be the pivot alone -- `splitSpans` then returns no spans, which
 * saturate's fraction-per-span arithmetic divides by zero (NaN); it guards
 * this case defensively, but solveArticulation is what actually prevents it.
 * This package exports the strategies directly, so a caller that bypasses
 * `solveArticulation` must uphold these preconditions itself.
 */
export interface StrategyInput {
    chain: ArticulationChain;
    selection: number[];
    selectionSet: Set<number>;
    pivotIndex: number;
    delta: TransformDelta;
}

export interface ConstraintStrategy {
    readonly id: StrategyId;
    readonly label: string;
    solve(input: StrategyInput): SolveResult;
}
