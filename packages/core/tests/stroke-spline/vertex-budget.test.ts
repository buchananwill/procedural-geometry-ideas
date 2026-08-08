import {
    DEFAULT_VERTEX_BUDGET,
    flattenSpline,
    reduceToVertexBudget,
    runStrokePipeline,
    solveSkeleton,
    strokeToBudgetedPolygon,
} from '@proc-geo/core';
import type { StrokePipelineConfig, StrokePoint, Vector2 } from '@proc-geo/core';

// ── Independent error measurement ────────────────────────────────────────────
// Deliberately written from scratch rather than imported, so the assertion that
// `maxError` is truthful is not simply the implementation agreeing with itself.

function pointToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSquared = abx * abx + aby * aby;
    if (lengthSquared === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSquared;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    const cx = a.x + abx * t;
    const cy = a.y + aby * t;
    return Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
}

function measuredMaxError(original: Vector2[], reduced: Vector2[]): number {
    let worst = 0;
    for (const p of original) {
        let nearest = Number.POSITIVE_INFINITY;
        for (let i = 0; i + 1 < reduced.length; i++) {
            const d = pointToSegment(p, reduced[i], reduced[i + 1]);
            if (d < nearest) nearest = d;
        }
        if (nearest > worst) worst = nearest;
    }
    return worst;
}

