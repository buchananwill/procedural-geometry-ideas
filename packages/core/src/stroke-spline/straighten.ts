import type { Vector2 } from '../straight-skeleton/types';
import type { StrokePipelineResult } from './types';
import { boundingDiagonal, maxDeviationFromRing, reduceRingToVertexBudget, strokeToRing } from './vertex-budget';
import type { VertexBudgetResult } from './vertex-budget';

/**
 * Vertex reduction that is allowed to *move* vertices, not only choose them.
 *
 * `reduceToVertexBudget` selects a subset of the polyline it is handed. That is
 * the right primitive and it stays untouched, but it inherits every defect of
 * the polyline: on a drawn rectangle the Schneider fit rounds and overshoots
 * each corner before the budget ever sees it, so RDP's only options are points
 * that already sit 10-18 px outside the corner the user drew. No selection can
 * fix that, because the point the user meant is not in the set.
 *
 * So: **RDP decides how many vertices and roughly where; least squares decides
 * exactly where.** The reduction runs first and answers the hard question —
 * where the shape needs its detail, how the budget is split between a busy arc
 * and a long flat run. Then each edge of that reduced polygon is re-derived: the
 * stroke samples belonging to it are fitted with a straight line, and each vertex
 * is moved to where its two lines cross. Straight runs come out straight, and a
 * corner lands where the user's two strokes actually meet rather than where a
 * Bezier's overshoot happened to be sampled.
 *
 * Building corner-anchored fitting from scratch was rejected for the obvious
 * reason: a stroke with no sharp corners — a circle — would yield no vertices at
 * all. Deferring allocation to RDP means every shape gets vertices, and only
 * their positions are re-decided.
 */

/**
 * Least-squares over N points already averages tremor down by roughly sqrt(N).
 * Below this many samples an edge's "fit" is mostly the noise of two or three
 * pointer readings, so such an edge declines to produce a line at all. Three is
 * also the arithmetic floor — the angular standard error below divides by
 * `count - 2` — so this is only one sample more cautious than it has to be.
 *
 * A vertex beside a declining edge is not abandoned: it falls back to its other
 * line, or to the run beyond the declining edge when that edge is a corner stub.
 * Only a vertex with no line on either side keeps its reduced position untouched.
 */
const MIN_FIT_SAMPLES = 4;

/**
 * Fraction of each edge's sample run dropped from each end before fitting.
 *
 * The samples nearest an edge's ends are the ones nearest the corner, and near a
 * corner the split between the two edges is decided by the RDP vertex — which is
 * the misplaced point this whole mode exists to correct. Trimming keeps the
 * wrongly-assigned handful out of both fits. Kept small: it costs samples, and
 * the samples in the middle of a long run are the ones carrying the line anyway.
 */
const EDGE_TRIM_FRACTION = 0.12;

/**
 * Smallest |sin| of the turn between two fitted lines that will be trusted to
 * place a vertex by intersection.
 *
 * The intersection of two lines each uncertain by `d` sits `~d / |sin t|` from
 * where it should, so this number is a noise amplification ceiling: 0.09 (~5
 * degrees) caps it at about 11x. Below that the two runs are not two runs — they
 * are one continuing curve that RDP happened to break in the middle, the
 * crossing is far off the stroke, and the RDP vertex, which at least lies on the
 * curve, is the better answer.
 *
 * Deliberately well below the turn a smooth curve produces at these budgets — a
 * circle at budget 24 turns 15 degrees per vertex (sin 0.26), at budget 8 it
 * turns 45 (sin 0.71) — so this guard does not fire across an ordinary curved
 * stroke. It is for the near-collinear pair, not for curvature; curvature is the
 * run-overshoot guard's job, and sweeping this threshold from 0.09 to 0.6 moved
 * no measured number, which is the evidence that it is doing only its own job.
 * A vertex it rejects does not simply stay put — it slides onto the run the two
 * near-parallel lines agree on. See `slideOntoParallelRun`.
 */
const MIN_TURN_SIN = 0.09;

