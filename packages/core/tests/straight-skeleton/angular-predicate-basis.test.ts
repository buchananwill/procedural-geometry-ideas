import {
    areEqual,
    crossProduct,
    directionsAreSame,
    DIRECTION_SINE_BAR,
    dotProduct,
    FLOATING_POINT_EPSILON,
    intersectRays,
    makeRay,
    negateVector,
    normalize,
    PARALLEL_GATE_SINE_BAR,
    scaleVector,
    sineIsBelow,
    SKELETON_NOISE_FLOOR,
    vectorsAreEqual,
} from '@proc-geo/core';
import type {Vector2} from '@proc-geo/core';

/**
 * THE ONE ANGULAR BASIS — journal decision 105, landed as `sineIsBelow` / `directionsAreSame`.
 *
 * The ruling: "a single value must never receive different verdicts depending on which code path
 * reached the predicate". Angle was where the solver broke that worst. Three sites decided "same
 * direction" — a component box on two unit vectors, an `areEqual` on their dot product, and a bare
 * `1e-4` box with no comment anywhere in the record — answering at ≈1e-8, 1.41e-4 and ≈1.41e-4
 * radians. Two of those three were the SAME constant read in two spaces.
 *
 * This file pins the replacement, and it pins the three things that would silently undo it:
 *
 *   1. the DERIVATION — `PARALLEL_GATE_SINE_BAR` is the exact sine-space restatement of
 *      `areEqual(|dot|, 1)`, so converting that site was a change of spelling and not of verdict;
 *   2. the FORM — the sine test is scale-free and isotropic, which the component box on a
 *      normalised vector is not, and the second of those is the property that let one separation
 *      be judged twice;
 *   3. the SYMMETRY — `intersectRays`' two collinearity exits are mirror images and now answer the
 *      same separation identically. They used to answer at bars four orders apart.
 *
 * WHAT IS NOT PINNED HERE, DELIBERATELY: that the two bars are one number. They are not, and the
 * collapse was attempted in both directions and refused by the corpus — see the note on
 * `PARALLEL_GATE_SINE_BAR` for the measurements. This suite pins the basis, not a unification that
 * the measurement did not support.
 */

/** A unit vector at `radians` from the x-axis. */
function unit(radians: number): Vector2 {
    return {x: Math.cos(radians), y: Math.sin(radians)};
}

/** The angles either side of a bar that any conversion of that bar has to agree about. */
function anglesAround(bar: number): number[] {
    return [0, bar * 1e-4, bar * 0.5, bar * 0.9, bar * 0.99, bar * 1.01, bar * 1.1, bar * 2, bar * 1e2];
}

describe('the parallel gate is the dot-space test, restated in sine space', () => {
    /*
     * THE DERIVATION, AS AN ASSERTION RATHER THAN AS A COMMENT.
     *
     *   1 - |cos t| < e   <=>   cos^2 t > (1 - e)^2   <=>   sin^2 t < e(2 - e)
     *
     * so `areEqual(|dot(a, b)|, 1)` at the epsilon IS `|sin t| < sqrt(e(2 - e))`. If that identity
     * did not hold, converting `intersection-edges.ts` and `solveParallelClosure` would have been a
     * value change dressed as a refactor, and the corpus digest agreeing would have been luck.
     */
    it('is sqrt(epsilon * (2 - epsilon)), and that is 1.4142e-4 rather than 1e-8', () => {
        expect(PARALLEL_GATE_SINE_BAR).toBeCloseTo(1.4142135e-4, 10);
        expect(PARALLEL_GATE_SINE_BAR / DIRECTION_SINE_BAR).toBeGreaterThan(1e4);
    });

    it.each(anglesAround(PARALLEL_GATE_SINE_BAR).flatMap(angle => [angle, Math.PI - angle]))(
        'agrees with areEqual(|dot|, 1) at %p radians, at every orientation',
        (angle) => {
            for (let base = 0; base < Math.PI; base += Math.PI / 7) {
                const a = unit(base);
                const b = unit(base + angle);
                expect(sineIsBelow(a, b, PARALLEL_GATE_SINE_BAR))
                    .toBe(areEqual(Math.abs(dotProduct(a, b)), 1));
            }
        },
    );

    it('is not vacuous: the two verdicts do differ from the identity bar in that band', () => {
        // Without this, the sweep above could pass on a bar that happened to reject everything.
        const a = unit(0);
        const b = unit(1e-6);
        expect(sineIsBelow(a, b, PARALLEL_GATE_SINE_BAR)).toBe(true);
        expect(sineIsBelow(a, b, DIRECTION_SINE_BAR)).toBe(false);
    });
});

