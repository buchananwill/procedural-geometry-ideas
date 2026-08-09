import { solveArticulation } from '../../src/articulation/solve';
import { isPoseValid, jointAngleAt, linkDistanceViolation } from '../../src/articulation/validity';
import { isContiguous } from '../../src/articulation/topology';
import { distV } from '../../src/articulation/geometry';
import type { ArticulationChain, ElementConstraints, SolveInput } from '../../src/articulation/types';
import type { Vector2 } from '../../src/shared/types';

/**
 * CLOSED LOOPS ARE NOT REPRESENTABLE BY THIS MODULE.
 *
 * The finding these tests record, stated once up front so no individual case has
 * to carry it: `ArticulationChain` has no topology field. Adjacency is implied
 * entirely by array index -- element i is linked to i-1 and i+1 -- and every
 * consumer of that adjacency does plain integer arithmetic with no wrap:
 *
 *   - `isPoseValid` walks links 0..n-2 and joints 1..n-2. The seam link
 *     (n-1, 0) and the seam joints at 0 and n-1 are simply not in the loops.
 *   - `jointAngleAt` returns null for i <= 0 and i >= n-1 by construction.
 *   - `enabledLinkDistanceBounds` is only ever reached with lowerLinkIndex in
 *     0..n-2, so `constraints[0].distanceToPrev` and
 *     `constraints[n-1].distanceToNext` -- precisely the two fields a caller
 *     would reach for to declare the seam -- are read by nothing.
 *   - `isContiguous` and `splitSpans` order the selection by integer comparison
 *     against the pivot, so a selection that is contiguous AROUND a loop is
 *     discontiguous to the module.
 *   - saturate's `findBoundaryPairs` treats index 0 and index n-1 as free ends
 *     ("a chain end is no boundary at all"), which is the open-chain assumption
 *     made explicit: in a loop those two are neighbours.
 *
 * Consequently there is no loop-closure constraint to satisfy, and the four
 * areas a closed-loop suite would cover collapse into one answer: every
 * strategy happily returns a pose in which the loop is torn open, reports it
 * `isPoseValid`, and reports `appliedFraction` 1. That is not a solver defect --
 * the solver was never told a closure existed. It is a representation gap, and
 * these tests pin it down so it cannot be mistaken for working support.
 *
 * The tests below therefore document, in order:
 *   1. that the seam constraints are unreadable/dead (representability);
 *   2. that a loop encoded the only way the type admits -- by duplicating the
 *      seam element -- has its closure silently broken by all three strategies;
 *   3. that an unclosable (over-constrained) loop is reported perfectly valid.
 */

const SIDE = 4;

/** The four corners of a square, intended by the caller as a closed 4-cycle. */
function squareCorners(): Vector2[] {
    return [
        { x: 0, y: 0 },
        { x: SIDE, y: 0 },
        { x: SIDE, y: SIDE },
        { x: 0, y: SIDE },
    ];
}

function noConstraints(elements: Vector2[]): ElementConstraints[] {
    return elements.map(() => ({} as ElementConstraints));
}

/**
 * The only encoding of a cycle the type admits: the seam element repeated, so
 * that the last element starts coincident with the first. The closure it is
 * meant to express -- "element n-1 IS element 0" -- has no home in
 * `ElementConstraints`, so it is declared in the nearest-looking field,
 * `constraints[n-1].distanceToNext`, which nothing reads.
 */
function seamDuplicatedSquare(): ArticulationChain {
    const elements: Vector2[] = [...squareCorners(), { x: 0, y: 0 }];
    const constraints = noConstraints(elements);
    for (let i = 0; i < 4; i++) constraints[i] = { distanceToNext: { min: 3, max: 5 } };
    // The caller's attempt at a closure declaration. Dead: see the first describe.
    constraints[4] = { distanceToNext: { min: 0, max: 0 } };
    return { elements, constraints };
}

/** How far the loop is open: the gap between the seam element and the element it must meet. */
function closureResidual(elements: Vector2[]): number {
    return distV(elements[0], elements[elements.length - 1]);
}

function loopSolveInput(chain: ArticulationChain, overrides: Partial<SolveInput> = {}): SolveInput {
    return {
        chain,
        selection: [2, 3, 4],
        pivotIndex: 1,
        strategyId: 'rigid',
        delta: { kind: 'rotate', angle: Math.PI / 6 },
        ...overrides,
    };
}