/**
 * How far a vertex may be moved from its RDP position, as a fraction of the
 * longer of the two edges meeting there.
 *
 * The last backstop under everything else, and the only guard here that is a
 * blunt distance rather than a statement about the geometry. It is scaled to the
 * local edge lengths because half an edge is the point past which a moved vertex
 * stops being a correction and starts being a different polygon — the risk being
 * a self intersection the skeleton solver would then have to untangle. The
 * *longer* of the two edges, not the shorter, because a corner reached across a
 * short stub is a legitimately large move and the shorter edge would forbid
 * exactly the correction that matters most.
 */
const MAX_SHIFT_FRACTION = 0.5;

/**
 * Absolute ceiling on the same move, as a fraction of the shape's bounding
 * diagonal.
 *
 * The corner errors this mode exists to fix were 10-18 px on a shape ~600 px
 * across, about 3%, but the RDP vertex is not always on the corner's shoulder —
 * at a tight budget it can be most of the way down the edge, and the move that
 * puts it back is correspondingly larger. Swept at 6 / 12 / 20%: 6% was still
 * vetoing real corner recoveries, and above 12% nothing further changed, so the
 * measurement has already saturated well short of a cap that would let a vertex
 * roam.
 */
const MAX_SHIFT_FRACTION_OF_DIAGONAL = 0.12;

/**
 * How close two straightened vertices have to be to become one, as a fraction of
 * the bounding diagonal. Same reasoning as the seam merge in the budget module:
 * ~3 px on a 600 px shape is one corner as far as the drawing is concerned.
 */
const MERGE_FRACTION_OF_DIAGONAL = 0.005;

/**
 * How uncertain a crossing may be before the vertex declines to move to it, as a
 * fraction of the shape's bounding diagonal. ~10 px on a 500 px shape.
 *
 * A shape-relative figure rather than an absolute one because the whole pipeline
 * is scale-free and a tolerance in pixels would silently change meaning with the
 * zoom the stroke was drawn at.
 */
const MAX_CROSSING_UNCERTAINTY_FRACTION = 0.02;

export interface StraightenedBudgetResult extends VertexBudgetResult {
    /**
     * How many vertices were actually repositioned by a line intersection. The
     * rest kept the position the reduction gave them, either because a guard
     * rejected the crossing or because their edges had too few samples to fit.
     * Zero means this mode returned exactly what the faithful mode would have.
     */
    straightened: number;
}

export interface StraightenOptions {
    /**
     * Ordered points to least-squares fit the straight runs against. Defaults to
     * the polyline being reduced, which makes the mode self-contained but throws
     * away the reason it exists — the samples the user actually produced.
     */
    samples?: Vector2[];
    /**
     * Index-matched to `samples`: where each sample sits on the polyline being
     * reduced. Used *only* to decide which edge a sample belongs to; the fit is
     * always against `samples` themselves. Defaults to `samples`.
     */
    anchors?: Vector2[];
    /** Treat the polyline as a closed ring, so its last vertex joins its first. */
    closed?: boolean;
}

interface FittedLine {
    /** A point on the line: the centroid of the samples it was fitted to. */
    point: Vector2;
    /** Unit direction. Sign is arbitrary and never relied on. */
    direction: Vector2;
    /** Standard error of the line's angle, in radians, from its own residuals. */
    angleStandardError: number;
    /** Half the along-line span of the samples fitted, measured from `point`. */
    halfExtent: number;
}

/**
 * How far past the end of a run a crossing may sit and still be accepted as that
 * run's corner, as a fraction of the run's own length.
 *
 * This is the guard that keeps a drawn circle from being turned inside out. Two
 * runs on a curve are chords, and extending chords until they cross puts the
 * meeting point well outside the shape — geometrically the correct crossing of
 * those two lines, and completely the wrong place for a vertex. Measured on a
 * drawn circle at budget 24: a crossing 29 px past the end of a 41 px run, which
 * dragged the vertex a fifth of the way round the arc.
 *
 * A real corner does not do that. The runs either side of a hand-drawn corner
 * stop at the shoulders of its rounding, so their crossing is a shoulder's width
 * past each of them and no more — on the measured rectangle about 0.12 of the run
 * length. 0.2 sits between the two with room on both sides, and it is a ratio
 * rather than a distance so it holds at any drawing scale or budget. Swept over
 * 0.15 / 0.2 / 0.25 / 0.4 / 0.8: everything from 0.4 up lets the circle case back
 * in, and the two tight values are within noise of each other.
 */
