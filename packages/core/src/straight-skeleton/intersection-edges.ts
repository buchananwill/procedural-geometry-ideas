import {IntersectionResult, RayProjection, Vector2} from "./types";
import {
    crossProduct,
    dotProduct,
    negateVector,
    normalize, rotateCw90, rotateWs90, sineIsBelow, sizeOfVector,
    subtractVectors
} from "./core-functions";

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
 * and `max(l₁, l₂) < δ` is exactly `l₁ < δ AND l₂ < δ` — the same predicate, expressed as one
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
 * decisions 135 and 136). "Do these two sources lie on one line?" is POSITIONAL — it is answered in
 * distance, against the bar the client measures visible distance with — and never at an
 * arithmetic-equality bar. An arithmetic bar refuses a corridor whose two mid-line sources lie well
 * inside the floor: journal finding F57 traced `r0.2.1` of `Off-edge Jitter Reflex L (seed 55433)` at
 * merge 6 / depth 0.5 / floor 1e-6, whose two mid-line sources are laterally offset by `2.754e-8` — 36×
 * INSIDE the client's floor, and 2.75× outside 1e-8 — so at 1e-8 the pair is refused a head-on verdict,
 * no collision is priced, no closure applies, and the sub-polygon throws.
 *
 * AN ABSOLUTE DISTANCE, NOT A RELATIVE BAR OR A SINE. A relative bar on a separation tending to zero is
 * a bar tending to zero, while head-on-ness is a property of the two DIRECTIONS, which do not shrink
 * with it: a genuinely head-on pair whose sources are 3.9e-8 apart has a lateral component of 6.2e-9
 * (numerically zero) yet a unit direction 0.15 away from its basis, which a sine reading calls
 * 'parallel'. The absolute lane keeps that case and has no discontinuity at unit separation.
 *
 * SYMMETRIC BY DEFINITION, NOT AS A REFINEMENT. `intersectRays` orders its two rays by the winding
 * SIGN of a near-zero cross product, so a one-sided lateral is a verdict that can flip on the bases'
 * last bits. The two laterals differ by up to `|sep| · sine(b₁, b₂)`, and the pair's sine is bounded
 * only by the angular resolution (`1.7721e-5` at the library floor), so at separations above about
 * `0.06` the two readings straddle a `1e-6` lane and the pair is head-on or parallel according to which
 * ray the caller passed first. The conjunction removes the question: BOTH sources must lie in the lane.
 *
 * THE FORWARD TEST STAYS ONE-SIDED, and that is a measurement rather than an oversight. Reaching
 * here means the pair is anti-parallel to within the angular resolution, so `dot(−sep, b₂)` and
 * `dot(sep, b₁)` agree in sign except where both are within `|sep| · angularResolution` of zero — and a separation that
 * nearly perpendicular carries a lateral of nearly `|sep|`, which the lane above has already
 * refused unless `|sep| < δ`. `intersectRays`' identical-source exit is EXACT (S6), so a pair of
 * distinct sources closer than δ reaches this test and its exact forward sign decides.
 */
function sourceLiesAhead(
    separation: Vector2,
    basis1: Vector2,
    basis2: Vector2,
    coaxialityFloor: number,
): boolean {
    const forward = dotProduct(separation, basis1);
    // STRICTLY within the lane (C8 spec T7): one inequality for "the same point/line, before any node
    // exists" across the package. Strict and non-strict differ on a boundary of measure zero, measured empty.
    return forward > 0 && symmetricLateralOffset(separation, basis1, basis2) < coaxialityFloor;
}

/**
 * Returns a tuple holding the unit distance along each ray until it intersects the other.
 * If the two rays are parallel, return value is [+inf, +inf, type] unless both sources lie on same line.
 * Type gives category of result.
 *
 * `coaxialityFloor` AND `angularResolution` ARE REQUIRED PARAMETERS, NOT MODULE DEFAULTS (spec A15's
 * principle and its signature row). Both are functions of the client's perceptual floor, which is
 * per-solve and travels on the solver context; a default here would freeze either at the library
 * value and reintroduce, one hop away, the very "one number read in two spaces" these bars exist to
 * end. Every production caller threads `context.coaxialityFloor` and `context.angularResolution`; a
 * caller with no context states the bars it means.
 * */
