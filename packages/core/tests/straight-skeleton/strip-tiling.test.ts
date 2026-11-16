import {
    CLEAN_TEST_POLYGONS, FULL_CORPUS, HOLED_F1, HOLED_TEST_POLYGONS, holedSolveOptions, KNOWN_DEFECT_POLYGONS,
} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset, computeOffsetRings, computeStrips, CornerContext, loopOfExteriorEdge, solveSkeleton,
    SkeletonSolveResult, Strip, Vector2,
} from '@proc-geo/core';
import {distanceToSegment, holedTilingError, netRingArea, regionArea, stripArea as signedStripArea}
    from './wavefront-measurement-helpers';

/*
 * ============================================================================
 *  THE STRIPS AND THE RESIDUE ACCOUNT FOR THE POLYGON, EXACTLY, CORPUS-WIDE.
 * ============================================================================
 *
 * At any depth the wavefront divides the polygon into two things and nothing else: the strips it has
 * swept, and the residue ring it has not reached. Their areas must add up to the polygon's. That is
 * a property of what a straight skeleton IS, not of any particular decomposition, which makes it the
 * sharpest cheap statement available about whether a skeleton is right — sharper than containment,
 * which the wrong answer below satisfied, and sharper than completeness, which it also satisfied.
 *
 * WHY IT WAS WRITTEN (journal decision 77, 2026-08-28). `OFF_EDGE_JITTER_L_SEED_15838`'s strips
 * covered 160% of its own area — the faces of the two walls of its corridor fused into a single ring
 * and were reported once for each wall — while the solve said `complete: true` with zero causality
 * violations, zero escaped nodes and a skeleton whose every node sits within 1e-11 of where an
 * independent oracle puts it. Nothing in the suite saw it. `collinear-dumbbell.test.ts` had measured
 * exactly this quantity since the dumbbell was enrolled, on one fixture, and the corpus was never
 * swept for it.
 *
 * ----------------------------------------------------------------------------
 * MEASURED AGAINST THE POLYGON THE SOLVER SOLVED, WHICH IS NOT ALWAYS THE CALLER'S
 * ----------------------------------------------------------------------------
 *
 * The boundary stage removes vertices below the render-scale floor, and where those vertices are not
 * exactly collinear that removal MOVES AREA — 5.17e-7 of it on seed 15838, whose three removed
 * samples are jittered rather than flat. Comparing against the caller's ring would score that drift
 * as a tiling failure, when the strips are in fact tiling their own polygon perfectly: measured both
 * ways, the discrepancy against the caller's ring equals the canonicalisation drift to seven
 * significant figures. So the reference is the graph's own exterior ring, and what this file asserts
 * is a property of the decomposition rather than a restatement of what the floor removed.
 *
 * ----------------------------------------------------------------------------
 * THE BAR IS MACHINE PRECISION, BECAUSE THAT IS WHAT THE CORPUS ACHIEVES
 * ----------------------------------------------------------------------------
 *
 * Re-measured 2026-08-28 over all 59 fixtures at both depths, after the corridor-midline fix and the
 * three fixtures it enrolled: the worst error anywhere outside the two pinned cells is 8.52e-16, on
 * `Convergence Towards Isthmus (succeeds)`, unmoved. A bar of 1e-14 is therefore ten times the
 * measured maximum and still eleven orders below the failure it was written for. It is headroom
 * against arithmetic, not slack bought to make a fixture pass, and it must not be widened to admit
 * one.
 */

/** Depth fractions of the maximum offset the identity is asserted at. */
const SWEPT_FRACTIONS = [0.2, 0.5];

/** Ten times the worst error the corpus achieves. See this file's header. */
const TILING_TOLERANCE = 1e-14;

/**
 * Fixtures whose tiling error is pinned rather than asserted clean, and what it measures.
 *
 * TWO ENTRIES, BOTH THE SAME MECHANISM. Journal decision 72 requires each known-defect fixture to be
 * swept and pinned at whatever actually holds; measured here, four of the six tile to machine
 * precision and the two that do not miss by a merged event set having moved one of their nodes to
 * its medoid. Neither is a strip defect.
 */
