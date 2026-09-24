import {
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    SKELETON_NOISE_FLOOR,
    makeSkeletonNormalisation,
    normalisePosition,
    setSkeletonLogLevel,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';
import {NEAR_REGULAR_CIRCLE_48, NEAR_REGULAR_ROSETTE5_40} from '@proc-geo/test-fixtures';
import {place} from './placement-helpers';
import {oracleCausalityCounts, solverCausalityCounts} from './wavefront-measurement-helpers';

/*
 * ============================================================================
 *  TWO RECORDED DEFECTS, PINNED AS THEY STAND. Read this before "fixing" a failure here.
 * ============================================================================
 *
 * `NEAR_REGULAR_CIRCLE_48` and `NEAR_REGULAR_ROSETTE5_40` are in `KNOWN_DEFECT_POLYGONS` on the
 * large-coordinate envelope, and this file is the only sweep that separates them from the clean
 * roster: both are clean at their native placement, both contribute zero to the recursive-subdivision
 * census, and both hold every wavefront invariant. THE TRANSLATION CELLS BELOW ARE THEIR WHOLE
 * SIGNATURE. It asserts the CURRENT FAILING BEHAVIOUR, exactly, and fires in both directions. If a
 * cell starts passing, promote that fixture into `CLEAN_TEST_POLYGONS` — see the near-regular fixture
 * header for the count pins the promotion moves — and delete its block here. If a passing cell
 * starts failing, the envelope regressed.
 *
 * WHAT THE ENVELOPE IS. `large-coordinate-failures.test.ts` asserts that every corpus fixture
 * survives solve, offset projection and strip decomposition at translations up to 1e11 and scales
 * up to 1e8. These two survive everything that suite asserts except one cell each.
 *
 * WHAT WAS RE-MEASURED, 2026-08-27 (journal F14). The two blockers those exclusion headers were
 * written against — the translation-to-1e9 envelope and the many-way-event offset projection —
 * are dead on all eight historically excluded fixtures. What survives is these two cells alone.
 *
 * CIRCLE 48 FAILS AT TRANSLATION 1e10 ONLY, AND NON-MONOTONICALLY: 1e9 passes and 1e11 passes.
 * That rules out a monotone precision-loss story. It is signalled — `step-failure` plus
 * `unresolved-edges` — not a silent wrong answer, so no consumer reads it as a skeleton.
 *
 * ROSETTE5 40 FAILS AT TRANSLATION 1e11 ONLY, in a two-edge base case whose two source nodes sit
 * about 6e-8 apart in unit space, inside `FLOATING_POINT_EPSILON` (1e-8) of each other on the
 * terminal ring but not close enough to be merged. That is the terminal-ring-finer-than-tolerance
 * regime journal decision 54 leaves open, and it is the evidence this fixture exists to carry: the
 * failure mode SHIFTED into it when the double-split partition fix landed (journal F15b), so a
 * change here is a change in that regime rather than in the partition layer.
 *
 * ----------------------------------------------------------------------------
 * ROOT-CAUSED 2026-08-28, AND THE TWO CELLS ARE ONE DEFECT, NOT TWO
 * ----------------------------------------------------------------------------
 *
 * Both fixtures now die at the SAME site and by the same comparison, so the two blocks below are
 * two samples of one class rather than two defects. The proximate failure is
 * `handleInteriorEdgePair` (`algorithm-termination-cases.ts:259`): the two-edge base case asks
 * `intersectRays` to classify the pair, and the terminal close it wants is the `identical-source`
 * branch at `intersection-edges.ts:46`, whose test is `areEqual(distanceToRay2, 0)` — an ABSOLUTE
 * `FLOATING_POINT_EPSILON` of `1e-8` against the separation of the two source nodes. Circle 48 at
 * 1e10 misses it by 1.72x (separation 1.718e-8 in unit space); Rosette5 40 at 1e11 misses it by
 * 5.99x (5.992e-8). Having missed it, Circle 48's residual pair carries BIT-IDENTICAL basis
 * vectors and is classified `parallel` (`intersection-edges.ts:62`) while the rosette's is
 * classified `diverging` (`intersection-edges.ts:90`); either way no collision exists and
 * `algorithm-termination-cases.ts:334` throws.
 *
 * WHY THERE ARE TWO NODES WHERE THERE SHOULD BE ONE. Translation quantises the input: at 1e10 a
 * double's ulp is 1.907e-6 caller units, which the unit-extent scale of 256 carries to 7.451e-9 in
 * unit space — 0.75 of the epsilon. The fixture is NEAR-regular, so its 48 terminal arrivals are
 * congruent to within the last bits; that quantisation scatters them by an appreciable fraction of
 * the tolerance, and the solver then merges SOME of them and not others. The offset layer is
 * selected by an absolute window (`algorithm-complex-cases.ts:80-90`) and the arrivals inside one
 * layer are clustered by connected components under `vectorsAreEqual`
 * (`coincident-events.ts:132`); the clustering is transitive, the layer window is not, so a
 * convergence whose offsets straddle the window is cut across successive layers and each layer
 * merges only the part it can see. The measured signature, pinned below: natively and at 1e9 the
 * 48-way convergence is ONE node of in-degree 48; at 1e10 it is FOURTEEN nodes with in-degrees
 * 2,2,2,2,2,2,2,2,8,8,8,8,13,3 — the half-merged state — and at 2e10 it is thirty-three nodes of
 * in-degree 2 and 3, an ordinary sequence of small events, which SOLVES.
 *
 * THAT IS THE NON-MONOTONICITY, AND IT IS A LOTTERY RATHER THAN A BAND. Three regimes: scatter far
 * below the tolerance (one clean many-way merge, passes), scatter comparable to it (partial merge,
 * fails), scatter far above it (cleanly separated ordinary events, passes). Which side of the
 * middle regime a given translation lands on is a property of that translation's rounding pattern,
 * so the decade-spaced enrolment sweep sees one cell per fixture by sampling luck. A finer grid
 * does not: the block at the bottom of this file pins it, and 1e10 is NOT the only failing
 * translation for Circle 48.
 *
 * ----------------------------------------------------------------------------
 * CURED 2026-09-23 BY `intersectRays`' COLLINEARITY EXITS MOVING TO THE COAXIAL FORM (spec A15's
 * row; journal decisions 147(e) and 150, dispatch 2 of the angular package)
 * ----------------------------------------------------------------------------
 *
 * Every failing cell this file pinned now COMPLETES — Circle 48's twenty-nine fine translations and
 * Rosette5 40's fifteen, and both decade cells. The mechanism is the one the header names, closed
 * from the other side: the half-merged hub leaves pairs of SAME-WAY bisectors whose sources sit a few
 * 1e-8 apart, and `'co-linear-from-1/2'` used to ask whether such a pair is on one line as a SINE at the
 * angular resolution — a question a separation of 1e-8 answers by the last bits of its direction. Asked
 * as the coaxial form — forward sign exact, symmetric lateral within the client's floor — the pair is
 * one line, `handleInteriorEdgePair` closes it on its leading source, and the ring finishes.
 *
 * MEASURED, NOT ASSUMED, with the old form behind a toggle over 649 cells (`FULL_CORPUS` at two
 * floors, both fixtures at the 46 fine translations, the decades and the scales, the jittered circle
 * ladder, and the 320 jitter cells): 78 cells moved, 77 of them from a signalled failure to complete,
 * and Circle 32 jittered 1x at seed 12, whose four step failures fell to one. Node counts are
 * unmoved on every cell — the closure assigns targets and creates nothing — the fourth (rate) oracle
 * reads zero on all 78, and the solver's causality check and the test oracle agree on every one. 69
 * of the 77 are clean on all three positional oracles; the other eight are Circle 48 at 4e10, 5e10,
 * 6e10, 2e11 and 5e12..8e12, which carried clearance violations (1, 1, 1, 5, 12, 12, 12, 12) BEFORE
 * the change and carry exactly the same after it, now on a complete solve that REPORTS them as
 * `causality-violation` diagnostics (journal decision 148) — pinned below as moved and flagged. No
 * causality diagnostic appeared anywhere it was not.
 *
 * THE FIXTURES ARE NOT PROMOTED, AND COULD NOT BE: neither signature is zero. Both failing lists are
 * now empty, but Circle 48 carries signalled causality violations at ten fine translations (the
 * eight moved cells and two that always completed) and Rosette5 40 at nine (all unmoved, all
 * completing before this change too). Those are pinned below; promotion stays the lead's call.
 */

setSkeletonLogLevel('silent');

/**
 * The identical-source exit's separation bar the spread below is measured against — the retired
 * scratch `FLOATING_POINT_EPSILON` (deleted by C8 spec T1), which that exit still reads as its own
 * named literal until dispatch 2 (T9, T29). Stated here so the measurement keeps its yardstick.
 */
const HISTORICAL_IDENTICAL_SOURCE_BAR = 1e-8;

/** The full translation sweep `large-coordinate-failures.test.ts` asserts over the corpus. */
const TRANSLATIONS = [1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11];

/** The scale sweep from the same suite. */
const SCALES = [1e-6, 1e-4, 1e-2, 1e2, 1e4, 1e6, 1e8];

/**
 * Replicated from `large-coordinate-failures.test.ts`: does this fixture survive solve, offset
 * projection and strip decomposition at this placement? The predicate is copied rather than shared
 * so that a change to the enrolment sweep cannot silently redefine what these pins claim.
 */
function survives(vertices: Vector2[], scale: number, translate: number): boolean {
    const result = solveSkeleton(place(vertices, scale, translate));
    if (!result.complete || result.context === null) {
        return false;
    }
    const maxOffset = computeMaxOffset(result);
    const rings = computeOffsetRings(result, maxOffset * 0.5);
    if (rings.length === 0 || rings.some(ring => ring.length < 3)) {
        return false;
    }
    const strips = computeStrips(result, {depth: maxOffset * 0.5});
    return strips.length === result.graph.numExteriorNodes && strips.every(strip => strip.boundary.length >= 3);
}

function diagnosticKinds(vertices: Vector2[], translate: number): string[] {
    return solveSkeleton(place(vertices, 1, translate)).diagnostics.map(diagnostic => diagnostic.kind);
}

describe('NEAR_REGULAR_CIRCLE_48: the recorded defect from translation 1e10 up', () => {
    /*
     * THE ENVELOPE CLOSED AT 1e9 ON 2026-08-28, under journal decision 78 and accepted by decision
     * 81. This fixture used to survive every decade of this sweep but 1e10; it now survives every
     * decade up TO 1e9 and none above. The scatter block below carries the measurement, the cause
     * and what would cure it. Everything at or under 1e9 — the whole intended operating envelope,
     * and every scale — is bit-unmoved.
     */
    it('survives every translation in the enrolment sweep, 1e10 and 1e11 included', () => {
        // Was `[1e5 .. 1e9]` — none above 1e9 — from journal decision 78 until 2026-09-23, when the
        // coaxial collinearity exits closed the half-merged hub's same-way pairs (see the header).
        const surviving = TRANSLATIONS.filter(translate => survives(NEAR_REGULAR_CIRCLE_48, 1, translate));
        expect(surviving).toEqual(TRANSLATIONS);
    });

    it('survives the whole scale sweep, and its native placement', () => {
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 0)).toBe(true);
        for (const scale of SCALES) {
            expect(survives(NEAR_REGULAR_CIRCLE_48, scale, 0)).toBe(true);
        }
    });

    it('completes at 1e10 with no diagnostic at all, and clean on both causality instruments', () => {
        // HISTORY: until 2026-09-23 this cell failed LOUDLY — six step failures and twelve stranded
        // edges under decision 78, one and two before it. It now completes: the half-merged hub is
        // still ten shards (the mechanism block below), and the same-way pairs its shards leave are
        // closed on their leading sources by the coaxial collinearity exits, retiring eleven surplus
        // bisectors as culled self-loops. The solver's own causality check (journal decision 148) and
        // the test oracle both read zero, so this is a cure rather than a silence.
        const result = solveSkeleton(place(NEAR_REGULAR_CIRCLE_48, 1, 1e10));

        expect(result.complete).toBe(true);
        expect(result.diagnostics).toEqual([]);
        expect(solverCausalityCounts(result)).toEqual({offset: 0, clearance: 0, direction: 0});
        expect(oracleCausalityCounts(result, SKELETON_NOISE_FLOOR)).toEqual({offset: 0, clearance: 0, direction: 0});
        expect(result.graph.interiorEdges.filter(edge => edge.culled).length).toBe(11);
    });

    it('survives 1e9, 1e10 and 1e11 alike — neither non-monotonic nor closed at 1e9 any more', () => {
        // The record: 1e11 once survived where 1e10 did not (the hub shattered into events the solver
        // could handle), then decision 78's floor closed the envelope at 1e9 (the shards fell inside
        // one bar again). With the shards' same-way pairs closed on their leading sources, the size
        // of the translation stops deciding anything on this sweep.
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 1e9)).toBe(true);
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 1e10)).toBe(true);
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 1e11)).toBe(true);
    });
});

