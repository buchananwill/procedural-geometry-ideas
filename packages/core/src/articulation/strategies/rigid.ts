import type { Vector2 } from '../../shared/types';
import type { ArticulationChain, ConstraintStrategy, SolveResult, StrategyId, StrategyInput } from '../types';
import { addV, rotateAbout, scaleV } from '../geometry';
import { clampToValid } from '../clamping';
import { makePoseNoWorsePredicate } from '../validity';

/** Rotate every selected element about pivotPos; unselected elements copied unchanged. */
export function rigidRotationPose(
    chain: ArticulationChain,
    selectionSet: Set<number>,
    pivotPos: Vector2,
    angle: number,
): Vector2[] {
    return chain.elements.map((p, i) => (selectionSet.has(i) ? rotateAbout(p, pivotPos, angle) : { ...p }));
}

/** Translate every selected element by vector; unselected elements copied unchanged. */
function translationPose(chain: ArticulationChain, selectionSet: Set<number>, vector: Vector2): Vector2[] {
    return chain.elements.map((p, i) => (selectionSet.has(i) ? addV(p, vector) : { ...p }));
}

/**
 * Move the whole selection by the same vector, clamped to the largest scale
 * factor that worsens no constraint relative to the starting pose. Shared
 * across strategies that treat translation as a rigid unit motion, so the
 * caller says which strategy the result should be attributed to.
 */
export function translateSelectionAsRigidUnit(
    chain: ArticulationChain,
    selectionSet: Set<number>,
    vector: Vector2,
    appliedStrategyId: StrategyId,
): SolveResult {
    const clamp = clampToValid(
        (t) => translationPose(chain, selectionSet, scaleV(vector, t)),
        makePoseNoWorsePredicate(chain.elements, chain.constraints),
    );
    return {
        elements: clamp.elements,
        appliedFraction: clamp.t,
        appliedStrategyId,
        frozenElementIndices: [],
    };
}

function solveRigidRotation(input: StrategyInput, angle: number): SolveResult {
    const pivotPos = input.chain.elements[input.pivotIndex];
    const clamp = clampToValid(
        (t) => rigidRotationPose(input.chain, input.selectionSet, pivotPos, t * angle),
        makePoseNoWorsePredicate(input.chain.elements, input.chain.constraints),
    );
    return {
        elements: clamp.elements,
        appliedFraction: clamp.t,
        appliedStrategyId: 'rigid',
        frozenElementIndices: [],
    };
}

export const rigidStrategy: ConstraintStrategy = {
    id: 'rigid',
    label: 'Rigid Assembly',
    solve(input: StrategyInput): SolveResult {
        if (input.delta.kind === 'translate') {
            return translateSelectionAsRigidUnit(input.chain, input.selectionSet, input.delta.vector, 'rigid');
        }
        return solveRigidRotation(input, input.delta.angle);
    },
};
