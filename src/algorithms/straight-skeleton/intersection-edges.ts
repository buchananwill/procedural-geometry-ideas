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
export function unitsToIntersection(ray1: RayProjection, ray2: RayProjection): IntersectionResult {
    // We need to form a pair of linear simultaneous equations, relating x1 === x2 && y1 === y2

    const relativeRay2Source = subtractVectors(ray2.sourceVector, ray1.sourceVector);
    const [basisTowardsRay2Source, distanceToRay2] = normalize(relativeRay2Source);

    // Important for two colliding reflex vertices
    if (areEqual(distanceToRay2, 0)) {
        return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'identical-source']
    }

    const dotOfBasisVectors = dotProduct(ray1.basisVector, ray2.basisVector);

    // --------- Parallel ---------

    // Same direction
    if (areEqual(dotOfBasisVectors, 1)) {
        if (vectorsAreEqual(basisTowardsRay2Source, ray1.basisVector)) {
            return [distanceToRay2, Number.POSITIVE_INFINITY, 'co-linear-from-1']
        }

        if (vectorsAreEqual(scaleVector(basisTowardsRay2Source, -1), ray2.basisVector)) {
            return [Number.POSITIVE_INFINITY, distanceToRay2, "co-linear-from-2"]
        }

        return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'parallel']
    }

    // Opposite Direction
    if (areEqual(dotOfBasisVectors, -1)) {
        if (vectorsAreEqual(basisTowardsRay2Source, ray1.basisVector)) {
            return [distanceToRay2, distanceToRay2, "head-on"]
        }

        return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 'parallel']
    }

    // ---- Not Parallel ------------

    const xRel = relativeRay2Source.x;
    const yRel = relativeRay2Source.y;


    const x1 = ray1.basisVector.x;
    const x2 = ray2.basisVector.x;
    const y1 = ray1.basisVector.y;
    const y2 = ray2.basisVector.y;


    const crossProductBasisVectors = crossProduct(ray1.basisVector, ray2.basisVector);

    const ray1Units = crossProduct(relativeRay2Source, ray2.basisVector) / crossProductBasisVectors;
    const ray2Units = areEqual(y2, 0) ? (ray1Units * x1 - xRel) / x2 : (ray1Units * y1 - yRel) / y2;

    if (ray1Units > 0 && ray2Units > 0) {
        return [ray1Units, ray2Units, 'converging']
    }

    return [ray1Units, ray2Units, 'diverging'];

}
