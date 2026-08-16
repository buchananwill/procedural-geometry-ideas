import {Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE OPERATING-ENVELOPE PLACEMENT, DEFINED ONCE.
 * ============================================================================
 *
 * Two suites sweep the same envelope over the same fixture corpus:
 * `large-coordinate-failures.test.ts` measures which placements still SOLVE, and
 * `normalisation.test.ts` measures which placements still ROUND-TRIP on the bit. Both
 * need the identical placement, because the second is the explanation of the first —
 * comparing their tables only means something if the cell coordinates are the same
 * coordinates.
 *
 * So the formula lives here rather than once per suite. It is a formula, not a loop
 * shape: the operand order (`scale` applied about the origin FIRST, then `translate`)
 * is load-bearing for the precision argument in `normalisation.ts`, and a copy that
 * drifted to `(vertex.x + translate) * scale` would silently re-point one of the two
 * tables at a different envelope.
 *
 * This file is deliberately NOT named `*.test.ts`: `jest.config.cjs` matches
 * `tests/**\/*.test.ts`, so a helper module beside the suites is not collected as an
 * empty suite.
 */

/**
 * Place a fixture in the plane: scale about the ORIGIN, then translate both axes by the same
 * amount.
 *
 * `scale` sizes the polygon (the corpus is authored at 10^2–10^3 units; the eventual consumer
 * works at 10^4–10^5) and `translate` carries it away from the origin, which is the axis along
 * which an absolute epsilon degrades. A placement of `(1, 0)` is the fixture as authored.
 */
export function place(vertices: readonly Vector2[], scale: number, translate: number): Vector2[] {
    return vertices.map(vertex => ({x: vertex.x * scale + translate, y: vertex.y * scale + translate}));
}
