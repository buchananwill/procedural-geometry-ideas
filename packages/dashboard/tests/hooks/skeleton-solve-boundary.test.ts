import {
    WEIGHTED_INVISIBLE_VERTEX_REFUSED,
    WEIGHTED_RECTANGLE_FAST_FLOOR,
    WEIGHTED_SQUARE_NEAR_MAX_RATIO,
} from '@proc-geo/test-fixtures';
import {
    solveSkeletonBoundary,
    solveSkeletonGuarded,
    solveSkeletonSteppedGuarded,
} from '../../src/hooks/skeleton-solve-boundary';

/*
 * ============================================================================
 *  A DOOR REFUSAL IS A MESSAGE, NOT A THROW (arc decision 130)
 * ============================================================================
 *
 * The Edge Weights panel lets a user type a weight, so both of the solver's door refusals — the
 * RATIO bound (W-spec W3/W48) and WEIGHTS MAY CHANGE ONLY AT A VISIBLE CORNER (W-spec W49, decision
 * 124(b)) — are reachable on a keystroke. Every solve the dashboard makes goes through this module,
 * and its contract is that neither refusal escapes as an exception and that the solver's own words,
 * which name the offending edge or vertex, come back intact.
 *
 * THE MUTATION THIS FILE EXISTS FOR: drop either try/catch and the refusal cases die here — and in
 * the browser the whole canvas is replaced by React's error overlay on the keystroke that reaches
 * the bound.
 *
 * WHAT IT DOES NOT CONVICT, STATED PLAINLY: the hook that calls these. The dashboard has no React
 * renderer in its dev dependencies, so `useSkeletonAnimation` cannot be rendered here — that it
 * routes `solveError` out and holds the last good context on screen is held by the type checker,
 * the package build and the Playwright pass alone.
 */

const RATIO_REFUSED = {
    // One edge of a square set to 1e12 against neighbours at 1. The door's bound is the derived
    // `maxWeightRatio(δ) = δ / (64·√2·u)` (C8 spec T22, journal decision 156) — about 1e8 at the library
    // floor and 1e9 at 1e-5 — which replaced the retired `MAX_WEIGHT_RATIO = 100`; the panel's old worst
    // case of 500 is now admitted, so the refusal is reached with a ratio past every floor's bound.
    vertices: WEIGHTED_SQUARE_NEAR_MAX_RATIO.vertices,
    weights: [1, 1, 1, 1e12],
};

describe('the ratio refusal at the solve boundary', () => {
    it('comes back as a message rather than a throw', () => {
        expect(() => solveSkeletonBoundary(RATIO_REFUSED.vertices, {weights: RATIO_REFUSED.weights}))
            .not.toThrow();
        const outcome = solveSkeletonBoundary(
            RATIO_REFUSED.vertices, {weights: RATIO_REFUSED.weights});
        expect(outcome.indexRemap).toBeNull();
        expect(outcome.error).toMatch(/exceeds maxWeightRatio\(/);
        // The message names the two extreme edges, which is what the user has to go and change.
        expect(outcome.error).toMatch(/edge 3/);
    });

    it('is met by the direct solve and the stepped start as well', () => {
        const direct = solveSkeletonGuarded(RATIO_REFUSED.vertices, {weights: RATIO_REFUSED.weights});
        expect(direct.context).toBeNull();
        expect(direct.error).toMatch(/maxWeightRatio/);

        const stepped = solveSkeletonSteppedGuarded(
            RATIO_REFUSED.vertices, {weights: RATIO_REFUSED.weights});
        expect(stepped.result).toBeNull();
        expect(stepped.error).toMatch(/maxWeightRatio/);
    });
});

describe('the visible-corner refusal at the solve boundary', () => {
    const {vertices, weights} = WEIGHTED_INVISIBLE_VERTEX_REFUSED;

    it('comes back as a message naming the vertex, rather than a throw', () => {
        expect(() => solveSkeletonBoundary(vertices, {weights})).not.toThrow();
        const outcome = solveSkeletonBoundary(vertices, {weights});
        expect(outcome.indexRemap).toBeNull();
        expect(outcome.error).toMatch(/Weights may change only at a visible corner/);
        const refusedIndex = WEIGHTED_INVISIBLE_VERTEX_REFUSED.expected?.refusal?.vertexIndex;
        expect(refusedIndex).toBeDefined();
        expect(outcome.error).toMatch(new RegExp(`Vertex ${refusedIndex} carries a weight change`));
    });

    it('is met by the direct solve as well', () => {
        const direct = solveSkeletonGuarded(vertices, {weights});
        expect(direct.context).toBeNull();
        expect(direct.error).toMatch(/visible corner/);
    });
});

describe('an input inside the contract is not reported as an error', () => {
    it('solves the weighted rectangle and reports no refusal', () => {
        const {vertices, weights} = WEIGHTED_RECTANGLE_FAST_FLOOR;
        const boundary = solveSkeletonBoundary(vertices, {weights});
        expect(boundary.error).toBeNull();
        expect(boundary.indexRemap).not.toBeNull();

        const direct = solveSkeletonGuarded(vertices, {weights});
        expect(direct.error).toBeNull();
        expect(direct.context).not.toBeNull();
    });

    it('leaves the unweighted path exactly where it was', () => {
        // No weights, and the same ring the visible-corner case refuses: the door never runs, so the
        // invisible vertex is removed by canonicalisation as it always was.
        const {vertices} = WEIGHTED_INVISIBLE_VERTEX_REFUSED;
        const outcome = solveSkeletonBoundary(vertices, {});
        expect(outcome.error).toBeNull();
        expect(outcome.indexRemap).not.toBeNull();
    });

    it('reports nothing at all for a polygon with too few vertices to be one', () => {
        const outcome = solveSkeletonBoundary([{x: 0, y: 0}, {x: 1, y: 1}], {});
        expect(outcome).toEqual({indexRemap: null, error: null});
    });
});
