import {
    hasRedundantSeam,
    reduceToVertexBudget,
    runStrokePipeline,
    solveSkeleton,
    straightenToVertexBudget,
    strokeToBudgetedPolygon,
    strokeToRing,
    strokeToStraightenedPolygon,
} from '@proc-geo/core';
import type { StrokePipelineConfig, StrokePoint, Vector2 } from '@proc-geo/core';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SQUARE: Vector2[] = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 400 },
    { x: 0, y: 400 },
];

/**
 * How much of each edge is left unsampled at either end, as a fraction of it.
 *
 * This is the fixture's whole point. A square whose corner samples are exact is
 * not the problem — RDP simply picks them and wins. The problem is a shape whose
 * corner is *not in the input*, which is what the Schneider fit produces from a
 * hand-drawn corner: it rounds it, so the nearest available point is a shoulder
 * some distance down the edge. Cutting a gap at each corner reproduces that
 * without needing the whole pipeline, and puts the true corner 24 px away from
 * anything the reduction is allowed to choose.
 */
const CORNER_GAP = 0.06;

/**
 * A closed square drawn with perpendicular noise on every edge and no sample at
 * any corner.
 */
function noisySquare(perEdge: number, noise: number, seed: number): Vector2[] {
    const random = makeRandom(seed);
    const out: Vector2[] = [];
    for (let c = 0; c < SQUARE.length; c++) {
        const a = SQUARE[c];
        const b = SQUARE[(c + 1) % SQUARE.length];
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const length = Math.hypot(nx, ny);
        for (let i = 0; i < perEdge; i++) {
            const t = CORNER_GAP + (i / (perEdge - 1)) * (1 - 2 * CORNER_GAP);
            const offset = (random() - 0.5) * noise;
            out.push({
                x: a.x + (b.x - a.x) * t + (nx / length) * offset,
                y: a.y + (b.y - a.y) * t + (ny / length) * offset,
            });
        }
    }
    return out;
}

