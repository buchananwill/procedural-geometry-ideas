import type { Vector2 } from '../../shared/types';
import type { ArticulationChain, ConstraintStrategy, SolveResult, StrategyInput } from '../types';
import { addV, rotateAbout, scaleV } from '../geometry';
import { clampToValid } from '../clamping';
import { isPoseValid } from '../validity';

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
 * Move the whole selection by the same vector, clamped to the largest valid
 * scale factor. Shared across strategies that treat translation as a rigid
 * unit motion.
 */
export function translateSelectionAsRigidUnit(
    chain: ArticulationChain,
    selectionSet: Set<number>,
    vector: Vector2,
): SolveResult {
    const clamp = clampToValid(
        (t) => translationPose(chain, selectionSet, scaleV(vector, t)),
        (els) => isPoseValid(els, chain.constraints),
    );
    return { elements: clamp.elements, appliedFraction: clamp.t };
}

function solveRigidRotation(input: StrategyInput, angle: number): SolveResult {
    const pivotPos = input.chain.elements[input.pivotIndex];
    const clamp = clampToValid(
        (t) => rigidRotationPose(input.chain, input.selectionSet, pivotPos, t * angle),
        (els) => isPoseValid(els, input.chain.constraints),
    );
    return { elements: clamp.elements, appliedFraction: clamp.t };
}

export const rigidStrategy: ConstraintStrategy = {
    id: 'rigid',
    label: 'Rigid Assembly',
    solve(input: StrategyInput): SolveResult {
        if (input.delta.kind === 'translate') {
            return translateSelectionAsRigidUnit(input.chain, input.selectionSet, input.delta.vector);
        }
        return solveRigidRotation(input, input.delta.angle);
    },
};
