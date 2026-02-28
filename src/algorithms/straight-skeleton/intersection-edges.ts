import {IntersectionResult, RayProjection} from "@/algorithms/straight-skeleton/types";
import {
    areEqual, crossProduct,
    dotProduct,
    negateVector,
    normalize, rotateCw90, rotateWs90,
    subtractVectors, vectorsAreEqual
} from "@/algorithms/straight-skeleton/core-functions";

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
            if (vectorsAreEqual(r1SourceToR2Source, ray1.basisVector)) {
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
