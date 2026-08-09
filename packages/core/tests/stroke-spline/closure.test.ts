import * as fs from 'fs';
import * as path from 'path';
import {
    CLOSURE_VARIANT_DEFAULTS,
    cubicBezierDerivative,
    evaluateCubicBezier,
    isStrokeClosed,
    runStrokePipeline,
    solveSkeleton,
} from "@proc-geo/core";
import type {
    ClosureConfig,
    CubicBezier,
    FitResult,
    StrokePipelineConfig,
    StrokePipelineResult,
    StrokePoint,
    Vector2,
} from "@proc-geo/core";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeStroke(count: number, fn: (i: number) => { x: number; y: number }): StrokePoint[] {
    const out: StrokePoint[] = [];
    for (let i = 0; i < count; i++) out.push({ ...fn(i), t: i * 8 });
    return out;
}

/** `count` samples around a closed polar curve; the last sample repeats the first exactly. */
function makePolarLoop(count: number, cx: number, cy: number, radius: (angle: number) => number): StrokePoint[] {
    return makeStroke(count, (i) => {
        const angle = (i / (count - 1)) * 2 * Math.PI;
        return { x: cx + radius(angle) * Math.cos(angle), y: cy + radius(angle) * Math.sin(angle) };
    });
}

/** Walks the corner list, `perEdge` samples per edge, and returns to the first corner exactly. */
function makePolygonStroke(corners: number[][], perEdge: number): StrokePoint[] {
    const points: StrokePoint[] = [];
    let t = 0;
    for (let c = 0; c < corners.length - 1; c++) {
        const [ax, ay] = corners[c];
        const [bx, by] = corners[c + 1];
        for (let k = 0; k < perEdge; k++) {
            points.push({ x: ax + ((bx - ax) * k) / perEdge, y: ay + ((by - ay) * k) / perEdge, t: t++ });
        }
    }
    points.push({ x: corners[0][0], y: corners[0][1], t: t++ });
    return points;
}

const CIRCLE_LOOP = makePolarLoop(49, 200, 200, () => 150);
const SQUARE_LOOP = makePolygonStroke([[0, 0], [240, 0], [240, 240], [0, 240], [0, 0]], 12);
const CHEVRON_LOOP = makePolygonStroke(
    [[0, 0], [200, 120], [400, 0], [400, 90], [200, 210], [0, 90], [0, 0]],
    8,
);
const BEAN_LOOP = makePolarLoop(61, 250, 250, (a) => 150 + 45 * Math.cos(a) - 35 * Math.cos(2 * a));
const BLOB_LOOP = makePolarLoop(73, 250, 250, (a) => 150 + 40 * Math.sin(2 * a) + 20 * Math.cos(3 * a));

const CLOSE_AT_20: ClosureConfig = { variant: 'distance-threshold', threshold: 20 };

