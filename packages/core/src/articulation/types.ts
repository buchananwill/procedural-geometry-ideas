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
    /** 1 = raw delta applied; <1 = clamped by constraints; 0 = fully blocked. */
    appliedFraction: number;
}

/** Normalized rotation input handed to strategies by solveArticulation. */
export interface RotationInput {
    chain: ArticulationChain;
    selectionSet: Set<number>;
    pivotIndex: number;
    /**
     * Contiguous runs of selected indices, each ordered walking away from the
     * pivot. One entry normally; two when the pivot is inside the selection.
     */
    spans: number[][];
    angle: number;
}

export interface ConstraintStrategy {
    readonly id: StrategyId;
    readonly label: string;
    solveRotation(input: RotationInput): SolveResult;
}
