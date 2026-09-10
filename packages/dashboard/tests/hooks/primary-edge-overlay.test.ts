import { computePrimaryInteriorEdges } from '@proc-geo/core';
import type { PrimaryInteriorEdge, Vector2 } from '@proc-geo/core';
import { WEIGHTED_RECTANGLE_FAST_FLOOR } from '@proc-geo/test-fixtures';

/*
 * ============================================================================
 *  THE PRIMARY-BISECTOR OVERLAY IS DRAWN AT THE SOLVE'S WEIGHTS
 * ============================================================================
 *
 * W-spec W15, ruled by arc decision 114(ii). `useSkeletonAnimation` draws the primary bisectors of
 * the polygon as an overlay on the canvas, beside the skeleton the solver produced. Under weights
 * those bisectors are not the angle bisectors any more — they are the kernel's directions, the
 * solution of `v · n₁ = w₁`, `v · n₂ = w₂` — so an overlay computed without the weights draws lines
 * the solve does not have. That is a WRONG PICTURE, not a simplified one, which is why the spec's
 * original "leave it unweighted and say so in the name" option was rejected.
 *
 * THE MUTATION THIS FILE EXISTS FOR: drop the weights from `computePrimaryInteriorEdges` — revert it
 * to `makeBisectedBasis(cwBasis, fromNodeWS)` — and the first two cases here die while every other
 * suite in both packages stays green, because nothing else in the repository draws this overlay.
 *
 * WHAT IT DOES NOT CONVICT, STATED PLAINLY: the hook's own threading of `weights` into the four
 * derivations it makes. The dashboard has no React renderer in its dev dependencies, so a hook
 * cannot be run here; that threading is held by the type checker and the package build alone.
 */

const RECTANGLE = WEIGHTED_RECTANGLE_FAST_FLOOR.vertices;
const WEIGHTS = WEIGHTED_RECTANGLE_FAST_FLOOR.weights;

/** The overlay's drawn direction at one input vertex, as a unit vector. */
function overlayDirection(edges: PrimaryInteriorEdge[], vertexIndex: number): Vector2 {
    const edge = edges.find(candidate => candidate.vertexIndex === vertexIndex);
    if (edge === undefined) {
        throw new Error(`the overlay drew nothing at vertex ${vertexIndex}`);
    }
    const run = { x: edge.target.x - edge.source.x, y: edge.target.y - edge.source.y };
    const length = Math.hypot(run.x, run.y);
    return { x: run.x / length, y: run.y / length };
}

/** Is `actual` the same direction as `expected`, to `1e-12`? Parallel AND same-facing. */
function pointsAlong(actual: Vector2, expected: Vector2): boolean {
    const length = Math.hypot(expected.x, expected.y);
    const unit = { x: expected.x / length, y: expected.y / length };
    return Math.abs(actual.x * unit.y - actual.y * unit.x) < 1e-12
        && actual.x * unit.x + actual.y * unit.y > 0;
}

describe('the primary-bisector overlay under weights (W15, arc decision 114(ii))', () => {
    it('draws the KERNEL direction at a vertex whose two edges differ in speed', () => {
        /*
         * §4.1's rectangle: `(0,0) (0,2) (4,2) (4,0)` with the bottom wall (edge 3) at speed 2.
         * Vertex 0 sits between edge 3 (incoming, speed 2) and edge 0 (outgoing, speed 1), and the
         * kernel there is `v = (1, 2)` — the fast floor drives the corner upward twice as fast as
         * the slow side wall drives it inward. Unweighted the same corner draws `(1, 1)`.
         */
        const weighted = computePrimaryInteriorEdges(RECTANGLE, WEIGHTS);
        expect(pointsAlong(overlayDirection(weighted, 0), { x: 1, y: 2 })).toBe(true);
        expect(pointsAlong(overlayDirection(weighted, 3), { x: -1, y: 2 })).toBe(true);

        const unweighted = computePrimaryInteriorEdges(RECTANGLE);
        expect(pointsAlong(overlayDirection(unweighted, 0), { x: 1, y: 1 })).toBe(true);
        expect(pointsAlong(overlayDirection(unweighted, 3), { x: -1, y: 1 })).toBe(true);
    });

    it('leaves the equally-weighted corners of the same polygon where they were', () => {
        // Vertices 1 and 2 have speed 1 on both sides, so the kernel there IS the angle bisector and
        // the overlay must not have moved. That is what makes the case above a weight effect rather
        // than a change of construction.
        const weighted = computePrimaryInteriorEdges(RECTANGLE, WEIGHTS);
        expect(pointsAlong(overlayDirection(weighted, 1), { x: 1, y: -1 })).toBe(true);
        expect(pointsAlong(overlayDirection(weighted, 2), { x: -1, y: -1 })).toBe(true);
    });

    it('is bit-identical to the unweighted overlay at all-ones weights', () => {
        // W-spec W12: every scaling is by exactly `1.0`, so this is identity and not approximation.
        // An overlay that merely came CLOSE at unit weights would be a second construction.
        const ones = computePrimaryInteriorEdges(RECTANGLE, RECTANGLE.map(() => 1));
        expect(ones).toEqual(computePrimaryInteriorEdges(RECTANGLE));
        expect(computePrimaryInteriorEdges(RECTANGLE, [])).toEqual(
            computePrimaryInteriorEdges(RECTANGLE));
    });

    it('refuses a weights array of the wrong length rather than padding it', () => {
        // The same rule the solver's door applies (W-spec W1): a short array silently draws a
        // different polygon's bisectors, and the hook turns the throw into an absent overlay.
        expect(() => computePrimaryInteriorEdges(RECTANGLE, [1, 1])).toThrow(/2 weights for 4 vertices/);
    });
});