/** Corner detection on, so a seam that lands on a corner is allowed to crease. */
const CLOSED_CONFIG: StrokePipelineConfig = {
    smoothing: { variant: 'moving-average', windowSize: 5 },
    simplification: { variant: 'pass-through' },
    cornerDetection: { variant: 'angle-threshold', thresholdDeg: 60, span: 2 },
    fitting: { variant: 'schneider', errorTolerance: 4 },
    closure: CLOSE_AT_20,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function unit(v: Vector2): Vector2 {
    const length = Math.hypot(v.x, v.y);
    return { x: v.x / length, y: v.y / length };
}

/** Curve direction at a segment end, stepping to the next control point if the first difference vanishes. */
function tangentAt(segment: CubicBezier, t: 0 | 1): Vector2 {
    const derivative = cubicBezierDerivative(segment, t);
    if (Math.hypot(derivative.x, derivative.y) > 1e-12) return unit(derivative);
    const [from, to] = t === 0 ? [segment.p0, segment.p3] : [segment.p2, segment.p3];
    return unit({ x: to.x - from.x, y: to.y - from.y });
}

/**
 * A join this close to collinear is continuous; the residual is float noise
 * from normalisation and the Wu/Barsky tangent-magnitude heuristic. A crease
 * that a viewer could see is orders of magnitude larger than this.
 */
const CONTINUOUS_TOLERANCE_DEG = 1e-4;

/** Angle in degrees between the tangent arriving at the seam and the one leaving it. 0 = no crease. */
function seamCreaseDeg(fit: FitResult): number {
    const incoming = tangentAt(fit.segments[fit.segments.length - 1], 1);
    const outgoing = tangentAt(fit.segments[0], 0);
    const dot = Math.min(1, Math.max(-1, incoming.x * outgoing.x + incoming.y * outgoing.y));
    return (Math.acos(dot) * 180) / Math.PI;
}

/**
 * Sample a closed fitted chain into a polygon: `perSegment` points per segment
 * at t = 0, 1/k, … (never t = 1), so joins are not duplicated and the seam
 * vertex appears exactly once.
 */
function sampleClosedChain(fit: FitResult, perSegment: number): Vector2[] {
    const polygon: Vector2[] = [];
    fit.segments.forEach((segment) => {
        for (let k = 0; k < perSegment; k++) polygon.push(evaluateCubicBezier(segment, k / perSegment));
    });
    return polygon;
}

/** Vertices turning against the polygon's own orientation by at least `minDeg` — non-convexity, ignoring sampling wobble. */
function reflexVertexCount(polygon: Vector2[], minDeg: number): number {
    const n = polygon.length;
    let doubleArea = 0;
    for (let i = 0; i < n; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % n];
        doubleArea += a.x * b.y - b.x * a.y;
    }
    const orientation = Math.sign(doubleArea);
    let count = 0;
    for (let i = 0; i < n; i++) {
        const incoming = unit({ x: polygon[i].x - polygon[(i - 1 + n) % n].x, y: polygon[i].y - polygon[(i - 1 + n) % n].y });
        const outgoing = unit({ x: polygon[(i + 1) % n].x - polygon[i].x, y: polygon[(i + 1) % n].y - polygon[i].y });
        const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
        const turnDeg = (Math.asin(Math.min(1, Math.abs(cross))) * 180) / Math.PI;
        if (Math.sign(cross) === -orientation && turnDeg >= minDeg) count++;
    }
    return count;
}

function serializeOpenResult(result: StrokePipelineResult): string {
    const { closed: _closed, ...openFields } = result;
    return JSON.stringify(openFields);
}

// ── 1. Open-curve regression ─────────────────────────────────────────────────

interface GoldenCase {
    name: string;
    config: StrokePipelineConfig;
    raw: StrokePoint[];
    result: Omit<StrokePipelineResult, 'closed'>;
}

/**
 * Recorded by running the *pre-closure* pipeline (git HEAD before this change)
 * over three open strokes crossed with four stage configurations. Comparing the
 * serialized result field-for-field is the guard that closure support did not
 * perturb open-curve output by so much as a float.
 */
const GOLDEN: GoldenCase[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'open-curve-golden.json'), 'utf8'),
);

const GOLDEN_ENTRIES: [string, GoldenCase][] = GOLDEN.map((entry) => [entry.name, entry]);

describe("open-curve regression against pre-closure behaviour", () => {
    it("the golden fixture covers every stage and both fitters", () => {
        expect(GOLDEN.length).toBe(12);
        const fittings = new Set(GOLDEN.map((entry) => entry.config.fitting.variant));
        expect(fittings).toEqual(new Set(['pass-through', 'schneider', 'catmull-rom']));
    });

    it.each(GOLDEN_ENTRIES)("%s: identical with no closure field", (_name, entry) => {
        const result = runStrokePipeline(entry.raw, entry.config);
        expect(result.closed).toBe(false);
        expect(serializeOpenResult(result)).toBe(JSON.stringify(entry.result));
    });

    it.each(GOLDEN_ENTRIES)("%s: identical with closure explicitly pass-through", (_name, entry) => {
        const result = runStrokePipeline(entry.raw, { ...entry.config, closure: { variant: 'pass-through' } });
        expect(result.closed).toBe(false);
        expect(serializeOpenResult(result)).toBe(JSON.stringify(entry.result));
    });

    it.each(GOLDEN_ENTRIES)("%s: identical with closure armed but not triggered", (_name, entry) => {
        const gap = Math.hypot(
            entry.raw[entry.raw.length - 1].x - entry.raw[0].x,
            entry.raw[entry.raw.length - 1].y - entry.raw[0].y,
        );
        expect(gap).toBeGreaterThan(20);
        const result = runStrokePipeline(entry.raw, { ...entry.config, closure: CLOSE_AT_20 });
        expect(result.closed).toBe(false);
        expect(serializeOpenResult(result)).toBe(JSON.stringify(entry.result));
    });
});

