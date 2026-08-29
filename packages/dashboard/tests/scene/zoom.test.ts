import { boundsOfPoints } from '@proc-geo/core';
import { SQUARE } from '@proc-geo/test-fixtures';
import { SCENE_ZOOM_CAP, SCENE_ZOOM_MINIMUM } from '../../src/scene/perceptual-floor';
import { ZOOM_STEP, zoomIn, zoomOut } from '../../src/scene/zoom';

/**
 * The wheel's arithmetic, and the one rule it used to break.
 *
 * A tiny fixture fits the viewport far above the zoom cap, so the canvas can legitimately OPEN above
 * the cap; the old handler's `min(scale * step, cap)` then turned the first wheel-in into a jump
 * outwards. What is pinned here is the invariant that makes that impossible — zooming in never
 * decreases the scale — alongside the cap and minimum themselves, so a change to either fails here
 * rather than in someone's hands.
 */

/** The viewport the fit below is measured in: an ordinary canvas, not a contrived one. */
const VIEWPORT = { width: 800, height: 600 };

/** Fraction of the viewport `fitView` fills. Restated rather than imported: the canvas module pulls in
 *  react-konva, which does not load under this suite's node environment. */
const FIT_MARGIN_FRACTION = 0.9;

describe('zooming in', () => {
    it('magnifies by one step below the cap', () => {
        expect(zoomIn(1)).toBeCloseTo(ZOOM_STEP, 12);
        expect(zoomIn(10)).toBeCloseTo(10 * ZOOM_STEP, 12);
    });

    it('stops exactly at the cap rather than stepping over it', () => {
        expect(zoomIn(SCENE_ZOOM_CAP / ZOOM_STEP + 1)).toBe(SCENE_ZOOM_CAP);
        expect(zoomIn(SCENE_ZOOM_CAP)).toBe(SCENE_ZOOM_CAP);
    });

    /**
     * THE REGRESSION. `Math.min(scale * step, cap)` returns the cap here, which is SMALLER than the
     * scale it was given: the wheel gesture for "closer" moved the view away and the fitted view could
     * not be recovered.
     */
    it('never moves a view that already sits above the cap', () => {
        expect(zoomIn(270)).toBe(270);
        expect(zoomIn(SCENE_ZOOM_CAP * 2)).toBe(SCENE_ZOOM_CAP * 2);
    });

    it('is non-decreasing at every scale a canvas can hold', () => {
        for (const scale of [SCENE_ZOOM_MINIMUM, 0.5, 1, 50, 99, 100, 101, 270, 1000]) {
            expect(zoomIn(scale)).toBeGreaterThanOrEqual(scale);
        }
    });
});

describe('zooming out', () => {
    it('shrinks by one step above the minimum', () => {
        expect(zoomOut(1)).toBeCloseTo(1 / ZOOM_STEP, 12);
    });

    it('stops at the minimum', () => {
        expect(zoomOut(SCENE_ZOOM_MINIMUM)).toBe(SCENE_ZOOM_MINIMUM);
        expect(zoomOut(SCENE_ZOOM_MINIMUM * 1.05)).toBe(SCENE_ZOOM_MINIMUM);
    });

    it('brings a view above the cap back down, so the cap governs again on the way in', () => {
        let scale = 270;
        while (scale > SCENE_ZOOM_CAP) scale = zoomOut(scale);
        expect(scale).toBeLessThanOrEqual(SCENE_ZOOM_CAP);
        expect(zoomIn(scale)).toBeLessThanOrEqual(SCENE_ZOOM_CAP);
    });
});

describe('the fixture that provoked this', () => {
    /**
     * Not a restatement of the constants: it is the measurement that says a view above the cap is a
     * real state of this canvas rather than a hypothetical. The Square spans 2 world units, and
     * `fitView` does not clamp — deliberately, since fitting a region to the frame is the region
     * inspector's whole affordance.
     */
    it('opens the Square above the cap, which is the state the rule above protects', () => {
        const bounds = boundsOfPoints(SQUARE);
        const extent = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        const fitScale = FIT_MARGIN_FRACTION
            * Math.min(VIEWPORT.width / (bounds.maxX - bounds.minX), VIEWPORT.height / (bounds.maxY - bounds.minY));

        expect(extent).toBeLessThan(10);
        expect(fitScale).toBeGreaterThan(SCENE_ZOOM_CAP);
        expect(zoomIn(fitScale)).toBe(fitScale);
    });

    /**
     * And the reason the cap is not simply raised to meet the fit: the floor handed to the solver is a
     * fraction of the SHAPE's extent, so the magnification at which it becomes visible scales with the
     * shape. The cap is that limit computed at the reference extent — the worst case — and a shape
     * three orders smaller has three orders of headroom.
     */
    it('leaves the perceptual floor invisible at the Square\'s fit scale, so no derivation is breached', () => {
        const bounds = boundsOfPoints(SQUARE);
        const extent = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        const fitScale = FIT_MARGIN_FRACTION
            * Math.min(VIEWPORT.width / (bounds.maxX - bounds.minX), VIEWPORT.height / (bounds.maxY - bounds.minY));

        // The floor for THIS shape, in world units, versus what the viewer resolves at the fit scale.
        const floorInWorldUnits = 1e-5 * extent;
        const resolvableAtFit = 2 / fitScale;
        expect(floorInWorldUnits).toBeLessThan(resolvableAtFit);
    });
});
