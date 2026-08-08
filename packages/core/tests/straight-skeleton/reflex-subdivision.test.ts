import {isClockwise, setSkeletonLogLevel, solveSkeleton, Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  THIS FILE RECORDS A DEFECT. THE ASSERTIONS BELOW ARE NOT DESIRED BEHAVIOUR.
 *  WHEN THE DEFECT IS FIXED, INVERT THEM: EVERY EXPECTED `false` ON `complete`
 *  BECOMES `true`, AND THE DIAGNOSTIC ASSERTIONS ARE DELETED. DO NOT "FIX" A
 *  FAILURE HERE BY WEAKENING AN ASSERTION.
 * ============================================================================
 *
 * WHAT IS BROKEN
 *
 * Subdividing each edge of a *reflex* polygon into k equal pieces and solving the result
 * fails for most k. Convex polygons are unaffected at every k. Severity scales with the
 * number of reflex vertices.
 *
 *     square (convex)              k = 1..10   10 / 10 complete
 *     irregular hexagon (convex)   k = 1..10   10 / 10 complete
 *     reflex L                     k = 1..10    3 / 10 complete  (passes k = 1, 2, 4)
 *     plus / double reflex         k = 1..10    2 / 10 complete  (passes k = 1, 2)
 *
 * ----------------------------------------------------------------------------
 * THE MECHANISM
 * ----------------------------------------------------------------------------
 *
 * The smallest reproducing case is the L at k = 3 (n = 18). Its second step receives the
 * twelve-edge wavefront ring
 *
 *     [18, 19, 20, 36, 37, 26, 27, 28, 38, 39, 34, 35]
 *
 * and finds *five* coincident merges in one offset layer at offset 75 — three of them
 * non-adjacent (opposite walls meeting: {18,27}, {20,26}, {28,34}) and two adjacent
 * collapses ({36,37}, {38,39}). Offset 75 is half the L's arm width, so the entire
 * wavefront terminates in that one layer; only e19 and e35 survive it.
 *
 * `handleInteriorNGon` resolves each merge by calling `bisectionsForMerge(ring, merge, ...)`
 * — once per merge, each time against the *whole, unmodified* ring. That function's contract
 * holds only when its merge is the sole event removing edges from that ring in this layer:
 * it computes the surviving arcs as the gaps between the runs of *its* participants, which
 * silently assumes every other position on the ring is still live. With three partitioning
 * merges the assumption is false three times over, and the six `BisectionParams` produced
 * describe six *overlapping* exterior-edge spans:
 *
 *     [0,8]  [2,7]  [8,1]  [9,17]  [10,15]  [16,9]
 *
 * Nothing downstream repairs that. The dedupe loop in `handleInteriorNGon` only collapses
 * events sharing an identical `clockwiseExteriorEdgeIndex`, so all six survive as
 * `finalPartitionEvents`, and the assignment loop puts each outgoing edge in the *first*
 * span that contains both its parents. The widest early span, [0,8], therefore swallows the
 * edges belonging to the nested spans [2,7] and [8,1]. Child 0 comes out as
 * [19, 40, 41, 42, 46] — five edges that form **two disjoint wavefront rings**, not one —
 * and four of the six children come out empty and are discarded by `stepAlgorithm`'s
 * `interiorEdges.length > 1` filter.
 *
 * From there the failure is downstream bookkeeping:
 *
 *   - The malformed two-ring child re-enters `handleInteriorNGon`. `ringsOfSubPolygon`
 *     honestly reports two rings, no merge fits inside either, `mergesShareAnEdge` is true,
 *     and the guard routes the layer to the old pairwise path.
 *   - In that path `handleCollisionEvent`'s `interiorNonAdjacent` branch calls
 *     `terminateEdgesAtPoint([instigator], ...)` and then `accept(target)` — it accepts the
 *     target *without ever giving it a node*. (`interiorPair` terminates both; the
 *     non-adjacent branch terminates one.) The reciprocal event cannot repair it: by then
 *     both edges are accepted and the handler returns early. Measured over the whole sweep,
 *     49 of 50 non-adjacent events reaching this path leave their target dangling.
 *   - Those dangling edges are exactly the `unresolved-edges` diagnostic: on the L at k = 3
 *     they are e42 and e45, both `accepted === true`, both `target === undefined`.
 *
 * At larger k the same overlap goes one step further and produces a step whose edges lie in
 * *no* emitted span at all, which is where the distinctive message comes from —
 * `algorithm-complex-cases.ts`, end of `handleInteriorNGon`:
 *
 *     Unable to play interior edge 82 in any span: 15,16,17,4
 *
 * On the L at k = 6 that step's input is [38, 39, 53, 81, 82, 83, 87], which
 * `ringsOfSubPolygon` reports as the two rings [38,39,83,53,81] and [82,87]. The two spans
 * offered, [15,16] and [17,4], were derived from the first ring only; e82 (parents cw = 4,
 * ws = 15) belongs to the second and fits in neither. The message names span assignment, and
 * span assignment is indeed where it is raised — but span assignment is the victim. It is
 * being asked to distribute the edges of a step that was already malformed two layers
 * earlier.
 *
 * ----------------------------------------------------------------------------
 * WHY REFLEX VERTICES ARE NECESSARY
 * ----------------------------------------------------------------------------
 *
 * The whole chain starts with two or more *ring-partitioning* merges in one offset layer. A
 * partitioning merge is one whose participants are non-contiguous on the ring — opposite
 * stretches of wavefront meeting. A convex polygon produces at most one of those, at the
 * very end, when the ring closes. A reflex notch creates facing walls in the interior, so
 * several such pinches can occur at once — and on these shapes they occur at *exactly* the
 * same offset because the arms are of equal width. Instrumenting the sweep, the count of
 * partitioning merges in a single layer is 0 for the convex hexagon at every k, 0 or 1 for
 * every passing configuration, and 3, 5, 9, 13 or 17 for every failing one.
 *
 * ----------------------------------------------------------------------------
 * WHY JITTER PARTIALLY HELPS, THEN PLATEAUS
 * ----------------------------------------------------------------------------
 *
 * Jitter separates simultaneous events into different layers, and a layer with one
 * partitioning merge is handled correctly. How much it can separate depends entirely on
 * *which* degeneracy the jitter perturbs:
 *
 *   - Jitter with a component off the edge line moves the supporting lines themselves. The
 *     wall-to-wall distances stop being equal, the pinches land at different offsets, and
 *     every configuration measured passes. This is the tie-break half.
 *   - Jitter *along* the edge line moves the sample points but leaves the supporting lines
 *     exactly where they were. The L's arms are still exactly 150 apart, so the wall-versus-
 *     wall pinches still occur at exactly offset 75, still in one layer, however large the
 *     jitter. Measured with along-edge jitter, the L passes k = 1..5, 7 and 9 and fails
 *     k = 6, 8 and 10 identically at jitter 0.02, 0.1 and 0.3; the plus fails every k >= 4
 *     at every jitter level. This is the structural half, and it is why the reported sweep
 *     rises and then stops dead rather than converging on 10 / 10.
 *
 * So the asymmetry is not evidence of two defects. It is one defect with a precondition that
 * is *partly* a coincidence of sample placement (jitter dissolves it) and *partly* a
 * coincidence of the polygon's own dimensions (jitter of a sampled edge cannot touch it).
 *
 * ----------------------------------------------------------------------------
 * WHAT WOULD FIX IT — NOT IMPLEMENTED
 * ----------------------------------------------------------------------------
 *
 *   1. `collision-handling.ts`, `interiorNonAdjacent`: terminate the target as well as the
 *      instigator. Unconditional one-line defect, independent of everything above.
 *   2. `handleInteriorNGon`: resolve a layer as one event set per ring — compute the surviving
 *      arcs once against the union of every merge's participants, rather than once per merge
 *      against the untouched ring.
 *   3. `handleInteriorNGon`: derive the child sub-polygons from `ringsOfSubPolygon` of the
 *      outgoing edges rather than from exterior-edge spans, which removes the overlapping-span
 *      dedupe, the first-containing-span assignment, and the `Unable to play interior edge`
 *      throw entirely.
 *   4. Once (2) and (3) land, `mergesShareAnEdge`'s fallback should be retired. It is on the
 *      path of every failure recorded here but it is not their cause — it detects the damage
 *      one layer late and routes it to a handler that loses edges.
 */

setSkeletonLogLevel('silent');

const SQUARE: Vector2[] = [
    {x: 100, y: 100}, {x: 100, y: 400}, {x: 400, y: 400}, {x: 400, y: 100},
];

const IRREGULAR_HEXAGON: Vector2[] = [
    {x: 100, y: 200}, {x: 180, y: 100}, {x: 320, y: 120},
    {x: 400, y: 240}, {x: 300, y: 380}, {x: 150, y: 340},
];

const REFLEX_L: Vector2[] = [
    {x: 100, y: 100}, {x: 100, y: 400}, {x: 250, y: 400},
    {x: 250, y: 250}, {x: 400, y: 250}, {x: 400, y: 100},
];

const DOUBLE_REFLEX_PLUS: Vector2[] = [
    {x: 200, y: 100}, {x: 200, y: 200}, {x: 100, y: 200}, {x: 100, y: 300},
    {x: 200, y: 300}, {x: 200, y: 400}, {x: 300, y: 400}, {x: 300, y: 300},
    {x: 400, y: 300}, {x: 400, y: 200}, {x: 300, y: 200}, {x: 300, y: 100},
];

/** The solver only handles clockwise winding; these fixtures are authored either way. */
function clockwise(polygon: Vector2[]): Vector2[] {
    return isClockwise(polygon) ? polygon : [...polygon].reverse();
}

/** Split every edge into `k` equal pieces, preserving winding and the original corners. */
function subdivideEdges(polygon: Vector2[], k: number): Vector2[] {
    const vertices: Vector2[] = [];
    for (let index = 0; index < polygon.length; index++) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        for (let step = 0; step < k; step++) {
            vertices.push({
                x: from.x + ((to.x - from.x) * step) / k,
                y: from.y + ((to.y - from.y) * step) / k,
            });
        }
    }
    return vertices;
}

