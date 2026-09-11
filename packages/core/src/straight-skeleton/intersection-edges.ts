import {IntersectionResult, RayProjection, Vector2} from "./types";
import {
    areEqual, crossProduct, directionsAreSame,
    dotProduct,
    negateVector,
    normalize, rotateCw90, rotateWs90, sineIsBelow, sizeOfVector,
    subtractVectors
} from "./core-functions";
import {PARALLEL_GATE_SINE_BAR} from "./constants";

/**
 * The lateral distance from `separation` to the line through `basisVector` — `|sep| · sin θ`, said
 * without a division by `|sep|` and without normalising the basis.
 *
 * A DISTANCE, NOT A SINE. This is the operand of the coaxiality question (spec A9), so it is
 * measured in the same currency as the client's floor. The basis length is divided out because
 * callers hand this function unnormalised bases (the debug helpers use segment-length ones) and the
 * answer must not depend on how long the caller's direction vector happens to be.
 */
export function lateralOffset(separation: Vector2, basisVector: Vector2): number {
    const basisLength = sizeOfVector(basisVector);
    if (basisLength === 0) {
        return Number.POSITIVE_INFINITY;
    }
    return Math.abs(crossProduct(separation, basisVector)) / basisLength;
}

/**
 * The SYMMETRIC lateral offset of a pair of sources: the larger of the two laterals, each source
 * measured against the other ray's line (spec A10, journal decision 136).
 *
 * THE MAXIMUM IS THE CONJUNCTION. "Coaxial" is "both sources within the lane of the other's line",
 * and `max(l₁, l₂) ≤ δ` is exactly `l₁ ≤ δ AND l₂ ≤ δ` — the same predicate, expressed as one
 * number so that the completion of A19 can ORDER candidate pairs by it as well as test them.
 */
export function symmetricLateralOffset(separation: Vector2, basis1: Vector2, basis2: Vector2): number {
    return Math.max(lateralOffset(separation, basis1), lateralOffset(separation, basis2));
}

/**
 * For two anti-parallel rays: does ray 2's source lie *ahead* of ray 1, on ray 1's own line?
 *
 * This is the whole of the head-on/parallel distinction. Anti-parallel says only that the two
 * rays run along opposite directions; whether they close on each other or retreat depends
 * entirely on which side of ray 1's source the other source sits.
 *
 * THE LATERAL TEST IS A LANE AT THE CLIENT'S FLOOR, AND IT IS SYMMETRIC (spec A9/A10, journal
 * decisions 135 and 136). Two questions were confused here for as long as the function has existed.
 * "Do these two sources lie on one line?" is POSITIONAL — it is answered in distance, against the
 * bar the client measures visible distance with — and it was answered instead at
 * `FLOATING_POINT_EPSILON`, the arithmetic-equality bar, hybridised with a `Math.max(1, separation)`
 * that made it relative above unit separation and absolute below. That is the live defect journal
 * finding F57 traced: `r0.2.1` of `Off-edge Jitter Reflex L (seed 55433)` at merge 6 / depth 0.5 /
 * floor 1e-6 carries a corridor whose two mid-line sources are laterally offset by `2.754e-8` — 36×
 * INSIDE the client's floor, and 2.75× outside the epsilon — so the pair was refused a head-on
 * verdict, no collision was priced, no closure applied, and the sub-polygon threw.
 *
 * The retired hybrid's own argument survives its retirement, and is why the bar is a DISTANCE rather
 * than a sine. A relative bar on a separation tending to zero is a bar tending to zero, while
 * head-on-ness is a property of the two DIRECTIONS, which do not shrink with it: a genuinely head-on
 * pair whose sources were 3.9e-8 apart came out with a lateral component of 6.2e-9 (numerically
 * zero) yet a unit direction 0.15 away from its basis, and was misread as 'parallel'. The absolute
 * lane keeps that case and loses the `max(1, …)` discontinuity at unit separation.
 *
 * SYMMETRIC BY DEFINITION, NOT AS A REFINEMENT. `intersectRays` orders its two rays by the winding
 * SIGN of a near-zero cross product, so a one-sided lateral is a verdict that can flip on the bases'
 * last bits. The two laterals differ by up to `|sep| · sine(b₁, b₂)`, and the pair's sine is bounded
 * only by the parallel gate (`1.4142e-4` today), so at separations above about `0.04` the two
 * readings straddle a `1e-6` lane and the pair is head-on or parallel according to which ray the
 * caller passed first. The conjunction removes the question: BOTH sources must lie in the lane.
 *
 * THE FORWARD TEST STAYS ONE-SIDED, and that is a measurement rather than an oversight. Reaching
 * here means the pair is anti-parallel to within the gate, so `dot(−sep, b₂)` and `dot(sep, b₁)`
 * agree in sign except where both are within `|sep| · 1.4142e-4` of zero — and a separation that
 * nearly perpendicular carries a lateral of nearly `|sep|`, which the lane above has already
 * refused unless `|sep| ≤ δ`, in which case `intersectRays`' identical-source exit fired first.
 */
