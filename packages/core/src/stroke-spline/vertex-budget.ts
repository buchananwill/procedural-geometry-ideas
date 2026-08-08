import type { Vector2 } from '../straight-skeleton/types';
import type { StrokePipelineResult, StrokePoint } from './types';
import { simplifyStroke } from './simplification';
import { flattenSpline } from './correspondence';

/**
 * Vertex budgeting for polygons headed into `solveSkeleton`.
 *
 * Straight-skeleton solve cost grows at roughly the cube of the vertex count.
 * Measured on this package (wobbly closed blob, flattened from a fitted stroke
 * spline, Node 22):
 *
 * ```
 *   n =  40      0.22 s
 *   n =  64      0.70 s
 *   n =  80      1.33 s
 *   n = 106      3.1  s
 *   n = 150      9.0  s
 *   n = 212     26.6  s
 *   n = 280     63.4  s
 *   n = 318     96.4  s
 *   n = 576    611.9  s
 * ```
 *
 * A log-log fit over that range gives an exponent of ~2.9, rising from ~2.5 at
 * the small end to ~3.1 at the large end; cubic extrapolation from 318 predicts
 * 570 s at 576 against 612 s measured. A stroke pipeline is quite capable of
 * handing the solver several hundred vertices — `chaikin` smoothing with
 * `pass-through` simplification multiplies a 90-sample stroke into hundreds of
 * fitted segments, and flattening the result gives 576 — so the count has to be
 * bounded before it reaches the solver, not apologised for afterwards. That same
 * 576-vertex polygon budgeted to 64 solves in 0.81 s, for 2.0 units of deviation
 * on a shape roughly 600 units across.
 *
 * Reduction is by Ramer-Douglas-Peucker with the tolerance binary-searched to
 * land at or just under the budget, rather than by uniform arc-length
 * resampling. RDP is error-bounded, so the deviation it costs is a meaningful
 * number to report; it keeps corners instead of averaging across them; and the
 * spacing it leaves is non-uniform, dense where the shape is busy and sparse
 * where it is straight.
 *
 * This module holds no UI policy. It reports what the reduction cost — how many
 * vertices survived and how far the result strays from the input — and the
 * caller decides whether that is acceptable and what, if anything, to say about
 * it.
 */

/**
 * Suggested budget for an interactive drawing tool, from the timings above:
 * 64 vertices solves in ~0.7 s, which stays inside the pause a player will
 * tolerate after releasing the pointer, while 106 already costs ~3 s and 212
 * costs ~27 s. It is a suggestion, not a floor or a ceiling — a caller doing
 * offline or background solves should pass something larger.
 */
export const DEFAULT_VERTEX_BUDGET = 64;

/** Below three vertices there is no polygon left to hand anywhere, so a smaller budget is rejected. */
const MIN_VERTEX_BUDGET = 3;

/** Bisection steps on the RDP tolerance. Well past double precision for any realistic bracket. */
const MAX_SEARCH_ITERATIONS = 60;

/** Stop bisecting once the bracket is this fraction of its original width. */
const SEARCH_RELATIVE_TOLERANCE = 1e-9;

export interface VertexBudgetResult {
    /** The reduced polyline, at most `budget` vertices. Always fresh objects; never aliases the input. */
    vertices: Vector2[];
    /** How many vertices the result actually has. */
    achieved: number;
    /**
     * Worst deviation from the input, in input units: the largest distance from
     * any input vertex to the reduced polyline (measured to the nearest point on
     * the nearest *segment*, not to the nearest retained vertex). Zero when
     * nothing was removed.
     */
    maxError: number;
    /** False when the input was already within budget and was returned unchanged. */
    reduced: boolean;
}

function copyVertices(vertices: Vector2[]): Vector2[] {
    return vertices.map((v) => ({ x: v.x, y: v.y }));
}

/** Distance from `p` to the segment `a`-`b` (the segment, so endpoints cap it). */
function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * Largest distance from any vertex of `source` to the polyline `target`. This is
 * measured after the fact rather than inferred from the RDP tolerance, so
 * `maxError` describes the polyline actually returned.
 */
function maxDeviation(source: Vector2[], target: Vector2[]): number {
    if (target.length === 0) return 0;
    if (target.length === 1) {
        return source.reduce((worst, p) => Math.max(worst, Math.hypot(p.x - target[0].x, p.y - target[0].y)), 0);
    }
    let worst = 0;
    for (const p of source) {
        let nearest = Infinity;
        for (let i = 1; i < target.length; i++) {
            nearest = Math.min(nearest, distanceToSegment(p, target[i - 1], target[i]));
            if (nearest === 0) break;
        }
        worst = Math.max(worst, nearest);
    }
    return worst;
}

/** Bounding-box diagonal: any RDP tolerance at least this large collapses the input to its two endpoints. */
function boundingDiagonal(vertices: Vector2[]): number {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const v of vertices) {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
    }
    return Math.hypot(maxX - minX, maxY - minY);
}