const MAX_RUN_OVERSHOOT_RATIO = 0.2;

/**
 * Ceiling on a fitted line's own estimate of its angular standard error, in
 * radians. ~0.05 rad is 2.9 degrees.
 *
 * This is the guard that matters, and it was added because measurement demanded
 * it: without it a drawn pentagon at budget 16 got *worse*, by 65%. The cause was
 * a 21 px edge carrying five samples. Least squares will happily return a line
 * through five samples spanning 21 px with 3 px of tremor on them, and that line
 * is 12 degrees of nonsense; crossing it with its neighbour threw the vertex 7 px
 * off the shape. A sample count alone cannot catch this, because five samples is
 * plenty over 200 px and useless over 20.
 *
 * The standard error of a fitted slope is `sigma / sqrt(sum of squared
 * deviations along the line)`, and orthogonal regression has already computed
 * both: the scatter matrix's larger eigenvalue is the spread along the fit, its
 * smaller one the squared residual. So each line states its own reliability and
 * this is simply the threshold, rather than a proxy for it. Runs too short, too
 * sparse, or too noisy to state a direction decline to, and the vertices either
 * side keep the position the reduction gave them.
 *
 * 0.035 rad (2 degrees) was chosen by sweeping 0.02 / 0.035 / 0.05 / 0.08 /
 * unbounded across four drawn shapes and four budgets. Tighter than this and the
 * mode barely fires; looser and short noisy runs start moving vertices again, and
 * a drawn pentagon goes from level with the plain reduction at high budgets to
 * 40% worse than it.
 */
const MAX_FIT_ANGLE_SD = 0.035;

function distanceSquared(a: Vector2, b: Vector2): number {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

/**
 * Total-least-squares line through `samples`: the principal eigenvector of their
 * 2x2 scatter matrix, through their centroid.
 *
 * Orthogonal regression rather than `y = mx + c` because a hand-drawn rectangle
 * has vertical edges, and the ordinary least-squares line is undefined for them.
 * Orthogonal regression also minimises the distance that is actually being
 * reported — perpendicular distance to the line — rather than vertical offset.
 */
function fitLine(samples: Vector2[], fullRun: Vector2[]): FittedLine | null {
    const count = samples.length;
    if (count < MIN_FIT_SAMPLES) return null;

    let cx = 0;
    let cy = 0;
    for (const s of samples) {
        cx += s.x;
        cy += s.y;
    }
    cx /= count;
    cy /= count;

    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const s of samples) {
        const dx = s.x - cx;
        const dy = s.y - cy;
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
    }

    const trace = sxx + syy;
    if (!(trace > 0)) return null;

    // Eigenvalues of the scatter matrix: the larger is the summed squared spread
    // along the fitted line, the smaller the summed squared residual off it.
    const spread = (trace + Math.hypot(sxx - syy, 2 * sxy)) / 2;
    const residual = trace - spread;
    if (!(spread > 0)) return null;

    // The line's own angular standard error. A run that cannot say which way it
    // points has no business moving a vertex.
    const angleStandardError = Math.sqrt(Math.max(residual, 0) / (count - 2) / spread);
    if (!(angleStandardError <= MAX_FIT_ANGLE_SD)) return null;

    // Either row of (S - lambda I) is orthogonal to the eigenvector; take
    // whichever is better conditioned, since one of them degenerates when the
    // scatter is axis-aligned.
    const candidates: Vector2[] = [
        { x: sxy, y: spread - sxx },
        { x: spread - syy, y: sxy },
    ];
    const best = candidates.reduce((a, b) => (Math.hypot(a.x, a.y) >= Math.hypot(b.x, b.y) ? a : b));
    const length = Math.hypot(best.x, best.y);
    if (!(length > 0)) return null;

    // Measured over the *untrimmed* run: the trim is there to keep corner-adjacent
    // samples out of the fit, not to shorten the run. Using the trimmed span would
    // charge a corner for the trim as if it were overshoot, and reject the very
    // corners this mode exists to recover.
    const direction = { x: best.x / length, y: best.y / length };
    let halfExtent = 0;
    for (const s of fullRun) {
        halfExtent = Math.max(halfExtent, Math.abs((s.x - cx) * direction.x + (s.y - cy) * direction.y));
    }

    return { point: { x: cx, y: cy }, direction, angleStandardError, halfExtent };
}