const PINNED_TILING_ERRORS: Record<string, number> = {
    // `Collinear Dumbbell` WAS PINNED HERE AT 0.1 AND LEFT BY BEING FIXED, 2026-08-28, journal
    // decision 90 — the route this file's own rule names, not a softened number. Its bar had no
    // skeleton: the midline of a corridor was born at each end pointing out of the corridor, so the
    // two globes' faces each covered the shaft and the strips overlapped by 22 of its 220 area
    // units. It now tiles at zero and is in the clean roster, swept above with everything else.
    //
    // Journal decision 82, 2026-08-28. NOT a strip defect and not a bar that was widened to admit
    // one: the render-floor coincidence rule of decision 78 resolves this fixture's cluster B — two
    // events 3.13e-7 apart in unit space, 2.7e-7 of its extent — into one node, and the merged node
    // sits at the medoid of its own event set rather than at either of the two points the epsilon
    // bar used to place. The skeleton therefore MOVES by the pair separation, and the strips carry
    // that displacement into their areas. 7.36e-13 is what a 3.13e-7 unit-space move costs an area
    // identity; the global bar stays at 1e-14, where the other 54 fixtures still sit.
    'Off-edge Jitter Reflex L (seed 15838)': 7.36e-13,
    // The same mechanism one step further out, and the same ruling. Giving the split/partition pass
    // render-floor position identity (journal decision 85) resolves this fixture's two simultaneous
    // splits — 5.4e-7 apart in unit space, which no zoom separates — into one node at the medoid of
    // their two positions, so the skeleton moves by that separation and the strips carry it into
    // their areas. 1.78e-12 is what a 5.4e-7 unit-space move costs an area identity. The cure it
    // bought is in `graph-index-invariants.test.ts` (a sub-floor pair gone) and in
    // `wavefront-causality.test.ts` (this fixture's direction violation gone).
    'Off-edge Jitter Reflex L (seed 55433, k=4)': 1.78e-12,
};

/**
 * Fixtures the identity cannot be measured on at all, and why.
 *
 * `computeMaxOffset` refuses an incomplete solve, so there is no depth to sweep. THE LIST IS NOW
 * EMPTY: `Off-edge Jitter Plus (seed 7919)` was its only member and the parallel-vertex closure in
 * `algorithm-termination-cases.ts` cured its root, so it falls into the sweep — and measures 1.46e-16
 * at every swept depth, which is the clean-roster band and evidence that the closure produced a
 * skeleton whose strips genuinely tile the polygon.
 *
 * The list is kept rather than deleted because a static exclusion that outlives its reason is exactly
 * the laundering journal decision 72 retired: an empty one asserts, in the reach test below, that
 * every fixture in the corpus is measured here.
 *
 * ONE MEMBER AGAIN SINCE 2026-09-23: `Offset Cross Junction`, enrolled under decision 151(d). Its root
 * is a signalled failure at the library floor (the coaxial completion fires, then a step failure), so
 * `computeMaxOffset` refuses it — which is its signature here, asserted below rather than skipped.
 */
const UNMEASURABLE: string[] = ['Offset Cross Junction'];

function signedRingArea(ring: Vector2[]): number {
    let total = 0;
    for (let index = 0; index < ring.length; index++) {
        const from = ring[index];
        const to = ring[(index + 1) % ring.length];
        total += from.x * to.y - to.x * from.y;
    }
    return total / 2;
}

function stripArea(strip: Strip): number {
    return strip.holes.reduce(
        (area, hole) => area - Math.abs(signedRingArea(hole)),
        Math.abs(signedRingArea(strip.boundary)));
}

/** How far the strips plus the residue ring miss the solved polygon's area, relative to it. */
function tilingError(result: SkeletonSolveResult, depth: number): number {
    const {graph} = result;
    const solved = graph.nodes.slice(0, graph.numExteriorNodes).map(node => node.position);
    const solvedArea = Math.abs(signedRingArea(solved));

    const covered = computeStrips(result, {depth}).reduce((total, strip) => total + stripArea(strip), 0)
        + computeOffsetRings(result, depth).reduce((total, ring) => total + Math.abs(signedRingArea(ring)), 0);

    return Math.abs(covered - solvedArea) / solvedArea;
}

function worstTilingError(vertices: Vector2[]): number {
    const result = solveSkeleton(vertices);
    const maxOffset = computeMaxOffset(result);
    return Math.max(...SWEPT_FRACTIONS.map(fraction => tilingError(result, maxOffset * fraction)));
}

