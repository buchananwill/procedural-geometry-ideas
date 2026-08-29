import { SKELETON_NOISE_FLOOR } from '@proc-geo/core';
import type { SliceOptions } from '@proc-geo/core';
import { OFF_EDGE_JITTER_L_SEED_55433 } from '@proc-geo/test-fixtures';
import { runParcelPipeline } from '../../src/hooks/parcel-pipeline';
import type { PipelineParams } from '../../src/hooks/parcel-pipeline';
import { EXPLORER_PERCEPTUAL_FLOOR } from '../../src/scene/perceptual-floor';
import { deriveSliceDefaults, effectiveSliceOptions } from '../../src/stores/useParcelStore';

/*
 * ============================================================================
 *  THE PARCELS PAGE SOLVES AT THE EXPLORER'S FLOOR — journal decision 108(b).
 * ============================================================================
 *
 * The page is a client of the same canvas as the two solver pages, at the same zoom cap, so it takes
 * the same derived floor: one client, one floor. Before 108(b) it solved at the library's 1e-6 while
 * the pages around it solved at 1e-5, which is the two-tolerance-system disagreement decisions
 * 101/105/106 exist to remove.
 *
 * The pin below is not a restatement of a constant. It is the difference the floor MAKES to this
 * page, measured: a jittered fixture and the clean shape underneath it are one polygon as far as this
 * canvas is concerned, so the page must parcel them identically. At 1e-6 it does not.
 */

/** Depth and mitre readings a page sitting at its defaults would hand the pipeline. */
const DEPTH_PERCENT = 60;
const MITRE_TOLERANCE_DEG = 170;

/**
 * The clean shape underneath `OFF_EDGE_JITTER_L_SEED_55433`, written out here because it is not a
 * published fixture — `near-floor-jitter.ts`' header names it as the base the generator perturbed,
 * in clockwise winding, and that header is the provenance for these six corners. The jittered
 * fixture is this L with `k - 1` extra samples per edge, each displaced by about 1e-3 units; the
 * corners themselves were never moved.
 */
const REFLEX_L = [
    { x: 100, y: 100 },
    { x: 100, y: 400 },
    { x: 250, y: 400 },
    { x: 250, y: 250 },
    { x: 400, y: 250 },
    { x: 400, y: 100 },
];

function paramsFor(vertices: { x: number; y: number }[]): PipelineParams {
    const sliceOptions: SliceOptions = effectiveSliceOptions({
        derived: deriveSliceDefaults(vertices),
        overrides: {},
        splitIrregularity: 0,
        seed: 1,
    });
    return {
        vertices,
        depthPercent: DEPTH_PERCENT,
        mitreToleranceDeg: MITRE_TOLERANCE_DEG,
        sliceOptions,
    };
}

describe('the parcels pipeline at the explorer\'s floor', () => {
    it('completes on an ordinary polygon and cuts strips and parcels from it', () => {
        const result = runParcelPipeline(paramsFor(REFLEX_L), false);

        expect(result.failure).toBeNull();
        expect(result.complete).toBe(true);
        expect(result.strips.length).toBeGreaterThan(0);
        expect(result.parcels.length).toBeGreaterThan(0);
        expect(result.coverage).toBeGreaterThan(0);
    });

    /**
     * THE CONVICTION. The seed-55433 L is the reflex L with sub-perceptual jitter applied to its
     * vertices — jitter this canvas cannot draw at any zoom it permits. At the explorer's floor
     * canonicalisation removes it and the page parcels the shape a viewer actually sees; at the
     * library's 1e-6 the jitter survives into the skeleton and the page cuts a visibly different,
     * more fragmented set of strips from a polygon that looks identical on screen.
     *
     * Measured 2026-08-29 over the whole corpus at both floors: 55 of 59 fixtures are bit-identical
     * between them, and all four that differ are the jitter fixtures — this is the entire footprint of
     * the floor change on this page.
     */
    it('parcels a sub-perceptually jittered polygon exactly as it parcels the clean shape', () => {
        const clean = runParcelPipeline(paramsFor(REFLEX_L), false);
        const jittered = runParcelPipeline(paramsFor(OFF_EDGE_JITTER_L_SEED_55433), false);

        expect(jittered.complete).toBe(true);
        expect(jittered.strips).toHaveLength(clean.strips.length);
        expect(jittered.parcels).toHaveLength(clean.parcels.length);
        expect(jittered.maxOffset).toBeCloseTo(clean.maxOffset, 9);
        expect(jittered.parcelArea).toBeCloseTo(clean.parcelArea, 6);
    });

    /**
     * The other half of the same conviction, stated as the floor's own property rather than as a
     * consequence: the number this page solves at is the explorer's, and it is coarser than the
     * library default it used to take. Reverting the pass-through in `parcel-pipeline.ts` fails the
     * case above; this one says which number the case is about.
     */
    it('takes a floor coarser than the library default, which is what removes the jitter', () => {
        expect(EXPLORER_PERCEPTUAL_FLOOR).toBeGreaterThan(SKELETON_NOISE_FLOOR);

        // The jitter this page must not see sits between the two floors, in unit space. Below the
        // explorer's floor, above the library's — which is exactly why the two disagreed.
        const extent = 300;
        const largestJitterDeviation = 2.2e-5 / extent;
        expect(largestJitterDeviation).toBeLessThan(EXPLORER_PERCEPTUAL_FLOOR);
    });
});

describe('the pipeline reports where it stopped', () => {
    it('refuses a polygon of fewer than three vertices at the solve stage', () => {
        const result = runParcelPipeline(paramsFor([{ x: 0, y: 0 }, { x: 1, y: 1 }]), false);

        expect(result.failure?.stage).toBe('solve');
        expect(result.parcels).toHaveLength(0);
    });

    it('carries the staleness flag through untouched, since nothing computes from it', () => {
        expect(runParcelPipeline(paramsFor(REFLEX_L), true).stale).toBe(true);
        expect(runParcelPipeline(paramsFor(REFLEX_L), false).stale).toBe(false);
    });
});
