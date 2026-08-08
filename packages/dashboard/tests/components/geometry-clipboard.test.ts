import { makeVertexRun, serialiseGeometryPayload } from '@proc-geo/core';
import { interpretGeometryPaste, MIN_POLYGON_VERTICES } from '../../src/components/geometry-clipboard';

const SQUARE = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
];

describe('interpretGeometryPaste', () => {
    it('accepts a closed versioned payload and returns its vertices', () => {
        const outcome = interpretGeometryPaste(serialiseGeometryPayload(makeVertexRun(SQUARE, true)));
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.vertices).toEqual(SQUARE);
        expect(outcome.note).toBeNull();
    });

    it('accepts a legacy bare array but reports that closure was assumed', () => {
        const outcome = interpretGeometryPaste(JSON.stringify(SQUARE));
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.vertices).toEqual(SQUARE);
        expect(outcome.note).toMatch(/closed polygon/);
    });

    it('rejects an open path rather than closing it', () => {
        const outcome = interpretGeometryPaste(serialiseGeometryPayload(makeVertexRun(SQUARE, false)));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.title).toContain('open path');
        expect(outcome.message).toMatch(/closed regions only/);
    });

    it('rejects a closed payload with fewer than three vertices', () => {
        const twoPoints = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
        const outcome = interpretGeometryPaste(serialiseGeometryPayload(makeVertexRun(twoPoints, true)));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.title).toContain('too few vertices');
        expect(outcome.message).toContain(String(MIN_POLYGON_VERTICES));
    });

    it('surfaces the codec reason and detail when the text is not a payload', () => {
        const outcome = interpretGeometryPaste('not json at all');
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.title).toContain('not-json');
        expect(outcome.message.length).toBeGreaterThan(0);
    });

    it('surfaces the version reason for a payload from a future build', () => {
        const future = JSON.stringify({
            format: 'proc-geo/geometry',
            version: 99,
            kind: 'vertex-run',
            closed: true,
            vertices: SQUARE,
        });
        const outcome = interpretGeometryPaste(future);
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.title).toContain('unsupported-version');
        expect(outcome.message).toContain('99');
    });

    it('does not throw on non-string input', () => {
        expect(interpretGeometryPaste(undefined).ok).toBe(false);
        expect(interpretGeometryPaste(SQUARE).ok).toBe(false);
    });
});
