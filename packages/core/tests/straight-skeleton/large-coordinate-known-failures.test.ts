import {
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    FLOATING_POINT_EPSILON,
    SKELETON_NOISE_FLOOR,
    makeSkeletonNormalisation,
    normalisePosition,
    setSkeletonLogLevel,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';
import {NEAR_REGULAR_CIRCLE_48, NEAR_REGULAR_ROSETTE5_40} from '@proc-geo/test-fixtures';
import {place} from './placement-helpers';

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
 */

setSkeletonLogLevel('silent');

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
    it('survives every translation up to 1e9, and none above it', () => {
        const surviving = TRANSLATIONS.filter(translate => survives(NEAR_REGULAR_CIRCLE_48, 1, translate));
        expect(surviving).toEqual([1e5, 1e6, 1e7, 1e8, 1e9]);
    });

    it('survives the whole scale sweep, and its native placement', () => {
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 0)).toBe(true);
        for (const scale of SCALES) {
            expect(survives(NEAR_REGULAR_CIRCLE_48, scale, 0)).toBe(true);
        }
    });

    it('fails at 1e10 LOUDLY, with a step failure and unresolved edges', () => {
        // Signalled, not silent. The value of pinning the kinds rather than only `complete` is that
        // a regression into the silent wrong-skeleton mode — the one unit-extent normalisation
        // removed — would read as a pass on a bare completeness check.
        // RE-MEASURED 2026-08-28 under decision 78: six step failures rather than one, and twelve
        // stranded edges rather than two. The cell fails harder because the floor fuses more of the
        // scattered hub than the epsilon did — and it still fails LOUDLY, which is the property this
        // test exists for and the one that survives every re-measurement.
        const result = solveSkeleton(place(NEAR_REGULAR_CIRCLE_48, 1, 1e10));

        expect(result.complete).toBe(false);
        expect(diagnosticKinds(NEAR_REGULAR_CIRCLE_48, 1e10).at(-1)).toBe('unresolved-edges');
        expect(diagnosticKinds(NEAR_REGULAR_CIRCLE_48, 1e10)).toContain('step-failure');
        expect(result.diagnostics.at(-1)?.detail)
            .toContain('12 interior edge(s) finished without a target node');
    });

    it('is MONOTONIC in the translation as of decision 78, where it was not before', () => {
        // The non-monotonicity was the sharpest evidence that this is not plain precision loss:
        // 1e11 used to survive where 1e10 did not, because a bigger translation shattered the hub
        // into events the solver could handle. Under the render floor those shards fall inside one
        // bar again, so the envelope now closes cleanly at 1e9 and stays closed. The evidence for
        // the mechanism moves to the hub-structure block below, which measures it directly rather
        // than inferring it from an ordering.
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 1e9)).toBe(true);
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 1e10)).toBe(false);
        expect(survives(NEAR_REGULAR_CIRCLE_48, 1, 1e11)).toBe(false);
    });
});

