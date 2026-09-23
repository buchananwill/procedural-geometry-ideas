import {
    FULL_CORPUS,
    OFF_EDGE_JITTER_L_SEED_55433,
    OFF_EDGE_JITTER_L_SEED_55433_R021,
} from '@proc-geo/test-fixtures';
import {
    addVectors,
    angularResolution,
    coaxialityFloor,
    denormaliseLength,
    flattenRecursiveTree,
    intersectRays,
    lateralOffset,
    makeRay,
    makeSkeletonNormalisation,
    MAX_RECURSION_LEVELS,
    negateVector,
    normalize,
    normaliseLength,
    rotateWs90,
    scaleVector,
    SKELETON_NOISE_FLOOR,
    solveSkeleton,
    subdivideRecursively,
    symmetricLateralOffset,
    uniformLevelSpecs,
    Vector2,
} from '@proc-geo/core';
import type {IntersectionType, RayProjection} from '@proc-geo/core';

/**
 * ============================================================================
 *  THE COAXIALITY LANE — spec A9/A10, journal decisions 135, 136 and 137.
 * ============================================================================
 *
 * "Are these two sources on ONE LINE?" is a THIRD question, and the solver used to answer it in the
 * wrong category. Identity of direction and priceability of an intersection are ANGLES; coaxiality
 * is a DISTANCE, and `sourceLiesAhead` answered it at `FLOATING_POINT_EPSILON` — the
 * arithmetic-equality bar — hybridised with a `Math.max(1, separation)` that made it relative above
 * unit separation and absolute below.
 *
 * WHAT THAT COST, MEASURED (journal finding F57). `r0.2.1` of `Off-edge Jitter Reflex L (seed
 * 55433)` at merge group 6 / depth fraction 0.5 carries a corridor whose two mid-line bisector
 * sources were placed 2.754e-8 apart laterally by a near-simultaneous upstream event. That is 36×
 * INSIDE the client's floor and 2.75× outside the epsilon, so the pair was refused a head-on
 * verdict, `intersectRays` returned 'parallel', no collision was priced, neither closure applied,
 * and the two-edge base case threw. The failing band was `(1e-8, 1e-6]` — a hundredfold, and
 * entirely sub-perceptual.
 *
 * THIS FILE PINS FOUR THINGS, and each one dies to a different mutation:
 *
 *   1. THE RING. `r0.2.1` solves complete, and it does so through the NORMAL lane — with no
 *      `coaxial-completion` diagnostic. Revert the lane to `FLOATING_POINT_EPSILON` and this dies.
 *   2. THE LANE ITSELF, swept at the predicate level over the lateral offset, so the cure is
 *      convicted by a table that flips rather than by a suite that goes red to green. Every δ up to
 *      and including the floor is head-on; every δ past it is not.
 *   3. THE SYMMETRY. The lane is a conjunction over BOTH bases (journal decision 136's scenario D),
 *      so a pair whose two laterals STRADDLE the floor is refused. Make the lane one-sided and the
 *      straddling pair is admitted, because one of its two laterals is exactly zero.
 *   4. THE COMPLETION COUNTER. A19's completion-on-refusal fires NOWHERE on `FULL_CORPUS`, at the
 *      library floor and at the demo floor. A firing is a second specimen to be reported, not a
 *      tolerance to be widened.
 */

/** The dials journal finding F57 traced `r0.2.1` at. */
const R021_DIALS = {mergeGroupSize: 6, depthFraction: 0.5} as const;

/** The floor ladder rungs this file measures the completion counter at (spec A19's bar). */
const SWEPT_FLOORS = [SKELETON_NOISE_FLOOR, 1e-5];

describe('r0.2.1 solves, and it solves through the normal lane', () => {
    it('solves complete as a ring of its own, with no completion diagnostic', () => {
        const result = solveSkeleton(OFF_EDGE_JITTER_L_SEED_55433_R021);

        expect(result.complete).toBe(true);
        expect(result.diagnostics.filter(d => d.kind === 'coaxial-completion')).toEqual([]);
        expect(result.diagnostics.filter(d => d.kind === 'step-failure')).toEqual([]);
        expect(result.diagnostics.filter(d => d.kind === 'unresolved-edges')).toEqual([]);
    });

    it('solves complete against the ROOT floor the driver hands it, which is the solve that failed', () => {
        // The driver canonicalises a region against the ROOT'S floor said in that region's own unit
        // space, not against the region's own — see `recursive-subdivision.test.ts`. The failing
        // solve was that one, so it is that one this pins.
        const rootFloor = denormaliseLength(
            makeSkeletonNormalisation(OFF_EDGE_JITTER_L_SEED_55433), SKELETON_NOISE_FLOOR);
        const regionFloor = normaliseLength(
            makeSkeletonNormalisation(OFF_EDGE_JITTER_L_SEED_55433_R021), rootFloor);

        const result = solveSkeleton(OFF_EDGE_JITTER_L_SEED_55433_R021, {noiseFloor: regionFloor});

        expect(result.complete).toBe(true);
        expect(result.diagnostics.filter(d => d.kind === 'coaxial-completion')).toEqual([]);
    });

    it('leaves the whole tree at those dials without a failed region', () => {
        // THE RING IS NOT ENOUGH ON ITS OWN. `r0.2.1` is the region the DRIVER cut, and a fixture
        // quoting its boundary could drift from the driver's own answer silently. This asserts the
        // cure where it was measured: the tree that used to carry exactly one failed node carries
        // none.
        const root = subdivideRecursively(OFF_EDGE_JITTER_L_SEED_55433, {
            levels: uniformLevelSpecs({
                levels: MAX_RECURSION_LEVELS,
                residue: 'recurse',
                ...R021_DIALS,
            }),
        });

        const failed = flattenRecursiveTree(root).filter(node => node.failure !== undefined);
        expect(failed.map(node => `${node.id}: ${node.failure}`)).toEqual([]);
    });
});

