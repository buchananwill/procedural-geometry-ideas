import {Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE ESCAPING WAIST BISECTOR: NEAR_REGULAR_PEANUT_32 WITH ITS WAIST DEFORMED.
 * ============================================================================
 *
 * Two 32-vertex variants supplied by the user on 2026-08-28, both deforming the waist of
 * `NEAR_REGULAR_PEANUT_32` (`r = 150 + 55 cos 2t` about (300, 300)). Every other vertex is that
 * fixture's, unchanged and bit-for-bit; the coordinates below are the user's own literals.
 *
 *   Variant 1: vertex 6 moved to (317.34990411859854, 189.72050792345877).
 *   Variant 2: the same, plus vertex 23 moved from (300, 395) to (300, 392.03161135535333).
 *
 * WHY THE WAIST. The peanut pinches to 190 units at x = 300, between reflex vertex 7 (300, 205) at
 * the top and reflex vertex 23 at the bottom. In the symmetric fixture those two reflex bisectors
 * are mirror images pointing straight at each other and close the waist head-on at (300, 300).
 * Moving vertex 6 tilts vertex 7's bisector off the vertical, so the two spikes now MISS: the waist
 * has to be closed by a split event instead, and vertex 23's bisector is the one that has to find
 * it. It runs along x = 300 — straight through vertex 7, which is the shared endpoint of exterior
 * edges 6 and 7.
 *
 * WHAT THEY CAUGHT. `generateSplitEventFromTheEdgeItself` pre-tested whether the bisector reaches
 * the split edge by asking `intersectRays` for 'converging' against the edge's forward ray and its
 * reversed ray. Those two rays SHARE an origin — the edge's source vertex — and 'converging'
 * requires both ray parameters strictly positive, so between them the pair covered the whole
 * supporting line except that single point. A bisector aimed exactly at the split edge's own source
 * vertex read 'diverging' both ways and its split was discarded before any of the real machinery
 * ran, though `validateSplitReachesEdge` accepted the offset when asked directly.
 *
 * With the split gone, vertex 23's bisector had nothing left to meet in the waist: variant 1 left it
 * dangling at (300, 300) as a one-edge leaf, variant 2 marched it out through the top of the polygon
 * to a terminal node 40 units OUTSIDE the boundary — and both solves reported `complete: true` with
 * empty diagnostics. That silent wrong answer is what these two fixtures pin;
 * `slightly-deformed-peanut.test.ts` asserts the solve, and `skeleton-containment.test.ts` asserts
 * corpus-wide that no interior node lies outside its polygon.
 */

/** Waist deformed at vertex 6 alone; vertex 23 keeps the symmetric fixture's (300, 395). */
export const SLIGHTLY_DEFORMED_PEANUT_1: Vector2[] = [
    {x: 496.95480160989337, y: 260.8232541449851},
    {x: 474.5124114107933, y: 227.714592391216},
    {x: 442.2208723282582, y: 204.9710512440099},
    {x: 406.0660171779821, y: 193.93398282201787},
    {x: 371.6421211498905, y: 192.77998863749468},
    {x: 342.5196221007431, y: 197.3485516574073},
    {x: 317.34990411859854, y: 189.72050792345877},
    {x: 300, y: 205},
    {x: 280.64964925017625, y: 202.71921748892424},
    {x: 257.48037789925684, y: 197.3485516574073},
    {x: 228.35787885010944, y: 192.77998863749468},
    {x: 193.9339828220178, y: 193.93398282201787},
    {x: 157.7791276717417, y: 204.9710512440099},
    {x: 125.48758858920661, y: 227.71459239121612},
    {x: 103.0451983901066, y: 260.8232541449852},
    {x: 95, y: 300},
    {x: 103.0451983901066, y: 339.1767458550148},
    {x: 125.48758858920667, y: 372.2854076087839},
    {x: 157.77912767174172, y: 395.0289487559901},
    {x: 193.93398282201787, y: 406.06601717798213},
    {x: 228.3578788501095, y: 407.2200113625053},
    {x: 257.48037789925695, y: 402.65144834259263},
    {x: 280.6496492501763, y: 397.28078251107576},
    {x: 300, y: 395},
    {x: 319.3503507498237, y: 397.28078251107576},
    {x: 342.51962210074305, y: 402.65144834259263},
    {x: 371.64212114989056, y: 407.2200113625053},
    {x: 406.06601717798213, y: 406.06601717798213},
    {x: 442.2208723282582, y: 395.0289487559901},
    {x: 474.51241141079333, y: 372.2854076087839},
    {x: 496.95480160989337, y: 339.17674585501476},
    {x: 505, y: 300},
];

/** The same deformation, with vertex 23 also drawn up into the waist. */
export const SLIGHTLY_DEFORMED_PEANUT_2: Vector2[] = [
    {x: 496.95480160989337, y: 260.8232541449851},
    {x: 474.5124114107933, y: 227.714592391216},
    {x: 442.2208723282582, y: 204.9710512440099},
    {x: 406.0660171779821, y: 193.93398282201787},
    {x: 371.6421211498905, y: 192.77998863749468},
    {x: 342.5196221007431, y: 197.3485516574073},
    {x: 317.34990411859854, y: 189.72050792345877},
    {x: 300, y: 205},
    {x: 280.64964925017625, y: 202.71921748892424},
    {x: 257.48037789925684, y: 197.3485516574073},
    {x: 228.35787885010944, y: 192.77998863749468},
    {x: 193.9339828220178, y: 193.93398282201787},
    {x: 157.7791276717417, y: 204.9710512440099},
    {x: 125.48758858920661, y: 227.71459239121612},
    {x: 103.0451983901066, y: 260.8232541449852},
    {x: 95, y: 300},
    {x: 103.0451983901066, y: 339.1767458550148},
    {x: 125.48758858920667, y: 372.2854076087839},
    {x: 157.77912767174172, y: 395.0289487559901},
    {x: 193.93398282201787, y: 406.06601717798213},
    {x: 228.3578788501095, y: 407.2200113625053},
    {x: 257.48037789925695, y: 402.65144834259263},
    {x: 280.6496492501763, y: 397.28078251107576},
    {x: 300, y: 392.03161135535333},
    {x: 319.3503507498237, y: 397.28078251107576},
    {x: 342.51962210074305, y: 402.65144834259263},
    {x: 371.64212114989056, y: 407.2200113625053},
    {x: 406.06601717798213, y: 406.06601717798213},
    {x: 442.2208723282582, y: 395.0289487559901},
    {x: 474.51241141079333, y: 372.2854076087839},
    {x: 496.95480160989337, y: 339.17674585501476},
    {x: 505, y: 300},
];
