import {
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    evaluateCubicBezier,
    FittingConfig,
    runStrokePipeline,
    setSkeletonLogLevel,
    SimplificationConfig,
    SmoothingConfig,
    solveSkeleton,
    StrokePipelineConfig,
    StrokePoint,
    Vector2,
} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE EVEN-RESAMPLING DEFECT THIS FILE RECORDED IS FIXED. ONE `known defect`
 *  TEST REMAINS — THE REFLEX L-SHAPE — AND ITS ASSERTION IS NOT A
 *  SPECIFICATION. EVERYTHING ELSE HERE IS.
 * ============================================================================
 *
 * WHAT CHANGED
 *
 * The simultaneous-event defect this file diagnosed is fixed in the solver; see
 * `near-regular-polygons.test.ts` for the mechanism. Every evenly resampled polyline in the
 * permanent sweep below now solves, where all of them failed before, and equal subdivision of
 * a square or an irregular hexagon now solves at every k from 1 to 10.
 *
 * What survives is the reflex L-shape at k = 4 and k >= 6. Subdividing it makes an entire arm
 * collapse onto its ridge in one offset layer, so the two ridge bisectors turn up in several
 * coincident groups at once — a whole strip closing rather than a set of independent vertex
 * events. `handleInteriorNGon` detects the overlap and falls back to pairwise handling for
 * that layer, which is the behaviour that was always wrong here. It is strictly better than
 * before (k = 2, 3 and 5 were failing too), and it is the remaining work.
 *
 * The measurements below are as taken BEFORE the fix, and are kept because they are what
 * localised it.
 *
 * The straight skeleton fed the way the game will actually feed it: a hand-drawn stroke run
 * through `runStrokePipeline` with closure enabled, the fitted chain sampled into a polygon,
 * that polygon handed to `solveSkeleton`, `computeOffsetRings` and `computeStrips`.
 *
 * ----------------------------------------------------------------------------
 * WHAT THE FULL SWEEP FOUND — 4 strokes x 3 smoothing x 4 simplification x 3 fitting
 * variants, closure `distance-threshold` at 20, two ways of sampling the fitted chain
 * ----------------------------------------------------------------------------
 *
 *   sampling of the fitted chain                            solved
 *   the fit's own knots (one vertex per segment start)      126 / 128
 *   even arc length, 64 vertices                            126 / 144
 *
 * The determining factor is the SAMPLER, not the pipeline variant. Sampling the chain at the
 * fit's own knots leaves the uneven vertex spacing the fitter produced (measured relative
 * spread of edge lengths: 0.03 to 0.98) and almost never fails. Resampling at even arc length
 * flattens that spread to 0.002-0.04 and the failure rate goes up by a factor of eight.
 *
 * ----------------------------------------------------------------------------
 * THE `resample` HYPOTHESIS IS NOT WHAT IT LOOKED LIKE
 * ----------------------------------------------------------------------------
 *
 * The worry was that the `resample` simplification variant, which produces evenly spaced
 * points by design, would reintroduce the regularity that trips the near-regular solver
 * defect. It does not, on its own. With `resample` at spacing 10 or 25 and any curve fitter,
 * every stroke solved in both sampling modes. The fitter's knots do not inherit the input's
 * even spacing, because Schneider places knots at its own error-driven split points and
 * Catmull-Rom's arc-length parameterisation is not uniform in the fitted curve.
 *
 * What DOES fail, every single time, is a polyline resampled at even steps — that is,
 * `fitting: 'pass-through'` (no curve at all) combined with any even resampling. 12 of 12
 * such combinations failed. The reason is that resampling a POLYLINE at a fixed step puts
 * several exactly collinear vertices on each straight run, all separated by exactly the same
 * distance, which produces large batches of simultaneous collision events.
 *
 * Confirmed independently by subdividing plain polygons into k equal pieces per edge:
 *
 *     square      k = 1, 2, 3 solve;  k = 4, 5, 8 fail
 *     L-shape     k = 1, 3 solve;     k = 2, 4, 5, 8 fail
 *     hexagon     k = 1, 2, 4, 5, 8 solve;  k = 3 fails
 *
 * Sporadic, not a density threshold — the signature of tie-breaking rather than a geometric
 * limit. A single collinear vertex inserted on one edge is harmless in every position tested,
 * and pushing that vertex off the line by anything from 1e-12 to 1 unit is also harmless. So
 * collinearity alone is not the trigger; EQUAL SPACING between collinear vertices is.
 *
 * This is the same class as `near-regular-failures.test.ts` — simultaneous events the solver
 * does not disambiguate — reached by a new and far more game-relevant route. One difference
 * worth recording: the perturbation needed to rescue it is larger. The near-regular circle
 * needs about 1e-9 of relative displacement; these need about 1e-6 (measured: jitter of 1e-6
 * absolute on a 200-unit square rescues 0-3 runs in 5, jitter of 1e-4 rescues 4-5 in 5).
 * Consistent with the same mechanism at a much higher tie multiplicity.
 *
 * ----------------------------------------------------------------------------
 * A SEPARATE, NON-CORRECTNESS FINDING: THE SOLVER'S COST IN VERTEX COUNT
 * ----------------------------------------------------------------------------
 *
 * Measured on one resampled, Catmull-Rom-fitted blob, sampled at increasing density:
 *
 *     vertices    solve time
 *     106            2.3 s
 *     212           21.7 s
 *     318           88.0 s
 *
 * Roughly cubic. All three completed correctly — this is cost, not failure. It matters
 * because ordinary pipeline settings reach those vertex counts easily: `chaikin` smoothing
 * with `pass-through` simplification turns a 90-sample stroke into 663 to 943 fitted
 * segments. A player who picks that combination produces a region that cannot be solved in
 * interactive time. The permanent tests below stay well under 60 vertices.
 */