/**
 * Crossing point of two fitted lines, or null when the crossing is not knowable
 * to within `positionTolerance`.
 *
 * The test is propagated, not assumed. Each line carries the standard error of
 * its own angle; a line pivots about its centroid, so at a crossing `d` away it
 * is uncertain by `sd * d` across itself, and two lines meeting at angle `t`
 * turn that into `sqrt((sdA dA)^2 + (sdB dB)^2) / |sin t|` of uncertainty in
 * where they meet.
 *
 * Honest note on its worth: sweeping this tolerance over 0.008 to 0.04 of the
 * diagonal moved not one number in the measurement table. The circle case it was
 * added for — a vertex sliding 29 px *along* an arc at budget 24 — turned out not
 * to be an ill-conditioned crossing at all but a perfectly well-determined
 * crossing of two chords, which is what `MAX_RUN_OVERSHOOT_RATIO` catches. So
 * this is kept as a cheap upper bound on genuinely degenerate input rather than
 * claimed as load-bearing, and it is recorded that way so nobody re-derives it
 * expecting it to be doing more than it is.
 */
function intersectFittedLines(a: FittedLine, b: FittedLine, positionTolerance: number): Vector2 | null {
    const cross = a.direction.x * b.direction.y - a.direction.y * b.direction.x;
    if (Math.abs(cross) < MIN_TURN_SIN) return null;
    const t =
        ((b.point.x - a.point.x) * b.direction.y - (b.point.y - a.point.y) * b.direction.x) / cross;
    const meeting = { x: a.point.x + a.direction.x * t, y: a.point.y + a.direction.y * t };

    // The crossing has to be a corner of both runs, not a point they would reach
    // only after being extended a long way past where the stroke stopped.
    for (const line of [a, b]) {
        const along = Math.abs(
            (meeting.x - line.point.x) * line.direction.x + (meeting.y - line.point.y) * line.direction.y,
        );
        if (along - line.halfExtent > MAX_RUN_OVERSHOOT_RATIO * 2 * line.halfExtent) return null;
    }

    const leverA = a.angleStandardError * Math.hypot(meeting.x - a.point.x, meeting.y - a.point.y);
    const leverB = b.angleStandardError * Math.hypot(meeting.x - b.point.x, meeting.y - b.point.y);
    const uncertainty = Math.hypot(leverA, leverB) / Math.abs(cross);
    return uncertainty <= positionTolerance ? meeting : null;
}

/**
 * Where a vertex goes whenever no crossing is trustworthy: the mean of its
 * perpendicular projections onto its two lines.
 *
 * This turns out to be the workhorse of the whole mode, and it is worth saying
 * why rather than treating it as a fallback. Most vertices of a reduced polygon
 * are not corners; they sit part-way along a run that RDP split, and what is
 * wrong with them is simply that they are on the tremor rather than on the line
 * the hand meant. The mean projection moves each one onto its runs' agreed line
 * while leaving it where it was *along* the run, so no corner is invented, RDP's
 * spacing decision is respected, and the move is small and well conditioned by
 * construction.
 *
 * Two alternatives were measured and both were worse. Leaving such vertices on
 * the RDP point gave up almost all of the improvement — a drawn rectangle went
 * from 18-55% better than the plain reduction to level with it. Projecting onto
 * whichever line is nearer, which is the geometrically tidier answer when the two
 * runs genuinely turn, was worse again: it puts neighbouring vertices on
 * different lines and the polygon zigzags between them. A uniform rule that moves
 * every vertex a little beats a clever rule that moves some vertices a lot,
 * because a polygon is judged as a whole and a half-corrected one is neither
 * shape.
 */
function slideOntoParallelRun(p: Vector2, a: FittedLine, b: FittedLine): Vector2 {
    const onA = projectOntoLine(p, a);
    const onB = projectOntoLine(p, b);
    return { x: (onA.x + onB.x) / 2, y: (onA.y + onB.y) / 2 };
}