describe('the strips and the residue account for the polygon they were cut from', () => {
    it.each(CLEAN_TEST_POLYGONS.map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s tiles to machine precision',
        (_name, vertices) => {
            expect(worstTilingError(vertices)).toBeLessThan(TILING_TOLERANCE);
        },
    );

    it.each(KNOWN_DEFECT_POLYGONS
        .filter(polygon => !UNMEASURABLE.includes(polygon.name))
        .map(polygon => [polygon.name, polygon.vertices] as const))(
        '%s tiles to exactly what is pinned for it',
        (name, vertices) => {
            const pinned = PINNED_TILING_ERRORS[name];
            if (pinned === undefined) {
                expect(worstTilingError(vertices)).toBeLessThan(TILING_TOLERANCE);
                return;
            }
            // Relative, because these two are eleven orders of magnitude apart and an absolute
            // `toBeCloseTo` would be vacuous on one of them and unsatisfiable on the other.
            expect(worstTilingError(vertices) / pinned).toBeCloseTo(1, 2);
        },
    );

    it('is not vacuous: the sweep reaches every fixture in the corpus', () => {
        // The guard on its own reach. A depth that stopped producing strips, or a roster that lost a
        // fixture, would leave every assertion above passing over nothing.
        const measured = FULL_CORPUS.filter(polygon => !UNMEASURABLE.includes(polygon.name));

        expect(measured).toHaveLength(FULL_CORPUS.length - UNMEASURABLE.length);
        expect(UNMEASURABLE.every(name => FULL_CORPUS.some(polygon => polygon.name === name))).toBe(true);
        // Every unmeasurable fixture is unmeasurable for the stated reason and no other: its solve
        // is incomplete, so `computeMaxOffset` refuses it (enrolled 2026-09-23, decision 151(d)).
        for (const name of UNMEASURABLE) {
            const result = solveSkeleton(FULL_CORPUS.find(polygon => polygon.name === name)!.vertices);
            expect(result.complete).toBe(false);
            expect(() => computeMaxOffset(result)).toThrow(/requires a complete skeleton solve/);
        }

        const result = solveSkeleton(CLEAN_TEST_POLYGONS[0].vertices);
        expect(computeStrips(result, {depth: computeMaxOffset(result) * 0.2}).length).toBeGreaterThan(0);
    });

    it('only the two pinned fixtures miss the bar, which is why it can be this tight', () => {
        // Measured rather than assumed, and asserted as a SET so that a third fixture starting to
        // miss is caught here rather than absorbed into a tolerance. Both survivors are of one kind
        // — seed 15838 and (seed 55433, k=4) miss by 7.36e-13 and 1.78e-12 because a merged event
        // set moved one of their nodes to its medoid. The kind that is GONE is the one worth naming:
        // the dumbbell's strips overlapped by a tenth of its area, a silent wrong answer, and it was
        // fixed rather than re-pinned. See {@link PINNED_TILING_ERRORS}.
        const failing = FULL_CORPUS
            .filter(polygon => !UNMEASURABLE.includes(polygon.name))
            .filter(polygon => worstTilingError(polygon.vertices) >= TILING_TOLERANCE)
            .map(polygon => polygon.name)
            .sort();

        expect(failing).toEqual(Object.keys(PINNED_TILING_ERRORS).sort());
    });
});

/*
 * ============================================================================
 *  THE HOLED ROSTER: THE STRIPS AND THE SIGNED RINGS ACCOUNT FOR THE REGION.
 * ============================================================================
 *
 * Skeleton loop-consumers spec, decisions 14, 18, 35 and 39. On a region with holes the identity is
 * `Σ area(strip) + Σ −signedArea(ring) = area(outline) − Σ area(hole)`: an outer ring is clockwise and adds its area,
 * a ring round a hole is counter-clockwise and takes its own away (`holedTilingError` in
 * `wavefront-measurement-helpers.ts`, the one definition, which the sweep harness's holed path reads too). It is
 * asserted at depth fractions 0.2, 0.5 and 1.0 at the same machine-precision bar as the single loop, 1e-14.
 *
 * DECISION 14 IS THE CONTRACT BUILDING-SHELL READS: `computeStrips(result, {depth: computeMaxOffset(result)})`
 * returns one strip per exterior edge of every loop, strip `i` supported by edge `i`, its frontage on that edge.
 */