describe('closed-loop representability', () => {
    it('never validates the seam link, however its bounds are declared', () => {
        const square = squareCorners();
        const constraints = noConstraints(square);
        // Both fields that could name the link between the last element and the
        // first. The declared length (100..200) is nowhere near the actual seam
        // length of 4, so any reader of either field would reject this pose.
        constraints[3] = { distanceToNext: { min: 100, max: 200 } };
        constraints[0] = { distanceToPrev: { min: 100, max: 200 } };
        expect(isPoseValid(square, constraints)).toBe(true);

        // Contrast: the same impossible bound on a link the module DOES know
        // about is caught, so the pass above is dead fields, not a lax predicate.
        const interior = noConstraints(square);
        interior[3] = { distanceToPrev: { min: 100, max: 200 } };
        expect(isPoseValid(square, interior)).toBe(false);
    });

    it('cannot even address the seam link by index', () => {
        const square = squareCorners();
        // Link indices run 0..n-2; the seam would be link n-1, which indexes
        // elements[n] and dereferences undefined rather than wrapping to 0.
        expect(() => linkDistanceViolation(square, noConstraints(square), 3)).toThrow(TypeError);
    });

    it('never evaluates the two joint angles at the seam', () => {
        const square = squareCorners();
        // In a genuine 4-cycle every corner is a joint. Here the two corners
        // adjacent to the seam have no angle at all.
        expect(jointAngleAt(square, 0)).toBeNull();
        expect(jointAngleAt(square, 3)).toBeNull();

        const constraints = noConstraints(square);
        const impossible = { jointAngle: { min: 3, max: 3.1 } };
        constraints[0] = impossible;
        constraints[3] = impossible;
        expect(isPoseValid(square, constraints)).toBe(true);
        // The same bound one element further in is enforced, so again: dead
        // fields at the seam, not a permissive check.
        const interior = noConstraints(square);
        interior[1] = impossible;
        expect(isPoseValid(square, interior)).toBe(false);
    });

    it('treats a selection contiguous around the loop as discontiguous', () => {
        // On a 6-cycle, {4, 5, 0, 1} is one unbroken arc across the seam. The
        // module sorts it to [0, 1, 4, 5], sees a gap, and substitutes rigid --
        // so the strategy a caller asked for is silently not the one that runs.
        expect(isContiguous([0, 1, 4, 5])).toBe(false);

        const hexagon: Vector2[] = [0, 1, 2, 3, 4, 5].map((k) => ({
            x: Math.cos((k * Math.PI) / 3) * 5,
            y: Math.sin((k * Math.PI) / 3) * 5,
        }));
        const chain: ArticulationChain = { elements: hexagon, constraints: noConstraints(hexagon) };
        const result = solveArticulation({
            chain,
            selection: [4, 5, 0, 1],
            pivotIndex: 3,
            strategyId: 'spread',
            delta: { kind: 'rotate', angle: 0.4 },
        });
        expect(result.appliedStrategyId).toBe('rigid');
    });
});