/** Foot of the perpendicular from `p` onto `line` — used for an open polyline's two ends. */
function projectOntoLine(p: Vector2, line: FittedLine): Vector2 {
    const t = (p.x - line.point.x) * line.direction.x + (p.y - line.point.y) * line.direction.y;
    return { x: line.point.x + line.direction.x * t, y: line.point.y + line.direction.y * t };
}

/**
 * Index in `polyline` of each vertex the reduction retained.
 *
 * RDP filters its input, so every retained vertex is an unmodified copy of a
 * polyline point and matches one exactly. The scan is monotone — the reduction
 * preserves order — so a shape that revisits its own coordinates cannot make a
 * later vertex match an earlier point. The nearest-point fallback exists only so
 * that a future reduction which interpolates rather than selects still produces a
 * usable, ordered mapping instead of throwing.
 */
function locateRetainedVertices(polyline: Vector2[], retained: Vector2[]): number[] {
    const indices: number[] = [];
    let cursor = 0;
    for (const vertex of retained) {
        let found = -1;
        for (let i = cursor; i < polyline.length; i++) {
            if (polyline[i].x === vertex.x && polyline[i].y === vertex.y) {
                found = i;
                break;
            }
        }
        if (found === -1) {
            let bestDistance = Number.POSITIVE_INFINITY;
            found = cursor;
            for (let i = cursor; i < polyline.length; i++) {
                const d = distanceSquared(polyline[i], vertex);
                if (d < bestDistance) {
                    bestDistance = d;
                    found = i;
                }
            }
        }
        indices.push(found);
        cursor = found;
    }
    return indices;
}

/**
 * Position of each anchor along `polyline`, as a polyline index.
 *
 * Monotone by construction: the search for anchor *i* starts where anchor *i-1*
 * landed and only ever moves forward, so the assignment cannot cross itself
 * where the shape doubles back or nearly touches. Both sequences traverse the
 * same path in the same direction, which is what makes that sound.
 */
function locateAnchors(polyline: Vector2[], anchors: Vector2[]): number[] {
    const indices: number[] = [];
    let cursor = 0;
    for (const anchor of anchors) {
        let best = cursor;
        let bestDistance = distanceSquared(polyline[cursor], anchor);
        for (let i = cursor + 1; i < polyline.length; i++) {
            const d = distanceSquared(polyline[i], anchor);
            if (d < bestDistance) {
                bestDistance = d;
                best = i;
            }
        }
        indices.push(best);
        cursor = best;
    }
    return indices;
}

/** Drop `EDGE_TRIM_FRACTION` from each end of a run, provided enough is left to fit. */
function trimRun(samples: Vector2[]): Vector2[] {
    const trim = Math.floor(samples.length * EDGE_TRIM_FRACTION);
    if (trim === 0) return samples;
    const kept = samples.length - 2 * trim;
    if (kept < MIN_FIT_SAMPLES) return samples;
    return samples.slice(trim, samples.length - trim);
}

/**
 * Fit one line per edge of the reduced polygon.
 *
 * Edge *k* owns the samples whose polyline index falls between the polyline
 * indices of vertex *k* and vertex *k+1*. The closing edge of a closed ring owns
 * everything past the last vertex. Boundaries are inclusive at the low end and
 * exclusive at the high end so no sample is fitted into two edges.
 */
function fitEdgeLines(
    vertexIndices: number[],
    sampleIndices: number[],
    samples: Vector2[],
    closed: boolean,
): (FittedLine | null)[] {
    const edgeCount = closed ? vertexIndices.length : vertexIndices.length - 1;
    const runs: Vector2[][] = Array.from({ length: edgeCount }, () => []);

    for (let s = 0; s < sampleIndices.length; s++) {
        const at = sampleIndices[s];
        let edge = -1;
        for (let k = 0; k < vertexIndices.length - 1; k++) {
            if (at >= vertexIndices[k] && at < vertexIndices[k + 1]) {
                edge = k;
                break;
            }
        }
        if (edge === -1) {
            // Past the last vertex, or before the first. On a closed ring both
            // belong to the closing edge; on an open one they are clamped to the
            // nearest real edge so an overshooting endpoint is not simply lost.
            edge = at >= vertexIndices[vertexIndices.length - 1] ? edgeCount - 1 : 0;
        }
        runs[edge].push(samples[s]);
    }

    return runs.map((run) => fitLine(trimRun(run), run));
}

