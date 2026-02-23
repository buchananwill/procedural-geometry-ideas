import {IntersectionResult, StraightSkeletonSolverContext} from "@/algorithms/straight-skeleton/types";

export function collisionOffsetDistance(collision: IntersectionResult, context: StraightSkeletonSolverContext): number{
    const [dist1, dist2, eventType ] = collision;

    if (eventType === 'converging'){


    }

    return Number.POSITIVE_INFINITY;
}