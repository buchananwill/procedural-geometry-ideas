import {
    runStrokePipeline,
    solveSkeleton,
    strokeToBudgetedPolygon,
    strokeToStraightenedPolygon,
} from '@proc-geo/core';
import type { StrokePipelineConfig, StrokePoint, Vector2 } from '@proc-geo/core';

/**
 * The measurement that decides whether the straighten mode is worth having.
 *
 * Both modes are run on the same synthetic hand-drawn strokes and scored against
 * the **ideal** shape the tremor was added to, not against the noisy stroke. A
 * mode that merely tracks the tremor faithfully scores badly here, which is the
 * point: the question is whether the reduction recovers the line the hand was
 * aiming for.
 */

// ── Deterministic tremor ─────────────────────────────────────────────────────

/** Mulberry32. Seeded so the table in the notes is reproducible run to run. */
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

/**
 * Per-axis tremor: a fast jitter plus a small, bounded wobble.
 *
 * Deliberately *not* a random walk. A walk drifts the whole stroke away from the
 * shape it is meant to be, and a drift is not tremor — no reduction can undo it,
 * so it would put a floor under the deviation-from-ideal metric and drown out the
 * corner error this measurement is about. A bounded sinusoidal wobble at an
 * irrational frequency, plus white jitter, keeps the hand's error zero-mean over
 * an edge, which is the assumption that makes least squares the right tool.
 */
function tremble(points: Vector2[], amplitude: number, seed: number): StrokePoint[] {
    const random = makeRandom(seed);
    const phaseX = random() * Math.PI * 2;
    const phaseY = random() * Math.PI * 2;
    return points.map((p, i) => ({
        x: p.x + Math.sin(i * 0.37 + phaseX) * amplitude * 0.5 + (random() - 0.5) * amplitude,
        y: p.y + Math.sin(i * 0.29 + phaseY) * amplitude * 0.5 + (random() - 0.5) * amplitude,
        t: i * 8,
    }));
}

// ── Ideal shapes ─────────────────────────────────────────────────────────────

function walkRing(corners: Vector2[], spacing: number): Vector2[] {
    const out: Vector2[] = [];
    for (let c = 0; c < corners.length; c++) {
        const a = corners[c];
        const b = corners[(c + 1) % corners.length];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.round(length / spacing));
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    out.push({ ...corners[0] });
    return out;
}

const RECTANGLE_CORNERS: Vector2[] = [
    { x: 150, y: 120 },
    { x: 640, y: 120 },
    { x: 640, y: 430 },
    { x: 150, y: 430 },
];

const PENTAGON_CORNERS: Vector2[] = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return { x: 400 + 250 * Math.cos(a), y: 300 + 250 * Math.sin(a) };
});

function circlePoints(radius: number, count: number): Vector2[] {
    const out: Vector2[] = [];
    for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        out.push({ x: 400 + radius * Math.cos(a), y: 300 + radius * Math.sin(a) });
    }
    out.push({ ...out[0] });
    return out;
}

function blobPoints(count: number): Vector2[] {
    const out: Vector2[] = [];
    for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const r = 240 + 45 * Math.sin(3 * a + 0.4) + 22 * Math.sin(7 * a + 1.1);
        out.push({ x: 400 + r * Math.cos(a), y: 300 + r * Math.sin(a) });
    }
    out.push({ ...out[0] });
    return out;
}

// ── Scoring against the ideal ────────────────────────────────────────────────

function pointToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSquared = abx * abx + aby * aby;
    if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSquared));
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/** Worst distance from any point of the ideal outline to the closed polygon `poly`. */
function maxDeviationFromIdeal(ideal: Vector2[], poly: Vector2[]): number {
    const closedPoly = [...poly, poly[0]];
    let worst = 0;
    for (const p of ideal) {
        let nearest = Number.POSITIVE_INFINITY;
        for (let i = 1; i < closedPoly.length; i++) {
            nearest = Math.min(nearest, pointToSegment(p, closedPoly[i - 1], closedPoly[i]));
        }
        worst = Math.max(worst, nearest);
    }
    return worst;
}