function solvesCompletely(polygon: Vector2[], k: number): boolean {
    return solveSkeleton(subdivideEdges(clockwise(polygon), k)).complete;
}

const ALL_K = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('subdivided edges: convex control (SPECIFICATION — must stay true)', () => {
    it.each(ALL_K)('solves the square subdivided %i times per edge', k => {
        expect(solvesCompletely(SQUARE, k)).toBe(true);
    });

    it.each(ALL_K)('solves the irregular hexagon subdivided %i times per edge', k => {
        expect(solvesCompletely(IRREGULAR_HEXAGON, k)).toBe(true);
    });
});

describe('subdivided edges: reflex polygons (RECORDED DEFECT — invert when fixed)', () => {
    /** k -> whether the solve currently completes. Every `false` is the defect. */
    const L_CURRENTLY_COMPLETES: Record<number, boolean> = {
        1: true, 2: true, 3: false, 4: true, 5: false,
        6: false, 7: false, 8: false, 9: false, 10: false,
    };

    const PLUS_CURRENTLY_COMPLETES: Record<number, boolean> = {
        1: true, 2: true, 3: false, 4: false, 5: false,
        6: false, 7: false, 8: false, 9: false, 10: false,
    };

    it.each(ALL_K)('reflex L subdivided %i times per edge', k => {
        expect(solvesCompletely(REFLEX_L, k)).toBe(L_CURRENTLY_COMPLETES[k]);
    });

    it.each(ALL_K)('double-reflex plus subdivided %i times per edge', k => {
        expect(solvesCompletely(DOUBLE_REFLEX_PLUS, k)).toBe(PLUS_CURRENTLY_COMPLETES[k]);
    });

    it('the L completes at 3 of 10 subdivision counts and the plus at 2 of 10', () => {
        expect(ALL_K.filter(k => solvesCompletely(REFLEX_L, k))).toEqual([1, 2, 4]);
        expect(ALL_K.filter(k => solvesCompletely(DOUBLE_REFLEX_PLUS, k))).toEqual([1, 2]);
    });
});

