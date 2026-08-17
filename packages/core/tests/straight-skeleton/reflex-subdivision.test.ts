import {isClockwise, setSkeletonLogLevel, SKELETON_NOISE_FLOOR, solveSkeleton, Vector2} from '@proc-geo/core';

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
 * BOTH FAILURE LISTS ARE NOW EMPTY, AND INPUT CANONICALISATION IS WHY
 * ----------------------------------------------------------------------------
 *
 * `REFLEX_L_KNOWN_FAILURES` was [5, 6, 8, 10] and `DOUBLE_REFLEX_PLUS_KNOWN_FAILURES` was [9].
 * Both are empty. The reflex L and the double-reflex plus solve at every k from 1 to 10.
 *
 * THE DEFECT UNDERNEATH IS UNTOUCHED. Nothing was fixed in `handleInteriorNGon`; the input class
 * that triggered it no longer reaches the solver. Subdividing an edge into k pieces adds vertices
 * that are collinear with their neighbours and nothing else, so they deviate from the chord
 * between those neighbours by around 1e-16 in unit space — invisible against a 1e-6 noise floor.
 * The canonicalisation stage removes them and hands the solver back the unsubdivided fixture,
 * which always passed. The failing input is gone rather than handled, which is the whole argument
 * of the stage: removing an input class beat the several hundred lines the structural fix cost.
 *
 * The failing sets are NOT deleted here, they are repinned against the stage turned off, where
 * they still reproduce exactly. That does two jobs at once. It preserves the evidence, and it
 * convicts the gate: an empty list means nothing unless the same list is non-empty when the thing
 * that empties it is switched off.
 *
 * ----------------------------------------------------------------------------
 * WHAT THE UNDERLYING DEFECT WAS, KEPT BECAUSE IT IS STILL THERE
 * ----------------------------------------------------------------------------
 *
 * The L failures came from several ring-partitioning events landing in one offset layer.
 * `handleInteriorNGon` resolves each against the whole unmodified ring, so their surviving-arc
 * calculations overlap and contradict. A partitioning event is one whose participants are
 * non-contiguous on the ring — opposite stretches of wavefront meeting. A convex polygon produces
 * at most one, at the very end; a reflex notch creates facing walls, and on this fixture the arms
 * are of equal width, so several pinches happen at *exactly* the same offset. Instrumented over
 * the sweep, that count was 0 for the convex hexagon at every k, 0 or 1 for every configuration
 * that passed, and 3, 5, 9, 13 or 17 for every one that failed.
 *
 * A structural fix for it was written, landed, measured and then **reverted**. It worked — both
 * reflex shapes reached 10 of 10, out to k = 16 — but it bought nothing for any input this
 * project actually produces, and cost real complexity in the most delicate part of the solver. It
 * remains recoverable from git history, and remains the answer if a future input ever reaches this
 * regime while carrying vertices that are genuinely visible.
 *
 * The measurement that settled it: hand-drawn strokes tracing an L and a cross, with per-axis
 * tremor at 0.5, 1.5 and 3.0 units, through three realistic stage combinations, budgeted and
 * solved — **288 of 288 before the structural fix, and 288 of 288 after**. Identical. Smoothing,
 * RDP and Schneider fitting all destroy the exact collinearity and exact even spacing this
 * defect requires, so no drawn region reaches the failing regime.
 *
 * ----------------------------------------------------------------------------
 * THE PLUS'S k = 9 WAS AN OPEN REGRESSION. IT IS CLOSED, AND HERE IS THE CHAIN.
 * ----------------------------------------------------------------------------
 *
 * That entry was recorded as a bug rather than a limitation, so it is closed explicitly rather
 * than allowed to lapse.
 *
 * Task 236 changed the solver's boundary normalisation to scale by the power of two NEAREST the
 * longest bounding-box side instead of by the side itself, so that normalise/denormalise is
 * bit-exactly invertible. Every fixture in this file spans exactly 300 units, so the OLD scale
 * was exactly 300 — and dividing by exactly the span is what made a uniformly subdivided edge
 * come out uniformly subdivided IN UNIT SPACE, on the bit: edge vector over span is exactly 1, so
 * vertex j landed exactly on `corner + j / k`. Under a scale of 256 it does not, and the several
 * ring-partitioning events this fixture lands in a single offset layer stopped being bit-identical
 * to each other.
 *
 * So the old scale was CANONICALISING this input by accident, and k = 9 passing was a property of
 * the scale rather than of the solver. The stage now canonicalises it on purpose, which is why
 * this is a fix and not a second accident: it does not depend on the fixture's span sharing a
 * factor with the normalisation scale. Confirmed at the time that it was never a
 * tolerance-against-magnitude problem — taking the scale exponent by `Math.ceil` and by
 * `Math.floor`, opposite directions of relative epsilon, reproduced the identical failure set, and
 * rescaling a fixture to span exactly 256 shuffled the set's membership without changing its size.
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

