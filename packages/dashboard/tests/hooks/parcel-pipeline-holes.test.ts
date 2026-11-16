import type { SliceOptions } from '@proc-geo/core';
import { HOLED_F1, HOLED_F2 } from '@proc-geo/test-fixtures';
import { HOLED_SLICE_REFUSAL_TEXT } from '../../src/components/holed-fixture-text';
import { runParcelPipeline } from '../../src/hooks/parcel-pipeline';
import type { PipelineParams } from '../../src/hooks/parcel-pipeline';
import { parcelsToScene } from '../../src/scene/adapters/parcelsToScene';
import type { SceneGroup, SceneLine } from '../../src/scene/types';
import { deriveSliceDefaults, effectiveSliceOptions } from '../../src/stores/useParcelStore';
import { holesOf } from '../fixtures/holed-specimens';

/*
 * ============================================================================
 *  THE PARCELS PAGE ON A HOLED FIXTURE (dashboard holed-fixtures spec, decisions 35 and 46)
 * ============================================================================
 *
 * The page draws a holed fixture's skeleton, offset rings and strips, and stops at slicing with a named refusal:
 * a strip carries no loop, and lots of a holed footprint are outside this arc (BSA.D282, BSA.D317).
 */

function paramsFor(outline: { x: number; y: number }[], holes: PipelineParams['holes']): PipelineParams {
    const sliceOptions: SliceOptions = effectiveSliceOptions({
        derived: deriveSliceDefaults(outline),
        overrides: {},
        splitIrregularity: 0,
        seed: 1,
    });
    return {vertices: outline, holes, depthPercent: 60, mitreToleranceDeg: 170, sliceOptions};
}

describe('a holed region on the parcels page', () => {
    it('F1 stops at slice with the slice refusal, its strips and offset rings standing', () => {
        const result = runParcelPipeline(paramsFor(HOLED_F1.outline, holesOf(HOLED_F1)), false);
        expect(result.complete).toBe(true);
        expect(result.failure).toEqual({stage: 'slice', message: HOLED_SLICE_REFUSAL_TEXT});
        expect(result.strips.length).toBeGreaterThan(0);
        expect(result.offsetRings.length).toBeGreaterThan(0);
        expect(result.parcels).toEqual([]);
        // One strip per exterior edge of every loop, on default runs: 4 outline edges and 4 hole edges.
        expect(result.solve?.graph.loops).toHaveLength(2);
    });

    it('reports the region\'s area: the outline\'s less the holes\'', () => {
        const result = runParcelPipeline(paramsFor(HOLED_F1.outline, holesOf(HOLED_F1)), false);
        // F1: a 10 × 10 square less a square of side √2.
        expect(result.polygonArea).toBeCloseTo(100 - 2, 12);
    });

    it('F2, two holes, stops at slice too', () => {
        const result = runParcelPipeline(paramsFor(HOLED_F2.outline, holesOf(HOLED_F2)), false);
        expect(result.failure?.stage).toBe('slice');
        expect(result.solve?.graph.loops).toHaveLength(3);
    });

    it('strokes each hole as the outline is stroked', () => {
        const holes = holesOf(HOLED_F2);
        const scene = parcelsToScene({
            vertices: HOLED_F2.outline, holes, skeleton: null, offsetRings: [], strips: [], parcelsByStrip: [],
            layers: {strips: true, parcels: true, skeleton: true, offsetRings: true, frontage: true},
        });
        const polygon = scene.find((p): p is SceneGroup => p.type === 'group' && p.id === 'group:polygon')!;
        const lines = polygon.children as SceneLine[];
        expect(lines.map(line => line.points)).toEqual(
            [HOLED_F2.outline, ...holes.map(hole => hole.vertices)].map(loop => loop.flatMap(v => [v.x, v.y])));
        expect(new Set(lines.map(line => JSON.stringify(line.stroke))).size).toBe(1);
    });

    it('a single-loop region slices as before: no holes, no refusal', () => {
        const result = runParcelPipeline(paramsFor(HOLED_F1.outline, []), false);
        expect(result.failure).toBeNull();
        expect(result.parcels.length).toBeGreaterThan(0);
        expect(result.polygonArea).toBe(100);
    });
});
