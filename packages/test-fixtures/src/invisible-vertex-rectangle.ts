import {Vector2} from "@proc-geo/core";

/*
 * ============================================================================
 *  THE SHAPE THAT MADE A CORRECT SOLVE LOOK CORRUPTED.
 * ============================================================================
 *
 * Reconstructed 2026-08-28 from `examples/several things wrong with first solve.png`, the dashboard
 * inspection behind journal decision 75. Six symptoms were reported on it — a bisector missing from
 * a three-way collision, and a run of primary bisectors each carrying the parent pair of the vertex
 * before it. Every one of them is this fixture's single property seen through a debug overlay that
 * was drawing two index spaces at once, and the solved graph is right throughout.
 *
 * WHAT MAKES IT: a rectangle-sized convex ring of sixteen vertices, four of them corners and the
 * rest standing a few units clear of their chords, plus vertex 5 — which sits at the EXACT midpoint
 * of the span from vertex 4 to vertex 6. That is what the canvas's click-to-insert produces: it
 * projects the click onto the segment, so the vertex it adds is exactly collinear, deviates from
 * its chord by 1.1e-16, and the boundary stage removes it as invisible before the solver ever sees
 * it. Exactly one vertex goes; the ring solves at 15 exterior nodes rather than 16, which is the
 * renumbering the whole exhibit turns on.
 *
 * WHY THE OTHER FIFTEEN STAND CLEAR RATHER THAN NEARLY FLAT. The screenshot's boundary looked
 * straight, and a faithful copy of it — vertices off their chords by 0.01 on a 175-unit shape,
 * invisible at render scale and still above the floor — reproduces all six symptoms and is
 * degenerate in five unrelated ways besides: it drives the recursive driver's canonical-area drift
 * four orders over its bound, violates wavefront clearance, and changes which vertices the floor
 * takes under a change of scale. NONE of that is the subject here. The enrolled fixture keeps the
 * one property being exhibited and drops every other degeneracy, so what it pins is the removal and
 * not a near-flat boundary's numerical weather.
 *
 * EVERY COORDINATE IS AN INTEGER AND THE RING IS CENTRED ON THE ORIGIN — its bounding box runs
 * [-80, 80] by [-205, 205] — so the solve's normalisation subtracts a centre of exactly zero and
 * then scales by a power of two. Both steps are exact, at every cell of the corpus's round-trip
 * sweep, so this fixture contributes nothing to that sweep's inexact counts or its error bars. The
 * exact midpoint at vertex 5 survives into unit space for the same reason, which is what makes its
 * removal a property of the shape rather than of the arithmetic that reached it.
 *
 * WHAT IT PINS. `invisible-vertex-renumbering.test.ts` holds the whole chain: one vertex removed,
 * the surviving remap, and the six labels of the screenshot re-derived from the solved graph —
 * bisector e20 carrying [5,4] while standing at the caller's vertex 6, and the merged exterior edge
 * where the caller wrote two, which is why a collision the caller expected three arrivals at takes
 * two. It solves clean, which is why it enrols in `CLEAN_TEST_POLYGONS` rather than carrying a
 * defect signature.
 */
export const INVISIBLE_VERTEX_RECTANGLE: Vector2[] = [
    {x: -76, y: -199},  // 0  corner
    {x: -78, y: -99},   // 1
    {x: -80, y: 101},   // 2
    {x: -76, y: 201},   // 3  corner
    {x: -26, y: 205},   // 4
    {x: 24, y: 203},    // 5  the exact midpoint of 4..6 — removed as invisible before the solve
    {x: 74, y: 201},    // 6  corner
    {x: 78, y: 101},    // 7
    {x: 80, y: 1},      // 8
    {x: 78, y: -99},    // 9
    {x: 74, y: -199},   // 10 corner
    {x: 49, y: -202},   // 11
    {x: 24, y: -204},   // 12
    {x: -1, y: -205},   // 13
    {x: -26, y: -204},  // 14
    {x: -51, y: -202},  // 15
];

/** The index of the vertex the boundary stage removes: the one inserted exactly on its own edge. */
export const INVISIBLE_VERTEX_INDEX = 5;
