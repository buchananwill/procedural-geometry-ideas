import { SCENE_ZOOM_CAP, SCENE_ZOOM_MINIMUM } from './perceptual-floor';

/**
 * The scene canvas' wheel arithmetic, as two pure functions.
 *
 * Extracted from `SceneCanvas`' handler rather than written inline, because the cap is shared with
 * the perceptual-floor derivation and the interaction between the cap and a fitted view has already
 * been wrong once (see {@link zoomIn}). A rule the floor's provenance depends on should be assertable
 * without mounting a Konva stage.
 */

/** Multiplier one wheel notch applies to the stage scale. */
export const ZOOM_STEP = 1.1;

/**
 * One notch of wheel-in: never past the cap, and NEVER BACKWARDS.
 *
 * THE SECOND CLAUSE IS THE FIX, and the bug it cures was reported as a tiny-fixture wrinkle. `fitView`
 * scales a shape to fill the viewport and does not clamp, on purpose — the Square spans 2 world units
 * and fits an 800px viewport at 270x, and a deep region in the inspector is routinely smaller still.
 * A plain `min(scale * step, cap)` then made the FIRST wheel-in jump from 270x out to 100x: the
 * gesture that means "closer" moved the view further away, and the magnification the canvas had
 * opened at could never be recovered.
 *
 * So the cap bounds what zooming in can REACH, not what it can leave alone: a view already above the
 * cap stays exactly where it is and the notch is a no-op. Every view at or below the cap behaves
 * precisely as before — the fix is invisible to the ordinary case, which is the point.
 *
 * The cap itself is not raised, because {@link SCENE_ZOOM_CAP} is the number
 * `perceptual-floor.ts` derives the solver's floor from; a fitted view above it is not a breach of
 * that derivation (the floor is relative to the shape's extent and the cap is the worst case, taken at
 * the largest shape the demo draws — the argument is written out at `fitView`), but a raised cap
 * would be.
 */
export function zoomIn(scale: number): number {
    return Math.max(scale, Math.min(scale * ZOOM_STEP, SCENE_ZOOM_CAP));
}

/**
 * One notch of wheel-out: never below the minimum.
 *
 * No mirror-image clause is needed. Nothing opens the canvas below {@link SCENE_ZOOM_MINIMUM} —
 * `fitView` returns a positive scale for any shape with extent — so zooming out has no state to be
 * pushed backwards out of.
 */
export function zoomOut(scale: number): number {
    return Math.max(scale / ZOOM_STEP, SCENE_ZOOM_MINIMUM);
}
