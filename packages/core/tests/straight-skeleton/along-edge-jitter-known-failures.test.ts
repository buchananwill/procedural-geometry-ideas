import {
    setSkeletonLogLevel,
    SKELETON_NOISE_FLOOR,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';
import {
    OFF_EDGE_JITTER_L_SEED_15838,
    OFF_EDGE_JITTER_L_SEED_55433,
    OFF_EDGE_JITTER_PLUS_SEED_7919,
} from '@proc-geo/test-fixtures';

import {clockwise, JITTER_DOUBLE_REFLEX_PLUS, JITTER_REFLEX_L, jitteredSamples, jitterSweep} from './jitter-helpers';
import {oracleCausalityCounts, oracleViolationsOf, solverCausalityCounts} from './wavefront-measurement-helpers';

/*
 * ============================================================================
 *  A RECORDED DEFECT, PINNED AS IT STANDS. Read this before "fixing" a failure here.
 * ============================================================================
 *
 * `along-edge-jitter.test.ts` re-measured backlog item 2 and closed it: jitter ALONG a reflex
 * shape's edge lines is 0/80 in the default configuration at every magnitude, because on-line
 * samples deviate from their chord by float noise and canonicalisation removes them all.
 *
 * THE SAME SWEEP FOUND THE FAILURE HAD NOT DIED — IT HAD MOVED, AND IT MOVED INTO THE COLUMN THE
 * BACKLOG USES AS ITS CONTROL. Item 2 states that jitter with an off-edge component passes 80/80.
 * That is true far from the noise floor and false near it. At an off-edge magnitude of 1e-3 caller
 * units on a 300-unit shape the reflex L fails 22 of 80 cells and the double-reflex plus 46 of 80,
 * WITH THE DEFAULT SOLVER OPTIONS. This file is that failure pinned, and the three fixtures it
 * names are `packages/test-fixtures/src/near-floor-jitter.ts`.
 *
 * ----------------------------------------------------------------------------
 * WHY 1e-3 AND NOT SOME OTHER MAGNITUDE: A BAND, NOT A THRESHOLD
 * ----------------------------------------------------------------------------
 *
 * The noise floor is a unit-space constant and these shapes normalise by 256, so 1e-3 caller units
 * of off-edge displacement is about 3.9e-6 in unit space — a few times the 1e-6 floor. Large enough
 * to survive canonicalisation, small enough that the polygon is still near-degenerate. A decade
 * either side is quiet: at 1e-6 the stage removes the perturbation outright (0/80), and at 0.1 the
 * shape is ordinarily non-degenerate (1/80 on each). Measured over the five-magnitude sweep, with
 * the stage on:
 *
 *     magnitude   1e-9    1e-6    1e-3    0.1     1.0
 *     reflex L    0/80    0/80   22/80   1/80    0/80
 *     plus        0/80    0/80   46/80   1/80    0/80
 *
 * AND THE STAGE IS NOT WHAT CAUSES IT. The same sweep with `{noiseFloor: 0}` — the solver as it
 * behaved before the stage existed — is worse rather than better, and stays bad a further three
 * decades down, where the stage-on column has gone quiet:
 *
 *     magnitude   1e-9    1e-6    1e-3    0.1     1.0
 *     reflex L   10/80   20/80   30/80   1/80    0/80
 *     plus        0/80   69/80   53/80   1/80    0/80
 *
 * So canonicalisation is buying real ground here (69/80 down to 0/80 at 1e-6, for instance) and runs
 * out of it at 1e-3, where the perturbation clears the floor. The defect is the solver's, in the same
 * near-degenerate regime backlog items 2, 3 and 7 all sit in; the floor only sets where it starts.
 *
 * THIS IS THE REGIME THE BACKLOG ITEM SAYS MATTERS: "a real hand-drawn L-shaped or cross-shaped
 * region. Real strokes are near-degenerate, not exactly so." The pipeline as it stands still does
 * not reach it — smoothing, RDP and Schneider fitting destroy this geometry, and simulated strokes
 * score 288/288 — so this is a bound on the solver, not a broken feature.
 *
 * ----------------------------------------------------------------------------
 * WHAT TO DO WHEN A CELL STARTS PASSING
 * ----------------------------------------------------------------------------
 *
 * These assertions are the CURRENT behaviour, asserted exactly, and they fire in both
 * directions. If a count SHRINKS without a fixture flipping, something helped and the account above
 * needs re-measuring. If anything GROWS, the regime regressed. Do not adjust a number here to make
 * the suite green. Promotion out of `KNOWN_DEFECT_POLYGONS` is not this file's call: it is the
 * attributed census in `recursive-subdivision.test.ts` that reports a cure, and a fixture promotes
 * when its whole signature — census grid, causality counts, root diagnostics — reaches zero.
 *
 * ----------------------------------------------------------------------------
 * 2026-08-28: MOST OF THE CLASS IS CURED, AND WHAT SURVIVES IS SILENT
 * ----------------------------------------------------------------------------
 *
 * Journal decision 70 made `addBisectionEdge` choose a bisector's direction by its OFFSET RATE and
 * demoted `approximateDirection` to an anti-parallel tie-break, so a bisector can no longer be
 * flipped to run backwards through the wavefront. Re-measured, all three counts moved the good way,
 * and the two reflex-L fixtures now SOLVE:
 *
 *     magnitude 1e-3, stage on   before   after
 *     reflex L                    22/80    1/80
 *     double-reflex plus          46/80   13/80
 *
 * THEY SOLVE AND THEY ARE STILL WRONG, which is why they are enrolled as known defects rather than
 * as clean fixtures. Two things survive the cure, and neither is visible on `complete`:
 *
 *  - the recursive driver still cuts regions out of them that will not solve — 5, 10, 12 and 14
 *    failed regions on the census grid, pinned per fixture in `recursive-subdivision.test.ts`;
 *  - their skeletons break wavefront causality — nodes past their own clearance, edges terminating
 *    behind their own source — pinned per fixture in `wavefront-causality.test.ts`. Only the plus
 *    seed reports a diagnostic while doing it. The rest are silent wrong answers.
 *
 * ALL FOUR ARE SILENT NOW, and the change that made the fourth one so is recorded rather than
 * glossed: the parallel-vertex closure cures the plus seed's ROOT, so it reports `complete: true`
 * with no diagnostic beyond canonicalisation while its three direction violations stand unmoved. Its
 * root failure was the loud half of the class, and closing it is a strict improvement in the answer
 * — the graph is bit-identical apart from the two edges that had no target, and its strips now tile
 * to 1.5e-16 — but the last loud signature in this family is gone. What still records a defect for
 * these four is the attributed census, the causality table and the sub-floor pair pins, and nothing
 * a `complete` flag can carry.
 *
 * ----------------------------------------------------------------------------
 * WHERE THE REST OF THIS CLASS IS PINNED — journal decision 72, 2026-08-28
 * ----------------------------------------------------------------------------
 *
 * Exclusion is retired: all four `OFF_EDGE_JITTER_*` fixtures are in `KNOWN_DEFECT_POLYGONS` and are
 * swept alongside the clean roster. What remains HERE is what only this file measures — the
 * magnitude band, the two sweep counts, the canonicalisation arithmetic and the geometric premise
 * that these are resamplings of the reflex L rather than different shapes. The per-fixture
 * subdivision-failure counts that used to sit here moved into the attributed census, which is the
 * grid they were always measured on; containment moved into `skeleton-containment.test.ts`, which
 * now sweeps the full corpus.
 */

setSkeletonLogLevel('silent');

/*
 * SLOW ON PURPOSE, and for the same reason as `along-edge-jitter.test.ts`: an off-edge magnitude
 * above the floor leaves every inserted sample standing, so the plus's k = 10 cells are 120-vertex
 * solves. Measuring fewer cells would stop the counts being comparable to the 2026-08-09 record.
 */
jest.setTimeout(10 * 60 * 1000);

/** The magnitude that lands just above the unit-space noise floor. See the header. */
const NEAR_FLOOR_MAGNITUDE = 1e-3;

const OFF_EDGE = true;

function diagnosticKinds(polygon: Vector2[]): string[] {
    return solveSkeleton(polygon).diagnostics.map(diagnostic => diagnostic.kind);
}

describe('off-edge jitter just above the noise floor: the recorded defect', () => {
    /*
     * BOTH COUNTS FELL AGAIN ON 2026-08-28, UNDER JOURNAL DECISION 78, and this is the third
     * consecutive reading of the same class: 22 and 46 of 80 before decision 70, then 1 and 13, and
     * then 0 and 11. The render-floor coincidence bar was the cause — these are shapes whose facing
     * walls put many arrivals within a whisker of one point, which is exactly the configuration the
     * floor resolves into a single event instead of a scatter of near-misses.
     *
     * A CURE, NOT A SOFTENING, AND ATTRIBUTED AS ONE. The reflex L's last failing cell went at that
     * reading and the plus kept eleven; the plus's failing counts moved from [2,4,6,7,8,9,10] to
     * [2,3,4,5,6,8,9,10] — count 7 cured, counts 3 and 5 newly failing — which is a different SET
     * rather than a subset, so this is re-measured per cell and not inferred from the totals.
     *
     * THE FOURTH READING, and the one that took the fixture cell: the parallel-vertex closure in
     * `algorithm-termination-cases.ts` gives a terminal sub-polygon whose wavefront vertices all
     * travel the same way somewhere to close, which is what the plus's k = 2 cell — the fixture
     * `OFF_EDGE_JITTER_PLUS_SEED_7919` — died in. 11 of 80 becomes 10, count 2 leaving the set.
     *
     * WHY ONLY ONE CELL, when the same terminal shape was measured on five of the eleven. The
     * closure is gated on the sub-polygon's exterior parents being PARALLEL, which is the regime it
     * is a closure for rather than a cover-up (see the gate's own comment). The plus's k = 2 cell has
     * two walls on ONE supporting line, exactly parallel; the other four have walls a few times
     * epsilon off parallel — 1.7e-7 to 1.1e-4 in cross product — and are refused. The remaining ten
     * are that near-parallel case, plus near-head-on pairs missing each other laterally and failures
     * in the n-gon partition rather than in a base case.
     */

    it('fails no cell at all on the reflex L, at the default noise floor', () => {
        // Was 22 of 80 on counts [3,5,6,7,8,9,10] before journal decision 70, then 1 of 80 on
        // count [2] until decision 78 took the last one. The sweep is kept rather than deleted: a
        // zero that is asserted is what makes this class's return loud.
        expect(jitterSweep(JITTER_REFLEX_L, NEAR_FLOOR_MAGNITUDE, OFF_EDGE, SKELETON_NOISE_FLOOR))
            .toEqual({failed: 0, failingCounts: []});
    });

    it('fails 2 of 80 cells on the double-reflex plus, at the default noise floor', () => {
        // Was 46 of 80 before decision 70, 13 of 80 after it, 11 under decision 78 and 10 once the
        // parallel-vertex closure took count 2. The plus keeps more of the class than the L because
        // its facing walls are exactly parallel whatever the jitter does, which is a degeneracy
        // neither the direction rule nor the coincidence floor addresses.
        //
        // THE FIFTH READING, 2026-08-29, ATTRIBUTED TO THE ARRIVAL ORDERING (journal decision 102):
        // 10 of 80 becomes 4, and the set moves from [3,4,5,6,8,9,10] to [3,7,8,10] — counts 4, 5,
        // 6 and 9 cured, count 7 newly failing, so this is re-measured per cell rather than inferred
        // from the totals. The mechanism is the same one the fold population records: the pairwise
        // fallback in `handleInteriorNGon` used to pair a collapsing ring by edge id, and pairing it
        // by arrival instead removes the sub-visible duplicate ridges that these cells died on.
        //
        // THE SIXTH READING, 2026-08-29, ATTRIBUTED TO THE EARLIEST-ARRIVAL NARROWING of that same
        // fallback: 4 of 80 becomes 3, and the set moves from [3,7,8,10] to [3,8,10] — count 7,
        // which the fifth reading had newly broken, is cured and nothing new fails, so this reading
        // is a strict subset and the attribution needs no per-cell reconciliation. The mechanism is
        // the next step of the same argument: ordering a refused layer by arrival was not enough
        // while the whole layer was still CONSUMED in one step, and narrowing it to one arrival
        // moment is what makes the ordering load-bearing.
        //
        // THE SEVENTH READING, 2026-09-23, ATTRIBUTED TO `solveParallelClosure`'S PARENT GATE AT THE
        // ANGULAR RESOLUTION (spec open decision O2, ruled by measurement under journal decision
        // 146): 3 of 80 becomes 2, and the set moves from [3,8,10] to [8,10] — a strict subset. The
        // cured cell is k = 3, seed 47514, measured with the gate at the resolution and at the old
        // 1e-8 with every other site at its new bar: the two differ in that cell alone, and it goes
        // from a step failure to a complete solve with zero offset, clearance and direction
        // violations. The derived resolution itself (1.7721e-5 at this floor) moves nothing else on
        // the 80 cells' verdicts.
        //
        // JOURNAL DECISION 145's EDGE-COUNT-INDEPENDENT LADDER DOES NOT REACH THE TWO THAT REMAIN.
        // Both — k = 8, seed 47514 and k = 10, seed 31676 — die in the TWO-EDGE base case, which
        // already climbed the whole ladder: two mid-line bisectors with BIT-IDENTICAL bases, running
        // the same way, their sources 8.5e-6 and 3.9e-6 apart along the line and a few 1e-8 across
        // it in unit space. The parallel closure refuses them on its parent gate — their exterior
        // walls are skewed by sines of 1.13e-4 and 6.4e-5, beyond the resolution (measured) — and,
        // inferred rather than traced, the degenerate closure refuses them because
        // the point-on-ray test is still at the scratch epsilon (see `pointLiesOnRay`), and the
        // completion needs an ANTI-parallel pair, so no candidate exists and the throw stands. They
        // are the "near-parallel walls" class of the fourth reading, not the n-gon class.
        expect(jitterSweep(JITTER_DOUBLE_REFLEX_PLUS, NEAR_FLOOR_MAGNITUDE, OFF_EDGE, SKELETON_NOISE_FLOOR))
            .toEqual({failed: 2, failingCounts: [8, 10]});
    });

    it('carries one MOVED AND FLAGGED cell: the plus at k = 10, seed 23757, still complete', () => {
        // JOURNAL DECISION 147. Attributed to `intersectRays`' parallel gate moving from the retired
        // 1.4142e-4 to the angular resolution (1.7721e-5 at this floor; journal decision 146),
        // measured by holding that one site at its old bar with every other site at its new one:
        // the gate move alone gives this cell ONE offset violation and ONE direction violation it
        // did not have at 7faae16 (0 and 0), while it still solves complete. Not a failing cell, so
        // the sweep count above cannot see it; pinned here with its counts so that a change which
        // cures or worsens it is loud.
        const vertices = jitteredSamples(clockwise(JITTER_DOUBLE_REFLEX_PLUS), 10, 23757, NEAR_FLOOR_MAGNITUDE, OFF_EDGE);
        const result = solveSkeleton(vertices);
        const found = oracleViolationsOf(result, SKELETON_NOISE_FLOOR);

        expect(result.complete).toBe(true);
        expect({
            offset: found.offset.length,
            clearance: found.clearance.length,
            direction: found.direction.length,
        }).toEqual({offset: 1, clearance: 0, direction: 1});
        // Journal-5 decision 148: the solver reports both violations itself — the same edge, e270,
        // 7.6e-6 back in time and 0.23 behind its source in unit space — and its count agrees with
        // the oracle's. `complete` is unmoved.
        expect(solverCausalityCounts(result)).toEqual({offset: 1, clearance: 0, direction: 1});
        expect(solverCausalityCounts(result)).toEqual(oracleCausalityCounts(result, SKELETON_NOISE_FLOOR));
    });
});

describe('OFF_EDGE_JITTER_L_SEED_15838: the two clusters the user circled', () => {
    /*
     * THE SHAPE IN `examples/several things wrong with first solve.png` AND ITS SEQUEL, pinned by
     * POSITION rather than by node id so that a renumbering cannot quietly move what is asserted.
     *
     * The reflex L's corridor and its band each end in a place where four walls are equidistant, and
     * the wavefront reaches each of them as two events a fraction of a pixel apart: 8.0e-5 caller
     * units at (175, 300) and 1.9e-4 at (175, 175), on a 300-unit shape — a 7480x and a 3209x zoom
     * respectively to put two pixels between the nodes they produced. A dashboard inspection saw two
     * node labels printed on top of each other and called it a failure to merge; it was right.
     *
     * ONE OF THE TWO IS NOW ONE NODE (journal decision 78). At (175, 300) both events land in one
     * offset layer, so the render-floor coincidence rule resolves them into a single terminal node
     * carrying the union of their arrivals — the four bisectors [2,1], [7,6], [1,7] and [6,2], which
     * is what the geometry has. At (175, 175) the two events are 52 epsilons apart in time and fall
     * in different layers, so the clustering never sees them together and the pair stands. Both are
     * asserted here, the resolved one and the unresolved one, because the second is the measurement
     * that says what decision 83's withdrawn half was for.
     */

    /** Nodes of the solved graph within `radius` of a caller-space point. */
    function nodesNear(x: number, y: number, radius: number) {
        const {graph} = solveSkeleton(OFF_EDGE_JITTER_L_SEED_15838);
        return graph.nodes.filter(node =>
            Math.hypot(node.position.x - x, node.position.y - y) < radius);
    }

    it('resolves the corridor cluster at (175, 300) into ONE node of the four arrivals', () => {
        const cluster = nodesNear(175, 300, 0.5);

        expect(cluster).toHaveLength(1);
        // Terminal, and carrying every bisector that reaches the point: the two wall bisectors
        // travelling towards each other across the corridor, and the two spine segments arriving
        // along it. Nothing leaves, because this is where the corridor closes.
        expect(cluster[0].outEdges).toEqual([]);
        expect(cluster[0].inEdges).toHaveLength(4);
        expect([...cluster[0].inEdges].sort((a, b) => a - b)).toEqual([17, 22, 36, 38]);
    });

    it('leaves the band cluster at (175, 175) as two nodes, 1.9e-4 apart', () => {
        // NOT A DEFECT OF THE CLUSTERING BUT THE LIMIT OF ITS REACH, and pinned as the measurement
        // that a fix has to move. `graph-index-invariants.test.ts` carries this pair as one of the
        // five the corpus still has under the floor. (2026-09-23: I2 no longer pins its sub-floor
        // pairs; under journal decision 141 it admits a pair joined by an edge across two offset
        // layers, and 15838's one historical pair is asserted admitted there.)
        const cluster = nodesNear(175, 175, 0.5);

        expect(cluster).toHaveLength(2);
        const separation = Math.hypot(
            cluster[0].position.x - cluster[1].position.x,
            cluster[0].position.y - cluster[1].position.y);
        expect(separation).toBeGreaterThan(1e-4);
        expect(separation).toBeLessThan(2e-4);
    });
});

describe('OFF_EDGE_JITTER_L_SEED_55433: the specimen of the class', () => {
    /*
     * The one fixture canonicalisation does not touch. Its value WAS that it foreclosed the easy
     * misreading of the other two — that what fails is a ring left ragged by partial removal.
     * Nothing is removed here: all eighteen vertices are above the floor.
     *
     * IT NOW SOLVES (journal decision 70), and it is pinned solving so that it cannot quietly stop.
     * What it still could not do was survive being SUBDIVIDED, and its own skeleton terminated two
     * edges behind their source while reporting nothing — the two measurements that kept it on the
     * defect roster. Both went to zero on 2026-08-29, and on 2026-09-23 journal decision 141 ruled
     * its two I2 sub-floor pairs admissible. Promotion was measured that day and refused by other
     * clean-roster bars — see its `CENSUS_SIGNATURES` row in `recursive-subdivision.test.ts`.
     */

    it('loses no vertex to canonicalisation, and now solves completely', () => {
        const result = solveSkeleton(OFF_EDGE_JITTER_L_SEED_55433);

        expect(OFF_EDGE_JITTER_L_SEED_55433).toHaveLength(18);
        expect(result.graph.numExteriorNodes).toBe(18);
        expect(result.complete).toBe(true);
        expect(result.diagnostics).toEqual([]);
    });

    it('is still the reflex L to within a thousandth of a unit', () => {
        // The premise the whole measurement rests on, made checkable: this is a resampling of the
        // fixture, not a different shape. Every original corner is present exactly, and every
        // inserted sample sits within the jitter magnitude of the edge it was placed on.
        for (const corner of JITTER_REFLEX_L) {
            expect(OFF_EDGE_JITTER_L_SEED_55433).toContainEqual(corner);
        }
        for (const vertex of OFF_EDGE_JITTER_L_SEED_55433) {
            expect(distanceToBoundary(vertex, JITTER_REFLEX_L)).toBeLessThan(2e-3);
        }
    });
});

describe('the two fixtures canonicalisation reaches', () => {
    it('OFF_EDGE_JITTER_L_SEED_15838 loses three samples and now solves', () => {
        const result = solveSkeleton(OFF_EDGE_JITTER_L_SEED_15838);

        expect(OFF_EDGE_JITTER_L_SEED_15838).toHaveLength(18);
        expect(result.graph.numExteriorNodes).toBe(15);
        // Solves since journal decision 70; the canonicalisation diagnostic is the only one left,
        // and it reports a removal rather than a failure. See the header for why it stays here.
        expect(result.complete).toBe(true);
        expect(diagnosticKinds(OFF_EDGE_JITTER_L_SEED_15838)).toEqual(['vertices-canonicalised']);
    });

    it('OFF_EDGE_JITTER_PLUS_SEED_7919 loses four samples and now solves', () => {
        // IT USED TO FAIL HERE, leaving interior edges 44 and 58 without a target node, and the
        // mechanism is worth keeping because it is what the removal CAUSES. Both discarded samples
        // on the plus's left wall sat on the segments x = 200; removing them rejoins exterior edges
        // 0 and 7 onto ONE supporting line, which is the non-adjacent shared-line degeneracy. The
        // solve then reduces to a two-edge sub-polygon over that single line — zero enclosed area,
        // both wavefront vertices travelling +x side by side, no collision possible at any offset —
        // and the parallel-vertex closure in `algorithm-termination-cases.ts` terminates it at the
        // leading source. The fixture stays on the defect roster: its census and causality
        // signatures are not zero.
        const result = solveSkeleton(OFF_EDGE_JITTER_PLUS_SEED_7919);

        expect(OFF_EDGE_JITTER_PLUS_SEED_7919).toHaveLength(24);
        expect(result.graph.numExteriorNodes).toBe(20);
        expect(result.complete).toBe(true);
        expect(diagnosticKinds(OFF_EDGE_JITTER_PLUS_SEED_7919)).toEqual(['vertices-canonicalised']);
    });

    it('discards deviations just UNDER the floor, which is what makes these near-degenerate', () => {
        // The whole defect in two numbers. Both fixtures were jittered by the same 1e-3, and what
        // separates a removed sample from a surviving one is a draw landing either side of a
        // deviation of about 1e-6 in unit space. The survivors sit a hair above it.
        for (const fixture of [OFF_EDGE_JITTER_L_SEED_15838, OFF_EDGE_JITTER_PLUS_SEED_7919]) {
            const detail = solveSkeleton(fixture).diagnostics[0].detail;
            const discarded = Number(/largest discarded deviation ([\d.e-]+)\./.exec(detail)?.[1]);

            expect(discarded).toBeGreaterThan(1e-7);
            expect(discarded).toBeLessThan(SKELETON_NOISE_FLOOR);
        }
    });
});

/** Distance from `point` to the closest edge of the closed ring `polygon`. */
function distanceToBoundary(point: Vector2, polygon: Vector2[]): number {
    let closest = Infinity;
    for (let index = 0; index < polygon.length; index++) {
        const from = polygon[index];
        const to = polygon[(index + 1) % polygon.length];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const lengthSquared = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
        closest = Math.min(closest, Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy)));
    }
    return closest;
}