describe('NEAR_REGULAR_ROSETTE5_40: the recorded defect at translation 1e11', () => {
    it('survives every translation in the enrolment sweep, 1e11 included', () => {
        // Was every decade but 1e11 until 2026-09-23 (see the header's dispatch-2 block).
        const surviving = TRANSLATIONS.filter(translate => survives(NEAR_REGULAR_ROSETTE5_40, 1, translate));
        expect(surviving).toEqual(TRANSLATIONS);
    });

    it('survives the whole scale sweep, and its native placement', () => {
        expect(survives(NEAR_REGULAR_ROSETTE5_40, 1, 0)).toBe(true);
        for (const scale of SCALES) {
            expect(survives(NEAR_REGULAR_ROSETTE5_40, scale, 0)).toBe(true);
        }
    });

    it('completes at 1e11 with no diagnostic at all, and clean on both causality instruments', () => {
        // HISTORY: until 2026-09-23 this cell failed LOUDLY in one two-edge base case, leaving two
        // edges unresolved (two base cases and four edges before journal decision 70) — the F19
        // regime, a terminal ring finer than the tolerance. It now completes, and the move is
        // attributed by toggle to the coaxial collinearity exits alone (see the header); the solve
        // retires three surplus bisectors as culled self-loops on the way.
        const result = solveSkeleton(place(NEAR_REGULAR_ROSETTE5_40, 1, 1e11));

        expect(result.complete).toBe(true);
        expect(result.diagnostics).toEqual([]);
        expect(solverCausalityCounts(result)).toEqual({offset: 0, clearance: 0, direction: 0});
        expect(oracleCausalityCounts(result, SKELETON_NOISE_FLOOR)).toEqual({offset: 0, clearance: 0, direction: 0});
        expect(result.graph.interiorEdges.filter(edge => edge.culled).length).toBe(3);
    });

    /*
     * HISTORY — "dies with its two source nodes 4.7e-9 apart on the terminal ring", retired
     * 2026-09-23 with the failure it measured. Journal F15b pinned the separation of the base case's
     * two source nodes as the number a fix had to move: 6e-8, then 4.7e-9 under decision 70, then
     * 7.24e-8 at (-0.0322240, 0) in unit space under decision 78. With the coaxial collinearity exits
     * the solve no longer fails, so no failing base case's diagnostic carries the two positions.
     */
});

