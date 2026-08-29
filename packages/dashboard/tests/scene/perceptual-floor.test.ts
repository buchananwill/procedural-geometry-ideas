import { SKELETON_NOISE_FLOOR } from '@proc-geo/core';
import { FULL_CORPUS } from '@proc-geo/test-fixtures';
import {
    EXPLORER_PERCEPTUAL_FLOOR,
    PERCEPTUAL_SEPARATION_PIXELS,
    REFERENCE_WORLD_EXTENT,
    SCENE_ZOOM_CAP,
    SMALLEST_RESOLVABLE_WORLD_SEPARATION,
} from '../../src/scene/perceptual-floor';

/*
 * ============================================================================
 *  THE EXPLORER'S PERCEPTUAL FLOOR — the derivation, pinned link by link.
 * ============================================================================
 *
 * Journal decision 106: the floor the demo hands the solver is DERIVED from this canvas' rendering
 * limits, not chosen. These tests are what makes that a claim rather than a comment — each link of
 * the chain in `perceptual-floor.ts` is pinned at its own value AND the composed floor is pinned, so
 * halving any one constant fails here rather than silently moving what the solver is asked to
 * compute.
 *
 * The last case is the one that is not a restatement: `REFERENCE_WORLD_EXTENT` is the single link
 * the UI cannot supply, and it is checked against the corpus the demo actually draws.
 */

describe('the derivation chain, link by link', () => {
    it('takes two pixels as the smallest separation that reads as two marks', () => {
        expect(PERCEPTUAL_SEPARATION_PIXELS).toBe(2);
    });

    it('takes the scene canvas zoom cap as the magnification limit', () => {
        expect(SCENE_ZOOM_CAP).toBe(100);
    });

    it('resolves nothing finer than two pixels at the cap: 0.02 world units', () => {
        expect(SMALLEST_RESOLVABLE_WORLD_SEPARATION).toBeCloseTo(0.02, 15);
        expect(SMALLEST_RESOLVABLE_WORLD_SEPARATION)
            .toBe(PERCEPTUAL_SEPARATION_PIXELS / SCENE_ZOOM_CAP);
    });

    it('references a world extent of 2000 units', () => {
        expect(REFERENCE_WORLD_EXTENT).toBe(2000);
    });

    /**
     * The composed pin. Every constant above feeds this one number, so halving ANY of them — the
     * pixel threshold, the zoom cap, the reference extent — moves it and fails here. That is the
     * conviction the derivation is worth having.
     */
    it('derives a floor of 1e-5 of the shape extent', () => {
        expect(EXPLORER_PERCEPTUAL_FLOOR).toBeCloseTo(1e-5, 18);
        expect(EXPLORER_PERCEPTUAL_FLOOR).toBe(
            PERCEPTUAL_SEPARATION_PIXELS / (SCENE_ZOOM_CAP * REFERENCE_WORLD_EXTENT));
    });

    it('is exactly ten times coarser than the library default', () => {
        expect(EXPLORER_PERCEPTUAL_FLOOR / SKELETON_NOISE_FLOOR).toBeCloseTo(10, 9);
    });

    it('stays coarser than the library default, which is the whole point of deriving it', () => {
        expect(EXPLORER_PERCEPTUAL_FLOOR).toBeGreaterThan(SKELETON_NOISE_FLOOR);
    });
});

describe('the one link the UI cannot supply is measured against what the demo draws', () => {
    /**
     * NOT A RESTATEMENT OF THE CONSTANT. The floor is a fraction of a shape's extent while the zoom
     * cap is absolute in world→px, so the derivation needs a reference extent and the canvas does
     * not bound one. `REFERENCE_WORLD_EXTENT` bounds it from the corpus instead, and this is the
     * check that keeps that true: a fixture larger than the reference would be drawn at a zoom the
     * floor was not derived for, and the floor would then be too coarse for it.
     *
     * The rounding direction is the safe one — overstating the extent yields a FINER floor — so the
     * assertion is one-sided.
     */
    it('bounds every fixture in the corpus', () => {
        const extents = FULL_CORPUS.map((fixture) => {
            const xs = fixture.vertices.map((v) => v.x);
            const ys = fixture.vertices.map((v) => v.y);
            return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        });
        expect(Math.max(...extents)).toBeLessThan(REFERENCE_WORLD_EXTENT);
    });
});
