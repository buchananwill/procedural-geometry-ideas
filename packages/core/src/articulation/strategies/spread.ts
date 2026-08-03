import type { Vector2 } from '../../shared/types';
import type { ConstraintStrategy, SolveResult, StrategyInput } from '../types';
import { rotateAbout } from '../geometry';
import { clampToValid } from '../clamping';
import { makePoseNoWorsePredicate } from '../validity';
import { splitSpans } from '../topology';
import { translateSelectionAsRigidUnit } from './rigid';

/** Index pairs (a, b) walking from the pivot to the far end of the span. */
function walkPairs(pivotIndex: number, span: number[]): Array<[number, number]> {
    const far = span[span.length - 1];
    const dir = far > pivotIndex ? 1 : -1;
    const pairs: Array<[number, number]> = [];
    for (let j = pivotIndex + dir; dir > 0 ? j <= far : j >= far; j += dir) {
        pairs.push([j - dir, j]);
    }
    return pairs;
}

function applySpreadToSpan(
    out: Vector2[],
    input: StrategyInput,
    span: number[],
    angle: number,
): void {
    const { pivotIndex, selectionSet } = input;
    const far = span[span.length - 1];
    const dir = far > pivotIndex ? 1 : -1;
    const qualifying = walkPairs(pivotIndex, span).filter(([, b]) => selectionSet.has(b));
    if (qualifying.length === 0) return;
    const share = angle / qualifying.length;
    for (const [a, b] of qualifying) {
        const center = out[a];
        for (let j = b; dir > 0 ? j <= far : j >= far; j += dir) {
            if (selectionSet.has(j)) out[j] = rotateAbout(out[j], center, share);
        }
    }
}

function spreadPose(input: StrategyInput, spans: number[][], angle: number): Vector2[] {
    const out = input.chain.elements.map((p) => ({ ...p }));
    for (const span of spans) {
        applySpreadToSpan(out, input, span, angle);
    }
    return out;
}

function solveSpreadRotation(input: StrategyInput, angle: number): SolveResult {
    // Empty spans need no guard here: spreadPose simply rotates nothing, and
    // spread never divides by the span count, so there is no NaN to avoid.
    const spans = splitSpans(input.selection, input.pivotIndex);
    const clamp = clampToValid(
        (t) => spreadPose(input, spans, t * angle),
        makePoseNoWorsePredicate(input.chain.elements, input.chain.constraints),
    );
    return { elements: clamp.elements, appliedFraction: clamp.t };
}

export const spreadStrategy: ConstraintStrategy = {
    id: 'spread',
    label: 'Spread Articulation',
    solve(input: StrategyInput): SolveResult {
        if (input.delta.kind === 'translate') {
            // Spread defines no distinct translate semantics today; it moves
            // the selection as a rigid unit, same as the rigid strategy.
            return translateSelectionAsRigidUnit(input.chain, input.selectionSet, input.delta.vector);
        }
        return solveSpreadRotation(input, input.delta.angle);
    },
};