/** Deterministic sampler, so an irregular insertion either always reproduces or never appears. */
function makeRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/**
 * Insert `count` vertices per edge at pseudo-random parameters, preserving winding and the corners.
 *
 * The parameters are sorted along each edge and held away from 0 and 1, so the inserted vertices
 * stay strictly between the corners and in boundary order. An insertion that overshot a corner
 * would be a different silhouette rather than a different spelling of the same one.
 */
function insertIrregularly(polygon: Vector2[], count: number, seed: number): Vector2[] {
    const random = makeRandom(seed);
    const vertices: Vector2[] = [];
    for (let index = 0; index < polygon.length; index++) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        vertices.push(from);

        const parameters = Array.from({length: count}, () => 0.05 + random() * 0.9).sort((a, b) => a - b);
        for (const t of parameters) {
            vertices.push({x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t});
        }
    }
    return vertices;
}

function solvesCompletely(polygon: Vector2[], k: number): boolean {
    return solveSkeleton(subdivideEdges(clockwise(polygon), k)).complete;
}

/**
 * As {@link solvesCompletely}, with input canonicalisation switched off.
 *
 * A zero noise floor is an exact identity in the stage — the comparison against it is strict — so
 * this is the solver as it behaved before the stage existed, reached through the public option
 * rather than through a seam in the solver.
 */
function solvesCompletelyUncanonicalised(polygon: Vector2[], k: number): boolean {
    return solveSkeleton(subdivideEdges(clockwise(polygon), k), {noiseFloor: 0}).complete;
}

const ALL_K = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Subdivision counts at which the reflex L failed BEFORE input canonicalisation, and still fails
 * with the stage switched off. Kept, rather than deleted, so the empty set below means something.
 */
const REFLEX_L_FAILURES_WITHOUT_CANONICALISATION = [5, 6, 8, 10];

/**
 * The same for the double-reflex plus. This was the OPEN regression the power-of-two normalisation
 * scale introduced — see the header for why the stage closes it rather than papering over it.
 */
const PLUS_FAILURES_WITHOUT_CANONICALISATION = [9];

describe('subdivided edges: convex control (specification)', () => {
    it.each(ALL_K)('solves the square subdivided %i times per edge', k => {
        expect(solvesCompletely(SQUARE, k)).toBe(true);
    });

    it.each(ALL_K)('solves the irregular hexagon subdivided %i times per edge', k => {
        expect(solvesCompletely(IRREGULAR_HEXAGON, k)).toBe(true);
    });
});

describe('subdivided edges: double-reflex plus (specification)', () => {
    it.each(ALL_K)('solves the plus subdivided %i times per edge', k => {
        expect(solvesCompletely(DOUBLE_REFLEX_PLUS, k)).toBe(true);
    });

    it('fails at nothing, so drift in either direction is loud', () => {
        expect(ALL_K.filter(k => !solvesCompletely(DOUBLE_REFLEX_PLUS, k))).toEqual([]);
    });
});

describe('subdivided edges: reflex L (specification)', () => {
    it.each(ALL_K)('solves the reflex L subdivided %i times per edge', k => {
        expect(solvesCompletely(REFLEX_L, k)).toBe(true);
    });

    it('fails at nothing, so drift in either direction is loud', () => {
        expect(ALL_K.filter(k => !solvesCompletely(REFLEX_L, k))).toEqual([]);
    });
});