/*
 * ----------------------------------------------------------------------------
 *  THE PREDICATE-LEVEL SWEEP
 * ----------------------------------------------------------------------------
 *
 * Built on `r0.2.1`'s own corridor DIRECTION rather than on its returned graph: the unit-space
 * numbers are what the predicate sees, and the denormalised graph would give a different margin
 * (journal I5). The corridor direction's y-component is 6.65e-6 — the number finding F56 misread as
 * a sine — and the two mid-lines are anti-parallel to one ulp, which is reproduced here exactly by
 * negating one basis.
 */

const CORRIDOR = normalize({x: 1, y: 6.65e-6})[0];
const ACROSS_CORRIDOR = rotateWs90(CORRIDOR);

/** In unit space, and comfortably clear of the identical-source exit at every floor swept here. */
const MID_LINE_SEPARATION = 0.5;

/** The two mid-line rays, displaced laterally by `delta`. */
function midLinePair(delta: number): [RayProjection, RayProjection] {
    const first = {x: 0, y: 0};
    const second = addVectors(
        addVectors(first, scaleVector(CORRIDOR, MID_LINE_SEPARATION)),
        scaleVector(ACROSS_CORRIDOR, delta));
    return [makeRay(first, CORRIDOR), makeRay(second, negateVector(CORRIDOR))];
}

/** `r0.2.1`'s own displacement, from finding F57. */
const R021_LATERAL = 2.754e-8;

const INSIDE_THE_LANE = [0, 1e-12, 1e-9, 1e-8, 2e-8, R021_LATERAL, 1e-7, 5e-7, 1e-6];
const OUTSIDE_THE_LANE = [2e-6, 1e-5, 1e-4];

describe('the lane is the floor, swept over the lateral offset', () => {
    it('is the floor itself, not a derived number', () => {
        expect(coaxialityFloor(SKELETON_NOISE_FLOOR)).toBe(SKELETON_NOISE_FLOOR);
        expect(coaxialityFloor(1e-5)).toBe(1e-5);
    });

    it.each(INSIDE_THE_LANE)('prices a lateral offset of %p as head-on', (delta) => {
        const [first, second] = midLinePair(delta);
        expect(intersectRays(first, second, SKELETON_NOISE_FLOOR, angularResolution(SKELETON_NOISE_FLOOR))[2]).toBe<IntersectionType>('head-on');
    });

    it.each(OUTSIDE_THE_LANE)('refuses a lateral offset of %p', (delta) => {
        const [first, second] = midLinePair(delta);
        expect(intersectRays(first, second, SKELETON_NOISE_FLOOR, angularResolution(SKELETON_NOISE_FLOOR))[2]).not.toBe<IntersectionType>('head-on');
    });

    it('pins the band that used to orphan the pair: (1e-8, 1e-6] is now head-on', () => {
        // The failing band F57 measured, stated as the assertion that closes it. `r0.2.1`'s own
        // 2.754e-8 sits 2.75× outside the old epsilon bar and 36× inside the new one.
        expect(R021_LATERAL).toBeGreaterThan(1e-8);
        expect(R021_LATERAL).toBeLessThan(SKELETON_NOISE_FLOOR);
        expect(SKELETON_NOISE_FLOOR / R021_LATERAL).toBeCloseTo(36.31, 1);
    });

    it('moves the lane with the client floor rather than freezing it', () => {
        // The bar is a PARAMETER, not a module constant: the same pair is head-on at a floor that
        // admits it and parallel at one that does not.
        const [first, second] = midLinePair(5e-6);
        expect(intersectRays(first, second, 1e-5, angularResolution(1e-5))[2]).toBe<IntersectionType>('head-on');
        expect(intersectRays(first, second, SKELETON_NOISE_FLOOR, angularResolution(SKELETON_NOISE_FLOOR))[2]).toBe<IntersectionType>('parallel');
    });
});

