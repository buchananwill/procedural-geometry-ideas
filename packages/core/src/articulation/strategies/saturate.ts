import type { Vector2 } from '../../shared/types';
import type { ConstraintStrategy, SolveResult, StrategyInput } from '../types';
import { rotateAbout } from '../geometry';
import { clampToValid } from '../clamping';
import { ARTICULATION_EPSILON, isPoseValid } from '../validity';
import { splitSpans } from '../topology';
import { identityResult } from '../identity-result';
import { translateSelectionAsRigidUnit } from './rigid';

/**
 * Consume as much of `angle` as constraints allow for one span. Mutates
 * `out` in place; returns the fraction of the requested angle consumed.
 */
function saturateSpan(out: Vector2[], input: StrategyInput, span: number[], angle: number): number {
    const { chain, pivotIndex } = input;
    const active = [...span];
    let center = out[pivotIndex];
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

function solveSaturateRotation(input: StrategyInput, angle: number): SolveResult {
    const spans = splitSpans(input.selection, input.pivotIndex);
    // Defence-in-depth: solveArticulation already guards this, but saturateStrategy
    // is exported directly from the barrel, and dividing by zero spans would be NaN.
    if (spans.length === 0) return identityResult(input.chain);
    const out = input.chain.elements.map((p) => ({ ...p }));
    let fractionSum = 0;
    for (const span of spans) {
        fractionSum += saturateSpan(out, input, span, angle);
    }
    return { elements: out, appliedFraction: fractionSum / spans.length };
}

export const saturateStrategy: ConstraintStrategy = {
    id: 'saturate',
    label: 'Saturate Articulation',
    solve(input: StrategyInput): SolveResult {
        if (input.delta.kind === 'translate') {
            // Temporary: real probe-cascade translate semantics land in a
            // later unit. Delegate to the rigid translate for now.
            return translateSelectionAsRigidUnit(input.chain, input.selectionSet, input.delta.vector);
        }
        return solveSaturateRotation(input, input.delta.angle);
    },
};