/*
 * ============================================================================
 *  THE ROOT CAUSE, MEASURED AND PINNED — 2026-08-28
 * ============================================================================
 *
 * Everything below was added when the two cells above were root-caused. It exists so that the
 * story in this file's header is a MEASUREMENT rather than a claim, and so that the two things the
 * header asserts which the sweep above cannot see — that 1e10 is not Circle 48's only failing
 * translation, and that the geometry in dispute is far below anything renderable — are both loud
 * if they ever stop being true.
 */

/** Unit-space nodes within `radius` of the polygon centre, with their in-degrees and spread. */
function terminalCluster(fixture: Vector2[], translate: number, radius: number) {
    const placed = place(fixture, 1, translate);
    const normalisation = makeSkeletonNormalisation(placed);
    const result = solveSkeleton(placed);

    const positions: Vector2[] = [];
    const inDegrees: number[] = [];
    for (const node of result.graph.nodes) {
        const unit = normalisePosition(normalisation, node.position);
        if (Math.hypot(unit.x, unit.y) < radius) {
            positions.push(unit);
            inDegrees.push(node.inEdges.length);
        }
    }

    let spread = 0;
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            spread = Math.max(spread, Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y));
        }
    }

    return {count: positions.length, inDegrees: inDegrees.toSorted((a, b) => a - b), spread};
}

