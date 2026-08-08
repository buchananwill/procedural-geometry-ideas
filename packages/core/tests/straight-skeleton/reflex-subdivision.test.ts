import {isClockwise, setSkeletonLogLevel, solveSkeleton, Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  SPECIFICATION. Subdividing a polygon's edges must not change whether it solves.
 * ============================================================================
 *
 * Subdivision adds vertices without changing the shape: every added vertex is collinear with
 * its neighbours, so the straight skeleton of the subdivided polygon is the straight skeleton
 * of the original. It is therefore the cleanest possible stress test of the solver's event
 * handling — it manufactures exact simultaneity without changing the answer.
 *
 * This file used to record the opposite: reflex polygons failed at most subdivision counts
 * (the L at 3 of 10, the plus at 2 of 10) while convex ones passed at all of them. The
 * assertions below are the inversion of that record.
 *
 * ----------------------------------------------------------------------------
 * WHAT WAS WRONG, AND WHAT NOW HOLDS
 * ----------------------------------------------------------------------------
 *
 * Subdividing a *reflex* polygon puts several ring-partitioning events in a single offset
 * layer. A partitioning event is one whose participants are non-contiguous on the wavefront
 * ring — opposite stretches of wavefront meeting. A convex polygon produces at most one, at
 * the very end, when the ring closes; a reflex notch creates facing walls, and on these
 * fixtures the arms are of equal width, so several pinches happen at *exactly* the same offset.
 * Instrumented over the sweep, the count of partitioning events in one layer was 0 for the
 * convex hexagon at every k, 0 or 1 for every configuration that passed, and 3, 5, 9, 13 or 17
 * for every one that failed.
 *
 * Three things had to change, and all three are now in force:
 *
 *   1. `collision-handling.ts`, `interiorNonAdjacent`: the branch terminated the instigator and
 *      then `accept`ed the target without ever giving it a node. The reciprocal event could not
 *      repair that — by then both are accepted and the handler returns early — so 49 of 50 such
 *      events stranded their target. Both participants are now terminated, as `interiorPair`
 *      always did.
 *
 *   2. `handleInteriorNGon` resolves an offset layer as one event set *per ring*
 *      (`bisectionsForLayer`), computing the surviving arcs once against the union of every
 *      event's participants. It previously called `bisectionsForMerge` once per event against
 *      the whole, unmodified ring; that function's contract holds only when its event is the
 *      sole one removing edges from that ring in the layer, so three partitioning events
 *      produced six *overlapping* exterior-edge spans describing the same stretch several times.
 *
 *   3. The child sub-polygons come from `ringsOfSubPolygon` of the outgoing edges — connectivity
 *      — rather than from the exterior-edge spans of the partitioning events. Assignment took
 *      the first containing span, so the widest early span swallowed the edges of the ones
 *      nested inside it and four of six children came out empty. That removed the span sort,
 *      the same-start dedupe, and the `Unable to play interior edge ... in any span` throw
 *      outright.
 *
 * `mergesShareAnEdge`'s fallback survives all three, and is not a mask for any of them. It
 * fires when one edge arrives at two different points in the same layer, which is a whole ridge
 * collapsing at once rather than a set of vertex events — and no per-ring reduction can express
 * that, because the edge can only terminate on one node.
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

describe('subdivided edges: convex control', () => {
    it.each(ALL_K)('solves the square subdivided %i times per edge', k => {
        expect(solvesCompletely(SQUARE, k)).toBe(true);
    });

    it.each(ALL_K)('solves the irregular hexagon subdivided %i times per edge', k => {
        expect(solvesCompletely(IRREGULAR_HEXAGON, k)).toBe(true);
    });
});

describe('subdivided edges: reflex polygons', () => {
    it.each(ALL_K)('solves the reflex L subdivided %i times per edge', k => {
        expect(solvesCompletely(REFLEX_L, k)).toBe(true);
    });

    it.each(ALL_K)('solves the double-reflex plus subdivided %i times per edge', k => {
        expect(solvesCompletely(DOUBLE_REFLEX_PLUS, k)).toBe(true);
    });

    it('completes at every subdivision count, for both reflex shapes', () => {
        expect(ALL_K.filter(k => solvesCompletely(REFLEX_L, k))).toEqual(ALL_K);
        expect(ALL_K.filter(k => solvesCompletely(DOUBLE_REFLEX_PLUS, k))).toEqual(ALL_K);
    });
});

describe('subdivided edges: the two former failure signatures', () => {
    it('L at k = 3 — the minimal case — strands no interior edge', () => {
        const result = solveSkeleton(subdivideEdges(clockwise(REFLEX_L), 3));

        expect(result.diagnostics).toEqual([]);
        expect(result.complete).toBe(true);

        // e42 and e45 used to finish accepted-but-targetless, because
        // `handleCollisionEvent`'s `interiorNonAdjacent` branch accepted the target without
        // ever calling `terminateEdgesAtPoint` on it.
        const stranded = result.graph.interiorEdges
            .filter(interior => result.graph.edges[interior.id].target === undefined)
            .map(interior => interior.id);
        expect(stranded).toEqual([]);
    });

    it('L at k = 6 raises no span-assignment failure, because there are no longer spans', () => {
        const result = solveSkeleton(subdivideEdges(clockwise(REFLEX_L), 6));

        expect(result.diagnostics.filter(diagnostic => diagnostic.kind === 'step-failure')).toEqual([]);
        expect(result.complete).toBe(true);
    });
});
