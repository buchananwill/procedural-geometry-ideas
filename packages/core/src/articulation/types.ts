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

/**
 * How close a constraint value must sit to one of its limits to count as at
 * that bound, in world units and radians respectively. This is a presentation
 * concern -- how close reads as "at" the bound on screen -- so it is an input
 * rather than a property of the geometry.
 */
export interface ElementClampTolerance {
    distance: number;
    angle: number;
}

export interface SolveInput {
    chain: ArticulationChain;
    selection: number[];
    pivotIndex: number;
    strategyId: StrategyId;
    delta: TransformDelta;
    /** Defaults to DEFAULT_ELEMENT_CLAMP_TOLERANCE. */
    elementClampTolerance?: ElementClampTolerance;
}

/**
 * What a strategy computes: the pose and how much of the delta reached it.
 * Element-clamp reporting is measured once, by solveArticulation, from the pose
 * a strategy hands back -- so strategies neither collect nor report it.
 */
export interface StrategyResult {
    /** Full new pose; unselected elements are unchanged copies. */
    elements: Vector2[];
    /**
     * For rigid, and for spread rotate: the input delta scaled by this factor
     * produces the result pose (1 = raw delta applied, <1 = selection-clamped,
     * 0 = fully blocked). For saturate: the fraction of the input absorbed
     * before the remainder was discarded (consumed delta / requested delta).
     * For spread translate: the fraction of the requested vector the furthest
     * element of each span achieved, since its relaxation can leave that
     * element short of the target inside a pose the clamp accepts whole. For a
     * rotation whose pivot lies inside the selection, and for every spread
     * translate, this is the mean of the per-span fractions.
     */
    appliedFraction: number;
    /**
     * The strategy that actually produced this pose: the requested one, or
     * rigid where solveArticulation substituted it (a discontiguous selection,
     * or an id absent from the registry). An identity result reports the
     * strategy that WOULD have run had the input not been degenerate.
     */
    appliedStrategyId: StrategyId;
}

export interface SolveResult extends StrategyResult {
    /**
     * Selected elements that sit at a constraint bound they participate in, in
     * the result pose, in ascending index order -- the ELEMENT clamp, as
     * opposed to the SELECTION clamp that `appliedFraction` below 1 reports.
     *
     * One uniform rule: an at-bound constraint marks every selected element
     * that participates in it. A link's distance bound (declared by whichever
     * endpoint's constraint entry) marks both of its endpoints; a joint angle
     * bound at element j marks j and its two neighbours, whose positions form
     * the angle. "At" means within `SolveInput.elementClampTolerance` of a
     * limit, measured from either side: an element resting just inside a bound
     * and one pushed just outside it by an invalid starting pose both count.
     *
     * The set is a property of the pose, not a history of the solve, so it is
     * measured identically for every strategy and for identity results. A drag
     * that was fully absorbed can still report clamped elements, and a
     * selection-clamped drag always names at least one selected element,
     * because only selected elements move and so the binding constraint always
     * has a selected participant.
     */
    clampedElementIndices: number[];
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
    solve(input: StrategyInput): StrategyResult;
}