function edgeLength(a: Vector2, b: Vector2): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * How short an unfittable edge has to be, relative to the run just beyond it,
 * before a vertex is allowed to reach across it for a direction.
 *
 * This is what recovers a corner the reduction straddled instead of landing on.
 * A hand-drawn corner is a rounded arc in the fitted spline, and RDP will
 * sometimes spend two vertices on its shoulders with a short stub edge crossing
 * the corner between them. That stub is not a line — it bends — so it fits
 * nothing; a vertex looking only at its immediate neighbours would find no
 * direction on that side and stay on the shoulder, leaving the corner cut.
 * Reaching one edge further finds the run the shoulder belongs to, so both
 * shoulders resolve to the same crossing — the corner — and then collapse into
 * one vertex, which is right, because there was one corner there all along.
 *
 * The length test is what stops this from being a menace. Measurement, again,
 * insisted: reaching across *any* unfittable edge made a drawn circle 4x worse at
 * budget 16, because on a curve the rejected edge is a full-length run and
 * crossing the lines two edges apart puts the vertex nowhere near the stroke. A
 * straddled corner is short and its neighbours are long; a curve's edges are all
 * the same length. At 0.35 those two cases are nowhere near each other — the
 * pentagon's corner stub measures 0.09 of the side beyond it, a circle's edges
 * measure 1.0 of each other.
 */
const STUB_LENGTH_RATIO = 0.35;

/**
 * Smallest |sin| of the turn that a *reached* pair of lines must make before the
 * reach is allowed to stand. sin 50 degrees.
 *
 * Reaching across a stub is licensed by one thing only: that there is a corner on
 * the other side of it. So the reach has to show one. Without this test the reach
 * fired on a drawn circle too — RDP leaves a circle's edges quite uneven, so a
 * short edge next to a long one passes the length ratio perfectly well — and
 * crossing lines an arc apart threw vertices tens of pixels along the curve. A
 * hand-drawn corner turns 70-90 degrees; two runs an arc apart on a smooth curve
 * turn twice the per-edge turn, which at any budget worth straightening is well
 * under 50. When the reach finds no corner the vertex falls back to what it had
 * without it, which for a curve is its own run's line.
 */
const REACHED_CORNER_SIN = 0.766;

/** The line fitted to the edge immediately on one side of a vertex, or null. */
function immediateLine(
    lines: (FittedLine | null)[],
    edge: number,
    edgeCount: number,
    closed: boolean,
): FittedLine | null {
    if (!closed && (edge < 0 || edge >= edgeCount)) return null;
    return lines[((edge % edgeCount) + edgeCount) % edgeCount];
}

/** The line one edge further out, when the edge in between is a stub short enough to reach across. */
function reachedLine(
    lines: (FittedLine | null)[],
    edgeLengths: number[],
    stubEdge: number,
    step: -1 | 1,
    edgeCount: number,
    closed: boolean,
): FittedLine | null {
    if (!closed && (stubEdge < 0 || stubEdge >= edgeCount)) return null;
    const beyond = stubEdge + step;
    if (!closed && (beyond < 0 || beyond >= edgeCount)) return null;
    const wrap = (edge: number) => ((edge % edgeCount) + edgeCount) % edgeCount;
    const line = lines[wrap(beyond)];
    if (!line) return null;
    if (edgeLengths[wrap(stubEdge)] > STUB_LENGTH_RATIO * edgeLengths[wrap(beyond)]) return null;
    return line;
}

function turnSin(a: FittedLine, b: FittedLine): number {
    return Math.abs(a.direction.x * b.direction.y - a.direction.y * b.direction.x);
}

/**
 * Collapse runs of vertices that straightening has brought within `tolerance` of
 * each other into their mean.
 *
 * Two shoulder vertices resolving to the same recovered corner is the case this
 * exists for, and it is a merge rather than a defect: the polygon comes back one
 * vertex under budget, having spent nothing on saying the same corner twice. The
 * closing pair is merged too when the ring is closed, for the same reason.
 */