// ── 2. Detection ─────────────────────────────────────────────────────────────

describe("closure detection", () => {
    /** A stroke whose last point sits exactly `gap` from its first. */
    function loopWithGap(gap: number): StrokePoint[] {
        const points = makePolygonStroke([[0, 0], [200, 0], [200, 200], [0, 200], [0, 0]], 10);
        points[points.length - 1] = { x: 0, y: gap, t: points[points.length - 1].t };
        return points;
    }

    it("pass-through never closes, however small the gap", () => {
        expect(isStrokeClosed(loopWithGap(0), { variant: 'pass-through' })).toBe(false);
        expect(runStrokePipeline(loopWithGap(0), { ...CLOSED_CONFIG, closure: { variant: 'pass-through' } }).closed)
            .toBe(false);
    });

    it("an omitted closure field behaves as pass-through", () => {
        const { closure: _closure, ...withoutClosure } = CLOSED_CONFIG;
        expect(runStrokePipeline(loopWithGap(0), withoutClosure).closed).toBe(false);
    });

    it("closes inside the threshold and stays open outside it", () => {
        expect(isStrokeClosed(loopWithGap(5), CLOSE_AT_20)).toBe(true);
        expect(isStrokeClosed(loopWithGap(19.999), CLOSE_AT_20)).toBe(true);
        expect(isStrokeClosed(loopWithGap(20.001), CLOSE_AT_20)).toBe(false);
        expect(isStrokeClosed(loopWithGap(40), CLOSE_AT_20)).toBe(false);
    });

    it("the threshold is inclusive: a gap of exactly the threshold is closed", () => {
        expect(isStrokeClosed(loopWithGap(20), CLOSE_AT_20)).toBe(true);
    });

    it("the pipeline reports the same verdict as the predicate", () => {
        for (const gap of [0, 5, 20, 20.001, 60]) {
            const stroke = loopWithGap(gap);
            expect(runStrokePipeline(stroke, CLOSED_CONFIG).closed).toBe(isStrokeClosed(stroke, CLOSE_AT_20));
        }
    });

    it("refuses strokes too short to bound a region", () => {
        const twoPoints: StrokePoint[] = [{ x: 0, y: 0, t: 0 }, { x: 1, y: 0, t: 1 }];
        const threePoints: StrokePoint[] = [...twoPoints, { x: 0, y: 1, t: 2 }];
        expect(isStrokeClosed([], CLOSE_AT_20)).toBe(false);
        expect(isStrokeClosed(twoPoints, CLOSE_AT_20)).toBe(false);
        expect(isStrokeClosed(threePoints, CLOSE_AT_20)).toBe(false);
        expect(runStrokePipeline(threePoints, CLOSED_CONFIG).closed).toBe(false);
    });

    it("exposes a defaults constant per variant, like every other stage", () => {
        expect(CLOSURE_VARIANT_DEFAULTS['pass-through']).toEqual({ variant: 'pass-through' });
        expect(CLOSURE_VARIANT_DEFAULTS['distance-threshold'].variant).toBe('distance-threshold');
    });
});

// ── 3. Exact closure ─────────────────────────────────────────────────────────

