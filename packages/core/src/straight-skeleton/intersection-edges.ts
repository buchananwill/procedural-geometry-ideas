import {IntersectionResult, RayProjection, Vector2} from "./types";
import {
    areEqual, crossProduct,
    dotProduct,
    negateVector,
    normalize, rotateCw90, rotateWs90,
    subtractVectors, vectorsAreEqual
} from "./core-functions";
import {FLOATING_POINT_EPSILON} from "./constants";

/**
 * For two anti-parallel rays: does ray 2's source lie *ahead* of ray 1, on ray 1's own line?
 *
 * This is the whole of the head-on/parallel distinction. Anti-parallel says only that the two
 * rays run along opposite directions; whether they close on each other or retreat depends
 * entirely on which side of ray 1's source the other source sits.
 *
 * Measured in absolute units — the along-ray and across-ray components of the raw separation —
 * rather than by comparing the *normalised* separation against the basis vector. Normalising
 * divides the separation by its own length, so at small separations it amplifies float noise
 * without bound: a genuinely head-on pair whose sources were 3.9e-8 apart came out with a
 * lateral component of 6.2e-9 (numerically zero) yet a unit direction 0.15 away from the basis,
 * and was misread as 'parallel'. The floor of 1 in the tolerance keeps the previous, purely
 * relative behaviour everywhere the sources are more than a unit apart, and only relaxes the
 * test in the sub-unit regime where the relative form is meaningless.
 */
function sourceLiesAhead(separation: Vector2, basisVector: Vector2, separationDistance: number): boolean {
    const forward = dotProduct(separation, basisVector);
    const lateral = Math.abs(crossProduct(separation, basisVector));
    return forward > 0 && lateral <= FLOATING_POINT_EPSILON * Math.max(1, separationDistance);
}

/**
 * Returns a tuple holding the unit distance along each ray until it intersects the other.
 * If the two rays are parallel, return value is [+inf, +inf, type] unless both sources lie on same line.
 * Type gives category of result.
 * */
export function intersectRays(ray1Param: RayProjection, ray2Param: RayProjection): IntersectionResult {
    const checkWinding = crossProduct(ray1Param.basisVector, ray2Param.basisVector)
    const ray1 = checkWinding >= 0 ? ray1Param : ray2Param;
    const ray2 = checkWinding >= 0 ? ray2Param : ray1Param;

    const relativeRay2Source = subtractVectors(ray2.sourceVector, ray1.sourceVector);
    const [r1SourceToR2Source, distanceToRay2] = normalize(relativeRay2Source);

    if (areEqual(distanceToRay2, 0)) {
        return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'identical-source'];
    }

    const dotOfBasisVectors = dotProduct(ray1.basisVector, ray2.basisVector);


    // Near-parallel guard — intersection would be at meaningless distance
    if (areEqual(Math.abs(dotOfBasisVectors), 1)) {
        if (dotOfBasisVectors > 0) {
            if (vectorsAreEqual(r1SourceToR2Source, ray1.basisVector, 1e-4)) {
                return [distanceToRay2, 0, 'co-linear-from-1'];
            }
            if (vectorsAreEqual(r1SourceToR2Source, negateVector(ray2.basisVector))) {
                return [0, distanceToRay2, 'co-linear-from-2'];
            }
            return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'parallel'];
        } else {
            if (sourceLiesAhead(relativeRay2Source, ray1.basisVector, distanceToRay2)) {
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