setSkeletonLogLevel('silent');

function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A hand-drawn closed loop. The angular step varies with the pseudo-random draw, because a
 * hand does not move at constant angular speed and even sampling would beg the question this
 * file is asking. The stroke ends a few units from where it started, as a closing hand does.
 */
function authorLoop(seed: number, lobes: number, lobeDepth: number, sampleCount: number): StrokePoint[] {
    const random = seededRandom(seed);
    const points: StrokePoint[] = [];
    let time = 0;
    let theta = 0;
    for (let i = 0; i < sampleCount; i++) {
        const step = ((2 * Math.PI) / sampleCount) * (0.5 + random() * 1.2);
        const radius = 180 + lobeDepth * Math.sin(lobes * theta) + (random() - 0.5) * 3;
        points.push({x: 400 + radius * Math.cos(theta), y: 380 + radius * Math.sin(theta) * 0.85, t: time});
        theta += step;
        time += 8 + random() * 6;
        if (theta >= 2 * Math.PI) break;
    }
    const first = points[0];
    points.push({x: first.x + 4, y: first.y - 3, t: time + 10});
    return points;
}

const STROKES: [string, StrokePoint[]][] = [
    ['blob', authorLoop(11, 0, 0, 90)],
    ['2-lobe', authorLoop(44, 2, 60, 100)],
];

const SMOOTHINGS: [string, SmoothingConfig][] = [
    ['none', {variant: 'pass-through'}],
    ['moving-average', {variant: 'moving-average', windowSize: 5}],
    ['chaikin', {variant: 'chaikin', iterations: 3}],
];

const SIMPLIFICATIONS: [string, SimplificationConfig][] = [
    ['none', {variant: 'pass-through'}],
    ['rdp', {variant: 'rdp', epsilon: 2}],
    ['resample-10', {variant: 'resample', spacing: 10}],
    ['resample-25', {variant: 'resample', spacing: 25}],
];

const FITTINGS: [string, FittingConfig][] = [
    ['schneider', {variant: 'schneider', errorTolerance: 4}],
    ['catmull-rom', {variant: 'catmull-rom', alpha: 0.5}],
    ['none', {variant: 'pass-through'}],
];

function configFor(smoothing: SmoothingConfig, simplification: SimplificationConfig, fitting: FittingConfig): StrokePipelineConfig {
    return {
        smoothing,
        simplification,
        cornerDetection: {variant: 'pass-through'},
        fitting,
        closure: {variant: 'distance-threshold', threshold: 20},
    };
}