describe("exact closure of the fitted chain", () => {
    const fittings: StrokePipelineConfig['fitting'][] = [
        { variant: 'schneider', errorTolerance: 4 },
        { variant: 'catmull-rom', alpha: 0.5 },
    ];

    it.each(fittings.map((fitting) => [fitting.variant, fitting] as const))(
        "%s: the last endpoint is strictly equal to the first start point",
        (_variant, fitting) => {
            for (const stroke of [CIRCLE_LOOP, SQUARE_LOOP, CHEVRON_LOOP, BEAN_LOOP]) {
                const result = runStrokePipeline(stroke, { ...CLOSED_CONFIG, fitting });
                expect(result.closed).toBe(true);
                const segments = result.fit!.segments;
                const start = segments[0].p0;
                const end = segments[segments.length - 1].p3;
                // Strict equality, not toBeCloseTo: a downstream polygon consumer
                // comparing with an absolute epsilon must see no sliver at all.
                expect(end.x).toBe(start.x);
                expect(end.y).toBe(start.y);
                expect(end.x - start.x === 0 && end.y - start.y === 0).toBe(true);
            }
        },
    );

    it("the closed point list ends exactly on its first point", () => {
        const result = runStrokePipeline(CIRCLE_LOOP, CLOSED_CONFIG);
        const points = result.corners.points;
        expect(points.length).toBe(CIRCLE_LOOP.length);
        expect(points[points.length - 1].x).toBe(points[0].x);
        expect(points[points.length - 1].y).toBe(points[0].y);
    });

    it("closure moves the seam sample no further than the threshold", () => {
        const nearlyClosed = makePolarLoop(49, 200, 200, () => 150).slice(0, 48);
        const result = runStrokePipeline(nearlyClosed, CLOSED_CONFIG);
        expect(result.closed).toBe(true);
        const beforeClosure = runStrokePipeline(nearlyClosed, { ...CLOSED_CONFIG, closure: { variant: 'pass-through' } });
        const moved = Math.hypot(
            result.corners.points[result.corners.points.length - 1].x - beforeClosure.corners.points[beforeClosure.corners.points.length - 1].x,
            result.corners.points[result.corners.points.length - 1].y - beforeClosure.corners.points[beforeClosure.corners.points.length - 1].y,
        );
        expect(moved).toBeLessThanOrEqual(20);
    });

    it("an open stroke's chain is left with its ends apart", () => {
        const openArc = makeStroke(40, (i) => ({ x: 150 * Math.cos(i / 14), y: 150 * Math.sin(i / 14) }));
        const result = runStrokePipeline(openArc, CLOSED_CONFIG);
        expect(result.closed).toBe(false);
        const segments = result.fit!.segments;
        const start = segments[0].p0;
        const end = segments[segments.length - 1].p3;
        expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeGreaterThan(20);
    });
});

// ── 4. Tangent continuity across the seam ────────────────────────────────────