describe('seam-duplicated cycle: closure is not a constraint any strategy honours', () => {
    // The load-bearing case. In an open chain the free end absorbs error; a
    // closed loop has no free end, so the last element must meet the first.
    // Every case below SHOULD either hold that closure or report that it could
    // not. Neither happens: the closure residual grows from 0 to world-scale
    // while the module reports a fully valid pose and a fully applied delta.
    const cases = [
        { delta: { kind: 'rotate', angle: Math.PI / 6 } as const, label: 'rotate' },
        { delta: { kind: 'translate', vector: { x: 3, y: 0 } } as const, label: 'translate' },
    ];

    for (const strategyId of ['rigid', 'spread', 'saturate'] as const) {
        for (const { delta, label } of cases) {
            describe(`${strategyId} ${label}`, () => {
                const chain = seamDuplicatedSquare();
                const residualBefore = closureResidual(chain.elements);
                const result = solveArticulation(loopSolveInput(chain, { strategyId, delta }));

                it('starts from a closed, valid loop', () => {
                    expect(residualBefore).toBe(0);
                    expect(isPoseValid(chain.elements, chain.constraints)).toBe(true);
                });

                it('terminates and runs the requested strategy', () => {
                    expect(result.appliedStrategyId).toBe(strategyId);
                    expect(result.elements).toHaveLength(chain.elements.length);
                    result.elements.forEach((point) => {
                        expect(Number.isFinite(point.x)).toBe(true);
                        expect(Number.isFinite(point.y)).toBe(true);
                    });
                });

                it('preserves every link the module knows about', () => {
                    // The linear constraints are honoured exactly -- this is not
                    // a solver that is misbehaving, it is one solving a
                    // different (open-chain) problem correctly.
                    for (let lowerIndex = 0; lowerIndex < chain.elements.length - 1; lowerIndex++) {
                        expect(linkDistanceViolation(result.elements, chain.constraints, lowerIndex))
                            .toBeCloseTo(0, 9);
                    }
                });

                it('BREAKS the loop closure while reporting a valid, fully applied solve', () => {
                    // SHOULD: the closure residual stays at 0 (within, say, 1e-6
                    // world units), or the solve reports it could not close --
                    // by clamping appliedFraction below 1, or by naming the seam
                    // elements in clampedElementIndices.
                    // ACTUALLY: the residual opens to more than a whole world
                    // unit, appliedFraction is 1, and the pose passes
                    // isPoseValid. Nothing anywhere reports the tear.
                    expect(closureResidual(result.elements)).toBeGreaterThan(1);
                    expect(result.appliedFraction).toBe(1);
                    expect(isPoseValid(result.elements, chain.constraints)).toBe(true);
                });
            });
        }
    }
});

describe('over-constrained loop: link lengths that cannot span the cycle', () => {
    /**
     * A 3-cycle with declared link lengths 10, 1, 1. The triangle inequality
     * says it cannot close: from element 1 the seam element can reach at most 2
     * units, while element 0 sits 10 units away, so the closure gap can never
     * fall below 8.
     *
     * Encoded, again, by duplicating the seam element. All three LINEAR links
     * are satisfiable and are satisfied exactly, so from the module's point of
     * view nothing is wrong at all.
     */
    const UNCLOSABLE_MINIMUM_GAP = 8;

    function unclosableTriangle(): ArticulationChain {
        const elements: Vector2[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 1 },
            { x: 10, y: 2 },
        ];
        const constraints = noConstraints(elements);
        constraints[0] = { distanceToNext: { min: 10, max: 10 } };
        constraints[1] = { distanceToNext: { min: 1, max: 1 } };
        constraints[2] = { distanceToNext: { min: 1, max: 1 } };
        // Again the dead closure declaration; see the representability describe.
        constraints[3] = { distanceToNext: { min: 0, max: 0 } };
        return { elements, constraints };
    }

    it('reports an unclosable loop as a perfectly valid pose', () => {
        // SHOULD: an over-constrained loop is detectable before any solve runs.
        // ACTUALLY: isPoseValid is true and every violation is zero, because the
        // only constraint that is unsatisfiable is the one the module cannot
        // represent. Over-constraint is undetectable here by construction.
        const chain = unclosableTriangle();
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(true);
        for (let lowerIndex = 0; lowerIndex < chain.elements.length - 1; lowerIndex++) {
            expect(linkDistanceViolation(chain.elements, chain.constraints, lowerIndex)).toBe(0);
        }
        expect(closureResidual(chain.elements)).toBeGreaterThanOrEqual(UNCLOSABLE_MINIMUM_GAP);
    });

    for (const strategyId of ['rigid', 'spread', 'saturate'] as const) {
        it(`${strategyId} solves it without reporting the failure, and cannot close it`, () => {
            // SHOULD: refuse, or report the closure as the binding constraint.
            // ACTUALLY: a normal solve. It neither closes the loop (it cannot --
            // the gap is bounded below by 8 for any pose respecting the link
            // lengths) nor signals that anything is unsatisfiable.
            const chain = unclosableTriangle();
            const result = solveArticulation({
                chain,
                selection: [2, 3],
                pivotIndex: 1,
                strategyId,
                delta: { kind: 'rotate', angle: 0.4 },
            });
            expect(result.appliedStrategyId).toBe(strategyId);
            expect(isPoseValid(result.elements, chain.constraints)).toBe(true);
            expect(closureResidual(result.elements)).toBeGreaterThanOrEqual(UNCLOSABLE_MINIMUM_GAP);
        });
    }
});