/**
 * Run the package's existing `rdp` simplification variant at a given tolerance,
 * rather than keeping a second copy of the algorithm here. The `StrokePoint`
 * timestamp the variant's signature requires is filled with the source index; it
 * plays no part in the geometry and is discarded on the way out.
 */
function simplifyAt(points: StrokePoint[], epsilon: number): Vector2[] {
    return simplifyStroke(points, { variant: 'rdp', epsilon }).map((p) => ({ x: p.x, y: p.y }));
}

/**
 * Reduce `vertices` to at most `budget` vertices, and report what that cost.
 *
 * **Open polyline, endpoints pinned.** The input is treated as an ordered
 * polyline whose first and last vertices are always retained; closure is neither
 * detected nor assumed. That is deliberate, and it is not a compromise for a
 * closed ring: with both ends pinned, the ring's closing edge (last → first)
 * appears in the output exactly as it appears in the input, so no vertex is
 * measured against an edge that is not there. The only cost of ignoring closure
 * is that the seam vertex is retained even when it sits mid-arc — at most one
 * vertex of the budget — and that the result is therefore not invariant under
 * rotating the ring's starting index.
 *
 * A ring that repeats its first vertex at the end is left with that duplicate,
 * because both copies are endpoints and endpoints are pinned. Strip it before
 * calling if the consumer is a polygon solver; `strokeToBudgetedPolygon` does
 * this for pipeline output.
 *
 * **Budgets below three are rejected.** `budget` must be an integer of at least
 * 3. Clamping instead would mean returning more vertices than the caller asked
 * for, which would make `achieved <= budget` a promise this function sometimes
 * breaks; throwing keeps that invariant true of every result it returns, and
 * matches `solveSkeleton`, which likewise throws below three vertices.
 *
 * **Inputs of fewer than three vertices** are returned unchanged with
 * `reduced: false` — there is nothing RDP would remove from them.
 */
export function reduceToVertexBudget(vertices: Vector2[], budget: number): VertexBudgetResult {
    if (!Number.isInteger(budget) || budget < MIN_VERTEX_BUDGET) {
        throw new RangeError(
            `Vertex budget must be an integer of at least ${MIN_VERTEX_BUDGET}; received ${String(budget)}.`,
        );
    }

    if (vertices.length <= budget || vertices.length < MIN_VERTEX_BUDGET) {
        return { vertices: copyVertices(vertices), achieved: vertices.length, maxError: 0, reduced: false };
    }

    const points: StrokePoint[] = vertices.map((v, index) => ({ x: v.x, y: v.y, t: index }));

    // RDP's kept set shrinks monotonically as the tolerance grows — the split
    // index at each recursion step is chosen by maximum distance and does not
    // depend on the tolerance, so a larger tolerance prunes a subtree and never
    // grows one. That makes the smallest tolerance meeting the budget findable
    // by bisection, and it is the one to want: it retains the most vertices and
    // so deviates the least.
    const exact = simplifyAt(points, 0);
    let best: Vector2[];
    if (exact.length <= budget) {
        best = exact;
    } else {
        let low = 0;
        let high = boundingDiagonal(vertices) + 1;
        const stopWidth = high * SEARCH_RELATIVE_TOLERANCE;
        best = simplifyAt(points, high);
        for (let i = 0; i < MAX_SEARCH_ITERATIONS && high - low > stopWidth; i++) {
            const mid = (low + high) / 2;
            const candidate = simplifyAt(points, mid);
            if (candidate.length <= budget) {
                high = mid;
                best = candidate;
            } else {
                low = mid;
            }
        }
    }

    return {
        vertices: best,
        achieved: best.length,
        maxError: maxDeviation(vertices, best),
        reduced: true,
    };
}

/**
 * The polygon a stroke pipeline result describes, reduced to `budget`.
 *
 * Convenience, and a narrow one: it exists because turning a
 * `StrokePipelineResult` into polygon vertices takes two steps that are easy to
 * get wrong in the same two ways every time — the fit is a spline and has to be
 * flattened before it is a polyline at all, and a closed result ends on an exact
 * duplicate of its first point, which `solveSkeleton` would read as a
 * zero-length edge. Both belong to "make a polygon out of this", so they live
 * here rather than in every caller. What it deliberately does not do is choose a
 * budget, judge the reported error, or decide what happens next; it returns the
 * same `VertexBudgetResult` as the primitive and leaves all of that to the
 * caller.
 *
 * Falls back to the corner-detection polyline when the fitting stage was
 * pass-through and there is no spline to flatten.
 */
export function strokeToBudgetedPolygon(result: StrokePipelineResult, budget: number): VertexBudgetResult {
    const polyline: Vector2[] = result.fit
        ? flattenSpline(result.fit)
        : result.corners.points.map((p) => ({ x: p.x, y: p.y }));

    const ring = result.closed && polyline.length > 1 ? polyline.slice(0, polyline.length - 1) : polyline;
    return reduceToVertexBudget(ring, budget);
}