/**
 * Translations at 1..9 times each decade from 1e8 to 1e12, plus 1e13. Forty-six cells, every one
 * an exact integer double, so the grid itself introduces no rounding of its own.
 */
const FINE_TRANSLATIONS: number[] = [];
for (const decade of [1e8, 1e9, 1e10, 1e11, 1e12]) {
    for (let multiple = 1; multiple <= 9; multiple++) {
        FINE_TRANSLATIONS.push(multiple * decade);
    }
}
FINE_TRANSLATIONS.push(1e13);

describe('the defect is a scatter of translations, not the one cell the decade sweep samples', () => {
    /*
     * WHAT THIS CHANGES ABOUT THE RECORD ABOVE. "Fails at 1e10 ONLY" is true of the enrolment
     * sweep and false of the fixture. A fix is therefore not verified by 1e10 turning green; it is
     * verified by these two lists emptying. If a list SHRINKS, something helped and the header's
     * account of why needs re-measuring; if it grows, the envelope regressed.
     */

    /*
     * BOTH LISTS GREW ON 2026-08-28 UNDER JOURNAL DECISION 78, AND THE GROWTH IS ACCEPTED BY
     * CONSTRUCTION — decisions 54, 66 and 81 — rather than absorbed.
     *
     * Circle 48 went from 3 cells to 29 and Rosette5 40 from 10 to 18, every one of them beyond 1e9.
     * The cause is measured, not inferred: the coincidence bar is now the render-scale floor, and at
     * these placements the centring subtraction scatters a terminal hub into a cloud whose diameter
     * is of the same order as that floor (3.18e-6 at 2e9, 2.92e-5 at 1e10, against a floor of 1e-6
     * in unit space). Where the epsilon bar left such a cloud shattered into ordinary two- and
     * three-way events the solver could grind through, the floor fuses parts of it into hubs the
     * ring machinery then cannot resolve. The disputed geometry is unchanged and still sits four to
     * five orders below anything renderable — the decision-54 block at the foot of this file is that
     * argument in numbers, and it is what makes these cells acceptable rather than merely accepted.
     *
     * WHAT WOULD CURE THEM, MEASURED AND NOT TAKEN. Widening the offset LAYER window to the same
     * floor — decision 83's other half — takes every one of these cells green, Circle 48 and
     * Rosette5 included, because the whole scattered hub then arrives in one layer and fuses into
     * the single event the geometry actually has. It was withdrawn because it costs two CLEAN
     * fixtures failed regions in the recursion census, which is a bar this file's fixtures do not
     * outrank. See F28.
     *
     * THE LISTS STILL FIRE IN BOTH DIRECTIONS. A cell appearing that is not here is a regression; a
     * cell disappearing means something helped and this account needs re-measuring.
     */

    it('Circle 48 fails at NO translation in the grid, where it failed at twenty-nine', () => {
        // THE LIST EMPTIED 2026-09-23 (the header's dispatch-2 block). It was
        //     2e9, 5e9..9e9, 1e10..9e10, 1e11..9e11, 1e12, 5e12..8e12
        // under decisions 78/81 — twenty-nine cells, every one signalled.
        const failing = FINE_TRANSLATIONS.filter(
            translate => !solveSkeleton(place(NEAR_REGULAR_CIRCLE_48, 1, translate)).complete);

        expect(failing).toEqual([]);
    });

    it('Circle 48 carries FIVE MOVED AND FLAGGED cells: complete, with their clearance violations reported', () => {
        // JOURNAL DECISION 147(b)/(c)'s ruling applied: a cell that goes from a signalled failure to
        // complete while carrying a causality violation is pinned as moved and flagged, with its
        // counts. These eight carried EXACTLY these clearance counts while they failed, and carry them
        // unchanged now; since journal decision 148 the solver reports each one as a
        // `causality-violation` diagnostic, so none of them is silent, and the test oracle agrees.
        const flagged = FINE_TRANSLATIONS.flatMap(translate => {
            const result = solveSkeleton(place(NEAR_REGULAR_CIRCLE_48, 1, translate));
            const counts = solverCausalityCounts(result);
            expect(oracleCausalityCounts(result, SKELETON_NOISE_FLOOR)).toEqual(counts);
            return counts.offset + counts.clearance + counts.direction === 0
                ? []
                : [`${translate}: ${JSON.stringify(counts)}, ${result.diagnostics.length} diagnostic(s)`];
        });

        // FOUR MOVED 2026-09-24, ALL DOWNWARDS, ATTRIBUTED TO THE ANCHORED COINCIDENCE CLUSTERING (journal
        // decision 155(b), C8 dispatch 1; toggle-measured against the retired connected components).
        // These are exactly the four fine translations whose clustering formed a component WIDER than
        // the floor (the component-diameter census): 4e10, 5e10 and 6e10 went from one clearance
        // violation to none, and 2e11 from five to three. Every other cell is bit-unmoved.
        expect(flagged).toEqual([
            '200000000000: {"offset":0,"clearance":3,"direction":0}, 3 diagnostic(s)',
            '5000000000000: {"offset":0,"clearance":12,"direction":0}, 12 diagnostic(s)',
            '6000000000000: {"offset":0,"clearance":12,"direction":0}, 12 diagnostic(s)',
            '7000000000000: {"offset":0,"clearance":12,"direction":0}, 12 diagnostic(s)',
            '8000000000000: {"offset":0,"clearance":12,"direction":0}, 12 diagnostic(s)',
            // NOT MOVED: these two completed before dispatch 2 as well, carrying the same thirteen
            // clearance violations, and are listed so the sweep states every cell that carries one.
            '9000000000000: {"offset":0,"clearance":13,"direction":0}, 13 diagnostic(s)',
            '10000000000000: {"offset":0,"clearance":13,"direction":0}, 13 diagnostic(s)',
        ]);
    });

    it('Rosette5 40 fails at NO translation in the grid, where it failed at fifteen', () => {
        // THE LIST EMPTIED 2026-09-23 (the header's dispatch-2 block); every one of the fifteen now
        // completes clean on both causality instruments. The record of how it was fifteen follows.
        //
        // 3e12 and 4e12 are the point: there is no upper threshold past which the fixture is safe,
        // because the failure turns on the rounding pattern of the particular translation and not
        // on how large it is.
        //
        // NINE BECAME TEN ON 2026-08-28 (journal decision 70), and the added cell is a silent wrong
        // answer becoming a loud one. `addBisectionEdge` may no longer flip a bisector to run
        // backwards through the wavefront, and 2e11 completed on the strength of exactly that:
        // measured on the previous code it reported `complete: true` with THREE bisectors at a
        // negative offset rate. A solve that only closes by running part of itself backwards in
        // time was never a pass, so this list growing here is the envelope being reported honestly
        // rather than regressing. Every other cell is bit-unmoved, and Circle 48's three are too.
        //
        // EIGHTEEN BECAME FIFTEEN when the split/partition pass gained render-floor position
        // identity (journal decision 85): 4e10, 5e10 and 6e10 lost two split events a fraction of
        // the floor apart to one node each, and with that pair resolved the solve closes. THE CURE
        // IS STRUCTURAL, NOT A FLAG FLIPPING — all three come out with the fixture's native shape,
        // 56 nodes and 55 interior edges, no culled edge, no escaped node and no bisector running
        // backwards (minimum direction dot 1.0), which is what separates this from a completion
        // bought by closing over a corrupted graph. Circle 48's list is bit-unmoved, and so is every
        // Rosette5 cell from 7e10 up: those die on the LAYER window, which this does not touch.
        //
        // FIFTEEN BECAME NONE on 2026-09-23 — 7e10..9e10, 1e11..9e11, 1e12, 3e12 and 4e12 all
        // complete, with zero violations on both causality instruments.
        const failing = FINE_TRANSLATIONS.filter(
            translate => !solveSkeleton(place(NEAR_REGULAR_ROSETTE5_40, 1, translate)).complete);

        expect(failing).toEqual([]);
        const carrying = FINE_TRANSLATIONS.flatMap(translate => {
            const counts = solverCausalityCounts(solveSkeleton(place(NEAR_REGULAR_ROSETTE5_40, 1, translate)));
            return counts.offset + counts.clearance + counts.direction === 0
                ? [] : [`${translate}: ${JSON.stringify(counts)}`];
        });
        // NONE OF THESE MOVED: all nine completed before dispatch 2 with exactly these counts, which
        // the solver has reported as `causality-violation` diagnostics since journal decision 148. The
        // fifteen cured cells carry none.
        expect(carrying).toEqual([
            '40000000000: {"offset":0,"clearance":1,"direction":0}',
            '50000000000: {"offset":0,"clearance":1,"direction":0}',
            '60000000000: {"offset":0,"clearance":1,"direction":0}',
            '5000000000000: {"offset":1,"clearance":5,"direction":0}',
            '6000000000000: {"offset":1,"clearance":5,"direction":0}',
            '7000000000000: {"offset":1,"clearance":5,"direction":0}',
            '8000000000000: {"offset":1,"clearance":5,"direction":0}',
            '9000000000000: {"offset":0,"clearance":12,"direction":0}',
            '10000000000000: {"offset":0,"clearance":12,"direction":0}',
        ]);
    });

    it('every failing cell is signalled, and none of them is a silent wrong answer', () => {
        // NO CELL FAILS SINCE 2026-09-23, so this and the shape sweep below assert nothing today; they
        // are kept so that a failing cell's return is held to the same bar.
        // WHAT "SIGNALLED" MEANS HERE IS `complete: false`, and every one of the 44 cells had it.
        // The exact diagnostic SHAPE is asserted separately below, because three of Rosette5's
        // cells now reach incompleteness by a different route and the two claims are not the same
        // claim: a caller is protected by the flag, not by which sentence follows it.
        for (const fixture of [NEAR_REGULAR_CIRCLE_48, NEAR_REGULAR_ROSETTE5_40]) {
            for (const translate of FINE_TRANSLATIONS) {
                const result = solveSkeleton(place(fixture, 1, translate));
                if (result.complete) {
                    continue;
                }
                expect(result.diagnostics.length).toBeGreaterThan(0);
            }
        }
    });

    it('reaches incompleteness through a step failure in all but three cells, which are pinned', () => {
        /*
         * The diagnostic shape, and the three exceptions to it — journal decision 81's structure
         * applied to a signature rather than to a survival. Every failing cell used to end with a
         * step failure and then unresolved edges. Under decision 78's floor, Rosette5 40 at 4e10,
         * 5e10 and 6e10 reaches `complete: false` by a route that does not carry that pair, and the
         * three are named rather than covered by loosening the assertion for all 47.
         */
        const SHAPE_EXCEPTIONS = new Set([4e10, 5e10, 6e10]);

        for (const translate of FINE_TRANSLATIONS) {
            for (const [fixture, exceptions] of [
                [NEAR_REGULAR_CIRCLE_48, new Set<number>()],
                [NEAR_REGULAR_ROSETTE5_40, SHAPE_EXCEPTIONS],
            ] as [Vector2[], Set<number>][]) {
                if (solveSkeleton(place(fixture, 1, translate)).complete || exceptions.has(translate)) {
                    continue;
                }
                const kinds = diagnosticKinds(fixture, translate);
                expect(kinds).toContain('step-failure');
                expect(kinds.at(-1)).toBe('unresolved-edges');
            }
        }
    });
});