describe("tangent continuity across the seam", () => {
    it("a non-corner seam does not crease (schneider)", () => {
        const result = runStrokePipeline(CIRCLE_LOOP, CLOSED_CONFIG);
        expect(result.closed).toBe(true);
        expect(seamCreaseDeg(result.fit!)).toBeLessThan(CONTINUOUS_TOLERANCE_DEG);
    });

    it("a non-corner seam does not crease (catmull-rom)", () => {
        const result = runStrokePipeline(CIRCLE_LOOP, {
            ...CLOSED_CONFIG,
            fitting: { variant: 'catmull-rom', alpha: 0.5 },
        });
        expect(result.closed).toBe(true);
        expect(seamCreaseDeg(result.fit!)).toBeLessThan(CONTINUOUS_TOLERANCE_DEG);
    });

    it("the seam is no worse than an interior join of the same curve", () => {
        const result = runStrokePipeline(CIRCLE_LOOP, CLOSED_CONFIG);
        const segments = result.fit!.segments;
        expect(segments.length).toBeGreaterThan(1);
        const interiorWorst = Math.max(
            ...segments.slice(0, -1).map((segment, i) => {
                const incoming = tangentAt(segment, 1);
                const outgoing = tangentAt(segments[i + 1], 0);
                const dot = Math.min(1, Math.max(-1, incoming.x * outgoing.x + incoming.y * outgoing.y));
                return (Math.acos(dot) * 180) / Math.PI;
            }),
        );
        expect(seamCreaseDeg(result.fit!)).toBeLessThanOrEqual(interiorWorst + 1e-9);
    });

    it("a seam on a detected corner still creases — the test discriminates", () => {
        // Same config, same closure; only the stroke changes. The square's seam
        // sits on its 90-degree corner, so the crease must survive.
        const square = runStrokePipeline(SQUARE_LOOP, { ...CLOSED_CONFIG, smoothing: { variant: 'pass-through' } });
        expect(square.closed).toBe(true);
        expect(seamCreaseDeg(square.fit!)).toBeGreaterThan(45);
        expect(seamCreaseDeg(square.fit!)).toBeCloseTo(90, 3);

        // …and the smooth stroke under the identical config does not crease.
        const circle = runStrokePipeline(CIRCLE_LOOP, { ...CLOSED_CONFIG, smoothing: { variant: 'pass-through' } });
        expect(seamCreaseDeg(circle.fit!)).toBeLessThan(CONTINUOUS_TOLERANCE_DEG);
    });

    it("raising the corner threshold above the seam angle removes the crease", () => {
        const creasing = runStrokePipeline(SQUARE_LOOP, {
            ...CLOSED_CONFIG,
            smoothing: { variant: 'pass-through' },
            cornerDetection: { variant: 'angle-threshold', thresholdDeg: 60, span: 2 },
        });
        const rounding = runStrokePipeline(SQUARE_LOOP, {
            ...CLOSED_CONFIG,
            smoothing: { variant: 'pass-through' },
            cornerDetection: { variant: 'angle-threshold', thresholdDeg: 120, span: 2 },
        });
        expect(seamCreaseDeg(creasing.fit!)).toBeGreaterThan(45);
        expect(seamCreaseDeg(rounding.fit!)).toBeLessThan(CONTINUOUS_TOLERANCE_DEG);
    });

    it("closure never creases a seam when corner detection is off", () => {
        for (const stroke of [CIRCLE_LOOP, SQUARE_LOOP, CHEVRON_LOOP, BEAN_LOOP, BLOB_LOOP]) {
            const result = runStrokePipeline(stroke, {
                ...CLOSED_CONFIG,
                cornerDetection: { variant: 'pass-through' },
            });
            expect(result.closed).toBe(true);
            expect(seamCreaseDeg(result.fit!)).toBeLessThan(CONTINUOUS_TOLERANCE_DEG);
        }
    });
});

// ── 5. Integration: closed stroke → polygon → straight skeleton ──────────────

describe("closed strokes drive solveSkeleton to a complete skeleton", () => {
    const SHAPES: [string, StrokePoint[]][] = [
        ['circle', CIRCLE_LOOP],
        ['square (seam on a corner)', SQUARE_LOOP],
        ['chevron (non-convex)', CHEVRON_LOOP],
        ['bean (non-convex)', BEAN_LOOP],
        ['blob (non-convex)', BLOB_LOOP],
    ];

    it("the chevron and blob polygons really are non-convex", () => {
        for (const stroke of [CHEVRON_LOOP, BLOB_LOOP]) {
            const fit = runStrokePipeline(stroke, CLOSED_CONFIG).fit!;
            expect(reflexVertexCount(sampleClosedChain(fit, 4), 10)).toBeGreaterThanOrEqual(1);
        }
    });

    it.each(SHAPES)("%s: skeleton completes with no unresolved edges", (_name, stroke) => {
        const result = runStrokePipeline(stroke, CLOSED_CONFIG);
        expect(result.closed).toBe(true);
        expect(result.fit).not.toBeNull();

        for (const perSegment of [4, 6]) {
            const polygon = sampleClosedChain(result.fit!, perSegment);
            expect(polygon.length).toBeGreaterThanOrEqual(6);
            // No duplicate consecutive vertices, and the loop closes with no sliver edge.
            for (let i = 0; i < polygon.length; i++) {
                const next = polygon[(i + 1) % polygon.length];
                expect(Math.hypot(next.x - polygon[i].x, next.y - polygon[i].y)).toBeGreaterThan(1e-9);
            }

            const skeleton = solveSkeleton(polygon);
            expect(skeleton.diagnostics.filter((d) => d.kind === 'unresolved-edges')).toEqual([]);
            expect(skeleton.diagnostics.filter((d) => d.kind === 'step-failure')).toEqual([]);
            expect(skeleton.complete).toBe(true);
        }
    });
});