describe('the emptied lists are the canonicalisation stage\'s doing, and not a weakened gate', () => {
    /*
     * An empty failure list is worth nothing on its own — deleting the assertions would produce
     * one just as well. These two reproduce the exact historical sets with the stage switched off,
     * so the lists above are convicted by mutation rather than trusted.
     */

    it('reproduces the reflex L\'s recorded failures exactly when the stage is off', () => {
        expect(ALL_K.filter(k => !solvesCompletelyUncanonicalised(REFLEX_L, k)))
            .toEqual(REFLEX_L_FAILURES_WITHOUT_CANONICALISATION);
    });

    it('reproduces the plus\'s recorded regression exactly when the stage is off', () => {
        expect(ALL_K.filter(k => !solvesCompletelyUncanonicalised(DOUBLE_REFLEX_PLUS, k)))
            .toEqual(PLUS_FAILURES_WITHOUT_CANONICALISATION);
    });

    it('holds for irregularly inserted vertices too, which is a different failure set', () => {
        /*
         * Decision 11: probe irregular insertion parameters as well as equal ones, because equal
         * subdivision is a special input — it manufactures exact simultaneity and exactly equal
         * spacing that irregular insertion never produces.
         *
         * PROBING BOTH IS LOAD-BEARING RATHER THAN THOROUGH, and this is the measurement that shows
         * it. With the stage switched off the two families catch DIFFERENT failures: the reflex L
         * fails 4 of 10 regular counts and 0 of 10 irregular seeds, while the double-reflex plus is
         * the other way round at 1 of 10 regular and 4 of 10 irregular. A suite probing either
         * family alone would have declared one of these two shapes clean. With the stage on, both
         * are 0 of 10 either way.
         */
        const seeds = Array.from({length: 10}, (_unused, index) => (index + 1) * 7919);
        const fails = (polygon: Vector2[], floor: number): number =>
            seeds.filter(seed => !solveSkeleton(
                insertIrregularly(clockwise(polygon), 2, seed), {noiseFloor: floor}).complete).length;

        expect(fails(REFLEX_L, SKELETON_NOISE_FLOOR)).toBe(0);
        expect(fails(DOUBLE_REFLEX_PLUS, SKELETON_NOISE_FLOOR)).toBe(0);

        // The conviction, and the asymmetry that makes probing both families necessary.
        expect(fails(REFLEX_L, 0)).toBe(0);
        expect(fails(DOUBLE_REFLEX_PLUS, 0)).toBe(4);
    });

    it('removes only the inserted vertices, restoring the fixture the solver always handled', () => {
        // The mechanism, asserted rather than described: at every k the canonicalised polygon is
        // back to the six corners the fixture was authored with. If this stopped holding, the
        // lists above could go empty for some other reason and nothing would say so.
        for (const k of ALL_K) {
            const result = solveSkeleton(subdivideEdges(clockwise(REFLEX_L), k));
            expect(result.graph.numExteriorNodes).toBe(REFLEX_L.length);
        }
    });
});

describe('subdivided edges: the stranded-target signature is fixed', () => {
    it('L at k = 3 — the former minimal case — strands no interior edge', () => {
        const result = solveSkeleton(subdivideEdges(clockwise(REFLEX_L), 3));

        // The canonicalisation report is the only diagnostic, and it is informational: 12 inserted
        // vertices removed, none of which the silhouette ever had.
        expect(result.diagnostics.map(diagnostic => diagnostic.kind)).toEqual(['vertices-canonicalised']);
        expect(result.complete).toBe(true);

        // e42 and e45 used to finish accepted-but-targetless, because `handleCollisionEvent`'s
        // `interiorNonAdjacent` branch accepted the target without ever terminating it.
        const stranded = result.graph.interiorEdges
            .filter(interior => result.graph.edges[interior.id].target === undefined)
            .map(interior => interior.id);
        expect(stranded).toEqual([]);
    });

    it('L at k = 6 now resolves, and still fails through span assignment with the stage off', () => {
        // Both halves matter. The first is the new specification; the second pins the failure mode
        // the stage removes, so "k = 6 passes" cannot come to mean "k = 6 stopped being measured".
        expect(solveSkeleton(subdivideEdges(clockwise(REFLEX_L), 6)).complete).toBe(true);

        const uncanonicalised = solveSkeleton(subdivideEdges(clockwise(REFLEX_L), 6), {noiseFloor: 0});
        expect(uncanonicalised.complete).toBe(false);
        expect(uncanonicalised.diagnostics.some(diagnostic => diagnostic.kind === 'step-failure')).toBe(true);
    });
});