function sourceLiesAhead(
    separation: Vector2,
    basis1: Vector2,
    basis2: Vector2,
    coaxialityFloor: number,
): boolean {
    const forward = dotProduct(separation, basis1);
    return forward > 0 && symmetricLateralOffset(separation, basis1, basis2) <= coaxialityFloor;
}

/**
 * Returns a tuple holding the unit distance along each ray until it intersects the other.
 * If the two rays are parallel, return value is [+inf, +inf, type] unless both sources lie on same line.
 * Type gives category of result.
 *
 * `coaxialityFloor` IS A REQUIRED PARAMETER, NOT A MODULE DEFAULT (spec A15's principle). The
 * coaxiality lane is the client's perceptual floor, which is per-solve and travels on the solver
 * context; a default here would freeze it at the library value and reintroduce, one hop away, the
 * very "one number read in two spaces" this bar exists to end. Every production caller threads
 * `context.coaxialityFloor`; a caller with no context states the floor it means.
 * */
export function intersectRays(
    ray1Param: RayProjection,
    ray2Param: RayProjection,
    coaxialityFloor: number,
): IntersectionResult {
    const checkWinding = crossProduct(ray1Param.basisVector, ray2Param.basisVector)
    const ray1 = checkWinding >= 0 ? ray1Param : ray2Param;
    const ray2 = checkWinding >= 0 ? ray2Param : ray1Param;

    const relativeRay2Source = subtractVectors(ray2.sourceVector, ray1.sourceVector);
    const [r1SourceToR2Source, distanceToRay2] = normalize(relativeRay2Source);

    /*
     * THE IDENTICAL-SOURCE EXIT STAYS AT THE ARITHMETIC BAR, AND THAT IS A MEASURED NEGATIVE RESULT
     * RATHER THAN AN OMISSION — spec A15's identical-source row, measured 2026-09-11 and REFERRED
     * BACK TO THE LEAD.
     *
     * The spec's argument for moving it is sound on its face: "are these two sources one point?" is
     * the degenerate case of "are these two sources on one line?", so asking the first at `1e-8`
     * while the second is answered at the floor leaves a band in which a pair is one line and not
     * one point, decided by nothing. The row was therefore written as `distanceToRay2 <=
     * coaxialityFloor` and run over the whole corpus at the library floor.
     *
     * WHAT IT DOES IS NOT A CURE. Twenty pinned assertions across four suites move, and every one of
     * them moves the same way: a solve that FAILED LOUDLY starts reporting `complete: true` with an
     * empty diagnostics list, while still carrying the violations that made it a defect. Audited with
     * `wavefront-causality.test.ts`'s own three oracles, re-derived from geometry:
     *
     *   - `NEAR_REGULAR_CIRCLE_32` jittered 15 epsilons at seed 2 — the cell
     *     `near-regular-polygons.test.ts` pins expressly as "a signalled failure rather than a
     *     backwards-bisector pass" — comes back complete with 2 offset violations, 2 DIRECTION
     *     violations (one at `dot = -0.98`, a bisector wired essentially straight backwards) and 2
     *     clearance violations;
     *   - `NEAR_REGULAR_CIRCLE_48` at translation 1e10: complete, with 2 offset, 4 direction and 5
     *     clearance violations;
     *   - `NEAR_REGULAR_ROSETTE5_40` at translation 1e11: complete, with 1 offset and 13 clearance
     *     violations.
     *
     * A defect that stops announcing itself is a defect that got WORSE (journal decision 72's
     * doctrine, decision 134(c), spec A25's STOP 4), and rewriting the corpus's failure register is
     * the lead's call and not a delegate's — the precedent is journal decision 126, which left
     * W-spec W33 unimplemented on exactly this reasoning. The mechanism is plain enough to state:
     * these fixtures fail because a k-way convergence half-merges into hubs a few times `1e-8`
     * apart, and a `1e-6` identical-source exit swallows the whole half-merge, terminating pairs
     * that should have collided and reporting the wreck as finished.
     *
     * The coaxiality lane itself (`sourceLiesAhead`) is untouched by this and stands; it is a
     * different site with a different measurement. Left here, reported rather than papered over.
     */
    if (areEqual(distanceToRay2, 0)) {
        return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'identical-source'];
    }

    const dotOfBasisVectors = dotProduct(ray1.basisVector, ray2.basisVector);


    // Near-parallel guard — intersection would be at meaningless distance.
    //
    // WAS `areEqual(Math.abs(dotOfBasisVectors), 1)`, which is this same bar said in dot space:
    // `1 − |cos θ| < ε` is exactly `|sin θ| < sqrt(ε(2 − ε))`, so the constant carries the identical
    // verdict and the derivation is now written down instead of being a four-order surprise waiting
    // for whoever compared this line against a component-wise `vectorsAreEqual` elsewhere.
    if (sineIsBelow(ray1.basisVector, ray2.basisVector, PARALLEL_GATE_SINE_BAR)) {
        if (dotOfBasisVectors > 0) {
            // BOTH COLLINEARITY TESTS AT THE GATE'S OWN BAR, on the RAW separation.
            //
            // These two branches are mirror images — "ray 2's source lies along ray 1" and "ray 1's
            // source lies back along ray 2" — and they were asked at bars four orders apart: a bare
            // `1e-4` here and the default `1e-8` below, on normalised vectors, neither commented.
            // That is journal decision 105's charge in its purest form: one separation could be
            // collinear or not collinear according to which of the two symmetric paths reached it.
            // They now share the bar of the gate that admitted them, which is the only choice that
            // leaves no band where a pair is parallel enough to enter this branch and not collinear
            // enough to leave it by either exit.
            if (directionsAreSame(relativeRay2Source, ray1.basisVector, PARALLEL_GATE_SINE_BAR)) {
                return [distanceToRay2, 0, 'co-linear-from-1'];
            }
            if (directionsAreSame(relativeRay2Source, negateVector(ray2.basisVector),
                PARALLEL_GATE_SINE_BAR)) {
                return [0, distanceToRay2, 'co-linear-from-2'];
            }
            return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'parallel'];
        } else {
            if (sourceLiesAhead(relativeRay2Source, ray1.basisVector, ray2.basisVector, coaxialityFloor)) {
                return [distanceToRay2, distanceToRay2, 'head-on'];
            }
            return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'parallel'];
        }
    }

    // Rotate ray2 90 degrees to find ray1 distance:
    const r2SourceToR1Source = negateVector(r1SourceToR2Source);

    const ray2Rotated = rotateCw90(ray2.basisVector)
    let ray1Units = distanceToRay2 * dotProduct(r1SourceToR2Source, ray2Rotated) / dotProduct(ray2Rotated, ray1.basisVector);

    const ray1Rotated = rotateWs90(ray1.basisVector)
    let ray2Units = distanceToRay2 * dotProduct(r2SourceToR1Source, ray1Rotated) / dotProduct(ray1Rotated, ray2.basisVector);

    if (checkWinding < 0) {
        const temp = ray1Units;
        ray1Units = ray2Units;
        ray2Units = temp;
    }

    if (ray1Units > 0 && ray2Units > 0) {
        return [ray1Units, ray2Units, 'converging'];
    }

    return [ray1Units, ray2Units, 'diverging'];
}