describe('the mechanism: a 48-way convergence half-merged by the coincidence bar', () => {
    /*
     * The three regimes, measured on the one fixture that shows all of them cleanly. Circle 48's
     * terminal event is a single 48-way convergence at the centre, so the cluster of graph nodes
     * near the centre IS the resolution of that event and nothing else lands there.
     *
     * RE-MEASURED 2026-08-28 UNDER JOURNAL DECISION 78, and the mechanism is the same mechanism with
     * a different bar. Half-merging is what happens whenever the scatter of a many-way convergence
     * straddles the coincidence tolerance, and moving that tolerance from 1e-8 to the render floor
     * moved which placements straddle it, not the shape of what goes wrong. What DID change is the
     * third regime: a bigger translation no longer rescues the fixture, because shards that used to
     * fall clear of the epsilon now fall inside the floor. The title's "absolute tolerance" is kept
     * as "coincidence bar" for that reason — the quantity is the same one, and it is no longer the
     * arithmetic epsilon.
     */

    it('resolves to ONE node of in-degree 48 natively and at 1e9 — the clean many-way merge', () => {
        for (const translate of [0, 1e9]) {
            const cluster = terminalCluster(NEAR_REGULAR_CIRCLE_48, translate, 1e-4);
            expect(cluster.count).toBe(1);
            expect(cluster.inDegrees).toEqual([48]);
            expect(cluster.spread).toBe(0);
        }
    });

    it('half-merges into two hubs at 2e9, 1.24e-8 apart — just past the 1e-8 tolerance', () => {
        const cluster = terminalCluster(NEAR_REGULAR_CIRCLE_48, 2e9, 1e-4);

        expect(cluster.count).toBe(2);
        // The SPLIT of the 48 across the two hubs, re-measured 2026-08-29: [12, 40] became [10, 40]
        // under `arrivalOffsetOfPair` in `collision-helpers.ts` (journal decision 102), which changes
        // which shards of the scatter arrive together and so which of them the smaller hub collects.
        // The mechanism this test names is untouched — still two hubs, still 1.24e-8 apart, still
        // just past the tolerance — and that is the claim the two assertions below carry.
        //
        // RE-MEASURED AGAIN THE SAME DAY, [10, 40] -> [10, 44]. The 2026-08-29 causality package has
        // two mechanisms — the earliest-arrival narrowing of `handleInteriorNGon`'s refused layer,
        // and the leading-source closure of a collinear same-direction pair in
        // `handleInteriorEdgePair` — and EITHER ONE ALONE produces this split, measured by mutation,
        // so the attribution is to the package rather than to one of them. Both stop four shards of
        // a scatter being stranded outside the hubs by a resolution that consumed a whole layer at
        // once. THE COUNT IS THE CLAIM AND THE COUNT IS UNMOVED — still two hubs — and the cell
        // still fails, which is the pinned behaviour of journal decisions 66/81. Movement in the
        // in-degree split is movement WITHIN an accepted failure, and it is recorded here rather
        // than absorbed.
        //
        // RE-MEASURED 2026-09-23, [10, 44] -> [10, 48], ATTRIBUTED TO THE COAXIAL COLLINEARITY EXITS
        // (spec A15, journal decision 150; toggle-measured). The two hubs and their 1.24e-8 are
        // unmoved; the four arrivals that used to strand now close on the big hub as leading-source
        // closures, and the cell COMPLETES — see the header's dispatch-2 block.
        expect(cluster.inDegrees).toEqual([10, 48]);
        // The whole defect in one number, as it stood until dispatch 2: had these two been 1e-8 apart
        // rather than 1.24e-8, the `identical-source` branch of `intersectRays` would have closed the
        // pair and the solve would have completed. The collinearity exits now ask the same question
        // in the floor's currency, and the pair is closed without that branch moving.
        //
        // BIT-UNMOVED BY DECISION 78, which is worth knowing rather than assuming: this cell's two
        // hubs are separated by more than the render floor as well as more than the epsilon, so
        // widening the coincidence bar to the floor did not reach them. The cells the widening did
        // reach are the ones above 1e9, where the scatter is finer than the floor.
        expect(cluster.spread).toBeGreaterThan(HISTORICAL_IDENTICAL_SOURCE_BAR);
        expect(cluster.spread).toBeLessThan(2 * HISTORICAL_IDENTICAL_SOURCE_BAR);
    });

    it('shatters into ten at 1e10, with a hub of 16 — the same half-merge, coarser', () => {
        const cluster = terminalCluster(NEAR_REGULAR_CIRCLE_48, 1e10, 1e-4);

        // Ten shards, one hub of 16: unmoved. The 2026-08-29 causality package moved one shard's
        // in-degree from 4 to 6 — two arrivals that used to be stranded by a whole-layer resolution
        // now reach the shard they belong to — and moved nothing else. Same accepted failure, same
        // shape. See the cell above for why the attribution is to the package and not to one of its
        // two mechanisms.
        //
        // RE-MEASURED 2026-09-23 under the coaxial collinearity exits (journal decision 150): still ten
        // shards — the half-merge is the coincidence bar's and is untouched — with in-degrees
        // [2,3,3,3,6,6,6,6,6,16] -> [2,3,3,5,6,6,6,6,8,24]: the same-way pairs the shards leave now
        // close on their leading sources, which adds in-edges and no node, and the cell completes.
        expect(cluster.count).toBe(10);
        expect(cluster.inDegrees).toEqual([2, 3, 3, 5, 6, 6, 6, 6, 8, 24]);
    });

    it('does NOT shatter free at 2e10, and completes anyway since dispatch 2', () => {
        // The third regime, re-measured and REVERSED on 2026-08-28. It used to be the reason a
        // bigger translation could be safer than a smaller one: at 2e10 the convergence shattered
        // into 33 ordinary two- and three-way events, none of them a hub, and the fixture solved.
        // Under decision 78's floor those shards fall inside one bar again, so 2e10 resolves as 11
        // nodes with a 20-way hub among them and fails like every placement above 1e9. That is the
        // whole of why the scatter list grew from three cells to twenty-nine, said in structure
        // rather than in a list of translations.
        const cluster = terminalCluster(NEAR_REGULAR_CIRCLE_48, 2e10, 1e-4);

        // The hub's in-degree was 20 until the 2026-08-29 causality package and is 24 after it, for
        // the same reason as the two cells above: fewer arrivals stranded outside the hub by a layer
        // resolved whole. The count of 11 and the failing verdict — the two claims this test makes —
        // are unmoved.
        //
        // 2026-09-23, THE COAXIAL COLLINEARITY EXITS (journal decision 150): the verdict flips —
        // `complete: false` to `true`, zero violations on both instruments — and the hub's in-degree
        // goes 24 -> 26 as two more same-way arrivals close on it. The count of 11 is unmoved: the
        // envelope no longer closes at 1e9, though the hub is still half-merged.
        const result = solveSkeleton(place(NEAR_REGULAR_CIRCLE_48, 1, 2e10));
        expect(result.complete).toBe(true);
        expect(solverCausalityCounts(result)).toEqual({offset: 0, clearance: 0, direction: 0});
        expect(cluster.count).toBe(11);
        expect(Math.max(...cluster.inDegrees)).toBe(26);
    });
});

