import {IntersectionType} from "@/algorithms/straight-skeleton/types";

export const FLOATING_POINT_EPSILON = 0.00000001;

export const NO_COLLISION_RESULTS: IntersectionType[] = ['diverging', 'parallel', 'identical-source']

export const TRIANGLE_INTERSECT_PAIRINGS = [[0,1],[1,2],[2,0],[1,0],[2,1],[0,2]]