import {isClockwise, setSkeletonLogLevel, solveSkeleton, Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  PART SPECIFICATION, PART RECORDED DEFECT. Read the split before editing.
 * ============================================================================
 *
 * Subdivision adds vertices without changing the shape: every added vertex is collinear with
 * its neighbours, so the straight skeleton of the subdivided polygon is the straight skeleton
 * of the original. That makes it the cleanest stress test of the solver's event handling — it
 * manufactures exact simultaneity without changing the answer.
 *
 * ----------------------------------------------------------------------------
 * WHAT WAS FIXED
 * ----------------------------------------------------------------------------
 *
 * `collision-handling.ts`, `interiorNonAdjacent`: the branch terminated the instigator and then
 * `accept`ed the target without ever giving it a node. The reciprocal event could not repair
 * that — by then both are accepted and the handler returns early — so 49 of 50 such events
 * stranded their target. Both participants are now terminated, as `interiorPair` always did.
 *
 * That single change took the double-reflex plus from 2 of 10 subdivision counts to 10 of 10,
 * and the reflex L from 3 of 10 to 6 of 10. It is an unconditional defect fix, independent of
 * reflex shapes or subdivision.
 *
 * ----------------------------------------------------------------------------
 * WHAT WAS DELIBERATELY NOT FIXED, AND WHY
 * ----------------------------------------------------------------------------
 *
 * The remaining L failures come from several ring-partitioning events landing in one offset
 * layer. `handleInteriorNGon` resolves each against the whole unmodified ring, so their
 * surviving-arc calculations overlap and contradict. A partitioning event is one whose
 * participants are non-contiguous on the ring — opposite stretches of wavefront meeting. A
 * convex polygon produces at most one, at the very end; a reflex notch creates facing walls,
 * and on this fixture the arms are of equal width, so several pinches happen at *exactly* the
 * same offset. Instrumented over the sweep, that count was 0 for the convex hexagon at every k,
 * 0 or 1 for every configuration that passed, and 3, 5, 9, 13 or 17 for every one that failed.
 *
 * A structural fix for it was written, landed, measured and then **reverted**. It worked — both
 * reflex shapes reached 10 of 10, out to k = 16 — but it bought nothing for any input this
 * project actually produces, and cost real complexity in the most delicate part of the solver.
 *
 * The measurement that settled it: hand-drawn strokes tracing an L and a cross, with per-axis
 * tremor at 0.5, 1.5 and 3.0 units, through three realistic stage combinations, budgeted and
 * solved — **288 of 288 before the structural fix, and 288 of 288 after**. Identical. Smoothing,
 * RDP and Schneider fitting all destroy the exact collinearity and exact even spacing this
 * defect requires, so no drawn region reaches the failing regime. The vertex budget also reduces
 * by RDP precisely so it never resamples uniformly.
 *
 * So this is a synthetic regime. If a future consumer ever feeds the solver exactly-subdivided
 * polygons — a mesh importer, a CAD interchange, a resample-to-N-points operation — revisit it;
 * the structural fix is recoverable from git history. Until then the failing counts are recorded
 * here rather than engineered around.
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

/** Subdivision counts at which the reflex L still fails. See the header. */
const REFLEX_L_KNOWN_FAILURES = [5, 6, 8, 10];

describe('subdivided edges: convex control (specification)', () => {
    it.each(ALL_K)('solves the square subdivided %i times per edge', k => {
        expect(solvesCompletely(SQUARE, k)).toBe(true);
    });

    it.each(ALL_K)('solves the irregular hexagon subdivided %i times per edge', k => {
        expect(solvesCompletely(IRREGULAR_HEXAGON, k)).toBe(true);
    });
});

describe('subdivided edges: double-reflex plus (specification)', () => {
    // Fixed outright by terminating the target in `interiorNonAdjacent`; this shape needed
    // nothing structural. It is a specification, not a record — a regression here is a bug.
    it.each(ALL_K)('solves the plus subdivided %i times per edge', k => {
        expect(solvesCompletely(DOUBLE_REFLEX_PLUS, k)).toBe(true);
    });
});

describe('subdivided edges: reflex L (part specification, part recorded defect)', () => {
    const expectedToSolve = ALL_K.filter(k => !REFLEX_L_KNOWN_FAILURES.includes(k));

    it.each(expectedToSolve)('solves the reflex L subdivided %i times per edge', k => {
        expect(solvesCompletely(REFLEX_L, k)).toBe(true);
    });

    it.each(REFLEX_L_KNOWN_FAILURES)(
        'currently fails to resolve the reflex L subdivided %i times per edge (known defect)',
        k => {
            expect(solvesCompletely(REFLEX_L, k)).toBe(false);
        },
    );

    it('has exactly the recorded failure set, so neither drift is silent', () => {
        expect(ALL_K.filter(k => !solvesCompletely(REFLEX_L, k))).toEqual(REFLEX_L_KNOWN_FAILURES);
    });
});

describe('subdivided edges: the stranded-target signature is fixed', () => {
    it('L at k = 3 — the former minimal case — strands no interior edge', () => {
        const result = solveSkeleton(subdivideEdges(clockwise(REFLEX_L), 3));

        expect(result.diagnostics).toEqual([]);
        expect(result.complete).toBe(true);

        // e42 and e45 used to finish accepted-but-targetless, because `handleCollisionEvent`'s
        // `interiorNonAdjacent` branch accepted the target without ever terminating it.
        const stranded = result.graph.interiorEdges
            .filter(interior => result.graph.edges[interior.id].target === undefined)
            .map(interior => interior.id);
        expect(stranded).toEqual([]);
    });

    it('L at k = 6 still fails, and does so through span assignment (known defect)', () => {
        const result = solveSkeleton(subdivideEdges(clockwise(REFLEX_L), 6));

        expect(result.complete).toBe(false);
        expect(result.diagnostics.some(diagnostic => diagnostic.kind === 'step-failure')).toBe(true);
    });
});
