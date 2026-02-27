import {IntersectionResult, RayProjection} from "@/algorithms/straight-skeleton/types";
import {
    areEqual,
    crossProduct,
    dotProduct,
    normalize, scaleVector,
    subtractVectors, vectorsAreEqual
} from "@/algorithms/straight-skeleton/core-functions";

/**
 * Returns a tuple holding the unit distance along each ray until it intersects the other.
 * If the two rays are parallel, return value is [+inf, +inf, type] unless both sources lie on same line.
 * Type gives category of result.
 * */
export function intersectRays(ray1: RayProjection, ray2: RayProjection): IntersectionResult {
    const relativeRay2Source = subtractVectors(ray2.sourceVector, ray1.sourceVector);
    const [basisTowardsRay2Source, distanceToRay2] = normalize(relativeRay2Source);

    if (areEqual(distanceToRay2, 0)) {
        return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'identical-source'];
    }

    const dotOfBasisVectors = dotProduct(ray1.basisVector, ray2.basisVector);
    const crossProductBasisVectors = crossProduct(ray1.basisVector, ray2.basisVector);

    // Near-parallel guard — intersection would be at meaningless distance
    if (Math.abs(crossProductBasisVectors) < 1e-6) {
        if (dotOfBasisVectors > 0) {
            if (vectorsAreEqual(basisTowardsRay2Source, ray1.basisVector)) {
                return [distanceToRay2, Number.POSITIVE_INFINITY, 'co-linear-from-1'];
            }
            if (vectorsAreEqual(basisTowardsRay2Source, scaleVector(ray2.basisVector, -1))) {
                return [Number.POSITIVE_INFINITY, distanceToRay2, 'co-linear-from-2'];
            }
            return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'parallel'];
        } else {
            if (vectorsAreEqual(basisTowardsRay2Source, ray1.basisVector)) {
                return [distanceToRay2, distanceToRay2, 'head-on'];
            }
            return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'parallel'];
        }
    }

    // General case — Cramer's rule for both unknowns
    const ray1Units = crossProduct(relativeRay2Source, ray2.basisVector) / crossProductBasisVectors;
    const ray2Units = crossProduct(relativeRay2Source, ray1.basisVector) / crossProductBasisVectors;

    if (ray1Units > 0 && ray2Units > 0) {
        return [ray1Units, ray2Units, 'converging'];
    }

    return [ray1Units, ray2Units, 'diverging'];
}