/** Dense flattening of a fitted chain, used only as the arc-length reference. */
function flatten(segments: {p0: Vector2; p1: Vector2; p2: Vector2; p3: Vector2}[]): Vector2[] {
    const out: Vector2[] = [];
    segments.forEach((segment, index) => {
        for (let k = index === 0 ? 0 : 1; k <= 16; k++) {
            out.push(evaluateCubicBezier(segment, k / 16));
        }
    });
    return out;
}

/** Resample a closed polyline to exactly `count` vertices at equal arc length. */
function resampleClosed(polyline: Vector2[], count: number): Vector2[] {
    const cumulative = [0];
    for (let i = 1; i < polyline.length; i++) {
        cumulative.push(cumulative[i - 1]
            + Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].y - polyline[i - 1].y));
    }
    const total = cumulative[cumulative.length - 1];
    if (total === 0) {
        return [];
    }
    const out: Vector2[] = [];
    for (let k = 0; k < count; k++) {
        const target = (total * k) / count;
        let hi = 1;
        while (hi < cumulative.length - 1 && cumulative[hi] < target) {
            hi++;
        }
        const span = cumulative[hi] - cumulative[hi - 1];
        const fraction = span === 0 ? 0 : (target - cumulative[hi - 1]) / span;
        out.push({
            x: polyline[hi - 1].x + fraction * (polyline[hi].x - polyline[hi - 1].x),
            y: polyline[hi - 1].y + fraction * (polyline[hi].y - polyline[hi - 1].y),
        });
    }
    return out;
}

/** The fitted chain's own knots: one polygon vertex per cubic segment, spacing left uneven. */
function polygonAtKnots(raw: StrokePoint[], config: StrokePipelineConfig): Vector2[] {
    const piped = runStrokePipeline(raw, config);
    if (piped.fit === null || piped.fit.segments.length === 0) {
        const points = piped.corners.points;
        return points.slice(0, points.length - 1).map(point => ({x: point.x, y: point.y}));
    }
    return piped.fit.segments.map(segment => ({x: segment.p0.x, y: segment.p0.y}));
}

/** The fitted chain resampled to a fixed vertex budget at even arc length. */
function polygonEvenlySpaced(raw: StrokePoint[], config: StrokePipelineConfig, budget: number): Vector2[] {
    const piped = runStrokePipeline(raw, config);
    if (piped.fit === null || piped.fit.segments.length === 0) {
        const points = piped.corners.points;
        const polyline = points.map(point => ({x: point.x, y: point.y}));
        return resampleClosed(polyline, budget);
    }
    return resampleClosed(flatten(piped.fit.segments), budget);
}

