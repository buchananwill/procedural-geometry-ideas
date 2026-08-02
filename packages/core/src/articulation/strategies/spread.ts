import type { Vector2 } from '../../shared/types';
import type { ConstraintStrategy, RotationInput, SolveResult } from '../types';
import { rotateAbout } from '../geometry';
import { clampToValid } from '../clamping';
import { isPoseValid } from '../validity';

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
    input: RotationInput,
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

function spreadPose(input: RotationInput, angle: number): Vector2[] {
    const out = input.chain.elements.map((p) => ({ ...p }));
    for (const span of input.spans) {
        applySpreadToSpan(out, input, span, angle);
    }
    return out;
}

export const spreadStrategy: ConstraintStrategy = {
    id: 'spread',
    label: 'Spread Articulation',
    solveRotation(input: RotationInput): SolveResult {
        const clamp = clampToValid(
            (t) => spreadPose(input, t * input.angle),
            (els) => isPoseValid(els, input.chain.constraints),
        );
        return { elements: clamp.elements, appliedFraction: clamp.t };
    },
};
