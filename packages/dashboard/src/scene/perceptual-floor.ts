/**
 * The explorer's own perceptual floor, DERIVED from what this canvas can actually show a viewer.
 *
 * WHY THIS EXISTS. `@proc-geo/core` defaults its perceptual floor to `SKELETON_NOISE_FLOOR` (1e-6),
 * which is deliberately conservative for a headless consumer that has no rendering limits to measure.
 * This explorer has measurable limits, and journal decision 106 rules that a client with limits
 * derives its own floor and passes it in: the solver must not create geometry the client will throw
 * away in the renderer, and at 1e-6 it does — every distinction below the numbers here is
 * arithmetic the viewer cannot see at any zoom the canvas permits.
 *
 * THE DERIVATION CHAIN, AND EVERY LINK IS MEASURED FROM THIS PACKAGE OR THE FIXTURE CORPUS:
 *
 *   1. {@link PERCEPTUAL_SEPARATION_PIXELS} = 2 CSS px — the smallest on-screen separation at which
 *      two marks read as two rather than one. One px of gap between two 1px marks.
 *   2. {@link SCENE_ZOOM_CAP} = 100 — `SceneCanvas`' own wheel clamp, which BOTH solver pages of the
 *      demo render through. Imported by the canvas rather than restated here, so the derivation
 *      cannot drift away from the limit it derives from.
 *   3. Smallest world separation the viewer can ever resolve = 2 / 100 = **0.02 world units**. The
 *      cap is absolute in world→px, so this number does not depend on the shape.
 *   4. {@link REFERENCE_WORLD_EXTENT} = 2000 world units — the demo's authored coordinate frame.
 *      The solver's floor is UNIT-SPACE (a fraction of the polygon's own extent), so turning a world
 *      length into a floor needs a reference extent, and the canvas does not bound one: this is the
 *      one link the UI cannot supply. Measured instead from what the demo actually draws — the
 *      largest fixture in `FULL_CORPUS` spans 1242.76 units, the polygon store's default 350, and a
 *      1080p canvas is under 1600 px wide, so 2000 bounds the envelope with headroom. THE ROUNDING
 *      DIRECTION IS THE SAFE ONE: a larger reference extent yields a FINER floor, so overstating it
 *      can only make the explorer keep geometry it might have discarded, never discard geometry it
 *      should have kept.
 *   5. Floor = 0.02 / 2000 = **1e-5 of the shape's extent**, exactly 10x coarser than the library
 *      default. A feature below this cannot reach two pixels of separation at the zoom cap, on any
 *      shape the demo draws.
 *
 * WHAT IT IS NOT. It is not a claim that 1e-6 is wrong — for a headless consumer with a plotter or a
 * CNC path it may be far too coarse. It is a claim about THIS canvas, and a different client with a
 * different zoom cap runs this same arithmetic and gets a different number.
 */

/** Two 1px marks with a 1px gap: the smallest separation that reads as two things, not one. */
export const PERCEPTUAL_SEPARATION_PIXELS = 2;

/**
 * The maximum Konva stage scale the scene canvas will zoom to.
 *
 * DECLARED HERE AND CONSUMED BY THE CANVAS, not the other way round, because it is the UI limit the
 * floor above is derived from — and a cap raised in the wheel handler while the derivation kept the
 * old number would silently make the floor too coarse for what the canvas can then show.
 */
export const SCENE_ZOOM_CAP = 100;

/** The minimum Konva stage scale, for symmetry with the cap. Not part of the derivation. */
export const SCENE_ZOOM_MINIMUM = 0.01;

/**
 * The largest world extent the demo draws, in the coordinates the fixtures and the polygon store are
 * authored in. See the chain above, step 4 — this is the link the canvas cannot supply.
 */
export const REFERENCE_WORLD_EXTENT = 2000;

/** The smallest world-space separation a viewer of this canvas can resolve, at the zoom cap. */
export const SMALLEST_RESOLVABLE_WORLD_SEPARATION =
    PERCEPTUAL_SEPARATION_PIXELS / SCENE_ZOOM_CAP;

/**
 * The explorer's perceptual floor, in the unit space the solver canonicalises in.
 *
 * Pass it as `perceptualFloor` to `solveSkeleton`, `subdivideRecursively`, `runAlgorithmV5` or
 * `useSkeletonAnimation`. Computed, never written as a literal, so halving any link above moves it.
 */
export const EXPLORER_PERCEPTUAL_FLOOR =
    SMALLEST_RESOLVABLE_WORLD_SEPARATION / REFERENCE_WORLD_EXTENT;
