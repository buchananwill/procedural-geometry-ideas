import type { Vector2 } from '../straight-skeleton/types';
import type { CubicBezier, FitResult, SeamNeighbours, SplineParameterization } from './types';
import { evaluateCubicBezier, cubicBezierDerivative, cubicBezierSecondDerivative } from './bezier';

/**
 * Schneider's algorithm ("An Algorithm for Automatically Fitting Digitized
 * Curves", Graphics Gems 1990), implemented from the paper: least-squares
 * cubic Bezier fitting with Newton-Raphson reparameterization and adaptive
 * splitting at the point of maximum error.
 *
 * In addition to the segment list, this implementation records the final
 * parameter assigned to every input point — the fit's own correspondence —
 * which the morph lerp consumes directly.
 */

const MAX_REPARAM_ITERATIONS = 4;
const DEDUPE_EPSILON_SQ = 1e-12;

function dist(a: Vector2, b: Vector2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeOrNull(v: Vector2): Vector2 | null {
    const len = Math.hypot(v.x, v.y);
    if (len < 1e-12) return null;
    return { x: v.x / len, y: v.y / len };
}

interface FitState {
    points: Vector2[];
    errorTolerance: number;
    segments: CubicBezier[];
    /** Parameterization per deduped point index, filled as segments are accepted. */
    params: SplineParameterization[];
    maxError: number;
}

function chordLengthParameterize(points: Vector2[], first: number, last: number): number[] {
    const u: number[] = [0];
    for (let i = first + 1; i <= last; i++) {
        u.push(u[u.length - 1] + dist(points[i], points[i - 1]));
    }
    const total = u[u.length - 1];
    if (total > 0) {
        for (let i = 0; i < u.length; i++) u[i] /= total;
    }
    return u;
}

function generateBezier(
    points: Vector2[],
    first: number,
    last: number,
    uPrime: number[],
    tHat1: Vector2,
    tHat2: Vector2,
): CubicBezier {
    const p0 = points[first];
    const p3 = points[last];
    let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;

    for (let i = first; i <= last; i++) {
        const u = uPrime[i - first];
        const mu = 1 - u;
        const b0 = mu * mu * mu;
        const b1 = 3 * u * mu * mu;
        const b2 = 3 * u * u * mu;
        const b3 = u * u * u;

        const a0 = { x: tHat1.x * b1, y: tHat1.y * b1 };
        const a1 = { x: tHat2.x * b2, y: tHat2.y * b2 };

        const tmp = {
            x: points[i].x - (p0.x * (b0 + b1) + p3.x * (b2 + b3)),
            y: points[i].y - (p0.y * (b0 + b1) + p3.y * (b2 + b3)),
        };

        c00 += a0.x * a0.x + a0.y * a0.y;
        c01 += a0.x * a1.x + a0.y * a1.y;
        c11 += a1.x * a1.x + a1.y * a1.y;
        x0 += a0.x * tmp.x + a0.y * tmp.y;
        x1 += a1.x * tmp.x + a1.y * tmp.y;
    }

    const detC0C1 = c00 * c11 - c01 * c01;
    const detC0X = c00 * x1 - c01 * x0;
    const detXC1 = x0 * c11 - x1 * c01;

    let alphaL = detC0C1 === 0 ? 0 : detXC1 / detC0C1;
    let alphaR = detC0C1 === 0 ? 0 : detC0X / detC0C1;

    // Wu/Barsky heuristic fallback for degenerate or negative alphas.
    const segLength = dist(p0, p3);
    const epsilon = 1e-6 * segLength;
    if (alphaL < epsilon || alphaR < epsilon) {
        alphaL = segLength / 3;
        alphaR = segLength / 3;
    }

    return {
        p0,
        p1: { x: p0.x + tHat1.x * alphaL, y: p0.y + tHat1.y * alphaL },
        p2: { x: p3.x + tHat2.x * alphaR, y: p3.y + tHat2.y * alphaR },
        p3,
    };
}

function newtonRaphsonRootFind(seg: CubicBezier, point: Vector2, u: number): number {
    const q = evaluateCubicBezier(seg, u);
    const q1 = cubicBezierDerivative(seg, u);
    const q2 = cubicBezierSecondDerivative(seg, u);
    const dx = q.x - point.x;
    const dy = q.y - point.y;
    const numerator = dx * q1.x + dy * q1.y;
    const denominator = q1.x * q1.x + q1.y * q1.y + dx * q2.x + dy * q2.y;
    if (denominator === 0) return u;
    return u - numerator / denominator;
}

function reparameterize(points: Vector2[], first: number, last: number, u: number[], seg: CubicBezier): number[] {
    const uPrime: number[] = new Array(u.length);
    for (let i = first; i <= last; i++) {
        uPrime[i - first] = newtonRaphsonRootFind(seg, points[i], u[i - first]);
    }
    return uPrime;
}

function computeMaxError(
    points: Vector2[],
    first: number,
    last: number,
    seg: CubicBezier,
    u: number[],
): { maxDist: number; splitPoint: number } {
    let splitPoint = Math.floor((last - first + 1) / 2) + first;
    let maxDist = 0;
    for (let i = first + 1; i < last; i++) {
        const p = evaluateCubicBezier(seg, u[i - first]);
        const d = dist(p, points[i]);
        if (d >= maxDist) {
            maxDist = d;
            splitPoint = i;
        }
    }
    return { maxDist, splitPoint };
}

function computeCenterTangent(points: Vector2[], center: number): Vector2 {
    const tangent = normalizeOrNull({
        x: points[center - 1].x - points[center + 1].x,
        y: points[center - 1].y - points[center + 1].y,
    });
    if (tangent) return tangent;
    // prev and next coincide (perfect fold-back): fall back to the incoming direction.
    const incoming = normalizeOrNull({
        x: points[center - 1].x - points[center].x,
        y: points[center - 1].y - points[center].y,
    });
    return incoming ?? { x: 1, y: 0 };
}

function acceptSegment(state: FitState, seg: CubicBezier, first: number, last: number, u: number[], maxDist: number): void {
    const segmentIndex = state.segments.push(seg) - 1;
    for (let i = first; i <= last; i++) {
        state.params[i] = { segmentIndex, t: u[i - first] };
    }
    if (maxDist > state.maxError) state.maxError = maxDist;
}

function fitCubic(state: FitState, first: number, last: number, tHat1: Vector2, tHat2: Vector2): void {
    const { points, errorTolerance } = state;

    // Base case: two points — straight-line segment via the Wu/Barsky heuristic.
    if (last - first === 1) {
        const segLength = dist(points[first], points[last]) / 3;
        const seg: CubicBezier = {
            p0: points[first],
            p1: { x: points[first].x + tHat1.x * segLength, y: points[first].y + tHat1.y * segLength },
            p2: { x: points[last].x + tHat2.x * segLength, y: points[last].y + tHat2.y * segLength },
            p3: points[last],
        };
        acceptSegment(state, seg, first, last, [0, 1], 0);
        return;
    }

    let u = chordLengthParameterize(points, first, last);
    let seg = generateBezier(points, first, last, u, tHat1, tHat2);
    let { maxDist, splitPoint } = computeMaxError(points, first, last, seg, u);

    if (maxDist < errorTolerance) {
        acceptSegment(state, seg, first, last, u, maxDist);
        return;
    }

    // If the error is not hopeless, try iterating on the parameterization.
    const iterationError = errorTolerance * errorTolerance;
    if (maxDist < iterationError) {
        for (let iteration = 0; iteration < MAX_REPARAM_ITERATIONS; iteration++) {
            const uPrime = reparameterize(points, first, last, u, seg);
            const refit = generateBezier(points, first, last, uPrime, tHat1, tHat2);
            const refitError = computeMaxError(points, first, last, refit, uPrime);
            if (refitError.maxDist < errorTolerance) {
                acceptSegment(state, refit, first, last, uPrime, refitError.maxDist);
                return;
            }
            u = uPrime;
            seg = refit;
            maxDist = refitError.maxDist;
            splitPoint = refitError.splitPoint;
        }
    }

    // Fitting failed: split at the point of maximum error and recurse.
    const tHatCenter = computeCenterTangent(points, splitPoint);
    fitCubic(state, first, splitPoint, tHat1, tHatCenter);
    fitCubic(state, splitPoint, last, { x: -tHatCenter.x, y: -tHatCenter.y }, tHat2);
}

/** Unit tangent from a virtual neighbour to the point beyond the endpoint, or null if degenerate. */
function tangentAcrossSeam(from: Vector2 | null | undefined, to: Vector2): Vector2 | null {
    if (!from) return null;
    return normalizeOrNull({ x: to.x - from.x, y: to.y - from.y });
}

/**
 * Fit a cubic Bezier spline to a polyline. Returns null when fewer than two
 * distinct points exist. `parameterization` has one entry per *input* point —
 * consecutive duplicates share their representative's entry.
 *
 * End tangents are the one-sided chord directions unless `seam` supplies a
 * virtual neighbour beyond that end, in which case the two-sided direction
 * across the seam is used — the same construction `computeCenterTangent`
 * applies at an interior split, so the join is tangent-continuous.
 */
export function fitStrokeSpline(
    inputPoints: Vector2[],
    errorTolerance: number,
    seam?: SeamNeighbours | null,
): FitResult | null {
    // Collapse consecutive duplicates, remembering each input's representative.
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

    if (points.length < 2) return null;

    const n = points.length;
    const tHat1 =
        tangentAcrossSeam(seam?.before, points[1]) ??
        normalizeOrNull({ x: points[1].x - points[0].x, y: points[1].y - points[0].y })!;
    const tHat2 =
        tangentAcrossSeam(seam?.after, points[n - 2]) ??
        normalizeOrNull({ x: points[n - 2].x - points[n - 1].x, y: points[n - 2].y - points[n - 1].y })!;

    const state: FitState = {
        points,
        errorTolerance,
        segments: [],
        params: new Array(n),
        maxError: 0,
    };
    fitCubic(state, 0, n - 1, tHat1, tHat2);

    return {
        segments: state.segments,
        parameterization: inputToDeduped.map((dedupedIndex) => state.params[dedupedIndex]),
        maxError: state.maxError,
    };
}