/** And the reverse: worst distance from any polygon vertex to the ideal outline. */
function maxVertexOffIdeal(ideal: Vector2[], poly: Vector2[]): number {
    let worst = 0;
    for (const v of poly) {
        let nearest = Number.POSITIVE_INFINITY;
        for (let i = 1; i < ideal.length; i++) {
            nearest = Math.min(nearest, pointToSegment(v, ideal[i - 1], ideal[i]));
        }
        worst = Math.max(worst, nearest);
    }
    return worst;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PIPELINE: StrokePipelineConfig = {
    smoothing: { variant: 'moving-average', windowSize: 5 },
    simplification: { variant: 'pass-through' },
    cornerDetection: { variant: 'pass-through' },
    fitting: { variant: 'schneider', errorTolerance: 4 },
    closure: { variant: 'distance-threshold', threshold: 30 },
};

const BUDGETS = [8, 12, 16, 24];

interface Fixture {
    name: string;
    ideal: Vector2[];
    stroke: StrokePoint[];
}

function makeFixtures(): Fixture[] {
    const rectangleIdeal = walkRing(RECTANGLE_CORNERS, 4);
    const pentagonIdeal = walkRing(PENTAGON_CORNERS, 4);
    const circleIdeal = circlePoints(250, 260);
    const blobIdeal = blobPoints(260);
    return [
        { name: 'rectangle', ideal: rectangleIdeal, stroke: tremble(rectangleIdeal, 7, 12345) },
        { name: 'pentagon', ideal: pentagonIdeal, stroke: tremble(pentagonIdeal, 7, 6789) },
        { name: 'circle', ideal: circleIdeal, stroke: tremble(circleIdeal, 7, 4242) },
        { name: 'blob', ideal: blobIdeal, stroke: tremble(blobIdeal, 7, 999) },
    ];
}

/**
 * Shapes built from straight edges must actually improve — that is the claim the
 * mode is making. Shapes built from curves must not be damaged; they are allowed
 * a little slack, because a curve has no straight run to recover and any movement
 * there is incidental.
 */
const STRAIGHT_EDGED = new Set(['rectangle', 'pentagon']);
const CURVED_TOLERANCE = 1.15;

describe('straighten vs faithful — deviation from the ideal shape', () => {
    const fixtures = makeFixtures();
    const rows: string[] = [];

    for (const fixture of fixtures) {
        const result = runStrokePipeline(fixture.stroke, PIPELINE);

        it(`${fixture.name}: stroke closes and fits`, () => {
            expect(result.closed).toBe(true);
            expect(result.fit).not.toBeNull();
        });

        for (const budget of BUDGETS) {
            it(`${fixture.name} @ ${String(budget)}: budgeted, solvable, and no worse than faithful`, () => {
                const faithful = strokeToBudgetedPolygon(result, budget);
                const straight = strokeToStraightenedPolygon(result, budget);

                expect(faithful.achieved).toBeLessThanOrEqual(budget);
                expect(straight.achieved).toBeLessThanOrEqual(budget);
                expect(straight.achieved).toBeLessThanOrEqual(faithful.achieved);

                const faithfulIdeal = maxDeviationFromIdeal(fixture.ideal, faithful.vertices);
                const straightIdeal = maxDeviationFromIdeal(fixture.ideal, straight.vertices);
                rows.push(
                    [
                        fixture.name.padEnd(10),
                        String(budget).padStart(3),
                        (String(faithful.achieved) + '/' + String(straight.achieved)).padStart(6),
                        faithfulIdeal.toFixed(2).padStart(7),
                        straightIdeal.toFixed(2).padStart(7),
                        (((straightIdeal - faithfulIdeal) / faithfulIdeal) * 100).toFixed(1).padStart(7) + '%',
                        String(straight.straightened).padStart(3) + ' moved',
                        `vertOff ${maxVertexOffIdeal(fixture.ideal, faithful.vertices).toFixed(1)}` +
                            ` -> ${maxVertexOffIdeal(fixture.ideal, straight.vertices).toFixed(1)}`,
                    ].join('  '),
                );

                if (STRAIGHT_EDGED.has(fixture.name)) {
                    expect(straightIdeal).toBeLessThanOrEqual(faithfulIdeal);
                } else {
                    expect(straightIdeal).toBeLessThanOrEqual(faithfulIdeal * CURVED_TOLERANCE);
                }

                expect(solveSkeleton(faithful.vertices).complete).toBe(true);
                expect(solveSkeleton(straight.vertices).complete).toBe(true);
            }, 120000);
        }
    }

    it('the rectangle improves substantially at every budget, not marginally', () => {
        const fixture = fixtures.find((f) => f.name === 'rectangle') as Fixture;
        const result = runStrokePipeline(fixture.stroke, PIPELINE);
        for (const budget of BUDGETS) {
            const faithful = maxDeviationFromIdeal(
                fixture.ideal,
                strokeToBudgetedPolygon(result, budget).vertices,
            );
            const straight = maxDeviationFromIdeal(
                fixture.ideal,
                strokeToStraightenedPolygon(result, budget).vertices,
            );
            // Measured at 18-55% better; 10% is the floor the claim is worth making at.
            expect(straight).toBeLessThan(faithful * 0.9);
        }
    });

    afterAll(() => {
        // eslint-disable-next-line no-console
        console.log(
            '\n[straighten] shape       bud  got  faithful  straight   delta   moved\n' + rows.join('\n') + '\n',
        );
    });
});