describe('subdivided edges: the two failure signatures (RECORDED DEFECT)', () => {
    it('L at k = 3 — the minimal case — strands exactly two interior edges', () => {
        const result = solveSkeleton(subdivideEdges(clockwise(REFLEX_L), 3));

        expect(result.complete).toBe(false);
        expect(result.diagnostics.map(diagnostic => diagnostic.kind)).toEqual(['unresolved-edges']);
        expect(result.diagnostics[0].detail).toContain('2 interior edge(s)');

        // Both are accepted-but-targetless: `handleCollisionEvent`'s `interiorNonAdjacent`
        // branch accepted them without ever calling `terminateEdgesAtPoint` on them.
        const stranded = result.graph.interiorEdges
            .filter(interior => result.graph.edges[interior.id].target === undefined)
            .map(interior => interior.id);
        expect(stranded).toEqual([42, 45]);
        expect(stranded.every(id => result.context!.isAccepted(id))).toBe(true);
    });

    it('L at k = 6 additionally raises the span-assignment failure', () => {
        const result = solveSkeleton(subdivideEdges(clockwise(REFLEX_L), 6));

        expect(result.complete).toBe(false);

        const stepFailures = result.diagnostics.filter(diagnostic => diagnostic.kind === 'step-failure');
        expect(stepFailures).toHaveLength(2);
        expect(stepFailures[0].detail).toBe('Unable to play interior edge 82 in any span: 15,16,17,4');
        expect(stepFailures[1].detail).toBe('Unable to play interior edge 85 in any span: 31,33,34,20');
    });
});