describe('the sine form is scale-free where the normalised box is not', () => {
    /*
     * THE REASON THE FORM CHANGED AND NOT ONLY THE NAME. `tryAttachEdgeToNode` asked
     * "does this node lie on this bisector's ray?" as `vectorsAreEqual(normalize(separation), basis)`
     * — a division by the separation's own length, performed on exactly the shortest separations the
     * loop existed to find. The division-free form asks the same question of the raw vector, so the
     * verdict cannot depend on how far away the candidate happens to be.
     */
    it('gives one verdict for a separation and every scaled copy of it', () => {
        const basis = normalize({x: 3, y: 4})[0];
        const offRay = normalize({x: 3, y: 4.0000004})[0];

        for (const scale of [1e-12, 1e-6, 1e-3, 1, 1e3, 1e6]) {
            expect(directionsAreSame(scaleVector(basis, scale), basis)).toBe(true);
            expect(directionsAreSame(scaleVector(offRay, scale), basis)).toBe(false);
        }
    });

    it('is isotropic, where the component-wise box was up to sqrt(2) looser on the diagonal', () => {
        // The box passes a diagonal separation the axis-aligned one of the same ANGLE fails, which
        // is one value getting two verdicts from one predicate — decision 105's charge in miniature.
        const angle = FLOATING_POINT_EPSILON * 1.2;

        const axisPair = [unit(0), unit(angle)] as const;
        const diagonalPair = [unit(Math.PI / 4), unit(Math.PI / 4 + angle)] as const;

        expect(vectorsAreEqual(axisPair[0], axisPair[1])).toBe(false);
        expect(vectorsAreEqual(diagonalPair[0], diagonalPair[1])).toBe(true);

        expect(sineIsBelow(...axisPair)).toBe(sineIsBelow(...diagonalPair));
        expect(sineIsBelow(...axisPair)).toBe(false);
    });

    it('separates parallelism from orientation, and takes the sign exactly', () => {
        const a = unit(0);
        const antiParallel = negateVector(a);

        // Anti-parallel is parallel and is not the same direction. No tolerance decides the second
        // half: a half-turn is not a near miss at any bar.
        expect(sineIsBelow(a, antiParallel)).toBe(true);
        expect(directionsAreSame(a, antiParallel)).toBe(false);
        expect(directionsAreSame(a, antiParallel, PARALLEL_GATE_SINE_BAR)).toBe(false);
    });

    it('refuses a zero-length operand rather than calling it parallel to everything', () => {
        expect(sineIsBelow({x: 0, y: 0}, unit(0))).toBe(false);
        expect(directionsAreSame({x: 0, y: 0}, unit(0))).toBe(false);
    });

    it('is the polynomial, not a division: |cross| against bar * |a| * |b|', () => {
        const a = {x: 2, y: 0};
        const b = {x: 1e-9, y: 1};
        const bar = 1e-3;
        expect(sineIsBelow(a, b, bar))
            .toBe(Math.abs(crossProduct(a, b)) < bar * 2 * Math.hypot(1e-9, 1));
    });
});

describe("intersectRays' two collinearity exits answer one separation identically", () => {
    /*
     * THE MIRROR-BRANCH ASYMMETRY, WHICH THE AUDIT DID NOT NAME. 'co-linear-from-1' tested at a bare
     * `1e-4` and 'co-linear-from-2' at the default `1e-8`, on normalised separations. The two are
     * the same question asked of the same pair from opposite ends, so a pair could be collinear
     * approaching from one side and not from the other, decided by nothing but which ray the caller
     * passed first. Both now stand at the gate's own bar, which is the only bar that leaves no band
     * where a pair is parallel enough to enter the branch and not collinear enough to leave it.
     */
    const collinearVerdicts = (angle: number): string[] => {
        const along = unit(angle);
        const verdicts: string[] = [];
        for (const [first, second] of [[{x: 0, y: 0}, {x: 10, y: 0}], [{x: 10, y: 0}, {x: 0, y: 0}]]) {
            const [, , type] = intersectRays(makeRay(first, along), makeRay(second, along), SKELETON_NOISE_FLOOR);
            verdicts.push(type);
        }
        return verdicts;
    };

    it.each([0, 1e-9, 1e-7, 1e-6, 1e-5, PARALLEL_GATE_SINE_BAR * 0.5])(
        'reaches a collinear verdict from both ends at a ray tilt of %p',
        (tilt) => {
            const verdicts = collinearVerdicts(tilt);
            expect(verdicts.every(type => type.startsWith('co-linear'))).toBe(true);
        },
    );

    it('is not vacuous: past the gate the pair is no longer collinear from either end', () => {
        const verdicts = collinearVerdicts(1e-2);
        expect(verdicts.some(type => type.startsWith('co-linear'))).toBe(false);
    });
});