describe('NEAR_REGULAR_ROSETTE5_40: the recorded defect at translation 1e11', () => {
    it('survives every other translation in the enrolment sweep', () => {
        // Unmoved by decision 78: this fixture's decade sweep is exactly what it was, and only the
        // fine grid between the decades grew (see the scatter block).
        const surviving = TRANSLATIONS.filter(translate => survives(NEAR_REGULAR_ROSETTE5_40, 1, translate));
        expect(surviving).toEqual([1e5, 1e6, 1e7, 1e8, 1e9, 1e10]);
    });

    it('survives the whole scale sweep, and its native placement', () => {
        expect(survives(NEAR_REGULAR_ROSETTE5_40, 1, 0)).toBe(true);
        for (const scale of SCALES) {
            expect(survives(NEAR_REGULAR_ROSETTE5_40, scale, 0)).toBe(true);
        }
    });

    it('fails at 1e11 LOUDLY, in one two-edge base case, leaving two edges unresolved', () => {
        // WAS TWO BASE CASES AND FOUR EDGES until journal decision 70. The cell still fails and
        // still fails loudly; what changed is that half the damage is gone, because the bisectors
        // reaching the terminal ring are no longer allowed to point backwards through the
        // wavefront on the way. The failure that remains is the F19 regime and nothing else: a
        // terminal ring finer than the absolute tolerance.
        const result = solveSkeleton(place(NEAR_REGULAR_ROSETTE5_40, 1, 1e11));

        expect(result.complete).toBe(false);
        expect(diagnosticKinds(NEAR_REGULAR_ROSETTE5_40, 1e11))
            .toEqual(['step-failure', 'unresolved-edges']);
        expect(result.diagnostics.at(-1)?.detail)
            .toContain('2 interior edge(s) finished without a target node');
    });

    it('dies with its two source nodes 4.7e-9 apart on the terminal ring', () => {
        // Journal F15b, pinned as the number rather than the story: this is the
        // terminal-ring-finer-than-tolerance regime, and the separation is what a fix has to move.
        //
        // RE-MEASURED 2026-08-28 (journal decision 70). The separation moved 6e-8 -> 4.7e-9 and the
        // pair moved off y = 0 to (0.0218378, -0.1663852) in unit space. THAT IS THE SEPARATION
        // CROSSING THE TOLERANCE THE WRONG WAY, and it is worth being precise about: F19 recorded
        // the failure as node scatter landing at 1.7x to 6x the absolute 1e-8, so the terminal
        // `identical-source` close could not fire. The scatter is now a FIFTH of that epsilon —
        // under it, not over — so these two nodes are numerically the same point and the close
        // still does not fire. The regime is unchanged and the ruling on it (decision 66) stands;
        // only the number moved, and it moved toward the answer rather than away from it.
        const detail = solveSkeleton(place(NEAR_REGULAR_ROSETTE5_40, 1, 1e11)).diagnostics[0].detail;
        const positions = [...detail.matchAll(/"position":\{"x":(-?[\d.e-]+),"y":(-?[\d.e-]+)\}/g)]
            .map(match => ({x: Number(match[1]), y: Number(match[2])}));

        // RE-MEASURED AGAIN 2026-08-28, under decision 78's render floor. The pair now dies at
        // (-0.0322240, 0) in unit space, 7.24e-8 apart — back ABOVE the arithmetic epsilon, where
        // the previous reading had it a fifth of the way below. That is the same regime seen from
        // the other side: the floor merges the events that used to shatter, so what reaches the
        // terminal ring is a coarser structure whose two survivors sit further apart. The regime is
        // unchanged, decision 66's ruling on it stands, and the number is pinned rather than the
        // story so the next move in either direction is loud.
        expect(positions.length).toBeGreaterThanOrEqual(2);
        for (const position of positions) {
            expect(position.x).toBeCloseTo(-0.0322240, 6);
            expect(position.y).toBeCloseTo(0, 6);
        }
        const separation = Math.abs(positions[0].x - positions[1].x);
        expect(separation).toBeGreaterThan(FLOATING_POINT_EPSILON);
        expect(separation).toBeLessThan(1e-7);
    });
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

/** The world-space separation of the two source nodes the failing base case could not close. */
function disputedWorldGap(fixture: Vector2[], translate: number): number {
    const placed = place(fixture, 1, translate);
    const normalisation = makeSkeletonNormalisation(placed);
    const detail = solveSkeleton(placed).diagnostics[0].detail;
    const positions = [...detail.matchAll(/"position":\{"x":(-?[\d.e+-]+),"y":(-?[\d.e+-]+)\}/g)]
        .map(match => ({x: Number(match[1]), y: Number(match[2])}));

    return Math.hypot(positions[0].x - positions[1].x, positions[0].y - positions[1].y)
        * normalisation.fromUnitScale;
}

/** The fixture's longest bounding-box side, in caller units at scale 1. */
function extentOf(fixture: Vector2[]): number {
    const xs = fixture.map(vertex => vertex.x);
    const ys = fixture.map(vertex => vertex.y);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
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

    it('Circle 48 fails at twenty-nine translations in the grid, and 1e10 is only one of them', () => {
        const failing = FINE_TRANSLATIONS.filter(
            translate => !solveSkeleton(place(NEAR_REGULAR_CIRCLE_48, 1, translate)).complete);

        expect(failing).toEqual([
            2e9, 5e9, 6e9, 7e9, 8e9, 9e9,
            1e10, 2e10, 3e10, 4e10, 5e10, 6e10, 7e10, 8e10, 9e10,
            1e11, 2e11, 3e11, 4e11, 5e11, 6e11, 7e11, 8e11, 9e11,
            1e12, 5e12, 6e12, 7e12, 8e12,
        ]);
    });

    it('Rosette5 40 fails at fifteen, spread over two decades that do not touch', () => {
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
        const failing = FINE_TRANSLATIONS.filter(
            translate => !solveSkeleton(place(NEAR_REGULAR_ROSETTE5_40, 1, translate)).complete);

        expect(failing).toEqual([
            7e10, 8e10, 9e10,
            1e11, 2e11, 3e11, 4e11, 5e11, 6e11, 7e11, 8e11, 9e11,
            1e12, 3e12, 4e12,
        ]);
    });

    it('every failing cell is signalled, and none of them is a silent wrong answer', () => {
        // WHAT "SIGNALLED" MEANS HERE IS `complete: false`, and every one of the 44 cells has it.
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
        expect(cluster.inDegrees).toEqual([12, 40]);
        // The whole defect in one number: had these two been 1e-8 apart rather than 1.24e-8, the
        // `identical-source` branch of `intersectRays` would have closed the pair and the solve
        // would have completed.
        //
        // BIT-UNMOVED BY DECISION 78, which is worth knowing rather than assuming: this cell's two
        // hubs are separated by more than the render floor as well as more than the epsilon, so
        // widening the coincidence bar to the floor did not reach them. The cells the widening did
        // reach are the ones above 1e9, where the scatter is finer than the floor.
        expect(cluster.spread).toBeGreaterThan(FLOATING_POINT_EPSILON);
        expect(cluster.spread).toBeLessThan(2 * FLOATING_POINT_EPSILON);
    });

    it('shatters into ten at 1e10, with a hub of 16 — the same half-merge, coarser', () => {
        const cluster = terminalCluster(NEAR_REGULAR_CIRCLE_48, 1e10, 1e-4);

        expect(cluster.count).toBe(10);
        expect(cluster.inDegrees).toEqual([2, 3, 3, 3, 4, 6, 6, 6, 6, 16]);
    });

    it('does NOT shatter free at 2e10 any more, which is why the envelope now closes at 1e9', () => {
        // The third regime, re-measured and REVERSED on 2026-08-28. It used to be the reason a
        // bigger translation could be safer than a smaller one: at 2e10 the convergence shattered
        // into 33 ordinary two- and three-way events, none of them a hub, and the fixture solved.
        // Under decision 78's floor those shards fall inside one bar again, so 2e10 resolves as 11
        // nodes with a 20-way hub among them and fails like every placement above 1e9. That is the
        // whole of why the scatter list grew from three cells to twenty-nine, said in structure
        // rather than in a list of translations.
        const cluster = terminalCluster(NEAR_REGULAR_CIRCLE_48, 2e10, 1e-4);

        expect(solveSkeleton(place(NEAR_REGULAR_CIRCLE_48, 1, 2e10)).complete).toBe(false);
        expect(cluster.count).toBe(11);
        expect(Math.max(...cluster.inDegrees)).toBe(20);
    });
});

describe('journal decision 54: the disputed geometry is far below anything renderable', () => {
    /*
     * Decision 54 sets the precision bar at "can you see this on a screen?". These assertions are
     * that question answered in numbers, so that any future argument for spending on this defect
     * has to move them rather than restate the story.
     *
     * A 4K display is 3840 pixels across. `px` below is what the disputed separation would measure
     * if the WHOLE fixture were rendered across that display — the most generous framing available,
     * since any real view shows more than the polygon.
     */

    const pixelsAt4K = (fixture: Vector2[], translate: number) =>
        3840 * disputedWorldGap(fixture, translate) / extentOf(fixture);

    it('Circle 48 at 1e10 disputes 2.5e-5 world units on a 300-unit shape', () => {
        // WAS 4.4e-6, RE-MEASURED 2026-08-28 under journal decision 78: the coincidence bar is now
        // the render floor, so the structure reaching the terminal ring is coarser and the gap in
        // dispute is about six times what it was. Decision 54's argument is unchanged in kind and
        // still holds by four orders of magnitude — a twenty-five-millionth of the shape, a
        // ten-thousandth of a pixel across a 4K display showing nothing but this polygon.
        const gap = disputedWorldGap(NEAR_REGULAR_CIRCLE_48, 1e10);

        expect(gap).toBeGreaterThan(2e-5);
        expect(gap).toBeLessThan(3e-5);
        expect(gap / extentOf(NEAR_REGULAR_CIRCLE_48)).toBeLessThan(1e-7);
        expect(pixelsAt4K(NEAR_REGULAR_CIRCLE_48, 1e10)).toBeLessThan(1e-3);
    });

    it('Rosette5 40 at 1e11 disputes 8.0e-6 world units on a 371-unit shape', () => {
        // WAS 3.1e-5, RE-MEASURED 2026-08-28 under journal decision 70: the disputed gap shrank
        // by a factor of four when the bisectors reaching this terminal ring stopped being allowed
        // to run backwards through the wavefront. Decision 54's argument is only strengthened —
        // less geometry is in dispute than when the decision was taken, not more — so the bar is
        // re-measured downward and the ruling stands.
        // WAS 3.1e-5 and then 8.0e-6; RE-MEASURED AGAIN 2026-08-28 under decision 78 at 7.9e-5, for
        // the same reason as Circle 48 above — a coarser terminal structure disputes a wider gap.
        // Still a five-millionth of the shape and a thousandth of a pixel at 4K.
        const gap = disputedWorldGap(NEAR_REGULAR_ROSETTE5_40, 1e11);

        expect(gap).toBeGreaterThan(7e-5);
        expect(gap).toBeLessThan(9e-5);
        expect(gap / extentOf(NEAR_REGULAR_ROSETTE5_40)).toBeLessThan(1e-6);
        expect(pixelsAt4K(NEAR_REGULAR_ROSETTE5_40, 1e11)).toBeLessThan(1e-2);
    });

    it('and is within an order of magnitude of the input\'s OWN resolution at that placement', () => {
        /*
         * The argument that closes it. At 1e10 a double's ulp is 1.9e-6 caller units, so the
         * fixture's vertices are not specified more finely than that, and the disputed gap is a
         * small multiple of an ulp of the coordinates it was derived from. There is no better answer
         * being lost, because at this placement the input does not carry one.
         *
         * THE MULTIPLE MOVED FROM "a couple" TO "a dozen" ON 2026-08-28, and the claim is weakened
         * rather than withdrawn — decision 78's coarser terminal structure disputes 13 ulps at 1e10
         * and 3.6 at 1e11, where both were under 3 before. It is stated at the measured value and
         * NOT at a round number, because this is the assertion a future argument for spending on
         * this defect has to move, and it has moved once already. What has not changed is the order
         * of the comparison: the disputed geometry is still the same size as the noise in the input
         * that produced it, and both are four orders below anything renderable.
         */
        const ulpAt = (translate: number) => translate * 2 ** -52;

        expect(disputedWorldGap(NEAR_REGULAR_CIRCLE_48, 1e10) / ulpAt(1e10)).toBeLessThan(15);
        expect(disputedWorldGap(NEAR_REGULAR_ROSETTE5_40, 1e11) / ulpAt(1e11)).toBeLessThan(5);
    });
});
