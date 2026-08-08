import type { StrokePipelineConfig, StrokePoint } from '@proc-geo/core';
import { DEFAULT_STROKE_PIPELINE_CONFIG, parseGeometryPayload, runStrokePipeline } from '@proc-geo/core';
import { summariseStrokeCopy } from '../../src/components/pen-stroke/stroke-clipboard';
import { interpretGeometryPaste } from '../../src/components/geometry-clipboard';

/**
 * A hand-drawn circle, sampled densely enough that the fitted spline flattens to
 * well over the 64-vertex budget. The last sample lands exactly on the first, so
 * `distance-threshold` closure reads it as a loop.
 */
function circleStroke(sampleCount: number, radius = 200, wobble = 0): StrokePoint[] {
    const points: StrokePoint[] = [];
    for (let i = 0; i <= sampleCount; i++) {
        const theta = (i / sampleCount) * Math.PI * 2;
        // The wobble multiplies the fitted segment count, which is what pushes a
        // real hand-drawn blob past the budget; a perfect circle fits in a few.
        const r = radius + wobble * Math.sin(theta * 11);
        points.push({
            x: 400 + r * Math.cos(theta),
            y: 300 + r * Math.sin(theta),
            t: i * 8,
        });
    }
    return points;
}

/** Dense and wobbly enough that flattening the fit exceeds the 64-vertex budget. */
function wobblyLoop(): StrokePoint[] {
    return circleStroke(400, 200, 25);
}

/** An arc that stops well short of its start, so no closure threshold can join it. */
function arcStroke(sampleCount: number, radius = 200): StrokePoint[] {
    const points: StrokePoint[] = [];
    for (let i = 0; i <= sampleCount; i++) {
        const theta = (i / sampleCount) * Math.PI;
        points.push({
            x: 400 + radius * Math.cos(theta),
            y: 300 + radius * Math.sin(theta),
            t: i * 8,
        });
    }
    return points;
}

const CLOSED_CONFIG: StrokePipelineConfig = {
    ...DEFAULT_STROKE_PIPELINE_CONFIG,
    closure: { variant: 'distance-threshold', threshold: 30 },
};

describe('summariseStrokeCopy', () => {
    it('emits a versioned closed payload for a closed stroke', () => {
        const result = runStrokePipeline(wobblyLoop(), CLOSED_CONFIG);
        expect(result.closed).toBe(true);

        const summary = summariseStrokeCopy(result);
        const parsed = parseGeometryPayload(summary.text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.encoding).toBe('versioned');
        expect(parsed.payload.kind).toBe('vertex-run');
        expect(parsed.payload.closed).toBe(true);
        expect(parsed.payload.vertices).toHaveLength(summary.vertexCount);
    });

    it('holds the copy to the vertex budget and says that it did', () => {
        const result = runStrokePipeline(wobblyLoop(), CLOSED_CONFIG);
        const summary = summariseStrokeCopy(result, 64);
        expect(summary.vertexCount).toBeLessThanOrEqual(64);
        expect(summary.reduced).toBe(true);
        expect(summary.maxError).toBeGreaterThan(0);
        expect(summary.description).toContain('64-vertex budget');
        expect(summary.description).toContain('max deviation');
        expect(summary.description).toContain('Closed loop.');
    });

    it('reports staying inside the budget when nothing was removed', () => {
        const result = runStrokePipeline(wobblyLoop(), CLOSED_CONFIG);
        const summary = summariseStrokeCopy(result, 4096);
        expect(summary.reduced).toBe(false);
        expect(summary.maxError).toBe(0);
        expect(summary.description).toContain('within the 4096-vertex budget');
    });

    it('strips the seam duplicate, so no vertex is repeated at the join', () => {
        const result = runStrokePipeline(wobblyLoop(), CLOSED_CONFIG);
        const summary = summariseStrokeCopy(result, 4096);
        const parsed = parseGeometryPayload(summary.text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const { vertices } = parsed.payload;
        const first = vertices[0];
        const last = vertices[vertices.length - 1];
        expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeGreaterThan(0);
    });

    it('copies an open stroke as an open payload rather than coercing it closed', () => {
        const result = runStrokePipeline(arcStroke(60), CLOSED_CONFIG);
        expect(result.closed).toBe(false);

        const summary = summariseStrokeCopy(result);
        expect(summary.closed).toBe(false);
        expect(summary.description).toContain('Open path');

        const parsed = parseGeometryPayload(summary.text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.closed).toBe(false);
    });

    it('reads a stroke as open when closure is left at pass-through', () => {
        const result = runStrokePipeline(wobblyLoop(), DEFAULT_STROKE_PIPELINE_CONFIG);
        expect(result.closed).toBe(false);
        expect(summariseStrokeCopy(result).closed).toBe(false);
    });
});

describe('pen stroke -> straight skeleton round trip', () => {
    it('a closed stroke copied on one page is accepted by the other', () => {
        const result = runStrokePipeline(wobblyLoop(), CLOSED_CONFIG);
        const summary = summariseStrokeCopy(result);

        const outcome = interpretGeometryPaste(summary.text);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.note).toBeNull();
        expect(outcome.vertices).toHaveLength(summary.vertexCount);
        expect(outcome.vertices.length).toBeGreaterThanOrEqual(3);
        for (const v of outcome.vertices) {
            expect(Number.isFinite(v.x)).toBe(true);
            expect(Number.isFinite(v.y)).toBe(true);
        }
    });

    it('an open stroke copied on one page is refused by the other, with a reason', () => {
        const result = runStrokePipeline(arcStroke(60), CLOSED_CONFIG);
        const outcome = interpretGeometryPaste(summariseStrokeCopy(result).text);
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.title).toContain('open path');
    });
});