describe('the lane is symmetric: both sources in the other ray\'s lane, or neither', () => {
    it.each([...INSIDE_THE_LANE, ...OUTSIDE_THE_LANE])(
        'gives one verdict for a lateral offset of %p whichever ray is passed first',
        (delta) => {
            const [first, second] = midLinePair(delta);
            expect(intersectRays(second, first, SKELETON_NOISE_FLOOR, angularResolution(SKELETON_NOISE_FLOOR))[2])
                .toBe(intersectRays(first, second, SKELETON_NOISE_FLOOR, angularResolution(SKELETON_NOISE_FLOOR))[2]);
        },
    );

    /*
     * THE CASE THAT CONVICTS THE CONJUNCTION — journal decision 136's scenario D, in numbers.
     *
     * Two anti-parallel bases at a sine of 1e-5, inside the library floor's angular resolution
 * (`1.772e-5`; the retired gate was `1.4142e-4`), with their sources
     * one unit apart. The separation lies exactly along the FIRST basis, so its lateral against that
     * basis is zero; against the second it is `|sep| · sine` = 1e-5, ten times the floor. The two
     * readings of one pair therefore straddle the lane.
     *
     * A one-sided test answers whichever of those two `intersectRays`' winding sort happens to hand
     * it, and that sort is decided by the SIGN of a cross product of order 1e-5 — so the same pair,
     * recomputed with the bases a few ulps apart, could come back head-on or parallel. The
     * conjunction refuses it either way, which is the verdict pinned below.
     */
    const straddlingPair = (): [RayProjection, RayProjection, Vector2] => {
        const first = {x: 1, y: 0};
        const second = negateVector({x: Math.cos(-1e-5), y: Math.sin(-1e-5)});
        const separation = {x: 1, y: 0};
        return [makeRay({x: 0, y: 0}, first), makeRay(separation, second), separation];
    };

    it('has one lateral inside the lane and the other outside it', () => {
        const [first, second, separation] = straddlingPair();
        expect(lateralOffset(separation, first.basisVector)).toBe(0);
        expect(lateralOffset(separation, second.basisVector)).toBeCloseTo(1e-5, 12);
        expect(symmetricLateralOffset(separation, first.basisVector, second.basisVector))
            .toBe(lateralOffset(separation, second.basisVector));
    });

    it('REFUSES that pair, in both orders — the conjunction, not the one it was handed', () => {
        const [first, second] = straddlingPair();
        expect(intersectRays(first, second, SKELETON_NOISE_FLOOR, angularResolution(SKELETON_NOISE_FLOOR))[2]).toBe<IntersectionType>('parallel');
        expect(intersectRays(second, first, SKELETON_NOISE_FLOOR, angularResolution(SKELETON_NOISE_FLOOR))[2]).toBe<IntersectionType>('parallel');
    });
});

describe("A19's completion fires nowhere on the corpus", () => {
    /*
     * THE COUNTER, NOT A BEHAVIOUR. The completion exists because "a sub-polygon with live interior
     * edges and no event" is a state the model says cannot occur: a bounded wavefront with live
     * vertices must have a next event. It is entered only after the normal lane has refused, so a
     * corpus that never enters it is the statement that the normal lane decides everything the
     * corpus needs — F44's "narrow only on refusal", measured rather than asserted.
     *
     * IF THIS EVER FIRES, that is a SECOND SPECIMEN and a finding: report the fixture, the two edge
     * ids and the offset the diagnostic names. It is not a number to re-pin.
     */
    it.each(SWEPT_FLOORS)('completes a sub-polygon only on the pinned defect specimen, at a floor of %p', (perceptualFloor) => {
        const firings: string[] = [];
        for (const polygon of FULL_CORPUS) {
            const result = solveSkeleton(polygon.vertices, {perceptualFloor});
            for (const diagnostic of result.diagnostics) {
                if (diagnostic.kind === 'coaxial-completion') {
                    firings.push(`${polygon.name}: ${diagnostic.detail}`);
                }
            }
        }
        // ONE FIRING, AND IT IS A PINNED DEFECT RATHER THAN A SECOND SPECIMEN TO REPORT: `Offset Cross
        // Junction`, enrolled 2026-09-23, decision 151(d), fires the completion at the library floor
        // on its vertical corridor's exactly coaxial pair (symmetric lateral 0), whose offset rates
        // cancel so `meetHeadOn` prices no event; a step failure follows. At the demo floor it does
        // not fire. Every other fixture still fires nothing at either floor.
        expect(firings.map(firing => firing.slice(0, firing.indexOf(':'))))
            .toEqual(perceptualFloor === SKELETON_NOISE_FLOOR ? ['Offset Cross Junction'] : []);
    });

    it('never completes a sub-polygon of r0.2.1 either, at either floor', () => {
        for (const perceptualFloor of SWEPT_FLOORS) {
            const result = solveSkeleton(OFF_EDGE_JITTER_L_SEED_55433_R021, {perceptualFloor});
            expect(result.diagnostics.filter(d => d.kind === 'coaxial-completion')).toEqual([]);
        }
    });
});
