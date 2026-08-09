import type { Vector2 } from '../straight-skeleton/types';
import type { CubicBezier, FitResult, SeamNeighbours } from './types';

const DEDUPE_EPSILON_SQ = 1e-12;

/** Reject a virtual neighbour that coincides with the endpoint it sits beside (zero knot interval). */
function distinctNeighbour(neighbour: Vector2 | null | undefined, anchor: Vector2): Vector2 | null {
    if (!neighbour) return null;
    const dx = neighbour.x - anchor.x;
    const dy = neighbour.y - anchor.y;
    return dx * dx + dy * dy < DEDUPE_EPSILON_SQ ? null : neighbour;
}

/**
 * Catmull-Rom spline through the input points, emitted as cubic Bezier
 * segments. `alpha` selects the parameterization: 0 = uniform,
 * 0.5 = centripetal (no cusps/self-intersections), 1 = chordal.
 *
 * Interpolating: every input point lies on the curve at a segment boundary,
 * so the parameterization is exact and maxError is 0 by construction.
 * One segment per input gap — no compression; pair with simplification
 * upstream to make it interesting.
 *
 * The chord tangent used at an open end is replaced by the regular
 * Catmull-Rom tangent when `seam` supplies a virtual neighbour beyond that
 * end, which makes a closed chain's seam as continuous as any interior knot.
 */
export function fitCatmullRom(
    inputPoints: Vector2[],
    alpha: number,
    seam?: SeamNeighbours | null,
): FitResult | null {
    // Collapse consecutive duplicates (they produce zero-length knot intervals),
    // remembering each input's representative.
    const points: Vector2[] = [];
    const inputToDeduped: number[] = new Array(inputPoints.length);
    for (let i = 0; i < inputPoints.length; i++) {
        const p = inputPoints[i];
        const prev = points[points.length - 1];
        if (prev !== undefined) {
            const dx = p.x - prev.x;
            const dy = p.y - prev.y;
            if (dx * dx + dy * dy < DEDUPE_EPSILON_SQ) {
                inputToDeduped[i] = points.length - 1;
                continue;
            }
        }
        points.push({ x: p.x, y: p.y });
        inputToDeduped[i] = points.length - 1;
    }

    const n = points.length;
    if (n < 2) return null;

    const before = distinctNeighbour(seam?.before, points[0]);
    const after = distinctNeighbour(seam?.after, points[n - 1]);

    const segments: CubicBezier[] = [];
    for (let i = 0; i < n - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const p0 = i > 0 ? points[i - 1] : before;
        const p3 = i < n - 2 ? points[i + 2] : after;

        const t12 = Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y), alpha);

        // Tangents in the segment's local parameter (Catmull-Rom -> Bezier
        // conversion for non-uniform parameterization); chord tangent at the
        // open ends.
        let m1: Vector2;
        if (p0) {
            const t01 = Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y), alpha);
            m1 = {
                x: (p2.x - p1.x) + t12 * ((p1.x - p0.x) / t01 - (p2.x - p0.x) / (t01 + t12)),
                y: (p2.y - p1.y) + t12 * ((p1.y - p0.y) / t01 - (p2.y - p0.y) / (t01 + t12)),
            };
        } else {
            m1 = { x: p2.x - p1.x, y: p2.y - p1.y };
        }

        let m2: Vector2;
        if (p3) {
            const t23 = Math.pow(Math.hypot(p3.x - p2.x, p3.y - p2.y), alpha);
            m2 = {
                x: (p2.x - p1.x) + t12 * ((p3.x - p2.x) / t23 - (p3.x - p1.x) / (t12 + t23)),
                y: (p2.y - p1.y) + t12 * ((p3.y - p2.y) / t23 - (p3.y - p1.y) / (t12 + t23)),
            };
        } else {
            m2 = { x: p2.x - p1.x, y: p2.y - p1.y };
        }

        segments.push({
            p0: p1,
            p1: { x: p1.x + m1.x / 3, y: p1.y + m1.y / 3 },
            p2: { x: p2.x - m2.x / 3, y: p2.y - m2.y / 3 },
            p3: p2,
        });
    }

    return {
        segments,
        parameterization: inputToDeduped.map((d) =>
            d < n - 1 ? { segmentIndex: d, t: 0 } : { segmentIndex: n - 2, t: 1 },
        ),
        maxError: 0,
    };
}