export function intersectRays(
    ray1Param: RayProjection,
    ray2Param: RayProjection,
    coaxialityFloor: number,
    angularResolution: number,
): IntersectionResult {
    const checkWinding = crossProduct(ray1Param.basisVector, ray2Param.basisVector)
    const ray1 = checkWinding >= 0 ? ray1Param : ray2Param;
    const ray2 = checkWinding >= 0 ? ray2Param : ray1Param;

    const relativeRay2Source = subtractVectors(ray2.sourceVector, ray1.sourceVector);
    const [r1SourceToR2Source, distanceToRay2] = normalize(relativeRay2Source);

    // THE IDENTICAL-SOURCE EXIT IS EXACT (census S6; spec T9, T28, T29; journal decision 161(e)): `separation
    // === 0`. Acceptance terminates the pair as ONE POINT — it discards an answer the solver has already
    // produced — so under T2 it takes the arithmetic's bar, and for two STORED node positions that bar's
    // degenerate case is bit identity. Two distinct sources within δ are the coaxiality lane's question
    // (S7, S8), which keeps every node; that is F66's asymmetry, ruled by T28.
    //
    // NOT THE FLOOR. An exit at δ swallows the half-merges of a k-way convergence (hubs a few times 1e-8
    // apart), terminating pairs that should have collided, and turns signalled failures into `complete: true`
    // with empty diagnostics while their violations remain — a defect that stops announcing itself is a
    // defect that got WORSE (journal decision 72's doctrine). `tolerance-derivation.test.ts` asserts the exit
    // and the empty band (0, 1e-8). Measured: tolerance-derivation-decisions.md, "Measurement record", "The
    // identical-source exit (S6)".
    if (distanceToRay2 === 0) {
        return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'identical-source'];
    }

    const dotOfBasisVectors = dotProduct(ray1.basisVector, ray2.basisVector);


    // Near-parallel guard — intersection would be at meaningless distance.
    //
    // AT THE SOLVE'S ANGULAR RESOLUTION (spec A1, A15), on the rays that will actually be intersected
    // (spec A20: the ray-direction group, so under weights the weighted bisector bases). Below it the
    // division by the sine cannot place the meeting point to within the client's floor (spec A3), and
    // under ordering (i) at equality (spec A11) the pair is IDENTICAL in direction: it leaves by the
    // collinear, head-on or parallel exits below and is never priced. At or above it, it is priced.
    // Measured: tolerance-derivation-decisions.md, "Measurement record", "The near-parallel gate at the
    // angular resolution".
    if (sineIsBelow(ray1.basisVector, ray2.basisVector, angularResolution)) {
        if (dotOfBasisVectors > 0) {
            // BOTH COLLINEARITY EXITS IN THE COAXIAL FORM — spec A15's row, journal decisions 147(e)
            // and 150. "Does ray 2's source lie along ray 1?" and "does ray 1's source lie back along
            // ray 2?" are the SAME question as `sourceLiesAhead` asks of an opposed pair — are these two
            // sources on one line — so they take its form: the forward sign exact, and the SYMMETRIC
            // lateral within the coaxiality lane, a distance at the client's floor.
            //
            // NOT A SINE ON THE RAW SEPARATION (`directionsAreSame` at the angular resolution), which is
            // the category error spec A9 names: a sine bar on a separation is a lateral bar that grows
            // with the separation, so two same-way sources half a unit apart would be one line at a
            // lateral of 8.9e-6 — nearly nine times the library floor, a distance the client can see —
            // and at a unit's separation at 1.8e-5.
            //
            // The two exits still share one bar and one lateral, and are mirror images: the lateral is
            // symmetric in the two bases, so neither exit can admit a pair the other refuses on
            // lateral grounds, and the forward signs `dot(sep, b₁)` and `dot(sep, −b₂)` agree except
            // where both are within `|sep| · angularResolution` of zero — a separation that nearly
            // perpendicular carries a lateral of nearly `|sep|`, which the lane refuses unless `|sep| < δ`
            // (the identical-source exit above does not take that case: it is exact).
            const lateral = symmetricLateralOffset(relativeRay2Source, ray1.basisVector, ray2.basisVector);
            // Strictly within the lane (C8 spec T7), as `sourceLiesAhead`.
            if (lateral < coaxialityFloor) {
                if (dotProduct(relativeRay2Source, ray1.basisVector) > 0) {
                    return [distanceToRay2, 0, 'co-linear-from-1'];
                }
                if (dotProduct(relativeRay2Source, negateVector(ray2.basisVector)) > 0) {
                    return [0, distanceToRay2, 'co-linear-from-2'];
                }
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
