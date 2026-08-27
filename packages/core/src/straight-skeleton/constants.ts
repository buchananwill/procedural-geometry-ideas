import {IntersectionType} from "./types";

export const FLOATING_POINT_EPSILON = 0.00000001;

/**
 * Area below which a region counts as degenerate — the one floor, for every "is this sub-polygon
 * worth solving" question in the package.
 *
 * A floor rather than an exact zero, because the regions asking are *computed*: a sub-polygon of a
 * self-intersection decomposition and a segment boundary from `computeStrips` both arrive as
 * intersections of rays, so a sliver that is geometrically collinear carries an area of `1e-13` and
 * never an exact `0`. Testing `=== 0` would catch only hand-authored collinear input.
 *
 * An absolute area in the polygon's own units, on the same footing as {@link FLOATING_POINT_EPSILON}.
 * It lived twice — `AREA_EPSILON` in `polygon-decomposition.ts` and `DEGENERATE_AREA_EPSILON` in
 * `recursive-subdivision.ts` — with the second's comment asserting the two must agree; they are one
 * declaration here so that agreement cannot lapse.
 */
export const DEGENERATE_AREA_EPSILON = 0.000001;

export const NO_COLLISION_RESULTS: IntersectionType[] = ['diverging', 'parallel', 'identical-source']

export const TRIANGLE_INTERSECT_PAIRINGS = [[0,1],[1,2],[2,0],[1,0],[2,1],[0,2]]