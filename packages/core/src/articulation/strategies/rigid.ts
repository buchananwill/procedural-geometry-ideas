import type { Vector2 } from '../../shared/types';
import type { ArticulationChain, ConstraintStrategy, RotationInput, SolveResult } from '../types';
import { rotateAbout } from '../geometry';
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

export const rigidStrategy: ConstraintStrategy = {
    id: 'rigid',
    label: 'Rigid Assembly',
    solveRotation(input: RotationInput): SolveResult {
        const pivotPos = input.chain.elements[input.pivotIndex];
        const clamp = clampToValid(
            (t) => rigidRotationPose(input.chain, input.selectionSet, pivotPos, t * input.angle),
            (els) => isPoseValid(els, input.chain.constraints),
        );
        return { elements: clamp.elements, appliedFraction: clamp.t };
    },
};