const HOLED_FRACTIONS = [0.2, 0.5, 1.0];

describe('the holed roster: the strips and the signed rings account for the region (decisions 14, 35 and 39)', () => {
    const solveHoled = (fixture: typeof HOLED_TEST_POLYGONS[number]) =>
        solveSkeleton(fixture.outline, holedSolveOptions(fixture));

    it.each(HOLED_TEST_POLYGONS.map(fixture => [fixture.name, fixture] as const))(
        '%s tiles to machine precision at depth fractions 0.2, 0.5 and 1.0',
        (_name, fixture) => {
            const result = solveHoled(fixture);
            const maxOffset = computeMaxOffset(result);
            const errors = HOLED_FRACTIONS.map(fraction => holedTilingError(result, maxOffset * fraction));
            expect(errors.filter(error => !(error < TILING_TOLERANCE))).toEqual([]);
        },
    );

    it.each(HOLED_TEST_POLYGONS.map(fixture => [fixture.name, fixture] as const))(
        '%s at full depth: one strip per exterior edge of every loop, strip i on edge i, its frontage on that edge',
        (_name, fixture) => {
            const result = solveHoled(fixture);
            const {graph} = result;
            const strips = computeStrips(result, {depth: computeMaxOffset(result)});
            expect(strips).toHaveLength(graph.numExteriorNodes);
            const extent = Math.max(...fixture.outline.flatMap(v => [Math.abs(v.x), Math.abs(v.y)]), 1);
            const problems: string[] = [];
            strips.forEach((strip, i) => {
                const source = graph.nodes[graph.edges[i].source].position;
                const target = graph.nodes[graph.edges[i].target!].position;
                if (strip.supportingEdgeIds.length !== 1 || strip.supportingEdgeIds[0] !== i) {
                    problems.push(`strip ${i} is supported by [${strip.supportingEdgeIds}]`);
                }
                if (strip.frontage.length !== 2 || strip.frontage[0] !== source || strip.frontage[1] !== target) {
                    problems.push(`strip ${i}'s frontage is not edge ${i}'s own source and target`);
                }
                const middle = {
                    x: (strip.frontage[0].x + strip.frontage[strip.frontage.length - 1].x) / 2,
                    y: (strip.frontage[0].y + strip.frontage[strip.frontage.length - 1].y) / 2,
                };
                if (distanceToSegment(middle, source, target) > 1e-9 * extent) {
                    problems.push(`strip ${i}'s frontage midpoint is off edge ${i}`);
                }
                if (strip.boundary.length < 3) {
                    problems.push(`strip ${i} has no area at full depth`);
                }
            });
            expect(problems).toEqual([]);
        },
    );

    it.each(HOLED_TEST_POLYGONS.map(fixture => [fixture.name, fixture] as const))(
        '%s: no corner joins two loops, and each corner\'s edge lengths and angle are the fixture\'s own',
        (_name, fixture) => {
            // THE RECORDING CLASSIFIER (decision 39). The expected lengths and angles are read off the loop table by
            // loop-local arithmetic — the vertex after local vertex j of a loop is local vertex j + 1 mod count — and
            // not off any edge's target, so they are independent of the code under test.
            const result = solveHoled(fixture);
            const {graph} = result;
            const seen: CornerContext[] = [];
            computeStrips(result, {
                depth: computeMaxOffset(result) * 0.5,
                classifyCorner: context => {
                    seen.push(context);
                    return 'none';
                },
            });
            const position = (node: number) => graph.nodes[node].position;
            const expected = graph.loops.flatMap(({start, count}) => Array.from({length: count}, (_unused, j) => {
                const before = position(start + j);
                const vertex = position(start + (j + 1) % count);
                const after = position(start + (j + 2) % count);
                let angle = Math.atan2(after.y - vertex.y, after.x - vertex.x)
                    - Math.atan2(before.y - vertex.y, before.x - vertex.x);
                while (angle <= 0) {
                    angle += 2 * Math.PI;
                }
                while (angle > 2 * Math.PI) {
                    angle -= 2 * Math.PI;
                }
                return {
                    incoming: start + j,
                    outgoing: start + (j + 1) % count,
                    vertex,
                    previousEdgeLength: Math.hypot(vertex.x - before.x, vertex.y - before.y),
                    nextEdgeLength: Math.hypot(after.x - vertex.x, after.y - vertex.y),
                    interiorAngle: angle,
                };
            }));
            expect(seen).toHaveLength(graph.numExteriorNodes);
            const problems: string[] = [];
            seen.forEach(context => {
                const incoming = context.previousEdgeIds[context.previousEdgeIds.length - 1];
                const outgoing = context.nextEdgeIds[0];
                if (loopOfExteriorEdge(graph, incoming) !== loopOfExteriorEdge(graph, outgoing)) {
                    problems.push(`a corner joins edge ${incoming} to edge ${outgoing}, on two loops`);
                    return;
                }
                const own = expected.find(entry => entry.incoming === incoming);
                if (own === undefined || own.outgoing !== outgoing) {
                    problems.push(`a corner joins edge ${incoming} to edge ${outgoing}, not to its own next edge`);
                    return;
                }
                if (context.vertex !== own.vertex
                    || Math.abs(context.previousEdgeLength - own.previousEdgeLength) > 1e-12 * own.previousEdgeLength
                    || Math.abs(context.nextEdgeLength - own.nextEdgeLength) > 1e-12 * own.nextEdgeLength
                    || Math.abs(context.interiorAngle - own.interiorAngle) > 1e-12) {
                    problems.push(`the corner after edge ${incoming} reads vertex (${context.vertex.x}, ${context.vertex.y}),`
                        + ` lengths ${context.previousEdgeLength} / ${context.nextEdgeLength}, angle ${context.interiorAngle};`
                        + ` the fixture's own are (${own.vertex.x}, ${own.vertex.y}), ${own.previousEdgeLength} /`
                        + ` ${own.nextEdgeLength}, ${own.interiorAngle}`);
                }
            });
            expect(problems).toEqual([]);
        },
    );

    it('reads decision 16\'s worked example on F1: reflex at the hole\'s (7, 6.5), convex at the outline\'s (0, 10)', () => {
        const result = solveHoled(HOLED_F1);
        const angles = new Map<string, number>();
        computeStrips(result, {
            depth: computeMaxOffset(result) * 0.5,
            classifyCorner: context => {
                angles.set(`${context.vertex.x},${context.vertex.y}`, context.interiorAngle);
                return 'none';
            },
        });
        expect(angles.get('7,6.5')).toBeCloseTo(3 * Math.PI / 2, 12);
        expect(angles.get('0,10')).toBeCloseTo(Math.PI / 2, 12);
    });

    it('reads decision 18\'s worked example on F1 at depth 0.5: 22.83 + 81 − 5.83 = 98, and 109.66 summed unsigned', () => {
        // Before the join at 2√2 − 2, the outline's ring has signed area −(10 − 2t)² = −81 and the hole's ring
        // +(√2 + 2t)² ≈ +5.83. The swept bands are 19 + 3.83 = 22.83.
        const result = solveHoled(HOLED_F1);
        const rings = computeOffsetRings(result, 0.5);
        expect(rings).toHaveLength(2);
        expect(netRingArea(rings)).toBeCloseTo(81 - (Math.SQRT2 + 1) ** 2, 12);
        const strips = computeStrips(result, {depth: 0.5}).reduce((total, strip) => total + signedStripArea(strip), 0);
        expect(strips).toBeCloseTo(19 + ((Math.SQRT2 + 1) ** 2 - 2), 12);
        expect(regionArea(result.graph)).toBeCloseTo(98, 12);
        expect(holedTilingError(result, 0.5)).toBeLessThan(TILING_TOLERANCE);
        // Summed as absolute areas the identity misses by twice the hole's ring.
        const unsigned = strips + rings.reduce((total, ring) => total + Math.abs(signedRingArea(ring)), 0);
        expect(unsigned).toBeCloseTo(98 + 2 * (Math.SQRT2 + 1) ** 2, 9);
    });

    it('is not vacuous: the roster is the whole holed roster, outside FULL_CORPUS', () => {
        expect(HOLED_TEST_POLYGONS).toHaveLength(21);
        const corpusNames = new Set(FULL_CORPUS.map(polygon => polygon.name));
        expect(HOLED_TEST_POLYGONS.filter(fixture => corpusNames.has(fixture.name))).toEqual([]);
    });
});
