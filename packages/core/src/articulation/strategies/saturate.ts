import type { Vector2 } from '../../shared/types';
import type { ConstraintStrategy, RotationInput, SolveResult } from '../types';
import { rotateAbout } from '../geometry';
import { clampToValid } from '../clamping';
import { ARTICULATION_EPSILON, isPoseValid } from '../validity';

/**
 * Consume as much of `angle` as constraints allow for one span. Mutates
 * `out` in place; returns the fraction of the requested angle consumed.
 */
function saturateSpan(out: Vector2[], input: RotationInput, span: number[], angle: number): number {
    const { chain } = input;
    const active = [...span];
    let center = out[input.pivotIndex];
    let remaining = angle;
    let consumed = 0;
    while (active.length > 0 && Math.abs(remaining) > ARTICULATION_EPSILON) {
        const base = out.map((p) => ({ ...p }));
        const stepAngle = remaining;
        const clamp = clampToValid(
            (t) => base.map((p, i) => (active.includes(i) ? rotateAbout(p, center, t * stepAngle) : p)),
            (els) => isPoseValid(els, chain.constraints),
        );
        for (let i = 0; i < out.length; i++) out[i] = clamp.elements[i];
        consumed += clamp.t * stepAngle;
        remaining = stepAngle * (1 - clamp.t);
        if (clamp.t >= 1) break;
        // First active element saturates and becomes the new rotation center.
        const saturated = active.shift()!;
        center = out[saturated];
    }
    return angle === 0 ? 1 : consumed / angle;
}

export const saturateStrategy: ConstraintStrategy = {
    id: 'saturate',
    label: 'Saturate Articulation',
    solveRotation(input: RotationInput): SolveResult {
        const out = input.chain.elements.map((p) => ({ ...p }));
        let fractionSum = 0;
        for (const span of input.spans) {
            fractionSum += saturateSpan(out, input, span, input.angle);
        }
        const appliedFraction = input.spans.length === 0 ? 1 : fractionSum / input.spans.length;
        return { elements: out, appliedFraction };
    },
};