function mergeCoincident(vertices: Vector2[], tolerance: number, closed: boolean): Vector2[] {
    if (vertices.length < 4) return vertices;
    const merged: Vector2[] = [];
    let group: Vector2[] = [vertices[0]];
    const flush = () => {
        const sum = group.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
        merged.push({ x: sum.x / group.length, y: sum.y / group.length });
    };
    for (let i = 1; i < vertices.length; i++) {
        if (edgeLength(vertices[i], group[group.length - 1]) <= tolerance) {
            group.push(vertices[i]);
        } else {
            flush();
            group = [vertices[i]];
        }
    }
    flush();
    if (closed && merged.length > 3 && edgeLength(merged[0], merged[merged.length - 1]) <= tolerance) {
        const first = merged[0];
        const last = merged.pop() as Vector2;
        merged[0] = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
    }
    return merged;
}

/**
 * Reduce `polyline` to `budget` vertices, then move each vertex onto the
 * crossing of the two least-squares lines fitted to the runs either side of it.
 *
 * Reports the same honest metrics as `reduceToVertexBudget`: `achieved` is the
 * count actually returned, and `maxError` is measured after the fact as the
 * worst distance from any input point to the polygon returned — including its
 * closing edge when `closed`, since that edge is part of what the caller gets.
 * Straightening can raise that number as easily as lower it: a vertex pushed out
 * to a recovered corner is further from the rounded polyline it was reduced from,
 * and closer to the shape the user drew. The number is not a score.
 *
 * Falls straight through to the plain reduction when there is nothing to fit
 * against or the polyline was already within budget.
 */
export function straightenToVertexBudget(
    polyline: Vector2[],
    budget: number,
    options: StraightenOptions = {},
): StraightenedBudgetResult {
    const closed = options.closed ?? false;
    const base = reduceRingToVertexBudget(polyline, budget, closed);
    if (!base.reduced || base.vertices.length < 3 || polyline.length < 2) {
        return { ...base, straightened: 0 };
    }

    const samples = options.samples ?? polyline;
    const anchors = options.anchors ?? samples;
    if (samples.length < MIN_FIT_SAMPLES || anchors.length !== samples.length) {
        return { ...base, straightened: 0 };
    }

    const vertexIndices = locateRetainedVertices(polyline, base.vertices);
    const sampleIndices = locateAnchors(polyline, anchors);
    const lines = fitEdgeLines(vertexIndices, sampleIndices, samples, closed);

    const count = base.vertices.length;
    const edgeCount = closed ? count : count - 1;
    const edgeLengths = Array.from({ length: edgeCount }, (_, e) =>
        edgeLength(base.vertices[e], base.vertices[(e + 1) % count]),
    );
    const diagonal = boundingDiagonal(polyline);
    const crossingTolerance = MAX_CROSSING_UNCERTAINTY_FRACTION * diagonal;
    const vertices: Vector2[] = [];
    let straightened = 0;

    for (let v = 0; v < count; v++) {
        const original = base.vertices[v];
        // Edge v-1 arrives at vertex v; edge v leaves it. On an open polyline the
        // first vertex has no incoming edge and the last has no outgoing one.
        const strictIncoming = immediateLine(lines, v - 1, edgeCount, closed);
        const strictOutgoing = immediateLine(lines, v, edgeCount, closed);
        let incoming = strictIncoming ?? reachedLine(lines, edgeLengths, v - 1, -1, edgeCount, closed);
        let outgoing = strictOutgoing ?? reachedLine(lines, edgeLengths, v, 1, edgeCount, closed);
        // A reach only stands if it found a corner; otherwise this is a curve and
        // the vertex keeps whatever its own edges could tell it.
        if (incoming !== strictIncoming || outgoing !== strictOutgoing) {
            if (!incoming || !outgoing || turnSin(incoming, outgoing) < REACHED_CORNER_SIN) {
                incoming = strictIncoming;
                outgoing = strictOutgoing;
            }
        }

        if (!incoming && !outgoing) {
            vertices.push({ x: original.x, y: original.y });
            continue;
        }

        let moved: Vector2 | null;
        if (incoming && outgoing) {
            // Near-parallel is a different situation from an untrustworthy
            // crossing, and gets a different answer. Two runs that barely turn are
            // one run, and the vertex slides onto it. A crossing rejected for any
            // other reason means the corner is not where the lines say it is, and
            // there is nothing better to do than leave the vertex where the
            // reduction put it — which is at least on the stroke.
            moved =
                intersectFittedLines(incoming, outgoing, crossingTolerance) ??
                slideOntoParallelRun(original, incoming, outgoing);
        } else {
            // A polyline end, or a vertex with a line on one side only: sliding it
            // onto that line straightens the run without inventing a corner.
            moved = projectOntoLine(original, (incoming ?? outgoing) as FittedLine);
        }

        // Backstop on the two guards above. Scaled to the longer of the two edges
        // meeting here rather than the shorter, because a corner reached across a
        // short stub is a legitimately large move, and to a fraction of the shape
        // so a long edge cannot license an arbitrary one.
        if (moved !== null) {
            const before = base.vertices[(v - 1 + count) % count];
            const after = base.vertices[(v + 1) % count];
            const span = Math.max(edgeLength(before, original), edgeLength(original, after));
            const cap = Math.min(MAX_SHIFT_FRACTION * span, MAX_SHIFT_FRACTION_OF_DIAGONAL * diagonal);
            if (edgeLength(original, moved) > cap) moved = null;
        }

        if (moved === null) {
            vertices.push({ x: original.x, y: original.y });
        } else {
            vertices.push(moved);
            straightened++;
        }
    }

    const merged = mergeCoincident(vertices, MERGE_FRACTION_OF_DIAGONAL * diagonal, closed);
    return {
        vertices: merged,
        achieved: merged.length,
        maxError: maxDeviationFromRing(polyline, merged, closed),
        reduced: true,
        straightened,
    };
}

