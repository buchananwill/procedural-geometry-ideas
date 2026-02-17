import {RayProjection} from "@/algorithms/straight-skeleton/types";
import {subtractVectors} from "@/algorithms/straight-skeleton/core-functions";

export type IntersectionUnits = [number, number];

export function unitsToIntersection(ray1: RayProjection, ray2: RayProjection): IntersectionUnits {
    // We need to form a pair of linear simultaneous equations, relating x1 === x2 && y1 === y2

    const relativeRay2Source = subtractVectors(ray2.sourceVector, ray1.sourceVector);
    const xRel = relativeRay2Source.x;
    const yRel = relativeRay2Source.y;
    const x1 = ray1.basisVector.x;
    const x2 = ray2.basisVector.x;
    const y1 = ray1.basisVector.y;
    const y2 = ray2.basisVector.y;

    const ray1Units = (xRel + yRel * x2) / (x1 * y2 - x2 * y1);
    const ray2Units = (ray1Units * y1 - yRel) / y2;

    return [ray1Units, ray2Units];
}

// Function to make heap interior edges