function nearestDistance(target: Vector2, candidates: Vector2[]): number {
    return candidates.reduce((best, c) => Math.min(best, Math.hypot(c.x - target.x, c.y - target.y)), Infinity);
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

const PIPELINE: StrokePipelineConfig = {
    smoothing: { variant: 'moving-average', windowSize: 5 },
    simplification: { variant: 'pass-through' },
    cornerDetection: { variant: 'pass-through' },
    fitting: { variant: 'schneider', errorTolerance: 4 },
    closure: { variant: 'distance-threshold', threshold: 30 },
};

// ── The primitive ────────────────────────────────────────────────────────────

describe('straightenToVertexBudget — contract', () => {
    const square = noisySquare(40, 8, 31337);

    it('honours the budget', () => {
        for (const budget of [4, 6, 8, 16, 32]) {
            expect(straightenToVertexBudget(square, budget, { closed: true }).achieved).toBeLessThanOrEqual(budget);
        }
    });

    it('rejects a budget below three, exactly as the reduction does', () => {
        for (const budget of [2, 0, -1, 3.5, Number.NaN]) {
            expect(() => straightenToVertexBudget(square, budget)).toThrow(RangeError);
        }
    });

    it('returns an already-within-budget input untouched, and says so', () => {
        const result = straightenToVertexBudget(square, square.length + 10, { closed: true });
        expect(result.reduced).toBe(false);
        expect(result.straightened).toBe(0);
        expect(result.vertices).toEqual(square);
    });

    it('never aliases the caller’s array or vertex objects', () => {
        const result = straightenToVertexBudget(square, 8, { closed: true });
        expect(result.vertices).not.toBe(square);
        result.vertices[0].x = 999;
        expect(square[0].x).not.toBe(999);
    });

    it('does not mutate its input', () => {
        const snapshot = JSON.stringify(square);
        straightenToVertexBudget(square, 6, { closed: true });
        expect(JSON.stringify(square)).toBe(snapshot);
    });

    it('is deterministic', () => {
        const first = straightenToVertexBudget(square, 8, { closed: true });
        const second = straightenToVertexBudget(square, 8, { closed: true });
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });

    it('leaves the plain reduction alone — same input, same output as before', () => {
        const plain = reduceToVertexBudget(square, 8);
        expect(plain.achieved).toBeLessThanOrEqual(8);
        // The straighten path must not have reached into the primitive it builds on.
        expect(reduceToVertexBudget(square, 8)).toEqual(plain);
    });

    it('handles degenerate inputs without throwing', () => {
        expect(straightenToVertexBudget([], 8).achieved).toBe(0);
        expect(straightenToVertexBudget([{ x: 1, y: 2 }], 8).achieved).toBe(1);
        const coincident: Vector2[] = new Array(50).fill(null).map(() => ({ x: 7, y: 7 }));
        expect(straightenToVertexBudget(coincident, 4).achieved).toBeLessThanOrEqual(4);
    });

    it('ignores a sample set that is not index-matched to its anchors', () => {
        const result = straightenToVertexBudget(square, 8, {
            closed: true,
            samples: square,
            anchors: square.slice(0, 5),
        });
        expect(result.straightened).toBe(0);
    });
});

describe('straightenToVertexBudget — recovers the corners of a noisy square', () => {
    const square = noisySquare(40, 8, 31337);

    function worstCornerError(vertices: Vector2[]): number {
        return Math.max(...SQUARE.map((c) => nearestDistance(c, vertices)));
    }

    for (const budget of [6, 8, 12, 16, 24]) {
        it(`is never further from a corner than the plain reduction @ budget ${String(budget)}`, () => {
            const faithful = reduceToVertexBudget(square, budget);
            const straight = straightenToVertexBudget(square, budget, { closed: true });
            expect(worstCornerError(straight.vertices)).toBeLessThanOrEqual(
                worstCornerError(faithful.vertices) + 1e-9,
            );
        });
    }

    for (const budget of [6, 8]) {
        it(`halves the worst corner error @ budget ${String(budget)}`, () => {
            // The tight budgets are where the reduction has no vertex to spare
            // near a corner and the recovered crossing is worth the most: measured
            // at 24.2 px down to 13.7 px, on a corner the input never sampled.
            const faithful = worstCornerError(reduceToVertexBudget(square, budget).vertices);
            const straight = worstCornerError(
                straightenToVertexBudget(square, budget, { closed: true }).vertices,
            );
            expect(straight).toBeLessThan(faithful * 0.6);
        });
    }

    it('puts its vertices on the true edges rather than on the noise', () => {
        const straight = straightenToVertexBudget(square, 12, { closed: true });
        for (const v of straight.vertices) {
            const offEdge = Math.min(Math.abs(v.y), Math.abs(v.y - 400), Math.abs(v.x), Math.abs(v.x - 400));
            // The noise is +/- 4 px; anything the reduction picked could be that
            // far out, and everything straightening produces should be well inside it.
            expect(offEdge).toBeLessThan(4);
        }
    });

    it('is measurably straighter than the reduction it started from', () => {
        const faithful = reduceToVertexBudget(square, 12);
        const straight = straightenToVertexBudget(square, 12, { closed: true });
        const meanOffEdge = (vertices: Vector2[]) =>
            vertices.reduce(
                (sum, v) =>
                    sum + Math.min(Math.abs(v.y), Math.abs(v.y - 400), Math.abs(v.x), Math.abs(v.x - 400)),
                0,
            ) / vertices.length;
        expect(meanOffEdge(straight.vertices)).toBeLessThan(meanOffEdge(faithful.vertices));
    });

    it('reports how many vertices it actually moved', () => {
        const straight = straightenToVertexBudget(square, 12, { closed: true });
        expect(straight.straightened).toBeGreaterThan(0);
        expect(straight.straightened).toBeLessThanOrEqual(straight.achieved + 1);
    });
});

// ── The stroke wrapper ───────────────────────────────────────────────────────

describe('strokeToStraightenedPolygon', () => {
    const result = runStrokePipeline(wobblyClosedStroke(90), PIPELINE);

    it('matches the faithful mode’s budget discipline', () => {
        for (const budget of [8, 12, 16, 24, 64]) {
            const straight = strokeToStraightenedPolygon(result, budget);
            expect(straight.achieved).toBeLessThanOrEqual(budget);
            expect(straight.achieved).toBeGreaterThanOrEqual(3);
        }
    });

    it('reports maxError measured against the stroke, not asserted', () => {
        const straight = strokeToStraightenedPolygon(result, 16);
        const ring = strokeToRing(result);
        const closedPolygon = [...straight.vertices, straight.vertices[0]];
        let worst = 0;
        for (const p of ring) {
            let nearest = Infinity;
            for (let i = 1; i < closedPolygon.length; i++) {
                const a = closedPolygon[i - 1];
                const b = closedPolygon[i];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const lengthSquared = dx * dx + dy * dy;
                const t =
                    lengthSquared === 0
                        ? 0
                        : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
                nearest = Math.min(nearest, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
            }
            worst = Math.max(worst, nearest);
        }
        expect(straight.maxError).toBeCloseTo(worst, 9);
    });

    it('produces a polygon the skeleton solver completes', () => {
        for (const budget of [8, 12, 16, 24]) {
            expect(solveSkeleton(strokeToStraightenedPolygon(result, budget).vertices).complete).toBe(true);
        }
    });

    it('falls back gracefully when fitting was pass-through', () => {
        const unfitted = runStrokePipeline(wobblyClosedStroke(90), {
            ...PIPELINE,
            fitting: { variant: 'pass-through' },
        });
        expect(unfitted.fit).toBeNull();
        const straight = strokeToStraightenedPolygon(unfitted, 16);
        expect(straight.achieved).toBeLessThanOrEqual(16);
        expect(straight.achieved).toBeGreaterThan(3);
    });
});

// ── The seam ─────────────────────────────────────────────────────────────────

describe('closed-ring seam is not paid for twice', () => {
    const result = runStrokePipeline(wobblyClosedStroke(90), PIPELINE);

    it('the ring really does end a hair short of where it started', () => {
        const ring = strokeToRing(result);
        const gap = Math.hypot(ring[ring.length - 1].x - ring[0].x, ring[ring.length - 1].y - ring[0].y);
        expect(gap).toBeGreaterThan(0);
        expect(hasRedundantSeam(ring, true)).toBe(true);
    });

    it('an open ring is never seam-merged, however close its ends', () => {
        const ring = strokeToRing(result);
        expect(hasRedundantSeam(ring, false)).toBe(false);
    });

    for (const budget of [8, 12, 16, 24]) {
        it(`neither mode spends a vertex on the seam @ budget ${String(budget)}`, () => {
            for (const budgeted of [
                strokeToBudgetedPolygon(result, budget),
                strokeToStraightenedPolygon(result, budget),
            ]) {
                const first = budgeted.vertices[0];
                const last = budgeted.vertices[budgeted.vertices.length - 1];
                const gap = Math.hypot(last.x - first.x, last.y - first.y);
                const diagonal = Math.hypot(1000, 1000);
                expect(gap).toBeGreaterThan(0.005 * diagonal);
            }
        });
    }

    it('the merge buys a vertex back rather than shrinking the polygon', () => {
        // Both ends were pinned before the fix, so the budget bought one visible
        // vertex fewer than it paid for.
        for (const budget of [8, 12, 16]) {
            expect(strokeToBudgetedPolygon(result, budget).achieved).toBe(budget);
        }
    });
});