/**
 * The polygon a stroke pipeline result describes, reduced to `budget` and
 * straightened against the stroke the user actually drew.
 *
 * **Which points are fitted, and why the raw ones.** The samples are
 * `result.raw`, not `result.smoothed`. Three reasons, in increasing order of how
 * much they decide it:
 *
 * 1. A least-squares line is already a smoother. Over the 20-60 samples a long
 *    edge carries, it suppresses zero-mean tremor by roughly sqrt(N) on its own,
 *    so pre-smoothing buys little.
 * 2. Smoothing pulls samples off the line near a corner — that inward bias is
 *    what rounds the corner in the first place, and feeding it into the fit
 *    would bake the same error back in.
 * 3. Only `raw` has an index-matched position on the curve. `correspondence` is
 *    index-matched to `raw` by contract; `smoothed` is not — `chaikin` smoothing
 *    changes the point count outright — so there is no reliable way to say where
 *    a smoothed point sits on the reduced polygon. Without that the mapping
 *    below does not exist.
 *
 * **How stroke points are mapped to edges.** Exactly, in two hops, both of which
 * are order-preserving:
 *
 * - The reduced vertices are located in the flattened polyline by exact
 *   coordinate match. RDP selects rather than interpolates, so this is not an
 *   approximation.
 * - Each raw sample is located in the same polyline by its `correspondence`
 *   entry — the pipeline's own statement of where that sample landed on the
 *   final curve — matched to the nearest polyline point by a monotone forward
 *   scan.
 *
 * The second hop is where the approximation lives, and it is small and named:
 * `correspondence` is a point on the spline, and the polyline is that spline
 * sampled 32 times per segment, so the nearest polyline point is within half a
 * flattening step of the true position. That is well under a pixel at drawing
 * scale, and an edge boundary shifting by one sample changes which of the two
 * adjacent lines one near-corner sample is fitted into — the trim exists partly
 * to make even that not matter. What the mapping is *not* is a nearest-edge
 * projection of raw points onto the reduced polygon, which would be cheaper and
 * would break wherever the shape passes near itself.
 */
export function strokeToStraightenedPolygon(
    result: StrokePipelineResult,
    budget: number,
): StraightenedBudgetResult {
    const ring = strokeToRing(result);
    return straightenToVertexBudget(ring, budget, {
        samples: result.raw.map((p) => ({ x: p.x, y: p.y })),
        anchors: result.correspondence,
        closed: result.closed,
    });
}