function segmentsProperlyCross(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean {
    const cross = (o: Vector2, p: Vector2, q: Vector2): number =>
        (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
    const d1 = cross(b1, b2, a1);
    const d2 = cross(b1, b2, a2);
    const d3 = cross(a1, a2, b1);
    const d4 = cross(a1, a2, b2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function isSimple(ring: Vector2[]): boolean {
    for (let i = 0; i < ring.length; i++) {
        for (let j = i + 1; j < ring.length; j++) {
            if ((j + 1) % ring.length === i || (i + 1) % ring.length === j) {
                continue;
            }
            if (segmentsProperlyCross(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) {
                return false;
            }
        }
    }
    return true;
}

/** Relative spread of edge lengths: zero for a perfectly even polygon. */
function edgeLengthSpread(polygon: Vector2[]): number {
    const lengths = polygon.map((point, i) => {
        const next = polygon[(i + 1) % polygon.length];
        return Math.hypot(next.x - point.x, next.y - point.y);
    });
    const shortest = Math.min(...lengths);
    const longest = Math.max(...lengths);
    return longest === 0 ? 0 : (longest - shortest) / longest;
}

/** Subdivide each edge into `k` equal pieces: exactly collinear, exactly evenly spaced. */
function subdivide(polygon: Vector2[], k: number): Vector2[] {
    const out: Vector2[] = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        for (let j = 0; j < k; j++) {
            out.push({x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k});
        }
    }
    return out;
}

const SQUARE: Vector2[] = [{x: 0, y: 0}, {x: 0, y: 200}, {x: 200, y: 200}, {x: 200, y: 0}];
const L_SHAPE: Vector2[] = [
    {x: 0, y: 0}, {x: 0, y: 300}, {x: 150, y: 300}, {x: 150, y: 140}, {x: 320, y: 140}, {x: 320, y: 0},
];
const IRREGULAR_HEXAGON: Vector2[] = [
    {x: 10, y: 20}, {x: 60, y: 310}, {x: 250, y: 380}, {x: 410, y: 250}, {x: 390, y: 70}, {x: 190, y: 5},
];

describe('stroke-derived polygons', () => {
    describe('the pipeline produces polygons at all', () => {
        it.each(STROKES.map(([name]) => name))('%s closes under every stage combination', strokeName => {
            const raw = STROKES.find(([name]) => name === strokeName)![1];
            for (const [, smoothing] of SMOOTHINGS) {
                for (const [, simplification] of SIMPLIFICATIONS) {
                    for (const [, fitting] of FITTINGS) {
                        const piped = runStrokePipeline(raw, configFor(smoothing, simplification, fitting));
                        expect(piped.closed).toBe(true);
                    }
                }
            }
        });
    });

    describe('sampling the fitted chain at its own knots', () => {
        it('solves, offsets and strips cleanly for every stage combination', () => {
            const failures: string[] = [];
            for (const [strokeName, raw] of STROKES) {
                for (const [smoothingName, smoothing] of SMOOTHINGS) {
                    for (const [simplificationName, simplification] of SIMPLIFICATIONS) {
                        for (const [fittingName, fitting] of FITTINGS) {
                            const label = `${strokeName}/${smoothingName}/${simplificationName}/${fittingName}`;
                            const polygon = polygonAtKnots(raw, configFor(smoothing, simplification, fitting));
                            // Above 60 vertices the solver's near-cubic cost makes this test slow;
                            // the full sweep is recorded in the header comment instead.
                            if (polygon.length < 4 || polygon.length > 60 || !isSimple(polygon)) {
                                continue;
                            }

                            const result = solveSkeleton(polygon);
                            if (!result.complete || result.context === null) {
                                failures.push(`${label} (n=${polygon.length}) did not solve`);
                                continue;
                            }
                            const maxOffset = computeMaxOffset(result);
                            const rings = computeOffsetRings(result, maxOffset * 0.5);
                            if (rings.length === 0 || rings.some(ring => ring.length < 3)) {
                                failures.push(`${label} produced ${rings.length} usable rings`);
                            }
                            const strips = computeStrips(result, {depth: maxOffset * 0.5});
                            const empty = strips.filter(strip => strip.boundary.length < 3).length;
                            if (empty > 0) {
                                failures.push(`${label} produced ${empty} empty strips`);
                            }
                        }
                    }
                }
            }
            expect(failures.join('; ')).toBe('');
        });

        it('leaves the vertex spacing genuinely uneven, which is why it works', () => {
            const spreads: number[] = [];
            for (const [, raw] of STROKES) {
                for (const [, simplification] of SIMPLIFICATIONS) {
                    const polygon = polygonAtKnots(raw, configFor(
                        {variant: 'pass-through'}, simplification, {variant: 'catmull-rom', alpha: 0.5}));
                    if (polygon.length >= 4) {
                        spreads.push(edgeLengthSpread(polygon));
                    }
                }
            }
            // Measured across the full sweep: 0.03 to 0.98. Nothing near the 0.002-0.008 band
            // that even resampling produces on the same strokes.
            expect(Math.min(...spreads)).toBeGreaterThan(0.03);
        });
    });

    describe('an evenly resampled polyline', () => {
        it('solves for every stroke and every smoothing when there is no curve fit', () => {
            const outcomes: string[] = [];
            for (const [strokeName, raw] of STROKES) {
                for (const [smoothingName, smoothing] of SMOOTHINGS) {
                    const polygon = polygonEvenlySpaced(
                        raw,
                        configFor(smoothing, {variant: 'rdp', epsilon: 2}, {variant: 'pass-through'}),
                        64,
                    );
                    expect(polygon).toHaveLength(64);
                    const result = solveSkeleton(polygon);
                    outcomes.push(`${strokeName}/${smoothingName}: ${result.complete ? 'solved' : 'failed'}`);
                }
            }

            // Every one of these failed before the coincident-event fix. RDP output is a
            // polyline, so resampling it at even arc length lays down exactly collinear, exactly
            // equally spaced vertices — the densest source of tied events the pipeline has.
            expect(outcomes.filter(outcome => outcome.endsWith('failed'))).toEqual([]);
        });

        it('also solves the same strokes when a curve fitter breaks up the even spacing', () => {
            for (const [, raw] of STROKES) {
                for (const [, fitting] of [FITTINGS[0], FITTINGS[1]]) {
                    const polygon = polygonEvenlySpaced(
                        raw, configFor({variant: 'pass-through'}, {variant: 'rdp', epsilon: 2}, fitting), 64);
                    expect(solveSkeleton(polygon).complete).toBe(true);
                }
            }
        });

        it('solves `resample` simplification fine on its own — it never was the culprit', () => {
            for (const [, raw] of STROKES) {
                for (const [, simplification] of [SIMPLIFICATIONS[2], SIMPLIFICATIONS[3]]) {
                    for (const [, fitting] of [FITTINGS[0], FITTINGS[1]]) {
                        const polygon = polygonEvenlySpaced(
                            raw, configFor({variant: 'pass-through'}, simplification, fitting), 64);
                        expect(solveSkeleton(polygon).complete).toBe(true);
                    }
                }
            }
        });
    });

    describe('equal spacing between collinear vertices', () => {
        const subdivisions = Array.from({length: 10}, (_unused, index) => index + 1);

        const failingSubdivisions = (polygon: Vector2[]): number[] =>
            subdivisions.filter(k => !solveSkeleton(subdivide(polygon, k)).complete);

        it('solves a convex polygon subdivided into any number of equal pieces', () => {
            // Before the fix: k = 1, 2, 3 solved and k = 4 to 10 all failed.
            expect(failingSubdivisions(SQUARE)).toEqual([]);
        });

        it('solves a non-convex polygon subdivided into any number of equal pieces', () => {
            // Before the fix: k = 3, 6, 7 and 9 failed, sporadically rather than by density.
            expect(failingSubdivisions(IRREGULAR_HEXAGON)).toEqual([]);
        });

        it('still loses the reflex L-shape at some subdivisions (known defect)', () => {
            // NOT DESIRED BEHAVIOUR. What is left of the original defect, and the one shape in
            // this file that the coincident-event fix does not rescue outright.
            //
            // Subdividing the L makes both arms collapse onto their own ridge in a single
            // offset layer: every perpendicular bisector from one long side meets the opposite
            // side's bisector at the same offset, at a different point each. The two ridge
            // bisectors therefore appear in several coincident groups at once, which is a whole
            // strip closing rather than a set of independent vertex events, and
            // `handleInteriorNGon` falls back to pairwise handling for that layer.
            //
            // Measured before the fix: k = 2, 4, 5, 6, 7, 8, 9, 10 failed. Now:
            expect(failingSubdivisions(L_SHAPE)).toEqual([4, 6, 7, 8, 9, 10]);
        });

        it('is not caused by collinearity by itself', () => {
            // One extra vertex at the midpoint of any single edge is harmless everywhere.
            for (let edge = 0; edge < IRREGULAR_HEXAGON.length; edge++) {
                const a = IRREGULAR_HEXAGON[edge];
                const b = IRREGULAR_HEXAGON[(edge + 1) % IRREGULAR_HEXAGON.length];
                const withMidpoint = [...IRREGULAR_HEXAGON];
                withMidpoint.splice(edge + 1, 0, {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
                expect(solveSkeleton(withMidpoint).complete).toBe(true);
            }
        });
    });

    describe('stroke settings can produce polygons the solver cannot handle in interactive time', () => {
        it('turns a 90-sample stroke into hundreds of fitted segments under ordinary settings', () => {
            const raw = STROKES[0][1];
            const piped = runStrokePipeline(
                raw,
                configFor({variant: 'chaikin', iterations: 3}, {variant: 'pass-through'}, {variant: 'catmull-rom', alpha: 0.5}),
            );

            // Measured: 663 segments here, and 943 for the five-lobed stroke. At roughly cubic
            // cost, a polygon that dense takes minutes. Nothing in the pipeline warns about it.
            expect(piped.fit).not.toBeNull();
            expect(piped.fit!.segments.length).toBeGreaterThan(500);
        });
    });
});