function nearestDistanceTo(target: Vector2, candidates: Vector2[]): number {
    return candidates.reduce(
        (best, c) => Math.min(best, Math.sqrt((c.x - target.x) ** 2 + (c.y - target.y) ** 2)),
        Number.POSITIVE_INFINITY,
    );
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** `count` points from `a` inclusive to `b` exclusive. */
function sampleSegment(a: Vector2, b: Vector2, count: number): Vector2[] {
    const out: Vector2[] = [];
    for (let i = 0; i < count; i++) {
        const t = i / count;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return out;
}

const NOTCH_CENTRE: Vector2 = { x: 400, y: 0 };
const NOTCH_RADIUS = 200;
const NOTCH_SAMPLES = 400;

/**
 * A rectangle whose bottom edge carries a densely sampled semicircular notch.
 * Five unambiguous 90-degree corners; ~400 of its ~560 vertices lie on a smooth
 * arc that carries almost no shape information per vertex.
 */
const NOTCHED_CORNERS: Vector2[] = [
    { x: 200, y: 0 },
    { x: 600, y: 0 },
    { x: 800, y: 0 },
    { x: 800, y: 300 },
    { x: 0, y: 300 },
];

function notchedRectangle(): Vector2[] {
    const arc: Vector2[] = [];
    for (let i = 0; i < NOTCH_SAMPLES; i++) {
        const theta = Math.PI - (i / NOTCH_SAMPLES) * Math.PI;
        arc.push({
            x: NOTCH_CENTRE.x + NOTCH_RADIUS * Math.cos(theta),
            y: NOTCH_CENTRE.y - NOTCH_RADIUS * Math.sin(theta),
        });
    }
    return [
        ...sampleSegment({ x: 0, y: 0 }, { x: 200, y: 0 }, 30),
        ...arc,
        ...sampleSegment({ x: 600, y: 0 }, { x: 800, y: 0 }, 30),
        ...sampleSegment({ x: 800, y: 0 }, { x: 800, y: 300 }, 40),
        ...sampleSegment({ x: 800, y: 300 }, { x: 0, y: 300 }, 60),
        ...sampleSegment({ x: 0, y: 300 }, { x: 0, y: 0 }, 40),
        { x: 0, y: 0 },
    ];
}

/** True for a vertex strictly inside the smooth notch arc (its two ends are corners). */
function isOnNotchArc(v: Vector2): boolean {
    const r = Math.sqrt((v.x - NOTCH_CENTRE.x) ** 2 + (v.y - NOTCH_CENTRE.y) ** 2);
    return v.y < -1 && Math.abs(r - NOTCH_RADIUS) < 1e-6;
}

function wobblyClosedStroke(sampleCount: number): StrokePoint[] {
    const points: StrokePoint[] = [];
    for (let i = 0; i < sampleCount; i++) {
        const a = (i / sampleCount) * Math.PI * 2;
        const r = 300 + 55 * Math.sin(3 * a + 0.4) + 28 * Math.sin(7 * a + 1.1) + 12 * Math.sin(11 * a);
        points.push({ x: 500 + r * Math.cos(a), y: 500 + r * Math.sin(a), t: i * 8 });
    }
    points.push({ ...points[0], t: sampleCount * 8 });
    return points;
}

/**
 * The player-selectable combination that blows the vertex count up: `chaikin`
 * smoothing with `pass-through` simplification, fitted and closed.
 */
const DENSE_PIPELINE_CONFIG: StrokePipelineConfig = {
    smoothing: { variant: 'chaikin', iterations: 3 },
    simplification: { variant: 'pass-through' },
    cornerDetection: { variant: 'pass-through' },
    fitting: { variant: 'schneider', errorTolerance: 4 },
    closure: { variant: 'distance-threshold', threshold: 20 },
};

function denseStrokePolygon(): Vector2[] {
    const result = runStrokePipeline(wobblyClosedStroke(90), DENSE_PIPELINE_CONFIG);
    expect(result.closed).toBe(true);
    expect(result.fit).not.toBeNull();
    const flat = flattenSpline(result.fit!);
    // Drop the seam duplicate: a repeated vertex is a zero-length polygon edge.
    return flat.slice(0, flat.length - 1);
}

function subsample(source: Vector2[], n: number): Vector2[] {
    const out: Vector2[] = [];
    for (let i = 0; i < n; i++) out.push(source[Math.round((i * source.length) / n) % source.length]);
    return out;
}

// ── 1. Budget respected ──────────────────────────────────────────────────────

describe('reduceToVertexBudget — budget is respected', () => {
    const inputs: [string, Vector2[]][] = [
        ['notched rectangle', notchedRectangle()],
        ['dense stroke polygon', denseStrokePolygon()],
        ['square', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]],
    ];
    const budgets = [3, 4, 8, 16, 32, 64, 128, 1024];

    for (const [name, input] of inputs) {
        for (const budget of budgets) {
            it(`${name} @ budget ${budget}`, () => {
                const result = reduceToVertexBudget(input, budget);
                expect(result.achieved).toBeLessThanOrEqual(budget);
                expect(result.achieved).toBe(result.vertices.length);
                expect(result.maxError).toBeGreaterThanOrEqual(0);
                expect(Number.isFinite(result.maxError)).toBe(true);
            });
        }
    }

    it('leaves an already-within-budget input untouched', () => {
        const input = notchedRectangle();
        const result = reduceToVertexBudget(input, input.length + 50);
        expect(result.reduced).toBe(false);
        expect(result.achieved).toBe(input.length);
        expect(result.maxError).toBe(0);
        expect(result.vertices).toEqual(input);
    });

    it('reports reduced: true only when vertices were actually removed', () => {
        const input = notchedRectangle();
        expect(reduceToVertexBudget(input, 32).reduced).toBe(true);
        expect(reduceToVertexBudget(input, input.length).reduced).toBe(false);
    });

    it('never aliases the caller’s array or vertex objects', () => {
        const input: Vector2[] = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
        const result = reduceToVertexBudget(input, 8);
        expect(result.vertices).not.toBe(input);
        expect(result.vertices[0]).not.toBe(input[0]);
        result.vertices[0].x = 999;
        expect(input[0].x).toBe(0);
    });

    it('lands close to the budget rather than far under it', () => {
        // The search takes the *smallest* tolerance that meets the budget, so the
        // result should be near the ceiling, not a token handful of vertices.
        const input = denseStrokePolygon();
        for (const budget of [16, 32, 64]) {
            const result = reduceToVertexBudget(input, budget);
            expect(result.achieved).toBeGreaterThan(budget - 4);
        }
    });
});

// ── 2. maxError is truthful ──────────────────────────────────────────────────

describe('reduceToVertexBudget — maxError is truthful', () => {
    const cases: [string, Vector2[]][] = [
        ['notched rectangle', notchedRectangle()],
        ['dense stroke polygon', denseStrokePolygon()],
    ];

    for (const [name, input] of cases) {
        for (const budget of [4, 8, 16, 32, 64, 128]) {
            it(`${name} @ budget ${budget} matches an independent measurement`, () => {
                const result = reduceToVertexBudget(input, budget);
                const independent = measuredMaxError(input, result.vertices);
                expect(result.maxError).toBeCloseTo(independent, 9);
            });
        }
    }

    it('error falls monotonically as the budget rises', () => {
        const input = denseStrokePolygon();
        const errors = [4, 8, 16, 32, 64, 128].map((b) => reduceToVertexBudget(input, b).maxError);
        for (let i = 1; i < errors.length; i++) {
            expect(errors[i]).toBeLessThanOrEqual(errors[i - 1]);
        }
    });

    it('maxError is in input units, so scaling the input scales the error', () => {
        const input = notchedRectangle();
        const scaled = input.map((v) => ({ x: v.x * 10, y: v.y * 10 }));
        const base = reduceToVertexBudget(input, 24).maxError;
        const large = reduceToVertexBudget(scaled, 24).maxError;
        expect(large).toBeCloseTo(base * 10, 6);
    });
});

// ── 3. Corner preservation ───────────────────────────────────────────────────

describe('reduceToVertexBudget — corners survive, smooth arcs are thinned', () => {
    const CORNER_TOLERANCE = 5;

    for (const budget of [16, 24, 48]) {
        it(`retains every sharp corner @ budget ${budget}`, () => {
            const input = notchedRectangle();
            const result = reduceToVertexBudget(input, budget);
            for (const corner of NOTCHED_CORNERS) {
                const distance = nearestDistanceTo(corner, result.vertices);
                expect(distance).toBeLessThanOrEqual(CORNER_TOLERANCE);
            }
        });
    }

    it('thins the dense arc while keeping it represented', () => {
        const input = notchedRectangle();
        const arcInputCount = input.filter(isOnNotchArc).length;
        expect(arcInputCount).toBeGreaterThan(300);

        const result = reduceToVertexBudget(input, 24);
        const arcKept = result.vertices.filter(isOnNotchArc).length;
        expect(arcKept).toBeGreaterThan(0);
        expect(arcKept).toBeLessThan(20);
        // The arc gave up over 95% of its vertices while every corner was kept.
        expect(arcKept / arcInputCount).toBeLessThan(0.05);
    });

    it('leaves non-uniform spacing — dense near shape, sparse on straights', () => {
        const input = notchedRectangle();
        const kept = reduceToVertexBudget(input, 24).vertices;
        const gaps: number[] = [];
        for (let i = 1; i < kept.length; i++) {
            gaps.push(Math.sqrt((kept[i].x - kept[i - 1].x) ** 2 + (kept[i].y - kept[i - 1].y) ** 2));
        }
        const longest = Math.max(...gaps);
        const shortest = Math.min(...gaps);
        // Uniform resampling would give a ratio near 1; RDP should be far from it.
        expect(longest / shortest).toBeGreaterThan(3);
    });
});

// ── 4. Determinism ───────────────────────────────────────────────────────────

describe('reduceToVertexBudget — determinism', () => {
    it('gives byte-identical output for the same input and budget', () => {
        const input = denseStrokePolygon();
        for (const budget of [7, 24, 64]) {
            const first = reduceToVertexBudget(input, budget);
            const second = reduceToVertexBudget(input, budget);
            expect(second).toEqual(first);
            expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        }
    });

    it('is unaffected by an earlier call at a different budget', () => {
        const input = notchedRectangle();
        const direct = reduceToVertexBudget(input, 32);
        reduceToVertexBudget(input, 5);
        reduceToVertexBudget(input, 200);
        expect(reduceToVertexBudget(input, 32)).toEqual(direct);
    });

    it('does not mutate its input', () => {
        const input = notchedRectangle();
        const snapshot = JSON.stringify(input);
        reduceToVertexBudget(input, 12);
        expect(JSON.stringify(input)).toBe(snapshot);
    });
});

// ── 5. Degenerate inputs ─────────────────────────────────────────────────────

describe('reduceToVertexBudget — degenerate inputs', () => {
    it('returns an empty input unchanged', () => {
        const result = reduceToVertexBudget([], 8);
        expect(result).toEqual({ vertices: [], achieved: 0, maxError: 0, reduced: false });
    });

    it('returns a single vertex unchanged', () => {
        const result = reduceToVertexBudget([{ x: 3, y: 4 }], 8);
        expect(result.vertices).toEqual([{ x: 3, y: 4 }]);
        expect(result.achieved).toBe(1);
        expect(result.reduced).toBe(false);
    });

    it('returns two vertices unchanged, even at the minimum budget', () => {
        const input: Vector2[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
        const result = reduceToVertexBudget(input, 3);
        expect(result.vertices).toEqual(input);
        expect(result.achieved).toBe(2);
        expect(result.reduced).toBe(false);
    });

    it('rejects a budget below three', () => {
        const input = notchedRectangle();
        for (const budget of [2, 1, 0, -5]) {
            expect(() => reduceToVertexBudget(input, budget)).toThrow(RangeError);
        }
        // Rejected regardless of how small the input is — a budget below three
        // is a caller error, not a property of the data.
        expect(() => reduceToVertexBudget([], 2)).toThrow(RangeError);
        expect(() => reduceToVertexBudget([{ x: 0, y: 0 }], 0)).toThrow(RangeError);
    });

    it('rejects a non-integer or non-finite budget', () => {
        const input = notchedRectangle();
        for (const budget of [3.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(() => reduceToVertexBudget(input, budget)).toThrow(RangeError);
        }
    });

    it('accepts a budget exactly equal to the input size and changes nothing', () => {
        const input = notchedRectangle();
        const result = reduceToVertexBudget(input, input.length);
        expect(result.reduced).toBe(false);
        expect(result.achieved).toBe(input.length);
        expect(result.vertices).toEqual(input);
    });

    it('reduces to the minimum budget of three', () => {
        const result = reduceToVertexBudget(notchedRectangle(), 3);
        expect(result.achieved).toBeLessThanOrEqual(3);
        expect(result.achieved).toBeGreaterThanOrEqual(2);
        expect(result.reduced).toBe(true);
    });

    it('handles a fully collinear input', () => {
        const input = sampleSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 200);
        const result = reduceToVertexBudget(input, 8);
        expect(result.achieved).toBe(2);
        expect(result.maxError).toBeCloseTo(0, 9);
    });

    it('handles an input of coincident vertices', () => {
        const input: Vector2[] = new Array(50).fill(null).map(() => ({ x: 7, y: 7 }));
        const result = reduceToVertexBudget(input, 4);
        expect(result.achieved).toBeLessThanOrEqual(4);
        expect(result.maxError).toBeCloseTo(0, 9);
    });
});

// ── strokeToBudgetedPolygon ──────────────────────────────────────────────────

describe('strokeToBudgetedPolygon', () => {
    it('drops the seam duplicate of a closed pipeline result', () => {
        const result = runStrokePipeline(wobblyClosedStroke(90), DENSE_PIPELINE_CONFIG);
        const budgeted = strokeToBudgetedPolygon(result, 4096);
        expect(budgeted.reduced).toBe(false);
        const first = budgeted.vertices[0];
        const last = budgeted.vertices[budgeted.vertices.length - 1];
        expect(first.x === last.x && first.y === last.y).toBe(false);
    });

    it('applies the budget to the flattened spline', () => {
        const result = runStrokePipeline(wobblyClosedStroke(90), DENSE_PIPELINE_CONFIG);
        const budgeted = strokeToBudgetedPolygon(result, DEFAULT_VERTEX_BUDGET);
        expect(budgeted.achieved).toBeLessThanOrEqual(DEFAULT_VERTEX_BUDGET);
        expect(budgeted.reduced).toBe(true);
        expect(budgeted.maxError).toBeGreaterThan(0);
    });

    it('falls back to the corner polyline when fitting is pass-through', () => {
        const result = runStrokePipeline(wobblyClosedStroke(90), {
            ...DENSE_PIPELINE_CONFIG,
            fitting: { variant: 'pass-through' },
        });
        expect(result.fit).toBeNull();
        const budgeted = strokeToBudgetedPolygon(result, 32);
        expect(budgeted.achieved).toBeLessThanOrEqual(32);
        expect(budgeted.achieved).toBeGreaterThan(3);
    });
});

// ── 6. End to end: budgeted polygon solves, and solves far faster ────────────

describe('end to end — budgeted stroke polygon into solveSkeleton', () => {
    it('solves completely and substantially faster than the unbudgeted polygon', () => {
        const dense = denseStrokePolygon();
        expect(dense.length).toBeGreaterThan(500);

        const budgeted = reduceToVertexBudget(dense, DEFAULT_VERTEX_BUDGET);
        expect(budgeted.reduced).toBe(true);
        expect(budgeted.achieved).toBeLessThanOrEqual(DEFAULT_VERTEX_BUDGET);

        const afterStart = Date.now();
        const afterSolve = solveSkeleton(budgeted.vertices);
        const afterMs = Date.now() - afterStart;
        expect(afterSolve.complete).toBe(true);

        // The full 576-vertex polygon takes minutes at roughly cubic cost, which
        // is the whole point of the budget and far too slow to sit in a suite.
        // Time a 106-vertex version instead — already the smallest count that is
        // uncomfortable interactively — and compare against it.
        const baseline = subsample(dense, 106);
        const beforeStart = Date.now();
        const beforeSolve = solveSkeleton(baseline);
        const beforeMs = Date.now() - beforeStart;
        expect(beforeSolve.complete).toBe(true);

        // eslint-disable-next-line no-console
        console.log(
            `[vertex-budget] 106 vertices: ${beforeMs} ms; ` +
                `${budgeted.achieved} vertices (maxError ${budgeted.maxError.toFixed(2)}): ${afterMs} ms`,
        );

        expect(afterMs * 2).toBeLessThan(beforeMs);
    }, 300000);

    it('the reduced polygon still resembles the stroke it came from', () => {
        const dense = denseStrokePolygon();
        const budgeted = reduceToVertexBudget(dense, DEFAULT_VERTEX_BUDGET);
        // The blob has a radius around 300; a few units of deviation is a
        // sub-percent shape change, which is what makes the budget affordable.
        expect(budgeted.maxError).toBeLessThan(10);
    });
});