describe('journal decision 54: the disputed geometry is far below anything renderable', () => {
    /*
     * Decision 54 set the precision bar at "can you see this on a screen?", and this block answered it
     * in numbers for the pair each decade cell's failing base case could not close.
     *
     * HISTORY, NOT PINS — the dispute is settled as of 2026-09-23. The measured gaps were: Circle 48
     * at 1e10, 2.5e-5 world units on a 300-unit shape (4.4e-6 before decision 78), a ten-thousandth
     * of a pixel at 4K and 13 ulps of the input at that placement; Rosette5 40 at 1e11, 7.9e-5 world
     * units on a 371-unit shape (3.1e-5, then 8.0e-6 under decision 70), a thousandth of a pixel and
     * 3.6 ulps. Decision 54's argument was that nothing renderable is lost; the coaxial collinearity
     * exits (journal decision 150) asked the same question in the floor's currency — is this pair on
     * one line to within what the client can see — answered yes, and closed it. Both cells now
     * complete with no diagnostic, so there is no failing base case left to read a gap from.
     */
    it.each([
        ['Circle 48', 1e10, NEAR_REGULAR_CIRCLE_48],
        ['Rosette5 40', 1e11, NEAR_REGULAR_ROSETTE5_40],
    ] as [string, number, Vector2[]][])('leaves nothing in dispute: %s at %p completes with no diagnostic', (_name, translate, fixture) => {
        const result = solveSkeleton(place(fixture, 1, translate));
        expect(result.complete).toBe(true);
        expect(result.diagnostics).toEqual([]);
    });
});
